// Arcade handling in physical metres and seconds. NPCs retain their road driver.
// Vertical motion is ballistic: hills and ramps launch the car, then suspension
// catches the landing. No speed-dependent teleport to the terrain surface.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const CAR_TUNING=Object.freeze({maxSpeed:34,boostSpeed:55,reverseSpeed:12,acceleration:18,boostAcceleration:26,brake:30,gravity:18,wheelbase:2.64});
export function stepArcadeCar(car,dt,control,world){
 const t=CAR_TUNING;dt=Math.min(.05,dt);
 if(!car.motion)car.motion={vx:Math.sin(car.heading)*car.speed,vz:Math.cos(car.heading)*car.speed,vy:0,grounded:true,airtime:0,steer:0,lastSafe:null};
 const m=car.motion,throttle=control.throttle||0,brake=!!control.handbrake;
 m.steer+=(clamp(control.steer||0,-1,1)-m.steer)*(1-Math.exp(-dt*10));
 const sx=Math.sin(car.heading),sz=Math.cos(car.heading),rx=Math.cos(car.heading),rz=-Math.sin(car.heading);
 let forward=m.vx*sx+m.vz*sz,lateral=m.vx*rx+m.vz*rz;
 if(m.grounded){
  const limit=control.boost?t.boostSpeed:t.maxSpeed;
  const acceleration=throttle<0&&forward>1?t.brake:throttle>0&&forward< -1?t.brake:control.boost?t.boostAcceleration:t.acceleration;
  const previousSpeed=forward;
  forward+=(throttle>0&&forward>=limit?0:throttle)*acceleration*dt;
  if(!throttle)forward*=Math.exp(-dt*.22);
  if(brake)forward*=Math.exp(-dt*.9);
  forward=clamp(forward,-t.reverseSpeed,Math.max(limit,previousSpeed));
  // Real slopes contribute downhill momentum; steep terrain stays traversable.
  const a=world.height(car.position.x+sx*1.3,car.position.z+sz*1.3,car.position.y+4),b=world.height(car.position.x-sx*1.3,car.position.z-sz*1.3,car.position.y+4);
  forward-=clamp((a-b)/2.6,-1,1)*8*dt;
  lateral*=Math.exp(-dt*(brake?1.35:8.5));
  const turn=m.steer*(brake?2.05:1.45)*Math.min(1,Math.abs(forward)/8)*(forward<0?-1:1)/(1+Math.max(0,Math.abs(forward)-22)*.022);
  car.heading+=turn*dt;
  // A controlled amount of yaw retention creates a broad, recoverable drift.
  if(brake)lateral-=turn*forward*dt*.65;
 }else{
  car.heading+=m.steer*.48*dt;forward*=Math.exp(-dt*.035);m.vy-=t.gravity*dt;m.airtime+=dt;
 }
 const ns=Math.sin(car.heading),nc=Math.cos(car.heading);
 m.vx=ns*forward+nc*lateral;m.vz=nc*forward-ns*lateral;
 const startY=car.position.y,oldGround=world.height(car.position.x,car.position.z,car.position.y+4)+.11;
 const steps=Math.max(1,Math.ceil(Math.hypot(m.vx,m.vz)*dt/.6)),sub=dt/steps;
 for(let i=0;i<steps;i++){
  const x=car.position.x+m.vx*sub,z=car.position.z+m.vz*sub;
  const collision=world.collide(x,car.position.y,z,car.heading);
  if(collision){m.vx*=-.18;m.vz*=-.18;forward*=-.18;car.impact=1;break;}
  car.position.x=x;car.position.z=z;
 }
 const ground=world.height(car.position.x,car.position.z,car.position.y+4)+.11;
 if(m.grounded){
  const rise=(ground-oldGround)/Math.max(dt,.001),predicted=startY+m.vy*dt-t.gravity*dt*dt*.5;
  if(predicted>ground+.24&&Math.abs(forward)>8){m.grounded=false;m.airtime=0;car.position.y=predicted;m.vy-=t.gravity*dt;}
  else{car.position.y=ground;m.vy=clamp(rise,-35,35);}
 }else{
  car.position.y+=m.vy*dt;
  if(car.position.y<=ground&&m.vy<=Math.max(1,(ground-oldGround)/Math.max(dt,.001))){
   car.landing=Math.min(1,Math.abs(m.vy)/14);car.position.y=ground;m.grounded=true;m.vy=0;
  }
 }
 if(m.grounded&&ground>1&&Math.abs(forward)<30)m.lastSafe={x:car.position.x,y:car.position.y,z:car.position.z,heading:car.heading};
 const sample=(f,r=0)=>world.height(car.position.x+ns*f+nc*r,car.position.z+nc*f-ns*r,car.position.y+5);
 const targetPitch=m.grounded?-Math.atan2(sample(1.32)-sample(-1.32),2.64):-Math.atan2(m.vy,Math.max(12,Math.abs(forward)));
 const targetRoll=m.grounded?Math.atan2(sample(0,.85)-sample(0,-.85),1.7)+m.steer*Math.min(.09,Math.abs(forward)*.003):m.steer*.12;
 car.pitch+=(clamp(targetPitch,-1.1,1.1)-car.pitch)*(1-Math.exp(-dt*(m.grounded?12:3)));
 car.roll+=(clamp(targetRoll,-.65,.65)-car.roll)*(1-Math.exp(-dt*8));
 car.speed=m.vx*ns+m.vz*nc;car.steer=m.steer*.42;car.landing=(car.landing||0)*Math.exp(-dt*9);
 return m;
}
