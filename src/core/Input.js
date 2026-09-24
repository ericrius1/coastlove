import { wheelHours } from '../california/TimeScrub.js';
// Keyboard / mouse input with pointer lock support.
export class Input {

	constructor( dom ) {

		this.dom = dom;
		this.keys = new Set();
		this.pressed = new Set();
		this.look = { x: 0, y: 0 };
		this.wheel = 0;
		this.timeScrub = 0;
		this.mouseDown = false;
		this.rightDown = false;
		this.locked = false;
		this.enabled = true;

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target && ( e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' ) ) return;
			if ( ! this.keys.has( e.code ) ) this.pressed.add( e.code );
			this.keys.add( e.code );
			if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'Tab' ].includes( e.code ) ) e.preventDefault();

		} );
		window.addEventListener( 'keyup', ( e ) => { this.keys.delete( e.code ); if(e.code==='KeyZ')this.scrubReleasedAt=performance.now(); } );
		window.addEventListener( 'blur', () => { this.keys.clear(); this.pressed.clear(); this.timeScrub = this.wheel = 0; this.look.x = this.look.y = 0; this.mouseDown = this.rightDown = false; } );

		dom.addEventListener( 'mousedown', ( e ) => {

			if ( e.button === 0 ) {
				this.mouseDown = true;
				// Match San Francisco: capture on the press itself, including after Esc.
				this.requestLock();
			}
			if ( e.button === 2 ) this.rightDown = true;

		} );
		window.addEventListener( 'mouseup', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = false;
			if ( e.button === 2 ) this.rightDown = false;

		} );
		dom.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		window.addEventListener( 'mousemove', ( e ) => {

			if ( this.keys.has( 'KeyZ' ) ) {
				if ( this.mouseDown || this.locked ) this.timeScrub += e.movementX / 180;
				return;
			}
			if ( this.locked || this.mouseDown || this.rightDown ) {

				this.look.x += e.movementX;
				this.look.y += e.movementY;

			}

		} );
  // Capture time gestures over the HUD as well as the canvas. Briefly absorb
  // inertial scroll after releasing Z so it cannot become accidental camera zoom.
  window.addEventListener('wheel',e=>{
   const held=this.keys.has('KeyZ');
   if(!held && !(performance.now()-(this.scrubReleasedAt??-Infinity)<250))return;
   if(e.ctrlKey||e.metaKey)return;
   if(held)this.timeScrub+=wheelHours(e);
   e.preventDefault();e.stopImmediatePropagation();
  },{passive:false,capture:true});
		dom.addEventListener( 'wheel', ( e ) => {

			this.wheel += Math.sign( e.deltaY );

			e.preventDefault();

		}, { passive: false } );

		document.addEventListener( 'pointerlockchange', () => {

			this.locked = document.pointerLockElement === dom;

		} );

	}

	requestLock() {

		if ( ! this.locked ) this.dom.requestPointerLock?.()?.catch?.( () => {} );

	}

	down( code ) {

		return this.enabled && this.keys.has( code );

	}

	// true once per physical key press
	hit( code ) {

		return this.enabled && this.pressed.has( code );

	}

	consumeLook() {

		const l = { x: this.look.x, y: this.look.y };
		this.look.x = 0;
		this.look.y = 0;
		return l;

	}

	consumeTimeScrub() {
		const delta = this.timeScrub; this.timeScrub = 0; return delta;
	}

	consumeWheel() {

		const w = this.wheel;
		this.wheel = 0;
		return w;

	}

	endFrame() {

		this.pressed.clear();

	}

}
