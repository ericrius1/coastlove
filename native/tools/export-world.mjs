// Build-time conversion only. The desktop executable never runs JavaScript.
import '../../test/headless.mjs';
import {writeFile, mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {exportRendering} from './export-rendering.mjs';
import {BANK} from '../../src/audio/soundBank.js';
import {realTerrain} from '../../test/real-data.mjs';
import {Scene, Matrix4, Vector3} from '../../src/engine/index.js';
import {Colliders} from '../../src/world/Colliders.js';
import {Village} from '../../src/world/Village.js';
import {CoastalTowns} from '../../src/california/CoastalTowns.js';
import {Landmarks} from '../../src/california/Landmarks.js';
import {GoldenGate} from '../../src/california/GoldenGate.js';
import {StuntRamps} from '../../src/california/StuntRamps.js';
import {IslandLife} from '../../src/exploration/IslandLife.js';
import {LetterLanterns} from '../../src/exploration/LetterLanterns.js';
import {BoatModel} from '../../src/world/BoatModel.js';
import {Seaplane} from '../../src/exploration/Seaplane.js';
import {makeCar} from '../../src/exploration/CarModel.js';
import {buildCoastField} from '../../src/california/CoastField.js';
import {PLACES, CALIFORNIA_STORIES} from '../../src/california/Region.js';
import {TIDE_LETTERS} from '../../src/exploration/TideLetters.js';
import {WILDLIFE_SPECIES} from '../../src/exploration/Wildlife.js';
import {GPU} from '../../src/engine/gpu/GPU.js';

const out = new URL('../assets/', import.meta.url);
await mkdir(out, {recursive:true});
// Decode the browser's Opus assets once at build time. Shipping plain PCM keeps
// the native runtime and Windows build independent of external codec libraries.
const audioNames=['wind','palms','crickets','surf_far','boat_lap','boat_engine','bird_forest','birds_dawn','bird_dove','gull','step_grass','step_sand','step_wood','step_water'];
await mkdir(new URL('audio/',out),{recursive:true});
for(const name of audioNames){
 const result=spawnSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',fileURLToPath(new URL(`../../public/audio/${name}.ogg`,import.meta.url)),'-ar','24000','-ac','2','-f','s16le',fileURLToPath(new URL(`audio/${name}.pcm`,out))],{stdio:'inherit'});
 if(result.error||result.status!==0)throw new Error('Install FFmpeg (or set FFMPEG to its executable) to convert the Opus sound bank for the native app.');
}
await writeFile(new URL('audio.json',out),JSON.stringify(Object.fromEntries(audioNames.map(name=>[name,{rate:24000,channels:2,slices:BANK[name].slices||[]}]))));
await GPU.init({headless:true});
const terrain = await realTerrain(), scene = new Scene(), colliders = new Colliders();
const app = {scene, terrainData:terrain, colliders, localLights:{add:v=>v}};
new Village({scene, terrain, colliders});
const towns = new CoastalTowns(app);
new Landmarks(app); new GoldenGate(app); new StuntRamps(app);
const letters = new LetterLanterns(app);
const life = new IslandLife(scene, terrain, colliders, {california:true, loadCharacters:false,
  placementClear:(x,z)=>!towns.containsBuilding(x,z,1.3)});
const entities=[], roots=new Map();
function entity(root, kind, id, joints={}) {
  const index=entities.length;
  entities.push({kind,id,position:root.getWorldPosition(new Vector3()).toArray(),heading:root.rotation.y});
  roots.set(root,{index,joints});
}
for(const a of life.animals) entity(a.group,a.kind,`${a.kind}-${entities.length}`,{legs:a.legs,wings:a.wings,head:a.head});
for(const r of life.residents) entity(r.vendor.group,'resident',r.id);
for(const [id,site] of letters.sites) entity(site.lights,'letterLight',id);
const boat=new BoatModel(); scene.add(boat.group); entity(boat.group,'boat','boat');
const plane=new Seaplane(scene,terrain); entity(plane.group,'plane','plane',{propeller:plane.propeller});
const car=makeCar(0); scene.add(car.group); entity(car.group,'car','car',{wheels:car.wheels});
scene.updateMatrixWorld(true);
const geoms=[], geomMap=new Map(), vertices=[], indices=[], draws=[], townPlants=[];
function geometry(g,material) {
  // A material color is needed for the few meshes without vertex colors.
  const emissive=material?.emissive;
  const glow=/glow|letterLight|lamp|biolum/i.test(material?.name||'') || emissive&&(emissive.r+emissive.g+emissive.b)>0 ? 2 : 0;
  const category=({VillageWood:10,VillageRoofMetal:11,VillageThatch:12,VillageHard:13,VillageStone:14,VillageFabric:15})[material?.name]||glow;
  const key=`${g.id}:${material?.color?.getHex?.()||0}:${category}`;
  if(geomMap.has(key))return geomMap.get(key);
  const p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color||g.attributes.tint,uv=g.attributes.uv,aux=g.attributes.aux;
  if(!p||!p.count)return -1;
  if(!n)g.computeVertexNormals();
  const normal=g.attributes.normal;
  const index=g.index?.array||Array.from({length:p.count},(_,i)=>i);
  const start=g.drawRange?.start||0, end=Math.min(index.length,start+(g.drawRange?.count??Infinity));
  const used=[...new Set(index.slice(start,end))], remap=new Map(used.map((v,i)=>[v,i]));
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const i of used)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p.array[i*3+k]);hi[k]=Math.max(hi[k],p.array[i*3+k]);}
  const center=lo.map((v,k)=>(v+hi[k])/2),radius=Math.hypot(...hi.map((v,k)=>(v-lo[k])/2));
  const first=indices.length,base=vertices.length/16;
  for(const i of used)vertices.push(
    ...center.map((v,k)=>p.array[i*3+k]-v),
    ...[0,1,2].map(k=>normal.array[i*3+k]),
    ...[0,1,2].map(k=>c?c.array[i*c.itemSize+k]:[material?.color?.r??.5,material?.color?.g??.6,material?.color?.b??.4][k]),
    uv?.array[i*2]||0,uv?.array[i*2+1]||0,category+(aux?.array[i*4+3]>0?.25:0),
    ...[0,1,2,3].map(k=>category>=10&&g.attributes.vdata?g.attributes.vdata.array[i*4+k]:[aux?.array[i*4]??material?.roughness??.8,aux?.array[i*4+1]??material?.metalness??0,aux?.array[i*4+2]??0,1][k]));
  for(let j=start;j<end;j++)indices.push(base+remap.get(index[j]));
  const id=geoms.length;geoms.push({first,count:indices.length-first,center,radius});geomMap.set(key,id);return id;
}
function visit(o,root=null,visible=true){
  if(roots.has(o)){root={...roots.get(o),inverse:o.matrixWorld.clone().invert()};visible=true;}
  else visible=visible&&o.visible;
  if(o.isInstancedMesh&&o.material===towns.propMaterial){
    for(let i=0;i<o.count;i++){const m=new Matrix4();o.getMatrixAt(i,m);m.premultiply(o.matrixWorld);const e=m.elements;townPlants.push({position:[e[12],e[13],e[14]],scale:Math.hypot(e[0],e[1],e[2]),heading:Math.atan2(e[8],e[10]),kind:e[14]<-600000?1:3});}
    return;
  }
  if(o.isMesh&&visible&&o.material?.blending!=='additive'){
    const geo=geometry(o.geometry,Array.isArray(o.material)?o.material[0]:o.material);
    if(geo>=0){
      const count=o.isInstancedMesh?o.count:1;
      for(let i=0;i<count;i++){
        let matrix=o.matrixWorld.clone();
        if(o.isInstancedMesh){const m=new Matrix4();o.getMatrixAt(i,m);matrix.multiply(m);}
        if(root)matrix.premultiply(root.inverse);
        matrix.multiply(new Matrix4().makeTranslation(...geoms[geo].center));
        let joint='';
        if(root)for(const [name,v]of Object.entries(root.joints))if(v===o||(Array.isArray(v)&&v.includes(o)))joint=name;
        draws.push({geometry:geo,matrix:[...matrix.elements],entity:root?.index??-1,joint});
      }
    }
  }
  for(const c of o.children)visit(c,root,visible);
}
visit(scene);
const points = p=>[p.x,p.y,p.z];
const roads=[...terrain.routes.map(r=>({width:10,bridge:false,points:r.points.map(points)})),
  ...terrain.streets.routes.filter(r=>!r.tunnel).map(r=>({width:r.width,bridge:!!r.bridge,points:r.points.map(points)}))];
const boxes=colliders.boxes.filter(b=>b.center.x<1e7).map(b=>({center:points(b.center),half:points(b.half),angle:b.rotY||Math.atan2(b.sin,b.cos),solid:b.solid,walkable:b.walkable}));
for(const {boxes:bs}of towns.groups)for(const b of bs)boxes.push({center:[b.x,b.y,b.z],half:points(b.half),angle:0,solid:true,walkable:false});
const metadata={version:2,geometries:geoms,draws,entities,townPlants,pads:terrain.pads,roads,boxes,
  cylinders:colliders.cylinders,ramps:terrain.stuntRamps,
  places:PLACES.map(({route,...p})=>p),stories:CALIFORNIA_STORIES.map(s=>({...s,position:life.residents.find(r=>r.id===s.id).position.toArray()})),
  letters:TIDE_LETTERS.map(l=>({...l,position:letters.sites.get(l.id).position.toArray()})),species:WILDLIFE_SPECIES};
await Promise.all([
  writeFile(new URL('world.json',out),JSON.stringify(metadata)),
  writeFile(new URL('vertices.bin',out),Buffer.from(new Float32Array(vertices).buffer)),
  writeFile(new URL('indices.bin',out),Buffer.from(new Uint32Array(indices).buffer)),
]);
console.log(`Native export: ${geoms.length} shared meshes, ${draws.length} instances, ${entities.length} entities, ${indices.length/3} unique triangles, ${roads.length} roads.`);
console.log(`Assets: ${((vertices.length+indices.length)*4/1048576).toFixed(1)} MiB geometry; world metadata ${JSON.stringify(metadata).length/1048576|0} MiB.`);
await writeFile(new URL('coast-mask.bin',out),Buffer.from(Int16Array.from(buildCoastField(),Math.round).buffer));
await exportRendering(out);
GPU.device.destroy();
process.exit(0);
