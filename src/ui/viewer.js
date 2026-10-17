import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { sunAt } from '#lab/core/solar.js';
import { disposeObject } from '#lab/demos/common.js';
import { DragController } from '#lab/ui/drag-controller.js';
function label(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.font = 'bold 76px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 8;
    context.strokeStyle = 'white';
    context.strokeText(text, 64, 66);
    context.fillStyle = '#182328';
    context.fillText(text, 64, 66);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, toneMapped: false }));
}
export class Viewer {
    constructor(renderer, host, onChanged, onError) {
        this.renderer = renderer;
        this.host = host;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 30000);
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI * 0.48;
        this.controls.minDistance = 3;
        this.scene.add(new THREE.HemisphereLight(0xc3dcff, 0x77715c, 1.8));
        this.ambient = new THREE.AmbientLight(0xffffff, 0.22);
        this.scene.add(this.ambient);
        this.sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(1024, 1024);
        this.sunLight.shadow.normalBias = 0.03;
        this.scene.add(this.sunLight, this.sunLight.target);
        this.sky = new SkyMesh();
        this.sky.scale.setScalar(20000);
        this.sky.turbidity.value = 2.8;
        this.sky.rayleigh.value = 1.8;
        this.sky.mieCoefficient.value = 0.006;
        this.sky.mieDirectionalG.value = 0.8;
        if (this.sky.cloudCoverage)
            this.sky.cloudCoverage.value = 0;
        if (this.sky.cloudDensity)
            this.sky.cloudDensity.value = 0;
        this.scene.add(this.sky);
        this.drag = new DragController(renderer.domElement, this.camera, this.controls, onChanged);
        this.direction = new THREE.Vector3();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        renderer.setAnimationLoop(() => {
            try {
                this.controls.update();
                renderer.render(this.scene, this.camera);
                this.camera.getWorldDirection(this.direction);
                const heading = Math.atan2(this.direction.x, -this.direction.z) * 180 / Math.PI;
                document.getElementById('compass-rose').style.transform = `rotate(${-heading}deg)`;
                document.getElementById('heading').textContent = `${Math.round((heading + 360) % 360)}°`;
            }
            catch (error) {
                renderer.setAnimationLoop(null);
                onError(error);
            }
        });
        this.resize();
    }
    resize() {
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (!width || !height)
            return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }
    setDemo(demo) {
        if (this.demo) {
            this.scene.remove(this.demo.root);
            disposeObject(this.demo.root);
        }
        if (this.guides) {
            this.scene.remove(this.guides);
            disposeObject(this.guides);
        }
        this.demo = demo;
        this.scene.add(demo.root);
        this.camera.position.set(...demo.camera);
        this.controls.target.set(...demo.target);
        this.controls.update();
        this.controls.maxDistance = demo.extent * 4;
        this.drag.setObjects(demo.draggables, demo.extent, demo.target);
        const shadowCamera = this.sunLight.shadow.camera;
        const half = demo.extent * 0.85;
        Object.assign(shadowCamera, { left: -half, right: half, top: half, bottom: -half, near: 0.1, far: demo.extent * 5 });
        shadowCamera.updateProjectionMatrix();
        this.guides = new THREE.Group();
        const grid = new THREE.GridHelper(demo.extent, 20, 0x9cabb2, 0xb6bdbd);
        grid.material.transparent = true;
        grid.material.opacity = 0.27;
        grid.position.set(demo.target[0], 0.06, demo.target[2]);
        if (demo.id !== 'terrain')
            this.guides.add(grid);
        for (const [text, x, z] of [['N', 0, -0.47], ['E', 0.47, 0], ['S', 0, 0.47], ['W', -0.47, 0]]) {
            const sprite = label(text);
            sprite.position.set(demo.target[0] + x * demo.extent, 2, demo.target[2] + z * demo.extent);
            sprite.scale.setScalar(demo.extent * 0.037);
            this.guides.add(sprite);
        }
        const corner = new THREE.Vector3(demo.target[0] - demo.extent * 0.38, 0.15, demo.target[2] + demo.extent * 0.38);
        this.guides.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), corner, demo.extent * 0.12, 0x354651, demo.extent * 0.025, demo.extent * 0.014));
        this.guides.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), corner, demo.extent * 0.12, 0x354651, demo.extent * 0.025, demo.extent * 0.014));
        this.scene.add(this.guides);
    }
    setSun(timestamp, latitude, longitude) {
        const sun = sunAt(timestamp, latitude, longitude);
        const direction = new THREE.Vector3(...sun.direction);
        this.sky.sunPosition.value.copy(direction).multiplyScalar(450000);
        const target = this.demo ? new THREE.Vector3(this.demo.target[0], 0, this.demo.target[2]) : new THREE.Vector3();
        this.sunLight.target.position.copy(target);
        this.sunLight.position.copy(direction).multiplyScalar((this.demo?.extent ?? 500) * 2).add(target);
        this.sunLight.intensity = sun.altitude > 0 ? 3.2 * Math.min(1, Math.sin(sun.altitude) * 4) : 0;
        this.sunLight.color.setHSL(0.09, Math.max(0, 0.55 - sun.altitude), 0.96);
        return sun;
    }
    resetCamera() { this.camera.position.set(...this.demo.camera); this.controls.target.set(...this.demo.target); this.controls.update(); }
    lookNorth() {
        const distance = this.camera.position.distanceTo(this.controls.target);
        this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, distance * 0.6, distance * 0.8));
        this.controls.update();
    }
}
