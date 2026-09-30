// One moving 4 km ground patch, sampled at 4 m. Work is spread across frames;
// texture and origin become visible together, so no half-built terrain can show.
export class LocalTerrain {

 constructor(app){
  this.app=app;this.res=1024;this.size=4096;this.center=null;this.pending=null;
  this.completed=null;this.spare=null;
  this.update({x:0,z:0},true);
 }

 update(position,force=false){
  const terrain=this.app.terrainData;
  // A terrain edit must never publish a patch assembled from two revisions.
  if(this.pending&&(force||this.pending.revision!==terrain.localRevision||this.pending.res!==this.res||this.pending.size!==this.size)){
   this.spare=this.pending;this.pending=null;
  }
  if(!this.pending&&(force||!this.center||Math.hypot(position.x-this.center.x,position.z-this.center.z)>640||this.revision!==terrain.localRevision||this.completed.res!==this.res||this.completed.size!==this.size)){
   const cx=Math.round(position.x/256)*256,cz=Math.round(position.z/256)*256;
   const res=this.res,size=this.size,x=cx-size/2,z=cz-size/2,step=size/res;
   const spare=this.spare;this.spare=null;
   const H=spare?.H.length===res*res?spare.H:new Float32Array(res*res);
   const data=spare?.data.length===res*res*4?spare.data:new Float32Array(res*res*4);
   const previous=this.completed;
   const shiftX=previous?(x-previous.x)/step:Infinity,shiftZ=previous?(z-previous.z)/step:Infinity;
   // Reuse only exactly aligned samples from the same terrain revision. A teleport or a
   // changed grid takes the normal full-sample path. Explicit force always rebuilds it.
   const source=!force&&previous&&previous.revision===terrain.localRevision&&previous.res===res&&previous.size===size&&Number.isInteger(shiftX)&&Number.isInteger(shiftZ)&&Math.abs(shiftX)<res&&Math.abs(shiftZ)<res?previous:null;
   this.pending={x,z,cx,cz,row:0,phase:0,res,size,H,data,revision:terrain.localRevision,source,shiftX,shiftZ};
  }
  const frame=this.pending;if(!frame)return;
  const start=performance.now(),N=frame.res,step=frame.size/N,H=frame.H,D=frame.data,source=frame.source;
  while(force||performance.now()-start<3){
   const j=frame.row,row=j*N,sourceRow=j+frame.shiftZ;
   if(frame.phase===0){
    let left=N,right=N;
    if(source&&sourceRow>=0&&sourceRow<N){
     left=Math.max(0,-frame.shiftX);right=Math.min(N,N-frame.shiftX);
     const first=sourceRow*N+left+frame.shiftX;
     H.set(source.H.subarray(first,first+right-left),row+left);
    }
    for(let i=0;i<left;i++)H[row+i]=terrain.heightAt(frame.x+(i+.5)*step,frame.z+(j+.5)*step);
    for(let i=right;i<N;i++)H[row+i]=terrain.heightAt(frame.x+(i+.5)*step,frame.z+(j+.5)*step);
   }else{
    let left=N,right=N;
    // Border normals use clamped neighbors. Recompute both old and new patch edges;
    // only interiors have the same four height samples after the origin shifts.
    if(source&&j>0&&j<N-1&&sourceRow>0&&sourceRow<N-1){
     left=Math.max(1,1-frame.shiftX);right=Math.min(N-1,N-1-frame.shiftX);
     if(right>left){
      const first=(sourceRow*N+left+frame.shiftX)*4;
      D.set(source.data.subarray(first,first+(right-left)*4),(row+left)*4);
     }else left=right=N;
    }
    for(let i=0;i<left;i++)this.writeNormal(frame,i,j,step);
    for(let i=right;i<N;i++)this.writeNormal(frame,i,j,step);
   }
   if(++frame.row===N){
    if(frame.phase===0){frame.phase=1;frame.row=0;}
    else{
     this.app.terrainGPU.setLocalTerrain(frame);
     this.center={x:frame.cx,z:frame.cz};this.revision=frame.revision;
     this.spare=this.completed;this.completed=frame;frame.source=null;this.pending=null;
     return;
    }
   }
  }
 }

 writeNormal(frame,i,j,step){
  const N=frame.res,H=frame.H,D=frame.data,k=j*N+i;
  const dx=(H[j*N+Math.min(N-1,i+1)]-H[j*N+Math.max(0,i-1)])/(2*step);
  const dz=(H[Math.min(N-1,j+1)*N+i]-H[Math.max(0,j-1)*N+i])/(2*step),n=Math.sqrt(1+dx*dx+dz*dz);
  D[k*4]=H[k];D[k*4+1]=-dx/n;D[k*4+2]=-dz/n;D[k*4+3]=Math.max(0,Math.min(1,(Math.hypot(dx,dz)-.2)*1.5));
 }

}
