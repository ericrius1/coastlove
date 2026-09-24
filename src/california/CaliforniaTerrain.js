import {goldenGateDeck} from './GoldenGate.js';
import {rampHeight} from './StuntRamps.js';
import { CoastalRoute } from './CoastalRoads.js';
import { coastFieldAt } from './CoastField.js';
import { TerrainData } from '../world/TerrainData.js';
import { REGION, PLACES, CALIFORNIA_STORIES } from './Region.js';
import { SETTLEMENTS } from './Settlements.js';
import { INLAND } from './Geography.js';
import { sampleElevation } from './Elevation.js';
import { smoothstep, clamp } from '../util/Noise.js';

export function islandDistance(x,z,island){const c=Math.cos(island.angle),s=Math.sin(island.angle),dx=x-island.x,dz=z-island.z;return(Math.hypot((dx*c+dz*s)/island.rx,(-dx*s+dz*c)/island.rz)-1)*island.rz;}
// A bounded coarse atlas plus a moving 4 m height patch. Real DEMs are the
// authority for CPU queries and both rendering levels. No compressed cities.
export class CaliforniaTerrain extends TerrainData {
 constructor(){
  super(REGION.seed,{resolution:2048});this.profile='california';this.paths=[];
  this.clearings=PLACES.filter(p=>!p.water).map(p=>({x:p.x,z:p.z,radius:20}));
  this.landArea=this.heights.reduce((n,h)=>n+(h>0),0)*this.texel**2;
 }
 coastDistance(x,z){
  let d=coastFieldAt(x,z);
  const blend=(1-smoothstep(140,320,Math.abs(x)))*(1-smoothstep(120,330,Math.abs(z+42)));
  d=d*(1-blend)+(z+42)*blend;
  return{d,beachZone:blend,island:null};
 }
 rawHeight(x,z){
  let h=sampleElevation(x,z);
  // Retain the original hand-crafted starter pier in a small, smooth pad.
  const blend=(1-smoothstep(140,350,Math.abs(x)))*(1-smoothstep(140,360,Math.abs(z+42)));
  if(blend){const d=z+42;const harbor=d>0?-Math.min(70,d*.14):Math.min(8,-d*.10);h+=(harbor-h)*blend;}
  return h;
 }
 heightAt(x,z){
  let h=this.rawHeight(x,z);
  for(const pad of this.pads||[]){const d=Math.hypot(x-pad.x,z-pad.z);if(d<pad.radius+pad.falloff)h+=(pad.height-h)*(1-smoothstep(pad.radius,pad.radius+pad.falloff,d));}
  let local=null;
  for(const route of this.roadCells?.get(`${Math.floor(x/64)},${Math.floor(z/64)}`)||[]){const near=route.nearest(x,z);if(!local||near.distance<local.distance)local={...near,route};}
  if(local&&local.distance<20){const y=local.route.sample(local.s,1,0).y;h+=(y-h)*(1-smoothstep(9,20,local.distance));}
  const road=this.streets?.surfaceAt(x,z);
  // Include the sidewalk and a small graded verge. The moving terrain patch
  // samples every four metres; grading only the asphalt lets interpolated land
  // poke through the curb in alternating triangles on sloping streets.
  if(road&&!road.bridge){const blend=1-smoothstep(road.width/2+4.5,road.width/2+6,road.distance);h+=(road.height-h)*blend;}
  if(x> -247200&&x< -246400&&z> -383200&&z< -380200){
   const bridge=this.streets?.surfaceAt(x,z,true);
   if(bridge?.route.name==='Golden Gate Bridge'&&h>bridge.height)h+=(bridge.height-h)*(1-smoothstep(bridge.width/2,bridge.width/2+5,bridge.distance));
  }
  return h;
 }
 heightFn(x,z){return{h:this.heightAt(x,z),rock:.15};}
 flatten(x,z,radius,height,falloff=4){this.pads.push({x,z,radius,height,falloff});this.localRevision=(this.localRevision||0)+1;this.boundsCache?.clear();}
 pathDistance(x,z){
  let d=this.streets?.surfaceAt(x,z);let distance=d?d.distance-d.width/2:Infinity;
  for(const route of this.roadCells?.get(`${Math.floor(x/64)},${Math.floor(z/64)}`)||[])distance=Math.min(distance,route.nearest(x,z).distance-5);
  return distance;
 }
 groundHeight(x,z,maxY=Infinity){const road=this.streets?.surfaceAt(x,z,true);let h=road?.bridge&&road.distance<road.width/2&&road.height<=maxY?Math.max(this.heightAt(x,z),road.height):this.heightAt(x,z);const deck=goldenGateDeck(x,z);if(deck!==null&&deck<=maxY)h=Math.max(h,deck);for(const r of this.stuntRamps||[])h=Math.max(h,rampHeight(r,x,z));return h;}
 generate(){
  const started=performance.now();this.boundsCache=new Map();this.roadCells=null;this.pads=[];this.size=REGION.size;this.texel=this.size/this.res;this.origin=-this.size/2;
  const R=this.res,H=this.heights;
  for(let j=0;j<R;j++)for(let i=0;i<R;i++)H[j*R+i]=this.rawHeight(this.origin+(i+.5)*this.texel,this.origin+(j+.5)*this.texel);
  for(let j=1;j<R-1;j++)for(let i=1;i<R-1;i++){
   const k=j*R+i,y=H[k],slope=Math.hypot(H[k+1]-H[k-1],H[k+R]-H[k-R])/(this.texel*2);
   this.rock[k]=clamp(smoothstep(.2,.7,slope)*.8,0,1);this.sand[k]=255*(1-smoothstep(3,10,y));this.seagrass[k]=y< -1.5&&y> -16?120:0;
  }
  this.coastalRoute=new CoastalRoute();this.routes=[this.coastalRoute];this.highway=null;
  for(const town of SETTLEMENTS){
   town.level=Math.max(3,this.heightAt(town.x,town.z));
   if(['san-francisco','los-angeles'].includes(town.id))continue;
   this.flatten(town.x,town.z,town.radius+20,town.level,90);
   const r=town.radius*.75;town.route=new CoastalRoute([[-r,-r],[r,-r],[r,r],[-r,r]].map(([x,z])=>[x+town.x,z+town.z]),{id:town.id});
   this.routes.push(town.route);
  }
  for(const route of this.routes){
   const n=route.points.length-1,raw=route.points.slice(0,n).map(p=>this.heightAt(p.x,p.z));
   const h=raw.map((_,i)=>{let v=0;for(let j=-6;j<=6;j++)v+=raw[(i+j+n)%n];return Math.max(3,v/13);});
   for(let pass=0;pass<5;pass++)for(const dir of[1,-1])for(let k=0;k<n;k++){const i=dir>0?k:n-1-k,j=(i-dir+n)%n;h[i]=Math.min(h[i],h[j]+Math.hypot(route.points[i].x-route.points[j].x,route.points[i].z-route.points[j].z)*.25);}
   route.points.forEach((p,i)=>p.y=h[i%n]);
  }
  this.roadCells=new Map();
  for(const route of this.routes)for(const key of route.cells.keys()){if(!this.roadCells.has(key))this.roadCells.set(key,[]);this.roadCells.get(key).push(route);}
  this.inlandBand=INLAND;this.timings.total=performance.now()-started;
 }
 boundsFor(x0,z0,x1,z1){
  const key=`${x0},${z0},${x1-x0}`;const cached=this.boundsCache.get(key);if(cached)return cached;
  const b=super.boundsFor(x0,z0,x1,z1);
  // The coarse pyramid must enclose detailed DEM peaks and road cuts too.
  if(x1-x0<8192){for(const x of[x0,(x0+x1)/2,x1])for(const z of[z0,(z0+z1)/2,z1]){const h=this.heightAt(x,z);b[0]=Math.min(b[0],h-30);b[1]=Math.max(b[1],h+60);}}
  if(this.boundsCache.size>50000)this.boundsCache.clear();this.boundsCache.set(key,b);return b;
 }
}
