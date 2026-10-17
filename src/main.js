import * as THREE from 'three/webgpu';
import { AccumulationEngine } from '#lab/core/accumulation-engine.js';
import { runGPUSelfTest } from '#lab/core/gpu-self-test.js';
import { createSurfaceAtlas } from '#lab/core/surface-atlas.js';
import { buildSunSamples, validateSolarConfig } from '#lab/core/solar.js';
import { snapshotSurfaces } from '#lab/adapters/three-surfaces.js';
import { HeatmapLayer } from '#lab/adapters/heatmap-layer.js';
import { Viewer } from '#lab/ui/viewer.js';
import { setupFullscreen } from '#lab/ui/fullscreen.js';
import { createManhattan } from '#lab/demos/manhattan.js';
import { createResidential } from '#lab/demos/residential.js';
import { createTerrain } from '#lab/demos/terrain.js';
import { createSolarPanels } from '#lab/demos/solar-panels.js';
const element = id => document.getElementById(id);
const number = id => Number(element(id).value);
const factories = { manhattan: createManhattan, residential: createResidential, terrain: createTerrain, panels: createSolarPanels };
let device, renderer, viewer, demo, engine, snapshot, heatmap;
let webgpuUnavailableReason = '';
let controller = null, running = null, lastStats = null, report = null, resultState = 'empty';
function showError(message) {
    element('fatal-message').textContent = message;
    element('fatal').hidden = false;
}
function fatal(error) {
    console.error(error);
    controller?.abort();
    showError(String(error.message ?? error));
    element('status').textContent = 'Unable to continue. See the error above.';
}
function status(message, progress) {
    element('status').textContent = message;
    if (progress !== undefined)
        element('progress').value = progress;
}
function config() {
    return { latitude: number('latitude'), longitude: number('longitude'), startDate: element('start-date').value, endDate: element('end-date').value, intervalMinutes: number('interval'), dni: number('dni'), atlasSize: number('atlas-size'), shadowSize: number('shadow-size'), batchSize: number('batch-size'), biasMeters: number('bias') };
}
function displayOptions() { return { metric: element('metric').value, normalization: element('normalization').value, absoluteMax: Math.max(0.001, number('absolute-max') || 0.001) }; }
function setBusy(busy) {
    for (const input of document.querySelectorAll('[data-bake-input], [data-scene]'))
        input.disabled = busy;
    element('generate').disabled = busy || !device;
    element('gpu-self-test').disabled = busy || !device;
    element('cancel').disabled = !busy;
    element('clear').disabled = busy || !engine;
    element('export-report').disabled = busy || !report || resultState === 'stale';
    if (viewer)
        viewer.drag.enabled = !busy;
}
function estimate() {
    element('interval-output').textContent = `${number('interval')} min`;
    element('dni-output').textContent = `${number('dni')} W/m²`;
    element('bias-output').textContent = `${number('bias').toFixed(3)} m`;
    try {
        const validated = validateSolarConfig(config());
        const bytes = number('atlas-size') ** 2 * 56 + number('shadow-size') ** 2 * 4;
        element('sample-estimate').textContent = `${validated.days} day${validated.days === 1 ? '' : 's'} · ${validated.totalIntervals.toLocaleString()} intervals before night removal\nApprox. ${(bytes / 1048576).toFixed(0)} MB core GPU storage, plus geometry and renderer${validated.totalIntervals > 10000 ? '\nLarge exact run: try a day or a coarser interval first.' : ''}`;
    }
    catch (error) {
        element('sample-estimate').textContent = error.message;
    }
}
function updateSun() {
    if (!viewer)
        return;
    const minute = number('preview-time');
    const hours = String(Math.floor(minute / 60)).padStart(2, '0'), minutes = String(minute % 60).padStart(2, '0');
    element('preview-time-output').textContent = `${hours}:${minutes} UTC`;
    const date = element('preview-date').value;
    const timestamp = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
    if (!Number.isFinite(timestamp) || !Number.isFinite(number('latitude')) || !Number.isFinite(number('longitude')))
        return;
    const sun = viewer.setSun(timestamp, number('latitude'), number('longitude'));
    element('sun-info').textContent = `Altitude ${(sun.altitude * 180 / Math.PI).toFixed(1)}° · azimuth ${(sun.azimuthNorth * 180 / Math.PI).toFixed(1)}° from north\n${sun.altitude > 0 ? 'Sun above horizon' : 'Sun below horizon'}`;
}
function updateLegend() {
    const { metric, normalization, absoluteMax } = displayOptions();
    const energy = metric === 'energy', unit = energy ? 'kWh/m²' : 'h';
    element('absolute-row').hidden = normalization !== 'absolute';
    element('absolute-unit').textContent = unit;
    let low = '0%', high = '100%';
    if (normalization === 'range') {
        low = `${(lastStats ? (energy ? lastStats.minEnergy : lastStats.minHours) : 0).toFixed(2)} ${unit}`;
        high = `${(lastStats ? (energy ? lastStats.maxEnergy : lastStats.maxHours) : 0).toFixed(2)} ${unit}`;
    }
    if (normalization === 'absolute') {
        low = `0 ${unit}`;
        high = `${absoluteMax} ${unit}`;
    }
    element('legend-low').textContent = low;
    element('legend-high').textContent = high;
    element('scale-explanation').textContent = normalization === 'access'
        ? `Received / unshaded ${energy ? 'direct energy' : 'front-facing sun time'} at the same orientation. Gray means no solar potential. This isolates obstruction losses, not orientation quality.`
        : normalization === 'range' ? 'Min–max normalization over this scene’s receiving surfaces. Use the same absolute ceiling when comparing different scenes or dates.'
            : `Fixed physical scale in ${unit}; values above the red ceiling clip to red. No dataset normalization.`;
    if (lastStats) {
        const mean = energy ? lastStats.meanEnergy : lastStats.meanHours;
        const maximum = energy ? lastStats.maxEnergy : lastStats.maxHours;
        const possible = energy ? lastStats.meanPossibleEnergy : lastStats.meanPossibleHours;
        const ratio = possible > 1e-8 ? `${(mean / possible * 100).toFixed(1)}%` : 'not defined';
        element('statistics').textContent = `${resultState === 'partial' ? 'PARTIAL RESULT\n' : ''}Area-weighted mean: ${mean.toFixed(3)} ${unit}\nMaximum: ${maximum.toFixed(3)} ${unit}\nReceived / potential (area totals): ${ratio}\nReceiver area: ${lastStats.area.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²${lastStats.batchGpuMs !== null ? `\nLast GPU batch: ${lastStats.batchGpuMs.toFixed(2)} ms` : ''}`;
    }
}
function clearResult() {
    heatmap?.dispose();
    heatmap = null;
    snapshot?.dispose();
    snapshot = null;
    engine?.dispose();
    engine = null;
    lastStats = null;
    report = null;
    resultState = 'empty';
    element('statistics').textContent = device ? 'Generate to see area-weighted results.' : 'WebGPU support is required to compute accumulation.';
    element('show-heatmap').disabled = true;
    element('export-report').disabled = true;
    element('clear').disabled = true;
    updateLegend();
}
function invalidate(reason = 'Parameters changed. Generate again to update the heatmap.') {
    if (running)
        return;
    if (engine) {
        resultState = 'stale';
        heatmap?.setVisible(false);
        element('show-heatmap').disabled = true;
        element('export-report').disabled = true;
        element('statistics').textContent = 'Previous result is stale and hidden.';
        status(reason);
    }
}
function switchScene(id) {
    if (running)
        return;
    clearResult();
    demo = factories[id]();
    viewer.setDemo(demo);
    for (const button of document.querySelectorAll('[data-scene]'))
        button.setAttribute('aria-pressed', String(button.dataset.scene === id));
    const minAtlasSize = demo.minAtlasSize ?? 512;
    for (const option of element('atlas-size').options)
        option.disabled = Number(option.value) < minAtlasSize;
    if (number('atlas-size') < minAtlasSize)
        element('atlas-size').value = String(minAtlasSize);
    updateSun();
    estimate();
    setBusy(false);
    status(device ? 'Ready. Set a period, then generate accumulation.' : 'Scene preview ready. WebGPU is required to generate accumulation.', 0);
}
async function generate() {
    if (running)
        return;
    if (!device) {
        status('WebGPU support is required to generate accumulation. You can still explore the scenes.');
        return;
    }
    try {
        validateSolarConfig(config());
    }
    catch (error) {
        status(error.message);
        return;
    }
    clearResult();
    controller = new AbortController();
    const signal = controller.signal, settings = config();
    const task = async () => {
        setBusy(true);
        status('Preparing astronomical sun samples…', 0);
        try {
            const samples = await buildSunSamples(settings, { signal, onProgress: value => status('Preparing astronomical sun samples…', value * 0.04) });
            snapshot = snapshotSurfaces(demo.root);
            const atlas = await createSurfaceAtlas(snapshot.receivers, settings.atlasSize, { signal, onProgress: value => status('Packing and rasterizing the surface-space atlas…', 0.04 + value * 0.06) });
            if (signal.aborted)
                throw new DOMException('Cancelled', 'AbortError');
            snapshot.applyAtlas(atlas);
            engine = new AccumulationEngine(device);
            status('Compiling WebGPU pipelines…', 0.10);
            await engine.initialize({ atlas, shadowVertices: snapshot.shadowVertices, bounds: snapshot.bounds, shadowSize: settings.shadowSize, batchSize: settings.batchSize, biasMeters: settings.biasMeters });
            if (signal.aborted)
                throw new DOMException('Cancelled', 'AbortError');
            engine.updateDisplay(displayOptions());
            heatmap = new HeatmapLayer(engine, snapshot.records);
            heatmap.setOpacity(number('heat-opacity'));
            resultState = 'partial';
            report = { app: 'WebGPU Shadow Accumulation Lab', threeVersion: THREE.REVISION, createdAt: new Date().toISOString(), scene: demo.id, source: demo.source, configuration: settings, timeConvention: 'Inclusive UTC dates; midpoint quadrature; sun center above 0 degrees', model: 'Constant DNI × max(geometric normal · sun direction, 0) × opaque binary visibility × dt. No diffuse, weather, reflection, transmission, or electrical conversion.', atlas: { size: atlas.size, triangles: atlas.triangleCount, interiorTexels: atlas.interiorTexels, activeTexels: atlas.activeIndices.length, worldTexelsPerMetre: atlas.density }, calendarIntervals: samples.totalIntervals, daylightSamples: samples.count, daylightHours: samples.daylightHours, complete: false };
            const result = await engine.run(samples, { signal,
                onProgress: ({ done, total, elapsedSeconds, timestamp }) => status(`${done.toLocaleString()} / ${total.toLocaleString()} sun samples · ${elapsedSeconds.toFixed(1)} s elapsed\n${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`, 0.10 + 0.90 * (total ? done / total : 1)),
                onPreview: stats => { lastStats = stats; element('show-heatmap').disabled = false; heatmap.setVisible(element('show-heatmap').checked); updateLegend(); }
            });
            resultState = 'complete';
            report.complete = true;
            report.run = result;
            report.statistics = lastStats;
            status(samples.count ? `Complete · ${samples.count.toLocaleString()} daylight samples · ${result.elapsedSeconds.toFixed(1)} s\nThe heatmap is independent of the preview sun.` : 'Complete: no above-horizon sun samples in this period. Relative potential is undefined (gray).', 1);
            updateLegend();
        }
        catch (error) {
            if (error.name === 'AbortError') {
                if (engine?.completedSamples > 0) {
                    engine.updateDisplay(displayOptions());
                    lastStats = await engine.readSummary();
                    resultState = 'partial';
                    report.complete = false;
                    report.completedSamples = engine.completedSamples;
                    report.statistics = lastStats;
                    element('show-heatmap').disabled = false;
                    heatmap?.setVisible(element('show-heatmap').checked);
                    status(`Cancelled after ${engine.completedSamples.toLocaleString()} samples. The displayed result is partial.`);
                    updateLegend();
                }
                else {
                    clearResult();
                    status('Cancelled before any accumulation was completed.', 0);
                }
            }
            else {
                console.error(error);
                status(`Generation failed: ${error.message}`);
                if (!engine?.completedSamples)
                    clearResult();
            }
        }
        finally {
            controller = null;
            setBusy(false);
        }
    };
    running = task();
    await running;
    running = null;
    setBusy(false);
}
function exportReport() {
    if (!report)
        return;
    const value = { ...report, resultState, display: displayOptions(), statistics: lastStats };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `shadow-report-${demo.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function wireUI() {
    setupFullscreen(element('view-region'), element('fullscreen-toggle'));
    element('generate').addEventListener('click', generate);
    element('gpu-self-test').addEventListener('click', async () => {
        if (running || !device)
            return;
        controller = new AbortController();
        setBusy(true);
        element('gpu-test-result').textContent = 'Running the analytic test on this GPU…';
        const task = runGPUSelfTest(device, controller.signal);
        running = task;
        try {
            const result = await task;
            element('gpu-test-result').textContent = result.message;
        }
        catch (error) {
            element('gpu-test-result').textContent = `GPU test failed: ${error.message}`;
            console.error(error);
        }
        finally {
            running = null;
            controller = null;
            setBusy(false);
        }
    });
    element('cancel').addEventListener('click', () => { controller?.abort(); status('Cancelling after the current GPU batch…'); });
    element('clear').addEventListener('click', () => { if (!running) {
        clearResult();
        status('Result cleared.', 0);
    } });
    element('export-report').addEventListener('click', exportReport);
    for (const button of document.querySelectorAll('[data-scene]'))
        button.addEventListener('click', () => { try {
            switchScene(button.dataset.scene);
        }
        catch (error) {
            status(error.message);
        } });
    for (const input of document.querySelectorAll('input[data-bake-input],select[data-bake-input]'))
        input.addEventListener('input', () => { estimate(); updateSun(); invalidate(); });
    for (const id of ['metric', 'normalization', 'absolute-max'])
        element(id).addEventListener('input', () => { engine?.updateDisplay(displayOptions()); updateLegend(); });
    element('show-heatmap').addEventListener('change', () => { if (resultState !== 'stale')
        heatmap?.setVisible(element('show-heatmap').checked); });
    element('heat-opacity').addEventListener('input', () => { const value = number('heat-opacity'); element('opacity-output').textContent = `${Math.round(value * 100)}%`; heatmap?.setOpacity(value); });
    for (const id of ['preview-date', 'preview-time'])
        element(id).addEventListener('input', updateSun);
    element('reset-camera').addEventListener('click', () => viewer.resetCamera());
    element('look-north').addEventListener('click', () => viewer.lookNorth());
    for (const button of document.querySelectorAll('[data-period]'))
        button.addEventListener('click', () => {
            const start = element('start-date').value || '2026-06-21';
            const date = new Date(`${start}T00:00:00Z`);
            const year = date.getUTCFullYear();
            if (button.dataset.period === 'day')
                element('end-date').value = start;
            if (button.dataset.period === 'month') {
                element('start-date').value = new Date(Date.UTC(year, date.getUTCMonth(), 1)).toISOString().slice(0, 10);
                element('end-date').value = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
            }
            if (button.dataset.period === 'year') {
                element('start-date').value = `${year}-01-01`;
                element('end-date').value = `${year}-12-31`;
            }
            estimate();
            invalidate();
        });
}
async function initialize() {
    wireUI();
    estimate();
    updateLegend();
    try {
        if (!globalThis.isSecureContext)
            throw new Error('WebGPU requires HTTPS or localhost on this device. An HTTP connection to another computer does not qualify.');
        if (!navigator.gpu)
            throw new Error('WebGPU is not exposed in this browser. Use a browser with WebGPU support.');
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter)
            throw new Error('No WebGPU adapter was available. Check hardware acceleration, drivers, and browser GPU support.');
        const optional = ['timestamp-query', 'core-features-and-limits'].filter(feature => adapter.features.has(feature));
        device = await adapter.requestDevice({ requiredFeatures: optional });
    }
    catch (error) {
        webgpuUnavailableReason = String(error.message ?? error);
    }
    // Resolve the millimeter-separated site surfaces even from the city overview.
    // Ordinary perspective depth loses that separation at these camera distances.
    renderer = new THREE.WebGPURenderer({ ...(device ? { device } : { forceWebGL: true }), antialias: true, alpha: false, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.7;
    await renderer.init();
    if (!renderer.backend.isWebGPUBackend) {
        // The heatmap uses ExternalTexture and must share the renderer's GPUDevice.
        // If Three.js fell back during initialization, keep this a scene preview.
        device?.destroy();
        device = null;
        webgpuUnavailableReason ||= 'The WebGPU renderer could not initialize.';
        showError(`WebGPU support is required for accumulation calculations and the GPU self-test. You can still explore the scenes using WebGL.\n\n${webgpuUnavailableReason}`);
        element('gpu-test-result').textContent = 'The GPU self-test requires WebGPU support.';
    }
    renderer.onError = information => fatal(new Error(information.message ?? 'WebGPU validation error'));
    device?.lost.then(information => {
        if (information.reason !== 'destroyed') {
            device = null;
            setBusy(Boolean(running));
            fatal(new Error(`GPU device lost: ${information.message}`));
        }
    });
    element('canvas-host').append(renderer.domElement);
    viewer = new Viewer(renderer, element('canvas-host'), () => invalidate('An obstruction moved. The old bake is hidden; generate again.'), fatal);
    element('gpu-badge').textContent = device
        ? `WebGPU · Three r${THREE.REVISION}${device.features.has('timestamp-query') ? ' · GPU timers' : ''}`
        : `WebGL 2 · scene preview only · Three r${THREE.REVISION}`;
    switchScene('manhattan');
}
initialize().catch(fatal);
