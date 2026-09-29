import { COAST_VIEW } from './ViewQuality.js';
import { mulberry32, smoothstep } from '../util/Noise.js';
import { SETTLEMENTS } from './Settlements.js';
import { INLAND, regionAt } from './Geography.js';
import { COAST_DRIVE } from './Coastline.js';
import { PLACES } from './Region.js';

let cityGreenery = [];
export async function loadCityGreenery( read = null ) {
 if ( read ) { cityGreenery = await read('city-greenery.json'); return; }
 const response = await fetch(`${import.meta.env.BASE_URL}geodata/city-greenery.json`);
 if (!response.ok) throw new Error('City greenery could not load');
 cityGreenery = await response.json();
}

const TAU = Math.PI * 2;
// Profiles use the same crown atlas: narrow, soaring northern trees; spreading
// oak/cypress silhouettes further south. Young trees form a second canopy layer.
export const FOREST_PROFILES = Object.freeze({
 north: { width: [1.1, 1.8], height: [1.65, 2.6], weight: 4, fern: .94 },
 bay: { width: [1.05, 1.75], height: [.85, 1.35], weight: 2, fern: .60 },
 central: { width: [1.05, 1.8], height: [.72, 1.15], weight: 2, fern: .42 },
 south: { width: [.85, 1.55], height: [.60, .95], weight: 1, fern: .08 },
});

// Fixed statewide budgets, concentrated into walkable woodland instead of a
// sparse uniform dusting. All placement happens once; camera movement queries
// spatial grids in InstanceLOD, never rerolls plants or searches the whole coast.
export function scatterCalifornia( site, seed ) {
 const random = mulberry32(seed), t = site.terrain;
 const out = {palms:[], trees:[], bananas:[], shrubs:[], youngPalms:[], ferns:[], monsteras:[], elephantEars:[], heliconias:[], strelitzias:[]};
 const clearings = t.clearings || [];
 const inside = (x, z, places, pad = 0) => places.some(p => (p.x-x)**2 + (p.z-z)**2 < (p.radius+pad)**2);
 const allowed = (x, z, small = false) => {
  if (t.streets?.inCity(x,z) || inside(x,z,SETTLEMENTS,5)) return false;
  if (inside(x,z,clearings,small?1:7) || t.pathDistance(x,z)<(small?1.5:4)) return false;
  if (-t.coastDistance(x,z).d>INLAND+80) return false;
  return t.heightAt(x,z)>3 && site.rock(x,z)<.48 && site.normalY(x,z)>.83 && site.obstacleDist(x,z)>(small?3:7) && site.spawnDist(x,z)>8;
 };
 const mix = (range) => range[0]+random()*(range[1]-range[0]);
 // Keep a little breathing room around trunks. A tiny placement grid avoids
 // coincident trees even where two groves overlap, without all-pairs checks.
 const occupied = new Map();
 const claim = (x,z,size) => {
  const key = `${Math.floor(x/size)},${Math.floor(z/size)},${size}`;
  if (occupied.has(key)) return false;
  occupied.set(key,true); return true;
 };
 for (const [x,z,kind,s] of cityGreenery) {
  if (!out[kind] || kind==='trees' && out.trees.length>=COAST_VIEW.maxTrees) continue;
  const y=t.heightAt(x,z); if(y<2 || t.pathDistance(x,z)<1.5) continue;
  const sy=.85,yaw=random()*TAU;
  out[kind].push({x,y:y-.1,z,s,sy,yaw,la:yaw,l:kind==='palms'?.04:sy,H:(kind==='palms'?11:12.5)*s*sy,seed:random()});
 }
 const naturalTrees = [];
 const addTree = (x,z,profile) => {
  if (out.trees.length>=COAST_VIEW.maxTrees || !claim(x,z,4.5)) return false;
  const young=random()<.23, s=mix(profile.width)*(young?.63:1), sy=mix(profile.height)*(young?.7:1), yaw=random()*TAU;
  // Select the existing cool evergreen palettes in the north. The fractional
  // seed still varies independently across the three crown silhouettes.
  const palette = profile===FOREST_PROFILES.north ? (random()<.55?3:0) : Math.floor(random()*4);
  const plantSeed = (Math.floor(random()*5)+(palette+random())/4)/5.31;
  const record={x,y:site.groundY(x,z,.5)-.1,z,s,sy,yaw,la:yaw,l:sy,H:12.5*s*sy,seed:plantSeed};
  out.trees.push(record); naturalTrees.push({record,profile}); return true;
 };
 const addShrub = (x,z,profile) => {
  if (out.shrubs.length>=COAST_VIEW.maxShrubs || !claim(x,z,1.8)) return;
  const s=.5+random()*(profile===FOREST_PROFILES.north?1.2:1.5), sy=.62+random()*.52, yaw=random()*TAU;
  out.shrubs.push({x,y:site.groundY(x,z,.3)-.08,z,s,sy,yaw,la:yaw,l:-sy,H:1.6*s*sy,seed:random()});
 };

 // Five woodland pockets around each place make sheltered forest edges,
 // little openings and legible paths. Town plazas retain their exclusion zone.
 const groves=[];
 for (const place of PLACES.filter(p=>!p.water && p.kind!=='neighborhood' && !p.major)) {
  const profile=FOREST_PROFILES[place.region] || FOREST_PROFILES[regionAt(place.x,place.z)];
  const forest=place.style==='forest' || place.id==='big-sur' || place.kind==='grove';
  const weight=profile.weight+(forest?4:0), turn=random()*TAU;
  for (let j=0;j<5;j++) {
   const angle=turn+j*TAU/5, distance=(place.kind==='town'?place.radius:20)+48+random()*40;
   const grove={x:place.x+Math.cos(angle)*distance,z:place.z+Math.sin(angle)*distance,profile,radius:forest?49:40,forest};
   for(let w=0;w<weight;w++) groves.push(grove);
  }
 }
 // Reserve some crowns for road-side stands so long journeys still find trees.
 const groveLimit=out.trees.length+Math.floor((COAST_VIEW.maxTrees-out.trees.length)*.86);
 for (let i=0;i<90000 && (out.trees.length<groveLimit || out.shrubs.length<COAST_VIEW.maxShrubs*.80);i++) {
  const grove=groves[i%groves.length], a=random()*TAU, r=Math.sqrt(random())*grove.radius;
  const x=grove.x+Math.cos(a)*r,z=grove.z+Math.sin(a)*r;
  if (!allowed(x,z)) continue;
  if (i%3===0 && out.trees.length<groveLimit) addTree(x,z,grove.profile);
  else if(out.shrubs.length<COAST_VIEW.maxShrubs*.80) addShrub(x,z,grove.profile);
 }
 for(let i=0;i<50000 && (out.trees.length<COAST_VIEW.maxTrees || out.shrubs.length<COAST_VIEW.maxShrubs);i++) {
  const point=COAST_DRIVE[Math.floor(random()*COAST_DRIVE.length)], a=random()*TAU, r=18+random()*95;
  const x=point[0]+Math.cos(a)*r,z=point[1]+Math.sin(a)*r;
  if (!allowed(x,z)) continue;
  const profile=FOREST_PROFILES[regionAt(x,z)];
  if(i%3===0 && out.trees.length<COAST_VIEW.maxTrees) addTree(x,z,profile);
  else addShrub(x,z,profile);
 }
 // Fern drifts hug actual crowns: shaded northern floors are lush, southern
 // chaparral stays open. No new material, atlas, or distant draw call is needed.
 for(const {record:p,profile} of naturalTrees) {
  if(random()>profile.fern) continue;
  for(let j=0;j<4 && out.ferns.length<COAST_VIEW.maxFerns;j++) {
   const a=random()*TAU,r=2+random()*5.5,x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;
   if(!allowed(x,z,true) || !claim(x,z,1.2)) continue;
   const s=.7+random()*.95;
   out.ferns.push({x,y:site.groundY(x,z,.25)-.03,z,s,yaw:random()*TAU,la:0,l:0,H:.05,seed:random()});
  }
  if(out.ferns.length>=COAST_VIEW.maxFerns) break;
 }
 // Ornamental harbor palms connect the original little village to the mainland.
 const harborPalmTarget=out.palms.length+28;
 for(let i=0;i<100 && out.palms.length<harborPalmTarget;i++) {
  const x=(random()-.5)*240,z=-80-random()*140,h=t.heightAt(x,z);
  if(h<2||site.obstacleDist(x,z)<9||site.spawnDist(x,z)<10||inside(x,z,clearings))continue;
  const s=.8+random()*.3;out.palms.push({x,y:h-.1,z,s,yaw:random()*TAU,la:0,l:.04,H:11*s,seed:random()});
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
