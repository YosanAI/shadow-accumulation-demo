import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import DataMap from 'three/src/renderers/common/DataMap.js';
import WebGPUAttributeUtils from 'three/src/renderers/webgpu/utils/WebGPUAttributeUtils.js';
import { Viewer } from '#lab/ui/viewer.js';
import { disposeObject } from '#lab/demos/common.js';

// Exercise scene replacement without a DOM or GPU driver. Only compass label
// creation needs a canvas; text rasterization is irrelevant to resource ownership.
function withCanvas(run) {
    const previous = globalThis.document;
    globalThis.document = { createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({ strokeText() {}, fillText() {} })
    }) };
    try { return run(); }
    finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
}
function viewerFixture() {
    return {
        scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
        controls: { target: new THREE.Vector3(), update() {} },
        drag: { setObjects() {} },
        sunLight: { shadow: { camera: new THREE.OrthographicCamera() } },
        setDemo: Viewer.prototype.setDemo
    };
}
function demo() {
    return { id: 'manhattan', root: new THREE.Group(), extent: 210,
        target: [0, 0, 0], camera: [185, 160, 215], draggables: [] };
}
function resources(root) {
    const values = new Set();
    root.traverse(object => {
        if (object.geometry) values.add(object.geometry);
        if (object.material) {
            values.add(object.material);
            if (object.material.map) values.add(object.material.map);
        }
    });
    return values;
}

test('Replacing a scene leaves Three.js shared sprite and arrow geometry intact', () => withCanvas(() => {
    const externalSprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const externalArrow = new THREE.ArrowHelper();
    let sharedDisposals = 0;
    const sharedGeometries = [externalSprite.geometry, externalArrow.line.geometry, externalArrow.cone.geometry];
    const onDispose = () => sharedDisposals++;
    for (const geometry of sharedGeometries) geometry.addEventListener('dispose', onDispose);
    const viewer = viewerFixture();
    try {
        viewer.setDemo(demo());
        viewer.setDemo(demo()); // Same path as the automatic NYC scene replacement.
        assert.equal(sharedDisposals, 0, 'Scene cleanup must not dispose Three.js singleton geometry');
    } finally {
        disposeObject(viewer.guides);
        for (const geometry of sharedGeometries) geometry.removeEventListener('dispose', onDispose);
        externalSprite.material.dispose();
        externalArrow.line.material.dispose();
        externalArrow.cone.material.dispose();
    }
}));

test('Replacement compass labels never reuse a destroyed WebGPU vertex buffer', () => withCanvas(() => {
    const backend = new DataMap();
    backend.device = { createBuffer({ size }) {
        const data = new ArrayBuffer(size);
        return { destroyed: false, getMappedRange: () => data, unmap() {}, destroy() { this.destroyed = true; } };
    } };
    // Use the pinned renderer's actual interleaved-buffer cache. Buffer storage
    // is simulated so this lifetime regression can also run on a WebGL-only PC.
    const attributes = new WebGPUAttributeUtils(backend);
    const viewer = viewerFixture();
    viewer.setDemo(demo());
    const oldLabel = viewer.guides.children.find(object => object.isSprite);
    const oldPosition = oldLabel.geometry.getAttribute('position');
    attributes.createAttribute(oldPosition, 32); // GPUBufferUsage.VERTEX
    const oldBuffer = backend.get(oldPosition.data).buffer;
    oldLabel.geometry.addEventListener('dispose', () => attributes.destroyAttribute(oldPosition));
    viewer.setDemo(demo());
    assert.equal(oldBuffer.destroyed, true, 'Removed label buffers must still be released');
    viewer.guides.traverse(object => {
        if (!object.isSprite) return;
        const position = object.geometry.getAttribute('position');
        attributes.createAttribute(position, 32);
        assert.equal(backend.get(position.data).buffer.destroyed, false,
            'A replacement label would submit a destroyed vertex buffer');
    });
    disposeObject(viewer.guides);
}));

test('Repeated scene changes release old guides once without releasing the new guides', () => withCanvas(() => {
    const viewer = viewerFixture();
    viewer.setDemo(demo());
    for (let i = 0; i < 5; i++) {
        const oldResources = resources(viewer.guides);
        const disposals = new Map();
        for (const resource of oldResources) {
            resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
        }
        viewer.setDemo(demo());
        const liveResources = resources(viewer.guides);
        for (const resource of oldResources) {
            assert.equal(disposals.get(resource), 1);
            assert.equal(liveResources.has(resource), false, 'Live guides must not reuse disposed resources');
        }
    }
    disposeObject(viewer.guides);
}));
