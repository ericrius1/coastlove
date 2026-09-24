import { COAST_VIEW } from './ViewQuality.js';
import { mulberry32, smoothstep } from '../util/Noise.js';
import { SETTLEMENTS } from './Settlements.js';
import { INLAND, regionAt } from './Geography.js';
import { COAST_DRIVE } from './Coastline.js';
import { PLACES } from './Region.js';

let cityGreenery=[];
export async function loadCityGreenery(){
 const response=await fetch(`${import.meta.env.BASE_URL}geodata/city-greenery.json`);
 if(!response.ok)throw new Error('City greenery could not load');cityGreenery=await response.json();
}
// A fixed population, independent of map area. The existing instanced vegetation
// renderer supplies near meshes, distant impostors and stable distance fading.
export function scatterCalifornia( site, seed ) {
 const random = mulberry32(seed), t = site.terrain;
 const out = {palms:[], trees:[], bananas:[], shrubs:[], youngPalms:[], ferns:[], monsteras:[], elephantEars:[], heliconias:[], strelitzias:[]};
 const anchors = PLACES.filter(p=>!p.water);
 for(const[x,z,kind,s]of cityGreenery){
  const y=t.heightAt(x,z);if(y<2||t.pathDistance(x,z)<1.5)continue;
  const sy=.85,yaw=random()*Math.PI*2;
  out[kind].push({x,y:y-.1,z,s,sy,yaw,la:yaw,l:kind==='palms'?.04:sy,H:(kind==='palms'?11:12.5)*s*sy,seed:random()});
 }
 for (let i=0;i<170000;i++) {
  const anchor=anchors[i%anchors.length], local=random()<.65;
  const angle=random()*Math.PI*2, radius=35+Math.sqrt(random())*(anchor.kind==='grove'?180:350);
  const point=COAST_DRIVE[Math.floor(random()*COAST_DRIVE.length)];
  const x=local?anchor.x+Math.sin(angle)*radius:point[0]+(random()-.5)*700;
  const z=local?anchor.z+Math.cos(angle)*radius:point[1]+(random()-.5)*700;
  if(t.streets?.inCity(x,z)||SETTLEMENTS.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+5))continue;
  if(-t.coastDistance(x,z).d>INLAND+80)continue;
  const h=t.heightAt(x,z), rock=site.rock(x,z);
  if(h<3 || rock>.48 || site.normalY(x,z)<.83 || site.obstacleDist(x,z)<7 || site.spawnDist(x,z)<8)continue;
  if(t.clearings.some(c=>Math.hypot(c.x-x,c.z-z)<c.radius+3))continue;
  if(t.pathDistance(x,z)<3)continue;
  const tree=(i%5===0 || anchor.kind==='grove'&&i%3===0) && out.trees.length<COAST_VIEW.maxTrees;
  if(!tree&&out.shrubs.length>=COAST_VIEW.maxShrubs)continue;
  const s=tree?(regionAt(x,z)==='north'?1.3+random()*.8:.7+random()*.75):.6+random()*1.1, sy=tree?.7+random()*.3:.75+random()*.4, yaw=random()*Math.PI*2;
  out[tree?'trees':'shrubs'].push({x,y:site.groundY(x,z,.4)-.12,z,s,sy,yaw,la:yaw,l:tree?sy:-sy,H:(tree?12.5:1.6)*s*sy,seed:random()});
 }
 // Ornamental harbor palms connect the original little village to the mainland.
 for(let i=0;i<100&&out.palms.length<28;i++) {
  const x=(random()-.5)*240,z=-80-random()*140,h=t.heightAt(x,z);
  if(h<2||site.obstacleDist(x,z)<9||site.spawnDist(x,z)<10||t.clearings.some(c=>Math.hypot(c.x-x,c.z-z)<c.radius))continue;
  const s=.8+random()*.3;out.palms.push({x,y:h-.1,z,s,yaw:random()*6.28,la:0,l:.04,H:11*s,seed:random()});
 }
 return out;
}
export function californiaGrass(site) {
 const t=site.terrain,res=1024,data=new Uint8Array(res*res*4),step=t.size/res;
 for(let j=1;j<res-1;j++)for(let i=1;i<res-1;i++){
  const x=t.origin+(i+.5)*step,z=t.origin+(j+.5)*step,h=t.heightAt(x,z);
  if(SETTLEMENTS.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+30))continue;
  if(h<2||site.rock(x,z)>.5||site.obstacleDist(x,z)<5||site.spawnDist(x,z)<6||t.pathDistance(x,z)<6)continue;
  const patch=.55+.45*smoothstep(-.4,.5,site.noise.noise(x/36,z/36));
  const k=(j*res+i)*4;
  data[k]=Math.round(130*(1-smoothstep(3,12,h))*patch);
  data[k+1]=Math.round(180*smoothstep(2,10,h)*patch);
  data[k+2]=Math.round(60*(1-smoothstep(5,15,h))*patch);
 }
 return {data,res};
}
