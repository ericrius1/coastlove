// Real source rigs and geometry, with a recording GPU and one-pixel texture decoding.
// This covers source sharing, async cancellation and pose/resource isolation without
// requiring a display, image decoder, WebGPU adapter or network connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Matrix4, Scene, Vector3 } from '../src/engine/index.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { IslandLife } from '../src/exploration/IslandLife.js';
import { describeCharacter, createCharacterFallback, createCharacterVariant, characterURL, characterVariantStats, CHARACTER_LIMITS } from '../src/game/CharacterVariants.js';
import { Vendor } from '../src/game/Vendor.js';

const bodies = ['joe', 'marta'];
const fixtures = Object.fromEntries(bodies.map(body => {
 const bytes = readFileSync(new URL(`../public/models/characters/${body}.glb`, import.meta.url));
 return [body, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)];
}));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const matrixNear = (actual, expected, message) => {
 for (let i = 0; i < 16; i++) assert.ok(Math.abs(actual[i] - expected[i]) < 2e-6, `${message}: component ${i}`);
};

const looks = new Set();
for (let i = 0; i < 5000; i++) {
 const id = `california-resident-${i}`, d = describeCharacter(id);
 assert.deepEqual(d, describeCharacter(id), 'identities are deterministic');
 assert.ok(Object.isFrozen(d));
 looks.add(JSON.stringify([d.body, d.outfit, d.shirt, d.trousers, d.hair, d.hat, d.headwear, d.accessory, d.glasses]));
 assert.ok(d.height >= .88 && d.height <= 1.12 && d.build >= .84 && d.build <= 1.2);
}
assert.ok(looks.size > 4500, 'thousands of distinct discrete combinations without relying on identity or continuous height');
const bounded = describeCharacter('bounds', { height: -3, build: Infinity, headWidth: 99, shirt: -100, skin: 1e10, outfit: 'invalid' });
assert.equal(bounded.height, .88); assert.equal(bounded.headWidth, 1.07);
assert.equal(bounded.shirt, 0); assert.equal(bounded.skin, 0xffffff);
assert.ok(Number.isFinite(bounded.build)); assert.notEqual(bounded.outfit, 'invalid');
for (const id of ['ines', 'rowan', 'sana', 'elias', 'marisol', 'jules', 'mei', 'noah', 'fern']) {
 const mesh = createCharacterFallback(describeCharacter(id));
 const { position, normal, color, aux } = mesh.geometry.attributes;
 assert.ok(position.count > 2000 && position.count < 100000, `${id} fallback has a bounded detailed silhouette`);
 assert.equal(normal.count, position.count); assert.equal(color.count, position.count); assert.equal(aux.count, position.count);
 for (const a of [position, normal, color, aux]) assert.ok(a.array.every(Number.isFinite));
 mesh.geometry.computeBoundingBox();
 const size = mesh.geometry.boundingBox.getSize(new Vector3());
 assert.ok(size.y > 1.4 && size.y < 2.3 && size.x < 1.1, `${id} stays at human scale`);
 mesh.geometry.dispose(); mesh.material.dispose();
}
console.log(`ok ${looks.size} deterministic combinations, sanitized overrides and finite detailed fallbacks`);

// Record actual joint/uniform bytes and resource lifetime. Texture decoding is
// replaced at its documented hook; the real GLB skins and animations are loaded.
globalThis.GPUBufferUsage = { STORAGE: 1, COPY_DST: 2, COPY_SRC: 4, UNIFORM: 8 };
globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
let textureDecodes = 0;
const buffers = [], textures = [];
GPU.encoder = {};
GPU.device = {
 createBuffer({size, label}) { const buffer = { label, bytes: new Uint8Array(size), destroyed: false, destroy() { this.destroyed = true; } }; buffers.push(buffer); return buffer; },
 createTexture(options) { const texture = { ...options, destroyed: false, destroy() { this.destroyed = true; } }; textures.push(texture); return texture; },
};
GPU.queue = {
 writeBuffer(buffer, offset, data, byteOffset = 0, byteLength) {
  assert.equal(buffer.destroyed, false, 'active models never write a destroyed GPU buffer');
  const source = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data, byteOffset, byteLength);
  buffer.bytes.set(source, offset);
 },
 writeTexture() {},
};
globalThis.__assetImage = async () => { textureDecodes++; return {width: 1, height: 1, data: new Uint8Array([170, 150, 130, 255])}; };
const fetches = [], gates = new Map();
let failNext = true;
globalThis.__assetFile = async url => {
 fetches.push(url);
 if (failNext) { failNext = false; throw new Error('fixture network failure'); }
 return new Promise(resolve => gates.set(url, resolve));
};
const joe = describeCharacter('queue-joe', {body: 'joe', glasses: true, accessory: 'satchel'});
const marta = describeCharacter('queue-marta', {body: 'marta', headwear: 'sunhat', glasses: true, accessory: 'scarf'});
await assert.rejects(createCharacterVariant(marta), /fixture network failure/);
await flush();
assert.equal(characterVariantStats().sources, 0, 'failed templates are removed so later visits retry');
let stillNear = true, queuedNear = true;
const cancelledLoading = createCharacterVariant(joe, {wanted: () => stillNear});
const liveMarta = createCharacterVariant(marta);
const cancelledQueued = createCharacterVariant(joe, {wanted: () => queuedNear});
const liveJoe = createCharacterVariant(joe);
assert.equal(characterVariantStats().active, CHARACTER_LIMITS.concurrent);
assert.equal(characterVariantStats().queued, 2);
stillNear = queuedNear = false;
for (const body of bodies) gates.get(characterURL(body))(fixtures[body]);
assert.equal(await cancelledLoading, null, 'moving away while decoding cannot install a late character');
assert.equal(await cancelledQueued, null, 'obsolete queued work never starts');
const b = await liveMarta, a = await liveJoe;
await flush();
assert.equal(characterVariantStats().sources, 2);
assert.equal(characterVariantStats().active, 0); assert.equal(characterVariantStats().queued, 0);
assert.equal(characterVariantStats().instances, 2);
assert.equal(fetches.filter(url => url === characterURL('joe')).length, 1, 'same-URL requests share the in-flight source');
assert.equal(fetches.filter(url => url === characterURL('marta')).length, 2, 'one failed source gets exactly one successful retry');
console.log('ok two-worker queue, retryable source failures and cancellation before/after loading');

const decodesBeforePeer = textureDecodes;
const peer = await createCharacterVariant(describeCharacter('peer', {body: 'joe', glasses: false, accessory: 'camera', shirt: 0xc08050}));
assert.equal(textureDecodes, decodesBeforePeer, 'another person reuses decoded textures');
assert.notEqual(a, peer); assert.notEqual(a.jointBuffer, peer.jointBuffer);
assert.notEqual(a.local[0], peer.local[0]); assert.notEqual(a.local[0].t, peer.local[0].t);
let sourceDisposals = 0;
for (let i = 0; i < a.meshes.length; i++) {
 assert.equal(a.meshes[i].geometry, peer.meshes[i].geometry, 'GPU source geometry is shared');
 a.meshes[i].geometry.addEventListener('dispose', () => sourceDisposals++);
 assert.notEqual(a.meshes[i].material, peer.meshes[i].material);
 assert.notEqual(a.meshes[i].material.uniforms.characterShirt.value, peer.meshes[i].material.uniforms.characterShirt.value);
 assert.equal(a.meshes[i].material.bindings.chAlbedo.texture, peer.meshes[i].material.bindings.chAlbedo.texture);
 assert.equal(a.meshes[i].material.bindings.skinJoints.storage, a.jointBuffer);
}
const oldPeerColor = peer.materials[0].uniforms.characterShirt.value.clone();
a.materials[0].uniforms.characterShirt.value.set(0xff0000);
assert.deepEqual(peer.materials[0].uniforms.characterShirt.value, oldPeerColor);
a.play('idle_look_around_01', {from: .4}); peer.play('idle_look_around_01', {from: 1.2});
a.update(0); peer.update(0);
const peerPose = peer.jointData.slice(), peerUpload = peer.jointBuffer.gpu.bytes.slice();
a.update(.37);
assert.deepEqual(peer.jointData, peerPose); assert.deepEqual(peer.jointBuffer.gpu.bytes, peerUpload);
assert.notEqual(a.clips.get('idle_look_around_01').channels[0], peer.clips.get('idle_look_around_01').channels[0]);
assert.ok(a.gltf.animations.every(clip => clip.channels.every(channel => !Object.hasOwn(channel, '_k'))), 'sampling does not mutate shared clip data');

// Rest-coordinate accessories must receive jointWorld * inverseBind, not the
// raw joint matrix (which would apply the bind translation/axis basis twice).
for (const model of [a, b]) {
 model.play('wave_01', {fade: .01, from: .7}); model.update(.05);
 const attachments = model.group.children.filter(mesh => mesh.name.startsWith('residentAttachment:') && mesh.visible);
 assert.equal(attachments.length, 2);
 for (const mesh of attachments) {
  const node = model.gltf.nodes.findIndex(node => mesh.name.endsWith(node.name));
  const joint = model.skin.joints.indexOf(node);
  assert.ok(joint >= 0);
  const expected = new Matrix4().multiplyMatrices(new Matrix4().fromArray(model.world, node * 16), new Matrix4().fromArray(model.skin.inverseBindMatrices, joint * 16));
  matrixNear(mesh.matrix.elements, expected.elements, 'rigid attachment follows the animated bind-space transform');
  const center = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrix);
  assert.ok(Number.isFinite(center.x) && center.y > .4 && center.y < 2.5, 'accessories remain on the body during a wave');
 }
}
console.log('ok shared textures/geometry, isolated uniforms/poses/clip cursors and animated attachment bases');

const remembered = {model: a, material: a.materials[0], joints: a.jointBuffer, attachments: a.group.children.filter(mesh => mesh.name.startsWith('residentAttachment:'))};
const draw = new MeshRenderer();
draw.drawData = new Float32Array(draw.capacity * 64);
const renderHistory = model => {
 model.group.updateMatrixWorld(true);
 GPU.frame++; draw.drawCount = 0;
 model.group.traverse(mesh => { if (mesh.isMesh) draw._slot(mesh); });
};
a.group.position.set(350, 8, -700);
renderHistory(a);
a.dispose(); a.dispose();
assert.equal(characterVariantStats().instances, 2, 'repeated release is harmless');
assert.equal(sourceDisposals, 0);
assert.ok(textures.every(texture => !texture.destroyed), 'one released person cannot destroy shared textures');
peer.update(.1);
const originalLook = await createCharacterVariant(joe, {customize: false});
assert.equal(originalLook, remembered.model, 'a released slot reuses material/pipeline identities');
assert.equal(originalLook.materials[0], remembered.material); assert.equal(originalLook.jointBuffer, remembered.joints);
assert.equal(originalLook.materials[0].uniforms.characterAmount.value, 0);
assert.equal(originalLook.materials[0].uniforms.characterHeadWidth.value, 1);
assert.deepEqual(originalLook.group.scale, new Vector3(1, 1, 1));
assert.ok(originalLook.group.children.filter(mesh => mesh.name.startsWith('residentAttachment:')).every(mesh => !mesh.visible));
originalLook.group.position.set(-1800, 15, 450);
originalLook.play('idle_neutral_01'); originalLook.update(0);
const jointHalf = originalLook.joints * 16;
assert.deepEqual(originalLook.jointData.slice(0, jointHalf), originalLook.jointData.slice(jointHalf), 'new residency starts with zero skeletal motion');
renderHistory(originalLook);
originalLook.group.traverse(mesh => {
 if (mesh.isMesh) assert.deepEqual(mesh.__draw.prev, mesh.__draw.cur, 'reassigned body and accessory draw history cannot streak from the previous resident');
});
const firstWorld = originalLook.meshes[0].__draw.cur.slice();
originalLook.group.position.x += .25;
renderHistory(originalLook);
assert.deepEqual(originalLook.meshes[0].__draw.prev, firstWorld, 'subsequent frames retain normal motion history');
originalLook.dispose(); peer.dispose(); b.dispose();
assert.equal(characterVariantStats().instances, 0);

const modelIds = new Set(), materialIds = new Set();
for (let route = 0; route < 5; route++) {
 const people = [];
 for (const body of bodies) for (let i = 0; i < CHARACTER_LIMITS.detailed; i++) {
  const model = await createCharacterVariant(describeCharacter(`route-${route}-${body}-${i}`, {body, glasses: true, accessory: 'camera'}));
  assert.ok(model); people.push(model); modelIds.add(model); model.materials.forEach(material => materialIds.add(material.id));
 }
 for (const body of bodies) assert.equal(await createCharacterVariant(describeCharacter(`overflow-${body}`, {body})), null, 'over-budget callers keep their fallback');
 assert.equal(characterVariantStats().instances, CHARACTER_LIMITS.detailed * 2);
 people.forEach(model => model.dispose());
}
assert.equal(modelIds.size, CHARACTER_LIMITS.detailed * 2);
assert.equal(characterVariantStats().pooled, CHARACTER_LIMITS.detailed * 2);
assert.equal(sourceDisposals, 0); assert.equal(textureDecodes, decodesBeforePeer);
assert.equal(characterVariantStats().instances, 0);
console.log(`ok bounded release/reacquire across five routes: ${modelIds.size} rigs, ${materialIds.size} source-material identities, no texture redecoding`);

// The historical Vendor API keeps original skin textures and explicit clip names.
const vendor = new Vendor({name: 'Old fish-stand caller', position: new Vector3()});
const legacy = await vendor.loadCharacter(characterURL('joe'), {idle: 'idle_neutral_01', talk: 'gestic_talk_relaxed_01', greet: 'wave_01'});
assert.equal(vendor.character, legacy); assert.equal(legacy.current, 'idle_neutral_01');
assert.equal(legacy.materials[0].uniforms.characterAmount.value, 0);
assert.equal(vendor.figure, legacy.group); assert.equal(vendor.model.children.length, 1);
const checkedOutBeforeInvalidClip = characterVariantStats().instances;
await assert.rejects(vendor.loadCharacter(characterURL('joe'), {idle: 'missing-clip'}), /no clip|unknown clip|missing.clip/i);
assert.equal(vendor.character, legacy, 'an invalid replacement clip preserves the working character');
assert.equal(vendor.figure, legacy.group);
assert.equal(characterVariantStats().instances, checkedOutBeforeInvalidClip, 'failed installation returns its acquired rig to the pool');
vendor.releaseCharacter();
assert.equal(vendor.character, null); assert.equal(vendor.figure, vendor.fallback);
const staleVendor = vendor.loadCharacter(characterURL('joe'));
vendor.releaseCharacter();
assert.equal(await staleVendor, null); assert.equal(vendor.character, null);
assert.equal(vendor.figure, vendor.fallback);
await flush();
assert.equal(characterVariantStats().instances, 0);
console.log('ok legacy Vendor.loadCharacter clips/appearance and stale async fallback preservation');

// Exercise the actual statewide integration: startup is immediate, conversation
// has priority, walking across the radius has hysteresis, and teleports cancel
// pending work before it can replace any distant resident's fallback.
const beforeStartupFetches = fetches.length;
const life = new IslandLife(new Scene(), {size: 2097152, heightAt: () => 8}, null, {california: true, loadCharacters: true});
await life.ready;
assert.equal(fetches.length, beforeStartupFetches, 'distant statewide residents never block startup with model fetches');
assert.equal(life.residents.length, 9);
assert.ok(life.residents.every(resident => resident.vendor._characterSpec), 'every named resident can receive source-quality detail');
life.residents.forEach((resident, i) => resident.position.set(i * 15, 8, 0));
const playerPosition = new Vector3(0, 8, 0), talking = life.residents[7];
life.updateCharacters(playerPosition, talking.id);
await Promise.all(life.residents.map(resident => resident.vendor._characterPromise));
await flush();
assert.equal(life.residents.filter(resident => resident.vendor.character).length, CHARACTER_LIMITS.detailed);
assert.ok(talking.vendor.character, 'the person in conversation retains a slot ahead of nearer bystanders');
assert.ok(life.residents.slice(0, 5).every(resident => resident.vendor.character));
const retained = life.residents[0];
life.residents.forEach(resident => resident.position.set(1000, 8, 0));
retained.position.x = 150;
life.updateCharacters(playerPosition);
assert.ok(retained.vendor.character, 'existing detail persists between load and retain radii');
retained.position.x = 181; life.updateCharacters(playerPosition);
assert.equal(retained.vendor.character, null);
retained.position.x = 150; life.updateCharacters(playerPosition);
assert.equal(retained.vendor._characterPromise, null, 'unloaded residents do not churn at the retain radius');
retained.position.x = 119; life.updateCharacters(playerPosition);
const arrival = retained.vendor._characterPromise;
assert.ok(arrival, 'entering the load radius requests detail');
life.updateCharacters(new Vector3(9000, 8, 9000));
assert.equal(await arrival, null);
await flush();
assert.ok(life.residents.every(resident => !resident.vendor.character && resident.vendor.figure === resident.vendor.fallback));
assert.equal(characterVariantStats().instances, 0);
console.log('ok statewide startup, six nearest residents, conversation priority, hysteresis and teleport cancellation');
