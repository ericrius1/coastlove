import { Texture } from '../gpu/Texture.js';
import { ShadowUniforms, setShadowMap } from './wgsl/lighting.js';
import { createViewUniforms, setFrameCamera } from './Frame.js';
import { Matrix4, Vector3, Vector4 } from '../math/index.js';

// Cascaded sun shadow maps (replaces three's CSMShadowNode + SunShadowFilter).
//
// Cascades are fitted to bounding spheres of slices of the main camera frustum (stable under
// rotation) and snapped to their texel grid (no shimmer when moving). Near cascade every frame,
// the next every 2nd, the rest every 4th while the view is still. Motion refreshes a cascade before
// its terrain morph / coverage can lag behind the main view. Map and sampling transform move together.
// Depth is standard (0 near .. 1 far) with an orthographic projection; the lighting module samples
// it with PCSS on the near cascade and a 16-tap PCF elsewhere.

const _center = new Vector3();
const _zero = new Vector3();
const _cameraPosition = new Vector3();
const _cameraDirection = new Vector3();
const _up = new Vector3( 0, 1, 0 );
const _inv = new Matrix4();
const _tmp = new Vector3();
const _tmp4 = new Vector4();

export class SunShadows {

	constructor( { size = 2048, splits = [ 10, 60, 400 ], lightMargin = 200, normalBias = [ 0.015, 0.06, 0.3 ], bias = 0.00002, pcssCascades = 1 } = {} ) {

		this.size = size;
		this.splits = splits;
		this.count = splits.length;
		this.lightMargin = lightMargin;
		this.normalBias = normalBias;
		this.periods = splits.map( ( _, i ) => i === 0 ? 1 : i === 1 ? 2 : 4 );
		this.texture = new Texture( { label: 'sunShadowMap', width: size, height: size, depth: this.count, dimension: '2d-array', format: 'depth32float', usage: [ 'sample', 'render' ] } );
		setShadowMap( this.texture );
		this.cascades = splits.map( ( _, i ) => ( {
			camera: {
				matrixWorld: new Matrix4(), matrixWorldInverse: new Matrix4(), projectionMatrix: new Matrix4(),
				near: 0, far: 1, reversedDepth: false, updateMatrixWorld() {}, isCamera: true, isShadowCamera: true,
			},
			block: createViewUniforms( 'shadowView' + i ),
			viewProj: new Matrix4(),
			viewPosition: new Vector3(), viewDirection: new Vector3(),
			projection: new Matrix4(),
			radius: 0,
			dirty: true,
		} ) );
		this.enabled = true;
		this.layerMask = 0xffffffff;
		this.frame = 0;
		this.lastSun = new Vector3( 0, - 2, 0 );
		const U = ShadowUniforms.fields;
		U.count.value = this.count;
		U.mapSize.value = size;
		U.bias.value = bias;
		U.pcssCascades.value = pcssCascades;
		U.enabled.value = 1;

	}

	// seam blend band (m) at view distance d (SoftCSMShadowNode: max( 0.25 e^2, 0.25 e ) of the normalized
	// break e, times the shadow distance): 2.5 m at the 10 m seam, 15 m at 60 m, 100 m fade-out at 400 m
	_margin( d ) {

		const far = this.splits[ this.count - 1 ];
		const e = d / far;
		return Math.max( 0.25 * e * e, 0.25 * e ) * far;

	}

	// Fit cascade i to the view-distance slice [ near, far ] of `camera`, widened by half the seam blend
	// bands so the overlapping cascades both cover them.
	_fit( i, camera, sunDir ) {

		const c = this.cascades[ i ];
		const x = i === 0 ? 0 : this.splits[ i - 1 ];
		const y = this.splits[ i ];
		const mN = this._margin( x ), mF = this._margin( y );
		const near = Math.max( camera.near, x - mN * 0.5 );
		const far = i === this.count - 1 ? y : y + mF * 0.5;
		ShadowUniforms.fields.blend.value[ i ] = new Vector4( x, y, mN, mF );
		// slice corners in world space (perspective: scale the unit frustum by distance)
		const tanY = 1 / camera.projectionMatrix.elements[ 5 ];
		const tanX = 1 / camera.projectionMatrix.elements[ 0 ];

		// bounding sphere of the slice: centre on the axis, radius to the farthest corner
		const zc = Math.min( far, ( near + far ) / 2 * ( 1 + tanX * tanX + tanY * tanY ) );
		_center.set( 0, 0, - zc ).applyMatrix4( camera.matrixWorld );
		// Compute in camera space: subtracting distant world corners can change the rounded radius.
		let r = Math.max( Math.hypot( near * tanX, near * tanY, near - zc ), Math.hypot( far * tanX, far * tanY, far - zc ) );
		r = Math.ceil( r / ( 1 - 2 / this.size ) * 16 ) / 16; // room for texel snapping at the edges
		c.radius = r;

		// light view looking along -sunDir, snapped to texels
		const cam = c.camera;
		const L = sunDir;
		const up = Math.abs( L.y ) > 0.99 ? _tmp.set( 1, 0, 0 ) : _up;
		cam.matrixWorld.identity().lookAt( L, _zero, up ); // discard the previous eye before snapping
		_inv.copy( cam.matrixWorld ).invert();
		const texel = 2 * r / this.size;
		const ls = _tmp4.set( _center.x, _center.y, _center.z, 1 ).applyMatrix4( _inv );
		ls.x = Math.round( ls.x / texel ) * texel;
		ls.y = Math.round( ls.y / texel ) * texel;
		const back = r + this.lightMargin;
		// eye = snapped centre moved back toward the sun
		const eye = new Vector3( ls.x, ls.y, ls.z + back ).applyMatrix4( cam.matrixWorld );
		cam.matrixWorld.setPosition( eye );
		cam.matrixWorldInverse.copy( cam.matrixWorld ).invert();
		const n = 0.1, f = back + r;
		cam.near = n;
		cam.far = f;
		orthoStandardZ( cam.projectionMatrix, - r, r, r, - r, n, f );
		c.viewProj.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse );

		const U = ShadowUniforms.fields;
		// Float32 absolute matrices lose several shadow texels across California. Subtract an exact
		// local origin first; apply the normal bias AFTER that subtraction so centimetres survive.
		const origin = U.origins.value[ i ];
		origin.set( Math.floor( eye.x / 1024 ) * 1024, Math.floor( eye.y / 1024 ) * 1024, Math.floor( eye.z / 1024 ) * 1024, 0 );
		U.matrices.value[ i ].copy( c.viewProj ).multiply( _inv.makeTranslation( origin.x, origin.y, origin.z ) );
		U.cascades.value[ i ] = new Vector4( far, texel, this.normalBias[ i ] ?? 0.05, f - n );
		c.viewPosition.setFromMatrixPosition( camera.matrixWorld );
		c.viewDirection.setFromMatrixColumn( camera.matrixWorld, 2 );
		c.projection.copy( camera.projectionMatrix );

	}

	// Decide which cascades re-render this frame and fit them. Returns the list of indices.
	update( camera, sunDir ) {

		this.frame ++;
		ShadowUniforms.fields.enabled.value = this.enabled && sunDir.y > - 0.05 ? 1 : 0;
		if ( ! this.enabled ) return [];
		camera.updateMatrixWorld();
		_cameraPosition.setFromMatrixPosition( camera.matrixWorld );
		_cameraDirection.setFromMatrixColumn( camera.matrixWorld, 2 );
		const sunMoved = this.lastSun.angleTo( sunDir ) > 1e-4;
		this.lastSun.copy( sunDir );
		const out = [];
		for ( let i = 0; i < this.count; i ++ ) {

			const c = this.cascades[ i ];
			const viewShift = _cameraPosition.distanceTo( c.viewPosition ) + _cameraDirection.distanceTo( c.viewDirection ) * this.splits[ i ];
			const moved = viewShift > Math.max( 0.03, c.radius / this.size );
			const lensChanged = camera.projectionMatrix.elements.some( ( v, k ) => v !== c.projection.elements[ k ] );
			if ( sunMoved || c.dirty || moved || lensChanged || ( this.frame + i ) % this.periods[ i ] === 0 ) {

				this._fit( i, camera, sunDir );
				this.cascades[ i ].dirty = false;
				out.push( i );

			}

		}

		return out;

	}

	render( scene, meshRenderer, indices ) {

		for ( const i of indices ) {

			const c = this.cascades[ i ];
			setFrameCamera( c.camera, this.size, this.size, { block: c.block } );
			meshRenderer.render( scene, {
				label: 'shadow cascade ' + i,
				kind: 'depth',
				camera: c.camera,
				frameBlock: c.block,
				depthView: this.texture.view( { dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1 } ),
				depthFormat: 'depth32float',
				clearDepth: 1,
				depthCompare: 'less-equal',
				layerMask: this.layerMask,
				depthBias: 2,
				depthBiasSlopeScale: 1.5,
			} );

		}

	}

}

// orthographic projection, WebGPU clip z in [0, 1] with 0 at the near plane
export function orthoStandardZ( m, left, right, top, bottom, near, far ) {

	const w = 1 / ( right - left ), h = 1 / ( top - bottom ), p = 1 / ( far - near );
	m.set(
		2 * w, 0, 0, - ( right + left ) * w,
		0, 2 * h, 0, - ( top + bottom ) * h,
		0, 0, - p, - near * p,
		0, 0, 0, 1,
	);
	return m;

}
