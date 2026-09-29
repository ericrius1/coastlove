// In a served browser tab:
// await (await import('/test/soundscape-browser.mjs')).checkSoundscape()
// Renders offline: this check does not play audio or alter the live game mixer.
import { SoundScape } from '../src/audio/SoundScape.js';

export async function checkSoundscape() {

	const context = new OfflineAudioContext( 2, 48000 * 6, 48000 );
	const sound = new SoundScape();
	sound.ctx = context;
	sound._build();
	const position = { x: 2, y: 0, z: -4 };
	sound._bellVoice( position, 0, 0.65, 0.1 );
	sound._bellVoice( position, 3, 0.3, 1.1 );
	sound._bellVoice( position, 5, 0.4, 1.75 );
	const rendered = await context.startRendering();
	let peak = 0, energy = 0, tail = 0;
	for ( let channel = 0; channel < rendered.numberOfChannels; channel ++ ) {

		const data = rendered.getChannelData( channel );
		for ( let i = 0; i < data.length; i ++ ) {

			if ( ! Number.isFinite( data[ i ] ) ) throw new Error( 'Bell render contains a nonfinite sample' );
			peak = Math.max( peak, Math.abs( data[ i ] ) );
			energy += data[ i ] * data[ i ];
			if ( i > data.length - 2400 ) tail = Math.max( tail, Math.abs( data[ i ] ) );

		}

	}
	if ( peak < 0.01 || peak > 0.8 || energy <= 0 || tail > 0.001 ) throw new Error( `Bell mix failed: peak ${ peak }, energy ${ energy }, tail ${ tail }` );
	return { result: 'Real Web Audio bell/reply renders with headroom and a clean tail', peak, rms: Math.sqrt( energy / ( rendered.length * rendered.numberOfChannels ) ), tail };

}
