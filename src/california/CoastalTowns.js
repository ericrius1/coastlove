import { Group, Mesh, InstancedMesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, box, cylinder, sphere, torus, rod, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { mulberry32 } from '../util/Noise.js';
import { SETTLEMENTS } from './Settlements.js';
import { project } from './Geography.js';

const PALETTES={south:[0xe6c79d,0xdda889,0xcdd4bd,0xdfd4b6],central:[0xc8bc9d,0xabbbba,0xd3a78f,0xc7cfbb],bay:[0xced1b5,0xc0c9d3,0xd8aba4,0xdcc58f],north:[0xb7c5bc,0xd3d4c6,0xbca997,0xabbaba],islands:[0xf0d7ae,0xdfb896,0xc5d6c5,0xddd3b8]};
function building(style,variant){
 const parts=[],add=(g,c,m,pattern=0)=>parts.push(prepare(g,{color:c,matrix:m,rough:.82,pattern}));
 const northern=style==='north'||style==='bay',color=PALETTES[style][variant%4],height=variant>=4?18+(variant-4)*10:5.5+variant*1.4;
 add(box(1,height,1),color,mat4(0,height/2,0));
 add(box(1.07,.3,1.07),0xe5dcc3,mat4(0,height+.1,0));
 if(variant<4){
  if(northern){for(const side of [-1,1])add(box(.69,.12,1.15),0x666e67,mat4(side*.27,height+.4,0,0,0,-side*.48));}
  else add(box(1.08,.5,1.08),0xb16c49,mat4(0,height+.3,0));
 }
 for(let y=2.1;y<height-.3;y+=2.7)for(const side of [-1,1]){
  for(const x of [-.32,0,.32]){
   const g=prepare(box(.17,1.15,.022),{color:0x3c686b,rough:.28,matrix:mat4(x,y,side*.512)});
   for(let k=3;k<g.attributes.aux.array.length;k+=4)g.attributes.aux.array[k]=1;
   parts.push(g);
  }
  const g=prepare(box(.022,1.15,.66),{color:0x416d70,rough:.3,matrix:mat4(side*.512,y,0)});
  for(let k=3;k<g.attributes.aux.array.length;k+=4)g.attributes.aux.array[k]=1;parts.push(g);
 }
 add(box(.19,2.1,.035),0x435f58,mat4(0,1.05,.525));
 if(variant<4){
  add(box(.76,.10,.25),[0x729586,0xb87952,0xcbad65,0x8a9caa][variant%4],mat4(0,2.65,.61));
  for(const x of [-.38,.38])add(box(.025,2.5,.025),0xe0d3b2,mat4(x,1.25,.72));
  if(northern)add(cylinder(0,.30,1.4,4),0x62756c,mat4(.23,height+1,0,0,Math.PI/4));
 }
 return {geometry:mergePrepared(parts),height};
}
function treeGeometry(north){
 const parts=[prepare(cylinder(north?.2:.10,north?.55:.24,north?27:10,9),{color:north?0x80634d:0x938367,rough:.95,matrix:mat4(0,north?13.5:5,0),pattern:1})];
 if(north){
  const rng=mulberry32(1853);
  // Irregular branch sprays break up the redwood silhouette. Leave the lower
  // trunk exposed and taper the crown without stacked, solid cone layers.
  for(let i=0;i<42;i++){
   const u=i/42,a=i*2.39996,h=10+u*23,r=(1-u)*4.1+.35;
   const x=Math.cos(a)*r,z=Math.sin(a)*r;
   parts.push(prepare(rod(new Vector3(0,h-.7,0),new Vector3(x,h,z),.10*(1-u)+.025,5),{color:0x76614c,rough:1}));
   parts.push(prepare(sphere(1,7,5),{color:[0x365845,0x466b4f,0x52765a,0x3d634b][i%4],rough:1,matrix:mat4(x,h,z,.12,a,.18,(1-u)*1.9+.4,.8+rng()*.8,(1-u)*2.2+.4)}));
  }
 }
 else for(let i=0;i<7;i++){const a=i/7*Math.PI*2;parts.push(prepare(sphere(1,8,5),{color:i%2?0x6d8952:0x7a945b,rough:.95,matrix:mat4(Math.sin(a)*1.7,10-Math.abs(Math.cos(a))*.3,Math.cos(a)*1.7,0,a,-.2,.6,.25,2.3)}));}
 return mergePrepared(parts);
}
export class CoastalTowns {
 constructor(app){
  this.app=app;this.groups=[];this.landmarks=[];this.time=0;this.buildingCount=0;
  this.material=createPropMaterial('California town façades',{uniforms:{townNight:['f32',0]}});
  this.material.underwaterLighting='none';
  this.material.surface+='\ns.emissive += vec3f(1.0,0.62,0.25) * in.vs.vAux.w * mat.townNight * 0.8;\n';
  this.propMaterial=createPropMaterial('California plazas');this.propMaterial.underwaterLighting='none';
  const trees=[treeGeometry(false),treeGeometry(true)],prototypes=new Map();
  for(let index=0;index<SETTLEMENTS.length;index++){
   const town=SETTLEMENTS[index];if(['san-francisco','los-angeles'].includes(town.id))continue;const rng=mulberry32(7100+index),group=new Group(),props=[],boxes=[];
   group.name=town.label;group.position.set(town.x,0,town.z);app.scene.add(group);
   const add=(g,c,m,pattern=0)=>props.push(prepare(g,{color:c,matrix:m,rough:.87,pattern}));
   const spacing=town.major?23:20,extent=town.radius*.89,placements=Array.from({length:8},()=>[]);
   for(let z=-extent;z<=extent;z+=spacing)for(let x=-extent;x<=extent;x+=spacing){
    const wx=town.x+x,wz=town.z+z,y=app.terrainData.heightAt(wx,wz);
    if(Math.hypot(x,z)>extent||Math.hypot(x,z)<30||Math.abs(x)<9||Math.abs(z)<9||app.terrainData.pathDistance(wx,wz)<11||y<3)continue;
    if(!town.major&&rng()<.35)continue;
    const tower=town.major&&Math.hypot(x,z)<extent*.67&&rng()<.40;
    const v=tower?4+Math.floor(rng()*4):Math.floor(rng()*4),w=tower?12+rng()*4:9+rng()*4,d=9+rng()*6;
    placements[v].push({x,y,z,w,d});
   }
   for(let v=0;v<8;v++){
    const list=placements[v];if(!list.length)continue;
    const key=`${town.region}:${v}`;if(!prototypes.has(key))prototypes.set(key,building(town.region,v));
    const kit=prototypes.get(key),mesh=new InstancedMesh(kit.geometry,this.material,list.length);
    for(const [i,p]of list.entries()){
     mesh.setMatrixAt(i,mat4(p.x,p.y-.12,p.z,0,0,0,p.w,1,p.d));
     boxes.push({x:p.x+town.x,z:p.z+town.z,y:p.y+kit.height/2,half:new Vector3(p.w/2,kit.height/2,p.d/2)});
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;group.add(mesh);this.buildingCount+=list.length;
   }
   const y=app.terrainData.heightAt(town.x,town.z);
   for(const axis of [0,1])add(box(axis?9:town.radius*1.55,.13,axis?town.radius*1.55:9),0xc9c1a6,mat4(0,y+.08,0));
   add(cylinder(14,14,.12,48),0xc8b99b,mat4(0,y+.15,0));
   add(cylinder(4.1,4.6,.65,32),0xaeb7a5,mat4(0,y+.35,-12));add(cylinder(3.9,3.9,.05,32),0x4d9195,mat4(0,y+.70,-12));add(cylinder(.25,.55,2.1,16),0xd1cdb5,mat4(0,y+1.4,-12));
   for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2,x=Math.cos(a)*21,z=Math.sin(a)*21,gy=app.terrainData.heightAt(town.x+x,town.z+z);
    if(i%3===0){add(box(3,.18,.85),0xa38e67,mat4(x,gy+.55,z,0,-a),6);for(const side of [-1,1])add(box(.12,.55,.7),0x50655a,mat4(x+side,gy+.28,z));}
    else {add(cylinder(.7,1,.8,10),0xb78960,mat4(x,gy+.4,z));add(sphere(1,9,6),i%2?0x819966:0xab89a5,mat4(x,gy+.9,z,0,0,0,1,.75,1));}
   }
   for(let i=-3;i<=3;i++)for(const side of [-1,1]){
    const x=i*spacing,z=side*8,gy=app.terrainData.heightAt(town.x+x,town.z+z);
    add(cylinder(.045,.07,3.4,6),0x54655b,mat4(x,gy+1.7,z));add(sphere(.18,8,6),0xf0dba9,mat4(x,gy+3.45,z));
   }
   for(let i=0;i<5;i++){
    const x=28+i*8,z=18,gy=app.terrainData.heightAt(town.x+x,town.z+z);
    add(cylinder(.03,.03,2.6,6),0xa99471,mat4(x,gy+1.3,z));add(cylinder(.12,1.9,.65,8),i%2?0xd4b886:0xa36f51,mat4(x,gy+2.55,z));
   }
   const mesh=new Mesh(mergePrepared(props),this.propMaterial);mesh.castShadow=true;group.add(mesh);
   const north=town.region==='north',forest=north&&['forest','reserve'].includes(town.style),count=forest?150:town.major?70:35;
   const grove=new InstancedMesh(trees[north?1:0],this.propMaterial,count);let n=0;
   for(let i=0;i<count*4&&n<count;i++){
    const a=rng()*6.283,r=(forest?55:30)+Math.sqrt(rng())*town.radius*1.8,x=Math.sin(a)*r,z=Math.cos(a)*r;
    if(Math.abs(x)<12||Math.abs(z)<12||boxes.some(b=>Math.hypot(b.x-town.x-x,b.z-town.z-z)<13)||app.terrainData.pathDistance(town.x+x,town.z+z)<8)continue;
    const h=app.terrainData.heightAt(town.x+x,town.z+z);if(h<2)continue;
    const s=.7+rng()*.5;grove.setMatrixAt(n++,mat4(x,h-.15,z,0,rng()*6.28,0,s,s,s));
   }
   grove.count=n;grove.instanceMatrix.needsUpdate=true;grove.castShadow=true;group.add(grove);
   this.groups.push({town,group,boxes});
   if(['boardwalk','surf'].includes(town.style)||town.id==='los-angeles')this.wheel(town);
   if(town.style==='mission'||town.id==='san-diego')this.arcade(town);
   if(town.id==='eureka')this.victorian(town);
  if(town.id==='catalina')this.pavilion(town);
   if(town.major||town.style==='arts')this.garden(town);
   if(town.id==='san-jose')this.campus(town);
   if(town.id==='san-diego')this.bellTower(town);
  }
  this.morroRock();
  // Fixed nearby collider pool keeps walking/driving cost independent of city count.
  this.pool=Array.from({length:480},()=>app.colliders.addBox(new Vector3(1e8,0,1e8),new Vector3(),0,{solid:false,tag:'town'}));this.collisionKey='';
 }
 prop(town,name,parts,range=12000){const g=new Group();g.name=name;g.position.set(town.x,this.app.terrainData.heightAt(town.x,town.z),town.z);const mesh=new Mesh(mergePrepared(parts),this.propMaterial);mesh.castShadow=true;g.add(mesh);this.app.scene.add(g);this.landmarks.push({group:g,range});return g;}
 wheel(town){
  const p=[],x=town.radius*.55,z=0,y=21,c=0xcda36a;
  for(const side of [-1,1])p.push(prepare(rod(new Vector3(x+side*9,0,z+side*2),new Vector3(x,y,z),.3,8),{color:0xb8c7b9}));
  const root=this.prop(town,'Coastal observation wheel',p),moving=new Group();moving.position.set(x,y,z);root.add(moving);
  const parts=[prepare(torus(17,.25,6,60),{color:c})];
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2,px=Math.cos(a)*17,py=Math.sin(a)*17;parts.push(prepare(rod(new Vector3(),new Vector3(px,py,0),.07,5),{color:0xefe0b2}));parts.push(prepare(box(2,1.6,1.6),{color:[0xb47553,0x688e89,0xd2b978][i%3],matrix:mat4(px,py,0)}));}
  moving.add(new Mesh(mergePrepared(parts),this.propMaterial));(this.wheels??=[]).push(moving);
 }
 arcade(town){
  const p=[],x=-town.radius*.55,z=0;
  for(let i=-3;i<=3;i++){p.push(prepare(cylinder(.7,.8,7,12),{color:0xe4d4b3,matrix:mat4(x+i*4,3.5,z)}));if(i<3)p.push(prepare(torus(2,.5,8,20,Math.PI),{color:0xe4d4b3,matrix:mat4(x+i*4+2,5,z)}));}
  p.push(prepare(box(29,.8,8),{color:0xb16c4b,matrix:mat4(x,8.2,z-2)}));this.prop(town,'Spanish Revival garden arcade',p);
 }
 victorian(town){const p=[],x=-town.radius*.55;p.push(prepare(box(12,14,12),{color:0xaac3ac,matrix:mat4(x,7,0)}));for(const side of [-1,1]){p.push(prepare(cylinder(2,2,22,8),{color:0xcdd5b6,matrix:mat4(x+side*5,11,4)}));p.push(prepare(cylinder(0,3.5,7,8),{color:0x57786b,matrix:mat4(x+side*5,25.5,4)}));}this.prop(town,'Painted Victorian towers',p);}
 pavilion(town){const p=[prepare(cylinder(14,14,9,48),{color:0xe4cba5,matrix:mat4(38,4.5,0)}),prepare(cylinder(0,15,5,48),{color:0xb7764d,matrix:mat4(38,11.5,0)})];for(let i=0;i<16;i++){const a=i/16*6.28;p.push(prepare(cylinder(.25,.3,8,8),{color:0xf0ddba,matrix:mat4(38+Math.cos(a)*14,4,Math.sin(a)*14)}));}this.prop(town,'Avalon seaside pavilion',p);}
 bridge(){
  const a=project(-122.4785,37.8077),b=project(-122.479,37.831),dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz),heading=Math.atan2(dx,dz),parts=[],red=0xb66040;
  const add=(g,c,m)=>parts.push(prepare(g,{color:c,matrix:m,rough:.75}));add(box(12,1.5,L+35),0x748078,mat4(0,25,0));
  for(const side of [-1,1])for(const lane of [-1,1]){const z=side*L*.28,x=lane*6;add(box(1.5,65,2),red,mat4(x,32.5,z));for(const y of [28,43,59])add(box(12,1.2,1.8),red,mat4(0,y,z));}
  for(const side of [-1,1])for(let i=0;i<40;i++){const z=-L/2+i*L/40,z2=z+L/40,cable=z=>28+34*Math.min(1,((Math.abs(z)-L*.02)/(L*.27))**2);add(rod(new Vector3(side*6,cable(z),z),new Vector3(side*6,cable(z2),z2),.14,6),red);add(rod(new Vector3(side*6,26,z),new Vector3(side*6,cable(z),z),.045,5),red);}
  const g=this.prop({x:(a.x+b.x)/2,z:(a.z+b.z)/2},'Golden Gate Bridge',parts,22000);g.position.y=0;g.rotation.y=heading;
  this.app.colliders.addBox(new Vector3(g.position.x,24.3,g.position.z),new Vector3(6,1,L/2+17),heading,{walkable:true,tag:'golden-gate'});
 }
 morroRock(){const p=project(-120.868,35.369),parts=[prepare(sphere(1,24,18),{color:0x8b9183,rough:1,matrix:mat4(0,8,0,0,.3,.1,30,57,27)})];const g=this.prop(p,'Morro Rock',parts,17000);g.position.y=0;}
 garden(town){
  const p=[],x=0,z=town.radius*.4;
  // A little public artwork and lavender beds make the pedestrian boulevard
  // distinct from the traffic loop. Keep the central arrival plaza open.
  p.push(prepare(cylinder(2.5,3,.6,24),{color:0xc9b68d,matrix:mat4(x,.3,z)}));
  p.push(prepare(torus(3.5,.35,12,40),{color:town.region==='north'?0xb8976b:0xcb8755,metal:.55,matrix:mat4(x,4,z,0,.6,.2)}));
  p.push(prepare(torus(2.3,.25,12,32),{color:0x659b99,metal:.5,matrix:mat4(x,4,z,0,-.6,-.4)}));
  for(const side of [-1,1])for(let i=0;i<8;i++)p.push(prepare(sphere(1,8,6),{color:i%2?0x9f95b8:0x94a771,matrix:mat4(side*6,.4,z-9+i*2.5,0,0,0,1,.6,1)}));
  this.prop(town,'Sculpture and lavender garden',p);
 }
 campus(town){
  const p=[],x=-town.radius*.45;
  for(let i=0;i<3;i++){
   const y=i*5,w=29-i*5;
   p.push(prepare(box(w,4.5,12),{color:0x759eaa,rough:.3,matrix:mat4(x,y+2.4,0)}));
   p.push(prepare(box(w+1,.5,13),{color:0xe1d9bd,matrix:mat4(x,y+4.8,0)}));
   for(let j=-2;j<=2;j++)p.push(prepare(cylinder(.4,.6,1,8),{color:0x668573,matrix:mat4(x+j*3,y+5.4,5)}));
  }
  this.prop(town,'South Bay terraced garden pavilion',p);
  this.groups.at(-1).boxes.push({x:town.x+x,z:town.z,y:town.level+7.5,half:new Vector3(15,7.5,6.5)});
 }
 bellTower(town){
  const x=-town.radius*.55-22,p=[prepare(box(7,25,7),{color:0xe5cda5,matrix:mat4(x,12.5,0)}),prepare(sphere(1,20,12),{color:0x91b0a1,matrix:mat4(x,25,0,0,0,0,5,5,5)})];
  for(const side of [-1,1])p.push(prepare(box(2.8,4,.1),{color:0x697e75,matrix:mat4(x,21,side*3.55)}));
  this.prop(town,'San Diego garden bell tower',p);
  this.groups.at(-1).boxes.push({x:town.x+x,z:town.z,y:town.level+15,half:new Vector3(5,15,5)});
 }
 flightClearance(x,z,ax,az){
  let top=0;const dx=ax-x,dz=az-z,length2=dx*dx+dz*dz,reach=Math.sqrt(length2);
  for(const {town,boxes}of this.groups){
   if(Math.hypot(town.x-x,town.z-z)>town.radius+reach+30)continue;
   for(const b of boxes){
    const t=length2?Math.max(0,Math.min(1,((b.x-x)*dx+(b.z-z)*dz)/length2)):0;
    if(Math.abs(x+t*dx-b.x)<b.half.x+9&&Math.abs(z+t*dz-b.z)<b.half.z+9)top=Math.max(top,b.y+b.half.y);
   }
  }
  return top;
 }
 syncColliders(position){
  const nearby=this.groups.filter(({town})=>Math.hypot(town.x-position.x,town.z-position.z)<town.radius+160),key=nearby.map(({town})=>town.id).join('|');if(key===this.collisionKey)return;this.collisionKey=key;
  const boxes=nearby.flatMap(g=>g.boxes).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
  this.pool.forEach((b,i)=>{const p=boxes[i];b.solid=!!p;if(!p)return;b.center.set(p.x,p.y,p.z);b.half.copy(p.half);b.radius=Math.hypot(p.half.x,p.half.z);b.top=p.y+p.half.y;b.bottom=p.y-p.half.y;});
 }
 update(dt,position,hour){
  this.time+=dt;this.material.uniforms.townNight.value=hour<5.8||hour>19.2?1:0;
  for(const {group,town} of this.groups)group.visible=Math.hypot(town.x-position.x,town.z-position.z)<(town.major?20000:12000);
  for(const {group,range}of this.landmarks)group.visible=Math.hypot(group.position.x-position.x,group.position.z-position.z)<range;
  for(const wheel of this.wheels||[])wheel.rotation.z=this.time*.025;
  this.syncColliders(position);
 }
}
