// Reuse the web renderer's actual botanical assets, texture bakes and ocean
// spectrum. Only this build step runs JS; every animation/FFT frame runs in Rust.
import {writeFile, mkdir} from 'node:fs/promises';
import {GPU} from '../../src/engine/gpu/GPU.js';
import {readBuffer, readTexture} from '../../src/engine/gpu/Readback.js';
import {LeafAtlas} from '../../src/world/vegetation/LeafTextures.js';
import {buildTreeNear, buildShrubNear, buildFern, buildPalmNear, buildPalmFar} from '../../src/world/vegetation/PlantGeometry.js';
import {VillageTextures} from '../../src/world/village/TextureBaker.js';
import {OceanFFT} from '../../src/ocean/OceanFFT.js';

export async function exportRendering(out) {
 const dir=new URL('rendering/',out);await mkdir(dir,{recursive:true});
 GPU.device.pushErrorScope('validation');
 const atlas=new LeafAtlas();atlas.bake();
 const textures=new VillageTextures();for(const t of Object.values(textures.textures))t.usageList.push('copySrc');textures.bake();
 const textureInfo=[];
 for(const [name,t] of [['leaves',atlas.texture],...Object.entries(textures.textures)]){
  // Preserve the web bake and its complete, antialiased mip chain.
  const levels=[];
  for(let mip=0;mip<t.mipLevelCount;mip++) levels.push(Buffer.from((await readTexture(t,{mip})).data));
  await writeFile(new URL(`${name}.bin`,dir),Buffer.concat(levels));
  textureInfo.push({name,width:t.width,height:t.height,mips:t.mipLevelCount});
 }
 await writeFile(new URL('textures.json',dir),JSON.stringify(textureInfo));
 const read=(a,i,k=0)=>a?.isInterleavedBufferAttribute?a.data.array[i*a.data.stride+a.offset+k]:a?.array[i*a.itemSize+k]??0;
 const convert=(g,kind,far=false)=>{
  const vertices=[],indices=[],a=g.attributes;
  const src=g.index?.array??Array.from({length:a.position.count},(_,i)=>i);
  // The far representation retains branch silhouettes and a stratified subset
  // of the SAME leaf cards, enlarged about their centres to preserve coverage.
  const selected=[],centers=new Map();let card=0;
  for(let t=0;t<src.length;){
   const id=src[t],part=read(a.aMat,id),leaf=kind<2&&(part===1||part===4);
   const count=leaf?6:3;
   if(!far||!leaf||card%5===0){
    selected.push(...src.slice(t,t+count));
    if(far&&leaf){const ids=[...new Set(src.slice(t,t+6))];const c=[0,1,2].map(k=>ids.reduce((s,i)=>s+read(a.position,i,k),0)/ids.length);for(const i of ids)centers.set(i,c);}
   }
   if(leaf)card++;t+=count;
  }
  const used=[...new Set(selected)],remap=new Map(used.map((v,i)=>[v,i]));
  for(const i of used){
   const part=read(a.aMat,i),exposure=read(a.aMat,i,1),rand=read(a.aMat,i,2),leaf=kind<2&&(part===1||part===4);
   let pos=[0,1,2].map(k=>read(a.position,i,k));
   if(centers.has(i)){const c=centers.get(i);pos=pos.map((v,k)=>c[k]+(v-c[k])*1.65);}
   // Palm fronds are authored crown-local; the web vertex shader lifts them.
   if(kind===3&&part>0.5)pos[1]+=10;
   let material=leaf?6:(kind===2&&part>0.5?7:(kind===3&&part>0.5?8:5));
   const color=leaf?[.045+rand*.027,.105+rand*.055,.027+rand*.015]:part>0.5&&kind>=2?[.065,.18,.035]:[.18,.12,.068];
   const occlusion=leaf?.35+.65*exposure:1;
   vertices.push(...pos,...[0,1,2].map(k=>read(a.normal,i,k)),...color,read(a.uv,i),read(a.uv,i,1),material,
    .9,0,read(a.aMat,i,2),occlusion);
  }
  for(const i of selected)indices.push(remap.get(i));
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
 };
 for(const [name,g,kind] of [['tree',buildTreeNear().geometry,0],['shrub',buildShrubNear().geometry,1],['fern',buildFern().geometry,2],['palm',buildPalmNear().geometry,3]]){
  for(const far of [false,true]){
   const mesh=convert(name==='palm'&&far?buildPalmFar().geometry:g,kind,far);
   for(const [suffix,bytes] of Object.entries(mesh))await writeFile(new URL(`${name}-${far?'far':'near'}-${suffix}.bin`,dir),Buffer.from(bytes.buffer));
  }
 }
 const ocean=new OceanFFT(null);await GPU.pipelinesReady();ocean.update(0);GPU.submit();
 for(const name of ['h0','waveData'])await writeFile(new URL(`ocean-${name}.bin`,dir),Buffer.from(await readBuffer(ocean[name],ocean[name].byteLength)));
 for(const [name,t] of [['displacement',ocean.displacementTexture],['derivatives',ocean.derivativeTexture]]){
  const layers=[];for(let layer=0;layer<4;layer++)layers.push(Buffer.from((await readTexture(t,{layer})).data));
  await writeFile(new URL(`reference-${name}.bin`,dir),Buffer.concat(layers));
 }
 ocean.params.upload();await writeFile(new URL('ocean-params.bin',dir),Buffer.from(ocean.params.data));
 // Keep the original two-dispatch, workgroup-memory IFFT, with only native
 // bindings and frame-dt adapted. No duplicated spectrum implementation.
 const kernels=[['rows',ocean.rowKernel],['columns',ocean.columnKernel],...ocean.mipKernelsA.map((k,i)=>[`mip-a-${i}`,k]),...ocean.mipKernelsB.map((k,i)=>[`mip-b-${i}`,k])];
 const manifest=[];
 for(const [name,k] of kernels){
  let body=k.source.slice(k.source.indexOf(name.startsWith('mip-')?'var<workgroup>':'const FFT_N'));
  body=body.replaceAll('frame.dt','ocean.dt');
  let declarations=(k.bindings.names.includes('ocean')?ocean.params.wgsl:'').replace('seed: u32,','seed: u32,\n dt: f32,');
  declarations+='\n'+k.bindings.declarations(0)+'\nfn sat(x:f32)->f32{return clamp(x,0.,1.);}\n';
  await writeFile(new URL(`ocean-${name}.wgsl`,dir),declarations+body);
  manifest.push({name,bindings:k.bindings.names});
 }
 await writeFile(new URL('ocean-kernels.json',dir),JSON.stringify(manifest));
 const error=await GPU.device.popErrorScope();if(error)throw new Error(error.message);
 await writeFile(new URL('complete.json',dir),JSON.stringify({version:2}));
 console.log('Native rendering: original leaf atlas, botanical meshes, PBR textures and four-cascade JONSWAP FFT exported.');
}
