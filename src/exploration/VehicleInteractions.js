import { Vector3 } from '../engine/index.js';
import { safeAt } from './Navigation.js';

// One E press owns exactly one interaction, before Player's legacy deck controls.
export class VehicleInteractions {
 constructor(exploration){this.e=exploration;this.app=exploration.app;}
 get available(){const app=this.app,hud=app.game.hud;return !this.e.paused&&!app.freeCam&&!hud?.invOpen&&!hud?.standOpen&&!hud?.catchOpen;}
 nearby(){
  const app=this.app,p=app.player;if(!this.available||!['walk','swim'].includes(p.mode))return null;
  const candidates=[],add=(kind,vehicle,point,reach,height)=>{const d=Math.hypot(point.x-p.position.x,point.z-p.position.z);if(d<reach&&Math.abs(point.y-p.position.y)<height)candidates.push({kind,vehicle,distance:d});};
  if(p.mode==='walk'){const car=this.e.traffic.nearest(p.position);if(car)add('car',car,car.position,5.2,2.8);}
  const b=app.boatCtl;
  for(const point of [b.model.boardPoint,...b.model.exitPoints])add('boat',b,b.toWorld(point,new Vector3()),4.5,3.5);
  const plane=this.e.plane;if(plane.parked&&plane.group.visible)add('plane',plane,plane.position,11,5);
  return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
 }
 prepare(){
  const app=this.app;app.game.cancelLine(true);app.game.rod.equip(false);app.player.busy=false;
  app.input.consumeLook();app.input.consumeWheel();
 }
 interact(){
  if(!this.available)return false;
  const app=this.app,p=app.player,b=app.boatCtl;
  if(this.e.traffic.active){this.e.traffic.exit();return true;}
  if(p.mode==='boat'||p.mode==='deck'){
   this.prepare();b.throttleTarget=0;p.exitBoat();
   app.game.toast(p.mode==='swim'?'In the water · E near the boat to take the helm':'Back ashore · E near the boat to take the helm');return true;
  }
  if(p.mode==='plane'){this.exitPlane();return true;}
  const nearby=this.nearby();if(!nearby)return false;
  this.prepare();
  if(nearby.kind==='car')this.e.traffic.enter(nearby.vehicle);
  else if(nearby.kind==='boat'){p.enterBoat();app.game.toast('At the helm · WASD drive · E get out');}
  else{
   const plane=this.e.plane,heading=plane.heading;
   b.driven=false;b.throttle=b.throttleTarget=0;app.audio?.engineStop();
   plane.launch(plane.position,heading);p.mode='plane';p.position.copy(plane.position);p.velocity.set(0,0,0);p._camY=null;
   app.game.toast('Marigold · back in the air · E lands and gets out');
  }
  return true;
 }
 landing(){
  const app=this.app,plane=this.e.plane,t=app.terrainData,c=app.colliders,origin=plane.position;
  // Keep an assisted landing local. Check the wings, floats and walking exit
  // against terrain and buildings before changing either vehicle or player.
  for(let r=0;r<=180;r+=12){
   const count=r?Math.ceil(Math.PI*2*r/18):1;
   for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2,x=origin.x+Math.sin(a)*r,z=origin.z+Math.cos(a)*r,water=t.heightAt(x,z)<-3;
    if(!safeAt(t,c,x,z,water,7))continue;
    if([[5,5],[-5,5],[5,-5],[-5,-5]].some(([dx,dz])=>!safeAt(t,c,x+dx,z+dz,water)))continue;
    for(const side of [1,-1]){
     const ex=x+Math.cos(plane.heading)*8.5*side,ez=z-Math.sin(plane.heading)*8.5*side;
     if(!safeAt(t,c,ex,ez,water))continue;
     const ground=Math.max(...[[0,0],[7,0],[-7,0],[0,7],[0,-7],[5,5],[-5,5],[5,-5],[-5,-5]].map(([dx,dz])=>t.heightAt(x+dx,z+dz)));
     if(!water&&ground+1.6-t.heightAt(ex,ez)>4.5)continue;
     return{position:new Vector3(x,water?1.6:ground+1.6,z),exit:new Vector3(ex,water?-.2:t.heightAt(ex,ez),ez),water};
    }
   }
  }
  return null;
 }
 exitPlane(){
  const spot=this.landing(),app=this.app,p=app.player;
  if(!spot){app.game.toast('No open landing spot below. Fly toward a beach or open water, then press E.');return false;}
  this.prepare();const plane=this.e.plane;plane.park(spot.position,plane.heading);
  p.mode=spot.water?'swim':'walk';p.position.copy(spot.exit);p.velocity.set(0,0,0);p.grounded=!spot.water;
  p.yaw=Math.atan2(p.position.x-plane.position.x,p.position.z-plane.position.z);p.pitch=-.05;p._camY=null;p.waterMean=spot.water?0:null;p.waterH=0;p.camOff=p.camOffV=0;
  app.game.toast(spot.water?'Water landing · E beside Marigold to fly again':'Landed · E beside Marigold to fly again');return true;
 }
 prompt(){
  if(!this.available)return null;
  const mode=this.app.player.mode;
  if(mode==='car')return{key:'E',text:'Get out of the car'};
  if(mode==='boat'||mode==='deck')return{key:'E',text:'Get out of the boat'};
  if(mode==='plane')return{key:'E',text:'Land and get out of Marigold'};
  const n=this.nearby();return n?{key:'E',text:n.kind==='car'?`Drive ${n.vehicle.name}`:n.kind==='boat'?'Board boat and take the helm':'Fly Marigold'}:null;
 }
}
