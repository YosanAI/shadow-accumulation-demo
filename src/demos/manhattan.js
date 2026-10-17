import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh } from '#lab/demos/common.js';
import { createManhattanModel } from '#lab/demos/manhattan-model.js';
import { MANHATTAN_DISTRICT, MANHATTAN_SURVEY } from '#lab/demos/manhattan-data.js';
/** Match the supplied viewer's material batching without changing its geometry. */
function batchModel(model) {
    const groups = new Map();
    model.updateMatrixWorld(true);
    model.traverseVisible(object => {
        if (!object.isMesh) return;
        // Buried bottom faces stay in the model, outside the receiving surfaces.
        const receiver = object.userData.surfaceType !== 'base';
        const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${receiver}`;
        if (!groups.has(key)) groups.set(key, { material: object.material, caster: object.castShadow, receiveShadow: object.receiveShadow, receiver, pieces: [], vertexCount: 0 });
        const group = groups.get(key);
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        group.pieces.push(geometry);
        group.vertexCount += geometry.getAttribute('position').count;
    });
    const batches = new THREE.Group();
    batches.name = 'Midtown material batches';
    for (const group of groups.values()) {
        const positions = new Float32Array(group.vertexCount * 3);
        const normals = new Float32Array(group.vertexCount * 3);
        let offset = 0;
        for (const piece of group.pieces) {
            positions.set(piece.getAttribute('position').array, offset);
            normals.set(piece.getAttribute('normal').array, offset);
            offset += piece.getAttribute('position').array.length;
            piece.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const batch = mesh(geometry, group.material, { receiver: group.receiver, caster: group.caster, name: group.material.name });
        batch.receiveShadow = group.receiveShadow;
        batches.add(batch);
    }
    return batches;
}
function technicalEdges(model) {
    const pieces = [];
    model.traverseVisible(object => {
        if (!object.isMesh || ['base', 'road_marking', 'vegetation'].includes(object.userData.surfaceType)) return;
        const geometry = new THREE.EdgesGeometry(object.geometry, 28);
        if (geometry.getAttribute('position').count) {
            geometry.applyMatrix4(object.matrixWorld);
            pieces.push(geometry);
        } else geometry.dispose();
    });
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    const edges = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 3423295, transparent: true, opacity: 0.29, depthWrite: false }));
    edges.name = 'Architectural edges';
    edges.renderOrder = 2;
    return edges;
}
export function createManhattan() {
    const model = createManhattanModel(MANHATTAN_DISTRICT, MANHATTAN_SURVEY);
    const root = new THREE.Group();
    root.name = model.name;
    root.userData = model.userData;
    root.add(batchModel(model), technicalEdges(model));
    // Batches own their geometry and reuse the source materials.
    model.traverse(object => object.geometry?.dispose());
    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z);
    const target = [center.x, size.y * 0.24, center.z];
    return {
        id: 'manhattan', root, extent, minAtlasSize: 2048,
        camera: [center.x - extent * 0.8, target[1] + extent * 1.2, center.z + extent * 1.6],
        target, draggables: [],
        source: {
            kind: 'bundled-nyc', description: 'Supplied Midtown model • 573 buildings • 527 historical survey meshes • 35 tax blocks',
            file: 'manhattan-block-viewer.html', origin: root.userData.origin,
            sources: root.userData.sources, retrievedAt: root.userData.retrievedAt,
            survey: root.userData.survey, limitations: root.userData.limitations,
            statistics: root.userData.statistics
        },
        description: 'Midtown from the Empire State Building to Times Square, including Bryant Park. Heatmap on roofs, façades, streets and sidewalks. Historical survey details and published-height extrusions share flat ground.'
    };
}
