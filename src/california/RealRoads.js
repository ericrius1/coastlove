import {goldenGateHeight} from './GoldenGate.js';
import {Vector3} from '../engine/index.js';
const CELL=64;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ROAD_DATA=[];
export async function loadRoadData(read=async path=>{
 const r=await fetch(`${import.meta.env.BASE_URL}geodata/${path}`);if(!r.ok)throw new Error(`Street data ${path}: ${r.status}`);return r.json();
}){
 if(ROAD_DATA.length)return;
 const sets=await Promise.all(['sf','la'].map(async id=>({id,roads:await read(`${id}/roads.json`)})));
 ROAD_DATA.push(...sets);
}
// A real OSM way, never implicitly closed with a fictional connecting road.
export class StreetRoute {
 constructor(row,city,terrain){
  Object.assign(this,{id:`osm:${row.id}`,name:row.name,city,width:row.w,one:row.one,bridge:row.bridge,tunnel:row.tunnel,kind:row.k,street:true});
  const points=[];
  for(let i=0;i<row.p.length-1;i++){
   const a=row.p[i],b=row.p[i+1],n=row.bridge?Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/24)):1;
   for(let j=0;j<n;j++)points.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);
  }points.push(row.p.at(-1));
  this.points=points.map(([x,z])=>new Vector3(x,0,z));this.lengths=[0];this.length=0;this.cells=new Map();
  const first=this.points[0],last=this.points.at(-1),h0=Math.max(1,terrain.rawHeight(first.x,first.z)),h1=Math.max(1,terrain.rawHeight(last.x,last.z));
  for(let i=0;i<this.points.length;i++){
   const p=this.points[i];if(i){this.length+=p.distanceTo(this.points[i-1]);this.lengths.push(this.length);}
  }
  for(let i=0;i<this.points.length;i++){
   const p=this.points[i],u=this.lengths[i]/(this.length||1);
   p.y=terrain.rawHeight(p.x,p.z);
   if(this.bridge){
    p.y=Math.max(1,h0*(1-u)+h1*u+Math.sin(u*Math.PI)*Math.min(8,this.length*.02));
    if(row.name==='Golden Gate Bridge')p.y=goldenGateHeight(p.x,p.z,terrain.rawHeight(p.x,p.z),true)??p.y;
   }
  }
  if(city==='sf'&&['motorway','trunk'].includes(row.k)){
   for(const p of this.points){const h=goldenGateHeight(p.x,p.z,terrain.rawHeight(p.x,p.z));if(h!==null){p.y=h;this.bridge=true;}}
  }
  // Keep street-grade curvature smooth at DEM texel boundaries without altering
  // plan geometry. Intersections share the same DEM anchor elevations.
  this.segments=[];
  for(let i=0;i<this.points.length-1;i++){
   const a=this.points[i],b=this.points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.01)continue;
   const segment={a,b,dx,dz,len,len2:len*len,route:this,index:i};this.segments.push(segment);
   for(let z=Math.floor((Math.min(a.z,b.z)-this.width/2-6)/CELL);z<=Math.floor((Math.max(a.z,b.z)+this.width/2+6)/CELL);z++)for(let x=Math.floor((Math.min(a.x,b.x)-this.width/2-6)/CELL);x<=Math.floor((Math.max(a.x,b.x)+this.width/2+6)/CELL);x++){
    const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(segment);
   }
  }
 }
 nearest(x,z,full=false){
  let best={distance:Infinity,s:0,x:0,z:0};
  for(const a of full?this.segments:this.cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[]){
   const u=clamp(((x-a.a.x)*a.dx+(z-a.a.z)*a.dz)/a.len2,0,1),px=a.a.x+a.dx*u,pz=a.a.z+a.dz*u,d=Math.hypot(x-px,z-pz);
   if(d<best.distance)best={distance:d,s:this.lengths[a.index]+u*a.len,x:px,z:pz,y:a.a.y+(a.b.y-a.a.y)*u,route:this};
  }return best;
 }
 sample(distance,direction=1,offset=1.85){
  const s=clamp(distance,0,this.length-.001);let lo=0,hi=this.points.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(this.lengths[mid]<=s)lo=mid;else hi=mid;}
  const a=this.points[lo],b=this.points[lo+1],u=(s-this.lengths[lo])/(this.lengths[lo+1]-this.lengths[lo]||1),heading=Math.atan2(b.x-a.x,b.z-a.z)+(direction<0?Math.PI:0);
  const lane=this.one?0:Math.min(offset,this.width*.23);
  return{x:a.x+(b.x-a.x)*u-Math.cos(heading)*lane,z:a.z+(b.z-a.z)*u+Math.sin(heading)*lane,y:a.y+(b.y-a.y)*u,heading,s};
 }
}
export class StreetNetwork {
 constructor(terrain){
  this.terrain=terrain;this.routes=[];this.cells=new Map();this.ends=new Map();this.bounds=[];this.drawCells=new Map();
  for(const data of ROAD_DATA){
   const bounds={id:data.id,minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
   const nodeUse=new Map();
   for(const row of data.roads)for(const p of row.p){const key=p.join(',');nodeUse.set(key,(nodeUse.get(key)||0)+1);}
   const pieces=[];
   for(const row of data.roads){let start=0,part=0;for(let i=1;i<row.p.length;i++)if(i===row.p.length-1||nodeUse.get(row.p[i].join(','))>1){pieces.push({...row,id:`${row.id}.${part++}`,p:row.p.slice(start,i+1)});start=i;}}
   for(const row of pieces){
    if(row.p.length<2)continue;
    const r=new StreetRoute(row,data.id,terrain);if(!r.length)continue;this.routes.push(r);
    for(const key of r.cells.keys()){if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(...r.cells.get(key));}
    for(const [p,d]of[[r.points[0],1],[r.points.at(-1),-1]]){
     const key=this.endKey(p);if(!this.ends.has(key))this.ends.set(key,[]);this.ends.get(key).push({route:r,direction:d});
    }
    for(const seg of r.segments){
     for(const p of[seg.a,seg.b]){bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z);}
     const key=`${Math.floor((seg.a.x+seg.b.x)/2/512)},${Math.floor((seg.a.z+seg.b.z)/2/512)}`;
     if(!this.drawCells.has(key))this.drawCells.set(key,[]);this.drawCells.get(key).push(seg);
    }
   }this.bounds.push(bounds);
  }
  // Match connected approach streets to the bridge abutment elevation. Shared
  // plan nodes must also share a height, including the non-bridge road segment.
  for(const r of this.routes)if(r.name==='Golden Gate Bridge')for(const p of[r.points[0],r.points.at(-1)]){
   for(const link of this.ends.get(this.endKey(p))||[]){const q=link.direction>0?link.route.points[0]:link.route.points.at(-1);q.y=p.y;}
  }
 }
 endKey(p){return`${Math.round(p.x)},${Math.round(p.z)}`;}
 inCity(x,z){return this.bounds.some(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ);}
 surfaceAt(x,z,bridges=false){
  if(!this.inCity(x,z))return null;
  let best=null;
  for(const s of this.cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[]){
   const r=s.route;if(r.tunnel||(!bridges&&r.bridge))continue;
   const u=clamp(((x-s.a.x)*s.dx+(z-s.a.z)*s.dz)/s.len2,0,1),d=Math.hypot(x-s.a.x-s.dx*u,z-s.a.z-s.dz*u);
   if(d>r.width/2+6||best&&d-r.width/2>=best.distance-best.width/2)continue;
   best={distance:d,width:r.width,height:s.a.y+(s.b.y-s.a.y)*u,bridge:r.bridge,route:r};
  }return best;
 }
 nearbyRoutes(x,z,radius=600){
  const routes=new Set();
  for(let j=Math.floor((z-radius)/CELL);j<=Math.floor((z+radius)/CELL);j++)for(let i=Math.floor((x-radius)/CELL);i<=Math.floor((x+radius)/CELL);i++)for(const s of this.cells.get(`${i},${j}`)||[])if(!s.route.tunnel)routes.add(s.route);
  return [...routes];
 }
 nearest(x,z,radius=1000){
  const routes=new Set();
  for(let j=Math.floor((z-radius)/CELL);j<=Math.floor((z+radius)/CELL);j++)for(let i=Math.floor((x-radius)/CELL);i<=Math.floor((x+radius)/CELL);i++)for(const s of this.cells.get(`${i},${j}`)||[])if(!s.route.tunnel)routes.add(s.route);
  let best=null;for(const r of routes){const n=r.nearest(x,z,true);if(!best||n.distance<best.distance)best=n;}return best;
 }
 nearestStreet(x,z,radius=1000){
  const routes=this.nearbyRoutes(x,z,radius).filter(r=>r.name&&r.kind!=='service'&&r.length>15);
  let best=null;for(const r of routes){const n=r.nearest(x,z,true);if(!best||n.distance<best.distance)best=n;}
  return best&&best.distance<Math.min(radius,150)?best:this.nearest(x,z,radius);
 }
 next(route,direction,seed=0){
  const end=direction>0?route.points.at(-1):route.points[0];
  const choices=(this.ends.get(this.endKey(end))||[]).filter(a=>a.route!==route&&!a.route.tunnel&&(!a.route.one||a.route.one===a.direction));
  if(!choices.length)return{route,direction:-direction};
  return choices[Math.abs(seed)%choices.length];
 }
}
