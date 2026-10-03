import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3, Euler } from '../src/engine/index.js';
import { makeCar, ROVER_SEED } from '../src/exploration/CarModel.js';
import { Traffic } from '../src/exploration/Traffic.js';
import { Colliders } from '../src/world/Colliders.js';

const car=makeCar();
assert.equal(car.variant.seed,ROVER_SEED);assert.equal(car.variant.paint,0xb4ced1);
assert.equal(makeCar(0).variant.family,'roadster','numeric traffic seeds retain their established appearance');
assert.equal(car.wheels.length,4);assert.ok(car.cockpit&&car.steering&&car.speedNeedle);
let fullTriangles=0;
car.group.traverse(o=>{if(!o.isMesh)return;fullTriangles+=o.geometry.index.count/3;for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite),'all geometry attributes stay finite');});
assert.ok(fullTriangles<65000,`bounded detail: ${fullTriangles} triangles`);
const fullWheel=car.wheels[0].mesh.geometry;car.setDetail(2);
assert.ok(car.wheels[0].mesh.geometry.index.count<fullWheel.index.count);
car.setDetail(0);assert.equal(car.wheels[0].mesh.geometry,fullWheel);
car.setFlight(1,2);assert.ok(car.wheels.every(w=>Math.abs(w.pivot.position.y-.64)<1e-6));car.setFlight(0);
assert.ok(car.wheels.every(w=>Math.abs(w.pivot.position.y-.49)<1e-6),'flight returns the large tires to their correct ride height');
car.setDriving(.3,22);assert.ok(Math.abs(car.steering.rotation.z)>.5);assert.ok(car.speedNeedle.rotation.z<2.3);

const keys=new Set(),terrain={size:2e6,heightAt:()=>10,groundHeight:()=>10};
const route={nearest:(x,z)=>({s:z,distance:Math.abs(x)}),sample:s=>({x:0,z:s,y:10,heading:0,s})};
let look={x:0,y:0};
const app={scene:new Scene(),terrainData:terrain,colliders:new Colliders(),camera:new PerspectiveCamera(62,1.5,.1,15000),
 player:{mode:'walk',position:new Vector3(0,10,3),velocity:new Vector3()},
 input:{enabled:true,rightDown:false,down:k=>keys.has(k),consumeLook(){const result=look;look={x:0,y:0};return result;}},
 game:{cancelLine(){},rod:{equip(){}},toast(){}},boatCtl:{driven:false},
 exploration:{plane:{group:{}},closeDialogue(){},toggleJournal(){},vehicles:{available:true}}};
const t=Object.create(Traffic.prototype);
Object.assign(t,{app,terrain,route,cars:[car],active:null,time:0,cameraPosition:new Vector3(),cameraTarget:new Vector3(),cameraMode:'exterior',orbit:0,orbitPitch:.32,populate(){},planReturn:()=>[]});
Object.assign(car,{id:0,position:car.group.position,route,appearanceSeed:ROVER_SEED,heading:0,speed:0,steer:0,pitch:0,roll:0,spin:0,s:0,direction:1});
car.position.set(0,10.11,0);car.collider=app.colliders.addBox(car.position.clone(),new Vector3(car.collisionRadius,1.2,2.48),0,{tag:'traffic:0'});app.scene.add(car.group);
assert.ok(t.enter(car));assert.ok(car.playerDriver.visible);assert.ok(t.toggleCamera());assert.equal(t.cameraMode,'driver');assert.equal(car.playerDriver.visible,false,'camera does not intersect the player avatar');
for(const [x,z,heading,pitch,roll]of[[0,0,0,0,0],[128000,412000,2.1,.25,-.15]]){
 car.position.set(x,10.11,z);car.heading=heading;car.group.quaternion.setFromEuler(new Euler(pitch,heading,roll,'YXZ'));
 t.updateCamera(1/60,car,app.input);
 const expected=car.cockpit.clone().applyQuaternion(car.group.quaternion).add(car.position);
 assert.ok(app.camera.position.distanceTo(expected)<1e-8,'driver camera stays in its seat through turns, bank and statewide travel');
 const forward=new Vector3();app.camera.getWorldDirection(forward);
 const local=forward.applyQuaternion(car.group.quaternion.clone().invert());assert.ok(local.z>.9&&local.y<0,'view faces through the windshield with a small downward pitch');
}
for(const guard of['captured','disabled','freeCam','menu']){
 app.input.captured=guard==='captured';app.input.enabled=guard!=='disabled';app.freeCam=guard==='freeCam';app.exploration.vehicles.available=guard!=='menu';
 assert.equal(t.toggleCamera(),false,`${guard} owns its input`);assert.equal(t.cameraMode,'driver');
}
app.input.captured=false;app.input.enabled=true;app.freeCam=false;app.exploration.vehicles.available=true;
car.position.set(0,10.11,0);car.heading=car.pitch=car.roll=0;car.group.quaternion.identity();
look={x:100,y:30};app.input.rightDown=true;t.driveArcade(car,1/60,app.input);
assert.ok(t.cockpitYaw<0);assert.equal(t.trackpadSteer,0,'looking around cannot steer the car');
assert.ok(t.toggleCamera());assert.ok(car.playerDriver.visible);t.updateCamera(1/60,car,app.input);
assert.ok(app.camera.position.distanceTo(car.position)>6,'exterior camera returns behind the entire vehicle');
app.player.position.set(30000,10,0);assert.equal(t.restyleCar(car,8274),false,'regional recycling preserves the default reference vehicle');
assert.equal(car.variant.seed,ROVER_SEED);
app.input.rightDown=false;t.release();assert.equal(car.playerDriver.visible,false);assert.equal(car.driver.position.x,car.driverX);
app.player.mode='walk';app.player.position.set(25,10,40);assert.ok(await t.summon());assert.equal(t.active,car);assert.equal(car.variant.seed,ROVER_SEED,'Drive recalls the reference model');
assert.ok(t.toggleCamera());assert.ok(t.exit());assert.equal(t.active,null);assert.equal(car.playerDriver.visible,false,'exiting cockpit restores normal NPC ownership');
car.dispose();car.dispose();
console.log('ok reference rover geometry, LOD, flight ride height, animated controls, seat cameras, input ownership, regional identity, summon and exit');
