import { subtract, cross, length, normalize, dot, clamp, nextFrame, throwIfAborted } from '#lab/core/math.js';

/**
 * Minimal non-overlapping per-triangle UV atlas, measured in world metres.
 * Input: [{ id, positions: Float32Array }], non-indexed world-space triangles.
 * Output: padded position/normal maps, active texel IDs, and UVs for each input.
 * This is intentionally not a sophisticated production UV unwrapper. It keeps
 * the all-surface bake inspectable, needs no model UVs, and works on façades.
 */
export async function createSurfaceAtlas(surfaces, size = 512, { signal, onProgress = () => {} } = {}) {
  if (![256, 512, 1024, 2048].includes(size)) throw new Error('Unsupported atlas size.');
  const charts = [], uvSets = new Map();
  let totalArea = 0;
  for (const surface of surfaces) {
    if (surface.positions.length % 9) throw new Error(`Surface ${surface.id} is not a triangle list.`);
    const uvs = new Float32Array(surface.positions.length / 3 * 2);
    uvSets.set(surface.id, uvs);
    for (let offset = 0; offset < surface.positions.length; offset += 9) {
      const vertices = [0, 1, 2].map(vertex => Array.from(surface.positions.subarray(offset + vertex * 3, offset + vertex * 3 + 3)));
      const faceCross = cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0]));
      const area = length(faceCross) / 2;
      if (area < 1e-9) continue;
      // The longest edge is the chart baseline. Its third vertex projects inside
      // the baseline, which avoids oversized charts for obtuse triangles.
      const edges = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
      const order = edges.reduce((best, edge) => length(subtract(vertices[edge[1]], vertices[edge[0]])) > length(subtract(vertices[best[1]], vertices[best[0]])) ? edge : best);
      const [a, b, c] = order.map(index => vertices[index]);
      const width = length(subtract(b, a));
      const height = 2 * area / width;
      const thirdX = dot(subtract(c, a), normalize(subtract(b, a)));
      charts.push({ surfaceId: surface.id, vertexOffset: offset / 3, vertices, order, width, height, thirdX, area, normal: normalize(faceCross) });
      totalArea += area;
    }
  }
  if (!charts.length) throw new Error('No non-degenerate receiving surfaces.');

  let density = Math.sqrt(size * size * 0.38 / totalArea), packed = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const chart of charts) {
      chart.spanX = Math.max(1, Math.ceil(chart.width * density));
      chart.spanY = Math.max(1, Math.ceil(chart.height * density));
      chart.tileWidth = chart.spanX + 3; // one padding texel on each side + endpoint
      chart.tileHeight = chart.spanY + 3;
    }
    const sorted = [...charts].sort((a, b) => b.tileHeight - a.tileHeight || b.tileWidth - a.tileWidth);
    let x = 0, y = 0, rowHeight = 0;
    packed = true;
    for (const chart of sorted) {
      if (x + chart.tileWidth > size) { x = 0; y += rowHeight; rowHeight = 0; }
      if (chart.tileWidth > size || y + chart.tileHeight > size) { packed = false; break; }
      chart.x = x; chart.y = y;
      x += chart.tileWidth;
      rowHeight = Math.max(rowHeight, chart.tileHeight);
    }
    if (packed) break;
    density *= 0.88;
  }
  if (!packed) throw new Error(`The ${charts.length.toLocaleString()} triangle charts do not fit ${size}². Increase the atlas resolution.`);

  const positions = new Float32Array(size * size * 4);
  const normals = new Float32Array(size * size * 4);
  const active = [];
  let interiorTexels = 0;
  for (let chartIndex = 0; chartIndex < charts.length; chartIndex++) {
    const chart = charts[chartIndex];
    const { x, y, spanX, spanY, vertices, order, normal, area } = chart;
    const originX = x + 1.5, originY = y + 1.5;
    const uvs = uvSets.get(chart.surfaceId);
    const flatCoordinates = [[0, 0], [chart.width, 0], [chart.thirdX, chart.height]];
    for (let i = 0; i < 3; i++) {
      const vertex = chart.vertexOffset + order[i];
      uvs[vertex * 2] = (originX + flatCoordinates[i][0] / chart.width * spanX) / size;
      uvs[vertex * 2 + 1] = (originY + flatCoordinates[i][1] / chart.height * spanY) / size;
    }
    const coreIndices = [];
    for (let row = 0; row < chart.tileHeight; row++) {
      for (let column = 0; column < chart.tileWidth; column++) {
        const localX = (x + column + 0.5 - originX) / spanX * chart.width;
        const localY = (y + row + 0.5 - originY) / spanY * chart.height;
        const thirdWeight = localY / chart.height;
        const secondWeight = (localX - thirdWeight * chart.thirdX) / chart.width;
        const firstWeight = 1 - thirdWeight - secondWeight;
        const texel = (y + row) * size + x + column;
        const inside = Math.min(firstWeight, secondWeight, thirdWeight) >= -1e-5;
        // Extend edge values into the chart's unused rectangle and gutter. Every
        // bilinear filter tap then belongs to this triangle, not a neighbour.
        const weights = [firstWeight, secondWeight, thirdWeight].map(value => clamp(value, 0, 1));
        const weightSum = weights.reduce((sum, value) => sum + value, 0);
        for (let axis = 0; axis < 3; axis++) {
          positions[texel * 4 + axis] = weights.reduce((sum, weight, vertex) => sum + vertices[order[vertex]][axis] * weight / weightSum, 0);
          normals[texel * 4 + axis] = normal[axis];
        }
        positions[texel * 4 + 3] = 1;
        active.push(texel);
        if (inside) coreIndices.push(texel);
      }
    }
    // Chart endpoints guarantee at least three core samples, even on thin faces.
    // Area weights exclude ALL gutter samples from numerical statistics.
    for (const texel of coreIndices) normals[texel * 4 + 3] = area / coreIndices.length;
    interiorTexels += coreIndices.length;
    if ((chartIndex & 127) === 0) {
      throwIfAborted(signal);
      onProgress(chartIndex / charts.length);
      await nextFrame();
    }
  }
  onProgress(1);
  return { size, positions, normals, activeIndices: new Uint32Array(active), uvSets, totalArea, interiorTexels, triangleCount: charts.length, density, charts };
}
