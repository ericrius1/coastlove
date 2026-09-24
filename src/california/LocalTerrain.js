// One moving 4 km ground patch, sampled at 4 m. Work is spread across frames;
// texture and origin become visible together, so no half-built terrain can show.
export class LocalTerrain {
 constructor(app){this.app=app;this.res=1024;this.size=4096;this.center=null;this.pending=null;this.update({x:0,z:0},true);}
 update(position,force=false){
  const t=this.app.terrainData;
  if(force)this.pending=null;
  if(!this.pending&&(force||!this.center||Math.hypot(position.x-this.center.x,position.z-this.center.z)>640||this.revision!==t.localRevision)){
   const cx=Math.round(position.x/256)*256,cz=Math.round(position.z/256)*256;
   this.pending={x:cx-this.size/2,z:cz-this.size/2,cx,cz,row:0,phase:0,res:this.res,size:this.size,H:new Float32Array(this.res*this.res),data:new Float32Array(this.res*this.res*4),revision:t.localRevision};
  }
  const f=this.pending;if(!f)return;const start=performance.now(),N=this.res,step=this.size/N,H=f.H,D=f.data;
  while(force||performance.now()-start<3){
   const j=f.row;
   if(f.phase===0){
    for(let i=0;i<N;i++)H[j*N+i]=t.heightAt(f.x+(i+.5)*step,f.z+(j+.5)*step);
   }else for(let i=0;i<N;i++){
    const k=j*N+i,dx=(H[j*N+Math.min(N-1,i+1)]-H[j*N+Math.max(0,i-1)])/(2*step),dz=(H[Math.min(N-1,j+1)*N+i]-H[Math.max(0,j-1)*N+i])/(2*step),n=Math.sqrt(1+dx*dx+dz*dz);
    D[k*4]=H[k];D[k*4+1]=-dx/n;D[k*4+2]=-dz/n;D[k*4+3]=Math.max(0,Math.min(1,(Math.hypot(dx,dz)-.2)*1.5));
   }
   if(++f.row===N){if(f.phase===0){f.phase=1;f.row=0;}else{this.app.terrainGPU.setLocalTerrain(f);this.center={x:f.cx,z:f.cz};this.revision=f.revision;this.pending=null;return;}}
  }
 }
}
