// Art-directed light, weather and lens settings. These reuse the physical sky,
// ocean and post chain: changing the mood never changes geometry or quality.
const mood = ( values ) => Object.freeze( { ...values, post: Object.freeze( values.post ) } );
export const COASTAL_MOODS = Object.freeze( [
	mood( {
		id: 'pacific', label: 'Pacific', description: 'Clear horizons. Salt in the air.', hour: 16.2, accent: '#82d6cc',
		clouds: 0.46, haze: 0.58, shafts: 1.05, exposure: 0.55,
		post: { bloom: 0.055, saturation: 1.06, contrast: 1.035, warmth: 0.012, coastGrade: 0.6, grain: 0.006, vignette: 0.18 },
	} ),
	mood( {
		id: 'golden', label: 'Golden', description: 'Amber light across the headlands.', hour: 17.6, accent: '#edc180',
		clouds: 0.42, haze: 0.78, shafts: 1.2, exposure: 0.57,
		post: { bloom: 0.075, saturation: 1.07, contrast: 1.035, warmth: 0.028, coastGrade: 0.9, grain: 0.006, vignette: 0.2 },
	} ),
	mood( {
		id: 'dawn', label: 'Dawn', description: 'A quiet coast, waking in sea mist.', hour: 6.4, accent: '#e7afa2',
		clouds: 0.38, haze: 1.02, shafts: 1.12, exposure: 0.59,
		post: { bloom: 0.065, saturation: 1.035, contrast: 1.02, warmth: 0.006, coastGrade: 0.65, grain: 0.005, vignette: 0.18 },
	} ),
	mood( {
		id: 'moonlight', label: 'Moonlight', description: 'Silver water. A sky full of stories.', hour: 22, accent: '#acbfe5',
		clouds: 0.27, haze: 0.48, shafts: 0.8, exposure: 0.65,
		post: { bloom: 0.07, saturation: 1.025, contrast: 1.015, warmth: -0.012, coastGrade: 0.45, grain: 0.004, vignette: 0.16 },
	} ),
] );

export function applyCoastalMood( app, id ) {
	const selected = COASTAL_MOODS.find( entry => entry.id === id );
	if ( ! selected ) return false;
	app.settings.timeOfDay = selected.hour;
	app.settings.timeSpeed = 0;
	app.settings.exposure = selected.exposure;
	app.settings.coastalMood = selected.id;
	if ( app.clouds ) app.clouds.coverage.value = selected.clouds;
	if ( app.haze ) {
		app.haze.density.value = selected.haze;
		app.haze.shafts.value = selected.shafts;
	}
	for ( const [ key, value ] of Object.entries( selected.post ) ) {
		if ( app.post?.params[ key ] ) app.post.params[ key ].value = value;
	}
	// Hour/weather jumps invalidate accumulated clouds and scene history. Do
	// not reset on every frame: ordinary movement retains temporal stability.
	app.clouds?.resetHistory?.();
	app.post?.taau?.reset?.();
	app.updateSun?.();
	if ( app.ui?.s ) {
		Object.assign( app.ui.s, selected.post, {
			advance: false, time: selected.hour, clouds: selected.clouds,
			haze: selected.haze, shafts: selected.shafts,
			exposure: Math.log2( selected.exposure / 0.55 ),
		} );
		app.ui.ui.refresh();
	}
	return true;
}
