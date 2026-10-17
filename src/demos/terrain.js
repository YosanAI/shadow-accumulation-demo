import * as THREE from 'three/webgpu';
import { mesh, material } from '#lab/demos/common.js';
function heightAt(x, z) {
    const peak = (cx, cz, amplitude, width) => amplitude * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));
    let height = 4 + peak(-45, -30, 65, 29) + peak(30, -38, 48, 26) + peak(8, 37, 51, 31) + peak(68, 26, 25, 21);
    height += 5 * Math.sin(x * 0.083 + Math.sin(z * 0.04)) * Math.cos(z * 0.095);
    height += 2.2 * Math.sin(x * 0.21 + z * 0.14) + 0.9 * Math.sin(z * 0.43 - x * 0.32);
    return Math.max(0.3, height);
}
export function createTerrain() {
    const root = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(210, 210, 40, 40);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color(0x9bab78), high = new THREE.Color(0xb0a597);
    for (let i = 0; i < positions.count; i++) {
        const height = heightAt(positions.getX(i), positions.getZ(i));
        positions.setY(i, height);
        const color = low.clone().lerp(high, Math.min(1, height / 58));
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    root.add(mesh(geometry, material(0xffffff, { vertexColors: true }), { receiver: true, name: 'Self-shadowing mountain terrain' }));
    return { id: 'terrain', root, extent: 210, camera: [185, 160, 215], target: [0, 18, 0], draggables: [], source: { kind: 'procedural', description: 'Synthetic 40 × 40-cell mountain heightfield • geometric normals used for integration' }, description: 'All of the terrain surface receives the heatmap, including its self-shadowed valleys.' };
}
