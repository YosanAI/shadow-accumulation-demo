/** Plain WGSL kept separate from orchestration. All energy totals use f32. */
const sampleStruct = /* wgsl */`
struct SunSample {
  lightMatrix: mat4x4<f32>,
  sunAndEnergy: vec4<f32>,     // receiver→sun direction; DNI × dt / 1000
  rightAndWidth: vec4<f32>,   // light right vector; orthographic world width
  upAndHeight: vec4<f32>,     // light up vector; orthographic world height
  parameters: vec4<f32>,      // dt hours, normal offset m, depth tolerance, 1/depth-span
};
`;
export const shadowShader = /* wgsl */`${sampleStruct}
@group(0) @binding(0) var<uniform> sample: SunSample;
@vertex fn vertexMain(@location(0) worldPosition: vec3<f32>) -> @builtin(position) vec4<f32> {
  return sample.lightMatrix * vec4<f32>(worldPosition, 1.0);
}
`;

export const accumulationShader = /* wgsl */`${sampleStruct}
@group(0) @binding(0) var<uniform> sample: SunSample;
@group(1) @binding(0) var<storage, read> positions: array<vec4<f32>>;
@group(1) @binding(1) var<storage, read> normals: array<vec4<f32>>;
@group(1) @binding(2) var<storage, read> activeTexels: array<u32>;
@group(1) @binding(3) var<storage, read_write> accumulated: array<vec4<f32>>;
@group(1) @binding(4) var shadowDepth: texture_depth_2d;

@compute @workgroup_size(128)
fn accumulate(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (invocation.x >= arrayLength(&activeTexels)) { return; }
  let index = activeTexels[invocation.x];
  let normal = normals[index].xyz;
  let incidence = dot(normal, sample.sunAndEnergy.xyz);
  // One-sided receivers: a back-facing façade/panel has no direct potential.
  // "Sunlit time" removes cosine weighting, NOT this front-side visibility test.
  if (incidence <= 0.000001) { return; }
  let point = positions[index].xyz + normal * sample.parameters.y;
  let projected = sample.lightMatrix * vec4<f32>(point, 1.0);
  let uv = vec2<f32>(projected.x * 0.5 + 0.5, 0.5 - projected.y * 0.5);
  let dimensions = textureDimensions(shadowDepth);
  let pixel = clamp(vec2<i32>(uv * vec2<f32>(dimensions)), vec2<i32>(0), vec2<i32>(dimensions) - vec2<i32>(1));
  let nearestDepth = textureLoad(shadowDepth, pixel, 0);
  // Receiver-plane correction: compare at the sampled shadow pixel's centre,
  // not at the receiver's different XY position. This suppresses slope acne
  // without a large scene-wide bias that would erase small chimney shadows.
  let sampledUV = (vec2<f32>(pixel) + vec2<f32>(0.5)) / vec2<f32>(dimensions);
  let delta = sampledUV - uv;
  let worldDX = delta.x * sample.rightAndWidth.w;
  let worldDY = -delta.y * sample.upAndHeight.w;
  let planeCorrection = (dot(normal, sample.rightAndWidth.xyz) * worldDX + dot(normal, sample.upAndHeight.xyz) * worldDY)
    / incidence * sample.parameters.w;
  let visible = select(0.0, 1.0, projected.z + planeCorrection <= nearestDepth + sample.parameters.z);
  let possibleEnergy = incidence * sample.sunAndEnergy.w;
  let duration = sample.parameters.x;
  // One invocation owns each texel. Successive render/compute passes are ordered
  // by WebGPU. No float atomics, blend-extension dependency, or ping-pong sums.
  accumulated[index] += vec4<f32>(visible * possibleEnergy, possibleEnergy, visible * duration, duration);
}
`;

export const reductionShader = /* wgsl */`
struct Summary { ranges: vec4<f32>, sums: vec4<f32>, area: vec4<f32> };
@group(0) @binding(0) var<storage, read> values: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> normals: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> indices: array<u32>;
@group(0) @binding(3) var<storage, read_write> blocks: array<Summary>;
@group(0) @binding(4) var<storage, read_write> finalResult: array<Summary>;
var<workgroup> localRanges: array<vec4<f32>, 128>;
var<workgroup> localSums: array<vec4<f32>, 128>;
var<workgroup> localArea: array<f32, 128>;

fn combineRanges(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(min(a.x,b.x), max(a.y,b.y), min(a.z,b.z), max(a.w,b.w));
}
fn reduceWorkgroup(localIndex: u32) {
  workgroupBarrier();
  for (var stride = 64u; stride > 0u; stride /= 2u) {
    if (localIndex < stride) {
      localRanges[localIndex] = combineRanges(localRanges[localIndex], localRanges[localIndex + stride]);
      localSums[localIndex] += localSums[localIndex + stride];
      localArea[localIndex] += localArea[localIndex + stride];
    }
    workgroupBarrier();
  }
}
@compute @workgroup_size(128)
fn reduceAtlas(@builtin(global_invocation_id) global: vec3<u32>, @builtin(local_invocation_index) local: u32, @builtin(workgroup_id) group: vec3<u32>) {
  localRanges[local] = vec4<f32>(1e30, 0.0, 1e30, 0.0);
  localSums[local] = vec4<f32>(0.0);
  localArea[local] = 0.0;
  if (global.x < arrayLength(&indices)) {
    let index = indices[global.x];
    let area = normals[index].w;
    if (area > 0.0) {
      let value = values[index];
      localRanges[local] = vec4<f32>(value.x, value.x, value.z, value.z);
      localSums[local] = value * area;
      localArea[local] = area;
    }
  }
  reduceWorkgroup(local);
  if (local == 0u) { blocks[group.x] = Summary(localRanges[0], localSums[0], vec4<f32>(localArea[0],0.0,0.0,0.0)); }
}
@compute @workgroup_size(128)
fn reduceFinal(@builtin(local_invocation_index) local: u32) {
  var ranges = vec4<f32>(1e30,0.0,1e30,0.0);
  var sums = vec4<f32>(0.0);
  var area = 0.0;
  // Striding over intermediate blocks keeps this to two reductions, including
  // at 2048². Every invocation still participates in every barrier.
  for (var i = local; i < arrayLength(&blocks); i += 128u) {
    ranges = combineRanges(ranges, blocks[i].ranges);
    sums += blocks[i].sums;
    area += blocks[i].area.x;
  }
  localRanges[local] = ranges;
  localSums[local] = sums;
  localArea[local] = area;
  reduceWorkgroup(local);
  if (local == 0u) { finalResult[0] = Summary(localRanges[0],localSums[0],vec4<f32>(localArea[0],0.0,0.0,0.0)); }
}
`;

export const colorShader = /* wgsl */`
struct Summary { ranges: vec4<f32>, sums: vec4<f32>, area: vec4<f32> };
struct Display { options: vec4<f32> }; // metric 0=energy 1=hours; mode 0=access 1=range 2=absolute; ceiling; atlas size
@group(0) @binding(0) var<storage, read> values: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read> summary: array<Summary>;
@group(0) @binding(3) var<uniform> display: Display;
@group(0) @binding(4) var outputTexture: texture_storage_2d<rgba8unorm, write>;
fn palette(value: f32) -> vec3<f32> {
  // sRGB palette, mirrored exactly by the HTML legend.
  let stops = array<vec3<f32>, 5>(vec3<f32>(0.08,0.20,0.88),vec3<f32>(0.0,0.70,1.0),vec3<f32>(0.22,0.86,0.42),vec3<f32>(1.0,0.82,0.08),vec3<f32>(0.90,0.06,0.03));
  let scaled = clamp(value,0.0,1.0) * 4.0;
  let low = min(u32(scaled),3u);
  return mix(stops[low],stops[low+1u],scaled-f32(low));
}
@compute @workgroup_size(128)
fn colorize(@builtin(global_invocation_id) global: vec3<u32>) {
  if (global.x >= arrayLength(&indices)) { return; }
  let index = indices[global.x];
  let channels = values[index];
  let hours = display.options.x > 0.5;
  let received = select(channels.x,channels.z,hours);
  let possible = select(channels.y,channels.w,hours);
  let minimum = select(summary[0].ranges.x,summary[0].ranges.z,hours);
  let maximum = select(summary[0].ranges.y,summary[0].ranges.w,hours);
  var normalized = 0.0;
  var color = vec3<f32>(0.50);
  if (display.options.y < 0.5) {
    normalized = received / max(possible,1e-8);
  } else if (display.options.y < 1.5) {
    if (maximum-minimum > 1e-8) { normalized = (received-minimum)/(maximum-minimum); }
    else { normalized = select(0.0,1.0,maximum > 1e-8); }
  } else { normalized = received / max(display.options.z,1e-8); }
  if (display.options.y >= 0.5 || possible > 1e-8) { color = palette(normalized); }
  let size = u32(display.options.w);
  textureStore(outputTexture,vec2<i32>(i32(index%size),i32(index/size)),vec4<f32>(color,1.0));
}
`;
