# WebGPU Shadow Accumulation Lab

A vanilla JavaScript / Three.js experiment with one reusable, renderer-independent
WebGPU accumulator and four independent scene modules. This is a technical demo,
not a weather-calibrated irradiance or photovoltaic-production application.

## Quick test: one HTML

Open `webgpu-shadow-lab.html` from a local HTTP server in a WebGPU-capable browser:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/webgpu-shadow-lab.html`.

**This supplied single-HTML edition embeds all application code, CSS, and the
SunCalc solar-position subset, but loads pinned Three.js 0.186.1 modules from
jsDelivr. Internet is required for those modules.** It is not an offline bundle.
Some browsers permit WebGPU on `file://`, but localhost is more predictable.
Opening an HTML attachment inside a chat preview is not a WebGPU compatibility
test. A phone needs a secure context; a plain HTTP LAN-IP URL is usually not one.

If WebGPU is unavailable, the scenes render using WebGL 2 with a visible error
message. Scene selection, camera controls, preview sun, and object dragging remain
available. Accumulation and the GPU self-test require WebGPU and are disabled in
this preview mode; there is no WebGL computation fallback.

The initial Manhattan scene is the locally bundled model supplied in
`manhattan-block-viewer.html`: 573 buildings across 35 Midtown tax blocks,
including 527 historical survey meshes. It loads without a data request and is
not automatically replaced. The NYC footprint download and GeoJSON import
buttons remain available for explicitly selecting a different dataset.

Start with the default one-day, 15-minute bake. Expand **Resolution & engine
settings → Run GPU self-test** to run an analytic device-side check before a
large experiment. Then press **Generate accumulation**.

## Development repository

Use Node 20.19+ or 22.12+ (the engine range in `package.json` is authoritative).

```bash
npm install
npm run dev
```

Vite prints its local URL. No UI framework is used. To make a single HTML with
Three.js actually bundled for offline use:

```bash
npm run build
npm run preview
```

`dist/index.html` is postprocessed to inline Vite's JavaScript and CSS. The build
keeps intermediate assets for inspection; the HTML itself is intended to be
self-contained. The bundled scenes do not require a data request. The optional
live NYC footprint download still requires a network.

To rebuild the supplied CDN-based HTML without installing anything:

```bash
npm run build:cdn
```

## Four scenes

| Tab | Geometry | Heatmap receivers | Interaction |
|---|---|---|---|
| Manhattan | Supplied Midtown model: 573 buildings, historical survey roof details, streets, sidewalks, Bryant Park and plazas; minimum 2048² atlas | Building roofs and façades, streets, sidewalks and ground; buried bases excluded | Orbit, pan, zoom; optionally replace with downloaded/imported footprints |
| Residential | Supplied residential-area model: 18 houses with hip and gable roofs, curved streets, driveways, roof equipment, 24 trees | Roof slopes only | Drag subtly ringed trees |
| Terrain | Procedural mountain/valley heightfield, 128 × 128 cells (32,768 triangles); minimum 1024² surface atlas selected automatically | Entire terrain surface | Orbit to inspect self-shadowed valleys |
| Solar panels | 66 fixed panels in three concentric rings, varying azimuths | Front faces only | Drag two trees, a block, a cylinder, a wall, and a cone |

Every scene registers receivers and casters independently. A non-receiving
chimney, tree, panel frame, or wall still casts a shadow on receiving surfaces.
The procedural trees are opaque geometric canopies, not transmissive foliage.

## What the controls mean

**Coordinates and dates.** Latitude/longitude affect only solar position. There
are no map tiles, terrain downloads, or ground-texture changes. World coordinates
are right-handed: +X east, +Y up, −Z north. Date ranges are inclusive **UTC**
calendar dates; they do not silently use the operating system's time zone or
pretend to implement location-based civil time/DST. Both common and leap years
are supported, up to 366 days.

**Time resolution.** Midpoint samples, 1–120 minutes. The last interval receives
its actual duration. The sun's center must be above zero altitude. No hidden
representative-day substitution, annual extrapolation, or direction quantization
is used. A 365-day, one-minute request evaluates 525,600 calendar intervals before
night-time removal; it can be expensive. Progress, GPU batching, cancellation,
and progressive heatmap previews are included.

**Direct energy (default).** Constant user-specified DNI (default 1000 W/m²) ×
incidence cosine × binary sun visibility × elapsed hours / 1000. The output unit
is kWh/m² of receiving surface, not electrical kWh and not instantaneous W/m².
It is an idealized direct-beam experiment: no weather, diffuse sky irradiance,
reflections, foliage transmission, seasonal tree changes, or PV conversion.

**Sunlit time.** Counts visible front-facing hours with no DNI/cosine weighting.
Back-facing panel surfaces do not become sunlit merely because a ray toward the
sun is unobstructed. Both metrics are accumulated together, so switching the
measurement does not rerun the integration.

**Three color scales.**

- Relative / unshaded potential: received divided by the same surface's direct
  potential with external obstruction removed. Blue = 0%, red = 100%. Gray = no
  front-side potential. This measures obstruction loss; a badly oriented but
  unobstructed roof can be red.
- Relative / scene min–max: current minimum blue, current maximum red. Useful for
  visual exploration, but not comparable across differently normalized scenes.
- Absolute: zero blue and an explicitly set fixed ceiling red, in kWh/m² or
  hours. Use the same ceiling for meaningful comparisons. Values above it clip
  to red rather than changing the scale automatically.

**Preview sun.** Its date/time slider controls SkyMesh and instantaneous preview
shadows only. It cannot relight an accumulated heatmap: the heatmap uses an unlit
material. Opacity 100% preserves the palette; lower values mix in the base color.

Moving an obstruction or changing a bake input hides and marks the previous
result stale. Cancellation can leave a clearly labelled partial result. Scene
switching is disabled while a run is active; cancel first. Report JSON contains
source provenance, settings, units, atlas information, and completion status.

## Where to read the implementation

```text
src/
  core/                         # No Three.js or DOM dependency
    accumulation-engine.js      # Raw GPU resources, raster/compute batches, readbacks
    shaders.js                  # WGSL depth, integration, reduction, colorization
    surface-atlas.js             # World-space triangle charts, padded sample maps
    solar.js                    # Time ranges, midpoint schedules, sun coordinate conversion
    math.js                     # Orthographic light frames and reference normalization
    gpu-self-test.js             # Small analytic test using the actual GPU
  adapters/
    three-surfaces.js           # Three.js meshes → engine triangle inputs
    heatmap-layer.js             # ExternalTexture + uv1 + unlit node material
  demos/
    common.js                   # Small geometry helpers, opaque trees, drag hints
    manhattan.js
    manhattan-model.js          # Supplied Midtown geometry construction
    manhattan-data.js           # Bundled footprints, survey meshes, context and provenance
    residential.js
    residential-model.js        # Supplied residential scene construction
    residential-data.js         # Building footprints, roof skeletons, site layout
    terrain.js
    solar-panels.js
  ui/
    viewer.js                   # WebGPURenderer scene, SkyMesh, compass, camera
    drag-controller.js
    styles.css
  vendor/
    suncalc-position.js         # Pinned, attributed SunCalc 1.9.0 solar subset
  main.js                       # UI/application orchestration only
docs/
  ARCHITECTURE.md                # How the all-surface bake works; integration contract
  TESTING.md                     # Executed checks versus unverified browser work
```

See `docs/ARCHITECTURE.md` for the Manhattan/all-surfaces implementation report.

## Libraries

Three.js 0.186.1 supplies rendering, geometry, node materials, OrbitControls, and
SkyMesh. The SunCalc 1.9.0 solar-position subset is vendored and reformatted under
BSD-2-Clause; no SunCalc runtime request is made. Vite 7.1.7 is a development-only
server/bundler. No other runtime dependencies are used. Licenses and NYC data
attribution are in `THIRD_PARTY_NOTICES.md`.

The SunCalc version is deliberately pinned: this adapter expects its older
radians / south-to-west azimuth convention, and explicitly converts to compass
azimuth. Do not replace it with a different major API without updating tests.

## Verification status

`npm test`: **16 passing CPU/numerical tests**, including the upstream SunCalc
reference, coordinate conversion, leap years, a complete one-minute annual sun
schedule, clipping, receiver-plane depth correction, atlas packing, and metrics.
JavaScript syntax checks and the dependency-free single-HTML packager passed.

Browser navigation/network access is restricted in the creation environment.
The full Three.js/WebGPU renderer, raw GPU shaders, live NYC response, and npm/Vite
bundle were **not executed end to end here**. Do not interpret CPU tests as GPU
validation or a performance benchmark. The included analytic GPU self-test is
provided for a supported browser on your device; see `docs/TESTING.md`.
