import * as THREE from 'three/webgpu';
import { texture, uv, uniform, mix, color, colorSpaceToWorking } from 'three/tsl';

/** The only GPU→Three.js integration: a public ExternalTexture on the same device. */
export class HeatmapLayer {
  constructor(engine, records) {
    this.opacity = uniform(0.94);
    this.texture = new THREE.ExternalTexture(engine.outputTexture);
    this.texture.image = { width: engine.atlas.size, height: engine.atlas.size };
    // The external storage texture is rgba8unorm (not an sRGB hardware view).
    // Decode its sRGB palette explicitly in TSL; metadata alone cannot change
    // the format of a GPUTexture that the accumulator already created.
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.flipY = false; // Atlas UV origin and storage-texture rows both start at the top.
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    const heat = colorSpaceToWorking(texture(this.texture, uv(1)), THREE.SRGBColorSpace).rgb;
    this.records = records.map(({ object }) => {
      const original = object.material;
      const sourceMaterial = Array.isArray(original) ? original[0] : original;
      const heatMaterial = new THREE.MeshBasicNodeMaterial({ side: sourceMaterial.side, toneMapped: false });
      heatMaterial.colorNode = mix(color(sourceMaterial.color ?? new THREE.Color(0xb9bec1)), heat, this.opacity);
      heatMaterial.name = 'Unlit accumulated heatmap — independent of preview sun';
      return { object, original, heatMaterial };
    });
    this.visible = false;
  }
  setVisible(visible) {
    this.visible = visible;
    for (const record of this.records) record.object.material = visible ? record.heatMaterial : record.original;
  }
  setOpacity(value) { this.opacity.value = value; }
  dispose() {
    this.setVisible(false);
    for (const record of this.records) record.heatMaterial.dispose();
    this.texture.dispose();
  }
}
