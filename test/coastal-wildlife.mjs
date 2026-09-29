import assert from 'node:assert/strict';
import { Scene, Vector3 } from '../src/engine/index.js';
import { IslandLife } from '../src/exploration/IslandLife.js';
import { WILDLIFE_SPECIES, WILDLIFE_HABITATS, WILDLIFE_POPULATION_LIMIT, WILDLIFE_BEHAVIOR } from '../src/exploration/Wildlife.js';
import { safeAt } from '../src/exploration/Navigation.js';

let terrainReads = 0;
const terrain = { size: 2097152, heightAt: () => { terrainReads ++; return 8; } };
const life = new IslandLife( new Scene(), terrain, null, { california: true } );
assert.equal( WILDLIFE_POPULATION_LIMIT, 102 );
assert.equal( life.animals.length, WILDLIFE_POPULATION_LIMIT );
assert.equal( life.animals.filter( a => a.kind === 'fox' ).length, 20 );
assert.equal( life.animals.filter( a => a.kind === 'seaLion' ).length, 12 );
for ( const species of WILDLIFE_SPECIES ) {
	const animals = life.animals.filter( animal => animal.kind === species.kind );
	assert.ok( animals.length > 1, `${ species.name } has a real encounter` );
	assert.ok( species.observeRadius > WILDLIFE_BEHAVIOR[ species.kind ].comfort * 1.7, 'observations respect the animal comfort zone' );
	assert.ok( species.placeIds.every( place => WILDLIFE_HABITATS.some( habitat => habitat.place === place && habitat.kind === species.kind ) ) );
	assert.equal( animals[ 0 ].body.geometry, animals[ 1 ].body.geometry, `${ species.name } shares geometry` );
	for ( const animal of animals ) assert.ok( safeAt( terrain, null, animal.home.x, animal.home.z ) );
}
console.log( 'ok six recognizable species, 102 bounded residents, shared geometry, and journal habitats' );

const animal = life.animals.find( a => a.kind === 'deer' );
animal.group.position.set( 0, 8, 0 ); animal.home.copy( animal.group.position ); animal.groundY = 8;
const player = { mode: 'walk', position: new Vector3( 2, 8, 0 ) };
const startDistance = animal.group.position.distanceTo( player.position );
life.updateAnimal( animal, 1 / 60, player );
assert.equal( animal.state, 'flee' );
assert.ok( animal.group.position.distanceTo( player.position ) > startDistance, 'deer retreats from an approaching player' );
player.position.set( 25, 8, 0 );
const states = new Set();
for ( let i = 0; i < 3600; i ++ ) { life.updateAnimal( animal, 1 / 60, player ); states.add( animal.state ); }
assert.ok( states.has( 'rest' ) && states.has( 'forage' ) && states.has( 'wander' ), 'a deer settles back into rest, grazing and wandering' );
assert.ok( Math.hypot( animal.group.position.x, animal.group.position.z ) < 40, 'wandering stays near its habitat' );
assert.equal( animal.group.position.y, 8 );
console.log( 'ok respectful approach, retreat, recovery, resting, grazing and home bounds' );

const before = animal.group.position.clone(), phase = animal.phase;
player.position.set( 9000, 8, 9000 ); terrainReads = 0;
for ( let i = 0; i < 120; i ++ ) life.updateAnimal( animal, 1 / 60, player );
assert.equal( animal.group.visible, false );
assert.equal( terrainReads, 0, 'distant encounters perform no terrain queries' );
assert.deepEqual( animal.group.position, before ); assert.equal( animal.phase, phase );
player.position.copy( animal.group.position ).add( new Vector3( 90, 0, 0 ) );
animal.state = 'wander'; animal.timer = 5;
terrainReads = 0;
for ( let i = 0; i < 60; i ++ ) life.updateAnimal( animal, 1 / 60, player );
assert.equal( animal.group.visible, true );
assert.ok( terrainReads <= 64, `mid-distance terrain queries are throttled (${ terrainReads })` );
console.log( 'ok distant culling and reduced terrain work at medium distances' );

const butterfly = life.animals.find( a => a.kind === 'butterfly' );
butterfly.group.position.set( 0, 8, 0 ); butterfly.home.copy( butterfly.group.position ); butterfly.groundY = 8;
butterfly.state = 'wander'; butterfly.timer = 5;
player.position.set( 8, 8, 0 );
for ( let i = 0; i < 120; i ++ ) { life.time += 1 / 60; life.updateAnimal( butterfly, 1 / 60, player ); }
assert.ok( butterfly.group.position.y > 8.3 && butterfly.group.position.y < 9.2, 'butterflies hover over flowers' );
assert.ok( butterfly.wings[ 0 ].rotation.z === - butterfly.wings[ 1 ].rotation.z, 'wings beat as a mirrored pair' );

// A walkable bank beside water and a road both constrain escape movement.
life.terrain = { size: 2097152, heightAt: ( x, z ) => x > 1 ? - 5 : 8 };
animal.group.position.set( 0, 8, 0 ); animal.home.copy( animal.group.position ); animal.groundY = 8;
player.position.set( - 1, 8, 0 );
for ( let i = 0; i < 120; i ++ ) life.updateAnimal( animal, 1 / 60, player );
assert.ok( safeAt( life.terrain, null, animal.group.position.x, animal.group.position.z ), 'fleeing does not cross the water edge' );
life.terrain = { ...terrain, streets: { surfaceAt: ( x ) => x > 0.2 ? { distance: 0, width: 8 } : null } };
animal.group.position.set( 0, 8, 0 ); animal.home.copy( animal.group.position ); animal.groundY = 8;
for ( let i = 0; i < 120; i ++ ) life.updateAnimal( animal, 1 / 60, player );
assert.ok( animal.group.position.x <= 0.2, 'wildlife does not enter a traffic lane' );
console.log( 'ok fluttering wings, flower-height flight, and safe shoreline/road boundaries' );
