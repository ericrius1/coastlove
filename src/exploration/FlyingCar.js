// The enchantment keeps the same car and its momentum through takeoff/landing.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const FLIGHT_TUNING=Object.freeze({maxSpeed:46,boostSpeed:68,reverseSpeed:10,acceleration:16,climbSpeed:18,maxAltitude:6000});

export function liftCar(car){
 const sx=Math.sin(car.heading),sz=Math.cos(car.heading);
 car.motion ||= {vx:sx*car.speed,vz:sz*car.speed,vy:0,grounded:true,airtime:0,steer:0,lastSafe:null};
 car.motion.grounded=false;
 car.flight={phase:'flying',vy:Math.max(0,car.motion.vy),takeoffY:car.position.y+8,target:null,exitAfterLanding:false};
}

// world.floor includes the car's footprint; swept collision checks protect both
// horizontal travel and vertical movement through roofs, trees and bridges.
export function stepFlyingCar(car,dt,control,world){
 dt=clamp(dt,0,.05);
 const f=car.flight;if(!f)return false;
 const t=FLIGHT_TUNING,m=car.motion;
 let vx=0,vz=0,targetVy=0;
 if(f.phase==='landing'){
  const dx=f.target.x-car.position.x,dz=f.target.z-car.position.z,d=Math.hypot(dx,dz);
  const speed=Math.min(10,d*2);
  if(d>.001){vx=dx/d*speed;vz=dz/d*speed;}
  // Reach the open landing footprint before descending toward street level.
  const y=d>1?Math.max(f.target.y+5,car.position.y):f.target.y;
  targetVy=clamp((y-car.position.y)*1.8,-14,10);
  car.speed=vx*Math.sin(car.heading)+vz*Math.cos(car.heading);
  m.steer*=Math.exp(-dt*8);
 }else{
  const throttle=clamp(control.throttle||0,-1,1),limit=control.boost?t.boostSpeed:t.maxSpeed;
  m.steer+=(clamp(control.steer||0,-1,1)-m.steer)*(1-Math.exp(-dt*8));
  car.heading+=m.steer*1.05*dt;
  car.speed=clamp(car.speed+throttle*t.acceleration*dt,-t.reverseSpeed,Math.max(limit,car.speed));
  if(!throttle)car.speed*=Math.exp(-dt*.42);
  const sx=Math.sin(car.heading),sz=Math.cos(car.heading);
  vx=sx*car.speed;vz=sz*car.speed;
  const ahead=Math.max(12,Math.abs(car.speed)*1.1),direction=car.speed<0?-1:1;
  const clearance=world.clearance?.(car.position.x,car.position.z,car.position.x+sx*ahead*direction,car.position.z+sz*ahead*direction)??world.floor(car.position.x,car.position.z,car.heading)+6;
  targetVy=clamp(control.vertical||0,-1,1)*t.climbSpeed;
  const hoverY=Math.max(clearance+2,f.takeoffY??-Infinity);
  if(car.position.y<hoverY)targetVy=Math.max(targetVy,clamp((hoverY-car.position.y)*2,0,t.climbSpeed));
  if(f.takeoffY!==null&&car.position.y>=f.takeoffY-.15)f.takeoffY=null;
 }
 f.vy+=(targetVy-f.vy)*(1-Math.exp(-dt*5));
 const steps=Math.max(1,Math.ceil(Math.hypot(vx,vz,f.vy)*dt/.45)),sub=dt/steps;
 for(let i=0;i<steps;i++){
  const x=car.position.x+vx*sub,z=car.position.z+vz*sub;
  const floor=world.floor(x,z,car.heading);
  const y=Math.min(t.maxAltitude,car.position.y+f.vy*sub);
  if(y<floor-.01||world.collide(x,y,z,car.heading)){
   // Stop before the obstruction; rising in place remains possible.
   vx=vz=0;car.speed=0;car.impact=1;
   const upY=Math.min(t.maxAltitude,car.position.y+Math.max(0,f.vy)*sub);
   if(!world.collide(car.position.x,upY,car.position.z,car.heading))car.position.y=upY;
   else f.vy=0;
  }else car.position.set(x,Math.max(floor,y),z);
 }
 m.vx=vx;m.vz=vz;m.vy=f.vy;m.grounded=false;m.airtime+=dt;
 const pitch=-Math.atan2(f.vy,Math.max(20,Math.abs(car.speed))),roll=-m.steer*.23;
 car.pitch+=(clamp(pitch,-.45,.45)-car.pitch)*(1-Math.exp(-dt*4));
 car.roll+=(roll-car.roll)*(1-Math.exp(-dt*5));car.steer=m.steer*.25;
 if(f.phase==='landing'&&Math.hypot(car.position.x-f.target.x,car.position.z-f.target.z)<.12&&Math.abs(car.position.y-f.target.y)<.12){
  car.position.copy(f.target);car.speed=0;m.vx=m.vz=m.vy=0;m.grounded=true;m.airtime=0;
  m.lastSafe={x:car.position.x,y:car.position.y,z:car.position.z,heading:car.heading};
  car.flight=null;car.landing=.3;return true;
 }
 return false;
}
