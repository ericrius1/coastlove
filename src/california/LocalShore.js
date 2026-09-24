// A camera-following 4 m shore field preserves the original surf resolution at
// every beach. Bake it off-thread; the statewide field remains the fallback.
export class LocalShore {
 constructor(app){
  this.app=app;this.center=null;this.pending=false;this.id=0;
  this.worker=new Worker(new URL('./ShoreWorker.js',import.meta.url),{type:'module'});
  this.worker.onmessage=({data})=>{this.pending=false;const p=app.player?.position||{x:0,z:0};if(Math.hypot(p.x-data.x,p.z-data.z)>800)return;app.terrainGPU.setNearShoreField(data);this.center={x:data.x,z:data.z};};
  this.worker.onerror=()=>{this.pending=false;this.failed=true;};
 }
 update(position){
  if(this.failed||this.pending||this.center&&Math.hypot(position.x-this.center.x,position.z-this.center.z)<280)return;
  const t=this.app.terrainData;if(Math.abs(t.coastDistance(position.x,position.z).d)>600||position.y>Math.max(0,t.heightAt(position.x,position.z))+220)return;
  const x=Math.round(position.x/128)*128,z=Math.round(position.z/128)*128,size=1024,res=256,step=size/res,heights=new Float32Array(res*res);
  for(let j=0;j<res;j++)for(let i=0;i<res;i++)heights[j*res+i]=t.heightAt(x-size/2+(i+.5)*step,z-size/2+(j+.5)*step);
  this.pending=true;this.worker.postMessage({heights,size,res,x,z,domainSize:t.size,id:++this.id},[heights.buffer]);
 }
}
