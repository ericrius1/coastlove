import assert from 'node:assert/strict';
import {realTerrain,readGeo} from './real-data.mjs';
import {GEO,project,unproject,INLAND} from '../src/california/Geography.js';
import {GG_A,GG_B,goldenGateHeight} from '../src/california/GoldenGate.js';
import {NEIGHBORHOODS} from '../src/california/Neighborhoods.js';
import {stepArcadeCar} from '../src/exploration/ArcadeCar.js';
import {Vector3} from '../src/engine/index.js';
const t=await realTerrain();
assert.equal(GEO.scale,1);assert.equal(INLAND,16093.44);assert.equal(t.size,2097152);
for(const [lon,lat]of[[-124.2,42],[-117.12,32.54],[-122.42,37.78],[-118.25,34.05]]){
 const p=project(lon,lat),q=unproject(p.x,p.z);assert.ok(Math.abs(q.lon-lon)<1e-8&&Math.abs(q.lat-lat)<1e-8);
 const north=project(lon,lat+.01);assert.ok(Math.hypot(north.x-p.x,north.z-p.z)>1100&&Math.hypot(north.x-p.x,north.z-p.z)<1120,'one degree fraction retains real metres');
}
for(const id of['sf','la']){
 const roads=t.streets.routes.filter(r=>r.city===id);assert.ok(roads.length>10000);assert.ok(roads.some(r=>r.name.includes(id==='sf'?'California Street':'Sunset Boulevard')));
 const count=roads.filter(r=>r.width>=5.5&&r.width<=30).length;assert.ok(count/roads.length>.99,'metre street widths');
 for(const r of roads.slice(0,1000)){assert.equal(r.sample(-5,1,0).s,0);assert.ok(r.sample(r.length+500,1,0).s<r.length);}
 const index=await readGeo(`${id}/index.json`);assert.ok(index.buildings>50000,`${id} full building data must be present, never placeholder`);
}
for(const place of NEIGHBORHOODS){const near=t.streets.nearest(place.x,place.z,700);if(place.id==='la-topanga')continue;assert.ok(near&&near.distance<350,`${place.label} has real street access`);assert.ok(t.heightAt(near.x,near.z)>0);}
const midpoint={x:(GG_A.x+GG_B.x)/2,z:(GG_A.z+GG_B.z)/2};assert.equal(goldenGateHeight(midpoint.x,midpoint.z,0),75);assert.ok(t.groundHeight(midpoint.x+4,midpoint.z)>60,'bridge deck is a driving surface');assert.ok(t.heightAt(midpoint.x,midpoint.z)<10,'bridge does not raise the ocean floor');
for(const r of t.streets.routes.filter(r=>r.name==='Golden Gate Bridge')){
 let previous=null;
 for(let s=0;s<r.length;s+=2){const p=r.sample(s,1,0),h=t.groundHeight(p.x,p.z);if(previous!==null)assert.ok(Math.abs(h-previous)<.75,`${r.id}: bridge approaches have no vertical steps`);previous=h;}
}
console.log('ok metre projection, real street topology, data completeness, neighborhoods and bridge driving surface');
