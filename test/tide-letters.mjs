import assert from 'node:assert/strict';
import { TideLetters, TIDE_LETTERS, letterHourReady } from '../src/exploration/TideLetters.js';
import { CALIFORNIA_STORIES, PLACES } from '../src/california/Region.js';
import { habitatAt } from '../src/california/Habitat.js';

assert.equal(new Set(TIDE_LETTERS.map(x => x.id)).size, 6);
for (const letter of TIDE_LETTERS) assert.ok(PLACES.some(p => p.id === letter.placeId));
for (const story of CALIFORNIA_STORIES) assert.ok(story.pages.length >= 4 && story.pages.every(p => typeof p === 'string' && p.length > 70));
for (const [window, yes, no] of [
	['night', [20, 0, 4.99, 24, -1], [5, 8, 19.99]],
	['dawn', [5, 6.5, 7.99, 30], [4.99, 8, 20]],
	['dusk', [18, 19, 20.49, 43], [17.99, 20.5, 0]],
]) {
	for (const hour of yes) assert.ok(letterHourReady(window, hour), `${window} at ${hour}`);
	for (const hour of no) assert.equal(letterHourReady(window, hour), false, `${window} at ${hour}`);
}
assert.equal(letterHourReady('any', NaN), false);
assert.equal(new TideLetters(null).found.size, 0);
assert.equal(new TideLetters(['bad', 'stars', 'home']).found.size, 0);
assert.deepEqual([...new TideLetters(['seed', 'bell', 'stars']).found], ['seed', 'bell']);

function stateFor(letters, extra = {}) {
	const place = letters.place;
	return { position: {x: place?.x ?? 0, y: 3, z: place?.z ?? 0}, hour: 12, mode: 'walk', groundY: 3, ...extra };
}
function linger(letters, state, seconds, fps = 60) {
	let result = null;
	for (let frame = 0; frame < seconds * fps; frame++) result = letters.update(1/fps, state) || result;
	return result;
}

for (const fps of [30, 60, 120]) {
	const letters = new TideLetters(), state = stateFor(letters);
	letters.update(1/fps, state); // arriving is not standing still
	assert.equal(linger(letters, state, 4, fps), null);
	assert.equal(linger(letters, state, 1, fps)?.id, 'seed', `five seconds at ${fps} fps`);
}
const letters = new TideLetters(), state = stateFor(letters);
linger(letters, state, 4);
linger(letters, {...state, blocked: true}, 12);
assert.equal(letters.found.size, 0, 'journal time cannot unlock a letter');
assert.equal(letters.elapsed, 0);
linger(letters, {...state, mode: 'plane'}, 8);
assert.equal(letters.found.size, 0, 'flying above a clue cannot collect it');
linger(letters, {...state, position: {...state.position, y: 100}}, 8);
assert.equal(letters.found.size, 0, 'correct horizontal position needs correct height');
letters.update(60, state);
assert.ok(letters.elapsed <= .1, 'background tab or long frame cannot skip waiting');
linger(letters, state, 5.2);
assert.equal(letters.current.id, 'bell');
assert.equal(linger(letters, stateFor(letters), 8), null, 'bell requires a real event');
assert.equal(letters.update(.016, stateFor(letters, {bell: true}))?.id, 'bell');

// Wrong hour, slow travel and leaving a spot never count as resting. Then walk
// the entire real-coordinate arc and restore it from the same JSON saved by UI.
let grotto = stateFor(letters, {mode: 'boat'});
linger(letters, grotto, 10);
assert.equal(letters.elapsed, 0);
grotto.hour = 22;
for (let frame = 0; frame < 8 * 60; frame++) {
	grotto.position.x += .03;
	letters.update(1/60, grotto);
}
assert.equal(letters.current.id, 'water', 'continuing travel does not unlock a resting clue');
for (const [id, hour, mode] of [['water',22,'boat'],['light',19,'walk'],['stars',23,'walk'],['home',6,'walk']]) {
	assert.equal(letters.current.id, id);
	const s = stateFor(letters, {hour, mode});
	assert.equal(linger(letters, s, letters.current.duration + .2)?.id, id);
}
assert.ok(letters.complete);
assert.equal(letters.current, null);
assert.equal(letters.update(.1, stateFor(letters)), null);
assert.ok(new TideLetters(JSON.parse(JSON.stringify([...letters.found]))).complete);
const bell = new TideLetters(['seed']);
assert.equal(bell.update(.016, stateFor(bell, {bell: true}))?.id, 'bell', 'ringing immediately on arrival works');

const north = PLACES.find(p => p.id === 'redwoods'), harbor = PLACES.find(p => p.id === 'harbor');
assert.equal(habitatAt(north.x, north.z, -300, .8).habitat, 'forest');
assert.equal(habitatAt(harbor.x, harbor.z, -100, .6).habitat, 'grove');
assert.equal(habitatAt(harbor.x, harbor.z, 100, .6).habitat, 'ocean');
assert.equal(habitatAt(harbor.x, harbor.z, -100, 0).habitat, 'meadow');
const reused = {}; assert.equal(habitatAt(0,0,0,5,reused), reused); assert.equal(reused.canopy, 1);
console.log('ok six tide letters: clocks, arrival, observation, motion, menus, bell, persistence, narrative and habitat integration');
