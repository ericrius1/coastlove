import { UniformBlock } from '../gpu/Uniforms.js';
import { setFrameUniforms } from '../gpu/Shader.js';
import { Vector2, Vector3, Vector4, Matrix4, Color } from '../math/index.js';

// Per-frame uniforms visible to every shader as `frame` (group 0, binding 0).
//
// Camera matrices are written by the renderer for the camera being drawn. `viewProj` includes the
// sub-pixel TAA jitter; `viewProjNoJitter` / `prevViewProjNoJitter` are for motion vectors.
// The simulation globals (the former Globals.js `G` uniforms) live here too: `G.sunDir.value` is the
// handle of `frame.sunDir` and so on, so CPU code keeps its `.value` accessors.
const FRAME_FIELDS = {
	relativeViewProj: 'mat4x4f',
    prevRelativeViewProj: 'mat4x4f',
    cameraOrigin: ['vec3f',new Vector3()],
    cameraOffset: ['vec3f',new Vector3()],
    prevCameraOrigin: ['vec3f',new Vector3()],
    prevCameraOffset: ['vec3f',new Vector3()],
    view: 'mat4x4f',
	proj: 'mat4x4f',
	viewProj: 'mat4x4f',
	invView: 'mat4x4f',
	invProj: 'mat4x4f',
	invViewProj: 'mat4x4f',
	viewProjNoJitter: 'mat4x4f',
	prevViewProjNoJitter: 'mat4x4f',
	cameraPos: [ 'vec3f', new Vector3() ],
	near: [ 'f32', 0.1 ],
	prevCameraPos: [ 'vec3f', new Vector3() ],
	far: [ 'f32', 60000 ],
	// internal render size (px) and its inverse; output (canvas) size
	resolution: [ 'vec2f', new Vector2( 1, 1 ) ],
	invResolution: [ 'vec2f', new Vector2( 1, 1 ) ],
	outputResolution: [ 'vec2f', new Vector2( 1, 1 ) ],
	// sub-pixel jitter in NDC units (applied in viewProj)
	jitter: [ 'vec2f', new Vector2() ],
	frameIndex: [ 'u32', 0 ],
	time: [ 'f32', 0 ], // simulation time (s)
	dt: [ 'f32', 1 / 60 ],
	seaLevel: [ 'f32', 0 ],

	// Sun (or moon at night) direction, pointing toward the light.
	sunDir: [ 'vec3f', new Vector3( 0.3, 0.6, - 0.7 ).normalize() ],
	night: [ 'f32', 0 ], // 0 = day, 1 = full night
	// Radiance-scaled irradiance of the sun at sea level after atmospheric extinction.
	sunColor: [ 'vec3f', new Color( 1, 1, 1 ) ],
	exposure: [ 'f32', 1 ],
	// Hemispherical sky irradiance at sea level (cosine-weighted, divided by PI).
	skyIrradiance: [ 'vec3f', new Color( 0.3, 0.4, 0.6 ) ],
	cameraUnderwater: [ 'f32', 0 ],
	// Average horizon sky color (fog / aerial perspective fallback).
	horizonColor: [ 'vec3f', new Color( 0.6, 0.7, 0.8 ) ],
	cameraWaterHeight: [ 'f32', 0 ],
	// Water optical properties (per meter).
	waterAbsorption: [ 'vec3f', new Vector3( 0.42, 0.075, 0.035 ) ],
	windSpeed: [ 'f32', 7 ], // m/s at 10 m height
	waterScattering: [ 'vec3f', new Vector3( 0.012, 0.018, 0.024 ) ],
	envIntensity: [ 'f32', 1 ],
	// direction the wind blows toward
	windDir: [ 'vec2f', new Vector2( 0.35, 0.94 ).normalize() ],
	// 1 when the frame renders with reversed depth (always, except shadow maps)
	reversedDepth: [ 'f32', 1 ],
	pad0: [ 'f32', 0 ],
	// free slots for experiments / debug views
	debug: [ 'vec4f', new Vector4() ],
};

const CAMERA_FIELDS = [ 'relativeViewProj','prevRelativeViewProj','cameraOrigin','cameraOffset','prevCameraOrigin','prevCameraOffset','view', 'proj', 'viewProj', 'invView', 'invProj', 'invViewProj', 'viewProjNoJitter', 'prevViewProjNoJitter',
	'cameraPos', 'near', 'prevCameraPos', 'far', 'resolution', 'invResolution', 'jitter', 'reversedDepth' ];

// Every view owns its camera values. Keep them alive across frames: the main view, three shadow
// cascades and environment faces otherwise create hundreds of temporary math objects per frame.
function initializeCameraValues( block ) {

	for ( const name of CAMERA_FIELDS ) {

		const field = block.fields[ name ];
		const type = block.layout[ name ].typeStr;
		if ( type === 'mat4x4f' ) field.value = new Matrix4();
		else if ( type === 'vec3f' ) field.value = new Vector3();
		else if ( type === 'vec2f' ) field.value = new Vector2().copy( field.value );

	}

}

// The main frame block (main camera; also what compute shaders see).
export const FrameUniforms = new UniformBlock( 'Frame', FRAME_FIELDS, { label: 'frame' } );
initializeCameraValues( FrameUniforms );
const SIMULATION_FIELDS = FrameUniforms.order.filter( ( name ) => ! CAMERA_FIELDS.includes( name ) );

setFrameUniforms( FrameUniforms );

// Extra views (shadow cascades, cube faces, reflection cameras): same struct, own buffer and own
// camera fields; every other field follows the main block. A buffer can only hold one value per
// submit, so each camera drawn in a frame needs its own view block.
export function createViewUniforms( label ) {

	const block = new UniformBlock( 'Frame', FRAME_FIELDS, { label } );
	initializeCameraValues( block );
	block.onBeforePack = () => {

		for ( const k of SIMULATION_FIELDS ) block.fields[ k ].value = FrameUniforms.fields[ k ].value;

	};
	return block;

}

const F = FrameUniforms.fields;

// Shared simulation state (same names as the three.js version's Globals.js).
export const G = {
	time: F.time,
	dt: F.dt,
	seaLevel: F.seaLevel,
	sunDir: F.sunDir,
	sunColor: F.sunColor,
	skyIrradiance: F.skyIrradiance,
	horizonColor: F.horizonColor,
	waterAbsorption: F.waterAbsorption,
	waterScattering: F.waterScattering,
	cameraUnderwater: F.cameraUnderwater,
	cameraWaterHeight: F.cameraWaterHeight,
	exposure: F.exposure,
	windDir: F.windDir,
	windSpeed: F.windSpeed,
	night: F.night,
	envIntensity: F.envIntensity,
};

export const GRAVITY = 9.81;

const _m = new Matrix4();

// Write the camera state for a draw. `jitter` in pixels (internal resolution).
export function setFrameCamera( camera, width, height, { jitterX = 0, jitterY = 0, prevViewProj = null, prevCameraPos = null, block = FrameUniforms } = {} ) {

	const F = block.fields;
	camera.updateMatrixWorld();
	const view = camera.matrixWorldInverse;
	const proj = camera.projectionMatrix;
	// Snapshot history first, including when the caller passes a current field as its history.
	if ( prevViewProj ) F.prevViewProjNoJitter.value.copy( prevViewProj );
	if ( prevCameraPos ) F.prevCameraPos.value.copy( prevCameraPos );
	F.view.value.copy( view );
	F.proj.value.copy( proj );
	const vp = F.viewProjNoJitter.value.multiplyMatrices( proj, view );
	// jitter: translate clip xy by 2 * px / size (times w, so a pre-multiplied translation)
	const jx = 2 * jitterX / width, jy = 2 * jitterY / height;
	_m.makeTranslation( jx, jy, 0 );
	const vpj = F.viewProj.value.multiplyMatrices( _m, vp );
	F.invView.value.copy( camera.matrixWorld );
	F.invProj.value.copy( proj ).invert();
	F.invViewProj.value.copy( vpj ).invert();
	if ( ! prevViewProj ) F.prevViewProjNoJitter.value.copy( vp );
	F.cameraPos.value.setFromMatrixPosition( camera.matrixWorld );
	if ( ! prevCameraPos ) F.prevCameraPos.value.copy( F.cameraPos.value );
	const cameraP = F.cameraPos.value, previousP = F.prevCameraPos.value;
	const origin = F.cameraOrigin.value.set( Math.floor( cameraP.x / 1024 ) * 1024, Math.floor( cameraP.y / 1024 ) * 1024, Math.floor( cameraP.z / 1024 ) * 1024 );
	const previousOrigin = F.prevCameraOrigin.value.set( Math.floor( previousP.x / 1024 ) * 1024, Math.floor( previousP.y / 1024 ) * 1024, Math.floor( previousP.z / 1024 ) * 1024 );
	F.cameraOffset.value.copy( cameraP ).sub( origin );
	F.prevCameraOffset.value.copy( previousP ).sub( previousOrigin );
	F.relativeViewProj.value.copy( vp ).multiply( _m.makeTranslation( cameraP.x, cameraP.y, cameraP.z ) );
	F.prevRelativeViewProj.value.copy( F.prevViewProjNoJitter.value ).multiply( _m.makeTranslation( previousP.x, previousP.y, previousP.z ) );
	F.near.value = camera.near;
	F.far.value = camera.far;
	F.resolution.value.set( width, height );
	F.invResolution.value.set( 1 / width, 1 / height );
	F.jitter.value.set( jx, jy );
	F.reversedDepth.value = camera.reversedDepth === false ? 0 : 1;

}
