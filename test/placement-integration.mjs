import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU } from '../src/engine/gpu/GPU.js';
import { Scene, Vector3 } from '../src/engine/index.js';
import { realTerrain } from './real-data.mjs';
import { CoastalTowns } from '../src/california/CoastalTowns.js';
import { PLACES } from '../src/california/Region.js';
import { Colliders } from '../src/world/Colliders.js';
import { IslandLife } from '../src/exploration/IslandLife.js';
import { LetterLanterns } from '../src/exploration/LetterLanterns.js';
import { safeAt } from '../src/exploration/Navigation.js';

await GPU.init({headless:true});
const app={scene:new Scene(),terrainData:await realTerrain(),colliders:new Colliders()};
const towns=app.coastalTowns=new CoastalTowns(app),harbor=PLACES.find(p=>p.id==='harbor');
towns.syncColliders(harbor);
// Reproduce actual startup: the collision pool knows only the harbor when
// distant colonies are seeded. Static town footprints must still protect them.
const life=new IslandLife(app.scene,app.terrainData,app.colliders,{
 california:true,placementClear:(x,z)=>!towns.containsBuilding(x,z,1.3),
});
const lanterns=new LetterLanterns(app);
assert.equal(life.animals.length,102,'placement preserves every regional colony');
for(const animal of life.animals){
 towns.syncColliders(animal.home);
 assert.ok(safeAt(app.terrainData,app.colliders,animal.home.x,animal.home.z),`${animal.kind}@${animal.habitat} starts clear of streamed town buildings`);
}
for(const resident of life.residents){
 towns.syncColliders(resident.home);
 assert.ok(safeAt(app.terrainData,app.colliders,resident.home.x,resident.home.z),`${resident.id} remains approachable`);
}
for(const [id,site]of lanterns.sites){
 towns.syncColliders(site.position);
 assert.ok(safeAt(app.terrainData,app.colliders,site.position.x,site.position.z,!!site.place.water,id==='home'?3:.6),`letter ${id} and its footprint clear nearby buildings`);
}
console.log('ok 102 wildlife homes, nine residents and six letter sites clear full streamed town collisions');

for(const id of ['big-sur','redwoods','mendocino']){
 const place=PLACES.find(p=>p.id===id),animals=life.animals.filter(a=>a.habitat===id);
 // Keep a different town in the pool to verify the independent footprint
 // callback also prevents wandering through an as-yet unstreamed building.
 towns.syncColliders(harbor);
 const player={mode:'walk',position:new Vector3(place.x,app.terrainData.heightAt(place.x,place.z),place.z),velocity:new Vector3()};
 for(let i=0;i<900;i++)life.update(1/60,player);
 towns.syncColliders(place);
 for(const animal of animals){
  const p=animal.group.position;
  assert.ok(safeAt(app.terrainData,app.colliders,p.x,p.z),`${animal.kind}@${id} wanders safely while its town colliders are not loaded`);
 }
}
console.log('ok woodland wildlife respects town footprints even before collider streaming');
await GPU.device.queue.onSubmittedWorkDone();
process.exit(0);
