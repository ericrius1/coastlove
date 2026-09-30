import assert from 'node:assert/strict';
import { LocalTerrain } from '../src/california/LocalTerrain.js';

let samples=0,uploads=0;
const terrain={localRevision:1,heightAt(x,z){samples++;return height(x,z,this.localRevision);}};
function height(x,z,revision){return Math.sin(x*.004)*13+Math.cos(z*.007)*9+x*.021-z*.013+revision*.7;}
const stream=Object.assign(Object.create(LocalTerrain.prototype),{
 app:{terrainData:terrain,terrainGPU:{setLocalTerrain(){uploads++;}}},
 res:32,size:4096,center:null,pending:null,completed:null,spare:null,
});

function reference(frame){
 const N=frame.res,step=frame.size/N,H=new Float32Array(N*N),data=new Float32Array(N*N*4);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++)H[j*N+i]=height(frame.x+(i+.5)*step,frame.z+(j+.5)*step,frame.revision);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const k=j*N+i,dx=(H[j*N+Math.min(N-1,i+1)]-H[j*N+Math.max(0,i-1)])/(2*step),dz=(H[Math.min(N-1,j+1)*N+i]-H[Math.max(0,j-1)*N+i])/(2*step),n=Math.sqrt(1+dx*dx+dz*dz);
  data[k*4]=H[k];data[k*4+1]=-dx/n;data[k*4+2]=-dz/n;data[k*4+3]=Math.max(0,Math.min(1,(Math.hypot(dx,dz)-.2)*1.5));
 }
 return{H,data};
}
function finish(position,force=false){
 const before=samples;
 stream.update(position,force);
 for(let i=0;stream.pending&&i<10000;i++)stream.update(position);
 assert.equal(stream.pending,null,'streaming finishes');
 const expected=reference(stream.completed);
 assert.deepEqual(stream.completed.H,expected.H,'cached heights exactly match a fresh patch');
 assert.deepEqual(stream.completed.data,expected.data,'normals and rock detail exactly match, including both patch edges');
 return samples-before;
}

assert.equal(finish({x:0,z:0},true),1024);
const firstH=stream.completed.H,firstData=stream.completed.data;
assert.equal(finish({x:768,z:0}),192,'one 768 m step samples only the newly exposed 18.75%');
assert.equal(finish({x:1536,z:768}),348,'diagonal movement samples the union of newly exposed strips');
assert.equal(stream.completed.H,firstH,'height staging buffers are recycled');
assert.equal(stream.completed.data,firstData,'normal staging buffers are recycled');
assert.equal(finish({x:768,z:0}),348,'reverse movement retains exact overlap');
assert.equal(finish({x:-768,z:-768}),504,'negative coordinates retain exact overlap');
assert.equal(finish({x:400000,z:-700000}),1024,'cross-state teleport fully samples its destination');
terrain.localRevision++;
assert.equal(finish({x:400000,z:-700000}),1024,'terrain edits invalidate every cached sample');
assert.equal(finish({x:400000,z:-700000},true),1024,'an explicit forced refresh remains a full rebuild');

// Non-integer texel shifts cannot reuse the old patch, even when their world bounds overlap.
stream.size=3200;
assert.equal(finish({x:400000,z:-700000}),1024,'changed grid dimensions force a rebuild');
assert.equal(finish({x:400768,z:-700000}),1024,'a 768 m shift on a 100 m grid is not aligned');
stream.res=64;
assert.equal(finish({x:400768,z:-700000}),4096,'changed resolution replaces staging buffers');
console.log('ok terrain samples and shading match fresh patches through movement, diagonal shifts, reversals, teleports and edits');

// Give each update a deterministic two-row budget to check publication while construction spans
// frames. Revising the terrain partway through must cancel the incomplete revision.
const actualPerformance=globalThis.performance;
let clock=0;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock++}});
try{
 stream.size=4096;stream.res=32;
 const old=stream.completed,oldHeight=old.H.slice(),oldData=old.data.slice(),beforeUploads=uploads;
 const destination={x:402048,z:-700768};
 stream.update(destination);
 assert.ok(stream.pending);
 assert.equal(uploads,beforeUploads,'an incomplete patch is never published');
 assert.equal(stream.completed,old,'the current patch stays active during construction');
 assert.deepEqual(old.H,oldHeight);
 assert.deepEqual(old.data,oldData);
 terrain.localRevision++;
 stream.update(destination);
 assert.equal(stream.pending.revision,terrain.localRevision,'mid-build edits immediately restart the patch');
 assert.equal(stream.pending.source,null,'a restarted revision cannot reuse old heights');
 finish(destination);
 assert.equal(uploads,beforeUploads+1,'only the complete current revision is published');
}finally{
 Object.defineProperty(globalThis,'performance',{configurable:true,value:actualPerformance});
}
console.log('ok terrain streaming publishes atomically and recycles independent staging buffers');
