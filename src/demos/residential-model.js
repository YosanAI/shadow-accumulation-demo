// Model construction adapted from the supplied residential-area.html.
// The standalone renderer, lighting, camera, and page UI are excluded.
import * as THREE from "three/webgpu";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { BUILDING_TYPES, ROOF_LAYOUTS, RESIDENTIAL_LAYOUT } from "#lab/demos/residential-data.js";
function createLayout() {
  return structuredClone(RESIDENTIAL_LAYOUT);
}
function createMaterials() {
  const n = (e, t, i = 0.94) => {
    const r = new THREE.MeshStandardMaterial({ color: t, roughness: i, metalness: 0 });
    return r.name = e, r;
  };
  return { walls: n("Warm off-white wall massing", 15000024), wallsCool: n("Cool off-white wall massing", 14738660), roofs: [n("Slate grey roof", 9608097), n("Graphite roof", 8490388), n("Pale zinc roof", 10660523), n("Warm grey roof", 10000271)], fascia: n("Eave and rake fascia", 12238008), soffit: n("Roof underside", 13750730), chimney: n("Chimney masonry", 13683132), metal: n("Roof equipment metal", 10857131, 0.74), darkMetal: n("Vent openings and chimney caps", 5857896, 0.8), flashing: n("Roof flashing", 8226184, 0.73), trunk: n("Natural obstruction trunk", 8748396), foliage: n("Natural obstruction foliage", 8886404), ground: n("Site surface", 15264226), road: n("Street surface", 11712180), curb: n("Concrete street edging", 14211539), drive: n("Driveway surface", 13882832), edges: new THREE.LineBasicMaterial({ name: "CAD feature lines", color: 3752779, transparent: true, opacity: 0.48 }), subtleEdges: new THREE.LineBasicMaterial({ name: "Subtle wall edges", color: 7370615, transparent: true, opacity: 0.32 }) };
}
function signedArea(n) {
  return n.reduce((e, t, i) => {
    const r = n[(i + 1) % n.length];
    return e + t[0] * r[1] - r[0] * t[1];
  }, 0) * 0.5;
}
function distanceToBoundary(n, e, t) {
  let i = 1 / 0;
  for (let r = 0; r < t.length; r++) {
    const s = t[r], a = t[(r + 1) % t.length], o = a[0] - s[0], c = a[1] - s[1], l = Math.max(0, Math.min(1, ((n - s[0]) * o + (e - s[1]) * c) / (o * o + c * c)));
    i = Math.min(i, Math.hypot(n - s[0] - o * l, e - s[1] - c * l));
  }
  return i;
}
function seededRandom(n) {
  let e = typeof n == "number" ? n >>> 0 : hashString(String(n));
  return () => {
    e += 1831565813;
    let t = e;
    return t = Math.imul(t ^ t >>> 15, t | 1), t ^= t + Math.imul(t ^ t >>> 7, t | 61), ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashString(n) {
  let e = 2166136261;
  for (let t = 0; t < n.length; t++) e = Math.imul(e ^ n.charCodeAt(t), 16777619);
  return e >>> 0;
}
function triangleGeometry(n, { flip: e = false } = {}) {
  const t = [], i = [];
  for (const s of n) {
    const a = e ? [s[0], s[2], s[1]] : s;
    for (const o of a) t.push(...o), i.push(o[0], o[2]);
  }
  const r = new THREE.BufferGeometry();
  return r.setAttribute("position", new THREE.Float32BufferAttribute(t, 3)), r.setAttribute("uv", new THREE.Float32BufferAttribute(i, 2)), r.computeVertexNormals(), r.computeBoundingBox(), r.computeBoundingSphere(), r;
}
function triangulatePolygon3D(n) {
  const e = n.map((r) => new THREE.Vector2(r[0], r[2])), t = THREE.ShapeUtils.triangulateShape(e, []), i = [];
  for (const r of t) {
    const s = r.map((o) => n[o]), a = new THREE.Vector3().subVectors(new THREE.Vector3(...s[1]), new THREE.Vector3(...s[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...s[2]), new THREE.Vector3(...s[0])));
    a.lengthSq() < 1e-15 || (a.y < 0 && ([s[1], s[2]] = [s[2], s[1]]), i.push(s));
  }
  return i;
}
function polygonGeometry(n, e = 0, t = false) {
  return triangleGeometry(triangulatePolygon3D(n.map(([i, r]) => [i, e, r])), { flip: t });
}
function extrudeFootprint(n, e, t = 0) {
  const i = [];
  for (let s = 0; s < n.length; s++) {
    const [a, o] = n[s], [c, l] = n[(s + 1) % n.length], u = [a, t, o], f = [c, t, l], d = [c, e, l], p = [a, e, o];
    i.push([u, p, f], [f, p, d]);
  }
  i.push(...triangulatePolygon3D(n.map(([s, a]) => [s, e, a])));
  const r = triangulatePolygon3D(n.map(([s, a]) => [s, t, a]));
  return i.push(...r.map((s) => [s[0], s[2], s[1]])), triangleGeometry(i);
}
function lineGeometry(n) {
  const e = new THREE.BufferGeometry();
  return e.setAttribute("position", new THREE.Float32BufferAttribute(n.flat(2), 3)), e.computeBoundingSphere(), e;
}
function createMesh(n, e, t, i) {
  const r = new THREE.Mesh(e, t);
  return r.name = n, r.castShadow = true, r.receiveShadow = true, i && (r.userData.role = i), r;
}
function addBox(n, e, t, i, r, s = "roof-obstruction") {
  const a = createMesh(e, new THREE.BoxGeometry(...t), r, s);
  return a.position.set(...i), n.add(a), a;
}
function triangleArea(n) {
  const e = new THREE.Vector3(...n[0]), t = new THREE.Vector3(...n[1]), i = new THREE.Vector3(...n[2]);
  return t.sub(e).cross(i.sub(e)).length() * 0.5;
}
function createRoof(n, { pitch: e, wallHeight: t, materials: i, roofMaterial: r, includeEdges: s = true, thickness: a = 0.16 }) {
  const o = Math.tan(THREE.MathUtils.degToRad(e)), c = t - n.overhang * o + a, l = n.nodes.map(([D, E, M]) => [D, c + E * o, M]), u = [], f = [], d = [], p = /* @__PURE__ */ new Map();
  for (let D = 0; D < n.faces.length; D++) {
    const E = n.faces[D], M = E.map((H) => l[H]), C = triangulatePolygon3D(M), F = new THREE.Vector3().subVectors(new THREE.Vector3(...C[0][1]), new THREE.Vector3(...C[0][0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...C[0][2]), new THREE.Vector3(...C[0][0]))).normalize(), B = C.reduce((H, V) => H + triangleArea(V), 0);
    d.push({ id: D, vertices: M, normal: F.toArray(), area: B, sourceEdge: n.faceSourceEdges[D] }), u.push(...C), f.push(...C.map(() => D));
    const W = signedArea(M.map((H) => [H[0], H[2]])) > 0 ? [...E].reverse() : [...E];
    for (let H = 0; H < W.length; H++) {
      const V = W[H], Z = W[(H + 1) % W.length], k = V < Z ? `${V}:${Z}` : `${Z}:${V}`, ne = p.get(k);
      ne ? ne.count++ : p.set(k, { a: V, b: Z, count: 1 });
    }
  }
  const g = createMesh("RoofSurfaces", triangleGeometry(u), r, "roof");
  g.userData = { role: "roof", coordinateSpace: "building-local", pitchDegrees: e, area: u.reduce((D, E) => D + triangleArea(E), 0), faceIdByTriangle: f, faces: d };
  const _ = u.map((D) => D.map(([E, M, C]) => [E, M - a, C])), m = createMesh("RoofUnderside", triangleGeometry(_, { flip: true }), i.soffit, "roof-underside"), h = [], T = [];
  for (const D of p.values()) {
    const E = l[D.a], M = l[D.b];
    if (!(new THREE.Vector3(...E).distanceToSquared(new THREE.Vector3(...M)) < 1e-12) && (T.push([[E[0], E[1] + 0.012, E[2]], [M[0], M[1] + 0.012, M[2]]]), D.count === 1)) {
      const C = [E[0], E[1] - a, E[2]], F = [M[0], M[1] - a, M[2]];
      h.push([E, C, M], [M, C, F]);
    }
  }
  const y = createMesh("EaveAndRakeFascia", triangleGeometry(h), i.fascia, "fascia"), v = new THREE.Group();
  if (v.name = "Roof", v.add(g, m, y), s) {
    const D = new THREE.LineSegments(lineGeometry(T), i.edges);
    D.name = "RidgesValleysAndEaves", D.userData.role = "cad-edges", v.add(D);
  }
  function A(D, E) {
    for (let M = 0; M < u.length; M++) {
      const [C, F, B] = u[M], W = (F[2] - B[2]) * (C[0] - B[0]) + (B[0] - F[0]) * (C[2] - B[2]), H = ((F[2] - B[2]) * (D - B[0]) + (B[0] - F[0]) * (E - B[2])) / W, V = ((B[2] - C[2]) * (D - B[0]) + (C[0] - B[0]) * (E - B[2])) / W, Z = 1 - H - V;
      if (H >= -1e-7 && V >= -1e-7 && Z >= -1e-7) {
        const k = f[M];
        return { height: H * C[1] + V * F[1] + Z * B[1], normal: d[k].normal, faceId: k };
      }
    }
    return null;
  }
  const w = [];
  for (const D of n.gableFaces) {
    const E = n.footprint[D.sourceEdge], M = n.footprint[(D.sourceEdge + 1) % n.footprint.length], C = new THREE.Vector2(...E), F = new THREE.Vector2(...M), B = C.distanceTo(F), W = F.clone().sub(C).normalize(), H = new THREE.Vector2(-W.y, W.x).multiplyScalar(1e-4), V = D.nodes.map((oe) => l[oe]).sort((oe, we) => we[1] - oe[1])[0], ne = [0, THREE.MathUtils.clamp(new THREE.Vector2(V[0] - C.x, V[2] - C.y).dot(W) / B, 0, 1), 1].filter((oe, we, Ve) => we === 0 || Math.abs(oe - Ve[we - 1]) > 1e-6).map((oe) => C.clone().lerp(F, oe)), ue = ne.map((oe) => A(oe.x + H.x, oe.y + H.y).height - a + 1e-4);
    for (let oe = 0; oe < ne.length - 1; oe++) {
      const we = ne[oe], Ve = ne[oe + 1], Ke = [we.x, t - 3e-3, we.y], ke = [Ve.x, t - 3e-3, Ve.y], Y = [we.x, ue[oe], we.y], K = [Ve.x, ue[oe + 1], Ve.y];
      w.push([Ke, Y, ke], [ke, Y, K]);
    }
  }
  const R = w.length ? createMesh("GableWallInfill", triangleGeometry(w), i.walls, "wall") : null;
  return { group: v, surfaces: g, gables: R, triangles: u, faceRecords: d, triangleFaceIds: f, sample: A, eaveTop: c, vertices: l };
}
function createRoofObstructions({ roof: n, footprint: e, materials: t, seed: i = 1, index: r = 0 }) {
  const s = seededRandom(i), a = new THREE.Group();
  a.name = "RoofObstructions", a.userData.role = "roof-obstructions";
  const o = [], c = n.triangles.map((d, p) => ({ triangle: d, i: p, area: triangleArea(d) })).sort((d, p) => p.area - d.area);
  function l(d, p) {
    const g = [];
    for (const { triangle: m } of c) {
      for (const h of [[1 / 3, 1 / 3, 1 / 3], [0.52, 0.24, 0.24], [0.24, 0.52, 0.24], [0.24, 0.24, 0.52]]) {
        const T = m.reduce((w, R, D) => w + R[0] * h[D], 0), y = m.reduce((w, R, D) => w + R[2] * h[D], 0);
        if (distanceToBoundary(T, y, e) < Math.max(d, p) * 0.6 + 0.35 || o.some((w) => Math.hypot(T - w.x, y - w.z) < w.radius + Math.max(d, p) * 0.65 + 0.55)) continue;
        const v = n.sample(T, y), A = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([w, R]) => {
          const D = T + w * d / 2, E = y + R * p / 2, M = n.sample(D, E);
          return M ? { x: D, z: E, ...M } : null;
        });
        A.some((w) => !w || w.faceId !== v.faceId) || g.push({ x: T, z: y, ...v, corners: A });
      }
      if (g.length >= 12) break;
    }
    if (!g.length) return null;
    const _ = g[Math.floor(s() * Math.min(10, g.length))];
    return o.push({ ..._, radius: Math.max(d, p) * 0.65 }), _;
  }
  function u(d, p, g, _, m, h = 0.035) {
    const T = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([A, w]) => {
      const R = g.x + A * _ / 2, D = g.z + w * m / 2;
      return [R, n.sample(R, D).height + 0.022, D];
    }), y = T.map(([A, w, R]) => [A, w - h, R]), v = [[T[0], T[2], T[1]], [T[0], T[3], T[2]], [y[0], y[1], y[2]], [y[0], y[2], y[3]]];
    for (let A = 0; A < 4; A++) {
      const w = (A + 1) % 4;
      v.push([T[A], T[w], y[A]], [T[w], y[w], y[A]]);
    }
    d.add(createMesh(p, triangleGeometry(v), t.flashing, "flashing"));
  }
  const f = r % 5 === 0 ? 2 : 1;
  for (let d = 0; d < f; d++) {
    const p = 0.72 + s() * 0.28, g = 0.86 + s() * 0.36, _ = l(p + 0.36, g + 0.36);
    if (!_) continue;
    const m = new THREE.Group();
    m.name = `Chimney-${d + 1}`;
    const h = Math.min(..._.corners.map((y) => y.height)) - 0.22, T = Math.max(..._.corners.map((y) => y.height)) + 1.1 + s() * 0.62;
    if (m.userData = { role: "roof-obstruction", obstructionType: "chimney", roofFaceId: _.faceId, positionLocal: [_.x, _.height, _.z], footprintSize: [p, g], topHeight: T }, u(m, "ChimneyFlashing", _, p + 0.32, g + 0.32), addBox(m, "MasonryShaft", [p, T - h, g], [_.x, (T + h) / 2, _.z], t.chimney), addBox(m, "ChimneyCap", [p + 0.14, 0.095, g + 0.14], [_.x, T + 0.0475, _.z], t.darkMetal), r % 3 === 0) {
      const y = createMesh("Flue", new THREE.CylinderGeometry(0.15, 0.15, 0.28, 12), t.darkMetal, "roof-obstruction");
      y.position.set(_.x, T + 0.21, _.z), m.add(y);
    }
    a.add(m);
  }
  for (let d = 0; d < 2 + r % 2; d++) {
    const p = l(0.64, 0.64);
    if (!p) continue;
    const g = new THREE.Group();
    g.name = `VentStack-${d + 1}`;
    const _ = 0.42 + s() * 0.24;
    g.userData = { role: "roof-obstruction", obstructionType: "vent", roofFaceId: p.faceId, positionLocal: [p.x, p.height, p.z], heightAboveRoof: _ }, u(g, "VentFlashing", p, 0.46, 0.46);
    const m = createMesh("VerticalPipe", new THREE.CylinderGeometry(0.095, 0.095, _ + 0.22, 12), t.darkMetal, "roof-obstruction");
    m.position.set(p.x, p.height + (_ - 0.22) / 2, p.z);
    const h = createMesh("VentCap", new THREE.CylinderGeometry(0.05, 0.16, 0.09, 12), t.metal, "roof-obstruction");
    h.position.set(p.x, p.height + _ + 0.035, p.z), g.add(m, h), a.add(g);
  }
  if (r % 4 === 1) {
    const d = l(1.4, 1.8);
    if (d) {
      const p = new THREE.Group();
      p.name = "RoofEquipment", p.userData = { role: "roof-obstruction", obstructionType: "equipment", roofFaceId: d.faceId };
      const g = Math.min(...d.corners.map((h) => h.height)) - 0.1, _ = Math.max(...d.corners.map((h) => h.height)) + 0.08;
      u(p, "EquipmentFlashing", d, 1.3, 1.7), addBox(p, "EquipmentCurb", [1.05, _ - g, 1.45], [d.x, (_ + g) / 2, d.z], t.flashing), addBox(p, "EquipmentHousing", [0.96, 0.65, 1.36], [d.x, _ + 0.325, d.z], t.metal);
      const m = createMesh("FanGrille", new THREE.CylinderGeometry(0.27, 0.27, 0.028, 16), t.darkMetal, "roof-obstruction");
      m.position.set(d.x, _ + 0.674, d.z), p.add(m), a.add(p);
    }
  }
  return a;
}
const UP = new THREE.Vector3(0, 1, 0), TAU = Math.PI * 2;
function treeRandom(n) {
  const e = String(n);
  let t = 2166136261;
  for (let i = 0; i < e.length; i += 1) t = Math.imul(t ^ e.charCodeAt(i), 16777619);
  return () => {
    t += 1831565813;
    let i = t;
    return i = Math.imul(i ^ i >>> 15, i | 1), i ^= i + Math.imul(i ^ i >>> 7, i | 61), ((i ^ i >>> 14) >>> 0) / 4294967296;
  };
}
function branchGeometry(n, e, t, i, r = 8) {
  const s = new THREE.Vector3().subVectors(e, n), a = new THREE.CylinderGeometry(i, t, s.length(), r, 1);
  return a.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, s.normalize())), a.translate((n.x + e.x) / 2, (n.y + e.y) / 2, (n.z + e.z) / 2), a;
}
function mergeBranches(n) {
  const e = mergeGeometries(n, false);
  for (const i of n) i.dispose();
  const t = e.getAttribute("position");
  for (let i = 0; i < t.count; i += 1) t.getY(i) < 0 && t.setY(i, 0);
  return e.computeVertexNormals(), e.computeBoundingBox(), e.computeBoundingSphere(), e;
}
function fitCanopy(n, e, t, i) {
  const r = n.getAttribute("position");
  let s = 1 / 0, a = -1 / 0, o = 0;
  for (let l = 0; l < r.count; l += 1) s = Math.min(s, r.getY(l)), a = Math.max(a, r.getY(l)), o = Math.max(o, Math.hypot(r.getX(l), r.getZ(l)));
  for (let l = 0; l < r.count; l += 1) r.setXYZ(l, r.getX(l) * i / o, t + (r.getY(l) - s) / (a - s) * (e - t), r.getZ(l) * i / o);
  n.deleteAttribute("uv"), n.deleteAttribute("normal");
  const c = mergeVertices(n, 1e-5);
  return n.dispose(), c.computeVertexNormals(), c.computeBoundingBox(), c.computeBoundingSphere(), c;
}
function broadleafCanopy(n, e, t) {
  const i = new THREE.SphereGeometry(1, 40, 26), r = i.getAttribute("position"), s = Array.from({ length: 6 }, () => n() * TAU), a = Array.from({ length: 12 }, (u, f) => {
    const d = f / 12 * TAU + n() * 0.45, p = -0.7 + n() * 1.4, g = Math.sqrt(1 - p * p);
    return { direction: new THREE.Vector3(Math.cos(d) * g, p, Math.sin(d) * g), strength: 0.1 + n() * 0.19, sharpness: 9 + n() * 8 };
  }), o = new THREE.Vector3(), c = 0.9 + n() * 0.17, l = 0.87 + n() * 0.18;
  for (let u = 0; u < r.count; u += 1) {
    o.fromBufferAttribute(r, u).normalize();
    const { x: f, y: d, z: p } = o;
    let g = 0.79;
    for (const h of a) g += h.strength * Math.exp((o.dot(h.direction) - 1) * h.sharpness);
    g += 0.07 * Math.sin(f * 6 + s[0]) * Math.cos(p * 5 + s[1]) * Math.cos(d * 4 + s[2]), g += 0.026 * Math.sin(f * 12 + s[3]) * Math.sin(d * 10 + s[4]) * Math.cos(p * 11 + s[5]);
    const _ = 1 + d * 0.1, m = Math.sin(f * 6 + s[1]) * Math.cos(p * 5 + s[2]) * 0.065;
    r.setXYZ(u, f * t * g * c * _, e * (0.7 + d * 0.295 + m * Math.sqrt(Math.max(0, 1 - d * d))), p * t * g * l * _);
  }
  return fitCanopy(i, e, e * 0.41, t);
}
function broadleafBranches(n, e, t) {
  const i = [], r = e * 0.023, s = new THREE.Vector3((n() - 0.5) * 0.22, 0, (n() - 0.5) * 0.22), a = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(s.x * 0.4, e * 0.2, s.z * 0.4), new THREE.Vector3(s.x, e * 0.4, s.z), new THREE.Vector3(s.x * 1.3, e * 0.65, s.z * 1.3)], o = [r * 1.3, r, r * 0.72, r * 0.18];
  for (let l = 0; l < a.length - 1; l += 1) i.push(branchGeometry(a[l], a[l + 1], o[l], o[l + 1], 10));
  const c = n() * TAU;
  for (let l = 0; l < 6; l += 1) {
    const u = c + l * TAU / 6 + (n() - 0.5) * 0.42, f = new THREE.Vector3(s.x, e * (0.3 + l * 0.029), s.z), d = t * (0.59 + n() * 0.2), p = new THREE.Vector3(Math.cos(u) * d * 0.55, e * (0.49 + n() * 0.07), Math.sin(u) * d * 0.55), g = new THREE.Vector3(Math.cos(u) * d, e * (0.65 + n() * 0.11), Math.sin(u) * d);
    i.push(branchGeometry(f, p, r * 0.53, r * 0.3)), i.push(branchGeometry(p, g, r * 0.3, r * 0.075));
    const _ = u + (n() > 0.5 ? 0.46 : -0.46), m = new THREE.Vector3(Math.cos(_) * d * 0.87, e * (0.67 + n() * 0.09), Math.sin(_) * d * 0.87);
    i.push(branchGeometry(p, m, r * 0.2, r * 0.045, 6));
  }
  for (let l = 0; l < 4; l += 1) {
    const u = c + l * TAU / 4;
    i.push(branchGeometry(new THREE.Vector3(0, r * 1.4, 0), new THREE.Vector3(Math.cos(u) * r * 2.7, r * 0.13, Math.sin(u) * r * 2.7), r * 0.52, r * 0.1, 6));
  }
  return mergeBranches(i);
}
function coniferCanopy(n, e, t) {
  const i = new THREE.SphereGeometry(1, 36, 32), r = i.getAttribute("position"), s = n() * TAU, a = n() * TAU, o = 7 + Math.floor(n() * 3);
  for (let c = 0; c < r.count; c += 1) {
    const l = r.getX(c), u = r.getZ(c), f = (r.getY(c) + 1) / 2, d = Math.hypot(l, u), p = Math.atan2(u, l), g = Math.sin(Math.min(f / 0.08, 1) * Math.PI / 2), _ = Math.pow(1 - f, 0.84), m = 0.79 + 0.21 * Math.pow(0.5 + Math.cos(f * o * TAU + 0.25 * Math.sin(p * 3 + s)) * 0.5, 2), h = 1 + 0.08 * Math.sin(p * 5 + f * 7 + s) + 0.043 * Math.cos(p * 9 - f * 13 + a), T = t * _ * g * m * h, y = e * (0.17 + f * 0.83 + 9e-3 * Math.sin(p * 4 + a) * Math.sin(f * Math.PI));
    r.setXYZ(c, d > 1e-7 ? l / d * T : 0, y, d > 1e-7 ? u / d * T : 0);
  }
  return fitCanopy(i, e, e * 0.17, t);
}
function coniferBranches(n, e, t) {
  const i = e * 0.017, r = [branchGeometry(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, e * 0.96, 0), i * 1.3, i * 0.08, 10)], s = n() * TAU;
  for (let a = 0; a < 2; a += 1) for (let o = 0; o < 7; o += 1) {
    const c = o * TAU / 7 + s + a * 0.35, l = new THREE.Vector3(0, e * (0.23 + a * 0.13), 0), u = t * (0.71 - a * 0.1 + n() * 0.12), f = new THREE.Vector3(Math.cos(c) * u, l.y - e * (0.022 + n() * 0.025), Math.sin(c) * u);
    r.push(branchGeometry(l, f, i * 0.34, i * 0.05, 6));
  }
  return mergeBranches(r);
}
function createTree({ seed: n = 1, height: e = 9, crownRadius: t = 3.8, species: i = "broadleaf", materials: r = {} } = {}) {
  if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(t) || t <= 0) throw new RangeError("Tree height and crownRadius must be positive finite numbers.");
  if (i !== "broadleaf" && i !== "conifer") throw new RangeError('Tree species must be "broadleaf" or "conifer".');
  const s = treeRandom(n), a = new THREE.Group();
  a.name = `${i}-tree-${n}`, a.userData = { role: "natural-obstruction", species: i, seed: n, height: e, crownRadius: t, units: "metres" };
  const o = r.trunk ?? new THREE.MeshStandardMaterial({ name: "tree-bark", color: 7959655, roughness: 1, metalness: 0 }), c = r.foliage ?? new THREE.MeshStandardMaterial({ name: "tree-foliage", color: i === "conifer" ? 7831919 : 9279104, roughness: 1, metalness: 0 }), l = i === "conifer" ? coniferBranches(s, e, t) : broadleafBranches(s, e, t), u = i === "conifer" ? coniferCanopy(s, e, t) : broadleafCanopy(s, e, t), f = new THREE.Mesh(l, o);
  f.name = "trunk-and-branches", f.userData = { role: "natural-obstruction", part: "wood" };
  const d = new THREE.Mesh(u, c);
  d.name = "solid-canopy", d.userData = { role: "natural-obstruction", part: "canopy" };
  for (const p of [f, d]) p.castShadow = true, p.receiveShadow = true, a.add(p);
  return a;
}
function roadRibbon(n, e, t) {
  const i = n.map((s, a) => {
    const o = n[Math.max(0, a - 1)], c = n[Math.min(n.length - 1, a + 1)], l = c[0] - o[0], u = c[1] - o[1], f = Math.hypot(l, u), d = -u / f * e / 2, p = l / f * e / 2;
    return [[s[0] + d, t, s[1] + p], [s[0] - d, t, s[1] - p]];
  }), r = [];
  for (let s = 0; s < i.length - 1; s++) {
    const [a, o] = i[s], [c, l] = i[s + 1];
    r.push([a, c, o], [c, l, o]);
  }
  return triangleGeometry(r);
}
function turningHead(n, e, t, i, r) {
  const s = createMesh(r, new THREE.CircleGeometry(n, 64), t, "site");
  return s.rotation.x = -Math.PI / 2, s.position.set(i[0], e, i[1]), s.castShadow = false, s;
}
function createSite(n, e) {
  const t = new THREE.Group();
  t.name = "Site", t.userData.role = "site";
  const i = createMesh("Ground", polygonGeometry(n.siteBoundary, -0.075), e.ground, "site");
  i.castShadow = false, t.add(i);
  for (const r of n.houses) if (r.driveway?.length >= 2) {
    const s = createMesh(`${r.id}-Driveway`, roadRibbon(r.driveway, r.drivewayWidth ?? 3.1, -0.044), e.drive, "site");
    s.castShadow = false, t.add(s);
  }
  if (n.roadSurfacePolygons?.length && n.roadEdgingPolygons?.length) {
    const r = (s, a, o, c) => s.forEach((l, u) => {
      const f = l.outline.map(([h, T]) => new THREE.Vector2(h, T)), d = (l.holes ?? []).map((h) => h.map(([T, y]) => new THREE.Vector2(T, y))), p = [f, ...d].flat(), _ = THREE.ShapeUtils.triangulateShape(f, d).map((h) => h.map((T) => [Math.fround(p[T].x), Math.fround(a), Math.fround(p[T].y)]));
      for (const h of _) (h[1][2] - h[0][2]) * (h[2][0] - h[0][0]) - (h[1][0] - h[0][0]) * (h[2][2] - h[0][2]) < 0 && ([h[1], h[2]] = [h[2], h[1]]);
      const m = createMesh(`${c}-${u + 1}`, triangleGeometry(_), o, "site");
      m.castShadow = false, t.add(m);
    });
    return r(n.roadEdgingPolygons, -0.054, e.curb, "StreetEdging"), r(n.roadSurfacePolygons, -0.014, e.road, "StreetSurface"), t;
  }
  for (const [r, s] of n.roads.entries()) {
    const a = -0.03 + r * 7e-3, o = createMesh(`${s.id}-Edging`, roadRibbon(s.points, s.width + 0.7, a - 8e-3), e.curb, "site"), c = createMesh(s.id, roadRibbon(s.points, s.width, a), e.road, "site");
    if (o.castShadow = false, c.castShadow = false, t.add(o, c), s.endCapRadius) {
      const l = s.points[s.points.length - 1];
      t.add(turningHead(s.endCapRadius + 0.35, a - 6e-3, e.curb, l, `${s.id}-TurningHeadEdging`)), t.add(turningHead(s.endCapRadius, a + 1e-3, e.road, l, `${s.id}-TurningHead`));
    }
  }
  return t;
}
function createBuilding(n, { index: e = 0, seed: t = 2047, wallHeight: i, pitch: r, includeEdges: s = true, includeObstructions: a = true, materials: o = createMaterials() } = {}) {
  const c = BUILDING_TYPES.find((p) => p.id === n);
  if (!c) throw new Error(`Unknown building type: ${n}`);
  const l = ROOF_LAYOUTS[n];
  if (i ?? (i = c.wallHeight), r ?? (r = c.pitch), !(i > 1) || !(r > 0 && r < 75)) throw new Error("Use a wall height above 1 m and a pitch between 0 and 75 degrees.");
  const u = new THREE.Group();
  u.name = n;
  const f = createRoof(l, { pitch: r, wallHeight: i, materials: o, roofMaterial: o.roofs[e % o.roofs.length], includeEdges: s }), d = createMesh("ExteriorWalls", extrudeFootprint(c.footprint, i), e % 4 === 2 ? o.wallsCool : o.walls, "wall");
  if (u.add(d, f.group), f.gables && (f.gables.material = d.material, u.add(f.gables)), s) {
    const p = [], g = new Set(l.gableFaces.map((m) => m.sourceEdge));
    c.footprint.forEach(([m, h], T) => {
      const [y, v] = c.footprint[(T + 1) % c.footprint.length];
      p.push([[m, 0, h], [m, i, h]], [[m, 0, h], [y, 0, v]]), g.has(T) || p.push([[m, i, h], [y, i, v]]);
    });
    const _ = new THREE.LineSegments(lineGeometry(p), o.subtleEdges);
    _.name = "WallFeatureEdges", _.userData.role = "cad-edges", u.add(_);
  }
  return a && u.add(createRoofObstructions({ roof: f, footprint: c.footprint, materials: o, seed: hashString(`${t}:${n}:${e}`), index: e })), u.userData = { role: "building", typeId: n, label: c.label, roofStyle: c.roofStyle, units: "m", coordinateSpace: "building-local", wallHeight: i, pitchDegrees: r, eaveTopHeight: f.eaveTop, roofThicknessVertical: 0.16, overhang: l.overhang, footprintArea: l.footprintArea, roofArea: f.surfaces.userData.area, footprint: c.footprint, roofFaceCount: f.faceRecords.length }, u;
}
function createResidentialArea({ seed: n = 2047, includeSite: e = true, includeTrees: t = true, includeEdges: i = true, includeObstructions: r = true, layout: s = createLayout(), materials: a = createMaterials() } = {}) {
  const o = new THREE.Group();
  o.name = "ResidentialArea";
  const c = new THREE.Group();
  if (c.name = "Buildings", c.userData.role = "buildings", s.houses.forEach((l, u) => {
    const f = createBuilding(l.typeId, { index: u, seed: n, materials: a, includeEdges: i, includeObstructions: r, wallHeight: l.wallHeight, pitch: l.pitch });
    f.name = l.id, f.position.set(l.x, l.y ?? 0, l.z), f.rotation.y = l.rotation, f.userData.id = l.id, f.userData.headingDegrees = THREE.MathUtils.radToDeg(l.rotation), c.add(f);
  }), o.add(c), t) {
    const l = new THREE.Group();
    l.name = "NaturalObstructions", l.userData.role = "natural-obstructions", s.trees.forEach((u, f) => {
      const d = createTree({ ...u, materials: a });
      d.name = `Tree-${String(f + 1).padStart(2, "0")}`, d.position.set(u.x, u.y ?? 0, u.z), l.add(d);
    }), o.add(l);
  }
  return e && o.add(createSite(s, a)), o.userData = { role: "residential-area", units: "m", upAxis: "Y", north: [0, 0, -1], seed: n, buildingCount: c.children.length, roofConstruction: "Equal-pitch interior straight skeleton with connected planar roof faces", description: "Exterior massing and obstruction geometry; no interior floor-plan partitions." }, o.updateMatrixWorld(true), o;
}
export {
  createResidentialArea
};
