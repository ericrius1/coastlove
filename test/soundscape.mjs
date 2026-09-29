import assert from 'node:assert/strict';
import { SoundScape } from '../src/audio/SoundScape.js';
import { BANK } from '../src/audio/soundBank.js';
import { habitatMix } from '../src/audio/habitatMix.js';

const environment = { onLand: true, shoreDist: 100, heightAboveGround: 1.7, u: 0, habitat: 'forest', canopy: 0.9, day: 1, hour: 12, wind: 5 };
const forest = habitatMix( environment );
const meadow = habitatMix( { ...environment, habitat: 'meadow', canopy: 0.05 } );
const town = habitatMix( { ...environment, habitat: 'town', canopy: 0.1 } );
assert.ok( forest.shelter > meadow.shelter && forest.birds > town.birds, 'forest shelters wind and makes room for songbirds' );
assert.equal( forest.insects, 0, 'night insects leave space during the day' );
assert.equal( forest.palms, 0, 'tropical insect recording is not used in northern forests' );
const dusk = habitatMix( { ...environment, hour: 18.3 } );
const night = habitatMix( { ...environment, day: 0, hour: 22 } );
assert.ok( dusk.insects > 0 && dusk.insects < night.insects, 'evening insects arrive before full darkness' );
assert.ok( habitatMix( { ...environment, day: 0, hour: 22, wind: 25 } ).insects < night.insects / 2, 'high winds quiet insects' );
assert.equal( habitatMix( { ...environment, heightAboveGround: 40 } ).surf, 1, 'a low cliff keeps its distant surf' );
const airborneSurf = habitatMix( { ...environment, heightAboveGround: 110 } ).surf;
assert.ok( airborneSurf > 0 && airborneSurf < 0.6, 'surf fades gradually through low flight' );
assert.equal( habitatMix( { ...environment, heightAboveGround: 180 } ).surf, 0, 'higher flight leaves the surf behind' );
for ( const change of [ { onLand: false, shoreDist: 500 }, { u: 1 }, { heightAboveGround: 150 } ] ) {

	const quiet = habitatMix( { ...environment, ...change, day: 0, hour: 22 } );
	assert.equal( quiet.forest + quiet.birds + quiet.insects, 0, 'forest does not follow the player out to sea, underwater or into flight' );

}
console.log( 'ok habitat, dusk, wind shelter, flight and underwater mix' );

// Small Web Audio contract double. All timing, bus routing, source lifetimes and
// decoded data are exercised; it deliberately does not pretend to assess sound.
class Param {

	constructor( value = 0 ) { this.value = value; this.events = []; }
	setTargetAtTime( value, time, tau ) { this.events.push( { value, time, tau } ); this.value = value; }
	setValueAtTime( value, time ) { this.events.push( { value, time } ); this.value = value; }
	linearRampToValueAtTime( value, time ) { this.events.push( { value, time } ); this.value = value; }

}
class Node {

	constructor() { this.outputs = new Set(); this.disconnected = false; }
	connect( target ) { assert.ok( target ); this.outputs.add( target ); return target; }
	disconnect() { this.outputs.clear(); this.disconnected = true; }

}
class Source extends Node {

	constructor( ctx ) { super(); this.ctx = ctx; this.playbackRate = new Param( 1 ); this.stoppedAt = Infinity; ctx.sources.push( this ); }
	start( time, offset = 0, duration ) { this.startedAt = time; this.endsAt = this.loop ? Infinity : time + ( duration ?? this.buffer.duration ) / this.playbackRate.value; assert.ok( offset >= 0 ); }
	stop( time ) { this.stoppedAt = time; }

}
class Context {

	constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); this.sources = []; this.listener = this.createPanner(); }
	createGain() { return Object.assign( new Node(), { gain: new Param( 1 ) } ); }
	createBufferSource() { return new Source( this ); }
	createBiquadFilter() { return Object.assign( new Node(), { frequency: new Param(), Q: new Param() } ); }
	createPanner() { const node = new Node(); for ( const key of [ 'positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ' ] ) node[ key ] = new Param(); return node; }
	createStereoPanner() { return Object.assign( new Node(), { pan: new Param() } ); }
	createDynamicsCompressor() { const node = new Node(); for ( const key of [ 'threshold', 'knee', 'ratio', 'attack', 'release' ] ) node[ key ] = new Param(); return node; }
	createBuffer( channels, length, rate ) { const data = new Float32Array( length ); return { duration: length / rate, numberOfChannels: channels, getChannelData: () => data }; }
	close() { this.state = 'closed'; return Promise.resolve(); }
	advance( time ) { this.currentTime = time; for ( const source of this.sources ) if ( ! source.ended && Math.min( source.endsAt, source.stoppedAt ) <= time ) { source.ended = true; source.onended?.(); } }

}

const sound = new SoundScape();
sound.ctx = new Context();
sound._build();
const context = sound.ctx;
for ( const bank of Object.keys( BANK ) ) sound._buffers.set( bank, context.createBuffer( 1, 20 * context.sampleRate, context.sampleRate ) );
const state = { listener: { position: { x: 10, y: 8, z: -100 } }, habitat: 'forest', canopy: 0.9, coastDistance: -100, distanceToShore: 100, timeOfDay: 6, daylight: 0.8, heightAboveGround: 1.7 };
sound.update( 1 / 30, state );
assert.ok( sound._beds.has( 'forest_wind' ) && sound._beds.has( 'birds_dawn' ), 'forest dawn starts the canopy and chorus beds' );
assert.equal( sound._beds.get( 'forest_wind' ).src.buffer, sound._buffers.get( 'wind' ), 'new canopy voice reuses a decoded recording' );
assert.equal( sound._beds.has( 'palms' ), false );
assert.equal( sound._warned.size, 0, 'complete update cycle has no audio errors' );

// California uses metre coordinates hundreds of kilometres from zero. A gain's
// relative epsilon must never turn into a kilometre-sized spatial dead zone.
const oldPose = { x: sound.env.lx, y: sound.env.ly, z: sound.env.lz };
sound.env.lx = 500000; sound.env.lz = -900000; sound._placeListener();
sound.env.lx += 0.5; sound.env.lz -= 0.25; sound._placeListener();
assert.equal( context.listener.positionX.value, 500000.5, 'half-metre walk updates listener at statewide coordinates' );
assert.equal( context.listener.positionZ.value, -900000.25 );
const positional = context.createPanner();
sound._pos( positional, 500000, 8, -900000 );
sound._pos( positional, 500000.25, 8, -900000.5 );
assert.equal( positional.positionX.value, 500000.25, 'moving sources also use an absolute spatial epsilon' );
sound.env.lx = oldPose.x; sound.env.ly = oldPose.y; sound.env.lz = oldPose.z; sound._placeListener();

sound._detailT = 0;
sound._gust.v = 0.8;
sound._foliage( context.currentTime, 0.1 );
assert.equal( sound._voices.detail.length, 1, 'near foliage is an occasional bounded spatial voice' );
const detail = sound._voices.detail[ 0 ];
assert.equal( detail.extra.length, 2, 'foliage has filtering and a world panner' );

const position = { x: 12, y: 8, z: -102 };
assert.equal( sound.bell( position ), true );
assert.equal( sound.bell( position ), false, 'repeated key events cannot hammer the bell' );
const bellBuffer = sound._bellBuffer;
const data = bellBuffer.getChannelData( 0 );
assert.ok( data.every( Number.isFinite ) && data.some( value => Math.abs( value ) > 0.05 ), 'bell has an actual finite audible waveform' );
assert.ok( Math.max( ...data ) < 0.25 && Math.min( ...data ) > -0.25, 'bell leaves mixing headroom' );
assert.equal( data[ 0 ], 0 );
assert.ok( Math.abs( data[ data.length - 1 ] ) < 0.001, 'bell tail ends without a click' );
context.advance( 0.7 );
assert.equal( sound.bell( position, { note: 99, strength: 4 } ), true, 'public bell arguments are clamped safely' );
assert.equal( sound._bellBuffer, bellBuffer, 'bell buffer is rendered once' );
assert.equal( sound.discovery( position, { chapter: 5, complete: true } ), true );
assert.equal( sound._voices.bell.length, 3, 'story reply shares the three-voice cap with the bell' );
assert.equal( sound.discovery( position ), false, 'discovery replies have a cooldown' );
context.advance( 7 );
assert.equal( sound._voices.bell.length, 0 );
assert.ok( detail.src.disconnected && detail.extra.every( node => node.disconnected ), 'finished spatial voices disconnect their full graph' );
console.log( 'ok forest layers, real bell waveform, voice caps, scheduling and node cleanup' );

sound._bed( 'forest_wind', 0, context.currentTime, 0.25, 1, 'wind' );
context.advance( 12 );
sound._bed( 'forest_wind', 0, context.currentTime, 0.25, 1, 'wind' );
assert.equal( sound._beds.has( 'forest_wind' ), false, 'inaudible loops retire rather than run forever' );
sound.env.shoreDist = 1000;
sound._shoreSrc = () => { throw new Error( 'an inaudible shore was scanned' ); };
sound._surf( 1 / 30 );
sound.env.shoreDist = 10;
sound.env.heightAboveGround = 200;
sound._surf( 1 / 30 );
assert.equal( sound._shotAt( 'surf_crash', 'crash', 0, 0, 0, -15, 1, 0, 10 ), null, 'high flights schedule no breaking-wave voices' );
sound.env.heightAboveGround = 0;

sound.setMuted( true );
assert.equal( sound._beds.size, 0, 'muting stops loop work' );
assert.equal( sound.bell( position ), false );
assert.equal( sound.discovery( position ), false );
sound.footstep( 'grass' );
assert.equal( sound._voices.step, undefined, 'muted actions create no new sources' );
sound.setMuted( false );
context.advance( 13 );
assert.equal( sound.bell( position ), true, 'sound resumes after unmuting' );
sound.dispose();
assert.equal( context.state, 'closed' );
assert.equal( sound.ctx, null );
assert.equal( sound._buffers.size + sound._loading.size + sound._liveVoices.size, 0 );
sound.setMasterVolume( 0.5 );
sound.setMuted( false );
assert.equal( await sound.resume(), false, 'disposed mixer cannot resurrect' );
console.log( 'ok distant shore optimization, dormant loops, mute and disposal' );

const originalFetch = globalThis.fetch;
try {

	let resolveFetch;
	globalThis.fetch = () => new Promise( resolve => { resolveFetch = resolve; } );
	const loading = new SoundScape();
	loading.ctx = new Context();
	let decoded = 0;
	loading.ctx.decodeAudioData = () => { decoded ++; return Promise.resolve( {} ); };
	loading._want( 'wind' );
	const pending = loading._loading.get( 'wind' );
	loading.dispose();
	resolveFetch( { ok: true, arrayBuffer: async () => new ArrayBuffer( 8 ) } );
	await pending;
	assert.equal( decoded, 0, 'late fetch completion never decodes on a disposed context' );
	assert.equal( loading._buffers.size + loading._warned.size, 0 );
	assert.equal( loading._loadAbort.signal.aborted, true );
	console.log( 'ok disposal during asynchronous sample loading' );

} finally { globalThis.fetch = originalFetch; }
