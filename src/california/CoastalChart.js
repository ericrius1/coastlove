import { PLACES } from './Region.js';
import { INLAND, GEO } from './Geography.js';
import { coastFieldAt } from './CoastField.js';
export class CoastalChart {
 constructor(canvas,terrain,onSelect){
  this.canvas=canvas;this.context=canvas.getContext('2d');this.bounds={x:-650000,z:-910000,size:1160000};this.view={...this.bounds};this.terrain=terrain;
  this.background=document.createElement('canvas');this.background.width=this.background.height=1024;
  const ctx=this.background.getContext('2d'),image=ctx.createImageData(1024,1024);
  for(let j=0;j<1024;j++)for(let i=0;i<1024;i++){
   const x=this.bounds.x+i/1024*this.bounds.size,z=this.bounds.z+j/1024*this.bounds.size,h=terrain.heightAt(x,z),d=coastFieldAt(x,z),k=(j*1024+i)*4;
   let col;
   if(h<0){const t=Math.min(1,-h/65);col=[34-16*t,111-51*t,120-40*t];}
   else {const light=Math.max(.65,Math.min(1.15,1+(terrain.heightAt(x-18,z-18)-terrain.heightAt(x+18,z+18))*.008)),north=Math.max(0,Math.min(1,(-z-15000)/6000));col=h<4?[196,189,139]:[151-45*north,155-20*north,109-north];col=col.map(c=>c*light*(d<-INLAND?.68:1));}
   image.data.set([...col,255],k);
  }
  ctx.putImageData(image,0,0);
  const point=e=>{const rect=canvas.getBoundingClientRect();return{x:(e.clientX-rect.left)/rect.width*640,y:(e.clientY-rect.top)/rect.height*640};};
  canvas.addEventListener('wheel',e=>{
   if(e.getModifierState?.('Z'))return;e.preventDefault();const p=point(e),size=Math.max(1600,Math.min(this.bounds.size,this.view.size*Math.exp(e.deltaY*.0015))),ratio=size/this.view.size;
   this.view.x+=p.x/640*this.view.size*(1-ratio);this.view.z+=p.y/640*this.view.size*(1-ratio);this.view.size=size;this.redraw();
  },{passive:false});
  canvas.onpointerdown=e=>{this.drag={...point(e),x0:this.view.x,z0:this.view.z,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!this.drag)return;const p=point(e),dx=p.x-this.drag.x,dy=p.y-this.drag.y;if(Math.hypot(dx,dy)>4)this.drag.moved=true;if(!this.drag.moved)return;this.view.x=this.drag.x0-dx/640*this.view.size;this.view.z=this.drag.z0-dy/640*this.view.size;this.redraw();};
  canvas.onpointerup=e=>{const drag=this.drag;this.drag=null;if(drag?.moved)return;const p=point(e),nearest=PLACES.map(place=>({place,d:Math.hypot(this.px(place.x)-p.x,this.pz(place.z)-p.y)})).sort((a,b)=>a.d-b.d)[0];if(nearest.d<22)onSelect(nearest.place);};
  canvas.ondblclick=()=>{this.view={...this.bounds};this.redraw();};
 }
 px(n){return(n-this.view.x)/this.view.size*640;}
 pz(n){return(n-this.view.z)/this.view.size*640;}
 redraw(){if(this.last)this.draw(...this.last);}
 draw(player,target,found){
  this.last=[player,target,found];const ctx=this.context;ctx.fillStyle='#153e49';ctx.fillRect(0,0,640,640);
  ctx.drawImage(this.background,this.px(this.bounds.x),this.pz(this.bounds.z),this.bounds.size/this.view.size*640,this.bounds.size/this.view.size*640);
  ctx.save();ctx.beginPath();ctx.rect(0,0,640,640);ctx.clip();
  ctx.strokeStyle='#eddba177';ctx.lineWidth=1;
  for(const route of this.terrain.routes){ctx.beginPath();route.points.forEach((p,i)=>i?ctx.lineTo(this.px(p.x),this.pz(p.z)):ctx.moveTo(this.px(p.x),this.pz(p.z)));ctx.stroke();}
  if(target){const p=target.position||target;ctx.setLineDash([4,7]);ctx.strokeStyle='#ffdf9aaa';ctx.beginPath();ctx.moveTo(this.px(player.x),this.pz(player.z));ctx.lineTo(this.px(p.x),this.pz(p.z));ctx.stroke();ctx.setLineDash([]);}
  ctx.font='italic 21px Georgia';ctx.fillStyle='#d1e2d570';ctx.fillText('Pacific Ocean',45,365);
  const labels=[];ctx.font='10px Arial';ctx.textAlign='left';
  for(const place of PLACES){
   const x=this.px(place.x),y=this.pz(place.z);if(x<0||x>640||y<0||y>640)continue;
   ctx.beginPath();ctx.arc(x,y,target?.id===place.id?6:place.major?4.5:3,0,Math.PI*2);ctx.fillStyle=found.has(place.id)?'#ffe1a0':'#dbe4cc';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#203d36';ctx.stroke();
   if(place.major||this.view.size<13000||['oregon','crescent','mendocino','monterey','harbor','border'].includes(place.id)){
    if(!place.major&&place.id!=='oregon'&&labels.some(p=>Math.abs(p.y-y)<13&&Math.abs(p.x-x)<100))continue;
    ctx.fillStyle='#112c27';ctx.fillRect(x+7,y-8,ctx.measureText(place.label).width+7,14);ctx.fillStyle='#f6edd0';ctx.fillText(place.label,x+10,y+3);labels.push({x,y});
   }
  }
  ctx.beginPath();ctx.arc(this.px(player.x),this.pz(player.z),5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#172f2c';ctx.stroke();ctx.restore();
  ctx.textAlign='left';ctx.fillStyle='#f5efd9';ctx.font='12px Arial';ctx.fillText('N ↑',20,28);
  const realKm=this.view.size*GEO.scale/1000,barKm=realKm>500?100:realKm>100?25:10;
  ctx.fillText(`${barKm} real km · 1:1 travel scale`,20,600);ctx.fillRect(20,610,barKm/realKm*640,2);ctx.fillText('Bright land: 10-mile coastal band',20,630);
 }
}
