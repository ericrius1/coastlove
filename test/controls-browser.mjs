import { PLACES } from '../src/california/Region.js';
import { safeAt } from '../src/exploration/Navigation.js';

// Run inside the loaded development game; checks the real Input/Player router.
export async function checkControls(app){
 const e=app.exploration,p=app.player,input=app.input,map=e.map,checks=[];
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const press=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));e.beforeUpdate();window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));};
 const end=()=>input.endFrame();
 const old={target:e.target,time:app.settings.timeOfDay,speed:app.settings.timeSpeed,found:new Set(e.found),enabled:input.enabled};
 try{
  input.enabled=true;input.keys.clear();input.pressed.clear();app.freeCam=false;e.closeDialogue();e.toggleJournal(false);e.toggleMap(false);
  const muted=app.audio.muted;press('KeyM');check(map.open&&!e.paused&&e.inputCaptured&&!map.el.hidden,'M opens an inset map, captures input, and leaves simulation running');check(app.audio.muted===muted,'M leaves sound unchanged');end();
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),started=e.traffic.time;for(let i=0;i<12;i++)await frame();check(e.traffic.time>started,'world simulation advances with map focused');
  const bounds=map.el.getBoundingClientRect();check(bounds.left>=10&&bounds.top>=10&&bounds.width>innerWidth*.85&&bounds.height>innerHeight*.85,'map nearly fills the screen with a visible border');
  const mode=p.mode;press('KeyE');check(p.mode===mode,'E cannot change vehicles behind map');end();
  map.view.fit();const rect=map.canvas.getBoundingClientRect(),anchor={x:Math.round(rect.left+rect.width*.6)-rect.left,y:Math.round(rect.top+rect.height*.4)-rect.top},before=map.view.world(anchor.x,anchor.y);
  map.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,clientX:rect.left+anchor.x,clientY:rect.top+anchor.y,cancelable:true,bubbles:true}));
  const after=map.view.world(anchor.x,anchor.y);check(map.view.zoom>1&&Math.hypot(before.x-after.x,before.z-after.z)<1e-6,'scroll zoom stays beneath pointer');
  const center=map.view.cx;map.canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true}));check(map.view.cx>center,'keyboard arrows pan');
  map.search.value='san jose';map.renderList();check(map.list.querySelectorAll('button').length===1&&map.list.textContent.includes('San José'),'search ignores accents');
  map.search.dispatchEvent(new KeyboardEvent('keydown',{key:'m',code:'KeyM',bubbles:true}));check(map.open&&!input.hit('KeyM'),'typing M in search does not toggle map');
  map.search.value='';map.renderList();check(map.list.querySelectorAll('button').length===PLACES.length,'all destinations are available');
  map.canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape',bubbles:true}));check(!map.open&&!e.paused,'Escape closes map and resumes controls');end();
  for(const place of PLACES){
   e.toggleMap(true);map.select(place,true);await map.travel();
   check(!map.open&&e.target===place,`${place.label}: map travel completes`);
   check(Math.hypot(p.position.x-place.x,p.position.z-place.z)<215,`${place.label}: local arrival`);
   check(p.mode===(place.water?'boat':'walk'),`${place.label}: correct arrival mode`);
   check(safeAt(app.terrainData,app.colliders,p.position.x,p.position.z,!!place.water,place.water?5:.6),`${place.label}: safe footprint`);
  }
  await e.visit(PLACES.find(p=>p.id==='harbor'));press('Digit1');end();check(p.mode==='boat','numeric boat shortcut remains');
  press('KeyE');const exited=p.mode;p.update(1/60);check(['walk','swim'].includes(exited)&&p.mode!=='deck','one E exits helm, without triggering legacy deck action');end();
  check(e.vehicles.nearby()?.kind==='boat','boat remains reachable after exit');press('KeyE');p.update(1/60);check(p.mode==='boat'&&app.boatCtl.driven,'one E re-enters and drives boat');end();
  for(const place of [PLACES.find(p=>p.id==='harbor'),PLACES.find(p=>p.major)]){
   await e.visit(place);press('Digit2');end();check(p.mode==='plane','numeric plane shortcut remains');
   press('KeyE');check(['walk','swim'].includes(p.mode)&&e.plane.parked&&e.plane.group.visible,'E lands, exits and leaves plane visible');check(e.vehicles.nearby()?.kind==='plane','landed aircraft is reachable');end();
   const heading=e.plane.heading;press('KeyE');check(p.mode==='plane'&&!e.plane.parked,'E re-enters parked plane');check(e.plane.heading===heading,'plane re-entry preserves heading');end();
  }
  press('KeyM');end();map.canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'j',code:'KeyJ',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyJ',bubbles:true}));check(!map.open&&e.journalOpen,'M map and J journal are mutually exclusive');end();
  e.toggleMap(true);check(!e.journalOpen&&map.open,'opening map closes journal');
  return {count:checks.length,checks};
 }finally{
  e.toggleMap(false);e.toggleJournal(false);e.traffic.release();e.plane.parked=false;e.plane.group.visible=false;
  input.keys.clear();input.pressed.clear();input.consumeLook();input.consumeWheel();input.enabled=old.enabled;
  await e.visit(PLACES.find(place=>place.id==='harbor'));e.target=old.target;e.found=old.found;e.refresh();app.settings.timeOfDay=old.time;app.settings.timeSpeed=old.speed;
 }
}
