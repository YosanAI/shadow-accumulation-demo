# Verification record and target-device checklist

## Executed in the creation environment

`npm test` / `node --test tests/*.test.js`: **16/16 passed**.

The suite checks the upstream SunCalc solar-position reference, east/up/south
conversion and compass azimuth, inclusive UTC ranges, a 525,600-interval year,
a 527,040-interval leap year, input validation, midday sampling, night removal,
partial final-interval duration, polar night, cancellation during preparation,
orthographic WebGPU clip coordinates, near/far ordering, receiver-plane depth
correction, UV atlas non-overlap, finite padded positions, area preservation,
vertical façade receivers, degenerate geometry, and all three normalization modes.
The full-year test actually prepares the minute-resolution solar schedule; it
does not execute a GPU annual integration.

All application JavaScript modules and the CDN packager passed `node --check`.
`node scripts/build-cdn-html.mjs` generated the attached single HTML successfully.

## Not executed here

The environment restricts browser navigation and external downloads. Therefore:

- No Three.js/WebGPU scene has been rendered end to end here.
- The WGSL pipelines have not been compiled/executed on a GPU here.
- No GPU performance measurement or annual bake benchmark is reported.
- No successful NYC live-data response was obtained or packaged.
- `npm install` / the Vite offline bundling path was not executed.

CPU test success is not a claim that GPU drivers, shader compilation, current
external endpoints, or the complete browser application have been validated.

## Included GPU self-test

In the main application, expand **Resolution & engine settings** and press
**Run GPU self-test**. The test uses the same GPUDevice and raw engine with four
analytic points, a floor, an asymmetric overhead canopy, and two unequal-weight
samples in one batch. It checks 11 assertions covering occlusion versus
potential, visible energy/time, front-facing rules, distinct dynamic uniform
slices, and reduction min/max/area statistics. A failure is displayed rather
than hidden. It does not change the visible scene.

The same test is available without Three.js or CDN dependencies:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/tests/gpu-smoke.html`. This route needs a supported
WebGPU browser and secure origin, but no npm installation or internet. The engine
self-test does not validate the Three.js ExternalTexture material or sky path.

## Manual browser acceptance tests

1. Confirm the backend badge says WebGPU. Run the GPU self-test and inspect the
   browser console for shader/validation errors. No WebGL fallback is intended.
2. Generate a one-day Manhattan heatmap. Orbit around a building; roof and wall
   colors must remain attached to their surfaces and independent of the camera.
3. Change the preview time toward sunrise/sunset. Sky/sun/live shadows should
   change; an unlit accumulated heatmap at opacity 100% must not change.
4. Switch the metric and the three normalization modes without another bake.
   Absolute legend units must change correctly. No-potential relative texels
   should be gray, not NaN colors.
5. In residential mode, verify only roof slopes colorize. Move a ringed tree;
   stale results must hide. Regenerate and compare the affected roof shadow.
6. In terrain mode, inspect the valley shading and test progressively larger
   atlas/shadow resolutions. Self-shadowing must not depend on the view camera.
7. In panel mode, verify only the front planes colorize. Rotate the view beneath
   panels; backs and frames must retain their ordinary materials. Drag each type
   of obstruction and regenerate.
8. Start a one-minute annual request and cancel it. Progress should stop after
   the current bounded batch, not after an unbounded queue drains. A remaining
   partial result and exported report must clearly say it is incomplete.
9. Try polar night, equatorial latitudes, a leap-year range, and a final partial
   interval (7 minutes over a day). Check that units and counts remain sensible.
10. Attempt real NYC loading. Confirm the source badge says real footprints only
    after a successful import. Disconnect the service and verify the synthetic
    fallback remains explicit. Review missing-height counts and subset boundaries.

Compare 60-, 15-, 5-, and 1-minute runs and independently increase shadow/atlas
resolutions. Thin-obstruction errors are often spatial, not temporal. Check
convergence before interpreting the numerical report as a physical resource
estimate; the constant-DNI model and registered-area caveats still apply.

## Static UI layout check

The HTML/CSS were rendered with application scripts disabled at 1360 × 900 and
390 × 844. Both layouts had no horizontal page overflow; all four scene tabs and
five configuration sections were present. This checks layout only: the viewport
was intentionally empty and is not evidence of Three.js or WebGPU execution.

The supplied HTML's Blob/import-map loader was also exercised using its embedded
solar module only: it returned a finite solar position and unit direction. All
local import references were present. This did not load Three.js or run WebGPU.
