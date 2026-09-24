// Run with the game open: checkMapPins(window.__app).
export async function checkMapPins(app){
 const e=app.exploration,map=e.map,checks=[];
 const check=(ok,text)=>{if(!ok)throw new Error(text);checks.push(text);};
 const frame=()=>new Promise(requestAnimationFrame);
 app.input.enabled=true;e.closeDialogue();e.toggleJournal(false);e.toggleMap(true);
 for(const [x,z,mode]of[[150,-130,'walk'],[150,300,'boat']]){
  e.toggleMap(true);map.view.focus(x,z,2048);map.selectPoint(map.view.screen(x,z));map.draw();
  const pin=map.selected;
  check(pin.custom&&Math.hypot(pin.x-x,pin.z-z)<1e-7,'empty map clicks preserve the chosen coordinates');
  check(!map.pin.hidden&&!!map.pin.querySelector('svg'),'selected point shows a teleport icon');
  check(document.activeElement===map.canvas,'clicking a point focuses the Enter shortcut');
  map.view.pan(30,-20);map.view.zoomAt(.8);map.draw();const pixel=map.view.screen(x,z);
  check(Math.abs(parseFloat(map.pin.style.left)-pixel.x)<1e-5&&Math.abs(parseFloat(map.pin.style.top)-pixel.y)<1e-5,'pin stays anchored while panning and zooming');
  const clock=e.traffic.time;for(let i=0;i<5;i++)await frame();check(e.traffic.time>clock&&!e.paused,'world keeps running with a selected pin');
  map.canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
  const deadline=performance.now()+20000;while(map.travelling&&performance.now()<deadline)await frame();
  check(!map.open&&!map.travelling,'Enter completes travel and closes the map');
  check(app.player.mode===mode,`${mode}: custom pin chooses the correct arrival mode`);
  check(Math.hypot(app.player.position.x-x,app.player.position.z-z)<=80,'custom arrival remains local to the pin');
  e.toggleMap(true);map.draw();check(map.selected===pin&&!map.pin.hidden,'reopening the map retains the selected pin');
 }
 const pin=map.selected;
 map.onKey({key:'Enter',code:'Enter',target:map.canvas,repeat:true,stopPropagation(){},preventDefault(){}});
 check(!map.travelling,'holding Enter does not queue another teleport');
 map.search.focus();map.search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));check(map.open&&!map.travelling&&map.selected===pin,'Enter in search does not unexpectedly teleport');
 e.toggleMap(false);return{count:checks.length,checks};
}
