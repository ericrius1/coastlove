import { PLACES, CALIFORNIA_STORIES } from '../california/Region.js';
import { TIDE_LETTERS } from './TideLetters.js';
import { WILDLIFE_SPECIES } from './Wildlife.js';

const text = (tag, value, className) => {
	const el = document.createElement(tag); el.textContent = value;
	if (className) el.className = className;
	return el;
};
const button = (label, action) => {
	const el = text('button', label); el.type = 'button'; el.onclick = action; return el;
};

export function renderFieldJournal(exploration) {
	const e = exploration, entries = e.find('.exp-entries');
	entries.replaceChildren();
	const counts = { places: `${e.found.size}/${PLACES.length}`, people: `${e.read.size}/${CALIFORNIA_STORIES.length}`,
		wildlife: `${e.seen.size}/${WILDLIFE_SPECIES.length}`, letters: `${e.letters.found.size}/${TIDE_LETTERS.length}` };
	for (const tab of e.ui.querySelectorAll('[data-journal]')) {
		tab.setAttribute('aria-pressed', String(tab.dataset.journal === e.journalTab));
		tab.querySelector('small').textContent = counts[tab.dataset.journal];
	}
	e.find('.exp-filter-label').hidden = e.journalTab !== 'places';
	const track = (target) => { e.target = target; e.toggleJournal(false); };
	if (e.journalTab === 'letters') {
		const intro = text('div', '', 'exp-letter-intro');
		intro.append(text('span', 'A SMALL MYSTERY IN SIX LETTERS', 'exp-eyebrow'), text('h3', 'What the tide brings back.'),
			text('p', 'Someone left a trail of small kindnesses along the coast. Follow the clues, borrow an hour with Z, and give each place a little time. Nothing here expires.'));
		entries.append(intro);
		for (const [index, letter] of TIDE_LETTERS.entries()) {
			const found = e.letters.found.has(letter.id), current = e.letters.current === letter;
			const article = text('article', '', `exp-letter-entry${current ? ' is-current' : ''}${found ? ' is-found' : ''}`);
			article.append(text('span', `${String(index + 1).padStart(2, '0')} / ${found ? 'REMEMBERED' : current ? 'YOUR NEXT CLUE' : 'STILL OUT THERE'}`, 'exp-eyebrow'));
			article.append(text('h3', found || current ? letter.title : 'An unopened letter'));
			if (found || current) {
				article.append(text('p', found ? letter.text : letter.clue));
				article.append(text('p', found ? letter.reply : letter.instruction, 'exp-letter-hint'));
				const place = PLACES.find(p => p.id === letter.placeId), marker = e.letterLanterns.sites.get(letter.id);
				const target = { ...place, x: marker.position.x, z: marker.position.z };
				article.append(button('Follow this bearing', () => track(target)), button(`Visit ${place.label}`, () => e.visit(target)));
			}
			entries.append(article);
		}
		if (e.letters.complete) entries.append(text('p', 'You have become part of the way home. Return to any of these places and look for the little lights.', 'exp-letter-ending'));
	} else if (e.journalTab === 'wildlife') {
		entries.append(text('p', 'Move gently and come close on foot. Watch the animals pause, forage, flutter, and find their own way. Sightings stay in your journal.'));
		for (const species of WILDLIFE_SPECIES) {
			const found = e.seen.has(species.kind), article = document.createElement('article');
			article.append(text('h3', `${found ? '✓ ' : '○ '}${species.plural}`), text('p', found ? species.note : species.habitat));
			article.append(text('p', `Observe within ${species.observeRadius} m on foot.`, 'exp-letter-hint'));
			const animal = e.life.animals.find(a => a.kind === species.kind);
			if (animal) {
				const target = { id: `wildlife-${species.kind}`, label: species.plural, x: animal.home.x, z: animal.home.z };
				article.append(button('Track habitat', () => track(target)), button('Visit habitat', () => e.visit(target)));
			}
			entries.append(article);
		}
	} else if (e.journalTab === 'people') {
		for (const resident of e.life.residents) {
			const article = document.createElement('article');
			article.append(text('h3', `${e.read.has(resident.id) ? '✓ ' : ''}${resident.name} · ${resident.role}`),
				text('p', e.read.has(resident.id) ? resident.pages.join('\n\n') : 'An untold story. Every journey is a little longer when you stop to listen.'));
			article.append(button('Track on compass', () => track(resident)), button('Visit', () => e.visit({ ...resident, label: resident.name, x: resident.home.x, z: resident.home.z })));
			entries.append(article);
		}
	} else {
		const filter = e.find('.exp-region-filter').value;
		for (const place of PLACES) {
			const region = place.region || (['harbor', 'poppies', 'cypress'].includes(place.id) ? 'south' : 'islands');
			if (filter !== 'all' && filter !== region) continue;
			const article = document.createElement('article');
			article.append(text('h3', `${e.found.has(place.id) ? '✓ ' : ''}${place.label}`), text('p', e.found.has(place.id) ? place.story : place.hint));
			article.append(button(e.target?.id === place.id ? 'Tracking' : 'Track', () => { e.target = place; e.refresh(); }), button('Visit', () => e.visit(place)));
			entries.append(article);
		}
	}
	if (e.read.size === CALIFORNIA_STORIES.length && e.seen.size === WILDLIFE_SPECIES.length && e.found.size === PLACES.length) {
		entries.append(text('h3', 'The whole coast, remembered. There is still another sunset.'));
	}
}
