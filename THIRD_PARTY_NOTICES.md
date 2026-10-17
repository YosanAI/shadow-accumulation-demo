# Third-party code and data

## Three.js 0.186.1 — MIT

Three.js, OrbitControls and SkyMesh are provided by Three.js. The attached CDN
edition loads pinned modules from jsDelivr. `npm run build` bundles the installed
package. SkyMesh is the WebGPU/TSL sky implementation, not the GLSL `Sky` class.

Copyright © 2010–2026 Three.js authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Source: https://github.com/mrdoob/three.js

## SunCalc 1.9.0 solar-position subset — BSD-2-Clause

`src/vendor/suncalc-position.js` is the solar-position calculation from SunCalc
1.9.0, reformatted and renamed for readability. Moon, twilight, and rise/set
functions are not included. Original arithmetic and angular conventions are
preserved and checked against the upstream numerical reference.

Copyright (c) 2011-2015, Vladimir Agafonkin. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Source: https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js

## NYC building data — optional live request, not a bundled surveyed asset

Provider: New York City Office of Technology and Innovation (OTI).
Dataset: Building Footprints / BUILDING. Usage is governed by NYC Open Data
terms. Source attribution is shown in the viewport and exported reports.

Metadata: https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_BuildingFootprints.md
Terms: https://opendata.cityofnewyork.us/overview/#termsofuse
Service: https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/BUILDING_view/FeatureServer

The distribution does NOT contain a verified download of this dataset. The
live query is best-effort. If it fails, the procedural city is visibly labelled
"Manhattan-inspired fallback". It must not be described as real Manhattan data.

## Development dependency

Vite 7.1.7 is used only for local serving and bundling; its MIT license is
included in the installed package. There are no UI, map-tile, weather, physics,
charting, or machine-learning dependencies.
