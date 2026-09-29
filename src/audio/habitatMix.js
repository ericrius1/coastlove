// Continuous habitat weights, separate from Web Audio so the quiet parts of the
// coast can be tuned and checked without starting a browser or fetching sounds.
const clamp = ( v, lo = 0, hi = 1 ) => Math.max( lo, Math.min( hi, v ) );
const smooth = ( a, b, v ) => {

	const t = clamp( ( v - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};

export function habitatMix( env, out = {} ) {

	const inland = smooth( 3, 48, env.shoreDist );
	const land = env.onLand ? 1 : 1 - smooth( 5, 65, env.shoreDist );
	const nearGround = 1 - smooth( 14, 100, env.heightAboveGround || 0 );
	const above = ( 1 - env.u ) * nearGround;
	const habitat = env.habitat || 'auto';
	const woodland = habitat === 'forest' || habitat === 'grove';
	const open = habitat === 'meadow' || habitat === 'shore' || habitat === 'ocean';
	const town = habitat === 'town';
	const canopy = typeof env.canopy === 'number' ? clamp( env.canopy ) : woodland ? 0.85 : open ? 0.08 : town ? 0.2 : inland * 0.55;
	const cover = canopy * land * nearGround;
	const hour = env.hour;
	const daylightNight = 1 - smooth( 0.12, 0.34, env.day );
	const clockNight = typeof hour === 'number' ? 1 - smooth( 4.8, 6.1, hour ) * ( 1 - smooth( 18.8, 20.2, hour ) ) : 0;
	const night = Math.max( daylightNight, clockNight );
	const dusk = typeof hour === 'number' ? smooth( 16.8, 18.2, hour ) * ( 1 - smooth( 19.2, 20.4, hour ) ) : 0;
	const quietWind = 1 - 0.7 * smooth( 6, 18, env.wind );

	out.forest = cover * above * ( woodland ? 1 : 0.55 );
	out.shelter = cover * 0.68;
	out.birds = land * above * ( town ? 0.3 : 0.35 + 0.85 * canopy ) * ( 1 - 0.65 * smooth( 10, 25, env.wind ) );
	out.insects = land * above * Math.max( night, dusk * 0.55 ) * quietWind * ( town ? 0.22 : 0.3 + 0.7 * inland );
	// The palm recording includes daytime tropical insects. Keep it for the
	// original island mix, rather than transplanting it into northern forests.
	out.palms = habitat === 'auto' ? inland * land * above : 0;
	out.night = night;
	out.dusk = dusk;
	// Clifftop and low coastal flight keep the distant wash; higher flight
	// opens into wind, without carrying the beach around the cockpit.
	out.surf = 1 - smooth( 45, 180, env.heightAboveGround || 0 );
	return out;

}
