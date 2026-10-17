// Scene construction adapted from the supplied manhattan-block-viewer.html.
// Uses the app’s pinned Three.js; the standalone renderer, lights and controls are excluded.
import * as THREE from "three/webgpu";
const POINT_EPSILON = 1e-8, AREA_EPSILON = 1e-8;
function createBuildingExtrusion(s, e, d = {}) {
  const a = Number(s.heightMeters);
  if (!Number.isFinite(a) || a <= 0) throw new Error(`Building ${s.id}: heightMeters must be positive.`);
  if (!Array.isArray(s.polygons) || s.polygons.length === 0) throw new Error(`Building ${s.id}: at least one footprint is required.`);
  if (!e?.roof || !(e.wall || e.facades?.length)) throw new Error("Building materials must provide roof and wall/facades.");
  const i = d.flattenGround ?? true, o = Number(s.groundElevationMeters ?? 0), n = Number(d.groundReferenceMeters ?? 0);
  if (!Number.isFinite(o) || !Number.isFinite(n)) throw new Error(`Building ${s.id}: ground elevations must be finite.`);
  const c = i ? 0 : o - n, r = c + a, t = geometryArrays(), u = geometryArrays(), b = geometryArrays();
  let l = 0;
  for (const [h, T] of s.polygons.entries()) {
    const C = `Building ${s.id}, polygon ${h}`, k = cleanRing(T.outer, false, `${C}, exterior`), m = (T.holes ?? []).map((w, N) => cleanRing(w, true, `${C}, hole ${N}`)), v = Math.abs(THREE.ShapeUtils.area(k)) - m.reduce((w, N) => w + Math.abs(THREE.ShapeUtils.area(N)), 0);
    if (v <= AREA_EPSILON) throw new Error(`${C}: holes leave no positive roof area.`);
    const S = THREE.ShapeUtils.triangulateShape(k, m), y = k.concat(...m);
    validateTriangulation(y, S, v, C), l += v, appendHorizontalSurface(u, y, S, r, 1), (d.includeBottom ?? true) && appendHorizontalSurface(b, y, S, c, -1);
    for (const w of [k, ...m]) appendWalls(t, w, c, r);
  }
  const f = new THREE.Group();
  f.name = `building_${s.id}`, f.userData = { type: "building", buildingId: String(s.id), bin: s.bin ?? null, bbl: s.bbl ?? null, geometryMethod: "source_footprint_extrusion", heightMeters: a, groundElevationMeters: o, baseElevationMeters: c, roofElevationMeters: r, footprintAreaSquareMeters: l, polygonCount: s.polygons.length, flattenedGround: i, inferredFeatures: [] };
  const O = e.facades?.length ? e.facades : [e.wall], p = ((Number.isInteger(d.facadeIndex) ? d.facadeIndex : hashString(String(s.id))) % O.length + O.length) % O.length;
  return addBuildingSurface(f, "walls", "wall", t, O[p]), addBuildingSurface(f, "roof", "roof", u, e.roof), b.positions.length && addBuildingSurface(f, "base", "base", b, e.base ?? O[p]), f;
}
function geometryArrays() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}
function cleanRing(s, e, d) {
  if (!Array.isArray(s)) throw new Error(`${d}: ring is missing.`);
  const a = [];
  for (const i of s) {
    if (!Array.isArray(i) || i.length < 2 || !Number.isFinite(i[0]) || !Number.isFinite(i[1])) throw new Error(`${d}: coordinates must be finite [x, z] pairs.`);
    const o = new THREE.Vector2(i[0], i[1]);
    (!a.length || a.at(-1).distanceToSquared(o) > POINT_EPSILON ** 2) && a.push(o);
  }
  if (a.length > 1 && a[0].distanceToSquared(a.at(-1)) <= POINT_EPSILON ** 2 && a.pop(), a.length < 3 || Math.abs(THREE.ShapeUtils.area(a)) <= AREA_EPSILON) throw new Error(`${d}: ring is degenerate.`);
  return THREE.ShapeUtils.isClockWise(a) !== e && a.reverse(), a;
}
function appendWalls(s, e, d, a) {
  let i = 0;
  for (let o = 0; o < e.length; o += 1) {
    const n = e[o], c = e[(o + 1) % e.length], r = c.x - n.x, t = c.y - n.y, u = Math.hypot(r, t), b = s.positions.length / 3, l = t / u, f = -r / u;
    s.positions.push(n.x, d, n.y, n.x, a, n.y, c.x, a, c.y, c.x, d, c.y);
    for (let O = 0; O < 4; O += 1) s.normals.push(l, 0, f);
    s.uvs.push(i, 0, i, a - d, i + u, a - d, i + u, 0), s.indices.push(b, b + 1, b + 2, b, b + 2, b + 3), i += u;
  }
}
function appendHorizontalSurface(s, e, d, a, i) {
  const o = s.positions.length / 3;
  for (const n of e) s.positions.push(n.x, a, n.y), s.normals.push(0, i, 0), s.uvs.push(n.x, -n.y);
  for (const [n, c, r] of d) {
    const t = signedTriangleArea(e[n], e[c], e[r]);
    Math.abs(t) <= AREA_EPSILON || ((t < 0 ? 1 : -1) === i ? s.indices.push(o + n, o + c, o + r) : s.indices.push(o + n, o + r, o + c));
  }
}
function validateTriangulation(s, e, d, a) {
  const i = e.reduce((n, [c, r, t]) => n + Math.abs(signedTriangleArea(s[c], s[r], s[t])) / 2, 0), o = Math.max(1e-5, d * 1e-6);
  if (!e.length || Math.abs(i - d) > o) throw new Error(`${a}: roof triangulation does not preserve the footprint area.`);
}
function signedTriangleArea(s, e, d) {
  return (e.x - s.x) * (d.y - s.y) - (e.y - s.y) * (d.x - s.x);
}
function addBuildingSurface(s, e, d, a, i) {
  const o = new THREE.BufferGeometry();
  o.setAttribute("position", new THREE.Float32BufferAttribute(a.positions, 3)), o.setAttribute("normal", new THREE.Float32BufferAttribute(a.normals, 3)), o.setAttribute("uv", new THREE.Float32BufferAttribute(a.uvs, 2)), o.setIndex(a.indices), o.computeBoundingBox(), o.computeBoundingSphere();
  const n = new THREE.Mesh(o, i);
  n.name = e, n.castShadow = true, n.receiveShadow = true, n.userData = { buildingId: s.userData.buildingId, surfaceType: d }, s.add(n);
}
function hashString(s) {
  let e = 2166136261;
  for (let d = 0; d < s.length; d += 1) e ^= s.charCodeAt(d), e = Math.imul(e, 16777619);
  return e >>> 0;
}
const FACADE_COLORS = [14012613, 13223356, 14736853, 13090737, 13814977, 12566713];
function createBuildingMaterials() {
  const s = FACADE_COLORS.map((i, o) => {
    const n = new THREE.MeshStandardMaterial({ color: i, roughness: 0.92 });
    return n.name = `facade_${o + 1}`, n;
  }), e = new THREE.MeshStandardMaterial({ color: 8751498, roughness: 0.96 });
  e.name = "roof_gray";
  const d = new THREE.MeshStandardMaterial({ color: 11841703, roughness: 1 });
  d.name = "building_base";
  const a = new THREE.MeshStandardMaterial({ color: 13157562, roughness: 0.93 });
  return a.name = "parapet_stone", { facades: s, wall: s[0], roof: e, base: d, parapet: a };
}
const ROAD_LEVEL = -0.14, CONTEXT_BASE_LEVEL = -0.2, JUNCTION_TOLERANCE = 0.5, BRYANT_PARK_SIDEWALK_ID = "12380002324.0";
function createStreetContext(s, e = {}) {
  const d = s.context, a = d?.blockPolygons ?? d?.blocks?.flatMap((y) => y.polygons);
  if (!a?.length || !d.sidewalks?.length) throw new Error("Street context requires source tax-block and sidewalk polygons.");
  const i = e.outerMarginMeters ?? 2;
  if (!Number.isFinite(i) || i < 0) throw new Error("outerMarginMeters must be a nonnegative number.");
  const o = a.flatMap((y) => y.outer), n = bounds2D(o), c = [(n.minX + n.maxX) / 2, (n.minZ + n.maxZ) / 2], r = (d.streetCenterlines ?? []).flatMap((y) => y.lines.map((w, N) => streetSegment(y, w, N)));
  let t = d.cropPolygons;
  if (!t?.length && d.cropPolygon?.length && (t = [{ outer: d.cropPolygon, holes: [] }]), !t?.length) {
    if (r.length !== 4 || r.some((y) => y.widthMeters <= 0)) throw new Error("A district crop polygon is required when more than four streets are supplied.");
    t = [{ outer: cropToBoundaryStreets(r, c, i), holes: [] }];
  }
  const u = createMaterial("asphalt", 7830397, 0.98), b = createMaterial("sidewalk_stone", 12566974, 0.95), l = createMaterial("block_ground", 11580076, 1), f = new THREE.Group();
  f.name = "street_context";
  const O = createContextSlab("surrounding_roads", t, ROAD_LEVEL, u, { contextType: "road", geometryMethod: "cropped_asphalt_underlay_below_source_context_surfaces", inferred: true, inference: "Asphalt is a contiguous background surface concealed beneath the sourced block, sidewalk and plaza geometry.", streets: r.map(({ id: y, name: w, widthMeters: N, source: E }) => ({ id: y, name: w, widthMeters: N, source: E })), cropSource: d.cropSource ?? null, outerMarginMeters: i });
  f.add(O);
  const j = createContextSlab("tax_block_pad", a, -0.015, l, { contextType: "tax_block_ground", geometryMethod: "source_tax_block_outline", sourceBlock: s.metadata?.block ?? null, sourceBlockIds: d.blocks?.map((y) => y.id) ?? [s.metadata?.block].filter(Boolean), source: findSource(s, "tax block"), inferred: false });
  f.add(j);
  const p = d.sidewalks.filter((y) => y.sourceId === BRYANT_PARK_SIDEWALK_ID && d.parks?.some((w) => w.id === "M008")), h = new Set(p.map((y) => y.id)), T = d.sidewalks.filter((y) => !h.has(y.id));
  let C = 0;
  if (T.length) {
    const y = createContextSlab("district_sidewalks", T.flatMap((w) => w.polygons), 0, b, { contextType: "sidewalk", geometryMethod: "source_sidewalk_outline_with_holes", sourceRecords: sourceRecords(T), inferred: false });
    C += y.userData.areaSquareMeters, f.add(y);
  }
  let k = 0;
  if (d.plazas?.length) {
    const y = createMaterial("pedestrian_plaza_stone", 12236202, 0.97), w = createContextSlab("pedestrian_plazas", d.plazas.flatMap((N) => N.polygons), -2e-3, y, { contextType: "pedestrian_plaza", geometryMethod: "source_plaza_outlines", sourceRecords: sourceRecords(d.plazas), inferred: false });
    k = w.userData.areaSquareMeters, f.add(w);
  }
  for (const y of d.parks ?? []) {
    const w = new THREE.Group();
    w.name = y.id === "M008" ? "bryant_park" : `park_${y.id}`, w.userData = { type: "context", contextType: "park", sourceId: y.id, name: y.name ?? null, source: y.source, inferredFeatures: ["vegetation_surface_treatment"], inference: "The muted green ground is a landscape treatment inside the official property boundary, not a surveyed lawn classification." };
    const N = createMaterial(`park_${y.id}_green`, 8228209, 1);
    if (w.add(createContextSlab(`${w.name}_ground`, y.polygons, -7e-3, N, { contextType: "park_ground", geometryMethod: "official_park_property_outline", sourceId: y.id, source: y.source, inferred: true, inference: "Vegetation appearance is inferred; the official property includes grounds that may be paved or built on." })), y.id === "M008" && p.length) {
      const E = createMaterial("bryant_park_path_stone", 12170149, 0.96), A = createContextSlab("bryant_park_paths", p.flatMap((R) => R.polygons), 3e-3, E, { contextType: "park_path", geometryMethod: "source_interior_sidewalk_polygons", sourceRecords: sourceRecords(p), inferred: false });
      C += A.userData.areaSquareMeters, w.add(A);
    }
    f.add(w);
  }
  let m = 0, v = 0;
  if (e.includeStreetMarkings ?? true) {
    const y = createCrosswalks(r, t);
    y && (f.add(y), m = y.userData.crosswalkCount, v = y.userData.stripeCount);
  }
  const S = bounds2D(t.flatMap((y) => y.outer));
  return f.userData = { type: "context", units: "meters", axisConvention: "+X east, +Y up, -Z north", sourceBlock: s.metadata?.block ?? null, district: s.metadata?.district ?? null, tileOutline: t[0].outer, dimensionsMeters: { x: S.maxX - S.minX, z: S.maxZ - S.minZ, y: (p.length ? 3e-3 : 0) - CONTEXT_BASE_LEVEL }, tileAreaSquareMeters: O.userData.areaSquareMeters, asphaltUnderlayAreaSquareMeters: O.userData.areaSquareMeters, sidewalkAreaSquareMeters: C, plazaAreaSquareMeters: k, blockAreaSquareMeters: j.userData.areaSquareMeters, blockCount: d.blocks?.length ?? 1, sidewalkRecordCount: d.sidewalks.length, streetCount: r.length, zeroWidthStreetCount: r.filter((y) => y.widthMeters === 0).length, parkCount: d.parks?.length ?? 0, crosswalkCount: m, stripeCount: v, inferredFeatures: ["cropped_asphalt_underlay", ...m ? ["crosswalk_paint"] : [], ...d.parks?.length ? ["park_vegetation_surface_treatment"] : []] }, f;
}
function createMaterial(s, e, d) {
  const a = new THREE.MeshStandardMaterial({ color: e, roughness: d });
  return a.name = s, a;
}
function createContextSlab(s, e, d, a, i) {
  const o = createBuildingExtrusion({ id: s, heightMeters: d - CONTEXT_BASE_LEVEL, groundElevationMeters: CONTEXT_BASE_LEVEL, polygons: e }, { wall: a, roof: a, base: a }, { flattenGround: false }), n = o.userData.footprintAreaSquareMeters;
  o.name = s, o.userData = { type: "context", areaSquareMeters: n, topElevationMeters: d, bottomElevationMeters: CONTEXT_BASE_LEVEL, elevationMethod: "nominal_flat_context_levels", ...i };
  for (const c of o.children) {
    const r = c.name, t = r === "walls" ? 0 : correctFloat32Winding(c.geometry);
    c.name = `${s}_${r === "roof" ? "surface" : r === "walls" ? "edges" : "base"}`, c.userData = { type: "context_surface", contextType: i.contextType, surfaceType: r === "roof" ? "top" : r, inferred: i.inferred, float32WindingCorrections: t }, c.castShadow = false, c.receiveShadow = true;
  }
  return o;
}
function correctFloat32Winding(s) {
  const e = s.getAttribute("position"), d = s.getAttribute("normal"), a = s.getIndex();
  let i = 0;
  for (let o = 0; o < a.count; o += 3) {
    const n = a.getX(o), c = a.getX(o + 1), r = a.getX(o + 2), t = e.getX(c) - e.getX(n), u = e.getZ(c) - e.getZ(n), b = e.getX(r) - e.getX(n), l = e.getZ(r) - e.getZ(n);
    (u * b - t * l) * d.getY(n) < 0 && (a.setX(o + 1, r), a.setX(o + 2, c), i += 1);
  }
  return i && (a.needsUpdate = true), i;
}
function streetSegment(s, e, d) {
  if (!e || e.length < 2 || !Number.isFinite(s.widthMeters) || s.widthMeters < 0) throw new Error(`Street ${s.name}: a centerline and nonnegative source width are required.`);
  const a = e[0], i = e.at(-1), o = Math.hypot(i[0] - a[0], i[1] - a[1]);
  if (o <= 0) throw new Error(`Street ${s.name}: centerline endpoints coincide.`);
  return { ...s, segmentId: `${s.id}_${d}`, line: e, start: a, end: i, length: o };
}
function cropToBoundaryStreets(s, e, d) {
  const a = Math.max(...s.flatMap((o) => [o.start, o.end]).map((o) => Math.hypot(o[0] - e[0], o[1] - e[1]))) + Math.max(...s.map((o) => o.widthMeters)) + 100;
  let i = [[e[0] - a, e[1] - a], [e[0] + a, e[1] - a], [e[0] + a, e[1] + a], [e[0] - a, e[1] + a]];
  for (const o of s) {
    let n = [-(o.end[1] - o.start[1]) / o.length, (o.end[0] - o.start[0]) / o.length];
    dot2D(n, subtract2D(e, o.start)) > 0 && (n = scale2D(n, -1));
    const c = dot2D(n, o.start) + o.widthMeters / 2 + d;
    i = clipPolygon(i, n, c);
  }
  if (i.length !== 4) throw new Error("The four street centerlines did not produce a bounded four-sided tile.");
  return i;
}
function clipPolygon(s, e, d) {
  const a = [];
  for (let i = 0; i < s.length; i += 1) {
    const o = s[i], n = s[(i + 1) % s.length], c = dot2D(e, o) - d, r = dot2D(e, n) - d, t = c <= 1e-8, u = r <= 1e-8;
    if (t && a.push(o), t !== u) {
      const b = c / (c - r);
      a.push([o[0] + (n[0] - o[0]) * b, o[1] + (n[1] - o[1]) * b]);
    }
  }
  return a;
}
function createCrosswalks(s, e) {
  const d = [], a = [], i = [];
  let o = 0, n = 0;
  const c = /* @__PURE__ */ new Set();
  for (const b of s) if (!(b.widthMeters <= 0)) for (const l of [true, false]) {
    const f = l ? b.start : b.end, O = l ? b.line[1] : b.line.at(-2), j = normalize2D(subtract2D(O, f)), p = s.filter((E) => E.segmentId !== b.segmentId && E.widthMeters > 0).map((E) => {
      const A = distance2D(E.start, f) < JUNCTION_TOLERANCE, R = distance2D(E.end, f) < JUNCTION_TOLERANCE;
      if (!A && !R) return null;
      const F = A ? subtract2D(E.line[1], E.start) : subtract2D(E.line.at(-2), E.end);
      return { street: E, alignment: Math.abs(dot2D(j, normalize2D(F))) };
    }).filter((E) => E && E.alignment < 0.88).sort((E, A) => E.alignment - A.alignment)[0]?.street;
    if (!p) continue;
    const h = [-j[1], j[0]], T = p.widthMeters / 2 + 2.6;
    if (b.length < T + 5) continue;
    const C = add2D(f, scale2D(j, T)), k = `${Math.round(C[0] * 2)},${Math.round(C[1] * 2)}`;
    if (c.has(k)) continue;
    c.add(k);
    const m = 3.2, v = 0.46, S = 1, y = b.widthMeters / 2 - 0.55, w = Math.floor(y * 2 / S);
    let N = 0;
    for (let E = 0; E < w; E += 1) {
      const A = (E - (w - 1) / 2) * S, R = add2D(C, scale2D(h, A)), F = rectangleCorners(R, j, h, m, v);
      if (!containedInCrop(F, e)) continue;
      const G = d.length / 3;
      for (const K of F) d.push(K[0], ROAD_LEVEL + 2e-3, K[1]), a.push(0, 1, 0);
      i.push(G, G + 1, G + 2, G, G + 2, G + 3), N += 1, n += 1;
    }
    N && (o += 1);
  }
  if (!d.length) return null;
  const r = new THREE.BufferGeometry();
  r.setAttribute("position", new THREE.Float32BufferAttribute(d, 3)), r.setAttribute("normal", new THREE.Float32BufferAttribute(a, 3)), r.setIndex(i), r.computeBoundingBox(), r.computeBoundingSphere();
  const t = createMaterial("crosswalk_paint", 13224385, 0.96), u = new THREE.Mesh(r, t);
  return u.name = "approximate_crosswalks", u.receiveShadow = true, u.userData = { type: "context_surface", contextType: "road_markings", inferred: true, inference: "Approximate crosswalks derived from street junctions and widths; no surveyed paint locations are supplied.", crosswalkCount: o, stripeCount: n }, u;
}
function rectangleCorners(s, e, d, a, i) {
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([o, n]) => add2D(s, add2D(scale2D(e, o * a / 2), scale2D(d, n * i / 2))));
}
function containedInCrop(s, e) {
  return e.some((d) => {
    const a = d.holes ?? [];
    if (!s.every((i) => pointInPolygon(i, d.outer) && !a.some((o) => pointInPolygon(i, o)))) return false;
    for (let i = 0; i < s.length; i += 1) {
      const o = s[i], n = s[(i + 1) % s.length];
      for (const c of [d.outer, ...a]) for (let r = 0; r < c.length; r += 1) if (segmentsIntersect(o, n, c[r], c[(r + 1) % c.length])) return false;
    }
    return true;
  });
}
function pointInPolygon(s, e) {
  let d = false;
  for (let a = 0, i = e.length - 1; a < e.length; i = a++) {
    const o = e[a], n = e[i];
    o[1] > s[1] != n[1] > s[1] && s[0] < (n[0] - o[0]) * (s[1] - o[1]) / (n[1] - o[1]) + o[0] && (d = !d);
  }
  return d;
}
function segmentsIntersect(s, e, d, a) {
  const i = (o, n, c) => (n[0] - o[0]) * (c[1] - o[1]) - (n[1] - o[1]) * (c[0] - o[0]);
  return i(s, e, d) * i(s, e, a) < -1e-12 && i(d, a, s) * i(d, a, e) < -1e-12;
}
function bounds2D(s) {
  return { minX: Math.min(...s.map((e) => e[0])), maxX: Math.max(...s.map((e) => e[0])), minZ: Math.min(...s.map((e) => e[1])), maxZ: Math.max(...s.map((e) => e[1])) };
}
function findSource(s, e) {
  return s.metadata?.sources?.find((d) => d.title.toLowerCase().includes(e)) ?? null;
}
function sourceRecords(s) {
  return s.map((e) => ({ id: e.id, sourceId: e.sourceId ?? e.id, name: e.name ?? null, source: e.source }));
}
function dot2D(s, e) {
  return s[0] * e[0] + s[1] * e[1];
}
function add2D(s, e) {
  return [s[0] + e[0], s[1] + e[1]];
}
function subtract2D(s, e) {
  return [s[0] - e[0], s[1] - e[1]];
}
function scale2D(s, e) {
  return [s[0] * e, s[1] * e];
}
function distance2D(s, e) {
  return Math.hypot(s[0] - e[0], s[1] - e[1]);
}
function normalize2D(s) {
  return scale2D(s, 1 / Math.hypot(s[0], s[1]));
}
function createManhattanModel(s, e = null, d = {}) {
  if (!s?.buildings?.length) throw new Error("The district contains no buildings.");
  const a = new THREE.Group();
  a.name = s.metadata?.modelId ?? "midtown_manhattan", a.userData = { type: "georeferenced_city_district", ...structuredClone(s.metadata), modelGround: "Each building is flattened to y=0; original ground elevations are retained as metadata.", survey: e?.metadata ? structuredClone(e.metadata) : null, appearance: "Neutral technical materials; colors are presentational and are not surveyed facade finishes." };
  const i = createBuildingMaterials(), o = new THREE.Group();
  o.name = "buildings", a.add(o);
  const n = new Map((e?.buildings ?? []).map((l) => [String(l.bin), l]));
  let c = 0;
  for (const [l, f] of s.buildings.entries()) {
    const O = d.useSurvey === false ? null : n.get(String(f.bin)), j = O ? createSurveyBuilding(f, O, i, l) : createBuildingExtrusion(f, i);
    O && (c += 1), j.name = `building_${f.id}`, j.userData = { ...j.userData, type: "building", buildingId: f.id, bin: f.bin, bbl: f.bbl, address: f.address, landmarkName: f.landmarkName ?? null, modelHeightBasis: O ? "Historical survey mesh, including captured roof structures" : f.heightBasis, currentDatasetHeightMeters: Object.hasOwn(f, "currentDatasetHeightMeters") ? f.currentDatasetHeightMeters : f.heightMeters, currentDatasetGroundElevationMeters: f.groundElevationMeters, sourceCoordinates: structuredClone(f.sourceCoordinates ?? null), source: structuredClone(f.source) }, o.add(j);
  }
  (d.includeContext ?? true) && a.add(createStreetContext(s, d)), a.updateMatrixWorld(true);
  const r = new THREE.Box3().setFromObject(a), t = r.getSize(new THREE.Vector3());
  let u = 0, b = 0;
  return a.traverse((l) => {
    if (!l.isMesh) return;
    b += 1;
    const f = l.geometry;
    u += (f.index?.count ?? f.attributes.position.count) / 3;
  }), a.userData.statistics = { buildings: s.buildings.length, taxBlocks: s.metadata?.uniqueTaxBlockCount ?? s.metadata?.taxBlockCount ?? s.context?.blocks?.length ?? 1, surveyBuildings: c, footprintExtrusions: s.buildings.length - c, triangles: u, meshes: b, boundsMeters: { min: r.min.toArray(), max: r.max.toArray(), size: t.toArray() } }, a;
}
function createSurveyBuilding(s, e, d, a) {
  const i = new THREE.Group();
  i.userData = { geometryMethod: "nyc_2014_survey_mesh", geometryYear: e.sourceYear, surveyHeightMeters: e.surveyHeightMeters, surveyOriginalGroundElevationMeters: e.surveyOriginalGroundElevationMeters, surveyOriginalFootprintGroundElevationMeters: e.surveyOriginalFootprintGroundElevationMeters, surveyDetailNote: e.surveyDetailNote ?? null, footprintIntersectionOverUnion: e.footprintIntersectionOverUnion, footprintMatchMethod: e.matchMethod, sourceFootprintPartCount: e.sourceFootprintPartCount, flattenedGround: true, inferredFeatures: [] };
  const o = [["wall", "walls", d.facades[a % d.facades.length]], ["roof", "roof", d.roof], ["ground", "base", d.base]];
  for (const [n, c, r] of o) {
    const t = e.meshes.filter((l) => l.kind === n);
    if (!t.length) continue;
    const u = surveyGeometry(t), b = new THREE.Mesh(u, r);
    if (b.name = c, b.castShadow = n !== "ground", b.receiveShadow = true, b.userData = { buildingId: s.id, bin: s.bin, surfaceType: n === "ground" ? "base" : n, sourceYear: 2014, sourceSurfaceCount: t.length }, n === "roof") {
      let l = 0;
      b.userData.roofSurfaces = t.map((f) => {
        const O = f.indices.length / 3, j = { sourceId: f.sourceObjectId, firstTriangle: l, triangleCount: O };
        return l += O, j;
      });
    }
    i.add(b);
  }
  return i;
}
function surveyGeometry(s) {
  const e = [];
  for (const a of s) for (const i of a.indices) {
    const o = i * 3, n = a.positions.slice(o, o + 3);
    if (n.length !== 3 || !n.every(Number.isFinite)) throw new Error("A survey mesh contains an invalid vertex.");
    e.push(...n);
  }
  const d = new THREE.BufferGeometry();
  return d.setAttribute("position", new THREE.Float32BufferAttribute(e, 3)), d.computeVertexNormals(), d.computeBoundingBox(), d.computeBoundingSphere(), d;
}
export {
  createManhattanModel
};
