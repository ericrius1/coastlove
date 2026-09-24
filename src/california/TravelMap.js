import { PLACES } from './Region.js';
import { GEO } from './Geography.js';
import { COAST_RINGS } from './Coastline.js';
import { AtlasView } from './AtlasView.js';

const REGIONS={south:'Southern California',central:'Central coast',bay:'Bay Area',north:'North coast',islands:'Channel Islands'};
export class TravelMap {
 constructor(exploration){
  this.e=exploration;this.open=false;this.selected=null;this.hover=null;this.dirty=true;
  this.el=document.createElement('section');this.el.className='exp-atlas';this.el.hidden=true;
  this.el.setAttribute('role','dialog');this.el.setAttribute('aria-modal','true');this.el.setAttribute('aria-label','California travel map');
  this.el.innerHTML=`<header class="atlas-head"><div><span class="atlas-kicker">COASTLOVE · A PACIFIC ATLAS</span><h2>The California coast</h2></div><div class="atlas-head-actions"><button data-action="notes">Field notes <kbd>J</kbd></button><button data-action="close" aria-label="Close map">Back to the coast <kbd>M</kbd></button></div></header><div class="atlas-body"><aside class="atlas-sidebar"><label class="atlas-search-label" for="atlas-search">FIND YOUR NEXT STOP</label><input id="atlas-search" type="search" placeholder="Search cities, islands, places…" autocomplete="off"><div class="atlas-list" aria-label="Map destinations"></div><div class="atlas-selection" aria-live="polite"><span class="atlas-kicker">CHOOSE A WAYPOINT</span><h3>Somewhere along the coast.</h3><p>Choose a marker or a place in the list to travel there.</p><button data-action="teleport" disabled>Teleport here <kbd>↵</kbd></button><button data-action="track" disabled>Set compass waypoint</button></div></aside><div class="atlas-stage"><canvas class="atlas-canvas" tabindex="0" aria-label="Interactive map. Drag to pan, scroll or pinch to zoom. Destinations are also available in the list."></canvas><div class="atlas-tools"><button data-action="in" aria-label="Zoom map in">+</button><button data-action="out" aria-label="Zoom map out">−</button><button data-action="locate">Find me</button><button data-action="fit">Whole coast</button></div><div class="atlas-legend"><span class="atlas-dot"></span> Cities & discoveries <span class="atlas-dot atlas-you"></span> You <span class="atlas-dot atlas-waypoint"></span> Waypoint</div></div></div><footer class="atlas-footer"><span>DRAG TO PAN <i>·</i> SCROLL / PINCH TO ZOOM <i>·</i> SELECT A MARKER TO TRAVEL</span><span><kbd>← ↑ ↓ →</kbd> Pan <kbd>+ −</kbd> Zoom <kbd>Esc</kbd> Close</span></footer>`;
  exploration.ui.append(this.el);
  this.canvas=this.el.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.view=new AtlasView(exploration.chart.bounds);
  this.background=this.paperBackground(exploration.chart.background);
  this.margin=document.createElement('canvas');this.margin.width=this.background.width;this.margin.height=this.background.height;
  const marginContext=this.margin.getContext('2d');marginContext.filter='blur(18px)';marginContext.drawImage(this.background,-24,-24,this.margin.width+48,this.margin.height+48);
  this.list=this.el.querySelector('.atlas-list');this.search=this.el.querySelector('input');this.detail=this.el.querySelector('.atlas-selection');
  this.buttons=Object.fromEntries([...this.el.querySelectorAll('[data-action]')].map(b=>[b.dataset.action,b]));
  this.buttons.close.onclick=()=>exploration.toggleMap(false);
  this.buttons.notes.onclick=()=>exploration.toggleJournal(true);
  this.buttons.in.onclick=()=>this.zoom(1.4);this.buttons.out.onclick=()=>this.zoom(1/1.4);
  this.buttons.fit.onclick=()=>{this.view.fit();this.invalidate();};
  this.buttons.locate.onclick=()=>{const p=exploration.app.player.position;this.view.focus(p.x,p.z,Math.max(5,this.view.zoom));this.invalidate();};
  this.buttons.teleport.onclick=()=>this.travel();
  this.buttons.track.onclick=()=>{if(!this.selected)return;exploration.target=this.selected;exploration.refresh();exploration.toggleMap(false);};
  this.search.oninput=()=>this.renderList();
  this.el.addEventListener('keydown',event=>this.onKey(event));
  this.canvas.addEventListener('wheel',event=>{
   event.preventDefault();event.stopPropagation();const p=this.point(event),unit=event.deltaMode===1?16:event.deltaMode===2?this.view.height:1;
   if(event.shiftKey)this.view.pan(-event.deltaX*unit,-event.deltaY*unit);
   else this.view.zoomAt(Math.exp(-event.deltaY*unit*(event.ctrlKey?.012:.002)),p.x,p.y);
   this.invalidate();
  },{passive:false});
  this.canvas.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;this.canvas.focus();const p=this.point(event);this.drag={...p,moved:false};this.canvas.setPointerCapture(event.pointerId);
  });
  this.canvas.addEventListener('pointermove',event=>{
   const p=this.point(event);
   if(this.drag){const dx=p.x-this.drag.x,dy=p.y-this.drag.y;if(this.drag.moved||Math.hypot(dx,dy)>4){this.drag.moved=true;this.view.pan(dx,dy);this.drag.x=p.x;this.drag.y=p.y;this.invalidate();}}
   else{const place=this.hit(p);if(this.hover!==place){this.hover=place;this.invalidate();}this.canvas.style.cursor=place?'pointer':'grab';}
  });
  this.canvas.addEventListener('pointerup',event=>{
   if(!this.drag)return;const moved=this.drag.moved;this.drag=null;
   if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
   if(!moved){const p=this.hit(this.point(event));if(p)this.select(p);}
  });
  this.canvas.addEventListener('pointercancel',()=>{this.drag=null;});
  this.canvas.addEventListener('lostpointercapture',()=>{this.drag=null;});
  this.canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.hover=null;this.invalidate();}});
  this.canvas.addEventListener('dblclick',event=>{event.preventDefault();const p=this.point(event);this.view.zoomAt(1.8,p.x,p.y);this.invalidate();});
  this.observer=new ResizeObserver(()=>{if(this.open)this.resize();});this.observer.observe(this.canvas);
  this.renderList();
 }
 paperBackground(source){
  const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);
  const img=ctx.getImageData(0,0,c.width,c.height);
  for(let i=0;i<img.data.length;i+=4){const r=img.data[i],g=img.data[i+1],b=img.data[i+2],water=b>r*1.25,grain=((i*13%31)-15)*.15;
   const shade=water?.90+g/1250:.69+(r+g+b)/1700;
   const base=water?[184,196,183]:[235,216,177];for(let k=0;k<3;k++)img.data[i+k]=base[k]*shade+grain;
  }
  ctx.putImageData(img,0,0);return c;
 }
 show(open){
  this.open=open;this.el.hidden=!open;this.e.ui.classList.toggle('atlas-open',open);this.drag=null;
  if(open){this.renderList();this.resize();this.buttons.close.focus({preventScroll:true});}
  else{this.hover=null;if(this.el.contains(document.activeElement))document.activeElement.blur();this.e.app.input.consumeLook();this.e.app.input.consumeWheel();}
 }
 resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);this.view.resize(rect.width,rect.height);this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.invalidate();}
 point(event){const rect=this.canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
 hit(point){let nearest=null,distance=14;for(const place of PLACES){const p=this.view.screen(place.x,place.z),d=Math.hypot(point.x-p.x,point.y-p.y);if(d<distance){nearest=place;distance=d;}}return nearest;}
 select(place,focus=false){
  this.selected=place;const box=this.detail;box.querySelector('.atlas-kicker').textContent=place.major?'CITY WAYPOINT':(REGIONS[place.region]||'COASTAL DISCOVERY').toUpperCase();
  box.querySelector('h3').textContent=place.label;box.querySelector('p').textContent=place.hint;
  this.buttons.teleport.disabled=this.buttons.track.disabled=false;
  for(const button of this.list.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.id===place.id));
  if(focus)this.view.focus(place.x,place.z,Math.max(this.view.zoom,4));
  this.invalidate();
 }
 travel(){if(this.selected){this.e.visit(this.selected);}}
 renderList(){
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),query=normalize(this.search.value.trim());this.list.replaceChildren();
  for(const place of PLACES){if(query&&!normalize(place.label).includes(query))continue;
   const button=document.createElement('button');button.dataset.id=place.id;button.setAttribute('aria-pressed',String(this.selected?.id===place.id));
   const title=document.createElement('span');title.textContent=place.label;const tag=document.createElement('small');tag.textContent=place.major?'CITY':this.e.found.has(place.id)?'VISITED':REGIONS[place.region]||'DISCOVERY';button.append(title,tag);button.onclick=()=>this.select(place,true);this.list.append(button);
  }
  if(!this.list.childElementCount){const p=document.createElement('p');p.className='atlas-empty';p.textContent='No places found. Try another name.';this.list.append(p);}
 }
 onKey(event){
  event.stopPropagation();const typing=event.target===this.search;
  if(event.key==='Escape'||event.code==='KeyM'&&!typing){event.preventDefault();if(!event.repeat){this.e.app.input.keys.add(event.code);this.e.toggleMap(false);}return;}
  if(event.code==='KeyJ'&&!typing){event.preventDefault();if(!event.repeat){this.e.app.input.keys.add(event.code);this.e.toggleJournal(true);}return;}
  if(event.key==='Tab'){
   const focusable=[...this.el.querySelectorAll('button:not(:disabled),input,canvas')].filter(el=>el.getClientRects().length),first=focusable[0],last=focusable.at(-1);
   if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}return;
  }
  if(typing)return;
  const d={ArrowLeft:[85,0],ArrowRight:[-85,0],ArrowUp:[0,85],ArrowDown:[0,-85]}[event.key];
  if(d){event.preventDefault();this.view.pan(...d);this.invalidate();}
  else if(['+','=','-','_'].includes(event.key)){event.preventDefault();this.zoom(['-','_'].includes(event.key)?1/1.3:1.3);}
  else if(event.key==='Enter'&&event.target===this.canvas){event.preventDefault();this.travel();}
 }
 zoom(factor){this.view.zoomAt(factor);this.invalidate();}
 invalidate(){this.dirty=true;}
 update(){if(!this.open)return;const p=this.e.app.player.position,key=`${Math.round(p.x)}:${Math.round(p.z)}:${this.e.target?.id}`;if(key!==this.lastPlayer){this.lastPlayer=key;this.dirty=true;}if(this.dirty){this.draw();this.dirty=false;}}
 draw(){
  const ctx=this.ctx,v=this.view,W=v.width,H=v.height,b=v.bounds,to=(x,z)=>v.screen(x,z);ctx.clearRect(0,0,W,H);ctx.fillStyle='#abbbae';ctx.fillRect(0,0,W,H);
  const p=to(b.x,b.z),size=b.size*v.scale,bg=this.background;
  // Bleed the outer terrain colors into wide-screen margins so the edge of
  // the survey never looks like an invented straight coastline.
  if(p.x>0)ctx.drawImage(this.margin,24,0,1,bg.height,0,p.y,p.x,size);
  if(p.x+size<W)ctx.drawImage(this.margin,bg.width-25,0,1,bg.height,p.x+size,p.y,W-p.x-size,size);
  ctx.drawImage(bg,p.x,p.y,size,size);
  ctx.strokeStyle='#5b695145';ctx.lineWidth=.7;
  for(const ring of COAST_RINGS){ctx.beginPath();ring.forEach(([x,z],i)=>{const p=to(x,z);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();}
  ctx.strokeStyle='#85725790';ctx.lineWidth=v.zoom>4?1.3:.65;
  for(const route of this.e.app.terrainData.routes){ctx.beginPath();route.points.forEach((p,i)=>{const s=to(p.x,p.z);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});ctx.stroke();}
  const ocean=to(-13000,-14000);ctx.save();ctx.translate(ocean.x,ocean.y);ctx.rotate(-.42);ctx.font='italic 28px Georgia';ctx.fillStyle='#52655c80';ctx.textAlign='center';ctx.fillText('P a c i f i c   O c e a n',0,0);ctx.restore();
  const occupied=[],chosen=this.hover||this.selected;
  const ordered=[...PLACES].sort((a,b)=>Number(b===chosen)-Number(a===chosen)||Number(b.major)-Number(a.major));
  for(const place of ordered){
   const p=to(place.x,place.z);if(p.x<-20||p.x>W+20||p.y<-20||p.y>H+20)continue;
   const selected=place===this.selected,active=this.e.target?.id===place.id,r=selected?8:place.major?5.5:3.5;
   ctx.fillStyle=selected?'#a63c2e':active?'#ab6836':'#3c4436';ctx.strokeStyle='#f3e4c3';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(place===chosen||place.major||v.zoom>2||['oregon','harbor','monterey','mendocino','border'].includes(place.id)){
    ctx.font=`${place===chosen?'bold ':''}${place.major?13:12}px Georgia`;const width=ctx.measureText(place.label).width+12,x=Math.min(W-width-8,p.x+12),y=p.y-9;
    if(place!==chosen&&occupied.some(b=>x<b.x+b.w&&x+width>b.x&&Math.abs(y-b.y)<19))continue;
    occupied.push({x,y,w:width});ctx.fillStyle=place===chosen?'#a63c2e':'#efe0bded';ctx.fillRect(x,y,width,20);ctx.fillStyle=place===chosen?'#fff2d6':'#374034';ctx.textAlign='left';ctx.fillText(place.label,x+6,y+14);
   }
  }
  const me=to(this.e.app.player.position.x,this.e.app.player.position.z);ctx.fillStyle='#244f52';ctx.strokeStyle='#fff1cc';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(me.x,me.y-9);ctx.lineTo(me.x+7,me.y+7);ctx.lineTo(me.x,me.y+3);ctx.lineTo(me.x-7,me.y+7);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#344b41';ctx.textAlign='center';ctx.font='bold 14px Georgia';ctx.fillText('N',35,31);ctx.beginPath();ctx.moveTo(35,40);ctx.lineTo(30,57);ctx.lineTo(35,53);ctx.lineTo(40,57);ctx.closePath();ctx.fill();
  const targetKm=140/v.scale*GEO.scale/1000,km=[.5,1,2,5,10,25,50,100].filter(n=>n<=targetKm).at(-1)||.5,len=km*1000/GEO.scale*v.scale;
  ctx.textAlign='left';ctx.font='11px Arial';ctx.fillText(`${km} real km`,24,H-41);ctx.fillRect(24,H-34,len,2);
  ctx.font='10px Arial';ctx.fillStyle='#46594b';ctx.fillText('CALIFORNIA · 1:32 TRAVEL SCALE',24,H-16);
 }
}
