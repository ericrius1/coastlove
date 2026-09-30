import assert from 'node:assert/strict';
import { Engine } from '../src/engine/Engine.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { CDLOD } from '../src/core/CDLOD.js';
import { BufferAttribute, BufferGeometry, Matrix4, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { FrameUniforms, createViewUniforms, setFrameCamera } from '../src/engine/render/Frame.js';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';

function matrixNear( actual, expected, message ) {

	for ( let i = 0; i < 16; i ++ ) assert.ok( Math.abs( actual.elements[ i ] - expected.elements[ i ] ) < 1e-8, `${ message }, component ${ i }` );

}

// Temporal history and camera-relative coordinates must survive updates to other views, including
// shadow cameras rendered between the main view's setup and its uniform upload.
const camera = new PerspectiveCamera( 62, 16 / 9, 0.1, 60000 );
camera.position.set( - 246000, 70, - 380000 );
camera.lookAt( - 245975, 83, - 380040 );
setFrameCamera( camera, 960, 540 );
const F = FrameUniforms.fields;
const references = Object.fromEntries( Object.entries( F ).filter( ( [ , field ] ) => field.value?.isMatrix4 || field.value?.isVector2 || field.value?.isVector3 ).map( ( [ key, field ] ) => [ key, field.value ] ) );
const prevVP = F.viewProjNoJitter.value.clone();
const prevPosition = F.cameraPos.value.clone();
camera.position.x += 12.5;
setFrameCamera( camera, 1280, 720, { jitterX: 0.25, jitterY: - 0.125, prevViewProj: F.viewProjNoJitter.value, prevCameraPos: F.cameraPos.value } );
matrixNear( F.prevViewProjNoJitter.value, prevVP, 'previous camera matrix remains intact' );
assert.deepEqual( F.prevCameraPos.value, prevPosition );
matrixNear( F.relativeViewProj.value, new Matrix4().multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ).multiply( new Matrix4().makeTranslation( camera.position.x, camera.position.y, camera.position.z ) ), 'camera-relative projection' );
matrixNear( new Matrix4().multiplyMatrices( F.viewProj.value, F.invViewProj.value ), new Matrix4(), 'jittered projection inverse' );
assert.deepEqual( new Vector3().addVectors( F.cameraOrigin.value, F.cameraOffset.value ), camera.position );
for ( const [ key, value ] of Object.entries( references ) ) assert.equal( F[ key ].value, value, `${ key } storage is reused` );
const mainVP = F.viewProj.value.clone(), mainOrigin = F.cameraOrigin.value.clone();
const shadow = createViewUniforms( 'regression shadow' );
const shadowCamera = new PerspectiveCamera( 50, 1, 1, 400 );
shadowCamera.position.set( 0, 200, 100 );
shadowCamera.lookAt( 0, 0, 0 );
setFrameCamera( shadowCamera, 1024, 1024, { block: shadow } );
shadow._pack();
matrixNear( F.viewProj.value, mainVP, 'a secondary camera cannot alter the main view' );
assert.deepEqual( F.cameraOrigin.value, mainOrigin );
assert.notEqual( shadow.fields.cameraOrigin.value, F.cameraOrigin.value );
assert.equal( shadow.fields.sunDir.value, F.sunDir.value, 'simulation state is shared across views' );
console.log( 'ok reused frame uniforms retain temporal history and isolate camera views' );

const lod = new CDLOD( { gridSize: 8, levels: 8, maxInstances: 1500 } );
camera.position.set( 20, 6, - 20 );
camera.lookAt( 0, 0, 0 );
lod.update( camera );
assert.ok( lod.count > 0 );
const selected = lod.nodeArray.slice( 0, lod.count * 4 );
const selectedCount = lod.count, version = lod.nodeAttr.version;
const pool = lod._nodePool.slice();
lod.update( camera );
assert.equal( lod.nodeAttr.version, version, 'stationary view does not upload identical nodes' );
assert.deepEqual( lod.nodeArray.slice( 0, lod.count * 4 ), selected );
assert.deepEqual( lod.nodeAttr.updateRanges, [ { start: 0, count: selectedCount * 4 } ], 'an unconsumed update survives repeated selection' );
for ( let i = 0; i < pool.length; i ++ ) assert.equal( lod._nodePool[ i ], pool[ i ], 'selection records are reused' );
lod.nodeAttr.clearUpdateRanges();
camera.position.set( 1100, 20, - 300 );
camera.lookAt( 1200, 0, - 300 );
lod.update( camera );
assert.ok( lod.nodeAttr.version > version, 'moving into a new region uploads newly selected nodes' );
assert.equal( lod.lodCounts.reduce( ( sum, count ) => sum + count, 0 ), lod.count );
let previousDistance = - 1;
for ( let i = 0; i < lod.count; i ++ ) {

	const [ x, z, size, level ] = lod.nodeArray.subarray( i * 4, i * 4 + 4 );
	assert.ok( size > 0 && level >= 0 && level < lod.levels );
	const dx = Math.max( x - camera.position.x, 0, camera.position.x - x - size );
	const dz = Math.max( z - camera.position.z, 0, camera.position.z - z - size );
	const distance = dx * dx + dz * dz;
	assert.ok( distance >= previousDistance, 'visible nodes retain front-to-back depth ordering' );
	previousDistance = distance;

}
console.log( 'ok ocean and terrain LOD reuse storage and only upload changed selection' );

const callbacks = new Map();
let nextFrame = 0, clockResets = 0, updates = 0;
globalThis.requestAnimationFrame = ( callback ) => { callbacks.set( ++ nextFrame, callback ); return nextFrame; };
globalThis.cancelAnimationFrame = ( id ) => callbacks.delete( id );
const engine = new Engine( null );
engine.clock = { reset() { clockResets ++; }, update() {}, getDelta: () => 1 / 60, getElapsed: () => 1 };
engine.start( () => updates ++ );
const staleCallback = [ ...callbacks.values() ][ 0 ];
engine.start( () => { updates ++; engine.stop(); } );
assert.equal( callbacks.size, 1, 'restart keeps exactly one animation loop' );
assert.equal( clockResets, 2, 'start excludes loading and stopped time' );
staleCallback( 10 );
assert.equal( updates, 0, 'a queued callback from an old loop cannot update the simulation' );
const [ frameId, callback ] = [ ...callbacks.entries() ][ 0 ];
callbacks.delete( frameId );
callback( 20 );
assert.equal( updates, 1 );
assert.equal( callbacks.size, 0, 'stopping inside update does not schedule another frame' );
console.log( 'ok engine restarts and in-frame stops keep one animation loop' );

// A recording queue validates the actual bytes reaching GPU buffers without needing a GPU.
globalThis.GPUBufferUsage = { VERTEX: 1, INDEX: 2, COPY_DST: 4 };
const writes = [];
GPU.device = { createBuffer: ( { size } ) => ( { data: new Uint8Array( size ), destroy() {} } ) };
GPU.queue = { writeBuffer( buffer, offset, source, byteOffset = 0, byteLength = undefined ) {

	const bytes = ArrayBuffer.isView( source ) ? new Uint8Array( source.buffer, source.byteOffset, source.byteLength ) : new Uint8Array( source, byteOffset, byteLength );
	assert.equal( offset % 4, 0, 'WebGPU buffer offset alignment' );
	assert.equal( bytes.byteLength % 4, 0, 'WebGPU write size alignment' );
	buffer.data.set( bytes, offset );
	writes.push( { offset, bytes: bytes.byteLength } );

} };
const renderer = new MeshRenderer(), geometry = new BufferGeometry();
const attribute = new BufferAttribute( new Float32Array( 6000 ), 3 );
const buffer = renderer._attributeBuffer( geometry, attribute );
writes.length = 0;
attribute.array.set( [ 3, 4, 5 ], 300 );
attribute.addUpdateRange( 300, 3 );
attribute.needsUpdate = true;
renderer._attributeBuffer( geometry, attribute );
assert.deepEqual( writes, [ { offset: 1200, bytes: 12 } ], 'only the changed vertex is uploaded' );
assert.deepEqual( new Float32Array( buffer.data.buffer, 1200, 3 ), new Float32Array( [ 3, 4, 5 ] ) );
assert.equal( attribute.updateRanges.length, 0 );
writes.length = 0;
renderer._attributeBuffer( geometry, attribute );
assert.equal( writes.length, 0, 'unchanged geometry is not uploaded again' );
attribute.array = new Float32Array( 6000 ).fill( 7 );
renderer._attributeBuffer( geometry, attribute );
assert.equal( writes[ 0 ].bytes, 24000, 'replacing an array uploads it even without a version change' );
assert.equal( new Float32Array( buffer.data.buffer )[ 300 ], 7 );

const packed = new BufferAttribute( new Uint8Array( [ 11, 22, 33, 44, 55, 66 ] ), 2 );
const packedBuffer = renderer._attributeBuffer( geometry, packed );
writes.length = 0;
packed.array[ 5 ] = 99;
packed.addUpdateRange( 5, 1 );
packed.needsUpdate = true;
renderer._attributeBuffer( geometry, packed );
assert.deepEqual( writes, [ { offset: 4, bytes: 4 } ], 'packed tail updates are aligned and padded' );
assert.deepEqual( [ ...packedBuffer.data.slice( 0, 8 ) ], [ 11, 22, 33, 44, 55, 99, 0, 0 ] );

const converted = new BufferAttribute( new Uint8Array( [ 1, 2, 3 ] ), 3 );
const convertedBuffer = renderer._attributeBuffer( geometry, converted );
converted.array = new Uint8Array( [ 9, 8, 7 ] );
renderer._attributeBuffer( geometry, converted );
assert.deepEqual( [ ...new Float32Array( convertedBuffer.data.buffer ).slice( 0, 3 ) ], [ 9, 8, 7 ], 'converted attributes invalidate cached source arrays' );
geometry.setIndex( new BufferAttribute( new Uint16Array( [ 0, 1, 2 ] ), 1 ) );
const indexBuffer = renderer._indexBuffer( geometry ).buffer;
geometry.index.array = new Uint16Array( [ 2, 1, 0 ] );
renderer._indexBuffer( geometry );
assert.deepEqual( [ ...new Uint16Array( indexBuffer.data.buffer ).slice( 0, 3 ) ], [ 2, 1, 0 ], 'replacement index data reaches the GPU' );
console.log( 'ok partial GPU uploads preserve byte alignment, packed data and replacement buffers' );
