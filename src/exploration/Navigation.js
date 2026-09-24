import { Vector3 } from '../engine/index.js';

// Shared placement rules for arrivals and wandering animals. Check the whole
// footprint so a boat cannot be summoned through a quay or onto a sandbar.
export function safeAt( terrain, colliders, x, z, water = false, radius = 0.6 ) {
	const h = terrain.heightAt( x, z );
	if ( water ? h > - 3 : h < 1.5 ) return false;
	for ( const [ dx, dz ] of [ [ 0, 0 ], [ radius, 0 ], [ - radius, 0 ], [ 0, radius ], [ 0, - radius ] ] ) {
		const y = terrain.heightAt( x + dx, z + dz );
		if ( water ? y > - 3 : Math.abs( y - h ) > radius * 0.65 ) return false;
		if ( colliders ) {
			const p = new Vector3( x + dx, water ? 0 : y + 0.05, z + dz );
			if ( colliders.resolveCapsule( p, water ? 1.8 : 0.6, water ? 4 : 2, 0 ) ) return false;
			if ( Math.hypot( p.x - x - dx, p.z - z - dz ) > 0.05 ) return false;
			if ( colliders.groundHeightAt( x + dx, z + dz, 1000 ) > ( water ? - 2 : y + 0.3 ) ) return false;
		}
	}
	return true;
}

export function findSafeSpot( terrain, colliders, x, z, water = false, maxRadius = 1600 ) {
	const footprint = water ? 5 : 0.6;
	for ( let r = 0; r <= maxRadius; r += r < 60 ? 4 : 20 ) {
		const count = Math.max( 1, Math.ceil( Math.PI * 2 * r / Math.max( 8, r * 0.09 ) ) );
		for ( let i = 0; i < count; i ++ ) {
			const a = i / count * Math.PI * 2;
			const px = x + Math.sin( a ) * r, pz = z + Math.cos( a ) * r;
			if ( safeAt( terrain, colliders, px, pz, water, footprint ) ) return new Vector3( px, water ? 0 : terrain.heightAt( px, pz ), pz );
		}
	}
	return null;
}
