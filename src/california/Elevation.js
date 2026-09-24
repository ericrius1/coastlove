// Decimetre DEM grids, resampled from the public Mapzen/Terrarium terrain tiles.
// Bilinear interpolation changes smoothness, never horizontal or vertical scale.
export const elevationGrids=[];
export async function loadElevation(read = async path => {
 const response=await fetch(`${import.meta.env.BASE_URL}geodata/${path}`);
 if(!response.ok)throw new Error(`Elevation ${path}: ${response.status}`);
 return path.endsWith('.json')?response.json():response.arrayBuffer();
}) {
 if(elevationGrids.length)return;
 const grids=await Promise.all(['sf','la','harbor','california'].map(async id=>{
  const [meta,buffer]=await Promise.all([read(`${id}-height.json`),read(`${id}-height.bin`)]);
  return {...meta,id,data:new Int16Array(buffer)};
 }));
 elevationGrids.push(...grids);
}
export function sampleElevation(x,z) {
 for(const g of elevationGrids){
  const u=(x-g.x)/g.step,v=(z-g.z)/g.step;
  if(u<0||v<0||u>=g.width-1||v>=g.height-1)continue;
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*g.width+i,D=g.data;
  return ((D[k]*(1-a)+D[k+1]*a)*(1-b)+(D[k+g.width]*(1-a)+D[k+g.width+1]*a)*b)*g.scale;
 }
 return -150;
}
