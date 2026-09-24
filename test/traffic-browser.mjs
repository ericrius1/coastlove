import { Vector3 } from '../src/engine/index.js';
import { safeAt } from '../src/exploration/Navigation.js';

export function checkTraffic(app){
 const e=app.exploration,t=e.traffic,p=app.player,input=app.input,results=[];
 const check=(ok,message)=>{if(!ok)throw new Error(message);results.push(message);};
 const saved={pos:p.position.clone(),mode:p.mode,yaw:p.yaw,pitch:p.pitch,free:app.freeCam,active:t.active,enabled:input.enabled,cam:app.camera.position.clone(),quat:app.camera.quaternion.clone(),time:t.time};
 const cars=t.cars.map(c=>({position:c.position.clone(),heading:c.heading,speed:c.speed,steer:c.steer,wait:c.wait,s:c.s,direction:c.direction,rejoin:c.rejoin,ignorePedUntil:c.ignorePedUntil}));
 const press=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));e.beforeUpdate();window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));input.endFrame();};
 try{
  input.enabled=true;app.freeCam=false;t.active=null;p.mode='walk';p.position.set(0,app.terrainData.heightAt(0,-900),-900);
  // Check actual village, boulders and props, not just the terrain heightfield.
  for(let s=0;s<t.route.length;s+=12)for(const direction of [-1,1]){const point=t.route.sample(s,direction);check(t.groundSafe(point.x,point.z,1.05),`road clear ${Math.round(s)}m / ${direction}`);}
  const starts=t.cars.map(c=>c.position.clone());
  for(let i=0;i<60*30;i++)t.update(1/60);
  for(const car of t.cars)check(car.position.distanceTo(starts[car.id])>10,`${car.name} drives in the actual world`);
  const car=t.cars[0];car.speed=0;car.wait=10;
  const x=car.position.x+Math.cos(car.heading)*2.4,z=car.position.z-Math.sin(car.heading)*2.4;
  p.position.set(x,app.terrainData.heightAt(x,z),z);
  press('KeyE');check(p.mode==='car'&&t.active===car,'E enters nearby NPC car');check(car.driver.position.x<0,'NPC rides as passenger');check(!app.boatCtl.driven&&!e.plane.group.visible,'exclusive car control');
  input.keys.add('KeyW');for(let i=0;i<100;i++)t.update(1/60);input.keys.clear();check(car.speed>3,'W accelerates');
  input.keys.add('Space');for(let i=0;i<60;i++)t.update(1/60);input.keys.clear();check(Math.abs(car.speed)<.01,'Space brakes');
  press('KeyE');check(p.mode==='walk'&&!t.active,'E gets out');check(safeAt(app.terrainData,app.colliders,p.position.x,p.position.z),'exit has full safe walking footprint');check(car.driver.position.x>0,'NPC returns to driver seat');
  p.position.set(0,20,-900);const before=car.position.clone();for(let i=0;i<60*6;i++)t.update(1/60);check(car.position.distanceTo(before)>5,'NPC drives away after exit');
  // Mode hotkeys and map travel must release ownership, not leave a ghost driver.
  p.position.copy(car.position).add(new Vector3(0,0,3));t.enter(car);press('Digit2');check(p.mode==='plane'&&!t.active,'2 releases car and takes flight');
  press('Digit3');e.visitCarStop();check(p.mode==='walk'&&!t.active,'car shortcut leaves player on foot');
  check(e.find('.exp-car-stop').textContent.includes('car'),'car shortcut is discoverable');
  check(!!t.nearest(p.position),'shortcut arrives beside an available car');
  press('KeyE');check(p.mode==='car'&&t.active.playerDriver.visible,'player appears at the wheel');
  press('Digit1');check(p.mode==='boat'&&!t.active,'1 releases car and takes boat');
  press('Digit3');
  return [results.length+' checks',...results.filter(r=>!r.startsWith('road clear'))];
 }finally{
  input.keys.clear();input.pressed.clear();input.consumeLook();input.enabled=saved.enabled;
  t.active=saved.active;t.time=saved.time;
  t.cars.forEach((c,i)=>{c.position.copy(cars[i].position);const {position,...rest}=cars[i];Object.assign(c,rest);c.driver.position.x=c===t.active?-.4:.4;c.playerDriver.visible=c===t.active;t.syncCollider(c);});
  p.position.copy(saved.pos);p.mode=saved.mode;p.yaw=saved.yaw;p.pitch=saved.pitch;p.velocity.set(0,0,0);p._camY=null;
  app.freeCam=saved.free;app.boatCtl.driven=false;e.plane.group.visible=p.mode==='plane';e.closeDialogue();e.toggleJournal(false);
  app.camera.position.copy(saved.cam);app.camera.quaternion.copy(saved.quat);t.cameraReady=false;
 }
}
