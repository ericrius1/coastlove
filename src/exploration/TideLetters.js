import { PLACES } from '../california/Region.js';

// A small, authored mystery. Its clock is play time, so changing the sun or
// returning from a background tab cannot instantly finish an observation.
export const TIDE_LETTERS = [
	{
		id: 'seed', placeId: 'cypress', title: 'A letter without an address', symbol: 'seed',
		window: 'any', duration: 5, radius: 36, instruction: 'Stand quietly near the bench at Cypress Point for five seconds.',
		clue: 'Inés remembers a letter with a seed inside. Rowan kept the envelope beneath the wind-bent trees.',
		text: 'In the brass box beside the bench is an envelope, softened by salt. No address. Just a drawing of a tree, a bell, and six small stars. Inside, in a child’s careful writing: “If you cannot find me, begin with something that is still growing.” Rowan has added a date, then crossed it out. Beneath it: “Still growing.”',
		reply: 'The envelope points toward a bell on San Miguel. Something there is waiting to be answered.',
	},
	{
		id: 'bell', placeId: 'wreck', title: 'The answering shore', symbol: 'bell',
		window: 'any', duration: 0, radius: 16, instruction: 'Ring the salvaged ship’s bell at Driftwood Anchorage with E.',
		clue: 'A bell without a boat. Ring it once for the people who meant to come back.',
		text: 'The note travels over the anchorage. Just as it fades, a quieter note returns—from the wrong direction for an echo. A little tin under the bell holds the next page. “Dad says sound is a way of touching something far away. Tonight I touched the next island.” The drawing below shows blue water under a painted ceiling.',
		reply: 'The painted water answers after dark. Let your boat drift beneath the grotto.',
	},
	{
		id: 'water', placeId: 'grotto', title: 'The sea keeps a constellation', symbol: 'wave',
		window: 'night', duration: 6, radius: 39, instruction: 'Drift inside Painted Grotto after 20:00, or before 05:00. Stay nearly still for six seconds.',
		clue: 'The next letter has no paper. Look for the little blue lights in Painted Grotto at night.',
		text: 'Blue sparks gather under the boat. For a moment they resemble the six stars on the envelope; then a ripple breaks them into hundreds. On the cave wall, above the tide, someone has scratched: “A constellation is what happens when we decide the distances do not matter.” Beside the words: a lantern, and a single line pointing east.',
		reply: 'Elias watches the first light at Anacapa. Visit his lantern between 18:00 and 20:30.',
	},
	{
		id: 'light', placeId: 'beacon', title: 'The light between departures', symbol: 'lantern',
		window: 'dusk', duration: 5, radius: 45, instruction: 'Wait near Anacapa Light between 18:00 and 20:30 for five seconds.',
		clue: 'Every evening, a light crosses the water before the stars arrive. Wait with it.',
		text: 'Tucked into the lantern keeper’s log is a pressed yellow flower. “I was frightened the first time she sailed alone,” Elias has written. “She was frightened I would stop looking.” Underneath, in the small handwriting you recognize: “You can let someone go and still leave a light on.” The flower’s stem points to a drawing of the Santa Cruz ridge.',
		reply: 'Take the long way to Stargazer’s Camp. The telescope has been left for you.',
	},
	{
		id: 'stars', placeId: 'stars', title: 'One more place at the fire', symbol: 'star',
		window: 'night', duration: 7, radius: 35, instruction: 'Rest at Stargazer’s Camp after 20:00, or before 05:00, for seven seconds.',
		clue: 'A tent, a telescope, and room for one more person. The ridge is darkest after eight.',
		text: 'The telescope points at an unremarkable patch of sky. In its case is the last loose page: “I thought I was making a map of where I had been. I was making a map of everyone who helped me leave.” A postscript names Fern, far north, where the forest listens. “Go at first light. Take nothing. Leave a little time.”',
		reply: 'Find the little listening stones at Prairie Creek Redwoods. Dawn, 05:00–08:00.',
	},
	{
		id: 'home', placeId: 'redwoods', title: 'The person who stays', symbol: 'fern',
		window: 'dawn', duration: 8, radius: 42, instruction: 'Listen near the stones at Prairie Creek Redwoods between 05:00 and 08:00 for eight seconds.',
		clue: 'The sixth star was a seed all along. Fern keeps a place for it among the trees.',
		text: 'A sapling grows inside a ring of smooth stones. Fern has left a note: “She made it here. She is well. She still calls her father on clear nights.” The letters were never a trail toward someone lost. They were the small things a traveler left so the people she loved could follow. On the back is a space for another name. You leave it open. Somewhere, someone is just setting out.',
		reply: 'Six letters, one coast. The little lights will remember your visits. There is no need to hurry home.',
	},
];

export function letterHourReady(window, hour) {
	if (!Number.isFinite(hour)) return false;
	const h = ((hour % 24) + 24) % 24;
	return window === 'any' || (window === 'night' && (h >= 20 || h < 5)) ||
		(window === 'dusk' && h >= 18 && h < 20.5) || (window === 'dawn' && h >= 5 && h < 8);
}

export class TideLetters {
	constructor(saved = []) {
		// Only restore a contiguous chapter sequence; old or malformed saves are harmless.
		const ids = new Set(Array.isArray(saved) ? saved : []);
		this.found = new Set();
		for (const letter of TIDE_LETTERS) {
			if (!ids.has(letter.id)) break;
			this.found.add(letter.id);
		}
		this.elapsed = 0;
		this.near = false;
		this.ready = false;
		this._last = null;
		this._anchor = null;
	}

	get current() { return TIDE_LETTERS[this.found.size] || null; }
	get complete() { return this.found.size === TIDE_LETTERS.length; }
	get progress() { return this.current?.duration ? Math.min(1, this.elapsed / this.current.duration) : 0; }
	get place() { return PLACES.find(p => p.id === this.current?.placeId); }

	update(dt, { position, hour, mode, blocked = false, bell = false, center = null, groundY = 0 }) {
		const letter = this.current, place = center || this.place;
		this.near = !!letter && !!place && Math.hypot(position.x - place.x, position.z - place.z) < letter.radius &&
			Math.abs(position.y - groundY) < (letter.placeId === 'grotto' ? 8 : 12);
		this.ready = !!letter && letterHourReady(letter.window, hour);
		const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
		const moved = this._last ? Math.hypot(position.x - this._last.x, position.z - this._last.z) : Infinity;
		if (!this._last) this._last = { x: position.x, z: position.z };
		else { this._last.x = position.x; this._last.z = position.z; }
		const eligible = this.near && this.ready && !blocked && (mode === 'walk' || mode === 'boat' || mode === 'swim');
		if (eligible && letter.id === 'bell') return bell ? this.collect(letter) : null;
		if (!eligible || moved > Math.max(0.08, step * 1.8)) {
			this.elapsed = 0; this._anchor = null;
			return null;
		}
		this._anchor ||= { x: position.x, z: position.z };
		if (Math.hypot(position.x - this._anchor.x, position.z - this._anchor.z) > 3) {
			this.elapsed = 0; this._anchor = { x: position.x, z: position.z };
		}
		this.elapsed += step;
		return this.elapsed + 1e-8 >= letter.duration ? this.collect(letter) : null;
	}

	collect(letter) {
		this.found.add(letter.id);
		this.elapsed = 0; this.near = false; this._anchor = null;
		return letter;
	}
}
