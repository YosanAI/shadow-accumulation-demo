/** Small, allocation-conscious math helpers. No rendering-library dependency. */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = a => Math.hypot(...a);
export function normalize(a) {
  const magnitude = length(a);
  if (magnitude < 1e-12) throw new Error('Cannot normalize a zero-length vector.');
  return a.map(value => value / magnitude);
}
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}
export function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], positions[i + axis]);
      max[axis] = Math.max(max[axis], positions[i + axis]);
    }
  }
  if (!Number.isFinite(min[0])) throw new Error('The scene has no shadow geometry.');
  return { min, max };
}
export function boundsCorners({ min, max }) {
  return Array.from({ length: 8 }, (_, mask) => [0, 1, 2].map(axis => (mask & (1 << axis)) ? max[axis] : min[axis]));
}
export function transformPoint(matrix, point) {
  return [0, 1, 2].map(row => matrix[row] * point[0] + matrix[row + 4] * point[1] + matrix[row + 8] * point[2] + matrix[row + 12]);
}

/**
 * Fit an orthographic light camera to ALL casters and receivers.
 * The result is a column-major WebGPU matrix: XY in [-1, 1], depth in [0, 1].
 * sunDirection points FROM a surface TOWARD the sun, never the ray direction.
 * Keeping this function here avoids accessing Three.js's internal shadow state.
 */
export function makeLightFrame(bounds, sunDirection, padding = 0.1) {
  const sun = normalize(sunDirection);
  const right = normalize(cross(Math.abs(sun[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0], sun));
  const up = cross(sun, right);
  const coordinates = boundsCorners(bounds).map(point => [dot(point, right), dot(point, up), dot(point, sun)]);
  const min = [0, 1, 2].map(axis => Math.min(...coordinates.map(point => point[axis])) - padding);
  const max = [0, 1, 2].map(axis => Math.max(...coordinates.map(point => point[axis])) + padding);
  const span = max.map((value, axis) => Math.max(value - min[axis], 0.01));
  const matrix = new Float32Array(16);
  for (let axis = 0; axis < 3; axis++) {
    matrix[axis * 4] = 2 * right[axis] / span[0];
    matrix[axis * 4 + 1] = 2 * up[axis] / span[1];
    matrix[axis * 4 + 2] = -sun[axis] / span[2];
  }
  matrix[12] = -(max[0] + min[0]) / span[0];
  matrix[13] = -(max[1] + min[1]) / span[1];
  matrix[14] = max[2] / span[2];
  matrix[15] = 1;
  return { matrix, right, up, sun, width: span[0], height: span[1], depth: span[2] };
}

/** CPU reference for the three display modes; the compute shader uses the same rule. */
export function normalizeExposure(received, possible, mode, minimum, maximum, absoluteMax) {
  if (mode === 'access') return possible > 1e-8 ? clamp(received / possible, 0, 1) : null;
  if (mode === 'range') return maximum - minimum > 1e-8 ? clamp((received - minimum) / (maximum - minimum), 0, 1) : (maximum > 1e-8 ? 1 : 0);
  return clamp(received / Math.max(absoluteMax, 1e-8), 0, 1);
}
