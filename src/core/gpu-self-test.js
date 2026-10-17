import { AccumulationEngine } from '#lab/core/accumulation-engine.js';
/** Small analytic integration test, run on the user's actual GPU; no Three.js. */
export async function runGPUSelfTest(device, signal) {
    const atlas = { size: 2, positions: new Float32Array([
            -0.6, 0, -0.6, 1, 0.6, 0, 0.6, 1, 1.5, 0, 0, 1, -1.5, 0, 0, 1
        ]), normals: new Float32Array([
            0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, -1, 0, 1
        ]), activeIndices: new Uint32Array([0, 1, 2, 3]) };
    const floor = [-2, 0, -2, -2, 0, 2, 2, 0, 2, -2, 0, -2, 2, 0, 2, 2, 0, -2];
    // An overhead canopy only covers the negative-X / negative-Z sample.
    const canopy = [-1, 2, -1, -1, 2, 0, 0, 2, 0, -1, 2, -1, 0, 2, 0, 0, 2, -1];
    const engine = new AccumulationEngine(device);
    const assertClose = (actual, expected, label) => { if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.0001)
        throw new Error(`${label}: expected ${expected}, received ${actual}`); };
    try {
        await engine.initialize({ atlas, shadowVertices: new Float32Array([...floor, ...canopy]), bounds: { min: [-2, 0, -2], max: [2, 2, 2] }, shadowSize: 128, batchSize: 2, biasMeters: 0.002 });
        await engine.run({ count: 2, directionAndEnergy: new Float32Array([0, 1, 0, 1, 0, 1, 0, 0.25]), durations: new Float32Array([1, 0.25]), timestamps: new Float64Array([0, 1000]) }, { signal });
        const values = await engine.readValues();
        assertClose(values[0], 0, 'Occluded energy');
        assertClose(values[1], 1.25, 'Occluded unshaded potential');
        assertClose(values[2], 0, 'Occluded sunlit time');
        assertClose(values[3], 1.25, 'Occluded possible hours');
        assertClose(values[4], 1.25, 'Visible energy and distinct batched uniforms');
        assertClose(values[6], 1.25, 'Visible sunlit hours');
        assertClose(values[9], 0, 'Edge-on surface potential');
        assertClose(values[13], 0, 'Back-facing surface potential');
        const summary = await engine.readSummary();
        assertClose(summary.area, 4, 'Area reduction');
        assertClose(summary.meanEnergy, 0.3125, 'Area-weighted energy mean');
        assertClose(summary.maxEnergy, 1.25, 'Maximum reduction');
        return { passed: true, checks: 11, message: '11 GPU checks passed: shadow visibility, depth orientation, unique sample uniforms, energy, hours, front faces, and reductions.' };
    }
    finally {
        engine.dispose();
    }
}
