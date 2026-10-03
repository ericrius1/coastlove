import { Group, Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, sphere, cylinder, mat4, rod } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { Vendor } from '../game/Vendor.js';
import { describeCharacter, CHARACTER_LIMITS } from '../game/CharacterVariants.js';
import { mulberry32 } from '../util/Noise.js';
import { findSafeSpot, safeAt } from './Navigation.js';

import { CALIFORNIA_STORIES, PLACES } from '../california/Region.js';
import { STORIES } from './Stories.js';
import { WILDLIFE_HABITATS, WILDLIFE_BEHAVIOR } from './Wildlife.js';
import { createWoodlandAssets, makeWoodlandAnimal } from './WoodlandModels.js';
export { STORIES } from './Stories.js';
export { WILDLIFE_SPECIES, WILDLIFE_BY_KIND } from './Wildlife.js';

function animalGeometry( kind ) {
	const p = [];
	const add = ( geo, color, matrix ) => p.push( prepare( geo, { color, rough: 0.9, matrix } ) );
	if ( kind === 'fox' ) {
  add(sphere(1,16,10),0x918c78,mat4(0,.48,0,0,0,0,.19,.24,.48));
  add(sphere(1,12,8),0xb98554,mat4(0,.72,.44,0,0,0,.19,.20,.22));
  add(sphere(1,12,8),0xd9ccb4,mat4(0,.63,.60,0,0,0,.11,.11,.21));
  add(sphere(.052,8,6),0x191c19,mat4(0,.65,.77));
  for(const side of [-1,1]){
   add(cylinder(0,.11,.30,4),0xac825c,mat4(side*.13,.95,.43,0,0,side*-.16));
   add(sphere(.028,8,6),0x181a16,mat4(side*.142,.76,.58));
  }
  add(sphere(1,12,8),0xa78965,mat4(0,.32,-.63,.5,0,0,.12,.13,.4));
  add(sphere(1,10,8),0x30362f,mat4(0,.16,-.89,.5,0,0,.10,.11,.15));
 } else if(kind==='seaLion') {
  add(sphere(1,18,12),0x776448,mat4(0,.46,0,0,0,0,.47,.40,1.04));
  add(sphere(1,14,10),0x857154,mat4(0,.85,.68,-.35,0,0,.31,.62,.32));
  add(sphere(1,12,8),0x9b8564,mat4(0,1.30,.91,0,0,0,.27,.28,.31));
  add(sphere(1,12,8),0xb29e7a,mat4(0,1.20,1.16,0,0,0,.23,.13,.18));
  add(sphere(1,8,6),0x222620,mat4(0,1.28,1.30,0,0,0,.11,.06,.05));
  for(const side of [-1,1]){
   add(sphere(.035,8,6),0x171b18,mat4(side*.23,1.36,1.06));
   add(sphere(1,10,6),0x554d3b,mat4(side*.26,.18,-.96,0,side*.5,0,.22,.07,.45));
  }
 } else if ( kind === 'goat' ) {
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
	constructor( scene, terrain, colliders, { loadCharacters = false, california = false, placementClear = null } = {} ) {
		this.terrain = terrain;
		this.colliders = colliders;
		this.placementClear = placementClear;
		this.random = mulberry32( 8304 );
		this.time = 0;
		this.loadCharacters = loadCharacters;
		this._characterClock = 0;
		this._characterCandidates = [];
		this.residents = (california ? CALIFORNIA_STORIES : STORIES).map( ( story ) => {
			let x=story.x,z=story.z;
   if(story.site&&terrain.streets?.inCity(x,z)){
    const near=terrain.streets.nearest(x,z,300);if(near){const p=near.route.sample(near.s,1,0);x=p.x+Math.cos(p.heading)*(near.route.width/2+1);z=p.z-Math.sin(p.heading)*(near.route.width/2+1);}
   }else if(story.site){x+=12;z+=8;}
   const position = findSafeSpot( terrain, colliders, x, z, false, 180 );
			if ( ! position ) throw new Error( `No safe home for ${ story.name }` );
			const appearance = describeCharacter( story );
			const vendor = new Vendor( { name: story.name, position, radius: 4, appearance } );
			vendor.configureCharacter( { talk: appearance.body === 'marta' ? 'gestic_talk_neutral_01' : 'gestic_talk_relaxed_01' } );
			scene.add( vendor.group );
			return { ...story, appearance, vendor, position, home: position.clone(), phase: this.random() * 6.28 };
		} );
		// Residency starts once the player's location is known. Distant named
		// residents (including procedural settlements) no longer download models
		// or block startup; every one is eligible for the same nearby detail.
		this.ready = Promise.resolve();

		const material = createPropMaterial( 'islandAnimals' );
		material.underwaterLighting = 'lite';
		const geometries = { fox: animalGeometry('fox'), seaLion: animalGeometry('seaLion'), goat: animalGeometry( 'goat' ), tortoise: animalGeometry( 'tortoise' ) };
		const legGeometries = {
 fox: prepare(cylinder(.036,.028,.34,8),{color:0x6c4e34,rough:.9}),
 seaLion: prepare(sphere(1,10,6).scale(.16,.07,.5),{color:0x665640,rough:.8}),
			goat: prepare( cylinder( 0.065, 0.045, 0.58, 8 ), { color: 0x695b49, rough: 0.95 } ),
			tortoise: prepare( sphere( 1, 8, 6 ).scale( 0.12, 0.12, 0.24 ), { color: 0x8b8861, rough: 0.95 } )
		};
		const woodland = Object.fromEntries( [ 'deer', 'rabbit', 'quail', 'butterfly' ].map( kind => [ kind, createWoodlandAssets( kind ) ] ) );
		const habitats = california ? WILDLIFE_HABITATS : Array.from( { length: 32 }, ( _, i ) => ( { kind: i % 2 ? 'goat' : 'tortoise', count: 1, spread: 24, home: this.residents[ i % 4 ].home } ) );
		this.animals = [];
		for ( const habitat of habitats ) {
			const { kind } = habitat, home = habitat.home || PLACES.find( place => place.id === habitat.place );
			if ( ! home ) continue;
			for ( let i = 0; i < habitat.count; i ++ ) {
				const a = this.random() * Math.PI * 2, r = 5 + this.random() * habitat.spread;
				// Town centers contain benches, roads and buildings; the small garden
				// encounters belong beside the paths, never in the traffic lane.
				const gardenOffset = home.kind === 'town' ? 45 : habitat.place === 'harbor' ? 18 : 0;
				const accept = ( x, z ) => {
					if ( placementClear && ! placementClear( x, z ) ) return false;
					const road = terrain.streets?.surfaceAt?.( x, z );
					return ! road || road.distance > road.width / 2 + 2;
				};
				const position = findSafeSpot( terrain, colliders, home.x + gardenOffset + Math.sin( a ) * r, home.z + gardenOffset + Math.cos( a ) * r, false, 100, accept );
				if ( ! position ) continue;
				let model;
				if ( woodland[ kind ] ) model = makeWoodlandAnimal( woodland[ kind ], material );
				else {
					const group = new Group(), body = new Mesh( geometries[ kind ], material ), legs = [];
					body.castShadow = true; group.add( body );
					for ( const x of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) {
						const leg = new Mesh( legGeometries[ kind ], material );
						leg.position.set( x * ( kind === 'fox' ? .14 : kind === 'goat' ? 0.21 : .44 ), kind === 'fox' ? .19 : kind === 'goat' ? 0.33 : 0.13, z * (kind==='fox'?.27:.36) );
						group.add( leg ); legs.push( leg );
					}
					model = { group, body, legs, head: null, wings: [] };
				}
				model.group.position.copy( position );
				model.group.rotation.y = a;
				// Small natural variation keeps a covey or family from looking stamped.
				model.group.scale.setScalar( 0.88 + this.random() * 0.2 );
				scene.add( model.group );
				this.animals.push( { kind, ...model, habitat: habitat.place, home: position.clone(), heading: a, timer: 1 + this.random() * 5, phase: this.random() * 6.28, walking: false, state: 'forage', fright: 0, elapsed: 0, groundY: position.y } );
			}
		}
	}

	update( dt, player, talkingId = null ) {
		// A resumed background tab must not launch wildlife through a hillside.
		dt = Math.max( 0, Math.min( Number.isFinite( dt ) ? dt : 0, 0.1 ) );
		this.time += dt;
		this._characterClock -= dt;
		if ( this.loadCharacters && this._characterClock <= 0 ) {
			this._characterClock = 0.25;
			this.updateCharacters( player.position, talkingId );
		}
		for ( const r of this.residents ) {
			const distance = r.position.distanceTo(player.position);
			r.vendor.group.visible = distance < 500;
			if (distance > 500) continue;
			const near = distance < 8;
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
		for ( const animal of this.animals ) this.updateAnimal( animal, dt, player );
	}

	updateCharacters( position, talkingId = null ) {
		const candidates = this._characterCandidates;
		candidates.length = 0;
		for ( const resident of this.residents ) {
			const distanceSq = resident.position.distanceToSquared( position );
			const radius = resident.vendor.character ? CHARACTER_LIMITS.retainDistance : CHARACTER_LIMITS.loadDistance;
			if ( distanceSq < radius * radius ) candidates.push( { resident, distanceSq, talking: resident.id === talkingId } );
		}
		candidates.sort( ( a, b ) => Number( b.talking ) - Number( a.talking ) || a.distanceSq - b.distanceSq );
		const selected = new Set( candidates.slice( 0, CHARACTER_LIMITS.detailed ).map( entry => entry.resident ) );
		// Release first so a teleport can immediately reuse existing rig slots.
		for ( const resident of this.residents ) if ( ! selected.has( resident ) ) resident.vendor.setCharacterDetail( false );
		for ( const { resident } of candidates.slice( 0, CHARACTER_LIMITS.detailed ) ) resident.vendor.setCharacterDetail( true );
	}

	updateAnimal( animal, dt, player ) {
		const p = animal.group.position, behavior = WILDLIFE_BEHAVIOR[ animal.kind ];
		const dx = p.x - player.position.x, dy = p.y - player.position.y, dz = p.z - player.position.z;
		const distanceSq = dx * dx + dy * dy + dz * dz;
		animal.group.visible = distanceSq < behavior.range * behavior.range;
		if ( ! animal.group.visible ) { animal.elapsed = 0; return; }
		animal.elapsed += dt;
		// Tiny footsteps do not need 60 terrain/collision queries a second from
		// across a valley. Nearby animation keeps full frame cadence.
		if ( distanceSq > 55 * 55 && animal.elapsed < 0.12 ) return;
		const step = Math.min( animal.elapsed, 0.2 ); animal.elapsed = 0;
		animal.timer -= step;
		animal.fright = Math.max( 0, animal.fright - step );
		const flying = animal.kind === 'butterfly';
		if ( player.mode === 'walk' && distanceSq < behavior.comfort * behavior.comfort ) {
			animal.heading = Math.atan2( dx, dz );
			animal.fright = 1.3;
		}
		if ( animal.fright > 0 ) {
			animal.state = 'flee'; animal.timer = 0;
		} else if ( animal.timer <= 0 ) {
			animal.timer = 2 + this.random() * 5;
			const choice = this.random();
			animal.state = choice < 0.3 ? 'rest' : choice < 0.6 ? 'forage' : 'wander';
			animal.heading += ( this.random() - 0.5 ) * 2.1;
		}
		const homeDx = animal.home.x - p.x, homeDz = animal.home.z - p.z;
		if ( animal.state !== 'flee' && homeDx * homeDx + homeDz * homeDz > behavior.roam * behavior.roam ) {
			animal.heading = Math.atan2( homeDx, homeDz ); animal.state = 'wander';
		}
		const alert = ! flying && animal.state !== 'flee' && player.mode === 'walk' && distanceSq < behavior.comfort * behavior.comfort * 3;
		animal.walking = ! alert && ( animal.state === 'wander' || animal.state === 'flee' || flying && animal.state === 'forage' );
		const speed = animal.walking ? animal.state === 'flee' ? behavior.fleeSpeed : behavior.speed : 0;
		if ( speed > 0 ) {
			if ( flying && animal.state !== 'flee' ) animal.heading += Math.sin( this.time * 1.4 + animal.phase ) * step * 0.8;
			const x = p.x + Math.sin( animal.heading ) * speed * step, z = p.z + Math.cos( animal.heading ) * speed * step;
			const road = this.terrain.streets?.surfaceAt?.( x, z );
			if ( ( ! this.placementClear || this.placementClear( x, z ) ) && ( ! road || road.distance > road.width / 2 + 1 ) && safeAt( this.terrain, this.colliders, x, z ) ) {
				p.x = x; p.z = z; animal.groundY = this.terrain.heightAt( x, z );
			} else { animal.heading += 1.7; animal.timer = 0.6; }
		}
		const turn = Math.atan2( Math.sin( animal.heading - animal.group.rotation.y ), Math.cos( animal.heading - animal.group.rotation.y ) );
		animal.group.rotation.y += turn * Math.min( 1, step * ( animal.state === 'flee' ? 12 : 3 ) );
		animal.phase += step * ( speed * 8 + 0.7 );
		for ( let i = 0; i < animal.legs.length; i ++ ) {
			const leg = animal.legs[ i ], offset = i === 0 || i === 3 ? 0 : Math.PI;
			const target = animal.walking ? Math.sin( animal.phase + offset ) * behavior.legSwing : 0;
			leg.rotation.x += ( target - leg.rotation.x ) * Math.min( 1, step * 14 );
		}
		animal.body.position.y = Math.sin( this.time * 1.8 + animal.phase ) * 0.007;
		if ( animal.head ) {
			const grazing = ! animal.walking && ! alert && animal.state === 'forage';
			const headTilt = grazing ? ( animal.kind === 'deer' ? 1.3 : 0.45 ) + Math.sin( this.time * 3 + animal.phase ) * 0.12 : 0;
			animal.head.rotation.x += ( headTilt - animal.head.rotation.x ) * Math.min( 1, step * 4 );
			const lookAngle = Math.atan2( - dx, - dz ) - animal.group.rotation.y;
			animal.head.rotation.y = alert ? Math.max( - 0.6, Math.min( 0.6, Math.atan2( Math.sin( lookAngle ), Math.cos( lookAngle ) ) ) ) : Math.sin( this.time * 0.6 + animal.phase ) * 0.12;
		}
		if ( animal.kind === 'rabbit' && animal.walking ) {
			p.y = animal.groundY + Math.max( 0, Math.sin( animal.phase * 1.5 ) ) * ( animal.state === 'flee' ? 0.14 : 0.065 );
		} else if ( flying ) {
			const hover = animal.walking ? 0.8 + Math.sin( this.time * 2 + animal.phase ) * 0.3 : 0.18;
			p.y += ( animal.groundY + hover - p.y ) * Math.min( 1, step * 3 );
			animal.wings.forEach( ( wing, i ) => { wing.rotation.z = ( i ? - 1 : 1 ) * ( 0.3 + Math.sin( this.time * ( animal.walking ? 24 : 5 ) + animal.phase ) * 0.9 ); } );
		} else p.y = animal.groundY;
	}
}
