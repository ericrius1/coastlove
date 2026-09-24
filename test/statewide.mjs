import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU } from '../src/engine/gpu/GPU.js';
import { Scene, Vector3, PerspectiveCamera } from '../src/engine/index.js';
import { CaliforniaTerrain } from '../src/california/CaliforniaTerrain.js';
import { CoastalTowns } from '../src/california/CoastalTowns.js';
import { SETTLEMENTS, SHOWCASE_CITIES } from '../src/california/Settlements.js';
import { PLACES, CALIFORNIA_STORIES } from '../src/california/Region.js';
import { RegionalBirds, habitatSpecies, MAX_REGIONAL_BIRDS } from '../src/california/RegionalBirds.js';
import { BIRD } from '../src/world/wildlife/BirdShapes.js';
import { Colliders } from '../src/world/Colliders.js';
import { safeAt, findSafeSpot } from '../src/exploration/Navigation.js';
import { Traffic } from '../src/exploration/Traffic.js';
import { Seaplane } from '../src/exploration/Seaplane.js';

const terrain = new CaliforniaTerrain();
const placement = SETTLEMENTS.map(t => [t.id,t.x,t.z]);
terrain.generate();
assert.deepEqual(SETTLEMENTS.map(t => [t.id,t.x,t.z]), placement, 'rebuilding does not drift geographic anchors');
for (const story of CALIFORNIA_STORIES.filter(s=>s.site)) {
 const town=SETTLEMENTS.find(t=>t.id===story.site);
 assert.ok(Math.hypot(story.x-town.x,story.z-town.z)>5,'residents stand clear of town arrivals');
 assert.ok(Math.hypot(story.x-town.x,story.z-town.z)<20);
}
await GPU.init({headless:true});
const app={scene:new Scene(),terrainData:terrain,colliders:new Colliders(),player:{mode:'walk',position:new Vector3(),velocity:new Vector3()},camera:new PerspectiveCamera(60,1,.1,65536),input:{enabled:true,down:()=>false,consumeLook:()=>({x:0,y:0})},exploration:{life:{residents:[]}}};
const towns=new CoastalTowns(app);app.coastalTowns=towns;
assert.ok(towns.buildingCount>600&&towns.buildingCount<1000);
for(const id of SHOWCASE_CITIES)assert.ok(towns.groups.find(g=>g.town.id===id).boxes.length>65,`${id} is a substantial district`);
assert.equal(towns.pool.length,480);
for(const place of PLACES){
 towns.syncColliders(place);
 const p=findSafeSpot(terrain,app.colliders,place.x,place.z,!!place.water,180);
 assert.ok(p,`${place.label} arrival exists with buildings`);
 assert.ok(safeAt(terrain,app.colliders,p.x,p.z,!!place.water,place.water?5:.6),`${place.label} arrival clears building geometry`);
}
console.log('ok stable geography, 40 arrivals with city collisions,',towns.buildingCount,'buildings, bounded collider pool');
const tower=towns.groups.find(g=>g.town.id==='los-angeles').boxes.find(b=>b.half.y>15);
const plane=new Seaplane(app.scene,terrain,(...args)=>towns.flightClearance(...args));
plane.launch(new Vector3(tower.x,0,tower.z),0);
assert.ok(plane.position.y>tower.y+tower.half.y+15,'launch clears rooftop');
plane.position.set(tower.x,tower.y+tower.half.y-10,tower.z-30);
for(let i=0;i<120;i++){
 plane.update(1/60,app.input,app.camera);
 const roof=towns.flightClearance(plane.position.x,plane.position.z,plane.position.x,plane.position.z);
 assert.ok(plane.position.y>=roof+15,'flight never intersects a city roof');
}
console.log('ok plane launch and low flight clear city rooftops');
const traffic=new Traffic(app);
for(const town of SETTLEMENTS){
 app.player.position.set(town.x,terrain.heightAt(town.x,town.z),town.z);towns.syncColliders(app.player.position);traffic.populate(true);
 const local=traffic.cars.filter(c=>Math.hypot(c.position.x-town.x,c.position.z-town.z)<town.radius+600);
 assert.ok(local.length>=6,`${town.id} gets nearby traffic after a cross-state visit (${local.length})`);
 for(const c of local)assert.ok(traffic.groundSafe(c.position.x,c.position.z,1.5));
}
for(const route of terrain.routes)for(let s=0;s<route.length;s+=16)for(const dir of [-1,1]){
 const p=route.sample(s,dir);assert.ok(traffic.groundSafe(p.x,p.z,1.5),`road grades remain drivable on ${route.id} at ${s}`);
}
console.log('ok traffic follows all 30 town visits, both lanes of every route remain drivable');
assert.ok(habitatSpecies('south').includes(BIRD.TERN));
assert.ok(!habitatSpecies('north').includes(BIRD.TERN));
assert.deepEqual(habitatSpecies('north',true),[BIRD.JAY,BIRD.FRIGATE]);
assert.deepEqual(habitatSpecies('south',true),[BIRD.FRIGATE]);
const birds=new RegionalBirds(terrain);
for(const town of SETTLEMENTS){
 app.camera.position.set(town.x,terrain.heightAt(town.x,town.z)+20,town.z);
 let count=0;
 for(let frame=0;frame<10;frame++){
  count=0;birds.update(1/60,{write:p=>{count++;assert.ok(p.scale>=0&&Number.isFinite(p.scale));}},app.camera);
  assert.ok(count>0&&count<=MAX_REGIONAL_BIRDS);
 }
 for(const flock of birds.flocks.filter(f=>f.visible))for(const f of flock.birds)assert.ok(f.y>=terrain.heightAt(f.x,f.z)+7,'birds remain above terrain');
}
console.log('ok regional bird habitats, active flocks in every town, fixed',MAX_REGIONAL_BIRDS,'bird budget');
await GPU.device.queue.onSubmittedWorkDone();
process.exit(0);
