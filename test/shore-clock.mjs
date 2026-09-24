// Run the real shoreline wave shader across successive frames, including the
// former statewide clock offset that caused the surf to advance at 4–8 Hz.
import './headless.mjs';
import assert from 'node:assert/strict';
import {GPU,ShaderModule,UniformBlock,ComputeKernel,StorageBuffer,readBuffer,FrameUniforms,G,commonModule} from '../src/engine/webgpu.js';
import {ShoreWaves} from '../src/ocean/ShoreWaves.js';
import {computeShoreField} from '../src/world/ShoreField.js';

// The solver and moving local shore window must share a signed physical clock,
// without a world-size bias. Keep this alongside the actual GPU timing check.
const statewide=computeShoreField({size:2097152,origin:-1048576,heightAt:()=>-25},{res:32,swellDir:[-.12,-1]});
let minArrival=Infinity,maxArrival=-Infinity;
for(let i=0;i<statewide.data.length;i+=4){
 assert.ok(Number.isFinite(statewide.data[i]));
 minArrival=Math.min(minArrival,statewide.data[i]);maxArrival=Math.max(maxArrival,statewide.data[i]);
}
assert.ok(minArrival<0&&maxArrival>0&&Math.max(-minArrival,maxArrival)<100000,'statewide arrival times must not include the domain-size bias');
const size=1024,res=32,x=-250000,z=-750000;
const local=computeShoreField({size,origin:-size/2,heightAt:()=>-25},{res,swellDir:[-.12,-1]});
let workerResult;const previousSelf=globalThis.self;
try{
 globalThis.self={postMessage:result=>{workerResult=result;}};
 await import('../src/california/ShoreWorker.js');
 self.onmessage({data:{heights:new Float32Array(res*res).fill(-25),size,res,x,z,id:1}});
}finally{if(previousSelf===undefined)delete globalThis.self;else globalThis.self=previousSelf;}
const offset=(-.12*x-z)/Math.sqrt(9.81*25);
for(let i=0;i<local.data.length;i+=4)for(const channel of [0,3]){
 assert.ok(Math.abs(workerResult.data[i+channel]-local.data[i+channel]-offset)<.005,'local wave and swash clocks must retain their world-space phase');
}

await GPU.init({headless:true});
const errors=[];GPU.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
const clock=new UniformBlock('ClockFixture',{arrival:['f32',2097152.25]});
const terrain={module:new ShaderModule({name:'clockTerrain',deps:[commonModule],uniforms:clock,uniformName:'clockFixture',code:`
fn terrainHeightAt(p:vec2f)->f32{return -2.0;}
fn terrainShoreSample(p:vec2f)->vec4f{return vec4f(clockFixture.arrival,0.0,-1.0,clockFixture.arrival);}
`})};
const shore=new ShoreWaves(terrain),N=120,result=new StorageBuffer({count:N,type:'vec4f'});
const sample=new ComputeKernel({label:'shoreline clock regression',modules:[shore.module],bindings:{result:{storage:result,access:'read_write'}},workgroupSize:[1,1,1],code:`
@compute @workgroup_size(1,1,1) fn main(){
 let p=vec2f(100.0,50.0);let ph=shorePhaseAt(p);
 let wave=shoreEvaluateNoNormal(p,2.0,-2.0);
 let swash=shoreSwashRunup(ph.sh,ph.along,0.1);
 result[frame.frameIndex]=vec4f(ph.s-floor(ph.s+0.5),swash.tau,wave.disp.y,wave.disp.x);
}`});
await GPU.pipelinesReady();
const checks=[];
for(const arrival of [2097152.25,-62000.125,34000.75,0])for(const fps of [30,60,120])for(const start of [400,404.7]){
 clock.fields.arrival.value=arrival;
 for(let f=0;f<N;f++){
  GPU.beginFrame();FrameUniforms.fields.frameIndex.value=f;G.time.value=start+f/fps;G.dt.value=1/fps;
  sample.dispatch(1);GPU.submit();
 }
 const data=new Float32Array(await readBuffer(result,N*16));let phaseStalls=0,swashStalls=0,waveStalls=0,maxError=0;
 for(let i=1;i<N;i++){
  const a=(i-1)*4,b=i*4,advance=data[b]-data[a],wrapped=advance-Math.round(advance);
  if(data[b]===data[a])phaseStalls++;if(data[b+1]===data[a+1])swashStalls++;
  if(data[b+2]===data[a+2]&&data[b+3]===data[a+3])waveStalls++;
  maxError=Math.max(maxError,Math.abs(wrapped-1/(fps*shore.period.value)));
 }
 const stats={arrival,fps,start,phaseStalls,swashStalls,waveStalls,maxError};checks.push(stats);
 if(phaseStalls||swashStalls||waveStalls||maxError>=.00002)console.log(JSON.stringify(stats));
 assert.equal(phaseStalls,0,'wave phase must advance on every rendered frame');
 assert.equal(swashStalls,0,'beach wash must advance on every rendered frame');
 assert.equal(waveStalls,0,'actual wave displacement must change each frame');
 assert.ok(maxError<.00002,'wave speed must track elapsed time without quantized jumps');
}
assert.deepEqual(errors,[]);console.log('ok shoreline wave phase, displacement and swash advance continuously at 30/60/120 fps across statewide clock ranges');
await GPU.queue.onSubmittedWorkDone();process.exit(0);
