import { Vector3, CatmullRomCurve3, BufferGeometry, Float32BufferAttribute, Mesh, Group } from '../engine/index.js';
import { prepare, mergePrepared } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';

// A fictional scenic drive, entirely on the mainland. Metres in Coastlove's
// compressed map; it does not claim to reproduce California's actual roads.
const STOPS = [[145,-125],[180,-210],[650,-260],[900,-240],[1010,-330],[960,-440],[630,-460],[160,-440],[-420,-650],[-1150,-700],[-1450,-600],[-1410,-495],[-1200,-500],[-700,-400],[-250,-250],[95,-230]];
const CELL = 64;
export const ROAD_HALF_WIDTH = 4.3;
const wrap = (v,n) => (v % n + n) % n;

export class CoastalRoute {
 constructor() {
  const curve = new CatmullRomCurve3(STOPS.map(([x,z])=>new Vector3(x,0,z)),true,'centripetal');
  const dense = curve.getPoints(2400);
  this.points=[dense[0]];this.lengths=[0];this.length=0;this.cells=new Map();
  for(let i=1;i<dense.length;i++){
   const previous=this.points.at(-1),p=dense[i],distance=p.distanceTo(previous);
   if(distance<3 && i<dense.length-1)continue;
   this.length+=distance;this.points.push(p);this.lengths.push(this.length);
  }
  const count=this.points.length-1;
  this.tangents=this.points.slice(0,-1).map((_,i)=>this.points[(i+1)%count].clone().sub(this.points[wrap(i-1,count)]).normalize());
  this.tangents.push(this.tangents[0]);
  for(let i=0;i<this.points.length-1;i++){
   const a=this.points[i],b=this.points[i+1];
   for(let z=Math.floor(Math.min(a.z,b.z)/CELL)-1;z<=Math.floor(Math.max(a.z,b.z)/CELL)+1;z++)
    for(let x=Math.floor(Math.min(a.x,b.x)/CELL)-1;x<=Math.floor(Math.max(a.x,b.x)/CELL)+1;x++){
     const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(i);
    }
  }
 }
 sample(distance, direction=1, offset=1.85) {
  const s=wrap(distance,this.length);let lo=0,hi=this.lengths.length-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(this.lengths[mid]<=s)lo=mid;else hi=mid;}
  const a=this.points[lo],b=this.points[lo+1],t=(s-this.lengths[lo])/(this.lengths[lo+1]-this.lengths[lo]);
  const ta=this.tangents[lo],tb=this.tangents[lo+1];
  const heading=Math.atan2(ta.x+(tb.x-ta.x)*t,ta.z+(tb.z-ta.z)*t)+(direction<0?Math.PI:0);
  return {x:a.x+(b.x-a.x)*t-Math.cos(heading)*offset,z:a.z+(b.z-a.z)*t+Math.sin(heading)*offset,heading,s};
 }
 nearest(x,z,full=false) {
  const candidates=full?this.points.slice(0,-1).map((_,i)=>i):this.cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[];
  let best={distance:Infinity,s:0,x:0,z:0};
  for(const i of candidates){const a=this.points[i],b=this.points[i+1],dx=b.x-a.x,dz=b.z-a.z;
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
   const px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(x-px,z-pz);
   if(d<best.distance)best={distance:d,s:this.lengths[i]+t*(this.lengths[i+1]-this.lengths[i]),x:px,z:pz};
  }return best;
 }
}

export function gradeCoastalRoad(terrain,route) {
 const n=route.points.length-1,raw=route.points.slice(0,-1).map(p=>terrain.heightAt(p.x,p.z));
 const levels=raw.map((_,i)=>{let sum=0,w=0;for(let j=-8;j<=8;j++){const weight=9-Math.abs(j);sum+=raw[wrap(i+j,n)]*weight;w+=weight;}return Math.max(3,sum/w);});
 const cells=new Map(),R=terrain.res,step=terrain.texel,origin=terrain.origin;
 for(let i=0;i<n;i++){
  const a=route.points[i],b=route.points[i+1],dx=b.x-a.x,dz=b.z-a.z;
  const i0=Math.floor((Math.min(a.x,b.x)-17-origin)/step),i1=Math.ceil((Math.max(a.x,b.x)+17-origin)/step);
  const j0=Math.floor((Math.min(a.z,b.z)-17-origin)/step),j1=Math.ceil((Math.max(a.z,b.z)+17-origin)/step);
  for(let j=j0;j<=j1;j++)for(let k=i0;k<=i1;k++){
   const x=origin+(k+.5)*step,z=origin+(j+.5)*step,u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
   const d=Math.hypot(x-a.x-dx*u,z-a.z-dz*u),idx=j*R+k;
   if(d>17||cells.has(idx)&&cells.get(idx).d<=d)continue;
   cells.set(idx,{d,y:levels[i]*(1-u)+levels[(i+1)%n]*u});
  }
 }
 for(const [k,{d,y}] of cells){
  const t=Math.max(0,Math.min(1,(d-7)/10)),weight=1-t*t*(3-2*t);
  terrain.heights[k]+=(y-terrain.heights[k])*weight;terrain.rock[k]*=1-weight;
  terrain.path[k]=Math.round(255*weight);terrain.sand[k]*=1-weight;
 }
}

function ribbon(terrain,route,start,end,left,right,lift) {
 const positions=[],indices=[];
 const steps=Math.max(1,Math.ceil((end-start)/2));
 for(let i=0;i<=steps;i++)for(const offset of [left,right]){
  const p=route.sample(start+(end-start)*i/steps,1,offset);
  positions.push(p.x,terrain.heightAt(p.x,p.z)+lift,p.z);
 }
 for(let i=0;i<steps;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export class CoastalRoads {
 constructor(scene,terrain) {
  this.group=new Group();this.group.name='The coastal drive';scene.add(this.group);
  const route=terrain.coastalRoute,material=createPropMaterial('sun-warmed coastal asphalt');
  material.side='double';material.surface+='\ns.albedo *= 0.9 + gpNoise(in.P * 19.0) * 0.2;\n';
  // Short independently culled batches keep the road cheap across the big map.
  for(let start=0;start<route.length;start+=240){
   const end=Math.min(route.length,start+240),parts=[];
   const strip=(a,b,l,r,color,lift=.09)=>parts.push(prepare(ribbon(terrain,route,a,b,l,r,lift),{color,rough:.96}));
   strip(start,end,-4.7,4.7,0x9a9075,.06);
   strip(start,end,-ROAD_HALF_WIDTH,ROAD_HALF_WIDTH,0x646861,.10);
   for(const side of [-1,1]){
    strip(start,end,side*3.85-.07,side*3.85+.07,0xd8d0ad,.12);
    strip(start,end,side*.14-.045,side*.14+.045,0xcead55,.13);
   }
   const mesh=new Mesh(mergePrepared(parts),material);this.group.add(mesh);
  }
 }
}
