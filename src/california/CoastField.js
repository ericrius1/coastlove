import { COAST_RINGS } from './Coastline.js';
const SIZE=8192, N=512;
let field;
// Bake once. The runtime uses bilinear signed distances to the real polygon
// coastlines, retaining their layout without costly polygon queries per frame.
export function buildCoastField() {
 if(field)return field;
 field=new Float32Array(N*N);
 const edges=[];
 for(const ring of COAST_RINGS)for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  edges.push([a[0],a[1],b[0],b[1],b[0]-a[0],b[1]-a[1]]);
 }
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const x=-4096+(i+.5)*SIZE/N,z=-4096+(j+.5)*SIZE/N;
  let inside=false,best=Infinity;
  for(const [ax,az,bx,bz,dx,dz] of edges){
   if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
   const u=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
   best=Math.min(best,(x-ax-u*dx)**2+(z-az-u*dz)**2);
  }
  field[j*N+i]=Math.sqrt(best)*(inside?-1:1);
 }
 return field;
}
export function coastFieldAt(x,z){
 const data=buildCoastField(),u=Math.max(0,Math.min(N-1.001,(x+4096)/SIZE*N-.5)),v=Math.max(0,Math.min(N-1.001,(z+4096)/SIZE*N-.5));
 const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*N+i;
 return (data[k]*(1-a)+data[k+1]*a)*(1-b)+(data[k+N]*(1-a)+data[k+N+1]*a)*b;
}
