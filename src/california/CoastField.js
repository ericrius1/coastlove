import { COAST_RINGS } from './Coastline.js';
import { REGION } from './Region.js';
export const COAST_FIELD_RES = 4096;
const N=COAST_FIELD_RES, SIZE=REGION.size, HALF=SIZE/2, STEP=SIZE/N, REACH=1600;
let field;
// Scan-line fill + a narrow distance band. Work follows shoreline length rather
// than testing every map pixel against every segment. The band extends well
// beyond the 10-mile inland corridor; deep inland / open ocean need no detail.
export function buildCoastField() {
 if(field)return field;
 const edges=[], rows=Array.from({length:N},()=>[]);
 for(const ring of COAST_RINGS)for(let i=0;i<ring.length-1;i++){
  const [ax,az]=ring[i],[bx,bz]=ring[i+1];if(ax===bx&&az===bz)continue;
  edges.push([ax,az,bx,bz]);
  const lo=Math.max(0,Math.ceil((Math.min(az,bz)+HALF)/STEP-.5)),hi=Math.min(N-1,Math.floor((Math.max(az,bz)+HALF)/STEP-.5));
  if(az!==bz)for(let j=lo;j<=hi;j++){const z=-HALF+(j+.5)*STEP;if((az>z)!==(bz>z))rows[j].push(ax+(bx-ax)*(z-az)/(bz-az));}
 }
 field=new Float32Array(N*N).fill(REACH*REACH);
 for(const [ax,az,bx,bz] of edges){
  const dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz;
  const i0=Math.max(0,Math.floor((Math.min(ax,bx)-REACH+HALF)/STEP)),i1=Math.min(N-1,Math.ceil((Math.max(ax,bx)+REACH+HALF)/STEP));
  const j0=Math.max(0,Math.floor((Math.min(az,bz)-REACH+HALF)/STEP)),j1=Math.min(N-1,Math.ceil((Math.max(az,bz)+REACH+HALF)/STEP));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const x=-HALF+(i+.5)*STEP,z=-HALF+(j+.5)*STEP,u=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len2));
   const distance=(x-ax-u*dx)**2+(z-az-u*dz)**2,k=j*N+i;
   if(distance<field[k])field[k]=distance;
  }
 }
 for(let j=0;j<N;j++){
  const crossings=rows[j].sort((a,b)=>a-b);let k=0,inside=false;
  for(let i=0;i<N;i++){const x=-HALF+(i+.5)*STEP;while(k<crossings.length&&crossings[k]<x){inside=!inside;k++;}field[j*N+i]=Math.sqrt(field[j*N+i])*(inside?-1:1);}
 }
 return field;
}
export function coastFieldAt(x,z){
 const data=buildCoastField(),u=Math.max(0,Math.min(N-1.001,(x+HALF)/SIZE*N-.5)),v=Math.max(0,Math.min(N-1.001,(z+HALF)/SIZE*N-.5));
 const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*N+i;
 return (data[k]*(1-a)+data[k+1]*a)*(1-b)+(data[k+N]*(1-a)+data[k+N+1]*a)*b;
}
