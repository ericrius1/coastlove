import { CoastalRoute, gradeCoastalRoad } from './CoastalRoads.js';
import { coastFieldAt } from './CoastField.js';
import { TerrainData } from '../world/TerrainData.js';
import { REGION, PLACES, CALIFORNIA_STORIES } from './Region.js';
import { SETTLEMENTS } from './Settlements.js';
import { INLAND, project, unproject } from './Geography.js';
import { COAST_DRIVE } from './Coastline.js';
import { smoothstep, clamp } from '../util/Noise.js';
import { upsample2 } from '../world/terrain/TerrainNoise.js';

export function islandDistance( x, z, island ) {
	const c = Math.cos( island.angle ), s = Math.sin( island.angle );
	const dx = x - island.x, dz = z - island.z;
	return ( Math.hypot( ( dx * c + dz * s ) / island.rx, ( - dx * s + dz * c ) / island.rz ) - 1 ) * island.rz;
}

// Fixed 4096² atlas across a 65.536 km domain. Close tessellation and material
// detail remain unchanged; distant terrain uses the existing continuous LOD.
// The richly populated corridor follows 10 real miles inland, including bays.
export class CaliforniaTerrain extends TerrainData {
	constructor() {
		super( REGION.seed, { resolution: 4096 } );
		this.profile = 'california';
		this.paths = []; 
		this.clearings = PLACES.filter( p => ! p.water ).map( p => ( { x: p.x, z: p.z, radius: p.kind === 'grove' ? 20 : 30 } ) );
		this.landArea = this.heights.reduce( ( count, h ) => count + Number( h > 0 ), 0 ) * this.texel ** 2;
	}

	pathDistance(x,z) { return Math.min(...(this.roadCells?.get(`${Math.floor(x/64)},${Math.floor(z/64)}`)||[]).map(r=>r.nearest(x,z).distance)) - 5; }

	coastDistance( x, z ) {
		const harbor = 1 - smoothstep( 150, 420, Math.abs( x ) );
  let d = coastFieldAt(x,z), island = null;
  if(z>400) { const near=REGION.islands.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b); if(Math.hypot(x-near.x,z-near.z)<Math.max(near.rx,near.rz)*1.5) island=near; }
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
		const {lat}=unproject(x,z);
		// Blend climate regions across broad transitions, avoiding latitude seams.
		let mainlandSummit=200+140*smoothstep(34.35,34.85,lat);
		mainlandSummit+=(170-mainlandSummit)*smoothstep(36.75,37.25,lat);
		mainlandSummit+=(260-mainlandSummit)*smoothstep(39.05,39.55,lat);
		const summit=island?island.summit:mainlandSummit;
		const rise = smoothstep( island ? 40 : 130, island ? Math.min(380,island.rz*.85) : 600, e );
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
		for(const town of SETTLEMENTS) {
   const anchor=project(town.lon,town.lat);town.x=anchor.x;town.z=anchor.z;
   const oldX=town.x,oldZ=town.z;let best=null;
   for(let ring=0;ring<=360;ring+=24)for(let a=0;a<(ring?24:1);a++){
    const x=oldX+Math.cos(a/24*Math.PI*2)*ring,z=oldZ+Math.sin(a/24*Math.PI*2)*ring,d=-coastFieldAt(x,z);
    if(d<town.radius+38||d>INLAND+200)continue;
    const score=ring+Math.abs(this.heightAt(x,z)-18)*.4;
    if(!best||score<best.score)best={x,z,score};
   }
   if(best){town.x=best.x;town.z=best.z;}
   town.level=Math.max(5,this.heightAt(town.x,town.z));
   this.flatten(town.x,town.z,town.radius+20,town.level,90);
   for(const story of CALIFORNIA_STORIES)if(story.site===town.id){story.x=town.x-3;story.z=town.z+9;}
  }
		// Settle small pads for landmarks/characters into the terrain before the
		// vegetation, shore field, normals and GPU textures are derived.
		for ( const p of PLACES ) if ( ! p.water && p.id !== 'harbor' && p.kind !== 'town' ) {
			const y = Math.max( 2.5, this.heightAt( p.x, p.z ) );
			this.flatten( p.x, p.z, p.kind === 'lighthouse' ? 20 : 12, y, 24 );
		}
		this.coastalRoute = new CoastalRoute();
  this.routes=[this.coastalRoute];
  this.highway=new CoastalRoute(COAST_DRIVE,{id:'pacific-drive',linear:true});this.routes.push(this.highway);
  for(const town of SETTLEMENTS){
   const r=town.radius*.75,c=.7;
   const stops=[[-r,-r*c],[-r*.6,-r],[r*.6,-r],[r,-r*c],[r,r*c],[r*.6,r],[-r*.6,r],[-r,r*c]].map(([x,z])=>[x+town.x,z+town.z]);
   town.route=new CoastalRoute(stops,{id:town.id});this.routes.push(town.route);
  }
  for(let pass=0;pass<3;pass++)for(const route of this.routes)gradeCoastalRoad(this,route);
  this.inlandBand=INLAND;
  this.roadCells=new Map();
  for(const route of this.routes)for(const key of route.cells.keys()){
   if(!this.roadCells.has(key))this.roadCells.set(key,[]);this.roadCells.get(key).push(route);
  }
		this.timings.total = performance.now() - started;
	}
}
