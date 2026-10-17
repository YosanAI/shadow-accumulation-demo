# Implementation report: a reusable all-surface WebGPU accumulator

## 1. The separation that matters

The core engine has no dependency on a Three.js Scene, camera, DOM control, date
picker, building dataset, or demo name. It accepts:

1. A WebGPU device.
2. A non-indexed triangle soup of opaque shadow-casting geometry in world space.
3. A receiver atlas containing a world position, geometric normal, and area
   weight per atlas texel, plus active texel indices.
4. A sequence of surface-to-sun unit vectors, energy weights, and time weights.

It produces an RGBA GPU texture and four-channel floating-point accumulated
values. The engine is in `src/core/accumulation-engine.js`; its numerical shaders
are plain WGSL in a separate file. The `adapters/` directory is the only bridge
between this contract and Three.js. Individual demos only build geometry and
mark meshes as `receiver` and/or `caster`.

Example, after building a receiver atlas outside the engine:

```js
const engine = new AccumulationEngine(device);
await engine.initialize({
  atlas,
  shadowVertices,
  bounds,
  shadowSize: 1024,
  batchSize: 16,
  biasMeters: 0.02
});
await engine.run(sunSamples, { signal, onProgress, onPreview });
engine.updateDisplay({
  metric: 'energy',
  normalization: 'absolute',
  absoluteMax: 8
});
// engine.outputTexture is a real GPUTexture. It stays on the GPU.
```

The Three.js adapter currently snapshots ordinary static meshes. Skinning,
InstancedMesh, transparent/alpha-tested foliage, material displacement, and
animated geometry must be expanded or handled by an extended adapter. The four
included scenes use supported ordinary geometry. Moving a test obstruction
invalidates the bake; the next run takes a fresh snapshot.

## 2. How Manhattan receives a heatmap on façades as well as roofs

A ground-plane projection cannot uniquely represent all city surfaces. Two
walls at the same X/Z coordinate, or a wall and its roof, would overwrite each
other. A screen-space accumulation also changes coverage as the camera moves.
Neither approach is used here.

The adapter converts each receiving mesh to a private, non-indexed geometry,
leaving its position coordinates local for display. A parallel copy of every
triangle is transformed into world space for sampling. The atlas builder then:

- Uses the longest triangle edge as a local 2D chart baseline and measures the
  perpendicular height. This yields approximately uniform world-space density.
- Shelf-packs a separate non-overlapping rectangle per triangle into one atlas.
  Density is reduced until the charts fit; if even minimum charts do not fit,
  the UI asks for a larger atlas rather than silently dropping surfaces.
- Assigns atlas UVs to the matching three vertices. They are stored in `uv1` so
  ordinary model UVs are not overwritten.
- Rasterizes world position and geometric normal at each texel's barycentric
  location. Edge samples are extended through the unused triangle rectangle
  and its one-pixel gutter, avoiding bilinear sampling of unrelated neighbours.
- Records true interior area weights only. Padding texels are computed for
  filtering but have zero statistical area.

A vertical wall is therefore just another independent chart. Its samples have
horizontal normals and their own visibility/energy history. A roof at the same
X/Z position occupies other atlas texels. There is no camera-dependent sampling
and no requirement that a model arrive with useful UVs.

For the city, all registered city mesh surfaces and the ground receive the
atlas. For the other demos, the receiver list is restricted to roof slopes,
the full terrain mesh, or panel front planes. The rest remain shadow casters.

### Atlas limitations

This is an intentionally small educational unwrap, not xatlas or a production
chart optimizer. Per-triangle rectangles consume padding and may have different
sampling phase along a shared edge. Very low atlas resolution can reveal seams
or lose a small shadow even when the shadow map is sharper. There are no mipmaps
because naive atlas mipmaps bleed across charts. Increase the atlas independently
of the directional shadow resolution.

Area-weighted reports describe **registered triangle area**, not a GIS-derived
visible-envelope area. In the city, hidden box bottoms and ground beneath a
building may still be registered, and overlapping surfaces are not boolean-
unioned. This can affect mean/area statistics, even though visible surface
heatmaps work independently. This limitation matters before using the demo for
building-envelope resource calculations. Per-texel sampling is approximate;
triangles that receive very few samples have coarse area quadrature.

## 3. The GPU pipeline per sun direction

### A. Rasterize an orthographic depth map

`makeLightFrame()` computes a fitted light basis from all caster/receiver bounds.
It directly produces a column-major matrix with WebGPU's depth range `[0,1]`.
The camera looks against the receiver-to-sun vector. At each sun sample, one
merged vertex buffer is drawn into a reusable `depth32float` texture with no
color attachment. Both sides of opaque triangles cast shadows, including thin
roof and panel geometry.

The integration deliberately uses hard depth visibility, not PCF soft shadows.
The normal Three.js preview has its own live shadow; it is not used for baking.

### B. Dispatch the accumulation compute shader

Only active atlas texels receive invocations. Each invocation:

1. Reads its fixed world position and geometric normal.
2. Rejects back-facing/edge-on direct light.
3. Projects into the current light map, then compares against the nearest depth.
4. Adds received energy, possible energy, sunlit hours, and possible-facing hours
   to a persistent `vec4<f32>` storage-buffer element.

A small world-space normal offset is configurable. Receiver-plane correction
also adjusts the reference depth to the actual nearest shadow pixel center.
This avoids compensating for sloped-surface acne with a large bias that would
make small obstruction shadows disappear. Low resolution, near-grazing light,
and excessive offset can still produce aliasing/leaks; this is raster shadow
visibility, not exact ray intersection.

One invocation owns a texel; successive passes are ordered on the device queue.
There is no floating-point atomic requirement, full-scene CPU ray loop, color
blending extension, or ping-pong accumulation texture. Standard f32 arithmetic
still incurs rounding on long runs; this is not a double-precision integrator.

### C. Batch without overwriting sample uniforms

Each batch contains up to 64 pairs of depth and compute passes (16 by default).
Every sun has its own immutable aligned slice in the uniform buffer, selected
with a dynamic offset. Uploading different sun values repeatedly to one address
before submitting a command buffer would incorrectly make all passes see the
last sun; this implementation explicitly avoids that bug.

One submission is followed by a queue-completion wait and a main-thread yield.
This bounds outstanding GPU work, permits camera/UI updates, makes uniform
reuse safe, and allows cancellation between batches. It intentionally does not
queue an entire annual calculation at once. Geometry is merged once per bake,
not redrawn through thousands of separate scene-object submissions per sun.

The date interval is never changed by batching. A one-minute annual request is
still a one-minute annual request. No performance claim is inferred from this
architecture without measurements on real devices and representative scenes.

## 4. Precisely what is accumulated

For texel p and sun sample t, let V be binary shadow visibility, n be the
geometric surface normal, s be the unit direction toward the sun, and dt be the
sample duration in hours. The user supplies constant direct-normal irradiance
DNI in W/m² (1000 by default).

```text
cosine = max(dot(n, s), 0)
possibleEnergy += DNI × cosine × dt / 1000
receivedEnergy += V × DNI × cosine × dt / 1000
possibleHours += dt                     when dot(n, s) > epsilon
sunlitHours += V × dt                    when dot(n, s) > epsilon
```

Energy is direct irradiation in kWh/m² of receiving surface. Time is hours.
It is not electrical production and does not include cloud weather, atmospheric
DNI variation, diffuse sky, interreflection, albedo, transparent leaves, or
solar disk penumbra. SkyMesh is a visual atmospheric sky, not the energy model.
The constant-DNI model meets the default direction/incidence weighting goal
without disguising an arbitrary clear-sky approximation as site-specific data.

The four channels make metric switching immediate. A future weather-aware
integrator can provide different energy weights per sample without changing
shadow visibility, atlas construction, or scene code. Annual f32 accumulated
sums should be convergence-checked for demanding quantitative applications.

## 5. Relative and absolute display are distinct operations

`access` normalizes each texel by its own possible energy/hours. It answers:
“How much of this orientation's available direct sunlight survived obstruction?”
It does not rank surface orientations by total usable energy. An unobstructed
north-facing wall can show 100% access during periods in which it has some small
potential. A surface with no potential is gray, not assigned a fictitious ratio.

`range` uses actual scene-wide minimum and maximum of the selected received
quantity. Flat nonzero data is uniformly red; all-zero data is uniformly blue.
It is not directly comparable to another independently normalized run.

`absolute` divides by a user-set ceiling in physical units, with a zero lower
bound. It does not silently autoscale. It is the appropriate view for comparing
scenes/ranges while preserving the same meaning of a color.

Two compute reductions calculate min/max and area-weighted sums. A colorization
compute pass writes an `rgba8unorm` texture. Normal interaction reads back only
a 48-byte summary (plus 16 bytes of optional timing). A full f32 readback exists
for diagnostics, not the temporal loop.

## 6. GPU texture sharing with Three.js

The application requests one GPUDevice and gives it to `WebGPURenderer`. The
engine uses that same device. `THREE.ExternalTexture` wraps the raw color atlas,
which a `MeshBasicNodeMaterial` samples using `uv1`. This uses the public external-
texture API instead of private renderer backend texture handles.

The texture contains the sRGB blue → cyan → green → yellow → red palette. It is
marked sRGB, sampled without vertical flipping, and displayed without tone
mapping. At opacity 100% the current preview sun cannot darken or shift the
accumulated colors. Lower opacity intentionally mixes in base color.

WebGPU-specific capabilities used for practical reasons are compute passes,
storage buffers, storage textures, explicit ordered raster/compute submission,
aligned dynamic uniform offsets, and optional `timestamp-query`. These remove
CPU accumulation and color-image readback. No f16, subgroups, atomics, or
experimental feature is required merely for novelty. Timestamp queries are
feature-detected and report the last batch, not a complete application benchmark.

## 7. Manhattan data provenance and the honest fallback

The startup scene is a procedural, rotated, Manhattan-inspired city. A bounded
request attempts to load NYC OTI Building Footprints for a small Midtown study
area near latitude 40.751, longitude −73.986. The service query requests up to
180 features. An imported WGS84 GeoJSON can contain up to 500 processed features.
The importer supports Polygon/MultiPolygon rings and holes.

Coordinates are projected into a local metre-scale tangent-plane approximation.
The official `HEIGHT_ROOF` / `HEIGHTROOF` values are treated as feet and converted
by 0.3048. Generic imported `height` is treated as metres. Missing heights become
15 m and are counted prominently in source metadata. For quantitative use,
verify the current service schema and height units against the source.

The geometry is a footprint extrusion. Ground elevation is flattened; terraces,
setbacks, actual roof slopes, detailed mechanical equipment, trees, and buildings
outside the requested subset are not reconstructed. Boundary buildings can
therefore receive too much sun. This is not a detailed Manhattan digital twin.

No verified NYC dataset could be downloaded in the creation environment. The
repository therefore includes the loader, provenance reporting, import route,
and a labelled fallback, but does not falsely claim the distributed procedural
city is real geospatial data. A failed live request leaves a usable scene.

Official source references:

- NYC metadata: https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_BuildingFootprints.md
- NYC service: https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/BUILDING_view/FeatureServer
- NYC terms: https://opendata.cityofnewyork.us/overview/#termsofuse

## 8. Adding a fifth demo

Return a descriptor with `id`, `root`, `extent`, `camera`, `target`, `draggables`,
`source`, and `description`. Mark receiver and caster meshes in `userData`.
Register the factory and a tab in the application. No integration shader,
normalization rule, or sun-sampling code needs to change.

For deformation or moving receivers, take a new snapshot and atlas. For material
transparency, instancing, or complex scene layers, extend the Three.js adapter
rather than adding demo-specific conditions inside the core engine.

## 9. Validation and limitations

The supplied Node numerical suite passed all 16 tests. The browser GPU path,
Three.js render output, live service response, and npm/Vite build were not run
end to end in the restricted creation environment. The project includes an
11-assertion analytic GPU self-test so those raw GPU stages can be checked on a
supported target browser. See `TESTING.md` for its exact scope and remaining
manual checks. No annual runtime or relative WebGL speedup has been claimed.

## Technical references

- WebGPURenderer: https://threejs.org/docs/pages/WebGPURenderer.html
- ExternalTexture: https://threejs.org/docs/pages/ExternalTexture.html
- SkyMesh: https://threejs.org/docs/pages/SkyMesh.html
- Pinned backend device option: https://github.com/mrdoob/three.js/blob/r186/src/renderers/webgpu/WebGPUBackend.js
- SunCalc 1.9 source: https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js
- WebGPU specification: https://www.w3.org/TR/webgpu/

### Palette color space at the integration boundary

The compute output is an `rgba8unorm` storage texture containing sRGB palette
values. Its external wrapper uses `NoColorSpace`; the node material explicitly
decodes the sample with `colorSpaceToWorking(..., SRGBColorSpace)`. Changing
texture metadata cannot turn an existing raw GPU texture into an sRGB hardware
view. This prevents an accidental second output encoding from washing out the
heatmap relative to the HTML legend. The quantitative totals remain f32 buffers,
independent of this 8-bit visualization.
