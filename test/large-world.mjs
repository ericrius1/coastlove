import './headless.mjs';
import assert from 'node:assert/strict';
import {GPU} from '../src/engine/gpu/GPU.js';
import {RenderTarget} from '../src/engine/gpu/Texture.js';
import {readTexture} from '../src/engine/gpu/Readback.js';
import {FullscreenPass} from '../src/engine/render/FullscreenPass.js';
import {setFrameCamera} from '../src/engine/render/Frame.js';
import {PerspectiveCamera} from '../src/engine/index.js';
await GPU.init({headless:true});
const camera=new PerspectiveCamera(62,2,.06,60000),target=new RenderTarget(128,64,{colors:['rgba8unorm']}),pass=new FullscreenPass({label:'large world sky ray regression',colorFormats:['rgba8unorm'],code:'fn fragment(in:FSIn)->vec4f{return vec4f(viewRay(in.uv)*0.5+0.5,1.0);}'});
async function draw(x,z){camera.position.set(x,70,z);camera.lookAt(x+25,83,z-40);GPU.beginFrame();setFrameCamera(camera,128,64);pass.render({colorViews:[target.texture]});GPU.submit();return new Uint8Array((await readTexture(target.texture)).data);}
const near=await draw(0,0);for(const[x,z]of[[-246000,-380000],[-400000,-850000],[130000,38000]]){const far=await draw(x,z);let error=0;for(let i=0;i<near.length;i++)error=Math.max(error,Math.abs(near[i]-far[i]));assert.ok(error<=1,`sky directions retain sub-pixel precision at ${x}, ${z}: ${error}`);}
console.log('ok rendered sky rays remain stable from San Diego to the Oregon border');
await GPU.device.queue.onSubmittedWorkDone();process.exit(0);
