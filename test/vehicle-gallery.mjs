// Render the actual web car geometry, including shadows and transparent glass.
// node test/vehicle-gallery.mjs [/tmp/coastlove-vehicle-gallery.png]
import { writeFileSync } from 'node:fs';
import { setupLife } from './life-harness.mjs';
import { writePNG } from './headless.mjs';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { Mesh, PlaneGeometry } from '../src/engine/index.js';
import { Material } from '../src/engine/render/Material.js';
import { makeCar } from '../src/exploration/CarModel.js';

const output=process.argv[2]||'/tmp/coastlove-vehicle-gallery.png';
const W=560,H=400,columns=4,rows=2;
const L=await setupLife({W,H,fov:37,far:100,shadowSplits:[12,35,70]});
const floor=new Mesh(new PlaneGeometry(100,100).rotateX(-Math.PI/2),new Material({color:0xc6beb0,roughness:.93}));
floor.castShadow=true;L.scene.add(floor);L.sky=[.64,.69,.73,1];
L.camera.position.set(4.4,2.7,5.3);L.camera.lookAt(0,.95,0);
const rgba=new Uint8Array(W*columns*H*rows*4),report=[];
for(let seed=0;seed<8;seed++){
 const car=makeCar(seed);L.scene.add(car.group);
 car.group.traverse(o=>{if(o.isMesh&&o.material.transparent){o.layers.enable(0);o.userData.late=true;}});
 await L.run(3);
 const pixels=new Uint8Array((await readTexture(L.ldr.texture)).data);
 const column=seed%columns,row=Math.floor(seed/columns);
 for(let y=0;y<H;y++)rgba.set(pixels.subarray(y*W*4,(y+1)*W*4),((row*H+y)*W*columns+column*W)*4);
 report.push({seed,name:car.name||car.group.name,variant:car.variant,draws:L.mr.stats});
 L.scene.remove(car.group);car.dispose?.();
}
writePNG(output,W*columns,H*rows,rgba);
writeFileSync(output.replace(/\.png$/,'.json'),JSON.stringify(report,null,2));
console.log('Rendered eight drivable car families:',output);
process.exit(0);
