import { LAYERS } from '../core/SceneRenderer.js';
import { COAST_VIEW } from './ViewQuality.js';
import { Group, Mesh, InstancedMesh, Vector3, Color } from '../engine/index.js';
import { prepare, mergePrepared, sphere, cylinder, box, torus, mat4, rod } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { standard } from '../materials/Materials.js';
import { mulberry32 } from '../util/Noise.js';
import { PLACES } from './Region.js';

export class Landmarks {
 constructor(app){
  this.app=app;this.groups=[];this.time=0;
  this.material=createPropMaterial('coastlovePlaces');
  this.rockMaterial=createPropMaterial('coastloveSandstone');
  this.rockMaterial.surface += '\ns.albedo *= 0.75 + gpFbm(in.P * 0.55) * 0.5; s.normal = gpBump(in.P,s.normal,gpFbm(in.P*1.2)*0.16);\n';
  this.glow=standard({color:0x80c7b9,emissive:0x46e5d2,emissiveIntensity:0,roughness:.3});
  this.lamp=standard({color:0xffe3a3,emissive:0xffd38c,emissiveIntensity:0});
  this.beamMaterial=standard({color:0x000000,emissive:0xffe6b0,emissiveIntensity:.7,lit:false,transparent:true,blending:'additive',opacity:.04,depthWrite:false,velocityWeight:0,
   // GeoKit cylinder UVs are measured in metres. Feather both the distant
   // end and the silhouette so the rotating shaft reads as light in mist.
   surface:'s.alpha *= pow(1.0 - clamp(in.uv.y / 200.0,0.0,1.0),1.5) * smoothstep(0.0,0.35,abs(dot(normalize(in.N),normalize(in.V))));'});
  for(const place of PLACES){
   const group=new Group();group.name=place.label;group.position.set(place.x,place.water?0:app.terrainData.heightAt(place.x,place.z),place.z);app.scene.add(group);this.groups.push({place,group});
   const parts=[];
   const add=(geo,color,matrix,pattern=0)=>parts.push(prepare(geo,{color,rough:.82,matrix,pattern}));
   const wood=0x9c8d6b,white=0xe0d9ba,red=0x98533b;
   const bench=(x,z)=>{
    for(const side of [-1,1])add(box(.14,.55,.8),wood,mat4(x+side*.85,.28,z),1);
    for(let i=0;i<3;i++)add(box(2.2,.10,.20),wood,mat4(x,.58,z+(i-1)*.24),6);
    add(box(2.2,.35,.1),wood,mat4(x,.93,z-.38),6);
   };
   if(place.kind==='lighthouse'){
    add(cylinder(1.9,3.1,18,32),white,mat4(0,9,0));
    add(cylinder(3.3,3.3,.3,32),white,mat4(0,18,0));
    for(let k=0;k<8;k++){const a=k/8*Math.PI*2;add(cylinder(.07,.07,3.3,8),0x3e5b59,mat4(Math.sin(a)*2,19.8,Math.cos(a)*2));}
    add(torus(2,.11,6,32),0x3e5b59,mat4(0,21.4,0,Math.PI/2));
    add(cylinder(0,3,2.8,24),red,mat4(0,22.9,0));
    add(box(.9,1.9,.18),0x4d685c,mat4(0,.96,3.03));
    for(let k=0;k<16;k++){
     const a=k/16*Math.PI*2;
     add(cylinder(.035,.035,1,6),0x5a6560,mat4(Math.sin(a)*3.05,18.7,Math.cos(a)*3.05));
    }
    add(torus(3.05,.04,6,48),0x5a6560,mat4(0,19.2,0,Math.PI/2));
    for(const y of [6,11,15])add(box(.55,1,.2),0x446369,mat4(0,y,2.6-y*.04));
    const lamp=new Mesh(sphere(1.3,16,12),this.lamp);lamp.position.y=19.8;group.add(lamp);
    this.beam=new Group();this.beam.position.y=19.8;group.add(this.beam);
    for(const side of [-1,1]){
     const beam=new Mesh(cylinder(10,.2,200,20,1,true),this.beamMaterial);beam.layers.set(LAYERS.TRANSPARENT);beam.rotation.z=-side*Math.PI/2;beam.position.x=side*100;this.beam.add(beam);
    }
    const lightPos=group.position.clone();lightPos.y+=19.8;
    this.light=app.localLights.add({position:lightPos,color:new Color(1,.83,.52),intensity:3500,range:230,dir:new Vector3(1,-.08,0),cosInner:.993,cosOuter:.98,kind:'coastBeacon'});
    app.colliders.addCylinder(place.x,place.z,3.1,group.position.y,group.position.y+18);
    bench(8,6);
   }else if(place.kind==='arch'||place.kind==='grotto'){
    const arch=place.kind==='arch',R=arch?32:21,T=arch?7:9;
    add(torus(R,T,16,64,Math.PI),arch?0xb7a88a:0x82766b,mat4(0,2,0,0,0,0,1,arch?1:.75,1.4));
    for(const side of [-1,1])add(sphere(1,20,14),0x9f947f,mat4(side*R,-7,0,0,0,side*.12,T*1.5,20,T*1.7));
    if(!arch){
     const random=mulberry32(51),geo=sphere(.22,7,5),mesh=new InstancedMesh(geo,this.glow,100);
     for(let i=0;i<100;i++){const a=random()*Math.PI*2,r=8+random()*24;mesh.setMatrixAt(i,mat4(Math.sin(a)*r,.25+random()*.1,Math.cos(a)*r,0,0,0,1+random()*2,.35,1+random()*2));}
     mesh.instanceMatrix.needsUpdate=true;group.add(mesh);this.biolum=mesh;
    }
   }else if(place.kind==='poppies'){
    this.flowers(group,place);bench(0,0);
   }else if(place.kind==='grove'){
    bench(0,0);
    for(let i=0;i<5;i++){
     const x=(i-2)*7,z=-12-Math.sin(i)*5;
     add(cylinder(.3,.75,6,12),0x796c52,mat4(x,3,z,0,0,-.18));
     for(let k=0;k<4;k++)add(sphere(1,14,10),k%2?0x52644b:0x697457,mat4(x+1.3+k*.6,6+k*.4,z+(k-1.5)*1.4,0,0,-.07,4.5,1.6,3));
     app.colliders.addCylinder(place.x+x,place.z+z,.65,group.position.y,group.position.y+6);
    }
   }else if(place.kind==='camp'){
    // Sloping canvas halves form an open-front A-frame tent.
    for(const side of [-1,1])add(box(1.95,.035,3.1),0xb3774a,mat4(side*.57,1.1,-3,0,0,side*1.0),2);
    add(rod(new Vector3(0,0,-1.5),new Vector3(0,1.95,-1.5),.035,8),wood);
    add(rod(new Vector3(0,0,-4.5),new Vector3(0,1.95,-4.5),.035,8),wood);
    add(cylinder(.20,.20,1.4,16),0xd5c8a2,mat4(4,1.5,0,.65,0,.5));
    for(let k=0;k<3;k++){const a=k/3*6.28;add(rod(new Vector3(4,1.4,0),new Vector3(4+Math.sin(a)*.75,0,Math.cos(a)*.75),.03,6),0x686d65);}
    for(let k=0;k<12;k++){const a=k/12*6.28;add(sphere(.25,8,6),0x8e8b76,mat4(Math.sin(a)*1.1,.15,4+Math.cos(a)*1.1));}
    for(let k=0;k<3;k++)add(cylinder(.12,.14,1.6,8),wood,mat4(0,.22+k*.04,4,Math.PI/2,k*1.8,0),1);
    const fire=new Mesh(sphere(.45,10,8),this.lamp);fire.position.set(0,.5,4);group.add(fire);
    const pos=group.position.clone().add(new Vector3(0,1,4));app.localLights.add({position:pos,color:new Color(1,.40,.10),intensity:12,range:16,kind:'camp',flicker:.4});bench(-4,3);
   }else if(place.kind==='wreck'){
    // Open, half-buried ribs leave room to step through the abandoned hull.
    for(let k=0;k<7;k++){
     const z=(k-3)*1.3,w=Math.sin((k+1)/8*Math.PI)*2.2;
     for(const side of [-1,1])add(box(.18,2.2,.15),wood,mat4(side*w,1,z,0,0,-side*.4),1);
     add(box(w*2,.16,.18),wood,mat4(0,.2,z),6);
    }
    add(box(.15,.4,10),wood,mat4(0,.2,0),7);
    for(const side of [-1,1])add(box(.2,2.6,.2),wood,mat4(side*.7,1.3,7),1);
    add(box(1.65,.15,.2),wood,mat4(0,2.6,7),6);
    add(cylinder(.18,.43,.55,20),0xb08e4d,mat4(0,2.0,7));
    add(sphere(.08,8,6),0x584734,mat4(0,1.7,7));
   }else if(place.kind==='foxes'){
    bench(4,4);add(box(1.3,.06,.8),wood,mat4(4,1.1,6),6);for(const x of [3.5,4.5])add(box(.08,1,.08),wood,mat4(x,.55,6),1);
   }
   if(parts.length){const mesh=new Mesh(mergePrepared(parts),place.water?this.rockMaterial:this.material);mesh.castShadow=true;group.add(mesh);}
  }
 }
 flowers(group,place){
  const random=mulberry32(314),count=1000;
  const stem=prepare(cylinder(.014,.022,.42,5),{color:0x718059,rough:.9,matrix:mat4(0,.21,0)});
  const flower=mergePrepared([stem,prepare(sphere(1,7,5),{color:0xf0a139,rough:.7,matrix:mat4(0,.46,0,0,0,0,.13,.07,.13)})]);
  const purple=mergePrepared([prepare(cylinder(.015,.023,.65,5),{color:0x597955,rough:.9,matrix:mat4(0,.325,0)}),prepare(sphere(1,7,6),{color:0x8176b4,rough:.8,matrix:mat4(0,.65,0,0,0,0,.07,.23,.07)})]);
  for(const [k,geo]of[flower,purple].entries()){
   const mesh=new InstancedMesh(geo,this.material,count);let n=0;
   for(let i=0;i<count;i++){
    const a=random()*6.28,r=5+Math.sqrt(random())*68,x=Math.sin(a)*r,z=Math.cos(a)*r,h=this.app.terrainData.heightAt(place.x+x,place.z+z);
    const scale=.8+random()*.8;mesh.setMatrixAt(n++,mat4(x,h-group.position.y,z,0,random()*6.28,0,scale,scale,scale));
   }
   mesh.count=n;mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
  }
 }
 update(dt,player,hour){
  this.time+=dt;const night=hour<5.5||hour>19.2;
  this.glow.emissiveIntensity=night?3:0;this.lamp.emissiveIntensity=night?5:.05;
  if(this.beam){this.beam.visible=night;this.beam.rotation.y=this.time*.23;this.light.dir.set(Math.cos(this.time*.23),-.06,-Math.sin(this.time*.23)).normalize();}
  for(const {place,group}of this.groups){const distance=Math.hypot(place.x-player.x,place.z-player.z);group.visible=distance<(place.kind==='poppies'?900:COAST_VIEW.landmarkRange);}
  if(this.biolum)this.biolum.visible=night;
 }
 ringBell(){
  const audio=this.app.audio;if(!audio||audio.muted||!audio.ctx)return;
  const ctx=audio.ctx,now=ctx.currentTime;
  for(const [freq,level]of[[260,.13],[703,.05],[1340,.025]]){
   const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(level,now);gain.gain.exponentialRampToValueAtTime(.0001,now+4.5);oscillator.connect(gain);gain.connect(audio.master||ctx.destination);oscillator.start(now);oscillator.stop(now+4.6);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
 }
}
