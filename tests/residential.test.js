import test from 'node:test';
import assert from 'node:assert/strict';
import { createResidential } from '#lab/demos/residential.js';
import { disposeObject } from '#lab/demos/common.js';
import { snapshotSurfaces } from '#lab/adapters/three-surfaces.js';
import { createSurfaceAtlas } from '#lab/core/surface-atlas.js';

test('Imported residential model supports roof-only heatmaps and draggable tree shadows', async () => {
    const demo = createResidential();
    let snapshot;
    try {
        assert.equal(demo.root.getObjectByName('Buildings').children.length, 18);
        assert.equal(demo.draggables.length, 24);
        for (const tree of demo.draggables) {
            assert.equal(tree.userData.draggable, true);
            assert.equal(tree.getObjectByName('solid-canopy').userData.caster, true);
            assert.equal(tree.getObjectByName('solid-canopy').userData.receiver, false);
        }
        demo.root.getObjectByName('Site').traverse(object => {
            if (!object.isMesh) return;
            assert.equal(object.userData.receiver, false);
            assert.equal(object.userData.caster, false);
        });

        snapshot = snapshotSurfaces(demo.root);
        assert.equal(snapshot.receivers.length, 18);
        assert.ok(snapshot.shadowVertices.every(Number.isFinite));
        let roofArea = 0;
        for (const { object } of snapshot.records) {
            assert.equal(object.userData.role, 'roof');
            roofArea += object.userData.area;
        }
        // Exercise the same atlas/UV path as Generate with the default resolution.
        const atlas = await createSurfaceAtlas(snapshot.receivers, 512);
        assert.equal(atlas.triangleCount, 689);
        assert.ok(Math.abs(atlas.totalArea - roofArea) < 0.001);
        assert.ok(atlas.interiorTexels > 0);
        assert.ok(atlas.charts.every(chart => chart.normal[1] > 0));
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
