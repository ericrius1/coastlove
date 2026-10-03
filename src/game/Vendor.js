import { Group } from '../engine/index.js';
import { createPropMaterial } from './GameMaterials.js';
import { describeCharacter, createCharacterFallback, createCharacterVariant, characterURL } from './CharacterVariants.js';

// A trader the player talks to (E within `radius`). Swappable: `model` is a slot (a Group) that
// holds the stand-in figure; setModel( obj ) replaces it. loadCharacter( url ) swaps in a skinned,
// animated character (engine SkinnedModel, Rocketbox avatars) once it has loaded: idle clip,
// a wave when the player comes up, talk gestures while their panel is open (vendor.talking).
//   new Vendor( { name, position, yaw, radius, greeting, idle, material, character } )
//   vendor.group (add to the scene), vendor.inRange( p ), vendor.update( dt, lookAt )
export class Vendor {

	constructor( { name, kind = 'buyer', position, yaw = 0, radius = 2.6, greeting = '', idle = '', material = null, look = {}, character = null, appearance = null } ) {

		this.name = name;
		this.kind = kind; // 'buyer' (fish stand) | 'shop' (upgrades)
		this.greeting = greeting;
		this.idle = idle;
		this.radius = radius;
		this.position = position.clone();
		this.yaw = yaw;
		this.group = new Group();
		this.group.name = 'Vendor:' + name;
		this.group.position.copy( position );
		this.group.rotation.y = yaw;
		this.model = new Group();
		this.group.add( this.model );
		this.material = material || createPropMaterial( 'vendor' );
		this.appearance = appearance || describeCharacter( name, { ...look, accent: look.apron, body: character?.url?.includes( 'marta' ) ? 'marta' : character?.url?.includes( 'joe' ) ? 'joe' : undefined } );
		this._customizeCharacter = !! appearance;
		this.fallback = createCharacterFallback( this.appearance, this.material );
		this.figure = this.fallback;
		this._characterGeneration = 0;
		this._characterPromise = null;
		this._characterSpec = null;
		this._retryCharacterAt = 0;
		this.model.add( this.figure );
		this._t = this.appearance.phase * 10;
		this._yawOff = 0;
		this.character = null;
		this.talking = false;
		this._near = false;
		if ( character ) this.loadCharacter( character.url, character ).catch( ( e ) => console.warn( 'Vendor: character failed to load', e ) );

	}

	configureCharacter( options = {} ) {

		this._characterSpec = { url: characterURL( this.appearance.body ), ...options };

	}

	// Distance streaming only requests the six nearest candidates. Generation
	// checks cancel stale asynchronous arrivals after a teleport or LOD change.
	setCharacterDetail( wanted ) {

		if ( ! wanted ) { this.releaseCharacter(); return; }
		if ( this.character || this._characterPromise || this._t < this._retryCharacterAt || ! this._characterSpec ) return;
		const { url, ...options } = this._characterSpec;
		this.loadCharacter( url, options ).catch( error => {

			this._retryCharacterAt = this._t + 30;
			console.warn( `Using fallback character for ${ this.name }`, error );

		} );

	}

	// clips: { idle, talk, greet }. Existing fish-stand/chandlery callers keep
	// their original textured appearance, but share the decoded source assets.
	loadCharacter( url, { idle = this.appearance.idle, talk = 'gestic_talk_relaxed_01', greet = 'wave_01', listen = null, customize = this._customizeCharacter } = {} ) {

		const generation = ++ this._characterGeneration;
		const body = url.includes( 'marta' ) ? 'marta' : url.includes( 'joe' ) ? 'joe' : this.appearance.body;
		const descriptor = body === this.appearance.body ? this.appearance : describeCharacter( this.appearance.id, { ...this.appearance, body } );
		const wanted = () => generation === this._characterGeneration;
		const pending = createCharacterVariant( descriptor, { url, wanted, customize } ).then( model => {

			if ( ! model ) { this._retryCharacterAt = this._t + 2; return null; }
			if ( ! wanted() ) { model.dispose(); return null; }
			try {
				for ( const clip of [ idle, talk, greet, listen ] ) if ( clip && ! model.clips.has( clip ) ) throw new Error( 'Vendor: unknown character clip ' + clip );
				model.play( idle, { fade: 0.01, from: this.appearance.phase * model.clipDuration( idle ) } );
				model.update( 0 );
			} catch ( error ) { model.dispose(); throw error; }
			this.character?.dispose();
			this.clips = { idle, talk, greet, listen };
			model.onClipEnd = () => model.play( this.talking ? talk : idle, { fade: 0.5 } );
			this.character = model;
			this.setModel( model.group );
			return model;

		} ).finally( () => { if ( this._characterPromise === pending ) this._characterPromise = null; } );
		this._characterPromise = pending;
		return pending;

	}

	releaseCharacter() {

		if ( ! this.character && ! this._characterPromise ) return;
		this._characterGeneration ++;
		if ( this.character ) {

			this.character.dispose(); this.character = null; this._near = false;
			this.setModel( this.fallback );

		}

	}

	setModel( obj ) {

		this.model.clear();
		this.model.add( obj );
		this.figure = obj;

	}

	inRange( p ) {

		return Math.hypot( p.x - this.position.x, p.z - this.position.z ) < this.radius && Math.abs( p.y - this.position.y ) < 2.5;

	}

	// idle motion: breathing, a slow weight shift, turning toward the player when near
	update( dt, lookAt = null ) {

		this._t += dt;
		let want = 0;
		if ( lookAt ) {

			const dx = lookAt.x - this.position.x, dz = lookAt.z - this.position.z;
			if ( dx * dx + dz * dz < 64 ) {

				want = Math.atan2( dx, dz ) - this.yaw;
				want = Math.atan2( Math.sin( want ), Math.cos( want ) );
				want = Math.max( - 1.1, Math.min( 1.1, want ) );

			}

		}

		this._yawOff += ( want - this._yawOff ) * ( 1 - Math.exp( - dt * 2.5 ) );
		const f = this.figure;
		if ( this.character ) {

			const c = this.character, K = this.clips;
			const d2 = lookAt ? ( lookAt.x - this.position.x ) ** 2 + ( lookAt.z - this.position.z ) ** 2 : Infinity;
			// animate only when someone can see it up close (the pose holds otherwise)
			if ( d2 > 3600 ) {

				c.hold();
				return;

			}

			const near = d2 < ( this.radius + 3 ) ** 2;
			if ( near && ! this._near && K.greet && ! this.talking ) c.play( K.greet, { fade: 0.35, loop: false } );
			this._near = near;
			const busy = c.current === K.greet;
			if ( ! busy ) {

				const want = this.talking ? K.talk : K.idle;
				if ( c.current !== want ) c.play( want, { fade: 0.6 } );

			}

			f.rotation.y = this._yawOff;
			c.update( dt );
			return;

		}

		f.rotation.y = this._yawOff + Math.sin( this._t * 0.37 ) * 0.05;
		f.rotation.z = Math.sin( this._t * 0.23 ) * 0.02;
		f.scale.y = 1 + Math.sin( this._t * 1.6 ) * 0.006;

	}

}
