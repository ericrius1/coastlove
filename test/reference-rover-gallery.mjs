// Render the actual default vehicle from both exterior angles and its driving camera.
// node test/reference-rover-gallery.mjs [output directory]
import { mkdirSync } from 'node:fs';
import { setupLife } from './life-harness.mjs';
import { Mesh, PlaneGeometry, BoxGeometry, Vector3 } from '../src/engine/index.js';
import { Material } from '../src/engine/render/Material.js';
import { makeCar } from '../src/exploration/CarModel.js';
import { Traffic } from '../src/exploration/Traffic.js';

const out=process.argv[2]||'/tmp/coastlove-rover';mkdirSync(out,{recursive:true});
const L=await setupLife({W:1440,H:960,fov:42,near:.06,far:300,shadowSplits:[8,24,70],sun:[.45,.8,-.45]});
const floor=new Mesh(new PlaneGeometry(500,500).rotateX(-Math.PI/2),new Material({color:0xa6aca3,roughness:.95}));
floor.castShadow=true;L.scene.add(floor);L.sky=[.54,.68,.75,1];
const car=makeCar();L.scene.add(car.group);car.driver.visible=false;
car.group.traverse(o=>{if(o.isMesh&&o.material.transparent){o.layers.enable(0);o.userData.late=true;}});
for(const [name,position]of[['rear',[5.1,3.2,-6.3]],['front',[5.1,2.9,6.4]],['side',[7.6,2.6,-.2]]]){
 L.camera.position.set(...position);L.camera.lookAt(0,1.15,0);await L.run(3);await L.save(`${out}/${name}.png`);
}
const road=new Mesh(new BoxGeometry(8,.02,220),new Material({color:0x656e68,roughness:.98}));road.position.set(0,0,95);L.scene.add(road);
for(let z=5;z<100;z+=8){const stripe=new Mesh(new BoxGeometry(.11,.015,3.6),new Material({color:0xf0d696,roughness:.9}));stripe.position.set(-1,.015,z);L.scene.add(stripe);}
for(const x of[-10,10])for(let z=12;z<90;z+=12){const m=new Mesh(new BoxGeometry(3,4+(z%7),4),new Material({color:0x64745d,roughness:.95}));m.position.set(x,2,z);m.castShadow=true;L.scene.add(m);}
const traffic=Object.create(Traffic.prototype);traffic.cameraMode='driver';traffic.cockpitPitch=-.12;traffic.cockpitYaw=0;traffic.cameraTarget=new Vector3();traffic.cameraPosition=new Vector3();traffic.app={camera:L.camera};
car.position=car.group.position;car.setCockpit(true);car.setDriving(.10,18);
L.camera.fov=65;traffic.updateCamera(1/60,car,{});await L.run(3);await L.save(`${out}/driver.png`);
console.log('Actual web geometry:',out);process.exit(0);
