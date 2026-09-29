import { Group, Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, sphere, cylinder, mat4, rod } from '../world/boat/GeoKit.js';

const BROWN = 0x96775a, CREAM = 0xdccdb0, DARK = 0x252920;
const prepared = ( geo, color, matrix ) => prepare( geo, { color, rough: 0.92, matrix } );
const ellipsoid = ( color, x, y, z, sx, sy, sz, rx = 0, rz = 0 ) => prepared( sphere( 1, 10, 7 ), color, mat4( x, y, z, rx, 0, rz, sx, sy, sz ) );

// One geometry set per species, reused by every member of the population.
// Heads and feet remain separate so a quiet animal can still look, peck or graze.
export function createWoodlandAssets( kind ) {
	const body = [], head = [];
	let leg, headPosition, legPositions, wings;
	if ( kind === 'deer' ) {
		body.push( ellipsoid( BROWN, 0, 0.98, 0, 0.27, 0.36, 0.67 ) );
		body.push( ellipsoid( CREAM, 0, 0.97, - 0.6, 0.2, 0.23, 0.09 ) );
		body.push( ellipsoid( 0x58493a, 0, 1.03, - 0.72, 0.075, 0.19, 0.075, - 0.5 ) );
		headPosition = [ 0, 1.03, 0.48 ];
		head.push( ellipsoid( 0xa18364, 0, 0.27, 0.06, 0.16, 0.43, 0.19, - 0.32 ) );
		head.push( ellipsoid( BROWN, 0, 0.65, 0.26, 0.155, 0.19, 0.24 ) );
		head.push( ellipsoid( 0xc5ad8a, 0, 0.57, 0.46, 0.11, 0.11, 0.18 ) );
		head.push( ellipsoid( DARK, 0, 0.6, 0.6, 0.085, 0.057, 0.04 ) );
		for ( const s of [ - 1, 1 ] ) {
			head.push( ellipsoid( BROWN, s * 0.2, 0.88, 0.15, 0.105, 0.25, 0.06, 0, s * - 0.55 ) );
			head.push( ellipsoid( 0xcfb99b, s * 0.2, 0.88, 0.198, 0.06, 0.17, 0.014, 0, s * - 0.55 ) );
			head.push( ellipsoid( DARK, s * 0.137, 0.7, 0.36, 0.027, 0.032, 0.03 ) );
		}
		leg = mergePrepared( [ prepared( cylinder( 0.047, 0.028, 0.73, 7 ), BROWN, mat4( 0, - 0.34, 0 ) ), ellipsoid( DARK, 0, - 0.72, 0.025, 0.052, 0.05, 0.077 ) ] );
		legPositions = [ [ - 0.17, 0.78, 0.43 ], [ 0.17, 0.78, 0.43 ], [ - 0.19, 0.78, - 0.43 ], [ 0.19, 0.78, - 0.43 ] ];
	} else if ( kind === 'rabbit' ) {
		body.push( ellipsoid( 0x8c7962, 0, 0.22, 0, 0.18, 0.21, 0.31 ) );
		body.push( ellipsoid( CREAM, 0, 0.22, - 0.3, 0.09, 0.085, 0.095 ) );
		headPosition = [ 0, 0.26, 0.24 ];
		head.push( ellipsoid( 0xa18a6b, 0, 0.06, 0.045, 0.13, 0.15, 0.13 ) );
		head.push( ellipsoid( CREAM, 0, 0.015, 0.16, 0.075, 0.045, 0.04 ) );
		head.push( ellipsoid( 0x645247, 0, 0.045, 0.19, 0.027, 0.02, 0.012 ) );
		for ( const s of [ - 1, 1 ] ) {
			head.push( ellipsoid( 0x8d775b, s * 0.065, 0.28, 0.02, 0.044, 0.2, 0.037, - 0.18, s * - 0.15 ) );
			head.push( ellipsoid( 0xc1a48b, s * 0.065, 0.29, 0.052, 0.02, 0.13, 0.008, - 0.18, s * - 0.15 ) );
			head.push( ellipsoid( DARK, s * 0.112, 0.1, 0.11, 0.018, 0.023, 0.016 ) );
		}
		leg = ellipsoid( 0x806c51, 0, - 0.025, 0.035, 0.058, 0.055, 0.115 );
		legPositions = [ [ - 0.11, 0.08, 0.15 ], [ 0.11, 0.08, 0.15 ], [ - 0.13, 0.08, - 0.17 ], [ 0.13, 0.08, - 0.17 ] ];
	} else if ( kind === 'quail' ) {
		body.push( ellipsoid( 0x7a8990, 0, 0.23, 0, 0.14, 0.18, 0.22 ) );
		body.push( ellipsoid( 0xa88758, 0, 0.14, 0.11, 0.105, 0.07, 0.135 ) );
		body.push( ellipsoid( 0x5c6768, 0, 0.25, - 0.2, 0.067, 0.055, 0.14, - 0.35 ) );
		for ( const s of [ - 1, 1 ] ) {
			body.push( ellipsoid( 0x726950, s * 0.113, 0.23, - 0.025, 0.045, 0.11, 0.145 ) );
			for ( let i = 0; i < 3; i ++ ) body.push( ellipsoid( CREAM, s * 0.15, 0.19, 0.055 - i * 0.06, 0.012, 0.055, 0.012, - 0.3 ) );
		}
		headPosition = [ 0, 0.3, 0.11 ];
		head.push( ellipsoid( 0x768187, 0, 0.07, 0.025, 0.088, 0.11, 0.1 ) );
		head.push( ellipsoid( DARK, 0, 0.04, 0.106, 0.06, 0.065, 0.033 ) );
		head.push( ellipsoid( CREAM, 0, - 0.008, 0.1, 0.066, 0.017, 0.032 ) );
		head.push( ellipsoid( 0x605b4c, 0, 0.07, 0.145, 0.022, 0.019, 0.045 ) );
		head.push( prepared( rod( new Vector3( 0, 0.15, 0.005 ), new Vector3( 0, 0.245, 0.07 ), 0.015, 5, 0.01 ), DARK ) );
		head.push( ellipsoid( DARK, 0, 0.232, 0.087, 0.025, 0.037, 0.025, - 0.35 ) );
		for ( const s of [ - 1, 1 ] ) head.push( ellipsoid( DARK, s * 0.073, 0.088, 0.076, 0.012, 0.013, 0.012 ) );
		leg = mergePrepared( [ prepared( cylinder( 0.013, 0.009, 0.11, 5 ), 0x8c7860, mat4( 0, - 0.05, 0 ) ), ellipsoid( 0x8c7860, 0, - 0.104, 0.025, 0.022, 0.013, 0.045 ) ] );
		legPositions = [ [ - 0.055, 0.115, 0.01 ], [ 0.055, 0.115, 0.01 ] ];
	} else if ( kind === 'butterfly' ) {
		body.push( ellipsoid( DARK, 0, 0, 0, 0.013, 0.017, 0.07 ) );
		for ( const s of [ - 1, 1 ] ) body.push( prepared( rod( new Vector3( s * 0.008, 0, 0.05 ), new Vector3( s * 0.034, 0.025, 0.09 ), 0.0025, 4 ), DARK ) );
		wings = [ - 1, 1 ].map( s => {
			const parts = [
				ellipsoid( 0x423831, s * 0.095, 0, 0.035, 0.115, 0.006, 0.108 ),
				ellipsoid( 0xe8a36a, s * 0.087, 0.007, 0.032, 0.086, 0.004, 0.086 ),
				ellipsoid( 0x624937, s * 0.069, 0, - 0.071, 0.077, 0.006, 0.065 ),
				ellipsoid( 0xd48a52, s * 0.067, 0.007, - 0.068, 0.061, 0.004, 0.049 ),
			];
			for ( let i = 0; i < 3; i ++ ) parts.push( ellipsoid( CREAM, s * ( 0.11 + i * 0.025 ), 0.008, 0.1 - i * 0.024, 0.011, 0.003, 0.014 ) );
			return mergePrepared( parts );
		} );
		legPositions = [];
	} else return null;
	return { body: mergePrepared( body ), head: head.length ? mergePrepared( head ) : null, headPosition, leg, legPositions, wings };
}

export function makeWoodlandAnimal( assets, material ) {
	const group = new Group(), body = new Mesh( assets.body, material ), legs = [], wings = [];
	body.castShadow = ! assets.wings;
	group.add( body );
	let head = null;
	if ( assets.head ) {
		head = new Mesh( assets.head, material );
		head.position.set( ...assets.headPosition );
		head.castShadow = true;
		group.add( head );
	}
	for ( const point of assets.legPositions ) {
		const leg = new Mesh( assets.leg, material ); leg.position.set( ...point );
		group.add( leg ); legs.push( leg );
	}
	for ( const geometry of assets.wings || [] ) {
		const wing = new Mesh( geometry, material ); group.add( wing ); wings.push( wing );
	}
	return { group, body, head, legs, wings };
}
