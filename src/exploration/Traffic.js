import {stepArcadeCar} from './ArcadeCar.js';
import { SETTLEMENTS } from '../california/Settlements.js';
import { Vector3, Euler, Color } from '../engine/index.js';
import { makeCar, CAR_NAMES } from './CarModel.js';
import { CoastalRoads } from '../california/CoastalRoads.js';
import { safeAt, findSafeSpot } from './Navigation.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const approach=(v,target,delta)=>v+clamp(target-v,-delta,delta);
const OFFSETS=[-1.35,0,1.35];

export class Traffic {
 constructor(app){
  this.app=app;this.terrain=app.terrainData;this.route=this.terrain.coastalRoute;this.cars=[];this.active=null;this.time=0;
  this.roads=new CoastalRoads(app.scene,this.terrain);
  this.headlight=app.localLights?.add({position:new Vector3(),color:new Color(1,.86,.60),intensity:0,range:42,dir:new Vector3(0,-.06,1),cosInner:.97,cosOuter:.9,kind:'carHeadlights'});
  this.cameraPosition=new Vector3();this.cameraTarget=new Vector3();this.cameraReady=false;this.orbit=0;this.orbitPitch=.32;
  const starts=[0,90,250,430,700,1000,1400,1800,2200,2600,3000,3400,3700,4000,4400,4800];
  for(let i=0;i<16;i++){
   const direction=i%2?-1:1,pose=this.route.sample(starts[i],direction),model=makeCar(i);
   const car={...model,id:i,name:CAR_NAMES[i%CAR_NAMES.length],route:this.route,position:model.group.position,heading:pose.heading,direction,s:pose.s,speed:0,steer:0,pitch:0,roll:0,wait:i===0?8:0,ignorePedUntil:0,rejoin:null,retry:0,spin:0};
   car.position.set(pose.x,(pose.y??this.terrain.heightAt(pose.x,pose.z))+.11,pose.z);
   car.group.rotation.y=car.heading;app.scene.add(car.group);
   car.collider=app.colliders.addBox(car.position.clone().add(new Vector3(0,.85,0)),new Vector3(.95,.8,2.15),car.heading,{tag:`traffic:${i}`});
   this.cars.push(car);this.syncCollider(car);
  }
 }

 // Static checks share the walking collision world, but traffic is tested
 // separately so a vehicle never collides with its own moving collider.
 groundSafe(x,z,radius=1.05){
  const h=this.terrain.groundHeight?.(x,z)??this.terrain.heightAt(x,z),edge=this.terrain.size/2-80;
  if(h<1.8||Math.abs(x)>edge||Math.abs(z)>edge)return false;
  for(const [dx,dz]of[[radius,0],[-radius,0],[0,radius],[0,-radius]])if(Math.abs((this.terrain.groundHeight?.(x+dx,z+dz)??this.terrain.heightAt(x+dx,z+dz))-h)>radius*.60)return false;
  const p=new Vector3(x,h+.25,z);
  return !this.app.colliders.resolveCapsule(p,radius,1.35,0,'traffic:');
 }
 canMove(car,x,z,heading,people=true){
  for(const d of OFFSETS){
   const px=x+Math.sin(heading)*d,pz=z+Math.cos(heading)*d;
   if(!this.groundSafe(px,pz,.95))return false;
   for(const other of this.cars){
    if(other===car||Math.hypot(other.position.x-x,other.position.z-z)>6)continue;
    for(const od of OFFSETS)if(Math.hypot(px-other.position.x-Math.sin(other.heading)*od,pz-other.position.z-Math.cos(other.heading)*od)<1.85)return false;
   }
   if(people){
    const p=this.app.player;
    if(p.mode==='walk'&&!this.app.freeCam&&Math.abs(p.position.y-car.position.y)<3&&Math.hypot(px-p.position.x,pz-p.position.z)<1.45)return false;
    for(const resident of this.app.exploration?.life.residents||[])if(Math.abs(resident.position.y-car.position.y)<3&&Math.hypot(px-resident.position.x,pz-resident.position.z)<1.5)return false;
   }
  }return true;
 }
 nearest(position){
  let result=null,best=5.2;
  for(const car of this.cars){const d=Math.hypot(car.position.x-position.x,car.position.z-position.z);if(d<best&&Math.abs(car.position.y-position.y)<2.8){best=d;result=car;}}
  return result;
 }
 enter(car){
  if(!car||this.active)return false;
  const app=this.app,p=app.player;
  if(p.mode!=='walk'||app.freeCam||p.position.distanceTo(car.position)>5.5)return false;
  app.game.cancelLine(true);app.game.rod.equip(false);app.game.hud?.closeStand();app.game.hud?.toggleInventory(false);
  app.exploration.closeDialogue();app.exploration.toggleJournal(false);app.exploration.plane.group.visible=app.exploration.plane.parked;
  if(app.boatCtl.driven)app.audio?.engineStop();app.boatCtl.driven=false;app.boatCtl.throttle=app.boatCtl.throttleTarget=0;
  this.active=car;car.motion=null;this.trackpadSteer=0;car.rejoin=null;car.wait=0;this.cameraReady=false;this.orbit=0;this.orbitPitch=.32;
  car.driver.position.x=-.4;car.playerDriver.visible=true; // the local driver rides along while you take the wheel
  p.mode='car';p.busy=false;p.velocity.set(0,0,0);p.position.copy(car.position);p._camY=null;
  app.input.consumeLook();app.game.toast(`${car.name} · WASD / trackpad steer · Shift boost · Space drift · E get out`);return true;
 }
 exit(){
  const car=this.active;if(!car)return false;
  const app=this.app;let spot=null;
  const exitTerrain={size:this.terrain.size,heightAt:(x,z)=>this.terrain.groundHeight?.(x,z,car.position.y+2)??this.terrain.heightAt(x,z)};
  for(const side of [1,-1]){
   const x=car.position.x+Math.cos(car.heading)*side*2.35,z=car.position.z-Math.sin(car.heading)*side*2.35;
   if(safeAt(exitTerrain,app.colliders,x,z)) {spot=new Vector3(x,exitTerrain.heightAt(x,z),z);break;}
  }
  spot ||= findSafeSpot(exitTerrain,app.colliders,car.position.x,car.position.z,false,16);
  if(!spot){app.game.toast('No room to get out here. Move to an open shoulder.');return false;}
  const heading=car.heading;this.release();
  const p=app.player;p.mode='walk';p.position.copy(spot);p.velocity.set(0,0,0);p.yaw=heading+Math.PI;p.pitch=-.05;p.grounded=true;p._camY=null;p.waterMean=null;p.camOff=p.camOffV=0;
  app.input.consumeLook();app.game.toast('Back on foot · your driver will take it from here');return true;
 }
 release(){
  const car=this.active;if(!car)return;
  this.active=null;car.motion=null;car.speed=0;car.wait=2;car.ignorePedUntil=this.time+7;car.driver.position.x=.4;car.playerDriver.visible=false;
  const near=car.route.nearest(car.position.x,car.position.z,true),forward=car.route.sample(near.s,1);
  car.direction=Math.abs(angle(forward.heading-car.heading))<Math.PI/2?1:-1;car.s=near.s;car.retry=0;
  car.rejoin=near.distance>5?this.planReturn(car,near):null;this.cameraReady=false;
 }
 findCarStop(){
  this.populate(true);
  const ordered=[...this.cars].sort((a,b)=>a.position.distanceTo(this.app.player.position)-b.position.distanceTo(this.app.player.position));
  for(const car of ordered)for(const side of [1,-1]){
   const x=car.position.x+Math.cos(car.heading)*side*3.4,z=car.position.z-Math.sin(car.heading)*side*3.4;
   if(!safeAt(this.terrain,this.app.colliders,x,z))continue;
   car.speed=0;car.wait=8;this.stopCar=car;
   return new Vector3(x,this.terrain.heightAt(x,z),z);
  }
  return null;
 }

 // The same small pool follows the explored region. A car can only be recycled
 // beyond the local streets; the occupied car and nearby drivers stay physical.
 populate(force=false){
  const player=this.app.player.position;
  if(!force&&this.time<(this.populationTime||0))return;
  this.populationTime=this.time+1;
  const town=SETTLEMENTS.filter(t=>Math.hypot(t.x-player.x,t.z-player.z)<t.radius+300).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
  let route=this.terrain.streets?.nearest(player.x,player.z,500)?.route||town?.route;
  // Keep the harbor fleet on its established loop where it meets the highway.
  // Mixing opposite lanes from two overlapping routes can trap the drivers.
  if(!route&&Math.hypot(player.x,player.z)<1700)route=this.route;
  if(!route){
   const routes=[this.route,this.terrain.highway].filter(Boolean);
   route=routes.sort((a,b)=>a.nearest(player.x,player.z,true).distance-b.nearest(player.x,player.z,true).distance)[0];
  }
  const near=route.nearest(player.x,player.z,true);if(near.distance>1200)return;
  const count=town&&!town.major?10:16;
  const localRoutes=route.street?this.terrain.streets.nearbyRoutes(player.x,player.z,450).filter(r=>r.name&&r.kind!=='service'&&r.length>30):null;
  for(const car of this.cars){
   if(car===this.active||car.position.distanceTo(player)<(car.route===route?1800:500)||car.id>=count)continue;
   const spawnRoute=localRoutes?.length?localRoutes[(car.id*31)%localRoutes.length]:route;
   const direction=spawnRoute.one||(car.id%2?-1:1),offset=spawnRoute.length<2500?spawnRoute.length*(car.id+.5)/count:(car.id-7.5)*70;
   const pose=spawnRoute.sample(spawnRoute.street?spawnRoute.length*(.2+(car.id%5)*.13):near.s+offset,direction);
   if(Math.hypot(pose.x-player.x,pose.z-player.z)<(town?Math.min(70,town.radius*.35):70)||!this.groundSafe(pose.x,pose.z,1.2)||!this.canMove(car,pose.x,pose.z,pose.heading))continue;
   car.route=spawnRoute;car.position.set(pose.x,(pose.y??this.terrain.heightAt(pose.x,pose.z))+.11,pose.z);car.heading=pose.heading;car.direction=direction;car.s=pose.s;car.speed=0;car.wait=0;car.rejoin=null;car.retry=0;this.syncCollider(car);
  }
 }

 // A bounded local A* gets NPCs back to the road after an off-road outing.
 // No teleporting: if there is no safe route they wait in the car and retry.
 planReturn(car,near){
  const step=6,start={x:car.position.x,z:car.position.z},goal=car.route.sample(near.s,car.direction);
  const gx=Math.round((goal.x-start.x)/step),gz=Math.round((goal.z-start.z)/step);
  const key=(x,z)=>`${x},${z}`,open=[{x:0,z:0,g:0,f:Math.hypot(gx,gz),parent:null}],cost=new Map([['0,0',0]]);
  let end=null;
  for(let n=0;open.length&&n<2200;n++){
   let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;
   const node=open.splice(best,1)[0];
   if(Math.hypot(node.x-gx,node.z-gz)<1.5){end=node;break;}
   for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const x=node.x+dx,z=node.z+dz;if(Math.abs(x)>90||Math.abs(z)>90)continue;
    const g=node.g+Math.hypot(dx,dz),k=key(x,z);if(g>=(cost.get(k)??Infinity))continue;
    const wx=start.x+x*step,wz=start.z+z*step;
    if(!this.groundSafe(wx,wz,1.6)||!this.groundSafe(wx-dx*step*.5,wz-dz*step*.5,1.6))continue;
    cost.set(k,g);open.push({x,z,g,f:g+Math.hypot(x-gx,z-gz),parent:node});
   }
  }
  if(!end)return [];
  const path=[goal];while(end.parent){path.unshift({x:start.x+end.x*step,z:start.z+end.z*step});end=end.parent;}return path;
 }
 npcControls(car,dt){
  car.wait=Math.max(0,car.wait-dt);car.retry-=dt;
  let near=car.route.nearest(car.position.x,car.position.z);
  if(!Number.isFinite(near.distance))near=car.route.nearest(car.position.x,car.position.z,true);
  if(!car.rejoin&&near.distance>9)car.rejoin=this.planReturn(car,near);
  if(car.rejoin?.length===0){if(car.retry<=0){car.rejoin=this.planReturn(car,near);car.retry=4;}return{target:0,steer:0};}
  let aim;
  if(car.rejoin){
   while(car.rejoin.length&&Math.hypot(car.position.x-car.rejoin[0].x,car.position.z-car.rejoin[0].z)<6)car.rejoin.shift();
   if(!car.rejoin.length)car.rejoin=null;else aim=car.rejoin[0];
  }
  car.s=near.s;
  if(car.route.street&&!car.rejoin&&((car.direction>0&&car.s>car.route.length-9)||(car.direction<0&&car.s<9))){
   const next=this.terrain.streets.next(car.route,car.direction,car.id+Math.floor(this.time/7));
   car.route=next.route;car.direction=next.direction;car.s=next.direction>0?0:next.route.length;
  }
  const ahead=7+Math.abs(car.speed)*.72;
  aim ||= car.route.sample(car.s+car.direction*ahead,car.direction);
  const dx=aim.x-car.position.x,dz=aim.z-car.position.z,error=angle(Math.atan2(dx,dz)-car.heading);
  let target=(car.rejoin?6:10+car.id%4)/(1+Math.abs(error)*2.8);
  const p=this.app.player,distance=p.position.distanceTo(car.position);
  if(car.wait>0||p.mode==='walk'&&!this.app.freeCam&&distance<9&&this.time>car.ignorePedUntil)target=0;
  // Anticipate obstructions far enough ahead to brake smoothly.
  const probe=3+car.speed*.85;
  if(!this.canMove(car,car.position.x+Math.sin(car.heading)*probe,car.position.z+Math.cos(car.heading)*probe,car.heading))target=0;
  return {target,steer:clamp(Math.atan2(2*2.64*Math.sin(error),Math.max(3,Math.hypot(dx,dz))),-.65,.65)};
 }
 update(dt,paused=false){
  dt=Math.min(dt,.05);this.time+=dt;
  const app=this.app,input=app.input,p=app.player,active=this.active;
  const frozen=paused||!input.enabled||app.freeCam;
  if(!frozen)this.populate();
  for(const car of this.cars){
   const driven=car===active;
   if(!driven&&car.position.distanceTo(p.position)>1900){
    car.group.visible=false;car.collider.solid=false;
    if(!frozen){const pose=car.route.sample(car.s+car.direction*(10+car.id%4)*dt,car.direction);car.s=pose.s;car.heading=pose.heading;car.position.set(pose.x,(pose.y??this.terrain.heightAt(pose.x,pose.z))+.11,pose.z);}
    continue;
   }
   car.collider.solid=true;
   if(driven&&!frozen){this.driveArcade(car,dt,input);continue;}
   let target=0,steer=0,brake=false;
   if(!frozen){
    if(driven){
     target=input.down('KeyW')?(input.down('ShiftLeft')||input.down('ShiftRight')?34:26):input.down('KeyS')?-6:0;
     steer=(Number(input.down('KeyA'))-Number(input.down('KeyD')))*(.60/(1+Math.abs(car.speed)*.035));
     brake=input.down('Space');if(brake)target=0;
    }else({target,steer}=this.npcControls(car,dt));
   }
   const rate=brake?19:frozen?18:target*car.speed<0||Math.abs(target)<Math.abs(car.speed)?(driven&&!input.down('KeyS')?2.2:9):driven?5.2:3;
   car.speed=approach(car.speed,target,rate*dt);car.steer+=(steer-car.steer)*(1-Math.exp(-dt*7));
   const steps=Math.max(1,Math.ceil(Math.abs(car.speed)*dt/.45)),sub=dt/steps;
   for(let i=0;i<steps&&Math.abs(car.speed)>.001;i++){
    const heading=car.heading+car.speed/2.64*Math.tan(car.steer)*sub;
    const x=car.position.x+Math.sin(heading)*car.speed*sub,z=car.position.z+Math.cos(heading)*car.speed*sub;
    if(!this.canMove(car,x,z,heading)){car.speed=0;break;}
    car.heading=heading;car.position.x=x;car.position.z=z;
   }
   const h=this.terrain.groundHeight?.(car.position.x,car.position.z)??this.terrain.heightAt(car.position.x,car.position.z);
   car.position.y=h+.11;
   const sample=(forward,right=0)=>this.terrain.heightAt(car.position.x+Math.sin(car.heading)*forward+Math.cos(car.heading)*right,car.position.z+Math.cos(car.heading)*forward-Math.sin(car.heading)*right);
   const pitch=-Math.atan2(sample(1.32)-sample(-1.32),2.64),roll=Math.atan2(sample(0,.85)-sample(0,-.85),1.7);
   car.pitch+=(pitch-car.pitch)*(1-Math.exp(-dt*10));car.roll+=(roll-car.roll)*(1-Math.exp(-dt*10));
   car.group.quaternion.setFromEuler(new Euler(car.pitch,car.heading,car.roll,'YXZ'));
   car.spin+=car.speed*dt/.365;for(const wheel of car.wheels){wheel.pivot.rotation.y=wheel.front?car.steer:0;wheel.mesh.rotation.x=car.spin;}
   const d=car.position.distanceTo(app.camera.position);car.group.visible=driven||d<1800;car.driver.visible=d<180;car.glass.visible=d<350;
   for(const wheel of car.wheels)wheel.pivot.visible=d<500;
   this.syncCollider(car);
  }
  const hour=app.settings?.timeOfDay??12,night=hour<6||hour>19;
  this.cars[0].lamps.material.emissiveIntensity=night?2:.08;
  if(this.headlight){this.headlight.intensity=active&&night?380:0;if(active){this.headlight.position.copy(active.position).add(new Vector3(Math.sin(active.heading)*2,.8,Math.cos(active.heading)*2));this.headlight.dir.set(Math.sin(active.heading),-.06,Math.cos(active.heading)).normalize();}}
  this.updateEngine(active);
  if(active){p.position.copy(active.position);p.yaw=active.heading+Math.PI;p.prompt={key:'E',text:`Get out of ${active.name}`};if(!app.freeCam)this.updateCamera(dt,active,input);}
 }
 async summon(ticket=null){
  const app=this.app,p=app.player;
  await app.realCities?.prepare(p.position);
  if(ticket!==null&&ticket!==app.exploration.modeTicket)return false;
  const near=this.terrain.streets?.nearestStreet(p.position.x,p.position.z,1500);
  const route=near?.route||this.route,at=near||route.nearest(p.position.x,p.position.z,true);
  const pose=route.sample(at.s,route.one||1);
  this.release();const car=this.cars[0];
  // Off-road selection stays with the player when no actual street is nearby.
  let x=near?pose.x:p.position.x,z=near?pose.z:p.position.z;
  if(!this.groundSafe(x,z,1.1)){const spot=findSafeSpot(this.terrain,app.colliders,x,z,false,200);if(!spot){app.game.toast('Find dry ground to call a car.');return false;}x=spot.x;z=spot.z;}
  car.position.set(x,this.terrain.groundHeight(x,z)+.11,z);car.heading=pose.heading;car.route=route;car.s=pose.s;car.speed=0;car.motion=null;car.rejoin=null;
  p.mode='walk';p.position.copy(car.position);this.syncCollider(car);this.enter(car);return true;
 }
 driveArcade(car,dt,input){
  const app=this.app,look=input.consumeLook();
  this.trackpadSteer=(this.trackpadSteer||0)*Math.exp(-dt*4)-look.x*.008;
  this.trackpadSteer=clamp(this.trackpadSteer,-1,1);
  this.orbitPitch=clamp(this.orbitPitch+look.y*.0015,.14,.8);
  const steer=input.captured?0:clamp(Number(input.down('KeyA'))-Number(input.down('KeyD'))+this.trackpadSteer,-1,1);
  stepArcadeCar(car,dt,{throttle:Number(input.down('KeyW'))-Number(input.down('KeyS')),steer,handbrake:input.down('Space'),boost:input.down('ShiftLeft')||input.down('ShiftRight')},{
   height:(x,z,maxY)=>this.terrain.groundHeight(x,z,maxY),
   collide:(x,y,z,heading)=>{
    for(const d of OFFSETS){const pos=new Vector3(x+Math.sin(heading)*d,y+.25,z+Math.cos(heading)*d);if(app.colliders.resolveCapsule(pos,.88,1.15,0,'traffic:'))return true;}
    for(const other of this.cars){if(other===car||Math.abs(other.position.y-y)>2)continue;if(Math.hypot(other.position.x-x,other.position.z-z)<3){other.speed*=.4;other.wait=.5;return true;}}
    return false;
   }
  });
  if(car.position.y< -2){const safe=car.motion.lastSafe;if(safe){car.position.set(safe.x,safe.y,safe.z);car.heading=safe.heading;car.motion=null;car.speed=0;app.game.toast('Back on dry ground · 4 calls your car to the nearest street');}}
  car.group.quaternion.setFromEuler(new Euler(car.pitch,car.heading,car.roll,'YXZ'));car.spin+=car.speed*dt/.365;
  for(const wheel of car.wheels){wheel.pivot.rotation.y=wheel.front?car.steer:0;wheel.mesh.rotation.x=car.spin;wheel.pivot.visible=true;}
  car.group.visible=true;car.driver.visible=true;car.glass.visible=true;this.syncCollider(car);
 }

 updateEngine(car){
  const audio=this.app.audio;if(!audio?.ctx)return;
  const ctx=audio.ctx;
  if(car&&!this.engine){
   const gain=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=400;gain.gain.value=0;
   filter.connect(gain);gain.connect(audio.master||ctx.destination);
   const oscillators=[1,2.01].map(ratio=>{const oscillator=ctx.createOscillator();oscillator.type='triangle';oscillator.frequency.value=48*ratio;oscillator.connect(filter);oscillator.start();return oscillator;});
   this.engine={gain,filter,oscillators};
  }
  if(!this.engine)return;
  const rpm=car?Math.abs(car.speed)/34:0,now=ctx.currentTime;
  this.engine.gain.gain.setTargetAtTime(car && !audio.muted ? .02+rpm*.022 : 0,now,.12);
  this.engine.filter.frequency.setTargetAtTime(250+rpm*800,now,.1);
  this.engine.oscillators.forEach((oscillator,i)=>oscillator.frequency.setTargetAtTime((42+rpm*92)*(i?2.01:1),now,.12));
 }
 syncCollider(car){
  const b=car.collider;b.center.copy(car.position);b.center.y+=.85;b.rotY=car.heading;b.cos=Math.cos(car.heading);b.sin=Math.sin(car.heading);b.top=b.center.y+b.half.y;b.bottom=b.center.y-b.half.y;
 }
 updateCamera(dt,car,input){
  const look=input.consumeLook();this.orbit-=look.x*.002;
  if(!look.x)this.orbit*=Math.exp(-dt*.65);
  this.orbitPitch=clamp(this.orbitPitch+look.y*.0015,.12,.85);
  const heading=car.heading+this.orbit,distance=8.5+Math.abs(car.speed)*.08;
  const focus=car.position.clone();focus.y+=1.1;
  this.cameraTarget.set(car.position.x-Math.sin(heading)*distance,car.position.y+1+Math.sin(this.orbitPitch)*distance,car.position.z-Math.cos(heading)*distance);
  this.cameraTarget.y=Math.max(this.cameraTarget.y,this.terrain.heightAt(this.cameraTarget.x,this.cameraTarget.z)+1.3);
  const ray=this.cameraTarget.clone().sub(focus),length=ray.length();ray.normalize();
  const hit=this.app.colliders.raycast(focus,ray,length,'traffic:');
  if(hit<length)this.cameraTarget.copy(focus).addScaledVector(ray,Math.max(1,hit-.4));
  if(!this.cameraReady){this.cameraPosition.copy(this.cameraTarget);this.cameraReady=true;}
  this.cameraPosition.lerp(this.cameraTarget,1-Math.exp(-dt*7));
  this.cameraPosition.y=Math.max(this.cameraPosition.y,this.terrain.heightAt(this.cameraPosition.x,this.cameraPosition.z)+.8);
  this.app.camera.position.copy(this.cameraPosition);
  this.app.camera.lookAt(car.position.x+Math.sin(car.heading)*2,car.position.y+1.0,car.position.z+Math.cos(car.heading)*2);
 }
}
