import { Group, Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, sphere, cylinder, mat4, rod } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { Vendor } from '../game/Vendor.js';
import { mulberry32 } from '../util/Noise.js';
import { findSafeSpot, safeAt } from './Navigation.js';

import { STORIES } from './Stories.js';
export { STORIES } from './Stories.js';

function animalGeometry( kind ) {
	const p = [];
	const add = ( geo, color, matrix ) => p.push( prepare( geo, { color, rough: 0.9, matrix } ) );
	if ( kind === 'goat' ) {
		add( sphere( 1, 14, 10 ), 0xb3a087, mat4( 0, 0.85, 0, 0, 0, 0, 0.31, 0.4, 0.61 ) );
		add( sphere( 1, 12, 8 ), 0xd4c4a6, mat4( 0, 1.2, 0.53, - 0.35, 0, 0, 0.2, 0.32, 0.19 ) );
		add( sphere( 1, 10, 8 ), 0x9b8264, mat4( 0, 1.31, 0.74, 0, 0, 0, 0.15, 0.16, 0.23 ) );
		for ( const s of [ - 1, 1 ] ) {
			add( sphere( 1, 8, 6 ), 0x9b8264, mat4( s * 0.25, 1.47, 0.57, 0, 0, s * 0.35, 0.18, 0.06, 0.08 ) );
			add( rod( new Vector3( s * 0.1, 1.49, 0.54 ), new Vector3( s * 0.16, 1.87, 0.35 ), 0.045, 8, 0.009 ), 0x554c40 );
			add( sphere( 0.025, 8, 6 ), 0x161b19, mat4( s * 0.16, 1.38, 0.77 ) );
		}
		add( rod( new Vector3( 0, 0.98, - 0.5 ), new Vector3( 0, 1.2, - 0.72 ), 0.075, 8, 0.025 ), 0xd4c4a6 );
	} else {
		add( sphere( 1, 20, 12 ), 0x5b6840, mat4( 0, 0.32, 0, 0, 0, 0, 0.47, 0.34, 0.64 ) );
		// Individual shell scutes give the silhouette a recognizable patterned carapace.
		for ( let i = - 1; i <= 1; i ++ ) for ( let j = - 1; j <= 1; j ++ ) add( sphere( 1, 6, 4 ), ( i + j ) % 2 ? 0x8e8a51 : 0x707a45, mat4( i * 0.23, 0.55 - Math.abs( i ) * 0.045, j * 0.28, 0, 0, 0, 0.18, 0.1, 0.21 ) );
		add( sphere( 1, 10, 8 ), 0x94916b, mat4( 0, 0.3, 0.7, 0, 0, 0, 0.14, 0.15, 0.25 ) );
		for ( const s of [ - 1, 1 ] ) add( sphere( 0.022, 6, 5 ), 0x17221b, mat4( s * 0.12, 0.36, 0.8 ) );
	}
	return mergePrepared( p );
}

export class IslandLife {
	constructor( scene, terrain, colliders, { loadCharacters = false } = {} ) {
		this.terrain = terrain;
		this.colliders = colliders;
		this.random = mulberry32( 8304 );
		this.time = 0;
		this.residents = STORIES.map( ( story ) => {
			const position = findSafeSpot( terrain, colliders, story.x, story.z, false, 180 );
			if ( ! position ) throw new Error( `No safe home for ${ story.name }` );
			const vendor = new Vendor( { name: story.name, position, radius: 4, look: { shirt: story.color, apron: story.color } } );
			scene.add( vendor.group );
			return { ...story, vendor, position, home: position.clone(), phase: this.random() * 6.28 };
		} );
		// Reuse Tidewater's credited Rocketbox characters, with procedural figures
		// retained as a fallback if an asset cannot load.
		this.ready = loadCharacters ? Promise.all( this.residents.map( async r => {
			const female = r.id === 'ines' || r.id === 'sana';
			const url = ( import.meta.env?.BASE_URL || '/' ) + `models/characters/${ female ? 'marta' : 'joe' }.glb`;
			try { await r.vendor.loadCharacter( url, { talk: female ? 'gestic_talk_neutral_01' : 'gestic_talk_relaxed_01' } ); }
			catch ( error ) { console.warn( `Using fallback character for ${ r.name }`, error ); }
		} ) ) : Promise.resolve();
		const material = createPropMaterial( 'islandAnimals' );
		material.underwaterLighting = 'lite';
		const geometries = { goat: animalGeometry( 'goat' ), tortoise: animalGeometry( 'tortoise' ) };
		const legGeometries = {
			goat: prepare( cylinder( 0.065, 0.045, 0.58, 8 ), { color: 0x695b49, rough: 0.95 } ),
			tortoise: prepare( sphere( 1, 8, 6 ).scale( 0.12, 0.12, 0.24 ), { color: 0x8b8861, rough: 0.95 } )
		};
		this.animals = [];
		for ( let i = 0; i < 32; i ++ ) {
			const kind = i % 2 ? 'goat' : 'tortoise';
			const home = this.residents[ i % 4 ].home;
			const a = this.random() * Math.PI * 2, r = 8 + this.random() * 18;
			const position = findSafeSpot( terrain, colliders, home.x + Math.sin( a ) * r, home.z + Math.cos( a ) * r, false, 100 );
			if ( ! position ) continue;
			const group = new Group();
			const body = new Mesh( geometries[ kind ], material );
			body.castShadow = true;
			group.add( body );
			const legs = [];
			for ( const x of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) {
				const leg = new Mesh( legGeometries[ kind ], material );
				leg.position.set( x * ( kind === 'goat' ? 0.21 : 0.37 ), kind === 'goat' ? 0.33 : 0.13, z * 0.36 );
				group.add( leg ); legs.push( leg );
			}
			group.position.copy( position );
			scene.add( group );
			this.animals.push( { kind, group, legs, home: position.clone(), heading: a, timer: this.random() * 5, phase: i, walking: true } );
		}
	}

	update( dt, player, talkingId = null ) {
		this.time += dt;
		for ( const r of this.residents ) {
			const near = r.position.distanceTo( player.position ) < 8;
			if ( ! near && talkingId !== r.id ) {
				const a = this.time * 0.08 + r.phase;
				const x = r.home.x + Math.sin( a ) * 2, z = r.home.z + Math.cos( a ) * 2;
				if ( safeAt( this.terrain, this.colliders, x, z ) ) r.position.set( x, this.terrain.heightAt( x, z ), z );
			}
			r.vendor.position.copy( r.position );
			r.vendor.group.position.copy( r.position );
			r.vendor.talking = talkingId === r.id;
			r.vendor.update( dt, player.position );
		}
		for ( const animal of this.animals ) {
			const p = animal.group.position, distance = p.distanceTo( player.position );
			animal.group.visible = distance < 450;
			if ( distance > 450 ) continue;
			animal.timer -= dt;
			const flee = player.mode === 'walk' && distance < 3;
			if ( flee ) { animal.heading = Math.atan2( p.x - player.position.x, p.z - player.position.z ); animal.walking = true; }
			else if ( animal.timer <= 0 ) {
				animal.timer = 2 + this.random() * 5;
				animal.walking = this.random() > 0.3;
				animal.heading += ( this.random() - 0.5 ) * 2;
				if ( p.distanceTo( animal.home ) > 14 ) animal.heading = Math.atan2( animal.home.x - p.x, animal.home.z - p.z );
			}
			if ( ! animal.walking ) continue;
			const speed = ( animal.kind === 'goat' ? 0.8 : 0.22 ) * ( flee ? 2.5 : 1 );
			const x = p.x + Math.sin( animal.heading ) * speed * dt, z = p.z + Math.cos( animal.heading ) * speed * dt;
			if ( safeAt( this.terrain, this.colliders, x, z ) ) p.set( x, this.terrain.heightAt( x, z ), z );
			else { animal.heading += 1.7; animal.timer = 0.5; }
			animal.group.rotation.y = animal.heading;
			animal.phase += dt * speed * 8;
			animal.legs.forEach( ( leg, i ) => { leg.rotation.x = Math.sin( animal.phase + ( i === 0 || i === 3 ? 0 : Math.PI ) ) * 0.35; } );
		}
	}
}
