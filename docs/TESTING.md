# Verification record and target-device checklist

## SunCalc package integration

Solar positions now use the pinned `suncalc@1.9.0` npm package; the vendor
directory was removed. A comparison against the previous implementation across
1,280 positions found maximum differences below 8e-12 radians in altitude and
6e-11 radians in azimuth. A clean `npm ci`, all 24 tests (including the full-year
minute schedule), the Vite build, and the CDN HTML packager passed.

Headless Chromium exercised preview-sun changes in development, the CDN HTML,
and the production bundle. The CDN edition fetched the pinned SunCalc ES module
and matched the upstream position reference; the production bundle rendered
with every subrequest blocked. Chromium's native certificate store rejected the
cloud proxy certificate, so CDN resources were fetched through a TLS-verifying
Python HTTPS client for that browser check. Certificate verification stayed
enabled. These checks exercise the solar adapter and WebGL preview, not WebGPU
accumulation.

## Scene controls and fullscreen

All 24 Node tests passed, including fullscreen entry, button exit, browser exit
events, unsupported browsers, and recovery after a rejected request. The Vite
and standalone CDN HTML builds passed.

Headless Chromium with SwiftShader rendered all four scenes in WebGL preview
on port 3000. Keyboard scene selection, the centered switcher, 44-pixel controls,
absence of the removed overlays and data controls, native fullscreen entry and
exit, and renderer resizing were checked. Layouts at 1360, 390, and 320 pixels
wide had no horizontal overflow or page errors. The production preview also ran
on port 3000 and passed the 320-pixel fullscreen/resizing check. The application
made no external requests while selecting the bundled scenes.

Headless Escape did not trigger Chromium's browser exit action, so external
fullscreen exit was exercised with the browser API instead. Interactive Escape
remains in the manual checklist below. These UI checks use WebGL preview and do
not expand the WebGPU validation described below.

## Ground surface depth precision

The renderer uses logarithmic depth to distinguish the closely spaced ground,
driveway, road and sidewalk layers at overview distances. The model geometry and
accumulation coordinates are unchanged. Headless Chromium with SwiftShader
rendered all four scenes in WebGL preview mode, including repeated scene changes,
zoom and orbit, without page errors. Manhattan and residential ground layers
were inspected before and after the change.

A rendered depth check placed a red sheet above a blue sheet at representative
scene scales (210 m with a 31 mm gap; 1600 m with a 15 mm gap), using the viewer's
46° field of view and 0.1–30000 m clipping range. In a central 576-pixel patch,
ordinary perspective depth leaked 140 and 576 blue pixels respectively;
logarithmic depth leaked none in either case. All 21 CPU tests, the Vite build,
and the CDN packager passed. The raw WebGPU analytic self-test passed all 11
checks on the software adapter; this is not a hardware performance measurement.
Full WebGPU scene-switch validation remains blocked on this adapter by a
`createBuffer` allocation failure for a 288-byte mapped buffer. The same failure
was reproduced with logarithmic depth disabled, so the WebGL rendering checks
above do not establish complete WebGPU scene validation.

## Compass geometry lifetime regression

The current suite passes 19 tests, including three scene-resource regressions.
Before the fix, scene replacement disposed Three.js's internal sprite/arrow
geometry, and replacement labels reused a destroyed vertex buffer. The regression
uses the pinned renderer's actual attribute cache with simulated GPU buffers; it
does not need a WebGPU-capable machine. It also verifies that repeated scene
changes release each old guide resource once without disposing live resources.
Compass helpers now own their geometry copies. Vite and CDN builds passed.

## WebGL preview fallback verification

Headless Chrome rendered all four scenes with WebGPU unavailable. The WebGL 2
badge, visible error with its icon on the left, and disabled Generate / GPU
self-test controls were checked after scene switches. The extended interaction
check stopped before verifying preview-sun and camera controls.

Isolated startup checks cover insecure contexts, a missing WebGPU API, a null
adapter, rejected adapter/device requests, renderer fallback, and successful
WebGPU device selection. They verify that preview mode never starts calculations
and that WebGPU mode passes its device to the renderer. These checks do not
execute WebGPU shaders. The 16 CPU tests, Vite build, and CDN packager passed.

## Executed in the creation environment

`npm test` / `node --test tests/*.test.js`: **16/16 passed**.

The suite checks the upstream SunCalc solar-position reference, east/up/south
conversion and compass azimuth, inclusive UTC ranges, a 525,600-interval year,
a 527,040-interval leap year, input validation, midday sampling, night removal,
partial final-interval duration, polar night, cancellation during preparation,
orthographic WebGPU clip coordinates, near/far ordering, receiver-plane depth
correction, UV atlas non-overlap, finite padded positions, area preservation,
vertical façade receivers, degenerate geometry, and all three normalization modes.
The full-year test actually prepares the minute-resolution solar schedule; it
does not execute a GPU annual integration.

All application JavaScript modules and the CDN packager passed `node --check`.
`node scripts/build-cdn-html.mjs` generated the attached single HTML successfully.

## Not executed here

The environment restricts browser navigation and external downloads. Therefore:

- No Three.js/WebGPU scene has been rendered end to end here.
- The WGSL pipelines have not been compiled/executed on a GPU here.
- No GPU performance measurement or annual bake benchmark is reported.
- `npm install` / the Vite offline bundling path was not executed.

CPU test success is not a claim that GPU drivers, shader compilation, current
external endpoints, or the complete browser application have been validated.

## Included GPU self-test

In the main application, expand **Resolution & engine settings** and press
**Run GPU self-test**. The test uses the same GPUDevice and raw engine with four
analytic points, a floor, an asymmetric overhead canopy, and two unequal-weight
samples in one batch. It checks 11 assertions covering occlusion versus
potential, visible energy/time, front-facing rules, distinct dynamic uniform
slices, and reduction min/max/area statistics. A failure is displayed rather
than hidden. It does not change the visible scene.

The same test is available without Three.js or CDN dependencies:

```bash
python3 -m http.server 3000
```

Stop any development or preview server on port 3000 before starting this
standalone server. Open `http://localhost:3000/tests/gpu-smoke.html`. This route needs a supported
WebGPU browser and secure origin, but no npm installation or internet. The engine
self-test does not validate the Three.js ExternalTexture material or sky path.

## Manual browser acceptance tests

1. Confirm the backend badge says WebGPU. Run the GPU self-test and inspect the
   browser console for shader/validation errors.
   With WebGPU unavailable (including a missing API, a null adapter, or a failed
   device request), confirm the badge says WebGL 2 and all four scenes render.
   The error box must retain its icon on the left and explain that calculations
   require WebGPU. Generate and GPU self-test must stay disabled after scene
   changes; camera controls, preview sun, and dragging must still work.
2. Generate a one-day Manhattan heatmap. Orbit around a building; roof and wall
   colors must remain attached to their surfaces and independent of the camera.
3. Change the preview time toward sunrise/sunset. Sky/sun/live shadows should
   change; an unlit accumulated heatmap at opacity 100% must not change.
4. Switch the metric and the three normalization modes without another bake.
   Absolute legend units must change correctly. No-potential relative texels
   should be gray, not NaN colors.
5. In residential mode, verify only roof slopes colorize. Move a ringed tree;
   stale results must hide. Regenerate and compare the affected roof shadow.
6. In terrain mode, inspect the valley shading and test progressively larger
   atlas/shadow resolutions. Self-shadowing must not depend on the view camera.
7. In panel mode, verify only the front planes colorize. Rotate the view beneath
   panels; backs and frames must retain their ordinary materials. Drag each type
   of obstruction and regenerate.
8. Start a one-minute annual request and cancel it. Progress should stop after
   the current bounded batch, not after an unbounded queue drains. A remaining
   partial result and exported report must clearly say it is incomplete.
9. Try polar night, equatorial latitudes, a leap-year range, and a final partial
   interval (7 minutes over a day). Check that units and counts remain sensible.
10. Verify that the bundled Midtown model stays visible after startup without an
    NYC data request. The former Manhattan data/download/import section and the
    viewport's top and bottom information overlays should be absent. Confirm that
    source metadata remains in the exported report and `THIRD_PARTY_NOTICES.md`
    retains the data attribution.
11. At desktop and phone widths, confirm that the scene switcher is centered,
    its selected scene is clear, all four buttons work with a keyboard, and the
    page has no horizontal overflow. Use the top-left viewport button to enter
    fullscreen, then exit with the button and with Escape. Repeat entry and exit;
    the canvas should fill the viewport, keep its correct aspect ratio, and retain
    working camera controls and compass. Check the button's accessible name and
    state after each transition, including a rejected or unsupported fullscreen
    request. The controls should remain usable in a narrow mobile layout.

Compare 60-, 15-, 5-, and 1-minute runs and independently increase shadow/atlas
resolutions. Thin-obstruction errors are often spatial, not temporal. Check
convergence before interpreting the numerical report as a physical resource
estimate; the constant-DNI model and registered-area caveats still apply.

## Static UI layout check

An earlier version of the HTML/CSS was rendered with application scripts disabled at 1360 × 900 and
390 × 844. Both layouts had no horizontal page overflow; all four scene tabs and
five configuration sections were present, including the subsequently removed
Manhattan data section. This checks that earlier layout only: the viewport was
intentionally empty and is not evidence of Three.js or WebGPU execution. Use the
manual checklist above to validate the current switcher and fullscreen layout.

The supplied HTML's Blob/import-map loader was also exercised using its embedded
solar module only: it returned a finite solar position and unit direction. All
local import references were present. This did not load Three.js or run WebGPU.
