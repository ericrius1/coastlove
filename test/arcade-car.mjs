import assert from 'node:assert/strict';
import {stepArcadeCar} from '../src/exploration/ArcadeCar.js';
import {Vector3} from '../src/engine/index.js';
const car=()=>({position:new Vector3(0,10.11,-30),heading:0,speed:0,pitch:0,roll:0,steer:0});
const flat={height:()=>10,collide:()=>false};let c=car();for(let i=0;i<300;i++)stepArcadeCar(c,1/60,{throttle:1,boost:true},flat);assert.ok(c.speed>50&&c.position.z>120,'arcade acceleration at real distances');
const before=c.position.z;for(let i=0;i<60;i++)stepArcadeCar(c,1/60,{throttle:0},flat);assert.ok(c.position.z-before>35,'neutral map controls coast without freezing');
c=car();let airborne=false,landed=false,maxY=0;const ramp={height:(_x,z)=>z>=0&&z<=18?10+z*.2:10,collide:()=>false};
for(let i=0;i<420;i++){stepArcadeCar(c,1/60,{throttle:1},ramp);maxY=Math.max(maxY,c.position.y);if(!c.motion.grounded)airborne=true;else if(airborne)landed=true;}
assert.ok(airborne&&landed&&maxY>14,'ramp produces a ballistic jump and safe landing');
c=car();for(let i=0;i<180;i++)stepArcadeCar(c,1/60,{throttle:1},flat);const h=c.heading;for(let i=0;i<40;i++)stepArcadeCar(c,1/60,{throttle:1,steer:-1,handbrake:true},flat);assert.ok(c.heading<h-.5,'right steering turns toward camera screen right');assert.ok(Math.abs(c.motion.vx*Math.cos(c.heading)-c.motion.vz*Math.sin(c.heading))>1,'handbrake allows lateral drift');
c=car();for(let i=0;i<600;i++)stepArcadeCar(c,1/60,{throttle:1,boost:true},{...flat,collide:(_x,_y,z)=>z>30});assert.ok(c.position.z<=30,'substeps prevent tunnelling through a wall');
console.log('ok boost, coasting, ramp takeoff and landing, steering direction, drifting, collision substeps');
