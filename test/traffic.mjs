import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { CaliforniaTerrain } from '../src/california/CaliforniaTerrain.js';
import { Colliders } from '../src/world/Colliders.js';
import { Traffic } from '../src/exploration/Traffic.js';
import { safeAt } from '../src/exploration/Navigation.js';
const terrain=new CaliforniaTerrain(),colliders=new Colliders(),keys=new Set();
const player={position:new Vector3(53.6,terrain.heightAt(53.6,-77),-77),mode:'walk',velocity:new Vector3()};
const app={scene:new Scene(),terrainData:terrain,colliders,player,camera:new PerspectiveCamera(60,1,.1,15000),input:{enabled:true,down:k=>keys.has(k),consumeLook:()=>({x:0,y:0})},boatCtl:{driven:false},game:{cancelLine(){},rod:{equip(){}},toast(){}},exploration:{life:{residents:[]},plane:{group:{}},closeDialogue(){},toggleJournal(){}}};
const traffic=new Traffic(app);app.exploration.traffic=traffic;
assert.equal(traffic.cars.length,8);
assert.ok(traffic.route.length>4500);
for(let s=0;s<traffic.route.length;s+=4)for(const dir of [-1,1]){
 const p=traffic.route.sample(s,dir);assert.ok(traffic.groundSafe(p.x,p.z,1.5),`route is safe at ${s} m, direction ${dir}`);
}
console.log('ok continuous dry two-lane road',Math.round(traffic.route.length),'m');
const positions=traffic.cars.map(c=>c.position.clone());
const travel=Array(8).fill(0);
for(let i=0;i<60*600;i++){
 const before=traffic.cars.map(c=>c.position.clone());traffic.update(1/60);
 traffic.cars.forEach((c,j)=>travel[j]+=c.position.distanceTo(before[j]));
}
for(const c of traffic.cars)assert.ok(travel[c.id]>4000,`${c.name} keeps circulating: ${Math.round(travel[c.id])} m`);
for(const c of traffic.cars){assert.ok(c.position.distanceTo(positions[c.id])>20,`${c.name} patrols`);assert.ok(terrain.heightAt(c.position.x,c.position.z)>1.8);assert.ok(traffic.route.nearest(c.position.x,c.position.z).distance<6,`${c.name} keeps its lane`);}
console.log('ok all eight NPC cars patrol for ten simulated minutes without leaving the road');
const car=traffic.cars[0];player.position.copy(car.position).add(new Vector3(0,0,-4));car.speed=0;
assert.ok(traffic.enter(car));assert.equal(player.mode,'car');assert.equal(car.driver.position.x,-.4);assert.ok(car.playerDriver.visible);
keys.add('KeyW');for(let i=0;i<100;i++)traffic.update(1/60);keys.clear();assert.ok(car.speed>4,'player can accelerate');
keys.add('Space');for(let i=0;i<60;i++)traffic.update(1/60);keys.clear();assert.ok(car.speed<.01,'handbrake stops car');
assert.ok(traffic.exit());assert.equal(player.mode,'walk');assert.equal(traffic.active,null);assert.equal(car.driver.position.x,.4);assert.ok(safeAt(terrain,colliders,player.position.x,player.position.z),'exit stays on clear dry ground');
player.position.set(0,10,-900);const departed=car.position.clone();for(let i=0;i<60*8;i++)traffic.update(1/60);assert.ok(car.position.distanceTo(departed)>8,'NPC resumes after exit');
console.log('ok takeover, accelerator, brake, safe exit, NPC resumes');
// A stopped player and a building both block a car, including at high speed.
const spot=traffic.route.sample(200),h=terrain.heightAt(spot.x,spot.z);car.position.set(spot.x,h+.11,spot.z);car.heading=spot.heading;traffic.syncCollider(car);
player.position.set(spot.x+Math.sin(spot.heading)*4,h,spot.z+Math.cos(spot.heading)*4);
assert.equal(traffic.canMove(car,player.position.x,player.position.z,car.heading),false,'pedestrian protected');
player.position.set(0,10,-900);
colliders.addBox(new Vector3(spot.x+Math.sin(spot.heading)*6,h+1,spot.z+Math.cos(spot.heading)*6),new Vector3(2,2,1),spot.heading);
assert.equal(traffic.canMove(car,spot.x+Math.sin(spot.heading)*6,spot.z+Math.cos(spot.heading)*6,car.heading),false,'building collision');
assert.equal(traffic.groundSafe(0,1000),false,'cannot drive into channel');
// A path from an actual off-road shoulder reconnects without moving the car.
const point=traffic.route.sample(900,1,22);car.position.set(point.x,terrain.heightAt(point.x,point.z)+.11,point.z);traffic.syncCollider(car);
const before=car.position.clone(),near=traffic.route.nearest(point.x,point.z,true);car.rejoin=traffic.planReturn(car,near);
assert.ok(car.rejoin.length>0,'off-road return path exists');assert.equal(car.position.distanceTo(before),0,'planning never teleports');
car.wait=0;car.speed=0;car.heading=Math.atan2(car.rejoin[0].x-car.position.x,car.rejoin[0].z-car.position.z);
for(let i=0;i<60*30;i++)traffic.update(1/60);
assert.ok(traffic.route.nearest(car.position.x,car.position.z).distance<5,'NPC physically returns to road');
console.log('ok shore/building/pedestrian collision and off-road recovery');
player.position.copy(car.position).add(new Vector3(0,0,3));traffic.enter(car);
const wall=colliders.addBox(car.position.clone(),new Vector3(25,8,25));
assert.equal(traffic.exit(),false,'blocked exit refuses to place player inside geometry');assert.equal(traffic.active,car);assert.equal(player.mode,'car');
wall.solid=false;assert.equal(traffic.exit(),true);
console.log('ok blocked exit preserves ownership until a safe exit is possible');
