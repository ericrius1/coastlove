// A DOM integration check: run the real Exploration constructor, input handlers,
// persistence, travel orchestration, and FieldJournal renderer against linkedom.
// Only WebGPU/world construction and map painting are replaced at module edges.
// No browser process, network page, or repository dependency is needed.
// Setup: npm install --prefix /tmp/coastlove-dom-check --no-package-lock --no-audit --no-fund linkedom@0.18.13
// Run: NODE_PATH=/tmp/coastlove-dom-check/node_modules node test/field-journal.mjs
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { Vector3 } from '../src/engine/index.js';
import { PLACES, CALIFORNIA_STORIES } from '../src/california/Region.js';
import { WILDLIFE_SPECIES } from '../src/exploration/Wildlife.js';
import { TIDE_LETTERS, TideLetters } from '../src/exploration/TideLetters.js';

const require = createRequire(import.meta.url);
let parseHTML;
try { ({ parseHTML } = require('linkedom')); }
catch { throw new Error('This optional DOM test needs linkedom outside the repo. Run the setup and NODE_PATH commands at the top of test/field-journal.mjs.'); }
const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { document, window });
let pointerExits = 0;
document.exitPointerLock = () => { pointerExits ++; };
const store = new Map(), SAVE = 'coastlove.journal.v1';
globalThis.localStorage = {
	getItem: key => store.get(key) ?? null,
	setItem: (key, value) => { store.set(key, String(value)); },
	removeItem: key => store.delete(key),
};

const residents = CALIFORNIA_STORIES.map((story, i) => ({ ...story,
	position: new Vector3(story.x + 4, 10, story.z + 3), home: new Vector3(story.x + 12, 10, story.z + 8),
	vendor: { inRange: () => false },
}));
const animals = WILDLIFE_SPECIES.map((species, i) => ({ kind: species.kind,
	home: new Vector3(200 + i * 35, 10, -300), group: { position: new Vector3(204 + i * 35, 10, -296) },
}));
const sites = new Map(TIDE_LETTERS.map(letter => {
	const place = PLACES.find(place => place.id === letter.placeId);
	return [letter.id, { position: new Vector3(place.x + 11, 10, place.z - 7), place }];
}));
globalThis.__fieldJournalFixtures = { residents, animals, sites };

const mocks = {
	'exploration/IslandLife.js': 'export class IslandLife { constructor() { Object.assign(this, globalThis.__fieldJournalFixtures); } update() {} }',
	'exploration/Seaplane.js': 'export class Seaplane { constructor() { this.group = {visible:false}; this.speed = 54; } }',
	'exploration/Traffic.js': 'export class Traffic { release() {} findCarStop() { return null; } }',
	'exploration/VehicleInteractions.js': 'export class VehicleInteractions { prompt() { return null; } interact() { return false; } }',
	'california/Landmarks.js': 'export class Landmarks { update() {} ringBell() { this.rings = (this.rings || 0) + 1; } }',
	'california/CoastalChart.js': 'export class CoastalChart { constructor() { this.draws = []; } draw(...args) { this.draws.push(args); } }',
	'california/TravelMap.js': 'export class TravelMap { constructor() { this.open = false; } show(open) { this.open = open; } update() {} }',
	'exploration/LetterLanterns.js': 'export class LetterLanterns { constructor() { this.sites = globalThis.__fieldJournalFixtures.sites; } update() {} }',
};
const sources = Object.fromEntries(Object.entries(mocks).map(([path, source]) => [new URL(`../src/${path}`, import.meta.url).href, source]));
register(`data:text/javascript,${encodeURIComponent(`
let sources;
export function initialize(data) { sources = data; }
export async function load(url, context, nextLoad) {
	if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {};' };
	if (sources[url]) return { format: 'module', shortCircuit: true, source: sources[url] };
	return nextLoad(url, context);
}`)}`, { parentURL: import.meta.url, data: sources });
const { Exploration } = await import('../src/exploration/Exploration.js');

function makeApp() {
	const input = { keys: new Set(), pressed: new Set(), mouseDown: false, rightDown: false, captured: false,
		down(code) { return this.keys.has(code); }, hit(code) { return this.pressed.has(code); },
		consumeLook() { return { x: 0, y: 0 }; }, consumeWheel() { return 0; }, consumeTimeScrub() { return 0; },
	};
	const messages = [], preparations = [], audio = [];
	return { scene: {}, terrainData: { size: 2097152, heightAt: () => 10 }, colliders: null,
		player: { position: new Vector3(950, 10, -900), mode: 'walk', velocity: new Vector3(), busy: false },
		settings: { timeOfDay: 16.2, timeSpeed: 1 }, input, freeCam: false, ui: { ui: {} },
		game: { toast: message => messages.push(message), rod: { equipped: false }, guide: { open: false },
			hud: { closeStand() {}, toggleInventory() {} } },
		realCities: { async prepare(place) { preparations.push(place); }, update() {}, syncColliders() {} },
		audio: { discovery: (...args) => audio.push(args) },
		setRenderScale(value) { this.renderScale = value; }, messages, preparations, audioEvents: audio,
	};
}
const click = element => { assert.ok(element, 'expected a real DOM control'); element.click(); };
const tab = (e, id) => click(e.ui.querySelector(`[data-journal="${id}"]`));
const articles = e => [...e.find('.exp-entries').querySelectorAll('article')];
const control = (article, label) => [...article.querySelectorAll('button')].find(button => button.textContent === label);
const show = (e, id) => { e.toggleJournal(true); tab(e, id); };
const press = (e, ...codes) => { codes.forEach(code => e.app.input.pressed.add(code)); e.beforeUpdate(); e.app.input.pressed.clear(); };

// A v1 save created before the new wildlife and mystery existed must survive.
localStorage.setItem(SAVE, JSON.stringify({ read: ['ines', 'bad-id', 'ines'], seen: ['fox', 'seaLion', 'constructor'], found: ['harbor', 'missing-place'] }));
const app = makeApp(), e = new Exploration(app);
// linkedom leaves an unmarked single-select empty; browsers select option zero.
for (const select of e.ui.querySelectorAll('select')) if (select.value === undefined) select.querySelector('option').selected = true;
assert.deepEqual([...e.read], ['ines']); assert.deepEqual([...e.seen], ['fox', 'seaLion']);
assert.deepEqual([...e.found], ['harbor']); assert.equal(e.letters.current.id, 'seed');
assert.equal(e.target.id, 'rowan');
assert.equal(e.find('.exp-progress').textContent, `1 / ${PLACES.length} places · 1 / 9 stories · 2 / 6 wildlife`);
assert.equal(e.find('.exp-entries').children.length, 0, 'closed journals do not rebuild hidden entries');
click(e.find('.exp-journal-button'));
assert.equal(e.journalOpen, true); assert.equal(e.find('.exp-journal').hidden, false); assert.ok(e.paused);
assert.equal(articles(e).length, PLACES.length);
for (const [id, count] of [['places', `1/${PLACES.length}`], ['people', '1/9'], ['wildlife', '2/6'], ['letters', '0/6']]) {
	assert.equal(e.ui.querySelector(`[data-journal="${id}"] small`).textContent, count);
}
for (const id of ['people', 'wildlife', 'letters', 'places']) {
	tab(e, id);
	assert.equal(e.journalTab, id);
	assert.equal(e.ui.querySelectorAll('[data-journal][aria-pressed="true"]').length, 1);
	assert.equal(e.ui.querySelector(`[data-journal="${id}"]`).getAttribute('aria-pressed'), 'true');
	assert.equal(e.find('.exp-filter-label').hidden, id !== 'places');
}
console.log('ok real constructor restores legacy v1 progress; DOM tabs, counts, and closed-journal work');

// Region selection, tracking, and arrival use the actual event handlers.
const region = e.find('.exp-region-filter');
region.querySelector('[value="north"]').selected = true;
region.dispatchEvent(new window.Event('change'));
assert.ok(articles(e).length > 0 && articles(e).length < PLACES.length);
assert.ok(articles(e).every(article => !article.textContent.includes('Santa Barbara')));
const northernPlace = PLACES.find(place => place.region === 'north');
click(control(articles(e)[0], 'Track'));
assert.equal(e.target.id, northernPlace.id); assert.ok(e.journalOpen, 'place tracking leaves the list available');
assert.equal(control(articles(e)[0], 'Tracking').textContent, 'Tracking');
const actualSwitch = e.switchMode, modes = [];
e.switchMode = (mode) => { modes.push(mode); app.player.mode = mode; };
await control(articles(e)[0], 'Visit').onclick();
assert.equal(e.target.id, northernPlace.id);
assert.equal(app.player.position.x, northernPlace.x); assert.equal(app.player.position.z, northernPlace.z);
assert.equal(modes.at(-1), 'walk'); assert.equal(app.preparations.at(-1).id, northernPlace.id);
show(e, 'people');
assert.ok(articles(e)[0].textContent.includes(residents[0].pages.at(-1)), 'saved story includes the new final page');
assert.ok(!articles(e)[1].textContent.includes(residents[1].pages[0]), 'unread stories remain undisclosed');
click(control(articles(e)[1], 'Track on compass'));
assert.equal(e.target, residents[1]); assert.equal(e.journalOpen, false);
show(e, 'people');
await control(articles(e)[1], 'Visit').onclick();
assert.equal(app.player.position.x, residents[1].home.x); assert.equal(app.player.position.z, residents[1].home.z);
console.log('ok filters and real tracking/visit handlers preserve place and resident-home coordinates');

show(e, 'wildlife');
assert.equal(articles(e).length, 6);
assert.ok(articles(e)[0].textContent.includes(WILDLIFE_SPECIES[0].note));
assert.ok(articles(e)[2].textContent.includes(WILDLIFE_SPECIES[2].habitat));
assert.ok(!articles(e)[2].textContent.includes(WILDLIFE_SPECIES[2].note));
click(control(articles(e)[2], 'Track habitat'));
assert.equal(e.target.id, 'wildlife-deer'); assert.equal(e.target.x, animals[2].home.x); assert.equal(e.journalOpen, false);
show(e, 'wildlife');
await control(articles(e)[2], 'Visit habitat').onclick();
assert.equal(app.player.position.x, animals[2].home.x); assert.equal(app.player.position.z, animals[2].home.z);
assert.notEqual(app.player.position.x, animals[2].group.position.x, 'habitat travel uses stable home coordinates');
console.log('ok wildlife reveals sightings and tracks/visits stable habitat positions');

show(e, 'letters');
assert.equal(articles(e).length, 6);
assert.ok(articles(e)[0].classList.contains('is-current'));
assert.ok(articles(e)[0].textContent.includes(TIDE_LETTERS[0].clue));
assert.ok(!articles(e)[0].textContent.includes(TIDE_LETTERS[0].text));
for (const locked of articles(e).slice(1)) {
	assert.ok(locked.textContent.includes('An unopened letter')); assert.equal(locked.querySelectorAll('button').length, 0);
}
click(control(articles(e)[0], 'Follow this bearing'));
assert.equal(e.target.x, sites.get('seed').position.x); assert.equal(e.target.z, sites.get('seed').position.z);
assert.equal(e.journalOpen, false);
show(e, 'letters');
await control(articles(e)[0], 'Visit Cypress Point').onclick();
assert.equal(app.player.position.x, sites.get('seed').position.x);
e.letters = new TideLetters(['seed', 'bell']); e.save();
assert.ok(articles(e)[0].classList.contains('is-found')); assert.ok(articles(e)[0].textContent.includes(TIDE_LETTERS[0].text));
assert.ok(articles(e)[2].classList.contains('is-current')); assert.ok(articles(e)[2].textContent.includes(TIDE_LETTERS[2].instruction));
assert.equal(e.find('.exp-letters-button span').textContent, '2 / 6');
const roundTrip = new Exploration(makeApp());
assert.deepEqual([...roundTrip.read], [...e.read]); assert.deepEqual([...roundTrip.seen], [...e.seen]);
assert.deepEqual([...roundTrip.letters.found], ['seed', 'bell']);
assert.equal(roundTrip.letters.current.id, 'water');
console.log('ok spoiler-safe letter chapters, marker bearings, persistence, and save/reload round trip');

// Completion of the existing expedition remains independent of the optional arc.
e.read = new Set(CALIFORNIA_STORIES.map(story => story.id));
e.seen = new Set(WILDLIFE_SPECIES.map(species => species.kind));
e.found = new Set(PLACES.map(place => place.id));
e.letters = new TideLetters(); e.save();
assert.ok(e.find('.exp-entries').textContent.includes('The whole coast, remembered'));
assert.equal(e.letters.complete, false);
e.letters = new TideLetters(TIDE_LETTERS.map(letter => letter.id)); e.save();
assert.ok(e.find('.exp-entries').querySelector('.exp-letter-ending'));
assert.equal(e.find('.exp-entries').querySelectorAll('.is-found').length, 6);
assert.equal(e.find('.exp-entries').querySelectorAll('.is-current').length, 0);
console.log('ok expedition footer and six-letter ending are separate completion paths');

// Exercise real controls: E completes the entire story before J opens its journal.
e.switchMode = actualSwitch; e.toggleJournal(false); e.read.delete('ines');
e.dialogue = residents[0]; e.page = residents[0].pages.length - 1; e.renderDialogue();
assert.ok(e.find('.exp-story').textContent.includes(residents[0].pages.at(-1)));
press(e, 'KeyE', 'KeyJ');
assert.ok(e.read.has('ines')); assert.equal(e.dialogue, null); assert.equal(e.journalOpen, true);
assert.ok(JSON.parse(localStorage.getItem(SAVE)).read.includes('ines'));
press(e, 'Escape'); assert.equal(e.paused, false); assert.equal(e.map.open, false);
press(e, 'KeyM'); assert.equal(e.map.open, true); assert.ok(e.inputCaptured);
click(e.find('.exp-letters-button'));
assert.equal(e.map.open, false); assert.equal(e.journalOpen, true); assert.equal(e.journalTab, 'letters');
assert.equal(app.input.captured, false); assert.ok(pointerExits > 0);
const clock = e.find('.exp-clock input'); clock.value = '6.25'; clock.dispatchEvent(new window.Event('input'));
assert.equal(app.settings.timeOfDay, 6.25); assert.equal(app.settings.timeSpeed, 0);
e.find('.exp-quality select').querySelector('[value=".65"]').selected = true;
e.find('.exp-quality select').dispatchEvent(new window.Event('change'));
assert.equal(app.renderScale, .65);
console.log('ok E/J ordering, Escape, map exclusivity, letter shortcut, time slider and quality controls');

// Run Exploration.update with the real progress engine and HUD. The heavy world
// dependencies remain test doubles, while all gating and save paths execute.
e.toggleJournal(false); e.letters = new TideLetters(); e.seen.clear();
app.player.position.copy(animals[0].group.position); app.ui.ui._start = true;
e.update(.2); assert.equal(e.seen.size, 0, 'welcome overlay cannot record wildlife');
app.ui.ui._start = false; e.update(.2); assert.ok(e.seen.has('fox'));
app.player.position.copy(sites.get('seed').position);
e.toggleJournal(true); for (let i = 0; i < 70; i ++) e.update(.1);
assert.equal(e.letters.found.size, 0, 'open journal blocks passive letter collection');
e.toggleJournal(false); for (let i = 0; i < 52; i ++) e.update(.1);
assert.ok(e.letters.found.has('seed')); assert.ok(e.find('.exp-listening').textContent.includes(TIDE_LETTERS[0].title));
assert.equal(e.find('.exp-listening').hidden, false); assert.equal(app.audioEvents.length, 1);
assert.equal(JSON.parse(localStorage.getItem(SAVE)).letters[0], 'seed');
click(e.find('.exp-listening')); assert.equal(e.journalOpen, true); assert.equal(e.journalTab, 'letters');
assert.ok(articles(e)[0].textContent.includes(TIDE_LETTERS[0].text));
console.log('ok update-loop sightings, overlay/pause gating, real letter collection, audio event and reading shortcut');

// Finish the arc through the real bell prompt and clock-dependent update path.
e.toggleJournal(false); app.player.position.copy(sites.get('bell').position);
app.input.pressed.add('KeyE'); e.beforeUpdate(); e.update(.1); app.input.pressed.clear();
assert.equal(e.landmarks.rings, 1); assert.ok(e.letters.found.has('bell'));
for (const [id, hour, mode, duration] of [
	['water', 22, 'boat', 6], ['light', 19, 'walk', 5], ['stars', 22, 'walk', 7], ['home', 6, 'walk', 8],
]) {
	assert.equal(e.letters.current.id, id);
	app.player.position.copy(sites.get(id).position); app.player.mode = mode;
	app.settings.timeOfDay = 12;
	for (let i = 0; i < 90; i ++) e.update(.1);
	assert.equal(e.letters.current.id, id, `${id} cannot complete outside its hour window`);
	app.settings.timeOfDay = hour;
	for (let i = 0; i < duration * 10 + 2; i ++) e.update(.1);
	assert.ok(e.letters.found.has(id), `${id} collects through the real update loop`);
}
assert.equal(e.letters.complete, true); assert.equal(e.letters.current, null);
assert.deepEqual(app.audioEvents.map(([, options]) => options.chapter), [0, 1, 2, 3, 4, 5]);
assert.equal(app.audioEvents.at(-1)[1].complete, true);
assert.deepEqual(JSON.parse(localStorage.getItem(SAVE)).letters, TIDE_LETTERS.map(letter => letter.id));
for (let i = 0; i < 170; i ++) e.update(.1);
assert.equal(e.find('.exp-listening').hidden, true, 'the final notice expires without dereferencing a missing next chapter');
console.log('ok bell action, all four timed chapters, ordered discovery sounds and completed-arc HUD');

localStorage.setItem(SAVE, '{broken JSON');
assert.doesNotThrow(() => new Exploration(makeApp()), 'malformed saves do not block startup');
localStorage.setItem(SAVE, JSON.stringify({ read: 2, seen: {}, found: null, letters: ['home', 'seed', 'water'] }));
const damaged = new Exploration(makeApp());
assert.equal(damaged.read.size, 0); assert.equal(damaged.seen.size, 0); assert.equal(damaged.found.size, 0);
assert.deepEqual([...damaged.letters.found], ['seed']);
const setItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('storage unavailable'); };
assert.doesNotThrow(() => damaged.save(), 'private-mode storage failure leaves the UI usable');
localStorage.setItem = setItem;
console.log('ok malformed/partial saves and unavailable storage fail gracefully');
