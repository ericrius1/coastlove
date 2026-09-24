// Run from the browser's developer console after the world has loaded:
// await (await import('/test/exploration-browser.mjs')).checkExploration(window.__app)
// Restores the journal after checking transitions and persistence.
export function checkExploration( app ) {
	const e = app.exploration, p = app.player;
	const key = 'tidewater.windward.journal.v1';
	const saved = localStorage.getItem( key ), read = new Set( e.read ), seen = new Set( e.seen );
	const position = p.position.clone(), yaw = p.yaw;
	const results = [];
	const check = ( condition, message ) => { if ( ! condition ) throw new Error( message ); results.push( message ); };
	try {
		for ( const mode of [ 'plane', 'boat', 'plane', 'walk', 'boat', 'walk' ] ) {
			e.switchMode( mode );
			check( p.mode === mode, `switch to ${ mode }` );
			check( app.boatCtl.driven === ( mode === 'boat' ), `boat ownership in ${ mode }` );
			check( e.plane.group.visible === ( mode === 'plane' ), `plane visibility in ${ mode }` );
			if ( mode === 'walk' ) check( p.position.y >= 1.5 && Math.abs( p.position.y - app.terrainData.heightAt( p.position.x, p.position.z ) ) < 0.01, 'walking arrival grounded above water' );
			if ( mode === 'boat' ) check( app.terrainData.heightAt( app.boatCtl.position.x, app.boatCtl.position.z ) < - 3, 'boat arrival in deep water' );
		}
		check( e.life.residents.every( r => !! r.vendor.character ), 'all four animated character assets loaded' );
		check( e.life.animals.length === 32, 'all 32 creatures present' );
		e.read.clear();
		e.dialogue = e.life.residents[ 0 ]; e.page = 2;
		app.input.pressed.add( 'KeyE' ); app.input.pressed.add( 'KeyJ' );
		e.beforeUpdate();
		check( e.read.has( 'ines' ) && e.journalOpen, 'simultaneous E and J saves the final story before opening journal' );
		check( JSON.parse( localStorage.getItem( key ) ).read.includes( 'ines' ), 'completed story persists in localStorage' );
		check( e.find( '.exp-entries' ).textContent.includes( e.life.residents[ 0 ].pages[ 0 ] ), 'journal contains the collected story' );
		e.toggleJournal( false );
		for ( const resident of e.life.residents ) { e.dialogue = resident; e.page = 2; e.advance(); }
		e.seen.add( 'goat' ); e.seen.add( 'tortoise' ); e.save();
		check( e.find( '.exp-entries' ).textContent.includes( 'Field expedition complete' ), 'all stories and species complete the expedition' );
		return results;
	} finally {
		app.input.pressed.clear();
		e.read = read; e.seen = seen;
		if ( saved === null ) localStorage.removeItem( key ); else localStorage.setItem( key, saved );
		e.closeDialogue(); e.toggleJournal( false ); e.refresh();
		e.target = e.life.residents.find( r => ! read.has( r.id ) ) || e.life.residents[ 0 ];
		p.mode = 'walk'; p.position.copy( position ); p.yaw = yaw; p.velocity.set( 0, 0, 0 );
		app.boatCtl.reset(); app.boatCtl.driven = false; e.plane.group.visible = false;
	}
}
