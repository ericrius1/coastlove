// Exercise the actual sky WGSL, including its tiny angular disks and zero-work
// branches, without depending on atmosphere/weather textures or a browser.
import './headless.mjs';
import assert from 'node:assert/strict';
import { GPU, ShaderModule, UniformBlock, ComputeKernel, StorageBuffer, readBuffer, commonModule } from '../src/engine/webgpu.js';
import { Vector3 } from '../src/engine/math/index.js';
import { Sky } from '../src/sky/Sky.js';
import { SUN_ANGULAR_RADIUS } from '../src/sky/Atmosphere.js';

await GPU.init( { headless: true } );
const errors = [];
GPU.device.addEventListener( 'uncapturederror', ( event ) => errors.push( event.error.message ) );
const sun = new Vector3( 0, 0.8, 0.6 );
const moon = new Vector3( 0.3, 0.75, -0.6 ).normalize();
const params = new UniformBlock( 'SkyAtmosphereFixture', { sunDir: [ 'vec3f', sun.clone() ] } );
const lookups = new StorageBuffer( { count: 1, type: 'atomic<u32>' } );
const atmosphere = { module: new ShaderModule( {

	name: 'skyAtmosphereFixture', deps: [ commonModule ], uniforms: params, uniformName: 'atmosphereParams',
	bindings: { transmittanceLookups: { storage: lookups, access: 'read_write' } },
	code: `fn atmosphereSkyLuminance( dir: vec3f ) -> vec3f { return vec3f( 0.0 ); }
fn atmosphereTransmittanceToSpace( dir: vec3f ) -> vec3f {
	atomicAdd( &transmittanceLookups[ 0 ], 1u );
	return vec3f( 1.0 );
}`,

} ) };
const sky = new Sky( atmosphere );
sky.moonDir.value.copy( moon );

function offset( center, x, y ) {

	const pole = Math.abs( center.y ) > 0.95 ? new Vector3( 0, 0, 1 ) : new Vector3( 0, 1, 0 );
	const right = new Vector3().crossVectors( pole, center ).normalize();
	const up = new Vector3().crossVectors( center, right );
	return center.clone().addScaledVector( right, Math.tan( x ) ).addScaledVector( up, Math.tan( y ) ).normalize();

}

const directions = [ sun, offset( sun, SUN_ANGULAR_RADIUS * 1.1, 0 ), moon, offset( moon, 0.0048 * 1.1, 0 ),
	new Vector3( 0, 1, 0 ), new Vector3( 0, -1, 0 ), new Vector3( 1, 0, 0 ), new Vector3( 0, 0, 1 ) ];
const diskStart = directions.length;
for ( let y = 0; y < 32; y ++ ) for ( let x = 0; x < 32; x ++ ) {

	directions.push( offset( moon, ( ( x + 0.5 ) / 32 * 2 - 1 ) * 0.0048, ( ( y + 0.5 ) / 32 * 2 - 1 ) * 0.0048 ) );

}
const skyStart = directions.length;
for ( let i = 0; i < 4096; i ++ ) {

	const height = ( i + 0.5 ) / 4096;
	const azimuth = i * 2.399963229728653;
	const radius = Math.sqrt( 1 - height * height );
	directions.push( new Vector3( Math.cos( azimuth ) * radius, height, Math.sin( azimuth ) * radius ) );

}
const input = new StorageBuffer( { count: directions.length, data: Float32Array.from( directions.flatMap( ( dir ) => [ dir.x, dir.y, dir.z, 0 ] ) ) } );
const result = new StorageBuffer( { count: directions.length * 3 } );
const sample = new ComputeKernel( {

	label: 'sky radiance regression', modules: [ sky.module ],
	bindings: { directions: { storage: input }, result: { storage: result, access: 'read_write' } },
	code: `@compute @workgroup_size( WG_X, 1, 1 ) fn main( @builtin( global_invocation_id ) id: vec3u ) {
	if ( id.x >= ${ directions.length }u ) { return; }
	let dir = directions[ id.x ].xyz;
	result[ id.x * 3u ] = vec4f( skySunDisk( dir ), 1.0 );
	result[ id.x * 3u + 1u ] = vec4f( skyMoon( dir ), 1.0 );
	result[ id.x * 3u + 2u ] = vec4f( skyStars( dir ), 1.0 );
}`,

} );
await GPU.pipelinesReady();

async function capture( night ) {

	sky.starIntensity.value = night ? 1 : 0;
	params.fields.sunDir.value.copy( sun ).multiplyScalar( night ? -1 : 1 );
	lookups.write( new Uint32Array( 4 ) );
	GPU.beginFrame();
	sample.dispatch( sample.groups( directions.length ) );
	GPU.submit();
	const pixels = new Float32Array( await readBuffer( result, result.byteLength ) );
	const count = new Uint32Array( await readBuffer( lookups, 16 ) )[ 0 ];
	assert.ok( pixels.every( ( value ) => Number.isFinite( value ) && value >= 0 ), 'sky radiance must stay finite on cube axes and disk edges' );
	return { pixels, count };

}

const day = await capture( false );
const channel = ( capture, ray, layer ) => capture.pixels[ ray * 12 + layer * 4 ];
assert.ok( Math.abs( channel( day, 0, 0 ) - 2500 ) < 1, 'solar center retains its radiance' );
assert.equal( channel( day, 1, 0 ), 0, 'sunlight stops outside the existing angular radius' );
let solarPixels = 0;
for ( let i = 0; i < directions.length; i ++ ) {

	if ( channel( day, i, 0 ) > 0 ) solarPixels ++;
	assert.equal( channel( day, i, 1 ), 0, 'no lunar disk work contributes during the day' );
	assert.equal( channel( day, i, 2 ), 0, 'stars disappear during the day' );

}
assert.equal( day.count, solarPixels, 'only solar disk pixels fetch atmospheric transmittance during the day' );

const night = await capture( true );
assert.ok( channel( night, 2, 1 ) > 1, 'moon stays visible at night' );
assert.equal( channel( night, 3, 1 ), 0, 'lunar detail cannot spill outside the moon' );
let moonPixels = 0, minMoon = Infinity, maxMoon = 0, nightGlow = 0;
for ( let i = 0; i < directions.length; i ++ ) {

	assert.equal( channel( night, i, 0 ), 0, 'below-horizon sun cannot leak into the night' );
	if ( channel( night, i, 1 ) > 0 ) moonPixels ++;
	if ( i >= diskStart && i < skyStart && channel( night, i, 1 ) > 1 ) {

		minMoon = Math.min( minMoon, channel( night, i, 1 ) );
		maxMoon = Math.max( maxMoon, channel( night, i, 1 ) );

	}
	if ( i >= skyStart ) nightGlow += channel( night, i, 2 );

}
assert.equal( night.count, moonPixels, 'only lunar disk pixels fetch atmospheric transmittance at night' );
assert.ok( maxMoon - minMoon > 0.4, 'lunar seas and limb retain visible tonal structure' );
assert.ok( nightGlow > 0.1, 'galactic glow and stars survive the empty-cell optimization' );
assert.equal( channel( night, 5, 2 ), 0, 'stars cannot appear below the physical horizon' );
assert.deepEqual( errors, [] );
console.log( `ok sky radiance across ${ directions.length } rays: finite disks, day/night gating, lunar detail, galactic glow; transmittance lookups restricted to ${ day.count } solar / ${ night.count } lunar samples` );
await GPU.queue.onSubmittedWorkDone();
process.exit( 0 );
