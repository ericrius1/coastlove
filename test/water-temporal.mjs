// Render the actual temporal resolve: moving water must not inherit static
// thin-feature locks or retain a longer history when the frame rate drops.
import './headless.mjs';
import assert from 'node:assert/strict';
import {GPU} from '../src/engine/gpu/GPU.js';
import {Texture} from '../src/engine/gpu/Texture.js';
import {G,setFrameCamera} from '../src/engine/render/Frame.js';
import {PerspectiveCamera} from '../src/engine/index.js';
import {TemporalUpscale} from '../src/post/TemporalUpscale.js';
import {readFloatTexture} from './ocean-util.mjs';

await GPU.init({headless:true});
const errors=[];GPU.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
const N=32,beauty=new Texture({width:N,height:N,format:'rgba32float'});
const velocity=new Texture({width:N,height:N,format:'rgba32float',data:new Float32Array(N*N*4)});
const mask=new Texture({width:N,height:N,format:'rgba8unorm'});
const depth=new Texture({width:N,height:N,format:'depth32float',usage:['render','sample','copySrc']});
const camera=new PerspectiveCamera(62,1,.06,60000);
const resolve=new TemporalUpscale(beauty,depth,velocity,camera,mask);resolve.setSize(N,N);
await GPU.pipelinesReady();
GPU.beginFrame();const clear=GPU.getEncoder().beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:depth.view(),depthClearValue:.5,depthLoadOp:'clear',depthStoreOp:'store'}});clear.end();GPU.submit();
function image(level){const data=new Float32Array(N*N*4);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=(y*N+x)*4,v=level+((x+y)%2?.22:-.22);data.set([v,v,v,1],i);}return data;}
async function average(){const {data}=await readFloatTexture(resolve.texture);let sum=0,n=0;for(let y=4;y<N-4;y++)for(let x=4;x<N-4;x++){sum+=data[(y*N+x)*4];n++;}return sum/n;}
function frame(dt){GPU.beginFrame();G.dt.value=dt;setFrameCamera(camera,N,N);resolve.advance();resolve.render();resolve.endFrame();GPU.submit();}
const results=[];
for(const water of [true,false])for(const fps of water?[30,60,120]:[60]){
 const m=new Uint8Array(N*N*4);for(let i=0;i<m.length;i+=4){m[i+1]=water?255:0;m[i+3]=255;}mask.upload(m);
 resolve._needsRestart=true;beauty.upload(image(.4));for(let i=0;i<40;i++)frame(1/fps);const start=await average();
 beauty.upload(image(.5));for(let i=0;i<Math.round(fps*.3);i++)frame(1/fps);const response=(await average()-start)/.1;
 results.push({water,fps,response});
 if(water)assert.ok(response>.92&&response<1.03,`water at ${fps} fps responds within 300 ms, got ${response}`);
 else assert.ok(response<.82,'static surfaces keep their original stable accumulation');
}
const water=results.filter(r=>r.water).map(r=>r.response);assert.ok(Math.max(...water)-Math.min(...water)<.035,'wave response is consistent across frame rates');
assert.deepEqual(errors,[],'temporal shaders validate on the GPU');
console.log('ok water responds smoothly at 30/60/120 fps; static history unchanged',JSON.stringify(results));
await GPU.queue.onSubmittedWorkDone();process.exit(0);
