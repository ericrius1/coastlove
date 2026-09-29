import { Pane } from 'tweakpane';
import { PLANE } from './Seaplane.js';

const typing = ( t ) => !! t && ( t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
	( t.tagName === 'INPUT' && ! /^(checkbox|radio|range|button|color|submit|reset)$/i.test( t.type ) ) );

// Debug speeds for Marigold. Hidden until `/`.
export function installPlanePane( plane ) {

	const pane = new Pane( { title: 'Seaplane', expanded: true } );
	pane.hidden = true;
	const el = pane.element;
	el.style.position = 'fixed';
	el.style.zIndex = '4000';
	el.style.left = '12px';
	el.style.right = 'auto';
	el.style.top = '12px';

	const speed = ( key, label, max ) => pane.addBinding( PLANE, key, { label, min: 0, max, step: 1 } );
	speed( 'cruise', 'cruise', 200 );
	speed( 'fast', 'W', 300 );
	speed( 'slow', 'S', 120 );
	speed( 'boost', 'shift', 400 );
	speed( 'sprint', 'shift+W', 800 );
	pane.addBinding( PLANE, 'accel', { label: 'accel', min: 0.2, max: 8, step: 0.1 } );
	pane.addBinding( plane, 'speed', { label: 'now m/s', readonly: true } );

	let raf = 0;
	const loop = () => {

		pane.refresh();
		raf = requestAnimationFrame( loop );

	};
	const setOpen = ( open ) => {

		pane.hidden = ! open;
		if ( open ) {

			document.exitPointerLock?.();
			if ( ! raf ) raf = requestAnimationFrame( loop );

		} else if ( raf ) {

			cancelAnimationFrame( raf );
			raf = 0;

		}

	};

	window.addEventListener( 'keydown', ( e ) => {

		if ( e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ) return;
		if ( e.code !== 'Slash' || typing( e.target ) ) return;
		e.preventDefault();
		setOpen( pane.hidden );

	}, true );

}
