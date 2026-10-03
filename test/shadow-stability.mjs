// Exercise the real shadow/contact-shadow WGSL at statewide coordinates, plus the update
// schedule used while driving/flying. Small scenes near (0,0) cannot catch these regressions.
import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU, ComputeKernel, StorageBuffer, readBuffer, Texture } from '../src/engine/webgpu.js';
import { SunShadows } from '../src/engine/render/Shadows.js';
import { shadowModule, ShadowUniforms } from '../src/engine/render/wgsl/lighting.js';
import { FrameUniforms, createViewUniforms, setFrameCamera } from '../src/engine/render/Frame.js';
import { ContactShadows, installContactShadows } from '../src/materials/ContactShadows.js';
import { PerspectiveCamera, Vector2, Vector3, Vector4 } from '../src/engine/index.js';

const camera = new PerspectiveCamera( 62, 16 / 9, 0.06, 60000 );
const sun = new Vector3( 0.4, 0.7, 0.3 ).normalize();
const shadows = new SunShadows();
camera.position.set( -400000, 6, -850000 );
camera.lookAt( -400000, 2, -850010 );
assert.deepEqual( shadows.update( camera, sun ), [ 0, 1, 2 ] );
let stationaryRenders = 0;
for ( let i = 0; i < 12; i ++ ) stationaryRenders += shadows.update( camera, sun ).length;
assert.equal( stationaryRenders, 21, 'still views retain the 1/2/4 cascade schedule' );
for ( const speed of [ 1, 3, 12 ] ) for ( let i = 0; i < 4; i ++ ) {
 camera.position.x += speed;
 camera.lookAt( camera.position.x, 2, camera.position.z - 10 );
 assert.deepEqual( shadows.update( camera, sun ), [ 0, 1, 2 ], 'moving views do not reuse stale terrain shadows' );
}
camera.lookAt( camera.position.x + 15, 2, camera.position.z - 10 );
assert.deepEqual( shadows.update( camera, sun ), [ 0, 1, 2 ], 'turns refresh every affected cascade' );
camera.aspect = 1; camera.updateProjectionMatrix();
assert.deepEqual( shadows.update( camera, sun ), [ 0, 1, 2 ], 'resizing immediately refits coverage' );

// A fit must not inherit the previous light-camera translation / texel lattice.
const first = shadows.cascades[ 0 ].viewProj.clone();
shadows.cascades[ 0 ].camera.matrixWorld.setPosition( 876.543, 12.34, -456.789 );
shadows._fit( 0, camera, sun );
for ( let i = 0; i < 16; i ++ ) assert.ok( Math.abs( first.elements[ i ] - shadows.cascades[ 0 ].viewProj.elements[ i ] ) < 1e-10 );
console.log( 'ok stable texel lattice, motion/turn/resize refresh and stationary shadow budget' );

await GPU.init( { headless: true } );
const errors = [];
GPU.device.addEventListener( 'uncapturederror', event => errors.push( event.error.message ) );
const count = 512;
const inputs = new StorageBuffer( { count } );
const result = new StorageBuffer( { count: count * 2 } );
const depth = new Texture( { width: 2, height: 2, format: 'depth32float', usage: [ 'sample', 'render' ] } );
installContactShadows( { depthTexture: depth } );
const probe = new ComputeKernel( {
 label: 'statewide shadow projection regression', modules: [ shadowModule, ContactShadows.module ], defines: { PASS_DEPTH: 1 },
 bindings: { points: { storage: inputs }, result: { storage: result, access: 'read_write' } },
 code: `@compute @workgroup_size( WG_X, 1, 1 ) fn main( @builtin( global_invocation_id ) id: vec3u ) {
  if ( id.x >= ${ count }u ) { return; }
  let point = points[ id.x ];
  let c = i32( point.w );
  result[ id.x * 2u ] = shadowClip( point.xyz, vec3f( 0.0, shadowParams.cascades[ c ].z, 0.0 ), c );
  result[ id.x * 2u + 1u ] = contactPreviousClip( point.xyz, 1.0 );
 }`,
} );
await GPU.pipelinesReady();
let maxTexelError = 0, maxDepthError = 0, maxContactPixels = 0;
for ( const [ x, z ] of [ [ 0, 0 ], [ -246000, -380000 ], [ -400000, -850000 ], [ 130000, 38000 ] ] ) {
 camera.aspect = 16 / 9; camera.updateProjectionMatrix();
 camera.position.set( x, 6, z ); camera.lookAt( x, 2, z - 10 );
 setFrameCamera( camera, 1280, 720, { jitterX: 0.3, jitterY: -0.2 } );
 const F = FrameUniforms.fields;
 const previous = F.viewProj.value.clone();
 const previousVP = F.viewProjNoJitter.value.clone(), previousP = F.cameraPos.value.clone(), previousJitter = F.jitter.value.clone();
 camera.position.x += 3.5;
 setFrameCamera( camera, 1280, 720, { jitterX: -0.4, jitterY: 0.35, prevViewProj: previousVP, prevCameraPos: previousP, prevJitter: previousJitter } );
 shadows.update( camera, sun );
 const block = createViewUniforms( 'contact history isolation' );
 setFrameCamera( shadows.cascades[ 0 ].camera, 2048, 2048, { block } );
 assert.deepEqual( F.prevJitter.value, previousJitter, 'shadow views preserve the previous main-camera jitter' );
 assert.deepEqual( block.fields.prevJitter.value, new Vector2(), 'shadow views do not inherit jitter' );
 const points = new Float32Array( count * 4 );
 for ( let i = 0; i < count; i ++ ) points.set( [ x + ( i % 16 ) * 0.0625, 0, z - 2 - Math.floor( i / 16 ) * 0.125, i % 3 ], i * 4 );
 inputs.write( points );
 GPU.beginFrame(); probe.dispatch( probe.groups( count ) ); GPU.submit();
 const values = new Float32Array( await readBuffer( result, result.byteLength ) );
 assert.ok( values.every( Number.isFinite ), 'shadow projections remain finite' );
 for ( let i = 0; i < count; i ++ ) {
  const [ px, py, pz, c ] = points.subarray( i * 4, i * 4 + 4 );
  const expected = new Vector4( px, py + shadows.normalBias[ c ], pz, 1 ).applyMatrix4( shadows.cascades[ c ].viewProj );
  maxTexelError = Math.max( maxTexelError, Math.abs( expected.x - values[ i * 8 ] ) * shadows.size / 2, Math.abs( expected.y - values[ i * 8 + 1 ] ) * shadows.size / 2 );
  maxDepthError = Math.max( maxDepthError, Math.abs( expected.z - values[ i * 8 + 2 ] ) );
  const contact = new Vector4( px, py, pz, 1 ).applyMatrix4( previous );
  maxContactPixels = Math.max( maxContactPixels, Math.abs( contact.x / contact.w - values[ i * 8 + 4 ] / values[ i * 8 + 7 ] ) * 640, Math.abs( contact.y / contact.w - values[ i * 8 + 5 ] / values[ i * 8 + 7 ] ) * 360 );
 }
}
assert.ok( maxTexelError < 0.025, `shadow lookup stays within 1/40 texel, got ${ maxTexelError }` );
assert.ok( maxDepthError < ShadowUniforms.fields.bias.value / 8, `depth error stays well below the bias, got ${ maxDepthError }` );
assert.ok( maxContactPixels < 0.01, `contact lookup matches previous jittered depth, got ${ maxContactPixels }px` );
assert.deepEqual( errors, [] );
console.log( `ok statewide GPU shadows: ${ maxTexelError.toFixed( 5 ) } texels, ${ maxDepthError.toExponential( 2 ) } depth error; contact reprojection ${ maxContactPixels.toFixed( 5 ) }px` );
await GPU.queue.onSubmittedWorkDone();
process.exit( 0 );
