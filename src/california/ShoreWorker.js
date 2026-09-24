import { computeShoreField } from '../world/ShoreField.js';
self.onmessage=({data:{heights,size,res,x,z,id}})=>{
 const step=size/res,origin=-size/2;
 const terrain={size,origin,heightAt:(x,z)=>heights[Math.max(0,Math.min(res-1,Math.floor((z-origin)/step)))*res+Math.max(0,Math.min(res-1,Math.floor((x-origin)/step)))]};
 const field=computeShoreField(terrain,{res,swellDir:[-.12,-1]});
 // Use the same world-space wave clock as the statewide field. Moving the
 // local window must not restart the swell phase.
 const offset=(-.12*x-z)/Math.sqrt(9.81*25);
 for(let i=0;i<field.data.length;i+=4){field.data[i]+=offset;field.data[i+3]+=offset;}
 self.postMessage({data:field.data,res,size,x,z,id},[field.data.buffer]);
};
