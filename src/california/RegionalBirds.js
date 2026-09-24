import { NEIGHBORHOODS } from './Neighborhoods.js';
import { COAST_DRIVE } from './Coastline.js';
import { SETTLEMENTS } from './Settlements.js';
import { REGION } from './Region.js';
import { regionAt } from './Geography.js';
import { coastFieldAt } from './CoastField.js';
import { Flyer } from '../world/wildlife/Flight.js';
import { BIRD, SPECIES } from '../world/wildlife/BirdShapes.js';
import { mulberry32 } from '../util/Noise.js';
import { resetPrevious } from '../world/wildlife/BirdPose.js';

export const MAX_REGIONAL_BIRDS=280;
export function habitatSpecies(region,inland=false){
 if(inland)return region==='north'?[BIRD.JAY,BIRD.RAVEN]:[BIRD.RAVEN];
 return region==='south'?[BIRD.GULL,BIRD.PELICAN,BIRD.TERN,BIRD.CORMORANT]:[BIRD.GULL,BIRD.PELICAN,BIRD.CORMORANT];
}
export class RegionalBirds {
 constructor(terrain){
  this.terrain=terrain;this.time=0;this.flocks=[];this.activeCount=0;const rng=mulberry32(4028);
  const add=(x,z,inland=false)=>{
   const region=regionAt(x,z),speciesList=habitatSpecies(region,inland),species=speciesList[this.flocks.length%speciesList.length];
   const r=inland?45:100+rng()*90,count=inland?4:7+Math.floor(rng()*7),ground=Math.max(0,terrain.heightAt(x,z));
   const flock={x,z,region,inland,species,r,phase:rng()*6.28,height:ground+(inland?25:species===BIRD.PELICAN?10:25)+rng()*12,birds:[],visible:false};
   for(let i=0;i<count;i++){
    const base=species>4?BIRD.GULL:species,f=new Flyer(base,rng(),rng);f.P.species=species;f.P.sp=f.sp=SPECIES[species];
    f.P.scale=species===BIRD.GULL?1.32:species===BIRD.CORMORANT?1.25:1;
    flock.birds.push(f);
   }
   this.flocks.push(flock);
  };
  // A coast-following habitat roughly every 20 real km, plus towns and islands.
  let travel=0;for(let i=1;i<COAST_DRIVE.length/2;i++){
   const a=COAST_DRIVE[i-1],b=COAST_DRIVE[i];travel+=Math.hypot(a[0]-b[0],a[1]-b[1]);if(travel<18000)continue;travel=0;
   const x=b[0],z=b[1],dx=coastFieldAt(x+20,z)-coastFieldAt(x-20,z),dz=coastFieldAt(x,z+20)-coastFieldAt(x,z-20),l=Math.hypot(dx,dz)||1;
   add(x+dx/l*145,z+dz/l*145);
  }
  for(const town of [...SETTLEMENTS,...NEIGHBORHOODS]){add(town.x,town.z,true);if(town.region==='north'&&town.style==='forest')add(town.x+60,town.z-30,true);}
  for(const island of REGION.islands){add(island.x,island.z-island.rz-45);add(island.x+island.rx*.65,island.z+island.rz+45);}
 }
 update(dt,batch,camera){
  this.time+=dt;this.activeCount=0;
  // Sort nearby habitats only; fixed draw/simulation capacity in dense bays.
  const nearby=[];
  for(const flock of this.flocks){const d=Math.hypot(flock.x-camera.position.x,flock.z-camera.position.z);if(d<1600)nearby.push({flock,d});else flock.visible=false;}
  nearby.sort((a,b)=>a.d-b.d);
  for(const {flock,d}of nearby){
   const fresh=!flock.visible;flock.visible=true;
   for(let i=0;i<flock.birds.length&&this.activeCount<MAX_REGIONAL_BIRDS;i++){
    const f=flock.birds[i],line=flock.species===BIRD.PELICAN||flock.species===BIRD.CORMORANT;
    const a=flock.phase+this.time*(line?.045:.065)-(line?i*.045:i*.48),r=flock.r+(line?0:Math.sin(i*9)*22);
    f.x=flock.x+Math.cos(a)*r;f.z=flock.z+Math.sin(a)*r;f.yaw=-a;f.bank=line?.15:.3;
    f.y=Math.max(flock.height+Math.sin(a*2+i*.14)*3,this.terrain.heightAt(f.x,f.z)+(flock.inland?14:8));
    f.flapWant=flock.species===BIRD.JAY?.85:flock.species===BIRD.CORMORANT?.65:Math.sin(this.time*.35-i*.5)>0.45?.8:0;
    f.animate(dt);if(fresh)resetPrevious(f.P);
    const scale=f.P.scale;f.P.scale*=Math.max(0,Math.min(1,(1600-d)/250));batch.write(f.P);f.P.scale=scale;this.activeCount++;
   }
  }
 }
}
