// Continuous pixel deltas preserve trackpad precision. Positive swipes advance
// time; left/up rewinds, including across midnight. No frame-rate dependence.
export const wrapHour = hour => ((hour % 24) + 24) % 24;
export function wheelHours(event) {
 const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
 const pixels=delta*(event.deltaMode===1?16:event.deltaMode===2?800:1);
 return Math.max(-3,Math.min(3,pixels/180));
}
export function clockLabel(hour) {
 const minutes=Math.floor(wrapHour(hour)*60);
 return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
