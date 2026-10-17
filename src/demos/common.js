import * as THREE from 'three/webgpu';
export function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...options });
}
export function mesh(geometry, surfaceMaterial, { receiver = false, caster = true, name = '' } = {}) {
    const object = new THREE.Mesh(geometry, surfaceMaterial);
    object.name = name;
    object.castShadow = caster;
    object.receiveShadow = true;
    object.userData.receiver = receiver;
    object.userData.caster = caster;
    return object;
}
export function box(parent, dimensions, position, color, options = {}) {
    const object = mesh(new THREE.BoxGeometry(...dimensions), material(color), options);
    object.position.set(...position);
    parent.add(object);
    return object;
}
export function ground(parent, size, receiver = false, color = 0xb4b9b5) {
    const object = mesh(new THREE.PlaneGeometry(size, size), material(color), { receiver, name: 'Ground' });
    object.rotation.x = -Math.PI / 2;
    parent.add(object);
    return object;
}
export function triangleGeometry(vertices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geometry.computeVertexNormals();
    return geometry;
}
export function quad(parent, a, b, c, d, surfaceMaterial, options = {}) {
    const object = mesh(triangleGeometry([a, b, c, a, c, d]), surfaceMaterial, options);
    parent.add(object);
    return object;
}
export function addDragHint(group, radius) {
    const ring = mesh(new THREE.RingGeometry(radius, radius + 0.09, 48), new THREE.MeshBasicMaterial({ color: 0x557c98, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), { caster: false });
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.userData.dragHint = true;
    group.add(ring);
    group.userData.draggable = true;
}
export function tree(parent, position, height = 10, evergreen = false) {
    const group = new THREE.Group();
    group.position.set(...position);
    group.name = evergreen ? 'Draggable conifer' : 'Draggable broadleaf tree';
    const trunk = mesh(new THREE.CylinderGeometry(height * 0.035, height * 0.05, height * 0.7, 8), material(0x735443));
    trunk.position.y = height * 0.35;
    group.add(trunk);
    const canopy = mesh(evergreen ? new THREE.ConeGeometry(height * 0.27, height * 0.8, 12) : new THREE.IcosahedronGeometry(height * 0.32, 1), material(evergreen ? 0x345c44 : 0x577745));
    canopy.position.y = evergreen ? height * 0.62 : height * 0.68;
    canopy.scale.y = evergreen ? 1 : 1.15;
    group.add(canopy);
    addDragHint(group, height * 0.31);
    parent.add(group);
    return group;
}
export function seededRandom(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
export function disposeObject(root) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(object => {
        if (object.geometry)
            geometries.add(object.geometry);
        if (object.material)
            for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
                materials.add(item);
                for (const value of Object.values(item))
                    if (value?.isTexture)
                        textures.add(value);
            }
    });
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
}
