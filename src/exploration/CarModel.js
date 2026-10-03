import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3, Color } from '../engine/index.js';
import { prepare, mergePrepared, box, roundedBox, cylinder, sphere, torus, lathe, mat4, rod } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { standard } from '../materials/Materials.js';
import { LAYERS } from '../core/SceneRenderer.js';
import { describeCar, CAR_FAMILIES, CAR_PAINTS, CAR_WHEEL_STYLES } from './CarVariants.js';
import { ROVER_SEED, ROVER_VARIANT, roverTemplate, roverWheel } from './ReferenceRover.js';

export { describeCar, CAR_FAMILIES, CAR_PAINTS, CAR_WHEEL_STYLES } from './CarVariants.js';
export { ROVER_SEED, ROVER_VARIANT } from './ReferenceRover.js';
// Kept for older callers; the model's own name includes its actual paint and silhouette.
export const CAR_NAMES=['Seafoam','Clementine','Sunbeam','Bluebird','Sage','Coral','Indigo','Sandpiper'];

const TAU=Math.PI*2, DARK=0x202c2c, RUBBER=0x222828, GLASS=0x264846, CHROME=0xc7cec2;
const PROFILES={
 roadster:{length:4.12,width:1.70,belt:.96,hood:.99,front:.78,frontTop:.43,rearTop:-.72,rear:-1.20,roof:1.57,open:true,round:true},
 coupe:{length:4.18,width:1.74,belt:.99,hood:1.03,front:.83,frontTop:.30,rearTop:-.58,rear:-1.51,roof:1.66,round:true},
 wagon:{length:4.20,width:1.74,belt:1.03,hood:1.06,front:.85,frontTop:.36,rearTop:-1.47,rear:-1.81,roof:1.83,round:true},
 hatchback:{length:3.86,width:1.67,belt:1.01,hood:1.03,front:.76,frontTop:.24,rearTop:-.97,rear:-1.57,roof:1.77,round:true},
 pickup:{length:4.20,width:1.76,belt:1.06,hood:1.10,front:1.10,frontTop:.70,rearTop:-.33,rear:-.49,roof:1.84,round:true},
 van:{length:4.18,width:1.76,belt:1.10,hood:1.13,front:1.87,frontTop:1.48,rearTop:-1.69,rear:-1.88,roof:2.10,round:true},
 rally:{length:4.06,width:1.76,belt:1.00,hood:1.04,front:.82,frontTop:.25,rearTop:-.72,rear:-1.43,roof:1.67,round:false},
 sedan:{length:4.24,width:1.74,belt:1.04,hood:1.08,front:.88,frontTop:.35,rearTop:-.69,rear:-1.30,roof:1.78,round:true},
};

// Templates retain only eight silhouettes; colors are inexpensive per-car copies. Shared
// positions/normals/indices are immutable, and a generated vehicle never enters a global cache.
class Builder {
 constructor(){this.parts=[];this.ranges=[];this.vertices=0;}
 add(g,color,matrix=null,rough=.4,metal=0,pattern=0,tag=0){
  const role=typeof color==='string'?color:null,n=g.attributes.position.count;
  this.parts.push(prepare(g,{color:role?0xffffff:color,matrix,rough,metal,pattern,anim:tag}));
  if(role)this.ranges.push({role,start:this.vertices,count:n});this.vertices+=n;
 }
 block(w,h,d,color,x,y,z,radius=.03,rough=.4,metal=0){this.add(Math.min(w,h,d)<.03?box(w,h,d):roundedBox(w,h,d,radius,1),color,mat4(x,y,z),rough,metal);}
 beam(a,b,r,color,rough=.3,metal=.7){this.add(rod(new Vector3(...a),new Vector3(...b),r,6),color,null,rough,metal);}
 finish(){const g=this.parts.length?mergePrepared(this.parts):new BufferGeometry();g.userData.paletteRanges=this.ranges;return g;}
}
function recolor(source,v){
 const g=new BufferGeometry();for(const[name,a]of Object.entries(source.attributes))g.setAttribute(name,name==='color'?a.clone():a);
 if(source.index)g.setIndex(source.index);g.boundingBox=source.boundingBox?.clone()||null;g.boundingSphere=source.boundingSphere?.clone()||null;
 const C=g.attributes.color?.array,c=new Color();
 for(const r of source.userData.paletteRanges||[]){c.set(v[r.role]);for(let i=r.start*3,end=(r.start+r.count)*3;i<end;i+=3){C[i]=c.r;C[i+1]=c.g;C[i+2]=c.b;}}
 return g;
}
function face(points){
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points.flat(),3));
 const indices=[];for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);g.setIndex(indices);g.computeVertexNormals();return g;
}
function doubleFace(points){
 const g=face(points),a=g.index.array;g.setIndex([...a,...Array.from(a).reverse()]);return g;
}
function panel(builder,points,color,rough=.15,metal=.25,tag=0){builder.add(doubleFace(points),color,null,rough,metal,0,tag);}
function archHeight(z){
 let height=.38;for(const axle of[-1.32,1.32]){const d=Math.abs(z-axle);if(d<.405)height=Math.max(height,.365+Math.sqrt(.405*.405-d*d));}return height;
}
function bonnetHeight(p,z,x,family){
 const sport=family==='roadster'||family==='coupe',front=Math.max(0,z-.65)/(p.length/2-.65);
 const top=p.belt+(p.hood-p.belt)*Math.min(1,Math.max(0,z/.8))-.07*front*front;
 const edge=Math.abs(z)/(p.length/2),taper=Math.max(0,(edge-.67)/.33),w=p.width/2-(sport?.15:.085)*taper*taper;
 const crown=sport?.047:.024,shoulder=sport?.035*Math.exp(-(((Math.abs(z)-1.32)/.40)**2)):.012;
 return top+crown+(shoulder+.014-crown)*Math.min(1,Math.abs(x)/(w*.65));
}
function bodyShell(p,family){
 const vertices=[],indices=[],rings=56,N=11,sport=family==='roadster'||family==='coupe';
 for(let i=0;i<=rings;i++){
  const z=-p.length/2+i*p.length/rings,edge=Math.abs(z)/(p.length/2);
  const taper=Math.max(0,(edge-.67)/.33),w=p.width/2-(sport?.15:.085)*taper*taper;
  const front=Math.max(0,z-.65)/(p.length/2-.65);
  let top=p.belt+(p.hood-p.belt)*Math.min(1,Math.max(0,z/.8))-.07*front*front;
  if(family==='pickup'&&z<-.57)top=.86;
  const bottom=archHeight(z),bevel=Math.min(.10,(top-bottom)*.40);
  const shoulder=sport?.035*Math.exp(-(((Math.abs(z)-1.32)/.40)**2)):.012;
  const crown=sport?.047:.024;
  for(const[x,y]of[[-w+.06,bottom],[-w,bottom+.045],[-w,top-bevel],[-w+.055,top-.018+shoulder],[-w*.65,top+.014+shoulder],[0,top+crown],[w*.65,top+.014+shoulder],[w-.055,top-.018+shoulder],[w,top-bevel],[w,bottom+.045],[w-.06,bottom]])vertices.push(x,y,z);
 }
 for(let i=0;i<rings;i++)for(let j=0;j<N;j++){const a=i*N+j,b=(i+1)*N+j,c=(i+1)*N+(j+1)%N,d=i*N+(j+1)%N;indices.push(a,b,c,a,c,d);}
 for(let j=1;j<N-1;j++){indices.push(0,j,j+1);const last=rings*N;indices.push(last,last+j+1,last+j);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function archedRoof(p,half){
 const vertices=[],indices=[],rows=10,columns=12;
 for(let j=0;j<=rows;j++){
  const t=j/rows,zz=t*2-1,z=p.rearTop-.045+t*(p.frontTop-p.rearTop+.09),width=(half+.052)*(1-.025*zz**4);
  for(let i=0;i<=columns;i++){const xx=i/columns*2-1;vertices.push(xx*width,p.roof+.048-.076*xx*xx-.032*zz**4,z);}
 }
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=j*(columns+1)+i,b=a+1,c=a+columns+1;indices.push(a,c,b,b,c,c+1);}
 const boundary=[];for(let i=0;i<=columns;i++)boundary.push(i);for(let j=1;j<=rows;j++)boundary.push(j*(columns+1)+columns);for(let i=columns-1;i>=0;i--)boundary.push(rows*(columns+1)+i);for(let j=rows-1;j>0;j--)boundary.push(j*(columns+1));
 const bottom=vertices.length/3;vertices.push(0,p.roof-.085,(p.frontTop+p.rearTop)/2);
 for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length],c=vertices.length/3;vertices.push(vertices[a*3],p.roof-.08,vertices[a*3+2],vertices[b*3],p.roof-.08,vertices[b*3+2]);indices.push(a,b,c,b,c+1,c,bottom,c,c+1);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function cabin(b,d,p,family){
 const half=p.width/2-.055,topHalf=half-.105,bottom=p.belt+.015,top=p.roof-.075;
 const fl=[-half,bottom,p.front],fr=[half,bottom,p.front],ftl=[-topHalf,top,p.frontTop],ftr=[topHalf,top,p.frontTop];
 if(p.open){
  for(const s of[-1,1])b.beam([s*half,bottom,p.front],[s*topHalf,top,p.frontTop],.027,'trim');
  b.beam(ftl,ftr,.027,'trim');b.beam(fl,fr,.022,'trim');
  return {windshield:[fl,fr,ftr,ftl],seatY:0,seatZ:-.18};
 }
 const bl=[-half,bottom,p.rear],br=[half,bottom,p.rear],btl=[-topHalf,top,p.rearTop],btr=[topHalf,top,p.rearTop];
 panel(b,[fl,fr,ftr,ftl],GLASS,.14,.36,1);panel(b,[br,bl,btl,btr],GLASS,.14,.36,1);
 for(const s of[-1,1]){
  const a=[s*half,bottom,p.front],c=[s*topHalf,top,p.frontTop],e=[s*topHalf,top,p.rearTop],f=[s*half,bottom,p.rear];
  panel(b,[a,c,e,f],GLASS,.16,.26,1);
  b.beam(a,c,.037,'roof');b.beam(c,e,.038,'roof');b.beam(e,f,.045,'roof');
  b.beam(a,f,.024,'trim');d.beam([s*(half+.008),bottom-.03,p.front],[s*(half+.008),bottom-.03,p.rear],.012,'trim');
  const pillars=family==='van'?[.84,.12,-.60,-1.30]:family==='wagon'?[.04,-.75]:family==='sedan'?[-.12]:family==='pickup'?[]:[-.28];
  for(const z of pillars){b.beam([s*half,bottom,z],[s*topHalf,top,z],family==='van'?.026:.035,'roof');}
  // A restrained diagonal reflection makes the glass legible at street scale.
  panel(d,[[s*(half+.002),bottom+.07,p.front-.13],[s*(half+.002),bottom+.075,p.front-.17],[s*(topHalf+.006),top-.075,p.frontTop-.24],[s*(topHalf+.006),top-.045,p.frontTop-.20]],0x608d89,.17,.4);
 }
 b.add(archedRoof(p,topHalf),'roof',null,.30,.22);
 b.beam(ftl,ftr,.028,'trim');b.beam(btl,btr,.025,'trim');b.beam(fl,fr,.021,'trim');b.beam(bl,br,.02,'trim');
 if(family==='van'){
  // The two-tone belt and little roof skylights give the Coastliner its own character.
  for(const s of[-1,1])b.block(.024,.22,3.67,'roof',s*(p.width/2+.006),1.01,-.02,.01,.4,.2);
  for(const z of[.90,.26,-.38,-1.02])for(const s of[-1,1])b.block(.43,.009,.40,GLASS,s*.40,p.roof+.032,z,.025,.15,.3);
 }
 return {seatY:family==='van'?.16:family==='pickup'?.09:0,seatZ:family==='van'?.65:family==='pickup'?.14:-.18};
}
function interior(b,d,p,cabinInfo){
 const y=cabinInfo.seatY,z=cabinInfo.seatZ;
 for(const s of[-1,1]){
  b.block(.60,.15,.67,'interior',s*.40,.74+y,z-.04,.065,.86);
  b.block(.59,.49,.16,'interior',s*.40,1.02+y,z-.37,.06,.84);
  if(!p.open)b.block(.25,.18,.14,'interior',s*.40,1.36+y,z-.37,.045,.86);
  if(p.open)for(let j=-2;j<=2;j++)d.block(.014,.35,.012,0x624b3c,s*.4+j*.09,1.01+y,z-.277,.003,.9);
 }
 b.block(1.45,.17,.23,DARK,0,1.05+y,z+.62,.04,.7);
 d.add(torus(.175,.018,5,16),0x493e32,mat4(.4,1.14+y,z+.49,-.60),.55,.12);
 d.beam([.40,1.11+y,z+.53],[.40,.88+y,z+.74],.028,DARK);
 for(let i=0;i<3;i++)d.add(cylinder(.042,.042,.008,10),0xd8d3b8,mat4(.26+i*.105,1.10+y,z+.487,Math.PI/2),.5);
 d.block(.16,.26,.38,DARK,0,.80+y,z+.02,.025,.75);
 d.beam([0,.85+y,z+.07],[0,1.0+y,z+.06],.015,'trim');d.add(sphere(.035,8,5),DARK,mat4(0,1.01+y,z+.06),.5);
}
function lightsAndGrille(b,d,l,p,family){
 const front=p.length/2+.013,rear=-p.length/2-.014,lightY=p.hood-.13;
 const round=p.round&&family!=='sedan',radius=family==='van'?.145:.145;
 for(const s of[-1,1]){
  const x=s*(p.width/2-.26);
  if(round){
   b.add(cylinder(radius+.035,radius+.035,.065,16),'trim',mat4(x,lightY,front-.029,Math.PI/2),.24,.8);
   l.add(cylinder(radius,radius,.072,16),0xffffff,mat4(x,lightY,front,Math.PI/2));
   d.add(torus(radius+.009,.009,5,16),'trim',mat4(x,lightY,front+.043),.22,.85);
  }else if(family==='sedan'){
   for(const ox of[-.086,.086]){b.add(cylinder(.093,.093,.045,12),'trim',mat4(x+ox,lightY,front,Math.PI/2),.24,.8);l.add(cylinder(.075,.075,.053,12),0xffffff,mat4(x+ox,lightY,front+.017,Math.PI/2));}
  }else{
   b.block(.43,.18,.075,'trim',x,lightY,front-.025,.025,.28,.6);
   for(const ox of[-.105,.105])l.add(cylinder(.074,.074,.075,12),0xffffff,mat4(x+ox,lightY,front+.008,Math.PI/2));
  }
  b.add(roundedBox(.23,.13,.045,.02,1),0xb43f30,mat4(s*.61,.78,rear),.3,.15,0,2);
  d.add(roundedBox(.11,.06,.035,.012,1),0xe8b95e,mat4(x,.60,front+.025),.3,.12,0,3);
  d.add(roundedBox(.06,.055,.025,.008,1),0xf2dbb0,mat4(s*.61,.76,rear-.027),.3,.15);
  d.block(.07,.20,.13,DARK,s*.64,.49,front-.015,.018,.65);
  d.block(.07,.20,.13,DARK,s*.64,.49,rear+.015,.018,.65);
 }
 b.block(family==='sedan'?.47:1.00,.20,.042,DARK,0,.73,front+.007,.025,.6,.2);
 if(family==='sedan'){
  for(let i=-3;i<=3;i++)d.block(.017,.19,.018,'trim',i*.057,.73,front+.033,.003,.26,.8);
 }else{
  for(let i=0;i<4;i++)d.block(.94,.012,.019,'trim',0,.653+i*.049,front+.033,.003,.25,.75);
  for(let i=-3;i<=3;i++)d.block(.014,.17,.009,0x68736b,i*.14,.73,front+.046,.003,.35,.6);
 }
 for(const z of[front-.005,rear+.005]){
  b.block(p.width+.015,.085,.10,'trim',0,.47,z,.035,.25,.7);
  d.block(.32,.12,.018,0xe4d4ae,0,.56,z+Math.sign(z)*.056,.009,.8);
  d.block(.24,.012,.009,0x304b57,0,.57,z+Math.sign(z)*.067,.002,.8);
 }
 d.add(cylinder(.034,.034,.017,10),'accent',mat4(0,p.hood+.004,p.length/2-.34,Math.PI/2),.22,.5);
}
function trim(b,d,p,family){
 const w=p.width/2;
 for(const s of[-1,1]){
  d.beam([s*(w+.006),.73,-p.length/2+.24],[s*(w+.006),.73,p.length/2-.27],.010,'trim');
  const rearDoor=['wagon','van','sedan'].includes(family),doorZ=family==='van'?.18:family==='pickup'?-.41:-.72;
  d.beam([s*(w+.006),p.belt-.03,p.front-.09],[s*(w+.006),.78,p.front-.16],.0055,DARK);
  d.beam([s*(w+.006),.78,p.front-.16],[s*(w+.006),.55,doorZ],.0055,DARK);
  d.beam([s*(w+.006),.55,doorZ],[s*(w+.006),p.belt-.035,doorZ],.0055,DARK);
  d.block(.035,.027,.19,'trim',s*(w+.018),p.belt-.085,doorZ+.20,.009,.24,.8);
  if(rearDoor){d.beam([s*(w+.009),.57,-1.37],[s*(w+.009),p.belt-.04,-1.37],.0055,DARK);d.block(.025,.027,.16,'trim',s*(w+.02),p.belt-.085,-1.16,.008,.25,.8);}
  b.beam([s*(w-.05),p.belt+.03,p.front-.15],[s*.90,p.belt+.12,p.front-.11],.015,'trim');
  b.add(sphere(1,8,5),'trim',mat4(s*.895,p.belt+.14,p.front-.12,0,0,0,.053,.049,.070),.23,.75);
  for(const axle of[-1.32,1.32])d.add(torus(.411,.017,5,18,Math.PI),'trim',mat4(s*(w+.004),.365,axle,0,Math.PI/2,0),.30,.6);
 }
 // Bonnet shut line, parallel wipers and understated intake slats.
 for(const s of[-1,1])for(let i=0;i<6;i++){
  const a=i/6,c=(i+1)/6,za=p.front+.04+(p.length/2-.27-p.front-.04)*a,zc=p.front+.04+(p.length/2-.27-p.front-.04)*c,xa=s*(.56+.05*a),xc=s*(.56+.05*c);
  d.beam([xa,bonnetHeight(p,za,xa,family)+.004,za],[xc,bonnetHeight(p,zc,xc,family)+.004,zc],.004,DARK,.6,.15);
 }
 for(const s of[-1,1])d.beam([s*.46,p.belt+.042,p.front+.012],[s*.13,p.belt+.059,p.front-.045],.009,DARK,.4,.25);
 if(family==='rally'||family==='coupe')for(let i=0;i<5;i++){const z=1.03+i*.047;d.block(.36,.009,.015,DARK,0,bonnetHeight(p,z,0,family)+.005,z,.003,.65);}
 if(family==='roadster'){b.block(.43,.04,.27,'paint',0,p.hood+.058,1.14,.018,.31,.28);d.block(.31,.021,.016,DARK,0,p.hood+.055,1.283,.004,.6);}
 if(family==='pickup'){
  b.block(1.44,.065,1.42,0x705c40,0,.89,-1.27,.02,.88);
  for(const s of[-1,1])b.block(.12,.30,1.49,'paint',s*.80,1.07,-1.28,.03,.39,.25);
  b.block(1.66,.28,.10,'paint',0,1.065,-2.015,.025,.38,.25);
  for(let i=-3;i<=3;i++)d.block(.025,.018,1.35,0xad8a5b,i*.19,.937,-1.28,.005,.86);
  for(const s of[-1,1])for(const z of[-1.86,-.75])d.block(.055,.07,.04,'trim',s*.78,1.26,z,.008,.3,.6);
 }
 if(family==='wagon')for(const s of[-1,1]){
  b.add(box(.013,.22,2.06),0x876044,mat4(s*(w+.01),.87,-.33),.72,0,7);
  d.beam([s*(w+.022),.745,-1.33],[s*(w+.022),.745,.67],.018,0xc29b68,.72,0);
  d.beam([s*(w+.022),.995,-1.33],[s*(w+.022),.995,.67],.018,0xc29b68,.72,0);
 }
 if(family==='rally'){
  b.block(1.64,.12,.17,DARK,0,.38,1.98,.015,.75);
  for(const s of[-1,1])b.block(.10,.23,.23,'paint',s*.58,1.13,-1.66,.014,.35,.25);
  b.block(1.63,.09,.37,'paint',0,1.28,-1.68,.025,.30,.25);
 }
}
function template(family){
 const p=PROFILES[family],b=new Builder(),d=new Builder(),l=new Builder();
 b.add(bodyShell(p,family),'paint',null,.32,.28);
 b.block(1.30,.10,3.53,RUBBER,0,.36,0,.02,.94);
 const info=cabin(b,d,p,family);interior(b,d,p,info);lightsAndGrille(b,d,l,p,family);trim(b,d,p,family);
 return {body:b.finish(),detail:d.finish(),lamps:l.finish(),info,p};
}
function wheel(style,simple=false){
 const b=new Builder();
 if(simple){b.add(cylinder(.365,.365,.19,10),RUBBER,mat4(0,0,0,0,0,Math.PI/2),.94);for(const s of[-1,1])b.add(cylinder(.215,.215,.012,10),CHROME,mat4(s*.102,0,0,0,0,Math.PI/2),.35,.6);return b.finish();}
 b.add(lathe([[.235,-.095],[.30,-.114],[.35,-.087],[.365,-.048],[.365,.048],[.35,.087],[.30,.114],[.235,.095]],20),RUBBER,mat4(0,0,0,0,0,Math.PI/2),.92);
 for(const s of[-1,1]){
  b.add(cylinder(.253,.253,.009,20),0x273230,mat4(s*.106,0,0,0,0,Math.PI/2),.6,.3);
  b.add(torus(.25,.014,5,20),CHROME,mat4(s*.117,0,0,0,Math.PI/2),.25,.8);
  if(style==='whitewall')b.add(torus(.307,.024,5,20),0xe4dccc,mat4(s*.106,0,0,0,Math.PI/2),.79);
  const count=style==='mesh'?12:style==='turbine'?9:style==='five-spoke'?5:8;
  if(style==='steel'||style==='whitewall')b.add(cylinder(.181,.206,.044,16),style==='whitewall'?0xcec6af:0x8d9690,mat4(s*.13,0,0,0,0,Math.PI/2),.26,.72);
  for(let i=0;i<count;i++){
   const a=i*TAU/count,offset=style==='turbine'?.28:style==='mesh'?.20:0;
   if(style==='steel'||style==='whitewall')b.add(cylinder(.026,.026,.010,6),DARK,mat4(s*.12,Math.sin(a)*.224,Math.cos(a)*.224,0,0,Math.PI/2),.6);
   else{
    b.beam([s*.127,Math.sin(a)*.085,Math.cos(a)*.085],[s*.127,Math.sin(a+offset)*.236,Math.cos(a+offset)*.236],style==='mesh'?.011:.021,CHROME);
    if(style==='mesh')b.beam([s*.127,Math.sin(a)*.085,Math.cos(a)*.085],[s*.127,Math.sin(a-offset)*.236,Math.cos(a-offset)*.236],.009,CHROME);
   }
  }
  b.add(cylinder(.07,.07,.033,10),CHROME,mat4(s*.141,0,0,0,0,Math.PI/2),.24,.75);
  b.add(cylinder(.025,.025,.037,8),0x526b63,mat4(s*.147,0,0,0,0,Math.PI/2),.25,.35);
 }
 return b.finish();
}
function driver(index){
 const b=new Builder(),skin=[0xc79975,0x865f48,0xc3936a,0xa16c4b][index%4],shirt=[0xdbbd79,0x447f7b,0xe1d4b2,0x8e6660][index%4];
 b.block(.36,.44,.24,shirt,0,1.07,0,.065,.90);b.add(sphere(1,10,7),skin,mat4(0,1.45,.02,0,0,0,.135,.18,.14),.86,0,3);
 b.add(sphere(1,10,6),index%3?0x3e3930:0x7b6044,mat4(0,1.54,.004,0,0,0,.141,.097,.147),.94);
 b.block(.26,.043,.027,0x253a36,0,1.48,.151,.008,.25,.25);
 for(const s of[-1,1]){b.beam([s*.19,1.20,0],[s*.25,1.00,.24],.058,shirt,.92,0);b.beam([s*.25,1.00,.24],[s*.14,1.04,.43],.044,skin,.86,0);b.block(.15,.16,.51,0x465462,s*.11,.68,.20,.04,.93);}
 return b.finish();
}
let shared;
function kit(){
 if(shared)return shared;
 const material=createPropMaterial('California coachwork',{clearcoat:true});material.underwaterLighting='lite';
 material.surface+=`\nif(in.vs.vAux.x<0.43 && in.vs.vAux.y>0.12){s.clearcoat=0.65;s.clearcoatRoughness=0.12;}
 if(in.vs.vAux.w>0.5 && in.vs.vAux.w<1.5){
  let facing=abs(dot(normalize(frame.cameraPos-in.P),normalize(in.N)));
  s.albedo=mix(in.color.rgb,vec3f(0.065,0.135,0.145),pow(1.0-facing,3.0));
  s.roughness=0.29;s.metalness=0.0;s.clearcoat=0.08;s.clearcoatRoughness=0.25;
  s.specularIntensity=0.32;s.envIntensity=0.45;
 }
 if(in.vs.vAux.w>1.5){s.emissive+=in.color.rgb*frame.night*1.35;}\n`;
 const lamps=standard({color:0xffe3ad,emissive:0xffdb9a,emissiveIntensity:.08,roughness:.19});
 const glass=standard({color:0x90bdb8,roughness:.08,transparent:true,opacity:.21,depthWrite:false,side:'double',velocityWeight:0});
 const magic=standard({color:0x9de8ec,emissive:0x73dce5,emissiveIntensity:2.2,roughness:.35});
 const stars=new Builder();
 for(let i=0;i<12;i++){
  const x=Math.sin(i*2.4)*1.2,y=.3+(i%4)*.19,z=-1.6-(i%5)*.4;
  stars.block(.035,.16,.035,0xffffff,x,y,z,0);
  stars.block(.13,.035,.035,0xffffff,x,y,z,0);
 }
 shared={material,lamps,glass,magic,magicHalo:torus(1,.018,4,40).rotateX(Math.PI/2),magicStars:stars.finish(),templates:new Map(),wheels:new Map(),simpleWheel:wheel('steel',true),drivers:Array.from({length:8},(_,i)=>driver(i))};return shared;
}
function accessory(v,p){
 const b=new Builder(),roof=p.roof+.08,closed=!p.open,pickup=v.family==='pickup';
 const rack=()=>{for(const s of[-1,1]){b.beam([s*.61,roof-.04,-.97],[s*.61,roof+.075,.39],.016,'trim');for(const z of[-.85,.30])b.beam([s*.61,pickup&&z<0?1.19:roof-.055,z],[s*.61,roof+.07,z],.017,'trim');}for(const z of[-.85,.30])b.beam([-.64,roof+.07,z],[.64,roof+.07,z],.018,'trim');};
 if((v.accessory==='surfboard'||v.accessory==='roofrack'||v.accessory==='cargo'&&!pickup)&&closed)rack();
 if(v.accessory==='surfboard'){
  const y=closed?roof+.16:1.15,z=-.25;
  b.add(sphere(1,16,8),'accent',mat4(0,y,z,0,0,0,.27,.060,1.40),.34,.05);
  b.block(.024,.008,2.62,0xe9d8b3,0,y+.057,z,.003,.65);
  b.add(face([[-.012,y+.05,z-.90],[-.012,y+.34,z-1.12],[-.012,y+.05,z-1.23]]),0xc19554,null,.60);
  b.add(face([[.012,y+.05,z-1.23],[.012,y+.34,z-1.12],[.012,y+.05,z-.90]]),0xc19554,null,.60);
  for(const dz of[-.70,.50])b.block(.50,.016,.04,DARK,0,y+.063,z+dz,.005,.85);
 }else if(v.accessory==='cargo'){
  const y=pickup?1.09:closed?roof+.23:1.03,z=pickup?-1.18:-.39;b.block(.86,.27,.69,'interior',0,y,z,.075,.93);
  for(const x of[-.27,.27])b.block(.027,.29,.70,DARK,x,y,z,.007,.83);
 }else if(v.accessory==='spare'){
  const y=v.family==='pickup'?1.08:1.14,z=v.family==='pickup'?-1.10:-1.36;
  b.add(cylinder(.29,.29,.15,16),RUBBER,mat4(0,y,z),.92);b.add(cylinder(.18,.18,.16,12),'trim',mat4(0,y+.015,z),.35,.5);
 }else if(v.accessory==='rally'){
  for(const x of[-.31,.31]){b.add(cylinder(.125,.125,.065,12),DARK,mat4(x,.59,p.length/2+.015,Math.PI/2),.65);b.add(cylinder(.105,.105,.070,12),0xe6be59,mat4(x,.59,p.length/2+.026,Math.PI/2),.25,.25);}
 }
 if(v.stripe==='twin'){
  for(const x of[-.17,.17]){
   const start=p.front+.09,end=p.length/2-.18;
   for(let i=0;i<8;i++){
    const a=start+(end-start)*i/8,c=start+(end-start)*(i+1)/8;
    panel(b,[[x-.047,bonnetHeight(p,a,x-.047,v.family)+.006,a],[x+.047,bonnetHeight(p,a,x+.047,v.family)+.006,a],[x+.047,bonnetHeight(p,c,x+.047,v.family)+.006,c],[x-.047,bonnetHeight(p,c,x-.047,v.family)+.006,c]],'accent',.35,.18);
    if(closed){
     const front=p.frontTop+.045,rear=p.rearTop-.045,a=rear+(front-rear)*i/8,c=rear+(front-rear)*(i+1)/8,half=p.width/2-.055-.105+.052;
     const y=(xx,z)=>{const zz=(z-rear)/(front-rear)*2-1;return p.roof+.054-.076*(xx/(half*(1-.025*zz**4)))**2-.032*zz**4;};
     panel(b,[[x-.047,y(x-.047,a),a],[x+.047,y(x+.047,a),a],[x+.047,y(x+.047,c),c],[x-.047,y(x-.047,c),c]],'accent',.35,.18);
    }
   }
  }
 }else if(v.stripe==='pinstripe'||v.stripe==='side'){
  const h=v.stripe==='side'?.085:.012;
  for(const s of[-1,1])b.block(.008,h,2.36,'accent',s*(p.width/2+.017),v.stripe==='side'?.84:p.belt-.052,-.13,.002,.45,.1);
 }
 return b.parts.length?recolor(b.finish(),v):null;
}

/** A vehicle owns its colored body/detail/accessory geometry. Wheels, drivers and materials are
 * shared in finite kits. dispose() releases only owned geometry. setDetail(0/1/2) selects full,
 * medium or distant geometry and preserves the roof/window silhouette at every distance. */
export function makeCar(seed=ROVER_SEED){
 const rover=seed===ROVER_SEED,v=rover?ROVER_VARIANT:describeCar(seed),k=kit();
 if(!k.templates.has(v.family))k.templates.set(v.family,rover?roverTemplate(Builder,panel):template(v.family));
 if(!k.wheels.has(v.wheel))k.wheels.set(v.wheel,rover?roverWheel(Builder):wheel(v.wheel));
 if(rover&&!k.roverSimpleWheel)k.roverSimpleWheel=roverWheel(Builder,true);
 const t=k.templates.get(v.family),group=new Group();group.name=v.name;group.userData.variant=v;
 const owned=[],mesh=(g,m=k.material,shadow=true)=>{const o=new Mesh(g,m);o.castShadow=shadow;o.receiveShadow=true;group.add(o);return o;};
 const own=g=>(owned.push(g),g),body=mesh(own(recolor(t.body,v))),detail=mesh(own(recolor(t.detail,v)));
 body.name=v.familyName+' coachwork';detail.name='Coachwork trim and cabin details';
 const extra=rover?null:accessory(v,t.p),accessories=extra?mesh(own(extra)):null;
 const lamps=mesh(t.lamps,k.lamps,false);lamps.name='Headlight lenses';
 let glass;
 if(t.info.windshield){glass=mesh(own(doubleFace(t.info.windshield)),k.glass,false);glass.layers.set(LAYERS.TRANSPARENT);}
 else{glass=new Group();group.add(glass);} // opaque enclosed glass is part of the solid body
 const driverX=t.info.driverX??.4,wheelRadius=t.info.wheelRadius??.365,track=t.info.track??.82,axle=t.info.axle??1.32;
 const driver=mesh(k.drivers[v.driver]);driver.position.set(driverX,t.info.seatY,t.info.seatZ);driver.name='Local driver';
 const playerDriver=mesh(k.drivers[3]);playerDriver.position.set(driverX,t.info.seatY,t.info.seatZ);playerDriver.visible=false;playerDriver.name='Player driver';
 let steering=null,speedNeedle=null;
 if(t.steering){
  const column=new Group();column.position.set(.47,1.36,.71);column.rotation.x=-.38;group.add(column);
  steering=mesh(t.steering);column.add(steering);steering.name='Working steering wheel';
  speedNeedle=mesh(t.needle);speedNeedle.position.set(.47,1.19,.844);speedNeedle.name='Speedometer needle';
 }
 const wheels=[];
 for(const x of[-track,track])for(const z of[-axle,axle]){
  const pivot=new Group();pivot.position.set(x,wheelRadius,z);group.add(pivot);
  const wheelMesh=new Mesh(k.wheels.get(v.wheel),k.material);wheelMesh.castShadow=true;wheelMesh.receiveShadow=true;pivot.add(wheelMesh);wheels.push({pivot,mesh:wheelMesh,front:z>0});
 }
 const magic=new Group();magic.name='Flight enchantment';magic.visible=false;group.add(magic);
 const halo=new Mesh(k.magicHalo,k.magic);halo.scale.set(1,1,1.85);halo.position.y=.22;magic.add(halo);
 const sparkles=new Mesh(k.magicStars,k.magic);magic.add(sparkles);
 let disposed=false;
 const cockpit=t.info.eye?new Vector3(...t.info.eye):v.family==='roadster'?new Vector3(.4,1.48,t.info.seatZ+.02):null;
 const model={group,body,detail,accessories,driver,playerDriver,glass,wheels,lamps,magic,steering,speedNeedle,cockpit,driverX,wheelRadius,
  collisionRadius:rover?1.22:.95,collisionHeight:rover?2.40:1.65,name:v.name,variant:v,
  setCockpit(active=false){playerDriver.visible=!active;},
  setDriving(steer=0,speed=0){if(steering)steering.rotation.z=-steer*2.6;if(speedNeedle)speedNeedle.rotation.z=2.3-Math.min(1,Math.abs(speed)*3.6/200)*4.6;},
  setFlight(amount=0,time=0){
   const blend=Math.max(0,Math.min(1,amount));magic.visible=blend>.02;
   magic.scale.setScalar(Math.max(.001,blend));halo.position.y=.22+Math.sin(time*3)*.035;
   sparkles.position.y=Math.sin(time*4)*.09;sparkles.position.z=-((time*.7)%1.1);
   for(const w of wheels){w.pivot.rotation.z=-Math.sign(w.pivot.position.x)*blend*.72;w.pivot.position.y=wheelRadius+blend*.15;}
  },
  setDetail(level=0){const full=level===0;detail.visible=full;if(steering)steering.visible=full;if(speedNeedle)speedNeedle.visible=full;for(const w of wheels)w.mesh.geometry=full?k.wheels.get(v.wheel):rover?k.roverSimpleWheel:k.simpleWheel;group.userData.detailLevel=level;},
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of owned)g.dispose();},
 };
 return model;
}
