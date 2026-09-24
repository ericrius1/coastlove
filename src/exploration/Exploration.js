import { Euler, Vector3 } from '../engine/index.js';
import { Traffic } from './Traffic.js';
import { VehicleInteractions } from './VehicleInteractions.js';
import { TravelMap } from '../california/TravelMap.js';
import { Seaplane } from './Seaplane.js';
import { IslandLife } from './IslandLife.js';
import { CALIFORNIA_STORIES as STORIES, PLACES } from '../california/Region.js';
import { Landmarks } from '../california/Landmarks.js';
import { CoastalChart } from '../california/CoastalChart.js';
import { wrapHour, clockLabel } from '../california/TimeScrub.js';
import { findSafeSpot } from './Navigation.js';
import { mapPinArrival } from '../california/MapPin.js';
import './exploration.css';

const SAVE = 'coastlove.journal.v1';
export class Exploration {
	constructor( app ) {
		this.app = app;
		this.plane = new Seaplane( app.scene, app.terrainData, (...args)=>Math.max(app.coastalTowns?.flightClearance(...args)||0,app.realCities?.flightClearance(...args)||0) );
		this.landmarks = new Landmarks(app);
		this.life = new IslandLife( app.scene, app.terrainData, app.colliders, { loadCharacters: true, california: true } );
		this.traffic = new Traffic(app);
		this.vehicles = new VehicleInteractions(this);
		this.read = new Set(); this.seen = new Set(); this.found = new Set();
		try {
			const data = JSON.parse( localStorage.getItem( SAVE ) || '{}' );
			if ( Array.isArray( data.read ) ) this.read = new Set( data.read.filter( id => STORIES.some( s => s.id === id ) ) );
			if ( Array.isArray( data.seen ) ) this.seen = new Set( data.seen.filter( id => [ 'fox', 'seaLion' ].includes( id ) ) );
			if ( Array.isArray(data.found) ) this.found = new Set(data.found.filter(id=>PLACES.some(p=>p.id===id)));
		} catch { /* Private browsing or damaged saves must not block play. */ }
		this.target = this.life.residents.find( r => ! this.read.has( r.id ) ) || this.life.residents[ 0 ];
		this.dialogue = null; this.page = 0; this.journalOpen = false;
		this.ui = document.createElement( 'section' );
		this.ui.className = 'exp-ui';
  this.ui.innerHTML = `<aside class="exp-card"><div class="exp-eyebrow">CALIFORNIA · THE PACIFIC COAST</div><h1>coastlove<span>Take the long way home.</span></h1><div class="exp-vehicles" aria-label="Travel modes"><button data-mode="boat"><kbd>1</kbd> Boat</button><button data-mode="plane"><kbd>2</kbd> Plane</button><button data-mode="walk"><kbd>3</kbd> Walk</button><button data-mode="car"><kbd>4</kbd> Car</button></div><p class="exp-controls"></p><button class="exp-car-stop">Coastal drive · find a car <kbd>E</kbd></button><div class="exp-divider"></div><p class="exp-objective"></p><div class="exp-progress"></div><button class="exp-map-button">Map & fast travel <kbd>M</kbd></button><button class="exp-journal-button">Field notes <kbd>J</kbd></button></aside><div class="exp-clock"><span class="exp-clock-time">16:12</span><span><kbd>Z</kbd> + trackpad · travel through time</span><input aria-label="Time of day" type="range" min="0" max="23.99" step=".01"></div><div class="exp-near" role="status"></div><section class="exp-dialog" hidden role="dialog" aria-label="Island conversation"><div class="exp-eyebrow exp-role"></div><h2 class="exp-name"></h2><p class="exp-story"></p><div class="exp-dialog-footer"><span class="exp-page"></span><button class="exp-next">Continue <kbd>E</kbd></button><button class="exp-close">Leave <kbd>Esc</kbd></button></div></section><section class="exp-journal" hidden role="dialog" aria-label="Coastal chart and field notes"><div class="exp-eyebrow">COASTLOVE · A CALIFORNIA FIELD GUIDE</div><h2>Somewhere beyond the shore.</h2><p>Border Field to the Oregon line, ten miles inland, the Bay & the islands. Real coastlines and distances, stories of our own.</p><div class="exp-chart-layout"><div><canvas class="exp-map" width="640" height="640" aria-label="Coastal map. Choose a destination from the list for accessible navigation."></canvas><p class="exp-map-caption">Scroll to zoom · drag to pan · double-click to fit. Choose Visit for an easy arrival.</p><div class="exp-quality"><label>Picture quality <select aria-label="Picture quality"><option value="1">Full detail · long views</option><option value=".8">Air · same draw distance</option><option value=".65">Smooth · same draw distance</option></select></label></div></div><div><label class="exp-filter-label">Explore a region <select class="exp-region-filter" aria-label="Explore a region"><option value="all">Entire California coast</option><option value="south">Southern California</option><option value="central">Central coast</option><option value="bay">San Francisco Bay & coast</option><option value="north">Redwood & north coast</option><option value="islands">Channel Islands</option></select></label><div class="exp-entries"></div></div></div><button class="exp-journal-close">Back to the coast <kbd>J</kbd></button></section>`;
		document.body.append( this.ui );
		this.find = selector => this.ui.querySelector( selector );
		this.ui.querySelectorAll( '[data-mode]' ).forEach( button => button.onclick = () => this.switchMode( button.dataset.mode ) );
		this.find('.exp-region-filter').onchange=()=>this.refresh();
		this.find('.exp-car-stop').onclick=()=>this.visitCarStop();
		this.find('.exp-map-button').onclick=()=>this.toggleMap();
		this.find( '.exp-journal-button' ).onclick = () => this.toggleJournal();
		this.find( '.exp-journal-close' ).onclick = () => this.toggleJournal( false );
		this.find( '.exp-next' ).onclick = () => this.advance();
		this.find( '.exp-close' ).onclick = () => this.closeDialogue();
  this.chart = new CoastalChart(this.find('.exp-map'),app.terrainData,place=>{this.target=place;this.refresh();});
  this.map = new TravelMap(this);
  this.find('.exp-clock input').oninput=e=>{app.settings.timeSpeed=0;app.settings.timeOfDay=Number(e.target.value);};
  this.find('.exp-quality select').onchange=e=>app.setRenderScale(Number(e.target.value));
  this.refresh();
 }

	save() {
		try { localStorage.setItem( SAVE, JSON.stringify( { read: [ ...this.read ], seen: [ ...this.seen ], found: [ ...this.found ] } ) ); } catch { /* Keep playing with in-memory progress. */ }
		this.refresh();
	}

	refresh() {
		this.find( '.exp-progress' ).textContent = `${ this.found.size } / ${PLACES.length} places · ${ this.read.size } / ${STORIES.length} stories · ${ this.seen.size } / 2 wildlife`;
		const entries = this.find( '.exp-entries' ); entries.replaceChildren();
		for (const place of PLACES) {
   const region=place.region||(place.id==='harbor'||place.id==='poppies'||place.id==='cypress'?'south':'islands'),filter=this.find('.exp-region-filter').value;if(filter!=='all'&&filter!==region)continue;
   const article=document.createElement('article');const title=document.createElement('h3');title.textContent=`${this.found.has(place.id)?'✓ ':''}${place.label}`;article.append(title);
   const p=document.createElement('p');p.textContent=this.found.has(place.id)?place.story:place.hint;article.append(p);
   const track=document.createElement('button');track.textContent=this.target?.id===place.id?'Tracking':'Track';track.onclick=()=>{this.target=place;this.refresh();};article.append(track);
   const visit=document.createElement('button');visit.textContent='Visit';visit.onclick=()=>this.visit(place);article.append(visit);entries.append(article);
  }
  for ( const r of this.life.residents ) {
			const article = document.createElement( 'article' );
			const title = document.createElement( 'h3' ); title.textContent = `${ this.read.has( r.id ) ? '✓ ' : '' }${ r.name } · ${ r.role }`; article.append( title );
			const p = document.createElement( 'p' ); p.textContent = this.read.has( r.id ) ? r.pages.join( '\n\n' ) : 'An untold story. Follow the bearing on your travel card to find them.'; article.append( p );
			const button = document.createElement( 'button' ); button.textContent = 'Track on compass'; button.onclick = () => { this.target = r; this.toggleJournal( false ); }; article.append( button ); entries.append( article );
		}
		const wildlife = document.createElement( 'p' );
		wildlife.textContent = `Wildlife: ${ this.seen.has( 'fox' ) ? '✓ Island foxes' : '○ Island foxes' } · ${ this.seen.has( 'seaLion' ) ? '✓ Sea lions' : '○ Sea lions' }. Approach within 9 m on foot to record a sighting.`; entries.append( wildlife );
		if ( this.read.size === STORIES.length && this.seen.size === 2 && this.found.size === PLACES.length ) {
			const complete = document.createElement( 'h3' ); complete.textContent = 'The whole coast, remembered. There is still another sunset.'; entries.append( complete );
		}
	}

 visitCarStop(){
  const spot=this.traffic.findCarStop();if(!spot){this.app.game.toast('The car stop is busy. Try again in a moment.');return;}
  this.traffic.release();this.app.player.position.copy(spot);this.app.player.mode='arriving';this.switchMode('walk');
  const car=this.traffic.stopCar;this.app.player.yaw=Math.atan2(spot.x-car.position.x,spot.z-car.position.z);
  this.app.game.toast('Coastal drive · walk up to a car and press E');
 }

 async visit(place) {
  this.modeTicket=(this.modeTicket||0)+1;const ticket=this.visitTicket=(this.visitTicket||0)+1;
  try{await this.app.realCities?.prepare(place);}catch(error){this.app.game.toast("The city could not load. Please try again.");console.error(error);return;}
  if(ticket!==this.visitTicket)return;
  const app=this.app,water=!!place.water;
  app.coastalTowns?.syncColliders(place);
  app.localTerrain?.update(place,true);
  if(place.custom){
   const arrival=mapPinArrival(app,place);
   if(!arrival){app.game.toast('That pin is outside the playable map. Choose a spot closer to California.');return;}
   this.traffic.release();app.player.position.copy(arrival.position);app.player.mode='arriving';this.switchMode(arrival.mode,arrival.position);
   this.target=place;app.game.toast(arrival.mode==='plane'?'Above your pin · no clear footing below':'Arrived at your map pin');return;
  }
  const street=app.terrainData.streets?.inCity(place.x,place.z)?app.terrainData.streets.nearestStreet(place.x,place.z,600):null;
  const arrival=findSafeSpot(app.terrainData,app.colliders,(street?.x??place.x)+(place.kind==='lighthouse'?8:0),(street?.z??place.z)+(place.kind==='wreck'?7:0),water,200);
  if(!arrival){app.game.toast('This shore is too steep. Approach it by plane.');return;}
  this.traffic.release();app.player.position.copy(arrival);app.player.mode='arriving';this.switchMode(water?'boat':'walk');
  this.target=place;app.game.toast(place.label+' · take a moment to look around');
 }

 toggleMap(open = !this.map.open){
  if(open){
   this.closeDialogue();this.toggleJournal(false);this.app.game.hud?.closeStand();this.app.game.hud?.toggleInventory(false);
   document.exitPointerLock?.();this.app.input.mouseDown=this.app.input.rightDown=false;this.app.input.consumeLook();this.app.input.consumeWheel();
  }
  this.map.show(open);
  this.app.input.captured=open;
  this.app.input.keys.clear();this.app.input.pressed.clear();
 }

 toggleJournal( open = ! this.journalOpen ) {
  if(open)this.toggleMap(false);
		this.closeDialogue(); this.journalOpen = open;
		if ( open ) { this.app.game.hud?.closeStand(); this.app.game.hud?.toggleInventory( false ); }
		this.find( '.exp-journal' ).hidden = ! open;
		if ( open ) { document.exitPointerLock?.(); this.refresh(); this.chart.draw(this.app.player.position,this.target,this.found); }
	}

	closeDialogue() { this.dialogue = null; this.find( '.exp-dialog' ).hidden = true; }
	advance() {
		if ( ! this.dialogue ) return;
		if ( this.page < this.dialogue.pages.length - 1 ) { this.page ++; this.renderDialogue(); return; }
		this.read.add( this.dialogue.id );
		this.target = this.life.residents.find( r => ! this.read.has( r.id ) ) || this.dialogue;
		this.save(); this.closeDialogue();
		this.app.game.toast( this.read.size === STORIES.length ? 'All coastal stories collected · check your field journal' : 'Story saved to your field journal' );
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

	switchMode( mode, preparedArrival = null ) {
        const ticket=this.modeTicket=(this.modeTicket||0)+1;this.visitTicket=(this.visitTicket||0)+1;
        if(mode==='car'){this.closeDialogue();this.toggleJournal(false);this.toggleMap(false);this.app.freeCam=false;return this.traffic.summon(ticket);}
		const app = this.app, p = app.player, b = app.boatCtl;
		if ( mode === p.mode && ! app.freeCam ) return;
		// Compute arrival before changing any current state: a failed search is harmless.
		const from = p.position;
		const destination = mode === 'plane' ? null : preparedArrival ?? findSafeSpot( app.terrainData, app.colliders, from.x, from.z, mode === 'boat' );
		if ( mode !== 'plane' && ! destination ) { app.game.toast( 'No safe arrival nearby. Fly closer to the island first.' ); return; }
		this.traffic.release();
		this.closeDialogue(); this.toggleJournal( false ); this.toggleMap(false);
		app.game.cancelLine( true ); app.game.rod.equip( false );
		app.game.hud?.closeStand(); app.game.hud?.toggleInventory( false );
		app.freeCam = false;
		if ( b.driven ) app.audio?.engineStop();
		b.driven = false; b.throttle = 0; b.throttleTarget = 0;
		p.velocity.set( 0, 0, 0 ); p.busy = false; p._camY = null;
		this.plane.group.visible = mode === 'plane' || this.plane.parked;
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
		app.game.toast( mode === 'plane' ? 'Marigold · trackpad turns and pitches the nose · A / D also turn' : mode === 'boat' ? 'At the helm · WASD to drive · V for cockpit view' : 'Safely ashore · follow your compass to meet an islander' );
		app.input.consumeLook();
	}

 get inputCaptured(){ return this.paused || !!this.map?.open; }
 get canApproachCar(){
  const app=this.app,p=app.player,hud=app.game.hud;
  return p.mode==='walk'&&!app.freeCam&&!this.inputCaptured&&!p.busy&&!app.game.rod.equipped&&!hud?.invOpen&&!hud?.standOpen&&!hud?.catchOpen;
 }

	beforeUpdate() {
		const input = this.app.input;
		this.app.coastalTowns?.syncColliders(this.app.player.position);
        this.app.realCities?.syncColliders(this.app.player.position);
		const delta=input.consumeTimeScrub();
		if(delta && !this.app.ui?.ui?._start){this.app.settings.timeSpeed=0;this.app.settings.timeOfDay=wrapHour(this.app.settings.timeOfDay+delta);if(Math.abs(delta)>.15)this.app.clouds?.resetHistory?.();}
		if(input.down('KeyZ')){input.consumeLook();input.consumeWheel();}
		if ( input.hit( 'Escape' ) ) { this.closeDialogue(); this.toggleJournal( false ); this.toggleMap(false); }
		if ( this.dialogue && input.hit( 'KeyE' ) ) { this.advance(); input.pressed.delete( 'KeyE' ); }
		if ( input.hit( 'KeyM' ) && !this.app.ui?.ui?._start && !this.app.ui?.ui?._help && !this.app.ui?.ui?._photo && !this.app.game.guide?.open ) this.toggleMap();
		if ( input.hit( 'KeyJ' ) ) this.toggleJournal();
  if(this.map.open)return;
		for ( const [ key, mode ] of [ [ 1, 'boat' ], [ 2, 'plane' ], [ 3, 'walk' ], [ 4, 'car' ] ] ) if ( input.hit( `Digit${ key }` ) || input.hit( `Numpad${ key }` ) ) this.switchMode( mode );
  if(input.hit('KeyE')&&this.vehicles.interact())input.pressed.delete('KeyE');
	}

	discover(place){if(this.found.has(place.id))return;this.found.add(place.id);this.save();this.app.game.toast('Discovered · '+place.label);}

	get paused() { return !! ( this.dialogue || this.journalOpen ); }

	update( dt ) {
		const app = this.app, p = app.player;
		this.life.update( dt, p, this.dialogue?.id );
		app.coastalTowns?.update(dt,p.position,app.settings.timeOfDay);
        app.realCities?.update(dt);
		this.landmarks.update(dt,p.position,app.settings.timeOfDay);
		this.find('.exp-clock-time').textContent=clockLabel(app.settings.timeOfDay);
		this.find('.exp-clock').classList.toggle('is-scrubbing',app.input.down('KeyZ'));
		if(document.activeElement!==this.find('.exp-clock input'))this.find('.exp-clock input').value=app.settings.timeOfDay;
		if(this.journalOpen){this._chartTime=(this._chartTime||0)+dt;if(this._chartTime>.2){this.chart.draw(p.position,this.target,this.found);this._chartTime=0;}}
		this.map.update();
		const hud = app.game.hud;
		const vehiclePrompt=this.vehicles.prompt();
		const available = p.mode === 'walk' && ! app.freeCam && ! p.busy && ! app.game.rod.equipped && ! hud?.invOpen && ! hud?.standOpen && ! hud?.catchOpen;
		const nearby = available ? this.life.residents.find( r => r.vendor.inRange( p.position ) ) : null;
		if ( nearby && !vehiclePrompt && ! this.inputCaptured ) {
			p.prompt = { key: 'E', text: `Listen to ${ nearby.name }` };
			if ( app.input.hit( 'KeyE' ) ) { this.dialogue = nearby; this.page = 0; document.exitPointerLock?.(); this.renderDialogue(); }
		}
		if(vehiclePrompt)p.prompt=vehiclePrompt;
		if ( this.inputCaptured ) p.prompt = null;
		this.find( '.exp-near' ).textContent = vehiclePrompt ? vehiclePrompt.text : nearby && ! this.inputCaptured ? `${ nearby.name } · ${ nearby.role }` : '';
		if ( available ) for ( const a of this.life.animals ) if ( a.group.position.distanceTo( p.position ) < 9 && ! this.seen.has( a.kind ) ) {
			this.seen.add( a.kind ); this.save(); app.game.toast( `${ a.kind === 'fox' ? 'Island fox' : 'Sea lion' } recorded in your field journal` );
		}
		for(const place of PLACES){
   const distance=Math.hypot(place.x-p.position.x,place.z-p.position.z);
   if(place.kind==='wreck'&&distance<14&&available&&!this.inputCaptured&&!nearby&&!vehiclePrompt){p.prompt={key:'E',text:'Ring the ship’s bell'};if(app.input.hit('KeyE')){this.landmarks.ringBell();this.discover(place);}}
   if(this.found.has(place.id)||this.paused)continue;
   const height=place.water?0:app.terrainData.heightAt(place.x,place.z);
   if(distance<place.radius&&Math.abs(p.position.y-height)<(place.kind==='arch'?28:18)&&place.kind!=='wreck')this.discover(place);
  }
  const targetPosition=this.target.position||this.target;
  const dx = targetPosition.x - p.position.x, dz = targetPosition.z - p.position.z;
		const compass = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];
		const bearing = ( Math.atan2( dx, - dz ) * 180 / Math.PI + 360 ) % 360;
		this.find( '.exp-objective' ).textContent = `${ this.target.label || this.target.name } · ${ Math.round( Math.hypot( dx, dz ) ) } m ${ compass[ Math.round( bearing / 45 ) % 8 ] }`;
		this.ui.querySelectorAll( '[data-mode]' ).forEach( button => button.setAttribute( 'aria-pressed', String( button.dataset.mode === p.mode && ! app.freeCam ) ) );
		this.find( '.exp-controls' ).textContent = p.mode === 'car' ? `W / S accelerate & reverse · A / D or trackpad steer\n${Math.round(Math.abs(this.traffic.active?.speed||0)*3.6)} km/h · Space drift · Shift boost · E get out` : p.mode === 'plane' ? `Trackpad turns & pitches · A / D also turn\nW / S speed · Shift + W fast cruise · L level\nSpace / C up / down · ${ Math.round( this.plane.speed * 3.6 ) } km/h\nE land & get out` : p.mode === 'boat' ? 'WASD steer & throttle · Shift boost\nE get out · M map & fast travel' : 'WASD walk · Shift run · E enter vehicle / listen\n1 summons boat · 2 takes flight';
		this.ui.hidden = !! ( app.ui?.ui?._photo || app.ui?.ui?._start || app.ui?.ui?._help || app.game.guide?.open );
	}
}
