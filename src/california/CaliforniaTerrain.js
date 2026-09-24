import { coastFieldAt } from './CoastField.js';
import { TerrainData } from '../world/TerrainData.js';
import { REGION, PLACES } from './Region.js';
import { smoothstep, clamp } from '../util/Noise.js';
import { upsample2 } from '../world/terrain/TerrainNoise.js';

export function islandDistance( x, z, island ) {
	const c = Math.cos( island.angle ), s = Math.sin( island.angle );
	const dx = x - island.x, dz = z - island.z;
	return ( Math.hypot( ( dx * c + dz * s ) / island.rx, ( - dx * s + dz * c ) / island.rz ) - 1 ) * island.rz;
}

// A fixed 2048² height/mask atlas covers 67.1 km². Distant area adds no mesh or
// texture growth; CDLOD, sparse vegetation and proximity-culling pay for detail
// only around the viewer. This is intentionally not a survey of real geography.
export class CaliforniaTerrain extends TerrainData {
	constructor() {
		super( REGION.seed );
		this.profile = 'california';
		this.paths = []; 
		this.clearings = PLACES.filter( p => ! p.water ).map( p => ( { x: p.x, z: p.z, radius: p.kind === 'grove' ? 20 : 30 } ) );
		this.landArea = this.heights.reduce( ( count, h ) => count + Number( h > 0 ), 0 ) * this.texel ** 2;
	}

	coastDistance( x, z ) {
		const harbor = 1 - smoothstep( 150, 420, Math.abs( x ) );
  let d = coastFieldAt(x,z), island = null;
  if(z>1500) island=REGION.islands.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b);
  // Keep the little harbor walkable while smoothly settling its original pier.
  const dockBlend=(1-smoothstep(100,240,Math.abs(x)))*(1-smoothstep(100,240,Math.abs(z+42)));
  d=d*(1-dockBlend)+(z+42)*dockBlend;
  d+=this.noise.noise(x/90,z/90)*4*(1-dockBlend);

		// A navigable indentation for the painted grotto, still open to the channel.
		const grotto = PLACES.find( p => p.id === 'grotto' );
		if ( Math.abs( x - grotto.x ) < 105 && Math.abs( z - grotto.z ) < 135 ) d = Math.max( d, 60 - Math.hypot( ( x - grotto.x ) * 0.8, ( z - grotto.z ) * 0.6 ) );
		return { d, beachZone: harbor, island };
	}

	heightFn( x, z ) {
		const { d, beachZone, island } = this.coastDistance( x, z );
		const n = this.noise;
		if ( d >= 0 ) return { h: - Math.min( 100, d * ( 0.075 + smoothstep(60,160,d)*0.045 ) ) + n.noise( x / 140, z / 140 ) * Math.min( 2, d * 0.015 ), rock: 0.12 };
		const e = - d;
		const broad = n.fbm( x / 480, z / 480, 3 );
		const ridges = 1 - Math.abs( n.fbm( x / 290 + 2, z / 370, 3 ) );
		const cliff = island ? 0.62 : 0.26 * ( 1 - beachZone ) + 0.09 * beachZone;
		let h = Math.min( e * cliff, 7 + e * 0.065 );
		const summit = island ? island.summit : 390;
		const rise = smoothstep( island ? 40 : 130, island ? Math.min(380,island.rz*.85) : 2100, e );
		h += rise * summit * ( 0.3 + 0.7 * ridges ) * ( 0.9 + broad * 0.3 );
		h += n.noise( x / 36, z / 36 ) * 3 * smoothstep( 25, 100, e );
		const rock = ( island && e < 50 ? 0.8 : 0.15 ) + smoothstep( 220, 480, h ) * 0.35;
		return { h, rock };
	}

	generate() {
		const started = performance.now();
		this.size = REGION.size; this.texel = this.size / this.res; this.origin = - this.size / 2;
		const n = this.res / 2, step = this.size / n, h = new Float32Array( n * n );
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {
			const x = this.origin + ( i + 0.5 ) * step, z = this.origin + ( j + 0.5 ) * step;
			const edge = Math.min( i, j, n - 1 - i, n - 1 - j ) * step;
			h[ j * n + i ] = - 100 + ( this.heightFn( x, z ).h + 100 ) * smoothstep( 0, 210, edge );
		}
		this.heights = upsample2( h, n, true );
		const H = this.heights, R = this.res;
		for ( let j = 1; j < R - 1; j ++ ) for ( let i = 1; i < R - 1; i ++ ) {
			const k = j * R + i, y = H[ k ];
			const slope = Math.hypot( H[ k + 1 ] - H[ k - 1 ], H[ k + R ] - H[ k - R ] ) / ( this.texel * 2 );
			this.rock[ k ] = clamp( smoothstep( 0.18, 0.65, slope ) * 0.8 + smoothstep( 220, 480, y ) * 0.22, 0, 1 );
			this.sand[ k ] = Math.round( 255 * ( 1 - smoothstep( 4, 13, y ) ) * ( 1 - this.rock[ k ] ) );
			this.seagrass[ k ] = y < - 1.5 && y > - 16 ? Math.round( 150 * ( 1 - this.rock[ k ] ) ) : 0;
			this.rubble[ k ] = y < 0 && y > - 30 ? Math.round( this.rock[ k ] * 210 ) : 0;
			this.gully[ k ] = Math.round( 80 * smoothstep( 0.08, 0.25, slope ) );
		}
		// Settle small pads for landmarks/characters into the terrain before the
		// vegetation, shore field, normals and GPU textures are derived.
		for ( const p of PLACES ) if ( ! p.water && p.id !== 'harbor' ) {
			const y = Math.max( 2.5, this.heightAt( p.x, p.z ) );
			this.flatten( p.x, p.z, p.kind === 'lighthouse' ? 20 : 12, y, 24 );
		}
		this.timings.total = performance.now() - started;
	}
}
