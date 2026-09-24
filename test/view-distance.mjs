import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Frustum,Matrix4} from '../src/engine/index.js';
import {CDLOD} from '../src/core/CDLOD.js';
import {REGION} from '../src/california/Region.js';
import {COAST_VIEW} from '../src/california/ViewQuality.js';
// Every sampled point in the visible part of the 8 km world must belong to a
// selected LOD tile, including points beyond the original 2.8 km foliage range.
const lod=new CDLOD({gridSize:40,leafSize:8,levels:Math.ceil(Math.log2(REGION.size/8))+1,rangeFactor:COAST_VIEW.terrainRange,center:{x:-REGION.size/2,z:-REGION.size/2,size:REGION.size},minY:-100,maxY:600});
const camera=new PerspectiveCamera(62,1.7,.1,60000),frustum=new Frustum();
for(const [x,y,z,tx,tz] of [[0,300,-3000,0,2500],[2600,200,2700,-3000,-1500],[-3300,300,2200,2500,-1000],[-244000,240,-376000,-246000,-381000],[114000,340,38000,125000,29000],[-407000,300,-834000,-397000,-828000]]){
 camera.position.set(x,y,z);camera.lookAt(tx,0,tz);camera.updateMatrixWorld();
 lod.update(camera);assert.ok(lod.count<lod.maxInstances,'tile buffer must not silently truncate visible terrain');
 frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
 let distant=0;
 for(let z=camera.position.z-59000;z<camera.position.z+59000;z+=1000)for(let x=camera.position.x-59000;x<camera.position.x+59000;x+=1000){
  const point=new Vector3(x,0,z);if(!frustum.containsPoint(point))continue;
  if(point.distanceTo(camera.position)>2800)distant++;
  let covered=false;
  for(let k=0;k<lod.count;k++){const i=k*4,a=lod.nodeArray;if(x>=a[i]&&x<=a[i]+a[i+2]&&z>=a[i+1]&&z<=a[i+1]+a[i+2]){covered=true;break;}}
  assert.ok(covered,`visible terrain missing at ${x}, ${z}`);
 }
 assert.ok(distant>100,'exercise terrain beyond the former vegetation cutoff');
 console.log(`ok ${lod.count} terrain tiles cover all visible samples, including ${distant} distant points`);
}
