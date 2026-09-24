import earcut from 'earcut';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,Vector3,Color} from '../engine/index.js';
import {createPropMaterial} from '../game/GameMaterials.js';
import {project} from './Geography.js';

const CELL=512,PALETTE_SF=[0xe3d5bb,0xd4baae,0xc2cbc4,0xcbb9a3,0xe0c6a4,0xb9c9d0,0xd3c89e],PALETTE_LA=[0xe5d5ba,0xd8c8b1,0xeee1cd,0xc9b39a,0xcabfb2];
class Batch {
 constructor(){this.p=[];this.n=[];this.uv=[];this.c=[];this.aux=[];this.indices=[];}
 vertex(x,y,z,nx,ny,nz,u,v,color,kind=0){const k=this.p.length/3;this.p.push(x,y,z);this.n.push(nx,ny,nz);this.uv.push(u,v);this.c.push(color.r,color.g,color.b);this.aux.push(.85,0,0,kind);return k;}
 quad(points,color,kind=0,uv=null){
  const a=new Vector3(...points[1]).sub(new Vector3(...points[0])),b=new Vector3(...points[2]).sub(new Vector3(...points[0])),n=a.cross(b).normalize(),k=this.p.length/3;
  points.forEach((p,i)=>this.vertex(...p,n.x,n.y,n.z,...(uv?.[i]||[0,0]),color,kind));this.indices.push(k,k+1,k+2,k,k+2,k+3);
 }
 geometry(){if(!this.indices.length)return null;const g=new BufferGeometry();for(const [name,data,size]of[['position',this.p,3],['normal',this.n,3],['uv',this.uv,2],['color',this.c,3],['aux',this.aux,4]])g.setAttribute(name,new Float32BufferAttribute(data,size));g.setIndex(this.indices);g.computeBoundingSphere();return g;}
}
const color=v=>new Color(v);
const ROOF=color(0x847e71),ASPHALT=color(0x535b59),CURB=color(0xbcb9ab),PAINT=color(0xded8bd),YELLOW=color(0xd4b46b);
function footprint(batch,b,terrain,ox,oz,city){
 const raw=b.p,poly=raw.length>3&&raw[0][0]===raw.at(-1)[0]&&raw[0][1]===raw.at(-1)[1]?raw.slice(0,-1):raw;
 if(poly.length<3)return;
 const levels=poly.map(([x,z])=>terrain.heightAt(x,z));
 const base=Math.min(...levels)-.5,ground=levels.reduce((a,h)=>a+h,0)/levels.length,top=Math.max(...levels,ground+b.h),tall=b.h>35;
 b.base=base;b.top=top;b.cx=poly.reduce((v,p)=>v+p[0],0)/poly.length;b.cz=poly.reduce((v,p)=>v+p[1],0)/poly.length;
 const palette=city==='sf'?PALETTE_SF:PALETTE_LA,c=color(tall?[0xa4b6b7,0x718e9a,0xc1c7bb][Math.abs(b.id)%3]:palette[Math.abs(b.id)%palette.length]);
 let signed=0;for(let i=0;i<poly.length;i++){const a=poly[i],d=poly[(i+1)%poly.length];signed+=a[0]*d[1]-d[0]*a[1];}
 const profile=b.style==='pyramid'?[[0,1],[.22,.94],[.97,.045],[1,.012]]:b.style==='salesforce'?[[0,1],[.80,.89],[.94,.58],[1,.24]]:[[0,1],[1,1]];
 const scaled=(p,f)=>[b.cx+(p[0]-b.cx)*f-ox,b.cz+(p[1]-b.cz)*f-oz];
 for(let layer=0;layer<profile.length-1;layer++)for(let i=0;i<poly.length;i++){
  const aa=poly[i],bb=poly[(i+1)%poly.length],a=signed>0?bb:aa,d=signed>0?aa:bb,len=Math.hypot(a[0]-d[0],a[1]-d[1]);
  const [u,f]=profile[layer],[v,g]=profile[layer+1],low=base+(top-base)*u,high=base+(top-base)*v,A=scaled(a,f),D=scaled(d,f),B=scaled(a,g),E=scaled(d,g);
  batch.quad([[A[0],low,A[1]],[D[0],low,D[1]],[E[0],high,E[1]],[B[0],high,B[1]]],c,tall?2:1,[[0,low-ground],[len,low-ground],[len,high-ground],[0,high-ground]]);
 }
 if(!tall){
  const trim=color(0xe5ddcc);
  for(let i=0;i<poly.length;i++){
   const a=poly[i],d=poly[(i+1)%poly.length],dx=d[0]-a[0],dz=d[1]-a[1],len=Math.hypot(dx,dz);if(len<.5)continue;
   const sign=signed>0?-1:1,nx=dz/len*sign*.13,nz=-dx/len*sign*.13;
   batch.quad([[a[0]-ox+nx,top-.32,a[1]-oz+nz],[d[0]-ox+nx,top-.32,d[1]-oz+nz],[d[0]-ox+nx,top+.06,d[1]-oz+nz],[a[0]-ox+nx,top+.06,a[1]-oz+nz]],trim);
  }
 }
 const start=batch.p.length/3;
 for(const p of poly){const[x,z]=scaled(p,profile.at(-1)[1]);batch.vertex(x,top,z,0,1,0,x,z,ROOF,0);}
 const tris=earcut(poly.flat());for(let i=0;i<tris.length;i+=3)batch.indices.push(start+tris[i],start+tris[i+2],start+tris[i+1]);
}
function roads(batch,segments,terrain,ox,oz){
 const joinNormal=(s,index)=>{
  const p=s.route.points,a=p[Math.max(0,index-1)],b=p[index],c=p[Math.min(p.length-1,index+1)];
  let ax=b.x-a.x,az=b.z-a.z,bx=c.x-b.x,bz=c.z-b.z;
  const al=Math.hypot(ax,az),bl=Math.hypot(bx,bz);
  if(!al)return[bz/bl,-bx/bl];if(!bl)return[az/al,-ax/al];
  ax/=al;az/=al;bx/=bl;bz/=bl;
  const denominator=Math.max(.4,1+ax*bx+az*bz);
  return[(az+bz)/denominator,-(ax+bx)/denominator];
 };
 const ribbon=(s,l,r,lift,c)=>{
  const n=Math.max(1,Math.ceil(s.len/4)),across=Math.max(1,Math.ceil((r-l)/2));
  const start=s.clipped?[s.dz/s.len,-s.dx/s.len]:joinNormal(s,s.index),end=s.clipped?start:joinNormal(s,s.index+1);
  for(let i=0;i<n;i++)for(let j=0;j<across;j++){
   const left=l+(r-l)*j/across,right=l+(r-l)*(j+1)/across;const points=[];
   for(const[u,side]of[[i/n,left],[(i+1)/n,left],[(i+1)/n,right],[i/n,right]]){
    const nx=start[0]+(end[0]-start[0])*u,nz=start[1]+(end[1]-start[1])*u;
    const x=s.a.x+s.dx*u+nx*side,z=s.a.z+s.dz*u+nz*side;
    const y=s.route.bridge?s.a.y+(s.b.y-s.a.y)*u:terrain.heightAt(x,z);
    points.push([x-ox,y+lift,z-oz]);
   }batch.quad(points,c);
  }
 };
 for(let s of segments){
  const r=s.route;if(r.tunnel)continue;const w=r.width/2;
  // Sidewalks sit 13 cm above the asphalt, matching a normal street curb.
  ribbon(s,-w-1.7,-w,.28,CURB);ribbon(s,w,w+1.7,.28,CURB);ribbon(s,-w,w,.15,ASPHALT);
  if(s.len>20){
   const margin=Math.min(12,s.len*.25),u=margin/s.len;s={...s,clipped:true,a:{x:s.a.x+s.dx*u,y:s.a.y+(s.b.y-s.a.y)*u,z:s.a.z+s.dz*u},b:{x:s.b.x-s.dx*u,y:s.b.y-(s.b.y-s.a.y)*u,z:s.b.z-s.dz*u},dx:s.dx*(1-2*u),dz:s.dz*(1-2*u),len:s.len-2*margin};
   for(const side of[-1,1])ribbon(s,side*(w-.25)-.06,side*(w-.25)+.06,.19,PAINT);
   if(!r.one&&r.width>=8)for(const side of[-1,1])ribbon(s,side*.10-.045,side*.10+.045,.20,YELLOW);
  }
 }
}
export class RealCities {
 constructor(app){
  this.app=app;this.streets=app.terrainData.streets;this.cells=new Map();this.requests=new Map();this.indices=new Map();this.time=0;this.pending=[];this.failed=new Map();this.maxCells=120;
  this.material=createPropMaterial('California real building footprints',{uniforms:{cityNight:['f32',0]}});this.material.side='double';this.material.underwaterLighting='none';
  this.material.surface+=`
 if(in.vs.vAux.w>0.5 && abs(in.N.y)<0.5){
  let tower=in.vs.vAux.w>1.5;let uv=in.uv;let grid=vec2f(select(2.7,2.0,tower),select(3.2,3.7,tower));
  let cell=fract(uv/grid);let aa=max(fwidth(uv/grid),vec2f(0.008));
  let win=smoothstep(vec2f(0.19),vec2f(0.19)+aa,cell)*(1.0-smoothstep(vec2f(0.76)-aa,vec2f(0.76),cell));
  let pane=win.x*win.y*step(0.55,uv.y);let glass=vec3f(0.13,0.24,0.28);
  s.albedo=mix(s.albedo,glass,pane*0.84);s.roughness=mix(s.roughness,0.24,pane);
  let lit=step(0.45,gpNoise(vec3f(floor(uv/grid),in.vs.vLocal.x*0.013)));
  s.emissive+=vec3f(1.0,0.65,0.29)*pane*lit*mat.cityNight*0.7;
  let sill=(1.0-smoothstep(0.035,0.08,abs(cell.y-0.18)))*step(0.14,cell.x)*(1.0-step(0.81,cell.x));
  s.albedo=mix(s.albedo,vec3f(0.72,0.68,0.57),sill*0.6);
  let door=step(0.17,cell.x)*(1.0-step(0.66,cell.x))*step(0.0,uv.y)*(1.0-step(2.1,uv.y))*select(1.0,0.0,tower);
  s.albedo=mix(s.albedo,vec3f(0.12,0.19,0.17),door*0.65);
  let ledge=1.0-smoothstep(0.025,0.06,cell.y);s.albedo*=1.0-ledge*0.17;
 }
 `;
  this.skyMaterial=createPropMaterial('Distant city silhouettes');this.skyMaterial.side='double';this.skyMaterial.underwaterLighting='none';this.skyMaterial.surface+='\nif(distance(in.P.xz,frame.cameraPos.xz)<2200.0){discard;}\n';
  this.roadMaterial=createPropMaterial('Real California streets');this.roadMaterial.side='double';this.roadMaterial.underwaterLighting='none';
  this.roadMaterial.surface+='\ns.albedo *= 0.94 + gpNoise(in.P * 9.0) * 0.10;\n';
  this.pool=Array.from({length:1400},()=>app.colliders.addBox(new Vector3(1e8,0,1e8),new Vector3(),0,{solid:false,tag:'city-wall'}));
  this.ready=this.init();
 }
 async json(path){const r=await fetch(`${import.meta.env.BASE_URL}geodata/${path}`);if(!r.ok)throw new Error(`City tile ${path}: ${r.status}`);return r.json();}
 async init(){
  for(const id of['sf','la']){
   const index=await this.json(`${id}/index.json`);this.indices.set(id,new Set(index.cells));
   const skyline=await this.json(`${id}/skyline.json`),batch=new Batch(),center=project(id==='sf'?-122.42:-118.35,id==='sf'?37.78:34.07);
   for(const b of skyline)footprint(batch,b,this.app.terrainData,center.x,center.z,id);
   const g=batch.geometry();if(g){const mesh=new Mesh(g,this.skyMaterial);mesh.position.set(center.x,0,center.z);mesh.name=`${id} distant skyline`;mesh.castShadow=false;this.app.scene.add(mesh);this[`${id}Skyline`]=mesh;}
  }
 }
 async loadCell(id,key){
  const token=`${id}:${key}`;if(this.cells.has(token)||this.requests.has(token))return this.requests.get(token);
  const request=(async()=>{
   const [i,j]=key.split(',').map(Number),ox=i*CELL,oz=j*CELL;
   const buildings=await this.json(`${id}/cells/${key}.json`);
   const batch=new Batch();for(const b of buildings)footprint(batch,b,this.app.terrainData,ox,oz,id);
   const group=new Group();group.position.set(ox,0,oz);group.name=`${id} block ${key}`;
   const g=batch.geometry();if(g){const mesh=new Mesh(g,this.material);mesh.castShadow=true;group.add(mesh);}
   this.app.scene.add(group);this.cells.set(token,{id,key,group,buildings,cx:ox+256,cz:oz+256});this.collisionKey='';
  })().finally(()=>this.requests.delete(token));
  this.requests.set(token,request);return request;
 }
 loadRoadCell(key){
  const token=`road:${key}`;if(this.cells.has(token))return;
  const segments=this.streets.drawCells.get(key);if(!segments)return;
  const[i,j]=key.split(',').map(Number),ox=i*CELL,oz=j*CELL,b=new Batch();roads(b,segments,this.app.terrainData,ox,oz);
  const g=b.geometry();if(!g)return;const group=new Mesh(g,this.roadMaterial);group.position.set(ox,0,oz);group.name='OSM street surfaces';this.app.scene.add(group);
  this.cells.set(token,{id:'road',key,group,buildings:[],cx:ox+256,cz:oz+256});
 }
 async prepare(position){
  await this.ready;const cx=Math.floor(position.x/CELL),cz=Math.floor(position.z/CELL),jobs=[];
  for(let j=cz-1;j<=cz+1;j++)for(let i=cx-1;i<=cx+1;i++){
   const key=`${i},${j}`;this.loadRoadCell(key);for(const[id,set]of this.indices)if(set.has(key))jobs.push(this.loadCell(id,key));
  }await Promise.all(jobs);this.syncColliders(position,true);
 }
 update(dt){
  this.time+=dt;const p=this.app.player.position;
  const hour=this.app.settings.timeOfDay;this.material.uniforms.cityNight.value=hour<6||hour>19?1:0;
  if(this.time>(this.nextUpdate||0)){
   this.nextUpdate=this.time+.4;const cx=Math.floor(p.x/CELL),cz=Math.floor(p.z/CELL),wanted=[];
   for(let j=cz-4;j<=cz+4;j++)for(let i=cx-4;i<=cx+4;i++){
    const key=`${i},${j}`,d=Math.hypot((i+.5)*CELL-p.x,(j+.5)*CELL-p.z);if(d>2050)continue;
    wanted.push({key,d});
   }wanted.sort((a,b)=>a.d-b.d);
   for(const{key}of wanted){this.loadRoadCell(key);for(const[id,set]of this.indices)if(set.has(key)&&!this.cells.has(`${id}:${key}`)&&!this.requests.has(`${id}:${key}`)&&this.time>(this.failed.get(`${id}:${key}`)||0)&&this.requests.size<3)this.loadCell(id,key).catch(e=>{this.failed.set(`${id}:${key}`,this.time+15);console.warn(e);});}
   for(const[token,c]of this.cells){const d=Math.hypot(c.cx-p.x,c.cz-p.z);c.group.visible=d<2800;c.group.traverse(o=>{if(o.geometry)o.castShadow=c.id!=='road'&&d<800;});if(d>3500){c.group.traverse(o=>o.geometry?.dispose());this.app.scene.remove(c.group);this.cells.delete(token);}}
   this.syncColliders(p);
  }
 }
 syncColliders(p,force=false){
  const key=`${Math.floor(p.x/24)},${Math.floor(p.z/24)},${this.cells.size}`;if(!force&&this.collisionKey===key)return;this.collisionKey=key;
  const buildings=[];for(const c of this.cells.values())for(const b of c.buildings)if(Math.hypot(b.cx-p.x,b.cz-p.z)<160)buildings.push(b);
  buildings.sort((a,b)=>Math.hypot(a.cx-p.x,a.cz-p.z)-Math.hypot(b.cx-p.x,b.cz-p.z));let count=0;
  for(const b of buildings)for(let i=0;i<b.p.length-1&&count<this.pool.length;i++){
   const a=b.p[i],d=b.p[i+1],dx=d[0]-a[0],dz=d[1]-a[1],len=Math.hypot(dx,dz);if(len<.3)continue;
   const box=this.pool[count++],rot=Math.atan2(dx,dz);box.center.set((a[0]+d[0])/2,(b.top+b.base)/2,(a[1]+d[1])/2);box.half.set(.24,(b.top-b.base)/2,len/2);box.cos=Math.cos(rot);box.sin=Math.sin(rot);box.rotY=rot;box.radius=Math.hypot(.24,len/2);box.top=b.top;box.bottom=b.base;box.solid=true;
  }
  for(let i=count;i<this.pool.length;i++)this.pool[i].solid=false;this.activeColliders=count;
 }
 flightClearance(x,z,ax,az){
  let h=0;for(const c of this.cells.values())if(Math.hypot(c.cx-x,c.cz-z)<500||Math.hypot(c.cx-ax,c.cz-az)<500)for(const b of c.buildings)if(Math.hypot(b.cx-ax,b.cz-az)<80||Math.hypot(b.cx-x,b.cz-z)<60)h=Math.max(h,b.top);return h;
 }
}
