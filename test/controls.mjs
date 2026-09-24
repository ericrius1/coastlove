import assert from 'node:assert/strict';
import { AtlasView } from '../src/california/AtlasView.js';
import { VehicleInteractions } from '../src/exploration/VehicleInteractions.js';
import { Seaplane } from '../src/exploration/Seaplane.js';
import { Scene, Vector3 } from '../src/engine/index.js';
import { Colliders } from '../src/world/Colliders.js';

const view=new AtlasView({x:-20000,z:-27900,size:36000});view.resize(1200,700);
for(const [x,z] of [[0,0],[-14000,-26000],[3000,-5000]]){const s=view.screen(x,z),w=view.world(s.x,s.y);assert.ok(Math.hypot(w.x-x,w.z-z)<1e-8);}
const before=view.world(710,210);view.zoomAt(2,710,210);const after=view.world(710,210);assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<1e-8,'zoom stays anchored beneath pointer');
const marker=view.screen(0,0);view.pan(30,-20);const moved=view.screen(0,0);assert.ok(Math.abs(moved.x-marker.x-30)<1e-8&&Math.abs(moved.y-marker.y+20)<1e-8,'map follows drag in screen space');
view.zoomAt(1e9);assert.equal(view.zoom,28);view.zoomAt(1e-9);assert.equal(view.zoom,1);view.focus(-1e6,1e6);assert.equal(view.cx,-20000);assert.equal(view.cz,8100);view.fit();assert.equal(view.cx,-2000);assert.equal(view.cz,-9900);
view.resize(300,800);assert.equal(view.scale,300/36000);assert.deepEqual(view.screen(view.cx,view.cz),{x:150,y:400});
console.log('ok map projection, pointer-anchored zoom, dragging, bounds, fit and narrow viewport');

const terrain={size:65536,heightAt:(x,z)=>z<0?10:-10},colliders=new Colliders(),plane=new Seaplane(new Scene(),terrain);
const boat={position:new Vector3(100,0,100),model:{boardPoint:new Vector3(0,1,0),exitPoints:[new Vector3(2,1,0)]},driven:false,throttle:0,throttleTarget:0,toWorld:(v,out)=>out.copy(v).add(boat.position)};
const player={mode:'walk',position:new Vector3(0,10,-100),velocity:new Vector3(),enterBoat(){this.mode='boat';boat.driven=true;},exitBoat(){this.mode='swim';boat.driven=false;this.position.copy(boat.position).add(new Vector3(2.2,-.2,0));}};
let car=null,entered=0,exited=0,toasts=[];
const traffic={active:null,nearest:()=>car,enter(c){entered++;this.active=c;player.mode='car';return true;},exit(){exited++;this.active=null;player.mode='walk';return true;}};
const app={terrainData:terrain,colliders,boatCtl:boat,player,freeCam:false,input:{consumeLook(){},consumeWheel(){}},game:{hud:{},toast:t=>toasts.push(t),cancelLine(){},rod:{equip(){}}}};
const e={app,plane,traffic,paused:false},vehicles=new VehicleInteractions(e);
assert.equal(vehicles.interact(),false,'E is left available for NPCs away from vehicles');
player.position.set(100,0,100);assert.equal(vehicles.nearby().kind,'boat');assert.equal(vehicles.interact(),true);assert.equal(player.mode,'boat','one press takes helm');boat.throttleTarget=1;vehicles.interact();assert.equal(player.mode,'swim','one press fully exits boat');assert.equal(boat.throttleTarget,0);vehicles.interact();assert.equal(player.mode,'boat','can board again from water');player.mode='deck';vehicles.interact();assert.equal(player.mode,'swim','E on deck also exits');
player.mode='walk';player.position.set(0,10,-100);car={position:new Vector3(1,10,-100),name:'Roadster'};vehicles.interact();assert.equal(entered,1);assert.equal(player.mode,'car');vehicles.interact();assert.equal(exited,1);assert.equal(player.mode,'walk');car=null;
e.paused=true;assert.equal(vehicles.interact(),false,'map blocks E');e.paused=false;
for(const water of [false,true]){
 player.mode='plane';boat.position.set(500,0,500);plane.launch(new Vector3(0,80,water?100:-100),.7);
 assert.equal(vehicles.interact(),true);assert.equal(player.mode,water?'swim':'walk');assert.equal(plane.parked,true);assert.equal(plane.speed,0);assert.ok(plane.group.visible);assert.ok(Math.hypot(player.position.x-plane.position.x,player.position.z-plane.position.z)>7);
 assert.equal(vehicles.nearby().kind,'plane','parked plane remains within re-entry reach');const heading=plane.heading;vehicles.interact();assert.equal(player.mode,'plane');assert.equal(plane.parked,false);assert.equal(plane.heading,heading);
}
const wall=colliders.addCylinder(0,-100,20,0,100);plane.launch(new Vector3(0,50,-100),0);player.mode='plane';const spot=vehicles.landing();assert.ok(spot&&Math.hypot(spot.position.x,spot.position.z+100)>25,'landing searches around blocked wings');
const blocked={resolveCapsule:()=>true,groundHeightAt:()=>1000};app.colliders=blocked;const original=plane.position.clone();assert.equal(vehicles.exitPlane(),false);assert.equal(player.mode,'plane');assert.ok(plane.position.distanceTo(original)<1e-8);assert.equal(plane.parked,false,'failed exit preserves aircraft state');
console.log('ok single-press car/boat/deck/plane entry and exit, water re-entry, map pause and safe landing failures');
