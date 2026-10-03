// Real rasterization catches precision loss that matrix-only skinning tests miss:
// a 2 cm face feature must survive even when its character is 800 km from origin.
// Uses synthetic geometry and a tiny inline normal map; no assets/image decoder.
import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU } from '../src/engine/gpu/GPU.js';
import { RenderTarget, StorageBuffer, Texture } from '../src/engine/gpu/Texture.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { skinnedMaterial } from '../src/engine/render/Skinning.js';
import { setFrameCamera } from '../src/engine/render/Frame.js';
import { setShadowMap } from '../src/engine/render/wgsl/lighting.js';
import { fromHalfFloat } from '../src/engine/math/DataUtils.js';
import { BufferAttribute, Group, Matrix4, Mesh, PerspectiveCamera, Scene, SphereGeometry } from '../src/engine/index.js';

await GPU.init({headless: true});
const errors = [];
GPU.device.addEventListener('uncapturederror', event => errors.push(event.error.message));
setShadowMap(new Texture({width: 1, height: 1, depth: 1, dimension: '2d-array', format: 'depth32float', usage: ['sample', 'render']}));
const W = 256, H = 320, JOINTS = 3;
const geometry = new SphereGeometry(1, 96, 64).scale(.32, .9, .23).translate(0, .9, 0);
const indices = new Uint32Array(geometry.attributes.position.count * 4);
const weights = new Float32Array(indices.length);
for (let i = 0; i < geometry.attributes.position.count; i++) {
 const y = geometry.attributes.position.getY(i);
 const blend = Math.max(0, Math.min(2, (y - .42) / .5));
 indices.set([0, 1, 2, 0], i * 4);
 weights.set([Math.max(0, 1 - blend), 1 - Math.abs(blend - 1), Math.max(0, blend - 1), 0], i * 4);
}
geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4));
geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
const normalPixels = flat => {
 const data = new Uint8Array(4 * 4 * 4);
 for (let i = 0; i < 16; i++) {
  const nx = flat ? 0 : .36 + (i % 4) * .07;
  const ny = flat ? 0 : -.3 + Math.floor(i / 4) * .14;
  const nz = Math.sqrt(1 - nx * nx - ny * ny);
  data.set([nx, ny, nz].map(n => Math.round((n * .5 + .5) * 255)).concat(255), i * 4);
 }
 return data;
};
const normal = new Texture({width: 4, height: 4, format: 'rgba8unorm', data: normalPixels(false)});
const joints = new StorageBuffer({label: 'precision fixture joints', count: JOINTS * 2, type: 'mat4x4f'});
const material = skinnedMaterial({name: 'precision normal probe', joints: JOINTS, jointBuffer: joints, textures: {normal}});
material.lit = false;
material.output = 'r.color = vec4f( s.normal * 0.5 + 0.5, 1.0 );';
const mesh = new Mesh(geometry, material);
mesh.frustumCulled = false;
mesh.position.set(.073, .021, -.037);
mesh.rotation.x = .08;
const parent = new Group(); parent.add(mesh);
parent.rotation.y = .27;
parent.scale.set(1.07, .97, .91);
const scene = new Scene(); scene.add(parent);
const camera = new PerspectiveCamera(35, W / H, .05, 100);
const renderer = new MeshRenderer();
const target = new RenderTarget(W, H, {colors: ['rgba8unorm', 'rgba16float', 'rgba8unorm'], depth: 'depth32float'});
const pose = amount => {
 const result = new Float32Array(JOINTS * 16);
 for (let j = 0; j < JOINTS; j++) {
  const pivot = j * .55;
  const matrix = new Matrix4().makeTranslation(0, pivot, 0)
   .multiply(new Matrix4().makeRotationZ(amount * j))
   .multiply(new Matrix4().makeTranslation(0, -pivot, 0));
  result.set(matrix.elements, j * 16);
 }
 return result;
};
const current = pose(.105), previous = pose(.065);

function drawFrame() {
 GPU.beginFrame();
 setFrameCamera(camera, W, H);
 renderer.render(scene, {camera, kind: 'main', colorViews: target.textures.map(texture => texture.view()), colorFormats: target.formats,
  clearColors: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], depthView: target.depthTexture.view(), depthFormat: 'depth32float', clearDepth: 0});
 GPU.submit();
}

async function renderAt(x, z, {held = false, flat = false, objectMotion = false} = {}) {
 const data = new Float32Array(JOINTS * 32);
 normal.upload(normalPixels(flat));
 camera.position.set(x + .35, 9.06, z + 3.6); camera.lookAt(x, 8.92, z);
 mesh.resetVelocity = true;
 if (objectMotion) {
  // Prime real draw history with a different position/yaw and previous pose.
  parent.position.set(x - .04, 8, z + .012); parent.rotation.y = .25;
  data.set(previous); data.set(previous, JOINTS * 16); joints.write(data);
  drawFrame();
 }
 parent.position.set(x, 8, z); parent.rotation.y = .27;
 data.set(current); data.set(held ? current : previous, JOINTS * 16); joints.write(data);
 drawFrame();
 const pixels = new Uint8Array((await readTexture(target.textures[0])).data);
 const half = new Uint16Array((await readTexture(target.textures[1])).data);
 const velocity = Float32Array.from(half, fromHalfFloat);
 assert.ok(velocity.every(Number.isFinite), 'skin motion vectors stay finite');
 return {pixels, velocity};
}

function compare(a, b) {
 let covered = 0, difference = 0, samples = 0, normalError = 0, motionError = 0, moving = 0, maxMotion = 0;
 for (let i = 0; i < W * H; i++) {
  const o = i * 4, inA = a.pixels[o + 3] > 0, inB = b.pixels[o + 3] > 0;
  if (inA || inB) covered++;
  if (inA !== inB) difference++;
  // Avoid raster edge differences in the shading/motion comparison.
  const interior = inA && inB && i > W && i < W * (H - 1) && [i - 1, i + 1, i - W, i + W].every(p => a.pixels[p * 4 + 3] && b.pixels[p * 4 + 3]);
  if (!interior) continue;
  samples++;
  for (let c = 0; c < 3; c++) normalError += Math.abs(a.pixels[o + c] - b.pixels[o + c]) / 255;
  const speed = Math.hypot(a.velocity[o] * W, a.velocity[o + 1] * H);
  if (speed > .1) moving++;
  maxMotion = Math.max(maxMotion, speed);
  motionError += Math.hypot((a.velocity[o] - b.velocity[o]) * W, (a.velocity[o + 1] - b.velocity[o + 1]) * H);
 }
 assert.ok(samples > 7000, `fixture has enough covered interior pixels (${samples})`);
 return {silhouette: difference / covered, normal: normalError / (samples * 3), motion: motionError / samples, moving: moving / samples, maxMotion};
}

const origin = await renderAt(0, 0);
const flat = await renderAt(0, 0, {flat: true});
const mapped = compare(origin, flat);
assert.ok(mapped.normal > .04, `the inline normal map meaningfully changes shading (${mapped.normal})`);
assert.ok(mapped.moving > .35 && mapped.maxMotion > .5, `joint animation produces real velocity with a stationary object (${JSON.stringify(mapped)})`);
const held = await renderAt(0, 0, {held: true});
const movingOrigin = await renderAt(0, 0, {objectMotion: true});
assert.ok(compare(origin, movingOrigin).motion > .5, 'object motion combines with animated joints in the velocity buffer');
let heldMax = 0;
for (let i = 0; i < W * H; i++) if (held.pixels[i * 4 + 3]) heldMax = Math.max(heldMax, Math.hypot(held.velocity[i * 4] * W, held.velocity[i * 4 + 1] * H));
assert.ok(heldMax < .01, `a held pose has zero motion (${heldMax}px)`);

let maxSilhouette = 0, maxNormal = 0, maxVelocity = 0;
for (const [x, z] of [[-365704.524244, -779661.234934], [-246000.417, -380000.813], [130000.971, 38000.331]]) for (const objectMotion of [false, true]) {
 const far = await renderAt(x, z, {objectMotion}), error = compare(objectMotion ? movingOrigin : origin, far);
 maxSilhouette = Math.max(maxSilhouette, error.silhouette);
 maxNormal = Math.max(maxNormal, error.normal);
 maxVelocity = Math.max(maxVelocity, error.motion);
 assert.ok(error.silhouette < .002, `statewide skin silhouette matches origin at ${x},${z}: ${JSON.stringify(error)}`);
 assert.ok(error.normal < .004, `statewide normal-map shading matches origin at ${x},${z}: ${JSON.stringify(error)}`);
 assert.ok(error.motion < .015, `statewide animated motion matches origin at ${x},${z}: ${JSON.stringify(error)}`);
}
await GPU.queue.onSubmittedWorkDone();
assert.deepEqual(errors, []);
console.log(`ok GPU statewide skin precision: ${(maxSilhouette * 100).toFixed(3)}% silhouette change, ${(maxNormal * 255).toFixed(3)} normal RGB levels, ${maxVelocity.toFixed(5)}px motion error`);
console.log(`ok mapped shading and independent joint motion: ${(mapped.moving * 100).toFixed(1)}% moving pixels; held pose ${heldMax.toFixed(5)}px`);
process.exit(0);
