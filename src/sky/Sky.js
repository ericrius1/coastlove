import { ShaderModule, UniformBlock } from '../engine/gpu/Shader.js';
import { FullscreenPass } from '../engine/render/FullscreenPass.js';
import { SCENE_FORMATS, DEPTH_FORMAT } from '../engine/render/SceneRenderer.js';
import { commonModule } from '../engine/render/wgsl/common.js';
import { Vector3, MathUtils } from '../engine/math/index.js';
import { SUN_ANGULAR_RADIUS } from './Atmosphere.js';

// Sky radiance: atmosphere (sky view LUT) + sun disk, stars, moon and moonlit sky, composited with
// the clouds.
//
// WGSL module (`sky.module`, prefix `sky`; built on first use, after `sky.clouds` is set):
//   uniform var skyParams: SkyParams (sunDiskIntensity, starIntensity, moonDir)
//   fn skySunDisk( dir: vec3f ) -> vec3f           sun disk radiance (atmospheric transmittance included)
//   fn skyStars( dir: vec3f ) -> vec3f
//   fn skyMoon( dir: vec3f ) -> vec3f
//   fn skyMoonSky( dir: vec3f ) -> vec3f           faint moonlit sky + aureole
//   fn skyBackground( dir: vec3f, starK: f32 ) -> vec3f   everything behind the clouds but the disks
//   fn skyRadiance( dir: vec3f, withSun: bool ) -> vec3f  no clouds
//   fn skyRadianceWithClouds( dir: vec3f, withSun: bool ) -> vec3f   panorama clouds composited
//   fn skyReflectionRadiance( dir: vec3f ) -> vec3f       water reflections (no moon disk, a trace of stars)
//   fn skyViewRadiance( dir: vec3f ) -> vec3f             main view (full resolution view clouds)
// `sky.background`: the scene background for SceneRenderer.background (draw( renderPassEncoder )).

const STAR_CELLS = 160; // cells per half cube face (one star candidate per cell, ~9 px at 25 px/deg)
const STAR_SIGMA = 0.1; // star PSF (cells, ~1 px)
const MW = new Vector3( 0.3, 0.2, 1 ).normalize(); // pole of the Milky Way band
// reflections spread point sources over rough water: only a trace of the stars survives
const STAR_REFLECTION = 0.08;
const MOON_ANGULAR_RADIUS = 0.0048;
const SUN_CHORD_RADIUS = 2 * Math.sin( SUN_ANGULAR_RADIUS / 2 );
const MOON_CHORD_RADIUS = 2 * Math.sin( MOON_ANGULAR_RADIUS / 2 );

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

export class Sky {

	constructor( atmosphere ) {

		this.atmosphere = atmosphere;
		this.clouds = null; // set later: Clouds (module with cloudsSample / cloudsSampleView)
		this.params = new UniformBlock( 'SkyParams', {
			moonDir: [ 'vec3f', new Vector3( - 0.3, 0.5, 0.8 ).normalize() ],
			sunDiskIntensity: [ 'f32', 1 ],
			starIntensity: [ 'f32', 0 ],
		}, { label: 'sky' } );
		this.sunDiskIntensity = this.params.fields.sunDiskIntensity;
		this.moonDir = this.params.fields.moonDir;
		this.starIntensity = this.params.fields.starIntensity;
		this._module = null;
		this._background = null;

	}

	get module() {

		if ( ! this._module ) this._module = this._buildModule();
		return this._module;

	}

	_buildModule() {

		const clouds = this.clouds;
		const deps = [ commonModule, this.atmosphere.module ];
		if ( clouds ) deps.push( clouds.module );
		const composite = ( sampler ) => clouds
			? `let c = ${ sampler }( dir );\n\treturn base * c.a + c.rgb;`
			: 'return base;';

		return new ShaderModule( {
			name: 'sky',
			deps,
			uniforms: this.params,
			uniformName: 'skyParams',
			code: /* wgsl */`
// hash without sine (D. Hoskins): keeps full precision for large integer coordinates
fn skyHash13( p: vec3f ) -> f32 {
	var p3 = fract( p * vec3f( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

// Sun disk radiance along dir (already includes atmospheric transmittance).
fn skySunDisk( dir: vec3f ) -> vec3f {
	// A chord-distance test keeps the tiny disk stable near dot(dir, sun) = 1.
	// Most pixels never touch the transmittance LUT or evaluate the limb profile.
	let delta = dir - atmosphereParams.sunDir; // the real sun (frame.sunDir is the moon at night)
	let r2 = dot( delta, delta ) / ${ f( SUN_CHORD_RADIUS * SUN_CHORD_RADIUS ) };
	if ( r2 >= 1.0 || dir.y <= -0.02 || skyParams.sunDiskIntensity <= 0.0 ) { return vec3f( 0.0 ); }
	let r = sqrt( r2 );
	let mask = smoothstep( 1.0, 0.9, r );
	let mu = sqrt( max( 1.0 - r * r, 0.0 ) );
	let limb = 1.0 - 0.6 * ( 1.0 - mu );
	let T = atmosphereTransmittanceToSpace( dir );
	// physically the disk radiance is E / solid angle (~1.6e5); clamp for fp16 targets
	return T * mask * limb * 2500.0 * skyParams.sunDiskIntensity * smoothstep( -0.02, 0.0, dir.y );
}

// Stars: one candidate per cell of a cube-face grid, jittered inside it, with a power law
// magnitude distribution (few bright stars, many faint ones), denser along the Milky Way. They
// come out after civil twilight: the brightest first, the faintest once the sky is fully dark.
fn skyStars( dir: vec3f ) -> vec3f {
	if ( dir.y <= 0.0 || skyParams.starIntensity <= 0.001 ) { return vec3f( 0.0 ); }
	let dark = 1.0 - smoothstep( -0.28, -0.1, atmosphereParams.sunDir.y );
	let extinction = skyParams.starIntensity * smoothstep( 0.0, 0.2, dir.y );
	let bx = dot( dir, vec3f( ${ f( MW.x ) }, ${ f( MW.y ) }, ${ f( MW.z ) } ) ) * 4.0;
	let band = exp( - bx * bx );
	// Broad stellar clouds and a winding dust lane give the galaxy a quiet sense
	// of depth. Direction-space structure stays fixed while the camera travels.
	let stellarCloud = 0.72 + 0.18 * sin( dot( dir, vec3f( 13.0, 4.0, -7.0 ) ) )
		+ 0.1 * sin( dot( dir, vec3f( 29.0, -8.0, -6.0 ) ) );
	let dustOffset = 0.12 * sin( dot( dir, vec3f( 5.0, 3.0, -2.0 ) ) );
	let dustDistance = ( bx + dustOffset ) * 4.5;
	let dust = 1.0 - exp( - dustDistance * dustDistance ) * 0.58;
	let glow = vec3f( 0.55, 0.6, 0.75 ) * ( band * stellarCloud * dust * dark * 0.0048 );
	// cube face coordinates
	let a = abs( dir );
	let onX = a.x > a.y && a.x > a.z;
	let onY = a.y > a.z;
	let face = select( select( sign( dir.z ) + 8.0, sign( dir.y ) + 5.0, onY ), sign( dir.x ) + 2.0, onX );
	let uv = select( select( dir.xy / a.z, dir.xz / a.y, onY ), dir.yz / a.x, onX ) * ${ f( STAR_CELLS ) };
	let cell = vec3f( floor( uv ), face );
	let h = skyHash13( cell );
	// the cell holds a star with probability P (higher along the Milky Way); an independent
	// uniform u ranks its brightness: N( < m ) ~ 10^( m / 2 ), brightest about magnitude -1
	let has = h < band * 0.035 + 0.025;
	// Over 94% of cells are empty. Preserve their diffuse galaxy glow while
	// skipping magnitude, point-spread function, color and scintillation work.
	if ( ! has ) { return glow * extinction; }
	let uc = max( skyHash13( cell + 7.7 ), 2e-4 );
	let m = log2( uc ) * 0.602 + 6.5;
	// limiting magnitude: -1 when the sun is 6 deg below the horizon, 6.5 below 16 deg
	let vis = smoothstep( m - 0.6, m + 0.6, dark * 7.5 - 1.0 );
	if ( vis <= 0.0 ) { return glow * extinction; }
	// angular distance to the star (isotropic whatever the cube face distortion), in cells
	let sp = ( floor( uv ) + vec2f( skyHash13( cell + 3.1 ), skyHash13( cell + 5.7 ) ) * 0.4 + 0.3 ) / ${ f( STAR_CELLS ) };
	let sdir = normalize( select( select( vec3f( sp, sign( dir.z ) ), vec3f( sp.x, sign( dir.y ), sp.y ), onY ), vec3f( sign( dir.x ), sp ), onX ) );
	let d = length( dir - sdir ) * ${ f( STAR_CELLS ) };
	// flux relative to a magnitude 6.5 star; bright stars look bigger (glare), not just clipped
	let flux = pow( uc, -0.8 );
	let size = log2( flux ) * 0.08 + 1.0;
	let psf = exp( d * d / ( size * size ) * ${ f( - 0.5 / ( STAR_SIGMA * STAR_SIGMA ) ) } ) / ( size * size );
	// subtle scintillation, stronger low in the sky
	let tw = sin( frame.time * ( skyHash13( cell + 13.3 ) * 9.0 + 5.0 ) + h * 60.0 ) * mix( 0.18, 0.06, sat( dir.y * 2.0 ) ) + 1.0;
	let col = mix( vec3f( 1.0, 0.8, 0.6 ), vec3f( 0.75, 0.85, 1.0 ), skyHash13( cell + 17.0 ) ) * 0.5 + 0.5;
	let star = col * ( psf * flux * vis * tw * 0.0075 );
	// atmospheric extinction toward the horizon
	return ( star + glow ) * extinction;
}

fn skyMoon( dir: vec3f ) -> vec3f {
	if ( skyParams.starIntensity <= 0.001 || dir.y <= -0.02 ) { return vec3f( 0.0 ); }
	let delta = dir - skyParams.moonDir;
	let r2 = dot( delta, delta ) / ${ f( MOON_CHORD_RADIUS * MOON_CHORD_RADIUS ) };
	if ( r2 >= 1.0 ) { return vec3f( 0.0 ); }
	let r = sqrt( r2 );
	let mask = smoothstep( 1.0, 0.92, r );
	let pole = select( vec3f( 0.0, 1.0, 0.0 ), vec3f( 0.0, 0.0, 1.0 ), abs( skyParams.moonDir.y ) > 0.95 );
	let right = normalize( cross( pole, skyParams.moonDir ) );
	let up = cross( skyParams.moonDir, right );
	let uv = vec2f( dot( dir, right ), dot( dir, up ) ) / ${ f( Math.sin( MOON_ANGULAR_RADIUS ) ) };
	// Low-frequency maria survive the moon's small screen footprint. The dark
	// basins and a restrained bright crater replace an otherwise featureless disk.
	let seaA = 1.0 - smoothstep( 0.65, 1.0, length( ( uv - vec2f( -0.3, 0.27 ) ) * vec2f( 1.75, 2.25 ) ) );
	let seaB = 1.0 - smoothstep( 0.6, 1.0, length( ( uv - vec2f( 0.22, 0.32 ) ) * vec2f( 2.5, 2.7 ) ) );
	let seaC = 1.0 - smoothstep( 0.55, 1.0, length( ( uv - vec2f( -0.45, -0.22 ) ) * vec2f( 2.8, 2.3 ) ) );
	let craterDelta = uv - vec2f( 0.17, -0.58 );
	let crater = exp( - dot( craterDelta, craterDelta ) * 220.0 );
	let albedo = 1.0 - max( seaA, max( seaB, seaC ) ) * 0.3 + crater * 0.12;
	let limb = 0.72 + 0.28 * sqrt( max( 1.0 - r2, 0.0 ) );
	let T = atmosphereTransmittanceToSpace( dir );
	return vec3f( 0.9, 0.92, 1.0 ) * T * ( mask * albedo * limb * 3.0 * skyParams.starIntensity )
		* smoothstep( -0.02, 0.02, dir.y );
}

// Faint blue-grey moonlit sky (a little brighter toward the horizon) and the moon's aureole.
// Physically dim: about the level of the app's night ambient light.
fn skyMoonSky( dir: vec3f ) -> vec3f {
	let cosA = dot( dir, skyParams.moonDir );
	let ang = acos( clamp( cosA, -1.0, 1.0 ) );
	let aureole = exp( ang * -14.0 ) * 2.4 + exp( ang * -2.5 ) * 0.9;
	let grad = mix( 1.7, 1.0, sat( dir.y * 3.0 ) );
	let up = smoothstep( -0.05, 0.15, skyParams.moonDir.y );
	return vec3f( 0.005, 0.0068, 0.0105 ) * ( grad + aureole ) * frame.night * up;
}

// Everything behind the clouds except the sun and moon disks. The night terms are only
// evaluated at night (uniform branch).
fn skyBackground( dir: vec3f, starK: f32 ) -> vec3f {
	var L = atmosphereSkyLuminance( dir );
	if ( skyParams.starIntensity > 0.001 ) {
		L += skyMoonSky( dir ) + skyStars( dir ) * starK;
	}
	return L;
}

// Full sky radiance for a direction (no clouds).
fn skyRadiance( dir: vec3f, withSun: bool ) -> vec3f {
	var L = skyBackground( dir, 1.0 ) + skyMoon( dir );
	if ( withSun ) { L += skySunDisk( dir ); }
	return L;
}

// Sky with clouds composited (low resolution cloud panorama). withSun = false (environment
// map): no sun or moon disk, the key light is lit directly.
fn skyRadianceWithClouds( dir: vec3f, withSun: bool ) -> vec3f {
	var base: vec3f;
	if ( withSun ) { base = skyBackground( dir, 1.0 ) + skyMoon( dir ) + skySunDisk( dir ); }
	else { base = skyBackground( dir, ${ f( STAR_REFLECTION ) } ); }
	${ composite( 'cloudsSample' ) }
}

// Water reflections: no moon disk (the water's specular lobe reflects the key light) and only a
// trace of the stars, which rough water would spread into flickering sparkles.
fn skyReflectionRadiance( dir: vec3f ) -> vec3f {
	let base = skyBackground( dir, ${ f( STAR_REFLECTION ) } );
	${ composite( 'cloudsSample' ) }
}

// Main view background: full resolution clouds for the camera's view.
fn skyViewRadiance( dir: vec3f ) -> vec3f {
	let base = skyBackground( dir, 1.0 ) + skyMoon( dir ) + skySunDisk( dir );
	${ composite( 'cloudsSampleView' ) }
}
`,
		} );

	}

	// The main view background (SceneRenderer.background): drawn after the opaques where the depth is
	// still 0 (reversed-Z clear), writes the sky color, the camera-only motion of a direction at infinity
	// and a zero water mask.
	get background() {

		if ( ! this._background ) {

			const pass = new FullscreenPass( {
				label: 'sky background',
				modules: [ this.module ],
				colorFormats: SCENE_FORMATS,
				depthFormat: DEPTH_FORMAT,
				depthCompare: 'equal',
				depthWrite: false,
				depth: 0,
				code: /* wgsl */`
struct SkyOut {
	@location( 0 ) color: vec4f,
	@location( 1 ) velocity: vec4f,
	@location( 2 ) mask: vec4f,
};
@fragment fn fs( in: FSIn ) -> SkyOut {
	let uv = in.pos.xy * frame.invResolution;
	let dir = viewRay( uv );
	var o: SkyOut;
	o.color = vec4f( skyViewRadiance( dir ), 1.0 );
	// a direction at infinity: only the camera rotation moves it
	let c = frame.viewProjNoJitter * vec4f( dir, 0.0 );
	let p = frame.prevViewProjNoJitter * vec4f( dir, 0.0 );
	let cur = c.xy / max( abs( c.w ), 1e-6 ) * sign( c.w );
	let prev = p.xy / max( abs( p.w ), 1e-6 ) * sign( p.w );
	o.velocity = vec4f( select( vec2f( 0.0 ), ( cur - prev ) * vec2f( 0.5, -0.5 ), c.w > 1e-6 && p.w > 1e-6 ), 0.0, 1.0 );
	o.mask = vec4f( 0.0 );
	return o;
}
`,
			} );
			this._background = { pass, draw: ( rp ) => pass.draw( rp ) };

		}

		return this._background;

	}

	// three-compatible alias
	backgroundNode() {

		return this.background;

	}

}

// Simple solar position model. Returns direction toward the sun (world: +x east, -z north, +y up).
export function sunDirectionFromTime( hours, latitudeDeg = 24, declinationDeg = 6, out = new Vector3() ) {

	const phi = MathUtils.degToRad( latitudeDeg );
	const dec = MathUtils.degToRad( declinationDeg );
	const H = MathUtils.degToRad( ( hours - 12 ) * 15 );
	const east = - Math.cos( dec ) * Math.sin( H );
	const north = Math.cos( phi ) * Math.sin( dec ) - Math.sin( phi ) * Math.cos( dec ) * Math.cos( H );
	const up = Math.sin( phi ) * Math.sin( dec ) + Math.cos( phi ) * Math.cos( dec ) * Math.cos( H );
	return out.set( east, up, - north ).normalize();

}
