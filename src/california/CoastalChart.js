import { PLACES, REGION } from './Region.js';
export class CoastalChart {
 constructor(canvas,terrain,onSelect){
  this.canvas=canvas;this.context=canvas.getContext('2d');this.background=document.createElement('canvas');this.background.width=this.background.height=640;
  const ctx=this.background.getContext('2d'),image=ctx.createImageData(640,640);
  for(let j=0;j<640;j++)for(let i=0;i<640;i++){
   const x=(i/640-.5)*8192,z=(j/640-.5)*8192,h=terrain.heightAt(x,z),k=(j*640+i)*4;
   let col;
   if(h<0){const t=Math.min(1,-h/45);col=[34-16*t,111-51*t,120-40*t];}
   else {const light=Math.max(.65,Math.min(1.15,1+(terrain.heightAt(x-12,z-12)-terrain.heightAt(x+12,z+12))*.014));col=h<4?[196,189,139]:[150-Math.min(35,h*.055),154-Math.min(32,h*.06),104-Math.min(22,h*.06)];col=col.map(c=>c*light);}
   image.data.set([...col,255],k);
  }
  ctx.putImageData(image,0,0);
  canvas.onclick=e=>{const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*640,y=(e.clientY-rect.top)/rect.height*640;const nearest=PLACES.map(p=>({p,d:Math.hypot(this.px(p.x)-x,this.px(p.z)-y)})).sort((a,b)=>a.d-b.d)[0];if(nearest.d<25)onSelect(nearest.p);};
 }
 px(n){return(n/8192+.5)*640;}
 draw(player,target,found){
  const ctx=this.context;ctx.drawImage(this.background,0,0);ctx.strokeStyle='#e8e0c214';ctx.lineWidth=1;
  for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*80,0);ctx.lineTo(i*80,640);ctx.moveTo(0,i*80);ctx.lineTo(640,i*80);ctx.stroke();}
  ctx.font='11px Georgia';ctx.textAlign='center';ctx.fillStyle='#f8efd1bb';
  for(const r of REGION.islands)ctx.fillText(r.name.toUpperCase(),this.px(r.x),this.px(r.z)+43);
  ctx.font='italic 22px Georgia';ctx.fillStyle='#d1e2d570';ctx.fillText('Santa Barbara Channel',345,418);
  ctx.font='11px Arial';ctx.fillStyle='#203d36';ctx.fillText('SANTA BARBARA',324,300);ctx.fillText('VENTURA',502,374);
  if(target){const pos=target.position||target;ctx.setLineDash([4,7]);ctx.strokeStyle='#ffdf9aaa';ctx.beginPath();ctx.moveTo(this.px(player.x),this.px(player.z));ctx.lineTo(this.px(pos.x),this.px(pos.z));ctx.stroke();ctx.setLineDash([]);}
  for(const place of PLACES){const x=this.px(place.x),y=this.px(place.z);ctx.beginPath();ctx.arc(x,y,target?.id===place.id?6:4,0,Math.PI*2);ctx.fillStyle=found.has(place.id)?'#ffe1a0':'#dbe4cc';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#203d36';ctx.stroke();}
  ctx.beginPath();ctx.arc(this.px(player.x),this.px(player.z),5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#172f2c';ctx.stroke();
  ctx.textAlign='left';ctx.fillStyle='#f5efd9';ctx.font='12px Arial';ctx.fillText('N ↑',20,28);ctx.fillText('1 km',20,612);ctx.fillRect(20,620,640/8.192,2);
 }
}
