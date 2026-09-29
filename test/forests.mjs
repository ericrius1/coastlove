import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU } from '../src/engine/gpu/GPU.js';
import { BufferGeometry, BufferAttribute, Vector3 } from '../src/engine/index.js';
import { realTerrain, readGeo } from './real-data.mjs';
import { SETTLEMENTS } from '../src/california/Settlements.js';
import { COAST_VIEW } from '../src/california/ViewQuality.js';
import { loadCityGreenery, FOREST_PROFILES } from '../src/california/Vegetation.js';
import { VegSite, scatterVegetation } from '../src/world/vegetation/Scatter.js';
import { VegInstances, VegType } from '../src/world/vegetation/InstanceLOD.js';
import { buildUnderstory } from '../src/world/vegetation/PlantGeometry.js';
import { Vegetation } from '../src/world/Vegetation.js';

await GPU.init({ headless: true });
const terrain = await realTerrain();
await loadCityGreenery(readGeo);
const site = new VegSite(terrain), started = performance.now();
const records = scatterVegetation(site, 99);
assert.equal(records.trees.length, COAST_VIEW.maxTrees);
assert.equal(records.shrubs.length, COAST_VIEW.maxShrubs);
assert.ok(records.ferns.length > 2000 && records.ferns.length <= COAST_VIEW.maxFerns);
assert.deepEqual(scatterVegetation(site, 99), records, 'returning to a forest preserves every plant');
const around = (kind, place) => records[kind].filter(p => Math.hypot(p.x-place.x,p.z-place.z)<250);
for (const id of ['redwoods', 'big-sur', 'mendocino', 'trinidad']) {
 const place = SETTLEMENTS.find(p => p.id===id);
 assert.ok(around('trees',place).length>=110, `${id} has a substantial local canopy`);
 assert.ok(around('ferns',place).length>=100, `${id} has a layered forest floor`);
}
assert.ok(FOREST_PROFILES.north.height[0] > FOREST_PROFILES.south.height[1]);
for (const plant of [...records.trees, ...records.shrubs, ...records.ferns]) {
 assert.ok(terrain.heightAt(plant.x,plant.z)>1.5, 'rooted on dry land');
 assert.ok(Number.isFinite(plant.H) && plant.H>0, 'finite canopy/plant height');
}
for (const fern of records.ferns) {
 assert.ok(terrain.pathDistance(fern.x,fern.z)>=1.5, 'fern drifts keep roads open');
 assert.ok(!terrain.clearings.some(c => Math.hypot(c.x-fern.x,c.z-fern.z)<c.radius+1), 'story clearings stay approachable');
}
console.log(`ok stable regional groves, native fern floor, fixed budgets (${Math.round(performance.now()-started)} ms including repeat scatter and placement checks)`);

const record = (x,z,extra={}) => ({x,y:10,z,s:1,sy:1,yaw:0,la:0,l:1,H:12.5,seed:.4,...extra});
// These cells collided with the former 8192-wide numerical key. Its duplicate
// lookup could submit the same tree twice at distant California coordinates.
const regression = new VegInstances([record(0,0),record(32,-262144)]);
assert.equal(regression.cells.size,2,'statewide cells have unique keys');
const near = new Int32Array(2);
assert.equal(regression.queryNear(0,0,70,near),1);
assert.equal(regression.queryNear(32,-262144,70,near),1);

const rows=[];
for(let i=0;i<900;i++) rows.push(record((i%30)*450-6750,Math.floor(i/30)*450-6750));
for(let i=0;i<900;i++) rows.push(record(400000+(i%30)*450,-700000+Math.floor(i/30)*450));
const instances=new VegInstances(rows);instances.buildFarIndex();
const queried=new Int32Array(rows.length);
for(const [x,z,radius] of [[0,0,6200],[400000,-700000,12500],[-300000,-400000,12500]]) {
 const count=instances.queryFar(x,z,radius,queried);
 const expected=rows.map((p,i)=>[p,i]).filter(([p])=>(p.x-x)**2+(p.z-z)**2<=radius**2).map(([,i])=>i);
 assert.deepEqual([...queried.subarray(0,count)].sort((a,b)=>a-b),expected,'coarse streaming matches exact distance filtering');
}
const canopyProbe={canopy:{inst:new VegInstances([
 record(0,0),record(4,0),record(-4,0),record(0,4),record(0,-4),
 record(200,0,{l:-1}),record(202,0,{l:-1}),
])}};
assert.equal(Vegetation.prototype.sampleCanopy.call(canopyProbe,0,0),1,'dense woodland supplies full cover');
assert.equal(Vegetation.prototype.sampleCanopy.call(canopyProbe,200,0),0,'shrubs do not sound like tree canopy');
assert.equal(Vegetation.prototype.sampleCanopy.call(canopyProbe,400000,0),0,'distant forests do not affect local cover');
const geometry=()=>new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
const type=new VegType('test canopy',rows,{
 near:[{geometry:geometry(),material:{}}],
 far:{parts:[{geometry:geometry(),material:{}}],fade:[10000,12000]},
 nearRange:65,sortNear:true,sortFar:true,streamFar:true,farRefresh:128,
});
const camera=new Vector3(0,20,0);type.update(camera,true);
assert.ok(type.far.count>0 && type.far.count<=900,'GPU gets only the local region');
const before=type.far.iBuffer.version;
camera.x=50;type.update(camera,true);
assert.equal(type.far.iBuffer.version,before,'near refresh does not re-upload far vegetation');
camera.set(400000,20,-700000);type.update(camera,true);
assert.ok(type.far.count>0 && type.far.count<=900,'teleport refills the new regional forest');
for(let i=0;i<type.far.count;i++) assert.ok(type.far.iBuffer.array[i*8]>390000,'old region is absent after teleport');
camera.set(-300000,20,-400000);type.update(camera,true);
assert.equal(type.far.count,0,'empty ocean immediately releases visible instances');
const palms=new VegType('streamed palms',rows,{
 near:[{geometry:geometry(),material:{}}],
 far:{parts:[{geometry:geometry(),material:{}}],fade:[10000,12000],matrices:true},
 nearRange:120,sortFar:true,streamFar:true,farRefresh:128,
});
palms.update(new Vector3(400000,20,-700000),true);
for(let i=0;i<palms.far.count;i++) {
 assert.equal(palms.far.instanceMatrix.array[i*16+12],palms.far.iBuffer.array[i*8],'streamed palms retain their world transform');
 assert.equal(palms.far.instanceMatrix.array[i*16+14],palms.far.iBuffer.array[i*8+2]);
}
console.log('ok unique statewide grid keys, exact local impostor queries, stable uploads and cross-state teleport');

const allUnderstory=buildUnderstory(), fernOnly=buildUnderstory({youngPalms:false});
assert.equal(fernOnly.perKind.young,0);
assert.equal(fernOnly.triangles,fernOnly.perKind.fern);
assert.ok(fernOnly.triangles<allUnderstory.triangles/2,'fern floors skip unused tropical palm vertices');
console.log(`ok fern-only mesh: ${fernOnly.triangles} triangles versus ${allUnderstory.triangles} merged`);
await GPU.device.queue.onSubmittedWorkDone();
process.exit(0);
