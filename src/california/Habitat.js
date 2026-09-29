import { PLACES } from './Region.js';

// The canopy comes from actual planted trees. Authored destinations only name
// the surrounding habitat; this never scans the statewide vegetation records.
export function habitatAt(x, z, coastDistance, canopy = 0, out = {}) {
	let nearest = null, distance2 = Infinity;
	for (const place of PLACES) {
		if (place.water) continue;
		const d = (x - place.x) ** 2 + (z - place.z) ** 2;
		if (d < distance2) { distance2 = d; nearest = place; }
	}
	// Town forests and Cypress Point also have authored trees outside the
	// streamed plant system. Include those small inner groves in the sound mix.
	const innerGrove = nearest?.kind === 'grove' && distance2 < nearest.radius ** 2;
	const innerForest = nearest?.style === 'forest' && distance2 < (nearest.radius + 25) ** 2;
	out.canopy = Math.max(innerForest ? .72 : innerGrove ? .5 : 0, Math.min(1, Math.max(0, Number.isFinite(canopy) ? canopy : 0)));
	if (coastDistance > 20) out.habitat = 'ocean';
	else if (out.canopy > .4 && (nearest?.region === 'north' || nearest?.id === 'big-sur')) out.habitat = 'forest';
	else if (out.canopy > .2) out.habitat = 'grove';
	else if (nearest?.kind === 'town' && distance2 < (nearest.radius + 30) ** 2 && nearest.style !== 'forest' && nearest.style !== 'reserve') out.habitat = 'town';
	else out.habitat = coastDistance > -35 ? 'shore' : 'meadow';
	return out;
}
