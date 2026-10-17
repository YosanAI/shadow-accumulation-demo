import * as THREE from 'three/webgpu';
import { ground, box, quad, material, mesh, triangleGeometry, tree } from '#lab/demos/common.js';
function house(parent, x, z, rotation, wallColor, roofColor) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    parent.add(group);
    box(group, [10, 5.7, 8], [0, 2.85, 0], wallColor, { name: 'House walls — not a heatmap receiver' });
    const roofMaterial = material(roofColor, { side: THREE.DoubleSide });
    quad(group, [-5.8, 5.8, -4.8], [-5.8, 5.8, 4.8], [0, 9, 4.8], [0, 9, -4.8], roofMaterial, { receiver: true, name: 'West roof slope' });
    quad(group, [0, 9, -4.8], [0, 9, 4.8], [5.8, 5.8, 4.8], [5.8, 5.8, -4.8], roofMaterial, { receiver: true, name: 'East roof slope' });
    const gables = mesh(triangleGeometry([[-5, 5.7, -4], [0, 8.5, -4], [5, 5.7, -4], [5, 5.7, 4], [0, 8.5, 4], [-5, 5.7, 4]]), material(wallColor, { side: THREE.DoubleSide }));
    group.add(gables);
    box(group, [1.25, 3.4, 1.4], [2.4, 8.7, -1.7], 0x875644, { name: 'Chimney' });
    box(group, [1.55, 0.2, 1.65], [2.4, 10.5, -1.7], 0x44494a, { name: 'Chimney cap' });
    const hvac = box(group, [1.9, 1.35, 1.3], [-2.5, 7.7, 1.2], 0x849194, { name: 'Roof equipment' });
    hvac.rotation.z = Math.atan(3.2 / 5.8);
    const vent = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 10), material(0x8f989b));
    vent.position.set(1.0, 8.8, 2.4);
    group.add(vent);
    // Simple doors and windows, all outside the roof-only receiver selection.
    box(group, [1.6, 2.5, 0.12], [-2, 1.25, 4.05], 0x625647, { caster: false });
    for (const windowX of [-3.1, 0.2, 3.1])
        box(group, [1.45, 1.4, 0.12], [windowX, 3.5, 4.07], 0x80a5b8, { caster: false });
}
export function createResidential() {
    const root = new THREE.Group();
    ground(root, 105, false, 0xb6c29b);
    // Two oblique roads, rather than an axis-aligned street grid.
    const road = box(root, [108, 0.06, 6.5], [0, 0.01, 0], 0x70777a, { caster: false });
    road.rotation.y = 0.20;
    const lane = box(root, [0.15, 0.01, 100], [13, 0.06, 0], 0xe7dfc0, { caster: false });
    lane.rotation.y = Math.PI / 2 + 0.20;
    const road2 = box(root, [6, 0.06, 91], [-13, 0.015, 1], 0x737a7c, { caster: false });
    road2.rotation.y = -0.38;
    house(root, -30, -20, -0.30, 0xe1d4bb, 0x80675b);
    house(root, -5, -25, 0.38, 0xd0dbd6, 0x727e85);
    house(root, 25, -20, -0.57, 0xe2d2c2, 0x886550);
    house(root, -30, 20, 0.27, 0xdddbc8, 0x787677);
    house(root, 1, 25, -0.23, 0xcfd6df, 0x757e8b);
    house(root, 29, 17, 0.65, 0xe0ccbd, 0x855f4b);
    const trees = [[-21, -14, 13], [8, -18, 12], [33, -8, 15], [-36, 7, 12], [-5, 15, 14], [18, 26, 16], [39, 31, 10], [-34, -33, 14]].map(([x, z, height], index) => tree(root, [x, 0, z], height, index % 3 === 0));
    return { id: 'residential', root, extent: 105, camera: [87, 77, 105], target: [0, 2, 0], draggables: trees, source: { kind: 'procedural', description: 'Synthetic neighbourhood • six differently oriented houses • opaque test tree canopies' }, description: 'Only roof slopes receive the heatmap. Drag a subtly ringed tree, then regenerate to test its shadow.' };
}
