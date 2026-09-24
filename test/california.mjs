import './headless.mjs';
import {GPU} from '../src/engine/gpu/GPU.js';
import assert from 'node:assert/strict';
import {Scene,Vector3} from '../src/engine/index.js';
import {CaliforniaTerrain} from '../src/california/CaliforniaTerrain.js';
import {REGION,PLACES} from '../src/california/Region.js';
import {coastFieldAt} from '../src/california/CoastField.js';
import {IslandLife} from '../src/exploration/IslandLife.js';
import {safeAt,findSafeSpot} from '../src/exploration/Navigation.js';
import {VegSite,scatterVegetation,buildGrassMask} from '../src/world/vegetation/Scatter.js';
import {wrapHour,wheelHours,clockLabel} from '../src/california/TimeScrub.js';
const t=new CaliforniaTerrain();
assert.equal(t.size,8192);assert.equal(t.res,2048);
assert.ok(t.landArea>1.662e6*4);
const names=[...REGION.islands].sort((a,b)=>a.x-b.x).map(i=>i.id);
assert.deepEqual(names,['miguel','rosa','cruz','anacapa']);
assert.ok(coastFieldAt(0,1100)>400,'open channel separates mainland from islands');
assert.ok(coastFieldAt(-3500,2200)<0,'San Miguel footprint is land');
assert.ok(coastFieldAt(-2100,2600)<0,'Santa Rosa footprint is land');
assert.ok(coastFieldAt(-180,2360)<0,'Santa Cruz footprint is land');
assert.ok(coastFieldAt(1660,2357)<0,'Anacapa footprint is land');
console.log(`ok real shoreline arrangement; ${(t.landArea/1e6).toFixed(2)} km² land, ${(t.landArea/1.662e6).toFixed(1)}× Windward; fixed 2048² atlas`);
for(const p of PLACES){
 const pos=findSafeSpot(t,null,p.x,p.z,!!p.water,180);
 assert.ok(pos,`safe arrival at ${p.label}`);assert.ok(safeAt(t,null,pos.x,pos.z,!!p.water,p.water?5:.6));
}
const scene=new Scene(),life=new IslandLife(scene,t,null,{california:true});
assert.equal(life.residents.length,4);assert.equal(life.animals.length,32);
assert.equal(life.animals.filter(a=>a.kind==='fox').length,20);assert.equal(life.animals.filter(a=>a.kind==='seaLion').length,12);
for(const r of life.residents)assert.ok(safeAt(t,null,r.position.x,r.position.z));
for(const kind of ['fox','seaLion']){
 const animal=life.animals.find(a=>a.kind===kind),player={mode:'walk',position:animal.home.clone().add(new Vector3(10,0,10))};
 for(let i=0;i<600;i++)life.update(1/60,player);
 for(const a of life.animals)assert.ok(safeAt(t,null,a.group.position.x,a.group.position.z),`${a.kind} stays on walkable land`);
}
console.log('ok all ten destinations, four residents, 20 foxes and 12 sea lions remain on safe ground');
await GPU.init({headless:true});
const site=new VegSite(t),records=scatterVegetation(site),grass=buildGrassMask(site);
assert.ok(records.trees.length<=6500&&records.trees.length>300);assert.ok(records.shrubs.length<=14000&&records.shrubs.length>1000);
assert.equal(grass.res,1024);assert.equal(grass.data.byteLength,4194304);
for(const list of Object.values(records))for(const plant of list)assert.ok(t.heightAt(plant.x,plant.z)>1.5);
console.log('ok fixed vegetation budgets and 4 MB grass mask',Object.fromEntries(Object.entries(records).filter(([,v])=>v.length).map(([k,v])=>[k,v.length])));
assert.equal(wrapHour(25.5),1.5);assert.equal(wrapHour(-1),23);assert.equal(wrapHour(-49),23);
assert.equal(wheelHours({deltaX:180,deltaY:10,deltaMode:0}),1);
assert.equal(wheelHours({deltaX:0,deltaY:-90,deltaMode:0}),-.5);
assert.equal(wheelHours({deltaX:0,deltaY:1,deltaMode:1}),16/180);
assert.equal(clockLabel(23.5),'23:30');assert.equal(clockLabel(24),'00:00');
console.log('ok continuous trackpad axes, line units, reversed time and midnight wrapping');

await GPU.device.queue.onSubmittedWorkDone();
process.exit(0);
