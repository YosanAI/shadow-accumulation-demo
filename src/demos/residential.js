import * as THREE from 'three/webgpu';
import { addDragHint } from '#lab/demos/common.js';
import { createResidentialArea } from '#lab/demos/residential-model.js';

export function createResidential() {
    const root = createResidentialArea();
    const trees = root.getObjectByName('NaturalObstructions').children;
    for (const tree of trees) addDragHint(tree, tree.userData.crownRadius);
    root.traverse(object => {
        if (!object.isMesh) return;
        object.userData.receiver = object.userData.role === 'roof';
        object.userData.caster = object.castShadow;
    });
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z);
    return {
        id: 'residential', root, extent,
        camera: [center.x + extent * 0.54, extent * 1.16, center.z + extent * 1.07],
        target: [center.x, 2, center.z], draggables: trees,
        source: { kind: 'procedural', description: 'Residential model from residential-area.html • 18 houses • 24 opaque tree canopies' },
        description: 'Only roof slopes receive the heatmap. Drag a subtly ringed tree, then regenerate to test its shadow.'
    };
}
