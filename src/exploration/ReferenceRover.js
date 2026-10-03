import { Vector3 } from '../engine/index.js';
import { box, roundedBox, cylinder, sphere, torus, lathe, mat4, slab } from '../world/boat/GeoKit.js';

// Modelled from IMG_8605: the front and dashboard are inferred from the visible
// rear/left view. Coordinates are metres, +Z forward, +X the driver's side.
export const ROVER_SEED = 'coastlove:reference-rover';
export const ROVER_VARIANT = Object.freeze({
 seed:ROVER_SEED,id:'reference-rover',name:'Powder Blue Trail Rover',family:'rover',familyName:'Trail Rover',
 paint:0xb4ced1,paintName:'Powder Blue',roof:0x665d4c,roofName:'Open cage',trim:0x75674f,trimName:'Bronze',
 wheel:'offroad',wheelName:'Bronze beadlock',accessory:'expedition',accent:0xdca72d,stripe:'none',interior:0x303b38,driver:3,
});
const BRONZE=0x75674f,GOLD=0xdca72d,BLACK=0x202724,RUBBER=0x242827,BOLT=0xb8bcb0,TAU=Math.PI*2;

export function roverWheel(Builder,simple=false){
 const b=new Builder(),segments=simple?16:32;
 b.add(lathe([[.30,-.16],[.39,-.185],[.46,-.158],[.485,-.12],[.49,.12],[.46,.158],[.39,.185],[.30,.16]],segments),RUBBER,mat4(0,0,0,0,0,Math.PI/2),.92);
 for(const s of[-1,1]){
  b.add(cylinder(.31,.31,.022,segments),BLACK,mat4(s*.16,0,0,0,0,Math.PI/2),.72,.2);
  b.add(torus(.303,.024,6,segments),BRONZE,mat4(s*.184,0,0,0,Math.PI/2),.32,.65);
  b.add(cylinder(.115,.115,.05,16),BRONZE,mat4(s*.185,0,0,0,0,Math.PI/2),.32,.65);
  for(let i=0;i<5;i++){
   const a=i*TAU/5;
   b.add(roundedBox(.045,.072,.235,.012,1),BRONZE,mat4(s*.187,Math.sin(a)*.19,Math.cos(a)*.19,-a),.35,.62);
   if(!simple)b.add(cylinder(.018,.018,.009,6),BOLT,mat4(s*.216,Math.sin(a)*.084,Math.cos(a)*.084,0,0,Math.PI/2),.3,.8);
  }
  b.add(cylinder(.052,.052,.056,16),BLACK,mat4(s*.199,0,0,0,0,Math.PI/2),.42,.4);
  if(!simple)for(let i=0;i<24;i++){
   const a=i*TAU/24;
   b.add(cylinder(.012,.012,.012,6),BOLT,mat4(s*.204,Math.sin(a)*.303,Math.cos(a)*.303,0,0,Math.PI/2),.28,.8);
  }
 }
 if(!simple)for(let i=0;i<36;i++)for(let j=-1;j<=1;j++){
  const a=(i+(j===0?.4:0))*TAU/36;
  b.add(box(.098,.033,.058),i%3?0x2b302e:0x313632,mat4(j*.108,Math.cos(a)*.49,Math.sin(a)*.49,a,0,j*.16),.96);
 }
 return b.finish();
}

export function roverTemplate(Builder,panel){
 const b=new Builder(),d=new Builder(),l=new Builder(),steering=new Builder(),needle=new Builder();
 const bolt=(x,y,z)=>d.add(sphere(.012,6,4),BOLT,mat4(x,y,z),.29,.75);
 const tube=(points,r=.037,color=BRONZE)=>{for(let i=1;i<points.length;i++)b.beam(points[i-1],points[i],r,color,.37,.6);};
 const sideSlab=(outline,s,x=1.00,color='paint',thickness=.055)=>b.add(slab(outline,[],(z,y,side)=>new Vector3(s*(x-side*thickness),y,z)),color,null,.32,.28);
 // Open tub: a real footwell, transmission tunnel and two scalloped entries per side.
 b.block(1.82,.11,3.95,BLACK,0,.40,0,.025,.85);
 b.block(1.84,.09,2.08,0x46504a,0,.54,0,.022,.82);
 b.block(.36,.29,1.90,BLACK,0,.72,.05,.06,.73);
 b.block(1.83,.13,1.10,'paint',0,1.09,1.65,.055,.30,.25);
 b.block(1.90,.14,.99,'paint',0,1.09,-1.69,.04,.32,.28);
 for(const s of[-1,1]){
  const outline=[[-.91,.52],[.91,.52],[.91,1.16],[.77,1.16],[.72,.86],[.64,.70],[.53,.66],[.24,.66],[.13,.74],[.09,1.13],[-.07,1.13],[-.13,.78],[-.23,.67],[-.56,.67],[-.69,.75],[-.76,1.15],[-.91,1.15]];
  sideSlab(outline,s);
  b.block(.105,.10,2.0,'paint',s*.98,.51,0,.03,.34,.25);
  tube([[s*1.01,.42,1.03],[s*1.18,.42,.90],[s*1.18,.42,-.88],[s*1.01,.42,-1.04]],.033);
  for(const z of[-.75,.12,.81]){
   d.block(.02,.13,.065,BRONZE,s*1.036,.82,z,.008,.38,.6);
   bolt(s*1.05,.78,z);bolt(s*1.05,.86,z);
  }
  for(const axle of[-1.42,1.42]){
   // Faceted flared fenders with an actual open wheel arch underneath.
   const arch=[];
   for(let i=0;i<=16;i++){const a=Math.PI-i*Math.PI/16;arch.push([axle+Math.cos(a)*.57,.49+Math.sin(a)*.57]);}
   sideSlab([[axle-.68,.49],[axle-.68,.97],[axle-.51,1.17],[axle+.51,1.17],[axle+.68,.97],[axle+.68,.49],...arch.reverse()],s,1.08);
   for(let i=0;i<16;i++){
    const a=i*Math.PI/16,c=(i+1)*Math.PI/16;
    panel(b,[[s*.96,.49+Math.sin(a)*.585,axle+Math.cos(a)*.585],[s*1.19,.49+Math.sin(a)*.60,axle+Math.cos(a)*.60],[s*1.19,.49+Math.sin(c)*.60,axle+Math.cos(c)*.60],[s*.96,.49+Math.sin(c)*.585,axle+Math.cos(c)*.585]],'paint',.32,.3);
    if(i%2===0)bolt(s*1.195,.49+Math.sin(a)*.61,axle+Math.cos(a)*.61);
   }
   // Visible axle, control arms, gold damper and spring behind each wheel.
   b.beam([0,.37,axle],[s*.99,.45,axle],.05,BLACK,.65,.5);
   d.beam([s*.72,.41,axle-.16],[s*.72,1.03,axle+.10],.044,GOLD,.33,.65);
   for(let i=0;i<8;i++)d.add(torus(.058,.009,5,10),BRONZE,mat4(s*.72,.51+i*.042,axle-.11+i*.018),.37,.7);
  }
  // Cage: open roof, slanted A/C pillars, side rails and rear diagonal braces.
  tube([[s*.92,1.08,1.08],[s*.83,1.97,.84],[s*.78,2.07,.72],[s*.78,2.07,-1.21],[s*.98,1.14,-1.80]],.04);
  tube([[s*.96,1.02,-.05],[s*.84,2.07,-.05]],.038);
  tube([[s*.91,1.15,-1.37],[s*.84,1.98,-.30]],.03);
  // Riveted suspension plates on the rear cage are a distinctive photo detail.
  d.add(slab([[-1.09,1.53],[-.86,1.45],[-.58,1.77],[-.77,1.92],[-.99,1.86]],[],(z,y,side)=>new Vector3(s*(.90-side*.035),y,z)),'paint',null,.32,.35);
  d.add(cylinder(.113,.113,.06,20),BRONZE,mat4(s*.918,1.70,-.84,0,0,Math.PI/2),.32,.68);
  d.add(cylinder(.076,.076,.079,12),GOLD,mat4(s*.937,1.70,-.84,0,0,Math.PI/2),.30,.65);
  for(let i=0;i<10;i++){const a=i*TAU/10;bolt(s*.954,1.70+Math.cos(a)*.116,-.84+Math.sin(a)*.116);}
  tube([[s*.91,1.15,1.08],[s*1.14,1.25,1.02]],.022);
  b.block(.12,.20,.16,BRONZE,s*1.14,1.30,1.02,.035,.3,.65);
  d.block(.01,.15,.11,0xa0b2ad,s*1.208,1.31,1.01,.004,.15,.7);
  // Slim slatted roof basket, with no opaque roof hiding the open cabin.
  tube([[s*.82,2.16,-1.39],[s*.82,2.16,.84]],.024);
  tube([[s*.82,2.29,-1.39],[s*.82,2.29,.84]],.021);
  for(const z of[-1.29,-.38,.70]){
   b.block(.045,.18,.17,'paint',s*.82,2.22,z,.015,.36,.4);
   d.add(cylinder(.027,.027,.048,10),BLACK,mat4(s*.823,2.23,z,0,0,Math.PI/2),.8);
  }
 }
 for(const z of[.79,-.05,-1.25])tube([[-.81,2.07,z],[.81,2.07,z]],.034);
 for(const z of[.81,-1.37])tube([[-.83,2.16,z],[.83,2.16,z]],.024);
 for(const x of[-.48,0,.48])tube([[x,2.14,-1.34],[x,2.14,.80]],.013);
 tube([[-.94,1.17,1.07],[.94,1.17,1.07]],.032);
 b.block(1.56,.075,.075,BLACK,0,2.01,.865,.02,.45);
 for(let i=0;i<20;i++)l.block(.058,.034,.01,0xffffff,-.70+i*.074,2.01,.909,.005);
 // Seats and harnesses, visible through the scallops and from the cockpit.
 for(const z of[.27,-.62])for(const s of[-1,1]){
  b.block(.62,.17,.57,'interior',s*.46,.78,z,.065,.9);
  b.add(roundedBox(.58,.59,.16,.055,2),'interior',mat4(s*.46,1.07,z-.28,-.10),.9);
  b.block(.33,.20,.15,'interior',s*.46,1.47,z-.32,.055,.9);
  for(const dx of[-.18,.18])d.block(.049,.45,.019,0x5c685d,s*.46+dx,1.09,z-.183,.006,.91);
  for(let j=-2;j<=2;j++)d.block(.012,.10,.45,0x46534c,s*.46+j*.09,.868,z,.005,.88);
  d.block(.10,.08,.04,GOLD,s*.46,.84,z+.19,.01,.35,.6);
 }
 // Driver-facing instrument panel. Separate wheel/needle animate with the controls.
 b.block(1.79,.24,.24,BLACK,0,1.18,1.03,.035,.76);
 d.block(1.69,.175,.018,BRONZE,0,1.17,.898,.018,.45,.55);
 for(const [x,r] of[[.47,.108],[.23,.068],[.71,.068],[-.02,.051],[-.17,.051]]){
  d.add(cylinder(r+.009,r+.009,.022,24),BOLT,mat4(x,1.19,.876,Math.PI/2),.27,.7);
  d.add(cylinder(r,r,.025,24),0x172825,mat4(x,1.19,.866,Math.PI/2),.72);
  for(let i=0;i<11;i++){
   const a=-2.3+i*.46;
   d.beam([x+Math.sin(a)*r*.71,1.19+Math.cos(a)*r*.71,.849],[x+Math.sin(a)*r*.89,1.19+Math.cos(a)*r*.89,.849],.0035,0xe5dcc0,.8,0);
  }
  if(x!==.47)d.beam([x,1.19,.846],[x-r*.48,1.19+r*.4,.846],.004,GOLD,.6,.1);
 }
 needle.beam([0,0,0],[0,.079,0],.0045,GOLD,.6,.2);
 for(let i=0;i<5;i++){
  d.add(cylinder(.019,.019,.027,10),i===0?0xb74835:BLACK,mat4(-.39-i*.092,1.17,.87,Math.PI/2),.5);
  d.block(.033,.005,.004,0xe3ddbc,-.39-i*.092,1.125,.857,.001,.85);
 }
 for(const s of[-1,1])d.block(.11,.063,.03,BLACK,s*.75,1.15,.872,.009,.7);
 d.beam([.47,.98,1.00],[.47,1.36,.71],.035,BLACK,.6,.5);
 steering.add(torus(.196,.022,8,40),0x262c27,null,.85);
 for(let i=0;i<3;i++){
  const a=i*TAU/3;
  steering.beam([Math.sin(a)*.048,Math.cos(a)*.048,0],[Math.sin(a)*.174,Math.cos(a)*.174,0],.020,GOLD,.32,.68);
 }
 steering.add(cylinder(.065,.065,.04,24),BLACK,mat4(0,0,0,Math.PI/2),.5,.4);
 steering.add(torus(.047,.005,5,24),BRONZE,mat4(0,0,-.024),.35,.7);
 for(const [x,z,h] of[[.02,.61,1.01],[-.12,.49,.91]]){
  d.beam([x,.78,z],[x,h,z-.10],.018,BRONZE,.4,.6);
  d.add(sphere(.039,12,8),BLACK,mat4(x,h,z-.10),.5);
 }
 for(const x of[.37,.59])d.block(.12,.03,.18,BLACK,x,.60,.87,.016,.9);
 // Squared front, round lamps, vertical grille slots and recovery hardware.
 b.block(1.93,.55,.11,'paint',0,.81,2.15,.045,.32,.28);
 b.block(1.10,.32,.03,BLACK,0,.87,2.215,.025,.82);
 for(let i=-4;i<=4;i++)d.block(.045,.30,.029,BRONZE,i*.116,.87,2.237,.014,.4,.55);
 for(const s of[-1,1]){
  b.add(cylinder(.157,.157,.062,28),BRONZE,mat4(s*.76,.93,2.20,Math.PI/2),.3,.65);
  l.add(cylinder(.131,.131,.066,28),0xffffff,mat4(s*.76,.93,2.215,Math.PI/2));
  d.add(torus(.136,.01,6,28),BOLT,mat4(s*.76,.93,2.254),.28,.7);
  b.block(.16,.06,.035,GOLD,s*.76,.69,2.221,.01,.3,.15);
  d.block(.06,.09,.15,BLACK,s*.76,1.17,1.22,.015,.7);
  for(let i=0;i<7;i++)d.block(.27,.008,.028,BLACK,s*.49,1.164,1.32+i*.062,.003,.8);
 }
 tube([[-1.09,.50,2.18],[-.97,.49,2.35],[.97,.49,2.35],[1.09,.50,2.18]],.05);
 tube([[-.48,.52,2.31],[-.48,.96,2.31],[.48,.96,2.31],[.48,.52,2.31]],.035);
 b.block(.58,.16,.16,BLACK,0,.61,2.25,.025,.65);
 d.add(cylinder(.052,.052,.37,16),BOLT,mat4(0,.62,2.36,0,0,Math.PI/2),.38,.6);
 // Sloping rear panel: paired round red lamps, louvers, gold center skid and ladder.
 const rearY=y=>-2.25+(y-.49)*.25;
 b.add(slab([[-.97,.43],[.97,.43],[1.04,1.12],[-1.04,1.12]],[],(x,y,side)=>new Vector3(x,y,rearY(y)+side*.07)),'paint',null,.31,.28);
 for(const s of[-1,1]){
  for(const x of[.67,.86]){
   const y=x===.67?.78:.88,z=rearY(y)-.025;
   b.add(cylinder(.071,.071,.035,20),BRONZE,mat4(s*x,y,z,Math.PI/2),.3,.65);
   b.add(cylinder(.058,.058,.047,20),0x9e2025,mat4(s*x,y,z-.025,Math.PI/2),.25,.1,0,2);
  }
  b.block(.33,.29,.035,BLACK,s*.46,1.05,-2.133,.03,.75);
  for(let i=0;i<6;i++)d.add(box(.28,.027,.053),BRONZE,mat4(s*.46,.942+i*.039,-2.163,.35),.37,.6);
  d.block(.25,.17,.025,BLACK,s*.80,.52,-2.265,.025,.72);
  const hook=[[s*.80-.084,.46,-2.294],[s*.80-.084,.55,-2.294],[s*.80,.59,-2.294],[s*.80+.084,.55,-2.294],[s*.80+.084,.46,-2.294],[s*.80-.084,.46,-2.294]];
  for(let i=1;i<hook.length;i++)d.beam(hook[i-1],hook[i],.017,GOLD,.32,.65);
  tube([[s*.90,1.16,-2.12],[s*.90,1.16,-2.37],[s*.52,1.01,-2.42],[s*.37,.31,-2.42]],.035);
 }
 b.block(.31,.61,.028,GOLD,0,.66,-2.275,.025,.33,.5);
 for(const y of[.36,.63,.90])tube([[-.40,y,-2.435],[.40,y,-2.435]],.033);
 tube([[-.92,1.16,-2.365],[.92,1.16,-2.365]],.035);
 // Exposed rear machinery, two gold reservoirs, hoses, and upright spare.
 b.block(.57,.39,.49,BLACK,0,1.37,-1.41,.09,.5);
 for(const s of[-1,1]){
  b.add(cylinder(.14,.17,.29,20),GOLD,mat4(s*.49,1.36,-1.45),.38,.55);
  d.add(cylinder(.063,.063,.06,12),BRONZE,mat4(s*.49,1.54,-1.45),.3,.7);
  d.add(torus(.155,.023,6,20),BLACK,mat4(s*.49,1.28,-1.45,Math.PI/2),.8);
  tube([[s*.45,1.50,-1.46],[s*.43,1.70,-1.28],[s*.32,1.70,-1.16],[s*.29,1.34,-1.08]],.019,BLACK);
  d.block(.065,.29,.07,GOLD,s*.74,1.44,-1.51,.01,.35,.6);
 }
 b.add(roverWheel(Builder),0xffffff,mat4(0,1.88,-1.91,0,Math.PI/2,0));
 for(const s of[-1,1]){
  d.add(roundedBox(.12,.037,.48,.015,1),0x557054,mat4(s*.30,2.285,-1.91,0,0,-s*.45),.95);
  d.block(.115,.035,.49,0x3689b4,s*.15,2.368,-1.91,.012,.88);
  d.block(.09,.25,.035,0x3689b4,s*.45,1.98,-2.105,.01,.9);
  d.block(.12,.085,.04,GOLD,s*.45,1.77,-2.13,.012,.35,.6);
 }
 for(const s of[-1,1])for(let i=0;i<10;i++)bolt(s*.94,1.174,-2.04+i*.44);
 return {body:b.finish(),detail:d.finish(),lamps:l.finish(),steering:steering.finish(),needle:needle.finish(),
  info:{seatY:.13,seatZ:.27,driverX:.47,eye:[.47,1.65,.10],wheelRadius:.49,track:1.0,axle:1.42,
   windshield:[[-.91,1.21,1.059],[.91,1.21,1.059],[.795,1.985,.83],[-.795,1.985,.83]]},
  p:{length:4.50,width:2.0,roof:2.07,open:true}};
}
