import {Group,Mesh,Vector3} from '../engine/index.js';
import {prepare,mergePrepared,box,rod,mat4} from '../world/boat/GeoKit.js';
import {createPropMaterial} from '../game/GameMaterials.js';
// OSM suspension anchor centres. Official dimensions: 1,280 m main span,
// 343 m side spans, 27 m total width, towers 227 m above water.
export const GG_A={x:-246749.76811009002,z:-380656.77062884544},GG_B={x:-246880.30270330913,z:-382618.4323529898};
const length=Math.hypot(GG_B.x-GG_A.x,GG_B.z-GG_A.z),dx=(GG_B.x-GG_A.x)/length,dz=(GG_B.z-GG_A.z)/length;
export function goldenGateHeight(x,z,raw,knownRoad=false){
 const s=(x-GG_A.x)*dx+(z-GG_A.z)*dz,side=Math.abs((x-GG_A.x)*dz-(z-GG_A.z)*dx);
 if(!knownRoad&&(side>32||s< -380||s>length+400))return null;
 if(s>=0&&s<=length)return 75-12*((s-length/2)/(length/2))**2;
 const u=s<0?Math.max(0,1+s/380):Math.max(0,1-(s-length)/400),w=u*u*(3-2*u);
 // Grade the approaches between their land abutments and the suspension deck.
 // Sampling the valley below each point would bend the roadway into the valley.
 const abutment=s<0?56:76;
 return abutment+(63-abutment)*w;
}
export function goldenGateDeck(x,z){const s=(x-GG_A.x)*dx+(z-GG_A.z)*dz,side=Math.abs((x-GG_A.x)*dz-(z-GG_A.z)*dx);return s>=0&&s<=length&&side<=13.5?goldenGateHeight(x,z,0):null;}
export class GoldenGate {
 constructor(app){
  const group=this.group=new Group();group.name='Golden Gate Bridge · real scale';group.position.set(GG_A.x,0,GG_A.z);group.rotation.y=Math.atan2(dx,dz);app.scene.add(group);
  const parts=[],red=0xac573b,add=(g,c=red,m=null)=>parts.push(prepare(g,{color:c,matrix:m,rough:.74}));
  const deck=s=>75-12*((s-length/2)/(length/2))**2;
  for(let s=0;s<length;s+=16){
   const end=Math.min(length,s+16),h=(deck(s)+deck(end))/2,mid=(s+end)/2;
   add(box(27,2.8,end-s+.05),0x8a7160,mat4(0,h-1.45,mid,-Math.atan2(deck(end)-deck(s),end-s)));
   for(const side of[-1,1]){
    add(box(3,.3,end-s+.05),0xc9bba3,mat4(side*11.5,h+.10,mid,-Math.atan2(deck(end)-deck(s),end-s)));
    add(rod(new Vector3(side*13.2,deck(s)+1.3,s),new Vector3(side*13.2,deck(end)+1.3,end),.10,5));
    add(box(.13,1.4,.13),red,mat4(side*13.2,h+.7,mid));
   }
  }
  const towers=[(length-1280)/2,(length+1280)/2];
  for(const s of towers){
   for(const side of[-1,1]){
    add(box(10,6,20),0xaaa898,mat4(side*15,3,s));
    add(box(5.2,221,8),red,mat4(side*15,116.5,s));
    for(const y of[95,130,166,202,225])add(box(6.1,1.1,8.8),red,mat4(side*15,y,s));
   }
   for(const y of[45,89,131,172,211]){add(box(30,5.4,6),red,mat4(0,y,s));for(const side of[-1,1])add(rod(new Vector3(side*13,y+3,s),new Vector3(side*4,y+13,s),.6,5));}
  }
  const cable=s=>s<towers[0]?72+155*(s/towers[0])**.62:s>towers[1]?72+155*((length-s)/(length-towers[1]))**.62:86+141*((s-length/2)/640)**2;
  for(const side of[-1,1])for(let s=0;s<length;s+=15.24){const end=Math.min(length,s+15.24);add(rod(new Vector3(side*11.8,cable(s),s),new Vector3(side*11.8,cable(end),end),.46,7));add(rod(new Vector3(side*11.8,deck(s)+.3,s),new Vector3(side*11.8,cable(s),s),.034,5));}
  const mesh=new Mesh(mergePrepared(parts),createPropMaterial('International Orange'));mesh.castShadow=true;group.add(mesh);
 }
}
