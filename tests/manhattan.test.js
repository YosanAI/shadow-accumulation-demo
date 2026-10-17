import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createManhattan } from '#lab/demos/manhattan.js';
import { disposeObject } from '#lab/demos/common.js';
import { snapshotSurfaces } from '#lab/adapters/three-surfaces.js';
import { createSurfaceAtlas } from '#lab/core/surface-atlas.js';

test('Bundled Midtown retains the supplied geometry and supports an all-surface heatmap', async () => {
    const demo = createManhattan();
    let snapshot;
    try {
        assert.equal(demo.source.kind, 'bundled-nyc');
        assert.equal(demo.source.statistics.buildings, 573);
        assert.equal(demo.source.statistics.surveyBuildings, 527);
        assert.equal(demo.source.statistics.footprintExtrusions, 46);
        assert.equal(demo.source.statistics.taxBlocks, 35);
        const batches = demo.root.children[0].children;
        assert.ok(batches.length < 30, 'Detailed geometry must not require thousands of draw calls');
        assert.equal(batches.reduce((n, mesh) => n + mesh.geometry.attributes.position.count / 3, 0), 160346);
        const bounds = new THREE.Box3().setFromObject(demo.root);
        for (const [end, expected] of [['min', demo.source.statistics.boundsMeters.min], ['max', demo.source.statistics.boundsMeters.max]]) {
            bounds[end].toArray().forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 0.001));
        }

        snapshot = snapshotSurfaces(demo.root);
        assert.equal(snapshot.shadowVertices.length / 9, 74497);
        assert.ok(snapshot.shadowVertices.every(Number.isFinite));
        // The dense survey exceeds the chart capacity of the old 512/1024 atlases.
        const atlas = await createSurfaceAtlas(snapshot.receivers, demo.minAtlasSize);
        assert.equal(atlas.triangleCount, 134881);
        assert.ok(atlas.interiorTexels > 0);
        assert.ok(atlas.charts.some(chart => chart.normal[1] > 0.99), 'Horizontal ground and roofs receive heatmaps');
        assert.ok(atlas.charts.some(chart => Math.abs(chart.normal[1]) < 0.01), 'Vertical façades receive heatmaps');
        assert.ok(atlas.charts.every(chart => chart.normal.every(Number.isFinite)));
        snapshot.applyAtlas(atlas);
        for (const { geometry } of snapshot.records) {
            const uvs = geometry.getAttribute('uv1');
            assert.equal(uvs.count, geometry.getAttribute('position').count);
            assert.ok(uvs.array.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
        }
    } finally {
        snapshot?.dispose();
        disposeObject(demo.root);
    }
});
