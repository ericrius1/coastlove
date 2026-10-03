import assert from 'node:assert/strict';
import { Scene, Vector3 } from '../src/engine/index.js';
import { describeCar, CAR_FAMILIES } from '../src/exploration/CarVariants.js';
import { makeCar } from '../src/exploration/CarModel.js';
import { Traffic, trafficAppearanceSeed } from '../src/exploration/Traffic.js';

const signatures=new Set();
for(let seed=0;seed<4096;seed++){
 const a=describeCar(seed),b=describeCar(seed);
 assert.deepEqual(a,b,'seed fully reproduces appearance');
 signatures.add(JSON.stringify([a.family,a.paint,a.roof,a.trim,a.wheel,a.accessory,a.accent,a.stripe,a.interior,a.driver]));
}
assert.ok(signatures.size>4000,`at least 4,000 actual looks, got ${signatures.size}`);
assert.equal(new Set(Array.from({length:8},(_,i)=>describeCar(i).family)).size,CAR_FAMILIES.length);
assert.notEqual(describeCar(0).paint,describeCar(8).paint,'family repeats do not force the same paint');
for(const seed of [-81,'Venice/boardwalk',2**40,0.125])assert.deepEqual(describeCar(seed),describeCar(seed));
for(const seed of [NaN,Infinity,null,{}])assert.throws(()=>describeCar(seed));
console.log('ok',signatures.size,'distinct deterministic vehicle appearances');

let maxTriangles=0;
const visibleTriangles=group=>{
 let count=0;
 const visit=o=>{if(!o.visible)return;if(o.isMesh)count+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const child of o.children)visit(child);};
 visit(group);return count;
};
for(let seed=0;seed<32;seed++){
 const car=makeCar(seed);
 assert.equal(car.wheels.length,4);assert.equal(car.wheels.filter(w=>w.front).length,2);
 assert.equal(car.name||car.group.name,describeCar(seed).name);
 car.group.traverse(o=>{
  if(!o.isMesh)return;
  for(const name of ['position','normal'])assert.ok(o.geometry.attributes[name].array.every(Number.isFinite),`${seed}: finite ${name}`);
 });
 car.body.geometry.computeBoundingBox();
 const b=car.body.geometry.boundingBox;
 assert.ok(b.min.x>=-1.04&&b.max.x<=1.04&&b.min.z>=-2.24&&b.max.z<=2.24,`${seed}: body fits traffic collision footprint`);
 car.setDetail(0);const near=visibleTriangles(car.group);maxTriangles=Math.max(maxTriangles,near);
 car.setDetail(2);assert.ok(visibleTriangles(car.group)<near,'distance reduces geometry work');
 car.setDetail(0);assert.equal(visibleTriangles(car.group),near,'full detail can be restored');
 car.dispose();
}
assert.ok(maxTriangles<55000,`bounded close-up triangle count: ${maxTriangles}`);
console.log('ok all eight families, finite geometry, collision envelope, reversible LOD; max',maxTriangles,'triangles');

// Appearance recycling must never change the occupied/nearby car, and must
// preserve gameplay identity and placement when replacing distant geometry.
const traffic=Object.create(Traffic.prototype),scene=new Scene();
traffic.app={scene,player:{position:new Vector3()}};traffic.active=null;
const model=makeCar(0),car={...model,id:4,appearanceSeed:0,position:model.group.position,speed:9,heading:.7};
scene.add(car.group);car.position.set(10,2,20);
assert.equal(traffic.restyleCar(car,107),false,'nearby cars keep their identity');
car.position.set(10000,2,20000);car.group.rotation.y=.7;
traffic.active=car;assert.equal(traffic.restyleCar(car,107),false,'occupied car cannot be recycled');traffic.active=null;
const previous=car.group,position=car.position.clone(),quaternion=car.group.quaternion.clone();
assert.equal(traffic.restyleCar(car,107),true);
assert.equal(scene.children.length,1);assert.equal(previous.parent,null);
assert.deepEqual(car.position,position);assert.deepEqual(car.group.quaternion.toArray(),quaternion.toArray());
assert.equal(car.id,4);assert.equal(car.speed,9);assert.equal(car.heading,.7);
assert.equal(car.appearanceSeed,107);assert.equal(car.name,describeCar(107).name);
assert.equal(traffic.restyleCar(car,107),false,'same region does not rebuild appearance');
assert.equal(trafficAppearanceSeed(3,10020,20010),trafficAppearanceSeed(3,10040,20030));
assert.notEqual(trafficAppearanceSeed(3,10020,20010),trafficAppearanceSeed(3,18020,27010));
car.dispose();
console.log('ok regional variety recycles only distant unoccupied cars and preserves physics');
