import {Mesh,BufferGeometry,Float32BufferAttribute,Vector3} from '../engine/index.js';
import {prepare,mergePrepared,box,mat4} from '../world/boat/GeoKit.js';
import {createPropMaterial} from '../game/GameMaterials.js';
import {project} from './Geography.js';
// Optional fictional stunt props, built in metres on real terrain.
export class StuntRamps {
 constructor(app){
  this.ramps=[];const t=app.terrainData,parts=[];
  for(const[lon,lat]of[[-122.4476,37.7520],[-118.3711,34.1286],[-118.2991,34.1193]]){
   const p=project(lon,lat),near=t.streets.nearest(p.x,p.z,500);if(!near)continue;
   const r=near.route,pose=r.sample(near.s,1,0),heading=pose.heading;
   const x=pose.x+Math.cos(heading)*(r.width/2+4),z=pose.z-Math.sin(heading)*(r.width/2+4),sx=Math.sin(heading),sz=Math.cos(heading);
   const length=18,width=5,back=t.heightAt(x-sx*length/2,z-sz*length/2),front=Math.max(back,t.heightAt(x+sx*length/2,z+sz*length/2))+3.2;
   const ramp={x,z,heading,sx,sz,length,width,back,front};this.ramps.push(ramp);
   // The top is the same plane queried by the vehicle controller.
   const positions=[],indices=[];
   for(const[f,side,y]of[[-1,-1,back],[-1,1,back],[1,-1,front],[1,1,front]])positions.push(x+sx*f*length/2+sz*side*width/2,y+.03,z+sz*f*length/2-sx*side*width/2);
   indices.push(0,2,1,1,2,3);const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();parts.push(prepare(g,{color:0xbc8b4e,rough:.8}));
   for(let d=-6;d<=9;d+=3)for(const side of[-1,1]){
    const px=x+sx*d+sz*side*2.2,pz=z+sz*d-sx*side*2.2,ground=t.heightAt(px,pz),top=back+(front-back)*(d/length+.5),height=Math.max(.2,top-ground);
    parts.push(prepare(box(.22,height,.22),{color:0x847456,rough:.9,matrix:mat4(px,ground+height/2,pz,0,heading)}));
   }
   for(const side of[-1,1])parts.push(prepare(box(.15,1,1),{color:0xd2bd7d,matrix:mat4(x+sz*side*3,back+.5,z-sx*side*3,0,heading)}));
  }
  t.stuntRamps=this.ramps;
  if(parts.length){const m=createPropMaterial('Coastal stunt ramps');m.side='double';this.mesh=new Mesh(mergePrepared(parts),m);this.mesh.castShadow=true;app.scene.add(this.mesh);}
 }
}
export function rampHeight(r,x,z){const dx=x-r.x,dz=z-r.z,s=dx*r.sx+dz*r.sz,lateral=Math.abs(dx*r.sz-dz*r.sx);if(Math.abs(s)>r.length/2||lateral>r.width/2)return -Infinity;return r.back+(r.front-r.back)*(s/r.length+.5);}
