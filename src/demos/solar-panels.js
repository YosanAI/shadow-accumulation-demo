import * as THREE from 'three/webgpu';
import { ground, box, mesh, material, tree, addDragHint } from '#lab/demos/common.js';
function cellTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#193a59';
    context.fillRect(0, 0, 256, 128);
    context.strokeStyle = '#7290a5';
    context.lineWidth = 1;
    for (let x = 0; x <= 256; x += 32) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 128);
        context.stroke();
    }
    for (let y = 0; y <= 128; y += 32) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(256, y);
        context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
export function createSolarPanels() {
    const root = new THREE.Group();
    ground(root, 100, false, 0xc8bd9e);
    const frontMaterial = material(0xffffff, { map: cellTexture(), roughness: 0.5 });
    const rings = [[12, 12, 1.7], [23, 22, 2.4], [35, 32, 3.1]];
    for (let ring = 0; ring < rings.length; ring++) {
        const [radius, count, elevation] = rings[ring];
        for (let i = 0; i < count; i++) {
            const angle = i / count * Math.PI * 2 + ring * 0.12;
            const group = new THREE.Group();
            group.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
            group.rotation.y = angle;
            root.add(group);
            const backing = box(group, [4.4, 2.7, 0.12], [0, elevation, 0], 0xaab3b6, { name: 'Panel back and frame — not a receiver' });
            backing.rotation.x = -Math.PI / 2 + 0.46;
            const front = mesh(new THREE.PlaneGeometry(4.16, 2.46), frontMaterial, { receiver: true, name: `Panel front, ring ${ring + 1}, panel ${i + 1}` });
            front.rotation.copy(backing.rotation);
            front.position.copy(backing.position).add(new THREE.Vector3(0, Math.cos(0.46), Math.sin(0.46)).multiplyScalar(0.075));
            group.add(front);
            for (const x of [-1.4, 1.4])
                box(group, [0.12, elevation, 0.12], [x, elevation / 2, 0], 0x7b8488, { name: 'Panel support' });
        }
    }
    const draggables = [tree(root, [6, 0, 2], 13), tree(root, [-25, 0, -10], 11, true)];
    const block = new THREE.Group();
    block.position.set(-10, 0, 19);
    root.add(block);
    box(block, [5, 8, 4], [0, 4, 0], 0xb0a99b, { name: 'Draggable block' });
    addDragHint(block, 3.7);
    draggables.push(block);
    const cylinder = new THREE.Group();
    cylinder.position.set(24, 0, 11);
    root.add(cylinder);
    const tank = mesh(new THREE.CylinderGeometry(2.1, 2.1, 9, 20), material(0x8facae));
    tank.position.y = 4.5;
    cylinder.add(tank);
    addDragHint(cylinder, 2.7);
    draggables.push(cylinder);
    const wall = new THREE.Group();
    wall.position.set(11, 0, -23);
    wall.rotation.y = 0.35;
    root.add(wall);
    box(wall, [12, 6, 0.65], [0, 3, 0], 0xc5ae99, { name: 'Draggable wall' });
    addDragHint(wall, 4);
    draggables.push(wall);
    const coneGroup = new THREE.Group();
    coneGroup.position.set(-26, 0, 20);
    root.add(coneGroup);
    const cone = mesh(new THREE.ConeGeometry(3, 10, 20), material(0xa3aaa0));
    cone.position.y = 5;
    coneGroup.add(cone);
    addDragHint(coneGroup, 3.4);
    draggables.push(coneGroup);
    return { id: 'panels', root, extent: 100, camera: [82, 74, 100], target: [0, 1, 0], draggables, source: { kind: 'procedural', description: '66 fixed panels • three concentric rings • six draggable obstructions' }, description: 'Only panel front faces receive the heatmap. Ring azimuths vary deliberately; panels do not track the sun.' };
}
