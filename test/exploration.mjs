import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { Colliders } from '../src/world/Colliders.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { Seaplane } from '../src/exploration/Seaplane.js';
import { IslandLife } from '../src/exploration/IslandLife.js';
import { safeAt, findSafeSpot } from '../src/exploration/Navigation.js';

const flat = { size: 2048, heightAt: ( x, z ) => z < 0 ? 10 : - 10 };
assert.equal( safeAt( flat, null, 0, 20, true, 5 ), true );
assert.equal( safeAt( flat, null, 0, 2, true, 5 ), false, 'boat footprint must clear shoreline' );
assert.equal( safeAt( flat, null, 0, 20 ), false, 'walking arrival cannot be underwater' );
assert.ok( findSafeSpot( flat, null, 0, 30 ).z < 0, 'find shore from water' );
assert.ok( findSafeSpot( flat, null, 0, - 30, true ).z > 5, 'find deep water from land' );
assert.equal( findSafeSpot( { heightAt: () => - 10 }, null, 0, 0, false, 40 ), null );
const obstacles = new Colliders();
obstacles.addCylinder( 0, - 20, 2, 9, 20 );
assert.equal( safeAt( flat, obstacles, 0, - 20 ), false, 'reject even the exact center of a cylinder' );
console.log( 'ok safe arrival footprint, shoreline search, impossible arrivals' );

const scene = new Scene(), plane = new Seaplane( scene, flat );
const camera = new PerspectiveCamera( 55, 1.6, 0.1, 4000 );
const keys = new Set();
const input = { down: key => keys.has( key ), consumeLook() {} };
plane.launch( new Vector3( 0, 10, - 100 ), 0 );
const takeoffHeight = plane.position.y;
for ( let i = 0; i < 180; i ++ ) plane.update( 1 / 60, input, camera );
assert.ok( Math.abs( plane.position.y - takeoffHeight ) < 0.2, 'holds altitude without a key' );
assert.ok( plane.speed < 30, 'relaxed cruise is the default' );
keys.add( 'KeyA' ); keys.add( 'Space' );
for ( let i = 0; i < 120; i ++ ) plane.update( 1 / 60, input, camera );
assert.ok( plane.heading > .9 && plane.bank < - .25 && plane.bank > - .36, 'gentle banking turn' );
assert.ok( plane.position.y > takeoffHeight + 20, 'climb and hold selected altitude' );
keys.clear();
for ( let i = 0; i < 180; i ++ ) plane.update( 1 / 60, input, camera );
assert.ok( Math.abs( plane.position.y - plane.cruiseAltitude ) < 2 && Math.abs( plane.climb ) < 1, 'releasing climb settles at selected altitude' );
keys.add( 'KeyW' );
for ( let i = 0; i < 120; i ++ ) plane.update( 1 / 60, input, camera );
assert.ok( plane.speed > 38 && plane.speed < 44, 'W is a manageable faster cruise' );
keys.clear(); keys.add( 'KeyS' );
for ( let i = 0; i < 180; i ++ ) plane.update( 1 / 60, input, camera );
assert.ok( plane.speed < 16, 'S slows for sightseeing' );
keys.clear(); keys.add( 'KeyC' );
for ( let i = 0; i < 600; i ++ ) plane.update( 1 / 60, input, camera );
assert.ok( plane.position.y >= Math.max( 0, flat.heightAt( plane.position.x, plane.position.z ) ) + 15, 'terrain clearance' );
assert.ok( Number.isFinite( camera.position.x ) && Number.isFinite( camera.quaternion.w ) );
plane.position.set( 2000, 40, 2000 ); plane.update( 1, input, camera );
assert.ok( Math.abs( plane.position.x ) <= flat.size / 2 && Math.abs( plane.position.z ) <= flat.size / 2, 'world bounds recovery' );
console.log( 'ok flight, climb, banking, terrain clearance, camera, boundary recovery' );

const ridge = { size: 2048, heightAt: ( x, z ) => Math.max( 0, 120 * ( 1 - Math.abs( z - 100 ) / 100 ) ) };
const assisted = new Seaplane( scene, ridge );
assisted.launch( new Vector3( 0, 0, - 250 ), 0 );
let highest = assisted.position.y;
keys.clear();
for ( let i = 0; i < 28 * 60; i ++ ) {
	assisted.update( 1 / 60, input, camera );
	highest = Math.max( highest, assisted.position.y );
	assert.ok( assisted.position.y >= ridge.heightAt( assisted.position.x, assisted.position.z ) + 15 - 1e-5 );
}
assert.ok( highest > 135, 'autopilot climbs over an approaching ridge' );
assert.ok( assisted.position.y < 70, 'autopilot returns to cruise height beyond the ridge' );
console.log( 'ok assisted altitude holds, climbs over a ridge and settles afterward' );

const base = new TerrainData( 19 );
const enlarged = new TerrainData( 19, { landScale: Math.SQRT2 } );
assert.ok( Math.abs( enlarged.size ** 2 / base.size ** 2 - 2 ) < 1e-10 );
let area = 0, scaledArea = 0;
for ( let i = 0; i < base.heights.length; i ++ ) {
	if ( base.heights[ i ] > 0 ) area ++;
	if ( enlarged.heights[ i ] > 0 ) scaledArea ++;
}
assert.ok( Math.abs( scaledArea * enlarged.texel ** 2 / ( area * base.texel ** 2 ) - 2 ) < 1e-10 );
for ( const [ x, z ] of [ [ 0, - 400 ], [ 300, - 300 ], [ 55, - 70 ], [ 10, 80 ] ] ) {
	assert.ok( Math.abs( enlarged.heightAt( x * Math.SQRT2, z * Math.SQRT2 ) - base.heightAt( x, z ) ) < 1e-5 );
}
console.log( `ok land area doubles: ${( area / 1e6 ).toFixed( 3 )} → ${( scaledArea * enlarged.texel ** 2 / 1e6 ).toFixed( 3 )} km²` );
const life = new IslandLife( scene, enlarged, null );
assert.equal( life.residents.length, 4 );
assert.equal( life.animals.length, 32 );
for ( const r of life.residents ) assert.ok( safeAt( enlarged, null, r.position.x, r.position.z ) );
const player = { position: life.residents[ 0 ].position.clone(), mode: 'walk' };
for ( let i = 0; i < 100; i ++ ) life.update( 0.05, player );
for ( const a of life.animals ) assert.ok( a.group.position.y > 1.5 && Number.isFinite( a.group.position.x ) );
console.log( 'ok resident placement, 32 creatures, wandering stays on dry ground' );
