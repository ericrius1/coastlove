import assert from 'node:assert/strict';
import { COASTAL_MOODS, applyCoastalMood } from '../src/california/CoastalMood.js';
import { TemporalUpscale } from '../src/post/TemporalUpscale.js';

let cloudsReset = 0, historyReset = 0, refreshed = 0, sunUpdated = 0;
const params = Object.fromEntries(Object.keys(COASTAL_MOODS[0].post).map(key => [key, {value: 0}]));
const app = {
 settings: { timeOfDay: 12, renderScale: .8, timeSpeed: .05 },
 clouds: { coverage: {value: 0}, resetHistory() {cloudsReset++;} },
 haze: {density: {value: 0}, shafts: {value: 0}},
 post: {params, taau: {reset() {historyReset++;}}},
 ui: {s: {}, ui: {refresh() {refreshed++;}}},
 updateSun() {sunUpdated++;},
};
for (const entry of COASTAL_MOODS) {
 assert.equal(applyCoastalMood(app, entry.id), true);
 assert.equal(app.settings.coastalMood, entry.id);
 assert.equal(app.settings.timeOfDay, entry.hour);
 assert.equal(app.settings.timeSpeed, 0);
 assert.equal(app.settings.renderScale, .8, 'moods preserve player picture quality');
 assert.ok(app.settings.exposure > 0 && Number.isFinite(app.settings.exposure));
 assert.equal(app.ui.s.advance, false);
 assert.ok(Math.abs(.55 * 2 ** app.ui.s.exposure - app.settings.exposure) < 1e-12, 'advanced controls reflect applied exposure');
 assert.equal(app.ui.s.clouds, app.clouds.coverage.value);
}
assert.equal(cloudsReset, 4); assert.equal(historyReset, 4); assert.equal(refreshed, 4); assert.equal(sunUpdated, 4);
const settings = {...app.settings};
assert.equal(applyCoastalMood(app, 'unrecognized'), false);
assert.deepEqual(app.settings, settings, 'invalid mood has no side effects');
assert.equal(historyReset, 4);
assert.equal(applyCoastalMood({settings:{}}, 'pacific'), true, 'optional effects/UI can be absent');
const history = {_needsRestart:false, _hasPrevInvVP:true, _nextPrev:{}};
TemporalUpscale.prototype.reset.call(history);
assert.equal(history._needsRestart, true);
assert.equal(history._hasPrevInvVP, false);
assert.equal(history._nextPrev, null);
console.log('ok coastal moods preserve quality, synchronize controls and reset discontinuous scene history');
