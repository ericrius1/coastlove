// Real WebGPU compilation and animated-pixel check for the grotto and letter
// lights. The harness supplies a plain background, not the game's full ocean.
import assert from 'node:assert/strict';
import { setupLife } from './life-harness.mjs';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { G, FrameUniforms } from '../src/engine/render/Frame.js';
import { Landmarks } from '../src/california/Landmarks.js';
import { LetterLanterns } from '../src/exploration/LetterLanterns.js';
import { TideLetters, TIDE_LETTERS } from '../src/exploration/TideLetters.js';
import { PLACES } from '../src/california/Region.js';
import { Colliders } from '../src/world/Colliders.js';

const L = await setupLife({ W: 960, H: 540 });
FrameUniforms.fields.outputResolution.value.set(960,540);
const app = { scene: L.scene, terrainData: {size:2097152,heightAt:()=>10}, colliders: new Colliders(), localLights: {add: light => light} };
const landmarks = new Landmarks(app), lanterns = new LetterLanterns(app);
const letters = new TideLetters(TIDE_LETTERS.map(letter => letter.id));
L.sky = [.005,.015,.022,1];
G.sunColor.value.setRGB(.06,.07,.09); G.skyIrradiance.value.setRGB(.05,.08,.12);
const grotto = PLACES.find(place => place.id === 'grotto');
L.camera.position.set(grotto.x+35,9,grotto.z+47); L.camera.lookAt(grotto.x,2,grotto.z);
L.GPU.device.pushErrorScope('validation');
const tick = dt => { landmarks.update(dt,L.camera.position,22); lanterns.update(L.camera.position,22,letters); };
await L.run(2,tick);
const first = new Uint8Array((await readTexture(L.ldr.texture)).data);
L.frame(2,tick); await L.GPU.device.queue.onSubmittedWorkDone();
const second = new Uint8Array((await readTexture(L.ldr.texture)).data);
let changed=0;
for(let i=0;i<first.length;i+=4) if(Math.abs(first[i]-second[i])+Math.abs(first[i+1]-second[i+1])+Math.abs(first[i+2]-second[i+2])>3) changed++;
assert.ok(changed>30, `living grotto lights animate (${changed} changed pixels)`);
assert.equal(await L.GPU.device.popErrorScope(),null,'grotto and letter shaders validate');
await L.save('/tmp/coastlove-grotto-details.png');
console.log('ok grotto/letter WebGPU shaders, night visibility and animated light pixels',changed);
await L.exit();
