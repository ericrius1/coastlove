import { Group, Mesh } from '../engine/index.js';
import { prepare, mergePrepared, roundedBox, cylinder, sphere, torus, mat4, rod } from '../world/boat/GeoKit.js';
import { Vector3 } from '../engine/index.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { standard } from '../materials/Materials.js';
import { LAYERS } from '../core/SceneRenderer.js';

export const CAR_NAMES=['Seafoam','Clementine','Sunbeam','Bluebird','Sage','Coral','Indigo','Sandpiper'];
const PAINT=[0x5a9488,0xb66f46,0xd4b96c,0x537b91,0x84967e,0xbc8273,0x536773,0xb5ab8b];
let shared;
function kit(){
 if(shared)return shared;
 const material=createPropMaterial('coastal roadsters',{clearcoat:true});
 material.underwaterLighting='lite';
 const build=(fn)=>{const parts=[];fn((g,c,m,rough=.5,metal=0,pattern=0)=>parts.push(prepare(g,{color:c,matrix:m,rough,metal,pattern})));return mergePrepared(parts);};
 const wheel=build(add=>{
  add(cylinder(.365,.365,.23,20),0x272c2a,mat4(0,0,0,0,0,Math.PI/2),.94);
  for(const side of [-1,1]){
   add(cylinder(.245,.245,.012,20),0xc1bca6,mat4(side*.122,0,0,0,0,Math.PI/2),.3,.7);
   add(cylinder(.095,.095,.03,12),0x646d69,mat4(side*.135,0,0,0,0,Math.PI/2),.28,.7);
   for(let k=0;k<5;k++){const a=k*Math.PI*2/5;add(sphere(.022,6,4),0x404a46,mat4(side*.143,Math.sin(a)*.16,Math.cos(a)*.16),.35,.5);}
  }
 });
 const drivers=PAINT.map((_,i)=>build(add=>{
  const skin=[0xc79975,0x865f48,0xc3936a,0xa16c4b][i%4],shirt=[0xdbbd79,0x447f7b,0xe1d4b2,0x8e6660][i%4];
  add(roundedBox(.40,.53,.26,.07),shirt,mat4(0,1.04,0),.93,0,2);
  add(sphere(1,12,10),skin,mat4(0,1.48,.02,0,0,0,.145,.19,.15),.86,0,3);
  add(sphere(1,12,8),0x3e3930,mat4(0,1.58,0,0,0,0,.15,.105,.153),.96);
  add(roundedBox(.28,.05,.03,.01),0x273a38,mat4(0,1.50,.158),.22,.25);
  for(const side of [-1,1]){
   add(rod(new Vector3(side*.22,1.22,0),new Vector3(side*.28,.98,.28),.065,8),shirt,mat4(),.95,0,2);
   add(rod(new Vector3(side*.28,.98,.28),new Vector3(side*.14,1.03,.49),.05,8),skin,mat4(),.87,0,3);
   add(sphere(.07,8,6),skin,mat4(side*.14,1.03,.49),.87,0,3);
   add(roundedBox(.16,.18,.57,.06),0x435466,mat4(side*.12,.65,.22),.94,0,2);
  }
 }));
 const bodies=PAINT.map((paint,i)=>build(add=>{
  const chrome=0xc8c9b8,cream=0xd8d1b4;
  add(roundedBox(1.72,.34,4.15,.14),paint,mat4(0,.63,0),.32,.35);
  add(roundedBox(1.61,.23,1.4,.12),paint,mat4(0,.89,1.27),.27,.35);
  add(roundedBox(1.61,.25,.92,.12),paint,mat4(0,.9,-1.55),.3,.35);
  for(const side of [-1,1]){
   add(roundedBox(.13,.36,1.72,.05),paint,mat4(side*.79,.96,-.16),.34,.3);
   add(roundedBox(.045,.055,3.7,.02),cream,mat4(side*.87,.72,0),.5,.25);
   add(roundedBox(.027,.035,.19,.01),chrome,mat4(side*.872,1.06,-.13),.24,.8);
   for(const z of [-1.32,1.32])add(torus(.39,.045,6,20,Math.PI),paint,mat4(side*.84,.40,z,0,Math.PI/2,0),.32,.35);
   add(roundedBox(.6,.17,.74,.07),0x9a7551,mat4(side*.4,.74,-.24),.85);
   add(roundedBox(.59,.51,.16,.07),0xb99a71,mat4(side*.4,1.00,-.59),.88);
   add(rod(new Vector3(side*.78,1.03,.69),new Vector3(side*.72,1.60,.43),.033,8),chrome,mat4(),.25,.8);
   add(sphere(1,10,6),chrome,mat4(side*.98,1.1,.61,0,0,0,.11,.065,.07),.23,.85);
   add(cylinder(.14,.14,.035,16),0xf4dca2,mat4(side*.57,.85,2.01,Math.PI/2),.25,.4);
   add(roundedBox(.21,.13,.04,.03),0x9d3429,mat4(side*.64,.82,-2.07),.3,.2);
  }
  add(roundedBox(1.45,.035,.04,.01),chrome,mat4(0,1.60,.43),.22,.8);
  add(roundedBox(1.47,.17,.22,.04),0x3d4841,mat4(0,1.06,.59),.72);
  add(torus(.18,.021,7,20),0x3a3d34,mat4(.4,1.14,.37,-.65),.7);
  add(roundedBox(1.13,.19,.035,.02),0x303d39,mat4(0,.64,2.082),.5,.5);
  for(const z of [-2.12,2.12]){
   add(roundedBox(1.76,.10,.12,.05),chrome,mat4(0,.47,z),.27,.85);
   add(roundedBox(.35,.13,.025,.015),cream,mat4(0,.65,z),.8);
  }
  if(i%3===1){ // a folded blanket behind the seats
   add(roundedBox(1.1,.14,.40,.05),0xc08f57,mat4(0,1.08,-1.26),.96,0,2);
  }
 }));
 const lamps=standard({color:0xffe3ad,emissive:0xffdb9a,emissiveIntensity:.08,roughness:.25});
 const lampGeometry=build(add=>{for(const side of [-1,1])add(cylinder(.125,.125,.04,16),0xffffff,mat4(side*.57,.85,2.04,Math.PI/2));});
 const glass=standard({color:0xa4c8bf,roughness:.08,transparent:true,opacity:.15,depthWrite:false,side:'double',velocityWeight:0});
 const windshield=roundedBox(1.44,.53,.012,.004);windshield.rotateX(-.43);
 shared={material,wheel,drivers,bodies,glass,windshield,lamps,lampGeometry};return shared;
}
export function makeCar(index){
 const k=kit(),group=new Group();group.name=CAR_NAMES[index%8];
 const body=new Mesh(k.bodies[index%8],k.material);body.castShadow=true;group.add(body);
 const glass=new Mesh(k.windshield,k.glass);glass.position.set(0,1.32,.565);glass.layers.set(LAYERS.TRANSPARENT);group.add(glass);
 const lamps=new Mesh(k.lampGeometry,k.lamps);group.add(lamps);
 const driver=new Mesh(k.drivers[index%8],k.material);driver.position.set(.4,0,-.18);driver.castShadow=true;group.add(driver);
 const playerDriver=new Mesh(k.drivers[3],k.material);playerDriver.position.set(.4,0,-.18);playerDriver.castShadow=true;playerDriver.visible=false;group.add(playerDriver);
 const wheels=[];
 for(const x of [-.87,.87])for(const z of [-1.32,1.32]){
  const pivot=new Group();pivot.position.set(x,.365,z);group.add(pivot);
  const mesh=new Mesh(k.wheel,k.material);mesh.castShadow=true;pivot.add(mesh);wheels.push({pivot,mesh,front:z>0});
 }
 return {group,body,driver,playerDriver,glass,wheels,lamps};
}
