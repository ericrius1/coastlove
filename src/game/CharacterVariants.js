import { Color, Mesh, Vector3 } from '../engine/index.js';
import { SkinnedModel } from '../engine/render/Skinning.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { prepare, mergePrepared, cylinder, sphere, roundedBox, box, rod, torus, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from './GameMaterials.js';

// Two credited Rocketbox sources provide the face textures, skinning and seven
// authored performances. Descriptors are cheap data; only nearby people get a
// skeleton. Clothing, build, hair, headwear and accessories combine independently.
export const CHARACTER_LIMITS = Object.freeze( { detailed: 6, concurrent: 2, loadDistance: 120, retainDistance: 180, visibleDistance: 500 } );
export const CHARACTER_PALETTES = Object.freeze( {
	outfit: [ 0x477c82, 0x547259, 0xa55f42, 0xc09558, 0x596886, 0x88566a, 0x5f7b97, 0xc4b697, 0x66604d, 0x8c735d, 0x376a63, 0x955653 ],
	trousers: [ 0x344b62, 0x484b41, 0x72694f, 0x3b4146, 0x695749, 0x656b62, 0x7d766a, 0x454e5c ],
	hair: [ 0x29231f, 0x4b3528, 0x766049, 0x9a6846, 0xb3a27b, 0xa6a59c, 0x686968, 0xd1c5aa ],
	skin: [ 0xbd8c6a, 0xd4aa88, 0xa87856, 0x916648, 0xd7b49b, 0xb78970 ],
} );
const NAMED = {
	ines: { body: 'marta', accessory: 'scarf', headwear: 'none', outfit: 'plain' },
	rowan: { body: 'joe', accessory: 'satchel', headwear: 'cap', outfit: 'check' },
	sana: { body: 'marta', accessory: 'camera', headwear: 'sunhat', outfit: 'plain' },
	elias: { body: 'joe', accessory: 'scarf', headwear: 'cap', outfit: 'plain', hair: 0xa6a59c },
	marisol: { body: 'marta', accessory: 'satchel', headwear: 'none', outfit: 'stripe' },
	jules: { body: 'joe', accessory: 'camera', headwear: 'cap', outfit: 'contrast', glasses: true },
	mei: { body: 'marta', accessory: 'scarf', headwear: 'none', outfit: 'plain' },
	noah: { body: 'joe', accessory: 'satchel', headwear: 'cap', outfit: 'contrast' },
	fern: { body: 'marta', accessory: 'satchel', headwear: 'beanie', outfit: 'check' },
};
const OUTFITS = [ 'plain', 'stripe', 'check', 'contrast' ];
const ACCESSORIES = [ 'none', 'scarf', 'satchel', 'camera' ];
const templates = new Map(), pools = new Map(), queue = [];
let active = 0, instances = 0;

function hash( value ) {
	let seed = 2166136261;
	for ( const ch of String( value ) ) { seed ^= ch.codePointAt( 0 ); seed = Math.imul( seed, 16777619 ); }
	return seed >>> 0;
}
const bounded = ( value, fallback, min, max ) => Number.isFinite( value ) ? Math.max( min, Math.min( max, value ) ) : fallback;
const color = ( value, fallback ) => Math.round( bounded( value, fallback, 0, 0xffffff ) );

export function describeCharacter( identity, overrides = {} ) {
	const info = identity && typeof identity === 'object' ? identity : { id: identity };
	const id = String( info.id ?? info.name ?? 'coastal-resident' );
	const seed = hash( id );
	let state = seed;
	const random = () => { state = ( state + 0x6d2b79f5 ) >>> 0; let n = state; n = Math.imul( n ^ n >>> 15, n | 1 ); n ^= n + Math.imul( n ^ n >>> 7, n | 61 ); return ( ( n ^ n >>> 14 ) >>> 0 ) / 4294967296; };
	const pick = values => values[ Math.floor( random() * values.length ) ];
	const options = { ...NAMED[ id ], ...overrides };
	const body = options.body === 'joe' || options.body === 'marta' ? options.body : random() < 0.5 ? 'joe' : 'marta';
	const headwearOptions = body === 'joe' ? [ 'cap' ] : [ 'none', 'beanie', 'sunhat' ];
	const outfit = OUTFITS.includes( options.outfit ) ? options.outfit : pick( OUTFITS );
	return Object.freeze( {
		id, seed, body, outfit,
		shirt: color( options.shirt ?? info.color, pick( CHARACTER_PALETTES.outfit ) ),
		trousers: color( options.trousers, pick( CHARACTER_PALETTES.trousers ) ),
		hair: color( options.hair, pick( CHARACTER_PALETTES.hair ) ),
		skin: color( options.skin, pick( CHARACTER_PALETTES.skin ) ),
		accent: color( options.accent, pick( CHARACTER_PALETTES.outfit ) ),
		hat: color( options.hat, pick( [ 0xc4ae80, 0x657b70, 0x52687b, 0xa56b4c, 0x53565e, 0x98735a ] ) ),
		headwear: headwearOptions.includes( options.headwear ) ? options.headwear : pick( headwearOptions ),
		accessory: ACCESSORIES.includes( options.accessory ) ? options.accessory : pick( ACCESSORIES ),
		glasses: typeof options.glasses === 'boolean' ? options.glasses : random() < 0.3,
		height: bounded( options.height, 0.94 + random() * 0.13, 0.88, 1.12 ),
		build: bounded( options.build, 0.9 + random() * 0.21, 0.84, 1.2 ),
		depth: bounded( options.depth, 0.94 + random() * 0.13, 0.88, 1.16 ),
		headWidth: bounded( options.headWidth, 0.97 + random() * 0.07, 0.94, 1.07 ),
		idle: pick( [ 'idle_neutral_01', 'idle_breathe_01', 'idle_look_around_01' ] ),
		phase: random(),
	} );
}

export function characterURL( body ) { return ( import.meta.env?.BASE_URL || '/' ) + `models/characters/${ body === 'marta' ? 'marta' : 'joe' }.glb`; }
export function characterVariantStats() { return { sources: templates.size, active, queued: queue.length, instances, pooled: [ ...pools.values() ].reduce( ( sum, slots ) => sum + slots.length, 0 ) }; }

const VARIANT_SURFACE = /* wgsl */`
	let local = in.vs.vCharacterRest;
	let luminance = dot( s.albedo, vec3f( 0.2126, 0.7152, 0.0722 ) );
	if ( mat.characterPart < 0.5 ) {
		let female = mat.characterBody;
		let sleeveEnd = mix( 0.535, 0.47, female );
		let upper = smoothstep( 0.94, 1.015, local.y ) * ( 1.0 - smoothstep( 1.44, 1.49, local.y ) )
			* ( 1.0 - smoothstep( sleeveEnd - 0.025, sleeveEnd, abs( local.x ) ) );
		let lower = smoothstep( mix( 0.10, 0.46, female ), mix( 0.14, 0.52, female ), local.y ) * ( 1.0 - smoothstep( 0.9, 0.96, local.y ) );
		let detail = clamp( luminance / mix( 0.3, 0.055, female ), 0.25, 1.8 );
		let weaveWidth = max( fwidth( local.y ), 0.001 );
		let stripe = smoothstep( 0.46 - weaveWidth * 24.0, 0.46 + weaveWidth * 24.0, fract( local.y * 24.0 ) );
		let check = stripe * smoothstep( 0.44, 0.56, fract( local.x * 23.0 ) );
		var pattern = 1.0;
		if ( mat.characterPattern > 0.5 && mat.characterPattern < 1.5 ) { pattern = mix( 0.7, 1.04, stripe ); }
		if ( mat.characterPattern > 1.5 && mat.characterPattern < 2.5 ) { pattern = mix( 0.7, 1.03, check ); }
		var cloth = mat.characterShirt;
		if ( mat.characterPattern > 2.5 ) { cloth = mix( cloth, mat.characterAccent, smoothstep( 1.23, 1.25, local.y ) ); }
		s.albedo = mix( s.albedo, cloth * detail * pattern, upper * mat.characterAmount );
		s.albedo = mix( s.albedo, mat.characterTrousers * clamp( luminance / 0.13, 0.3, 1.8 ), lower * mat.characterAmount );
		s.roughness = mix( s.roughness, max( s.roughness, 0.66 ), upper * mat.characterAmount );
	} else {
		// Recolor hair at the back/sides of the scalp; the photographed face,
		// eyes, eyebrows and skin texture are never replaced with a flat tint.
		let scalp = smoothstep( 1.51, 1.59, local.y ) * ( 1.0 - smoothstep( -0.025, 0.025, local.z ) );
		let hairMask = select( scalp, 1.0, mat.characterPart > 1.5 );
		let hairDetail = clamp( sqrt( luminance ) * 2.0, 0.38, 1.5 );
		s.albedo = mix( s.albedo, mat.characterHair * hairDetail, hairMask * mat.characterAmount * 0.88 );
		let cap = smoothstep( 1.70, 1.735, local.y ) * ( 1.0 - mat.characterBody );
		s.albedo = mix( s.albedo, mat.characterHat * clamp( luminance * 2.0, 0.4, 1.6 ), cap * mat.characterAmount );
	}
`;

async function templateFor( url, body ) {
	let pending = templates.get( url );
	if ( pending ) return pending;
	pending = ( async () => {
		const gltf = await loadGLB( url );
		const template = await SkinnedModel.create( gltf, { materials: info => ( {
			uniforms: {
				characterShirt: [ 'vec3f', new Color( 0xffffff ) ], characterTrousers: [ 'vec3f', new Color( 0xffffff ) ],
				characterHair: [ 'vec3f', new Color( 0xffffff ) ], characterAccent: [ 'vec3f', new Color( 0xffffff ) ], characterHat: [ 'vec3f', new Color( 0xffffff ) ],
				characterPart: [ 'f32', info.name === 'body' ? 0 : info.name === 'opacity' ? 2 : 1 ],
				characterBody: [ 'f32', body === 'marta' ? 1 : 0 ], characterAmount: [ 'f32', 0 ], characterPattern: [ 'f32', 0 ], characterHeadWidth: [ 'f32', 1 ],
			}, surface: VARIANT_SURFACE,
		} ) } );
		for ( const material of template.materials ) {
			material.underwaterLighting = 'lite';
			material.varyings = { ...material.varyings, vCharacterRest: 'vec3f' };
			material.vertex = 'o.vCharacterRest = v.position;\nlet headScale = mix( 1.0, mat.characterHeadWidth, smoothstep( 1.43, 1.56, v.position.y ) );\nv.position.x *= headScale;\nv.normal.x /= headScale;\n' + material.vertex;
		}
		return template;
	} )();
	templates.set( url, pending );
	pending.catch( () => { if ( templates.get( url ) === pending ) templates.delete( url ); } );
	return pending;
}

function drain() {
	while ( active < CHARACTER_LIMITS.concurrent && queue.length ) {
		const job = queue.shift();
		if ( ! job.wanted() ) { job.resolve( null ); continue; }
		active ++;
		job.run().then( job.resolve, job.reject ).finally( () => { active --; drain(); } );
	}
}

export function createCharacterVariant( descriptor, { url = characterURL( descriptor.body ), wanted = () => true, customize = true } = {} ) {
	return new Promise( ( resolve, reject ) => {
		for ( let i = queue.length - 1; i >= 0; i -- ) {
			if ( ! queue[ i ].wanted() ) { queue[ i ].resolve( null ); queue.splice( i, 1 ); }
		}
		queue.push( { wanted, resolve, reject, run: async () => {
			const template = await templateFor( url, descriptor.body );
			if ( ! wanted() ) return null;
			let pool = pools.get( url );
			if ( ! pool ) { pool = []; pools.set( url, pool ); }
			let slot = pool.find( candidate => ! candidate.used );
			if ( ! slot ) {
				// A fixed six-slot pool per rig bounds material IDs and their cached
				// render pipelines too. An overloaded caller keeps its fallback.
				if ( pool.length >= CHARACTER_LIMITS.detailed ) return null;
				const model = SkinnedModel.fromTemplate( template );
				slot = { model, used: false, attachments: [] }; pool.push( slot );
				const update = model.update.bind( model );
				model.update = dt => { update( dt ); for ( const { mesh, joint } of slot.attachments ) { mesh.matrix.fromArray( model.jointData, joint * 16 ); mesh.matrixWorldNeedsUpdate = true; } };
				model.dispose = () => {
					if ( ! slot.used ) return;
					slot.used = false; instances --; model.group.removeFromParent(); model.onClipEnd = null; model.layers.length = 0;
				};
			}
			const model = slot.model;
			slot.used = true; instances ++;
			model.group.name = 'Resident:' + descriptor.id;
			model.group.position.set( 0, 0, 0 ); model.group.rotation.set( 0, 0, 0 );
			model.group.scale.set( customize ? descriptor.build : 1, customize ? descriptor.height : 1, customize ? descriptor.depth : 1 );
			model.layers.length = 0; model.onClipEnd = null;
			for ( const material of model.materials ) {
				const U = material.uniforms;
				for ( const [ field, key ] of [ [ 'characterShirt', 'shirt' ], [ 'characterTrousers', 'trousers' ], [ 'characterHair', 'hair' ], [ 'characterAccent', 'accent' ], [ 'characterHat', 'hat' ] ] ) U[ field ].value.set( descriptor[ key ] );
				U.characterAmount.value = customize ? 0.9 : 0;
				U.characterPattern.value = OUTFITS.indexOf( descriptor.outfit );
				U.characterHeadWidth.value = customize ? descriptor.headWidth : 1;
			}
			updateAccessories( slot, descriptor, customize );
			// A reused slot may belong to somebody hundreds of kilometres away.
			// Reset object motion as well as the skin's previous joint matrices.
			model.group.traverse( object => { if ( object.isMesh ) object.resetVelocity = true; } );
			return model;
		} } );
		drain();
	} );
}

function accessoryParts( d, detailed = true ) {
	const head = [], torso = [];
	const add = ( list, geometry, color, matrix, rough = 0.78, pattern = PAT.cloth ) => list.push( prepare( geometry, { color, matrix, rough, pattern } ) );
	const y = d.body === 'marta' ? 1.70 : 1.78;
	const front = d.body === 'marta' ? 0.043 : 0.125;
	if ( d.headwear === 'sunhat' ) {
		add( head, cylinder( 0.082, 0.118, 0.075, 20 ), d.hat, mat4( 0, y + 0.006, -0.035 ) );
		add( head, cylinder( 0.215, 0.21, 0.012, 28 ), d.hat, mat4( 0, y - 0.025, -0.035, -0.03 ) );
		add( head, cylinder( 0.121, 0.121, 0.017, 20 ), d.accent, mat4( 0, y - 0.015, -0.035 ) );
	} else if ( d.headwear === 'beanie' ) {
		add( head, sphere( 0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2 ), d.hat, mat4( 0, y - 0.035, -0.055, 0, 0, 0, 0.93, 0.9, 1.03 ) );
		add( head, cylinder( 0.106, 0.105, 0.027, 24 ), d.hat, mat4( 0, y - 0.035, -0.055, 0, 0, 0, 1, 1, 1.08 ) );
		const stitchColor = new Color( d.hat ).multiplyScalar( 0.8 );
		for ( let i = 0; i < 24; i ++ ) {
			const angle = i / 24 * Math.PI * 2, x = Math.cos( angle ) * 0.106, z = Math.sin( angle ) * 0.114 - 0.055;
			add( head, rod( new Vector3( x, y - 0.047, z ), new Vector3( x, y - 0.023, z ), 0.0011, 4 ), stitchColor, null );
		}
	} else if ( ! detailed && d.headwear === 'cap' ) {
		add( head, sphere( 0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2 ), d.hat, mat4( 0, y - 0.02, 0.015 ) );
		add( head, roundedBox( 0.19, 0.012, 0.12, 0.025, 2 ), d.hat, mat4( 0, y - 0.02, 0.095 ) );
	}
	if ( d.glasses ) {
		const ey = d.body === 'marta' ? 1.622 : 1.682;
		for ( const side of [ -1, 1 ] ) {
			add( head, torus( 0.025, 0.003, 5, 16 ), 0x51483b, mat4( side * 0.038 * d.headWidth, ey, front, 0, 0, 0, 1.12, 0.86, 1 ), 0.3, PAT.plain );
			add( head, rod( new Vector3( side * 0.066, ey, front ), new Vector3( side * 0.094, ey, -0.04 ), 0.0025, 5 ), 0x51483b, null, 0.3, PAT.plain );
		}
		add( head, rod( new Vector3( -0.013, ey + 0.002, front ), new Vector3( 0.013, ey + 0.002, front ), 0.0028, 5 ), 0x51483b, null, 0.3, PAT.plain );
	}
	if ( d.accessory === 'scarf' ) {
		const neckY = d.body === 'marta' ? 1.47 : 1.52;
		add( head, torus( 0.064, 0.015, 7, 20 ), d.accent, mat4( 0, neckY, 0, Math.PI / 2, 0, 0, 1, 1, 1.15 ) );
		add( torso, roundedBox( 0.046, 0.20, 0.014, 0.007, 2 ), d.accent, mat4( 0.035, neckY - 0.14, 0.145, 0.12, 0, -0.10 ) );
	} else if ( d.accessory === 'satchel' || d.accessory === 'camera' ) {
		add( torso, rod( new Vector3( -0.14, 1.43, 0.05 ), new Vector3( 0.19, 0.97, 0.17 ), 0.012, 6 ), d.accent, null );
		if ( d.accessory === 'satchel' ) {
			add( torso, roundedBox( 0.195, 0.22, 0.072, 0.035, 4 ), d.accent, mat4( 0.19, 0.95, 0.135, 0, 0, -0.08 ) );
			add( torso, roundedBox( 0.196, 0.075, 0.012, 0.02, 3 ), d.hat, mat4( 0.19, 1.015, 0.175, 0, 0, -0.08 ) );
			add( torso, box( 0.019, 0.028, 0.006 ), 0xb79b62, mat4( 0.19, 1.002, 0.185 ), 0.3, PAT.plain );
		} else {
			add( torso, roundedBox( 0.12, 0.082, 0.052, 0.013, 2 ), 0x313a3c, mat4( 0.06, 1.06, 0.17 ), 0.48, PAT.plain );
			add( torso, cylinder( 0.03, 0.032, 0.043, 16 ), 0x263338, mat4( 0.06, 1.06, 0.209, Math.PI / 2 ), 0.2, PAT.plain );
		}
	}
	return { head, torso };
}

function updateAccessories( slot, descriptor, customize ) {
	const model = slot.model;
	const parts = customize ? accessoryParts( descriptor ) : { head: [], torso: [] };
	for ( const [ name, list ] of [ [ 'Bip01 Head', parts.head ], [ 'Bip01 Spine2', parts.torso ] ] ) {
		let attachment = slot.attachments.find( entry => entry.name === name );
		if ( ! list.length ) { if ( attachment ) attachment.mesh.visible = false; continue; }
		if ( ! attachment ) {
			const node = model.gltf.nodes.findIndex( n => n.name === name );
			const joint = model.skin.joints.indexOf( node );
			if ( joint < 0 ) continue;
			const material = createPropMaterial( 'residentAccessories' ); material.underwaterLighting = 'lite';
			const mesh = new Mesh( mergePrepared( list ), material );
			mesh.name = 'residentAttachment:' + name; mesh.castShadow = true; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
			model.group.add( mesh ); attachment = { mesh, joint, name }; slot.attachments.push( attachment );
		} else {
			attachment.mesh.geometry.dispose(); attachment.mesh.geometry = mergePrepared( list );
		}
		attachment.mesh.visible = true;
	}
}

// A single merged draw with consistent anatomy, collars, seams, cuffs, shoes and
// facial features. It remains available during loading, outside the detail ring,
// and if a network request fails; it never incurs animation or texture loads.
export function createCharacterFallback( d, material = null ) {
	const parts = [], add = ( geometry, tint, matrix, pattern = PAT.cloth, rough = 0.83 ) => parts.push( prepare( geometry, { color: tint, matrix, pattern, rough } ) );
	const V = ( x, y, z ) => new Vector3( x, y, z );
	const female = d.body === 'marta', headY = female ? 1.60 : 1.68;
	for ( const side of [ -1, 1 ] ) {
		add( roundedBox( 0.13, 0.095, 0.255, 0.035, 2 ), 0x40372f, mat4( side * 0.09, 0.05, 0.045 ), PAT.plain, 0.62 );
		add( cylinder( 0.076, 0.06, 0.68, 10 ), d.trousers, mat4( side * 0.09, 0.43, 0 ) );
		add( rod( V( side * 0.2, 1.36, 0 ), V( side * 0.245, 1.09, 0.01 ), 0.065, 9, 0.048 ), d.shirt, null );
		add( rod( V( side * 0.245, 1.09, 0.01 ), V( side * 0.23, 0.9, 0.08 ), 0.049, 9, 0.036 ), d.shirt, null );
		add( sphere( 0.044, 9, 7 ), d.skin, mat4( side * 0.23, 0.855, 0.09, 0.12, 0, 0, 0.78, 1.2, 0.75 ), PAT.skin );
		add( box( 0.08, 0.075, 0.009 ), d.accent, mat4( side * 0.088, 1.26, 0.133 ) );
		add( rod( V( side * 0.045, 1.455, 0.055 ), V( side * 0.10, 1.375, 0.13 ), 0.022, 5 ), d.shirt, null );
	}
	add( roundedBox( female ? 0.32 : 0.365, 0.51, 0.245, 0.085, 3 ), d.shirt, mat4( 0, 1.16, 0 ) );
	add( roundedBox( 0.30, 0.17, 0.225, 0.065, 2 ), d.trousers, mat4( 0, 0.835, 0 ) );
	add( box( 0.012, 0.40, 0.008 ), d.accent, mat4( 0, 1.15, 0.131 ) );
	for ( let i = 0; i < 4; i ++ ) add( sphere( 0.006, 5, 4 ), 0xb8ad93, mat4( 0, 1.05 + i * 0.082, 0.14 ), PAT.plain );
	add( cylinder( 0.052, 0.058, 0.10, 10 ), d.skin, mat4( 0, headY - 0.15, 0 ), PAT.skin );
	add( sphere( 0.108, 18, 12 ), d.skin, mat4( 0, headY, 0.006, 0, 0, 0, d.headWidth * 0.86, 1.16, 0.94 ), PAT.skin );
	add( sphere( 0.109, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.64 ), d.hair, mat4( 0, headY + 0.015, -0.021, -0.14, 0, 0, 0.95, 1.06, 1.0 ), PAT.plain );
	add( sphere( 0.021, 8, 6 ), d.skin, mat4( 0, headY - 0.008, 0.108, 0, 0, 0, 0.65, 1.17, 0.8 ), PAT.skin );
	for ( const side of [ -1, 1 ] ) {
		add( sphere( 0.018, 8, 6 ), d.skin, mat4( side * 0.092, headY, 0 ), PAT.skin );
		add( sphere( 0.010, 8, 6 ), 0xddd6c7, mat4( side * 0.034, headY + 0.024, 0.097, 0, 0, 0, 1, 0.62, 0.3 ), PAT.plain, 0.3 );
		add( sphere( 0.005, 7, 5 ), 0x302b23, mat4( side * 0.034, headY + 0.024, 0.10 ), PAT.plain, 0.28 );
		add( rod( V( side * 0.021, headY + 0.045, 0.093 ), V( side * 0.047, headY + 0.043, 0.088 ), 0.0035, 5 ), d.hair, null, PAT.plain );
	}
	add( rod( V( -0.022, headY - 0.05, 0.093 ), V( 0.022, headY - 0.05, 0.093 ), 0.003, 5 ), 0x925e50, null, PAT.plain );
	const accessories = accessoryParts( d, false );
	parts.push( ...accessories.head, ...accessories.torso );
	const geometry = mergePrepared( parts ); geometry.scale( d.build, d.height, d.depth );
	const mesh = new Mesh( geometry, material || createPropMaterial( 'residentFallback' ) );
	mesh.name = 'ResidentFallback:' + d.id; mesh.castShadow = true; mesh.material.underwaterLighting = 'lite';
	return mesh;
}
