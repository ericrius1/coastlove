import { PLACES } from '../src/california/Region.js';
import { safeAt } from '../src/exploration/Navigation.js';
export function checkCalifornia(app){
 const e=app.exploration,p=app.player,input=app.input,key='coastlove.journal.v1';
 const old={read:new Set(e.read),seen:new Set(e.seen),found:new Set(e.found),save:localStorage.getItem(key),position:p.position.clone(),yaw:p.yaw,hour:app.settings.timeOfDay,timeSpeed:app.settings.timeSpeed,target:e.target};
 const results=[];const check=(condition,message)=>{if(!condition)throw new Error(message);results.push(message);};
 const press=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));e.beforeUpdate();window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));input.endFrame();};
 try{
  for(const [code,mode]of[['Digit2','plane'],['Digit1','boat'],['Digit3','walk'],['Numpad2','plane'],['Numpad3','walk']]){
   press(code);check(p.mode===mode,`${code} selects ${mode}`);check(app.boatCtl.driven===(mode==='boat'),'vehicle ownership remains exclusive');check(e.plane.group.visible===(mode==='plane'),'plane visible only while flying');
  }
  for(const place of PLACES){
   e.visit(place);check(p.mode===(place.water?'boat':'walk'),`visit ${place.label}`);
   check(safeAt(app.terrainData,app.colliders,p.position.x,p.position.z,!!place.water,place.water?5:.6),`safe full footprint at ${place.label}`);
   e.update(.016);
  }
  check(e.life.residents.every(r=>r.procedural||r.vendor.character),'all nine characters available');
  check(e.life.animals.length===32,'all 32 California animals present');
  const originalYaw=p.yaw;app.settings.timeOfDay=23.5;
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
  input.dom.dispatchEvent(new WheelEvent('wheel',{deltaX:180,deltaY:0,bubbles:true,cancelable:true}));e.beforeUpdate();
  check(Math.abs(app.settings.timeOfDay-.5)<1e-6,'Z + horizontal trackpad advances across midnight');
  input.dom.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true}));e.beforeUpdate();
  check(Math.abs(app.settings.timeOfDay-23.5)<1e-6,'Z + vertical trackpad rewinds across midnight');
  check(input.wheel===0&&p.yaw===originalYaw,'scrubbing does not zoom or rotate the camera');
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));input.endFrame();
  app.settings.timeOfDay=22;e.landmarks.update(.016,p.position,22);check(e.landmarks.beam.visible&&e.landmarks.biolum.visible,'lighthouse and grotto glow activate at night');
  e.landmarks.update(.016,p.position,12);check(!e.landmarks.beam.visible&&!e.landmarks.biolum.visible,'night effects turn off during the day');
  e.read.clear();e.dialogue=e.life.residents[0];e.page=2;
  input.pressed.add('KeyE');input.pressed.add('KeyJ');e.beforeUpdate();input.endFrame();
  check(e.read.has('ines')&&e.journalOpen,'E + J saves the completed story before opening chart');
  check(JSON.parse(localStorage.getItem(key)).read.includes('ines'),'journal saves persist');
  for(const r of e.life.residents){e.dialogue=r;e.page=2;e.advance();}
  e.seen.add('fox');e.seen.add('seaLion');PLACES.forEach(place=>e.found.add(place.id));e.save();
  check(e.find('.exp-entries').textContent.includes('The whole coast, remembered'),'all discoveries complete the expedition');
  return results;
 }finally{
  input.keys.clear();input.pressed.clear();input.consumeLook();input.consumeTimeScrub();input.consumeWheel();
  e.read=old.read;e.seen=old.seen;e.found=old.found;
  if(old.save===null)localStorage.removeItem(key);else localStorage.setItem(key,old.save);
  e.closeDialogue();e.toggleJournal(false);e.refresh();e.target=old.target;
  p.mode='walk';p.position.copy(old.position);p.yaw=old.yaw;p.velocity.set(0,0,0);app.boatCtl.reset();app.boatCtl.driven=false;e.plane.group.visible=false;
  app.settings.timeOfDay=old.hour;app.settings.timeSpeed=old.timeSpeed;
 }
}
