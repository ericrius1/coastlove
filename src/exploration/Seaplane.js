import { Group, Mesh, Vector3, Euler } from '../engine/index.js';
import { prepare, mergePrepared, sphere, roundedBox, cylinder, mat4, rod } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';

// Match San Francisco's standard plane steering, translated from its -Z
// forward axis to Coastlove's +Z forward axis.
const TURN_RATE = 0.8;
const MOUSE_YAW = 0.0026;
const MOUSE_PITCH = 0.0022;
const KEY_YAW = 1.8;
const BANK_AMOUNT = 0.55;
const BANK_SMOOTH = 4.5;
const clamp = ( value, min, max ) => Math.max( min, Math.min( max, value ) );

export class Seaplane {
	constructor( scene, terrain ) {
		this.terrain = terrain;
		this.group = new Group();
		this.group.name = 'Coastlove courier seaplane';
		this.group.visible = false;
		this.position = this.group.position;
		this.heading = 0;
		this.pitch = 0;
		this.speed = 26;
		this.bank = 0;
		this.climb = 0;
		this.time = 0;
		const material = createPropMaterial( 'seaplane' );
		material.underwaterLighting = 'lite';
		const parts = [];
		const add = ( geometry, color, matrix, metal = 0.2 ) => parts.push( prepare( geometry, { color, rough: 0.4, metal, matrix } ) );
		const cream = 0xe5dfc7, teal = 0x206568, orange = 0xd67d3e;
		add( sphere( 1, 24, 16 ), cream, mat4( 0, 0.2, 0, 0, 0, 0, 0.85, 0.88, 3.4 ) );
		add( roundedBox( 1.35, 0.65, 1.9, 0.22 ), 0x234956, mat4( 0, 0.83, 0.45 ), 0.5 );
		add( roundedBox( 11.8, 0.16, 1.8, 0.07 ), cream, mat4( 0, 1.3, 0.3 ) );
		for ( const side of [ - 1, 1 ] ) {
			add( roundedBox( 1.2, 0.18, 1.82, 0.07 ), orange, mat4( side * 5.25, 1.3, 0.3 ) );
			add( sphere( 1, 16, 10 ), teal, mat4( side * 1.25, - 1.25, 0, 0, 0, 0, 0.32, 0.35, 2.8 ) );
			for ( const z of [ - 1.2, 1.1 ] ) add( rod( new Vector3( side * 0.45, - 0.3, z ), new Vector3( side * 1.25, - 1, z ), 0.055, 8 ), cream );
			add( rod( new Vector3( side * 0.6, - 0.1, 0 ), new Vector3( side * 4, 1.2, 0.2 ), 0.04, 8 ), teal );
		}
		add( roundedBox( 4, 0.14, 1, 0.06 ), teal, mat4( 0, 0.45, - 2.65 ) );
		add( roundedBox( 0.15, 1.5, 1.2, 0.06 ), orange, mat4( 0, 1, - 2.5 ) );
		add( cylinder( 0.45, 0.6, 0.65, 20 ), teal, mat4( 0, 0.2, 3, Math.PI / 2 ) );
		const body = new Mesh( mergePrepared( parts ), material );
		body.castShadow = true;
		this.group.add( body );
		this.propeller = new Mesh( prepare( roundedBox( 0.13, 2.45, 0.09, 0.04 ), { color: 0x293337, rough: 0.35 } ), material );
		this.propeller.position.set( 0, 0.2, 3.4 );
		this.group.add( this.propeller );
		scene.add( this.group );
		this._camera = new Vector3();
		this._target = new Vector3();
	}

	launch( position, heading ) {
		this.position.copy( position );
		this.position.y = Math.max( position.y + 18, this.terrain.heightAt( position.x, position.z ) + 45, 55 );
		this.heading = heading;
		this.pitch = 0;
		this.bank = this.climb = 0;
		this.speed = 26;
		this.group.visible = true;
		this.cameraReady = false;
	}

	update( dt, input, camera ) {
		dt = Math.min( dt, 0.05 );
		this.time += dt;
		const look = input.consumeLook();
		const maxStep = TURN_RATE * dt;
		const mouseYaw = clamp( look.x * MOUSE_YAW, - maxStep, maxStep );
		const keyYaw = ( Number( input.down( 'KeyD' ) ) - Number( input.down( 'KeyA' ) ) ) * KEY_YAW * dt;
		const yawDelta = clamp( mouseYaw + keyYaw, - maxStep - KEY_YAW * dt, maxStep + KEY_YAW * dt );
		this.heading += yawDelta;
		this.pitch = clamp( this.pitch + clamp( - look.y * MOUSE_PITCH, - maxStep, maxStep ), - 1.15, 1.15 );
		const targetBank = clamp( - yawDelta / Math.max( dt, 1e-4 ) * BANK_AMOUNT, - 1, 1 );
		this.bank += ( targetBank - this.bank ) * Math.min( 1, dt * BANK_SMOOTH );
		const boost = input.down( 'ShiftLeft' ) || input.down( 'ShiftRight' );
		const targetSpeed = boost ? 62 : input.down( 'KeyW' ) ? 42 : input.down( 'KeyS' ) ? 14 : 26;
		this.speed += ( targetSpeed - this.speed ) * ( 1 - Math.exp( - dt * 1.8 ) );
		const vertical = Number( input.down( 'Space' ) ) - Number( input.down( 'KeyC' ) );
		const horizontalStep = Math.cos( this.pitch ) * this.speed * dt;
		this.position.x += Math.sin( this.heading ) * horizontalStep;
		this.position.z += Math.cos( this.heading ) * horizontalStep;
		const edge = this.terrain.size / 2 - 40;
		if ( Math.abs( this.position.x ) > edge || Math.abs( this.position.z ) > edge ) {
			this.heading = Math.atan2( - this.position.x, - this.position.z );
			this.position.x = Math.max( - edge, Math.min( edge, this.position.x ) );
			this.position.z = Math.max( - edge, Math.min( edge, this.position.z ) );
		}
		// Follow the nose like San Francisco's plane, while looking ahead to keep
		// the coastline and ridges safely clear. Level flight holds its height.
		const ground = Math.max( 0, this.terrain.heightAt( this.position.x, this.position.z ), this.terrain.heightAt( this.position.x + Math.sin( this.heading ) * 36, this.position.z + Math.cos( this.heading ) * 36 ) );
		const manualClimb = Math.sin( this.pitch ) * this.speed + vertical * 24;
		const terrainClimb = this.position.y < ground + 34 ? clamp( ( ground + 34 - this.position.y ) * 1.15, 0, 26 ) : - Infinity;
		const previousHeight = this.position.y;
		this.position.y = clamp( this.position.y + Math.max( manualClimb, terrainClimb ) * dt, ground + 15, 620 );
		this.climb = ( this.position.y - previousHeight ) / Math.max( dt, 1e-4 );
		if ( this.position.y <= ground + 15 && this.pitch < 0 ) this.pitch = 0.05;
		const flightPitch = Math.atan2( this.climb, Math.cos( this.pitch ) * this.speed );
		this.group.quaternion.setFromEuler( new Euler( - flightPitch, this.heading, this.bank, 'YXZ' ) );
		this.propeller.rotation.z += dt * 65;
		this._target.copy( this.position );
		this._target.x -= Math.sin( this.heading ) * 19;
		this._target.z -= Math.cos( this.heading ) * 19;
		this._target.y = Math.max( this.position.y + 7 - Math.sin( flightPitch ) * 8, this.terrain.heightAt( this._target.x, this._target.z ) + 5 );
		if ( ! this.cameraReady ) { this._camera.copy( this._target ); this._cameraHeading = this.heading; this._cameraPitch = flightPitch; this.cameraReady = true; }
		this._camera.lerp( this._target, 1 - Math.exp( - dt * 5 ) );
		const cameraFollow = 1 - Math.exp( - dt * 7 );
		const cameraTurn = this.heading - this._cameraHeading;
		this._cameraHeading += Math.atan2( Math.sin( cameraTurn ), Math.cos( cameraTurn ) ) * cameraFollow;
		this._cameraPitch += ( flightPitch - this._cameraPitch ) * cameraFollow;
		camera.position.copy( this._camera );
		camera.lookAt( this.position.x + Math.sin( this._cameraHeading ) * 12, this.position.y + Math.sin( this._cameraPitch ) * 12, this.position.z + Math.cos( this._cameraHeading ) * 12 );
	}
}
