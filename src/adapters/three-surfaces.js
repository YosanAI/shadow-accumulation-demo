import * as THREE from 'three/webgpu';
import { boundsOf } from '#lab/core/math.js';

/** Snapshot ordinary Three.js meshes into the renderer-independent engine format. */
export function snapshotSurfaces(root) {
  root.updateMatrixWorld(true);
  const receivers = [], casterChunks = [], records = [];
  root.traverseVisible(object => {
    if (!object.isMesh || !(object.userData.receiver || object.userData.caster)) return;
    if (object.isSkinnedMesh || object.isInstancedMesh) throw new Error('This adapter expects static ordinary meshes. Expand skinning/instances before passing them to the engine.');
    const originalGeometry = object.geometry;
    const flat = originalGeometry.index ? originalGeometry.toNonIndexed() : originalGeometry.clone();
    const source = flat.getAttribute('position');
    const positions = new Float32Array(source.count * 3);
    const point = new THREE.Vector3();
    for (let i = 0; i < source.count; i++) {
      point.fromBufferAttribute(source, i).applyMatrix4(object.matrixWorld);
      positions.set([point.x, point.y, point.z], i * 3);
    }
    if (object.userData.caster) casterChunks.push(positions);
    if (object.userData.receiver) {
      object.geometry = flat;
      records.push({ object, originalGeometry, geometry: flat });
      receivers.push({ id: object.uuid, name: object.name, positions });
    } else flat.dispose();
  });
  if (!receivers.length || !casterChunks.length) throw new Error('The demo needs at least one receiver and one shadow caster.');
  const shadowVertices = new Float32Array(casterChunks.reduce((count, data) => count + data.length, 0));
  let cursor = 0;
  for (const chunk of casterChunks) { shadowVertices.set(chunk, cursor); cursor += chunk.length; }
  // Receivers normally cast too. Include them in bounds even if they do not.
  const bounds = boundsOf(shadowVertices);
  for (const surface of receivers) {
    const receiverBounds = boundsOf(surface.positions);
    for (let i = 0; i < 3; i++) { bounds.min[i] = Math.min(bounds.min[i], receiverBounds.min[i]); bounds.max[i] = Math.max(bounds.max[i], receiverBounds.max[i]); }
  }
  return {
    receivers, shadowVertices, bounds, records,
    applyAtlas(atlas) {
      for (const record of records) record.geometry.setAttribute('uv1', new THREE.BufferAttribute(atlas.uvSets.get(record.object.uuid), 2));
    },
    dispose() {
      for (const record of records) {
        if (record.object.geometry === record.geometry) record.object.geometry = record.originalGeometry;
        record.geometry.dispose();
      }
    }
  };
}
