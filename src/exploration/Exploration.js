import { Euler, Vector3 } from '../engine/index.js';
import { Seaplane } from './Seaplane.js';
import { IslandLife, STORIES } from './IslandLife.js';
import { findSafeSpot } from './Navigation.js';
import './exploration.css';

const SAVE = 'tidewater.windward.journal.v1';
export class Exploration {
	constructor( app ) {
		this.app = app;
		this.plane = new Seaplane( app.scene, app.terrainData );
		this.life = new IslandLife( app.scene, app.terrainData, app.colliders, { loadCharacters: true } );
		this.read = new Set(); this.seen = new Set();
		try {
			const data = JSON.parse( localStorage.getItem( SAVE ) || '{}' );
			if ( Array.isArray( data.read ) ) this.read = new Set( data.read.filter( id => STORIES.some( s => s.id === id ) ) );
			if ( Array.isArray( data.seen ) ) this.seen = new Set( data.seen.filter( id => [ 'goat', 'tortoise' ].includes( id ) ) );
		} catch { /* Private browsing or damaged saves must not block play. */ }
		this.target = this.life.residents.find( r => ! this.read.has( r.id ) ) || this.life.residents[ 0 ];
		this.dialogue = null; this.page = 0; this.journalOpen = false;
		this.ui = document.createElement( 'section' );
		this.ui.className = 'exp-ui';
		this.ui.innerHTML = `<aside class="exp-card"><div class="exp-eyebrow">TIDEWATER · AN EXPLORATION</div><h1>Windward Isle</h1><p class="exp-intro">A larger island. A few new friends.<br>A story around the next headland.</p><div class="exp-vehicles" aria-label="Travel modes"><button data-mode="boat"><kbd>1</kbd> Boat</button><button data-mode="plane"><kbd>2</kbd> Plane</button><button data-mode="walk"><kbd>3</kbd> On foot</button></div><p class="exp-controls"></p><div class="exp-divider"></div><div class="exp-eyebrow">THE PEOPLE WHO STAY</div><p class="exp-objective"></p><div class="exp-progress"></div><button class="exp-journal-button">Open field journal <kbd>J</kbd></button></aside><div class="exp-near" role="status"></div><section class="exp-dialog" hidden role="dialog" aria-label="Island conversation"><div class="exp-eyebrow exp-role"></div><h2 class="exp-name"></h2><p class="exp-story"></p><div class="exp-dialog-footer"><span class="exp-page"></span><button class="exp-next">Continue <kbd>E</kbd></button><button class="exp-close">Leave <kbd>Esc</kbd></button></div></section><section class="exp-journal" hidden role="dialog" aria-label="Field journal"><div class="exp-eyebrow">WINDWARD ISLE · FIELD NOTES</div><h2>The people who stay</h2><p>Meet four islanders and observe both land animals. Your discoveries are saved in this browser.</p><div class="exp-entries"></div><button class="exp-journal-close">Close journal <kbd>J</kbd></button></section>`;
		document.body.append( this.ui );
		this.find = selector => this.ui.querySelector( selector );
		this.ui.querySelectorAll( '[data-mode]' ).forEach( button => button.onclick = () => this.switchMode( button.dataset.mode ) );
		this.find( '.exp-journal-button' ).onclick = () => this.toggleJournal();
		this.find( '.exp-journal-close' ).onclick = () => this.toggleJournal( false );
		this.find( '.exp-next' ).onclick = () => this.advance();
		this.find( '.exp-close' ).onclick = () => this.closeDialogue();
		this.refresh();
	}

	save() {
		try { localStorage.setItem( SAVE, JSON.stringify( { read: [ ...this.read ], seen: [ ...this.seen ] } ) ); } catch { /* Keep playing with in-memory progress. */ }
		this.refresh();
	}

	refresh() {
		this.find( '.exp-progress' ).textContent = `${ this.read.size } / 4 stories · ${ this.seen.size } / 2 wildlife discoveries`;
		const entries = this.find( '.exp-entries' ); entries.replaceChildren();
		for ( const r of this.life.residents ) {
			const article = document.createElement( 'article' );
			const title = document.createElement( 'h3' ); title.textContent = `${ this.read.has( r.id ) ? '✓ ' : '' }${ r.name } · ${ r.role }`; article.append( title );
			const p = document.createElement( 'p' ); p.textContent = this.read.has( r.id ) ? r.pages.join( '\n\n' ) : 'An untold story. Follow the bearing on your travel card to find them.'; article.append( p );
			const button = document.createElement( 'button' ); button.textContent = 'Track on compass'; button.onclick = () => { this.target = r; this.toggleJournal( false ); }; article.append( button ); entries.append( article );
		}
		const wildlife = document.createElement( 'p' );
		wildlife.textContent = `Wildlife: ${ this.seen.has( 'goat' ) ? '✓ Island goats' : '○ Island goats' } · ${ this.seen.has( 'tortoise' ) ? '✓ Grove tortoises' : '○ Grove tortoises' }. Approach within 9 m on foot to record a sighting.`; entries.append( wildlife );
		if ( this.read.size === 4 && this.seen.size === 2 ) {
			const complete = document.createElement( 'h3' ); complete.textContent = 'Field expedition complete. You’re part of the island’s story now.'; entries.append( complete );
		}
	}

	toggleJournal( open = ! this.journalOpen ) {
		this.closeDialogue(); this.journalOpen = open;
		if ( open ) { this.app.game.hud?.closeStand(); this.app.game.hud?.toggleInventory( false ); }
		this.find( '.exp-journal' ).hidden = ! open;
		if ( open ) { document.exitPointerLock?.(); this.refresh(); }
	}

	closeDialogue() { this.dialogue = null; this.find( '.exp-dialog' ).hidden = true; }
	advance() {
		if ( ! this.dialogue ) return;
		if ( this.page < this.dialogue.pages.length - 1 ) { this.page ++; this.renderDialogue(); return; }
		this.read.add( this.dialogue.id );
		this.target = this.life.residents.find( r => ! this.read.has( r.id ) ) || this.dialogue;
		this.save(); this.closeDialogue();
		this.app.game.toast( this.read.size === 4 ? 'All four stories collected · check your field journal' : 'Story saved to your field journal' );
	}
	renderDialogue() {
		const r = this.dialogue;
		this.find( '.exp-dialog' ).hidden = false;
		this.find( '.exp-role' ).textContent = r.role;
		this.find( '.exp-name' ).textContent = r.name;
		this.find( '.exp-story' ).textContent = r.pages[ this.page ];
		this.find( '.exp-page' ).textContent = `${ this.page + 1 } / ${ r.pages.length }`;
		this.find( '.exp-next' ).innerHTML = this.page === r.pages.length - 1 ? 'Save story <kbd>E</kbd>' : 'Continue <kbd>E</kbd>';
	}

	switchMode( mode ) {
		const app = this.app, p = app.player, b = app.boatCtl;
		if ( mode === p.mode && ! app.freeCam ) return;
		// Compute arrival before changing any current state: a failed search is harmless.
		const from = p.position;
		const destination = mode === 'plane' ? null : findSafeSpot( app.terrainData, app.colliders, from.x, from.z, mode === 'boat' );
		if ( mode !== 'plane' && ! destination ) { app.game.toast( 'No safe arrival nearby. Fly closer to the island first.' ); return; }
		this.closeDialogue(); this.toggleJournal( false );
		app.game.cancelLine( true ); app.game.rod.equip( false );
		app.game.hud?.closeStand(); app.game.hud?.toggleInventory( false );
		app.freeCam = false;
		if ( b.driven ) app.audio?.engineStop();
		b.driven = false; b.throttle = 0; b.throttleTarget = 0;
		p.velocity.set( 0, 0, 0 ); p.busy = false; p._camY = null;
		this.plane.group.visible = mode === 'plane';
		if ( mode === 'plane' ) {
			const e = new Euler().setFromQuaternion( app.camera.quaternion, 'YXZ' );
			this.plane.launch( from, e.y + Math.PI );
			p.mode = 'plane'; p.position.copy( this.plane.position );
		} else if ( mode === 'boat' ) {
			b.position.copy( destination ); b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 );
			b.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), 0 );
			b.hasWater = false; b._acc = 0;
			// Reject pending water readbacks from the boat's previous location.
			b._qVersion = app.query.version; b._qTime = app.query.resultTime;
			b.arrivalGuard = destination.clone();
			b.waterV.fill( 0 ); b.waterOff.fill( 0 ); b.apply();
			p.enterBoat(); p.camMode = 'third';
		} else {
			p.mode = 'walk'; p.position.copy( destination ); p.grounded = true; p.pitch = - 0.05;
			p.waterMean = null; p.camOff = p.camOffV = 0;
		}
		app.game.toast( mode === 'plane' ? 'Marigold · Space to climb · C to descend' : mode === 'boat' ? 'At the helm · WASD to drive · V for cockpit view' : 'Safely ashore · follow your compass to meet an islander' );
		app.input.consumeLook();
	}

	beforeUpdate() {
		const input = this.app.input;
		if ( input.hit( 'Escape' ) ) { this.closeDialogue(); this.toggleJournal( false ); }
		if ( this.dialogue && input.hit( 'KeyE' ) ) { this.advance(); input.pressed.delete( 'KeyE' ); }
		if ( input.hit( 'KeyJ' ) ) this.toggleJournal();
		for ( const [ key, mode ] of [ [ 1, 'boat' ], [ 2, 'plane' ], [ 3, 'walk' ] ] ) if ( input.hit( `Digit${ key }` ) || input.hit( `Numpad${ key }` ) ) this.switchMode( mode );
	}

	get paused() { return !! ( this.dialogue || this.journalOpen ); }

	update( dt ) {
		const app = this.app, p = app.player;
		this.life.update( dt, p, this.dialogue?.id );
		const hud = app.game.hud;
		const available = p.mode === 'walk' && ! app.freeCam && ! p.busy && ! app.game.rod.equipped && ! hud?.invOpen && ! hud?.standOpen && ! hud?.catchOpen;
		const nearby = available ? this.life.residents.find( r => r.vendor.inRange( p.position ) ) : null;
		if ( nearby && ! this.paused ) {
			p.prompt = { key: 'E', text: `Listen to ${ nearby.name }` };
			if ( app.input.hit( 'KeyE' ) ) { this.dialogue = nearby; this.page = 0; document.exitPointerLock?.(); this.renderDialogue(); }
		}
		if ( this.paused ) p.prompt = null;
		this.find( '.exp-near' ).textContent = nearby && ! this.paused ? `${ nearby.name } · ${ nearby.role }` : '';
		if ( available ) for ( const a of this.life.animals ) if ( a.group.position.distanceTo( p.position ) < 9 && ! this.seen.has( a.kind ) ) {
			this.seen.add( a.kind ); this.save(); app.game.toast( `${ a.kind === 'goat' ? 'Island goat' : 'Grove tortoise' } recorded in your field journal` );
		}
		const dx = this.target.position.x - p.position.x, dz = this.target.position.z - p.position.z;
		const compass = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];
		const bearing = ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360;
		this.find( '.exp-objective' ).textContent = `${ this.target.name } · ${ Math.round( Math.hypot( dx, dz ) ) } m ${ compass[ Math.round( bearing / 45 ) % 8 ] }`;
		this.ui.querySelectorAll( '[data-mode]' ).forEach( button => button.setAttribute( 'aria-pressed', String( button.dataset.mode === p.mode && ! app.freeCam ) ) );
		this.find( '.exp-controls' ).textContent = p.mode === 'plane' ? `A / D turn · W / S speed · Space / C altitude\n${ Math.round( this.plane.speed * 3.6 ) } km/h · ${ Math.round( this.plane.position.y ) } m ASL · Shift boost` : p.mode === 'boat' ? 'WASD steer & throttle · Shift boost\n3 goes ashore · 2 takes flight' : 'WASD walk · Shift run · E listen\n1 summons boat · 2 takes flight';
		this.ui.hidden = !! ( app.ui?.ui?._photo || app.ui?.ui?._start || app.ui?.ui?._help || app.game.guide?.open );
	}
}
