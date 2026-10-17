import * as THREE from 'three/webgpu';
/** Ground-plane dragging with pointer capture; never modifies receiver geometry. */
export class DragController {
    constructor(canvas, camera, controls, onChanged) {
        this.canvas = canvas;
        this.camera = camera;
        this.controls = controls;
        this.onChanged = onChanged;
        this.objects = [];
        this.enabled = true;
        this.active = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.hit = new THREE.Vector3();
        this.offset = new THREE.Vector3();
        canvas.addEventListener('pointerdown', event => this.down(event), true);
        canvas.addEventListener('pointermove', event => this.move(event), true);
        canvas.addEventListener('pointerup', event => this.up(event), true);
        canvas.addEventListener('pointercancel', event => this.up(event), true);
        canvas.addEventListener('lostpointercapture', () => this.finish());
    }
    setObjects(objects, extent, center = [0, 0, 0]) { this.finish(); this.objects = objects; this.extent = extent; this.center = center; }
    ray(event) {
        const rectangle = this.canvas.getBoundingClientRect();
        this.pointer.set((event.clientX - rectangle.left) / rectangle.width * 2 - 1, -(event.clientY - rectangle.top) / rectangle.height * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
    }
    pick(event) {
        this.ray(event);
        const hit = this.raycaster.intersectObjects(this.objects, true).find(value => !value.object.userData.dragHint);
        if (!hit)
            return null;
        let object = hit.object;
        while (object && !this.objects.includes(object))
            object = object.parent;
        return object;
    }
    down(event) {
        if (!this.enabled || event.button !== 0)
            return;
        const object = this.pick(event);
        if (!object || !this.raycaster.ray.intersectPlane(this.plane, this.hit))
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.active = object;
        this.pointerId = event.pointerId;
        this.moved = false;
        this.offset.copy(object.position).sub(this.hit);
        this.controls.enabled = false;
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.style.cursor = 'grabbing';
    }
    move(event) {
        if (!this.enabled)
            return;
        if (!this.active) {
            this.canvas.style.cursor = this.pick(event) ? 'grab' : '';
            return;
        }
        if (event.pointerId !== this.pointerId)
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.ray(event);
        if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
            this.hit.add(this.offset);
            const half = this.extent * 0.47;
            this.active.position.x = THREE.MathUtils.clamp(this.hit.x, this.center[0] - half, this.center[0] + half);
            this.active.position.z = THREE.MathUtils.clamp(this.hit.z, this.center[2] - half, this.center[2] + half);
            if (!this.moved) {
                this.moved = true;
                this.onChanged();
            }
        }
    }
    up(event) {
        if (!this.active || event.pointerId !== this.pointerId)
            return;
        event.stopImmediatePropagation();
        if (this.canvas.hasPointerCapture(event.pointerId))
            this.canvas.releasePointerCapture(event.pointerId);
        this.finish();
    }
    finish() { this.active = null; this.controls.enabled = true; this.canvas.style.cursor = ''; }
}
