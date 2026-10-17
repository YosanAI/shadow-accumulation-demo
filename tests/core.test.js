import test from 'node:test';
import assert from 'node:assert/strict';
import { getPosition } from '#lab/vendor/suncalc-position.js';
import { sunAt, buildSunSamples, validateSolarConfig } from '#lab/core/solar.js';
import { createSurfaceAtlas } from '#lab/core/surface-atlas.js';
import { makeLightFrame, transformPoint, boundsCorners, normalizeExposure, dot } from '#lab/core/math.js';
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} is not within ${tolerance} of ${expected}`);
const config={latitude:40.751,longitude:-73.986,startDate:'2026-06-21',endDate:'2026-06-21',intervalMinutes:15,dni:1000};

test('Vendored solar position matches the upstream SunCalc 1.9 reference values',()=>{
 const position=getPosition(new Date('2013-03-05T00:00:00Z'),50.5,30.5);
 close(position.azimuth,-2.5003175907168385,1e-10);close(position.altitude,-0.7000406838781611,1e-10);
});
test('World axes are east/up/south and azimuth is clockwise from true north',()=>{
 for(const timestamp of ['2026-06-21T12:00:00Z','2026-06-21T16:00:00Z','2026-06-21T22:00:00Z']) {
  const sun=sunAt(Date.parse(timestamp),40.751,-73.986);close(Math.hypot(...sun.direction),1);
  close(sun.direction[0],Math.sin(sun.azimuthNorth)*Math.cos(sun.altitude));
  close(sun.direction[2],-Math.cos(sun.azimuthNorth)*Math.cos(sun.altitude));
 }
 assert.ok(sunAt(Date.parse('2026-06-21T12:00:00Z'),40.751,-73.986).direction[0]>0);
 assert.ok(sunAt(Date.parse('2026-06-21T22:00:00Z'),40.751,-73.986).direction[0]<0);
});
test('Inclusive dates cover a full non-leap year at exactly one-minute intervals',()=>{
 const result=validateSolarConfig({...config,startDate:'2026-01-01',endDate:'2026-12-31',intervalMinutes:1});assert.equal(result.days,365);assert.equal(result.totalIntervals,525600);
});
test('Leap-year range contains 366 days and 527040 minute intervals',()=>{
 const result=validateSolarConfig({...config,startDate:'2028-01-01',endDate:'2028-12-31',intervalMinutes:1});assert.equal(result.days,366);assert.equal(result.totalIntervals,527040);
});
test('Bad ranges, dates, coordinates and intervals are rejected',()=>{
 for(const invalid of [{latitude:91},{longitude:-181},{intervalMinutes:0},{intervalMinutes:1.5},{endDate:'2026-02-30'},{startDate:'2027-01-01'},{endDate:'2028-01-01'},{dni:0}])assert.throws(()=>validateSolarConfig({...config,...invalid}));
});
test('Night is removed, midpoint times and DNI energy weights are retained',async()=>{
 const result=await buildSunSamples(config);assert.equal(result.totalIntervals,96);assert.ok(result.count>45 && result.count<70);
 for(let i=0;i<result.count;i++) {assert.ok(result.directionAndEnergy[i*4+1]>0);close(result.durations[i],0.25);close(result.directionAndEnergy[i*4+3],0.25);assert.equal(result.timestamps[i]%900000,450000);}
 close(result.daylightHours,result.count*0.25);
});
test('Partial last intervals use actual duration rather than a whole step',async()=>{
 const result=await buildSunSamples({...config,latitude:90,longitude:0,intervalMinutes:7});
 assert.equal(result.count,206);close(result.durations.at(-1),5/60);close(result.daylightHours,24,1e-9);
});
test('Polar night produces an empty sample schedule without NaN',async()=>{
 const result=await buildSunSamples({...config,latitude:90,startDate:'2026-12-21',endDate:'2026-12-21'});assert.equal(result.count,0);assert.equal(result.daylightHours,0);
});
test('Long preparation is cancellable',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(buildSunSamples(config,{signal:controller.signal}),{name:'AbortError'});
});
test('Every scene-bound corner maps inside WebGPU clip depth [0,1]',()=>{
 const bounds={min:[-100,-3,-60],max:[120,240,80]};
 for(const sun of [[0,1,0],[1,0.001,0],[-0.3,0.8,0.4]]) {
  const frame=makeLightFrame(bounds,sun);
  for(const corner of boundsCorners(bounds)) {const projected=transformPoint(frame.matrix,corner);assert.ok(Math.abs(projected[0])<=1.00001);assert.ok(Math.abs(projected[1])<=1.00001);assert.ok(projected[2]>=-1e-5&&projected[2]<=1.00001);}
  const p=[0,10,0],towardSun=p.map((value,i)=>value+frame.sun[i]);assert.ok(transformPoint(frame.matrix,towardSun)[2]<transformPoint(frame.matrix,p)[2]);
 }
});
test('Light-frame receiver-plane slope agrees with moving within the same plane',()=>{
 const bounds={min:[-20,-20,-20],max:[20,20,20]},frame=makeLightFrame(bounds,[0.2,0.8,0.5]);
 const normal=[0,1,0],point=[1,0,2],dx=0.3,dy=0.1;
 const alongSun=-(dot(normal,frame.right)*dx+dot(normal,frame.up)*dy)/dot(normal,frame.sun);
 const moved=point.map((v,i)=>v+frame.right[i]*dx+frame.up[i]*dy+frame.sun[i]*alongSun);
 close(moved[1],0);
 const correction=(dot(normal,frame.right)*dx+dot(normal,frame.up)*dy)/dot(normal,frame.sun)/frame.depth;
 close(transformPoint(frame.matrix,moved)[2]-transformPoint(frame.matrix,point)[2],correction,1e-7);
});
const square=new Float32Array([-1,0,-1,-1,0,1,1,0,1,-1,0,-1,1,0,1,1,0,-1]);
test('Atlas is non-overlapping, in-bounds, upward-facing and preserves total area',async()=>{
 const atlas=await createSurfaceAtlas([{id:'square',positions:square}],256);
 close(atlas.totalArea,4);assert.equal(atlas.triangleCount,2);
 assert.equal(new Set(atlas.activeIndices).size,atlas.activeIndices.length);
 for(const uv of atlas.uvSets.get('square'))assert.ok(uv>=0&&uv<=1);
 let area=0;
 for(const index of atlas.activeIndices) {
  const point=atlas.positions.subarray(index*4,index*4+3);assert.ok(Math.abs(point[0])<=1.000001&&Math.abs(point[2])<=1.000001);close(point[1],0);
  close(atlas.normals[index*4+1],1);area+=atlas.normals[index*4+3];
 }
 close(area,4,1e-5);
});
test('Atlas supports vertical façades, not just horizontal surfaces',async()=>{
 const wall=new Float32Array([0,0,0,0,2,0,3,2,0]);
 const atlas=await createSurfaceAtlas([{id:'wall',positions:wall}],256);
 close(atlas.totalArea,3);
 for(const index of atlas.activeIndices)close(atlas.positions[index*4+2],0);
});
test('Atlas rejects degenerate receivers and invalid sizes',async()=>{
 await assert.rejects(createSurfaceAtlas([{id:'bad',positions:new Float32Array(9)}],256));
 await assert.rejects(createSurfaceAtlas([{id:'square',positions:square}],123));
});
test('Relative potential, relative min-max and fixed absolute normalization differ correctly',()=>{
 close(normalizeExposure(4,8,'access',2,10,20),0.5);
 close(normalizeExposure(4,8,'range',2,10,20),0.25);
 close(normalizeExposure(4,8,'absolute',2,10,20),0.2);
 assert.equal(normalizeExposure(0,0,'access',0,0,8),null);
 assert.equal(normalizeExposure(5,5,'range',5,5,8),1);
 assert.equal(normalizeExposure(0,0,'range',0,0,8),0);
 assert.equal(normalizeExposure(100,100,'absolute',0,100,8),1);
});
test('Full-year minute preparation does not silently reduce time resolution',async()=>{
 const result=await buildSunSamples({...config,startDate:'2026-01-01',endDate:'2026-12-31',intervalMinutes:1});
 assert.equal(result.totalIntervals,525600);assert.ok(result.count>240000&&result.count<290000);
 close(result.durations[0],1/60);close(result.directionAndEnergy[3],1/60);
});
