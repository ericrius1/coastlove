// The field journal and encounter simulation share these names and observation
// distances. A sighting happens well outside each creature's comfort zone.
export const WILDLIFE_SPECIES = Object.freeze( [
	{ kind: 'fox', placeIds: ['foxes'], name: 'Island fox', plural: 'Island foxes', habitat: 'Fox Hollow · Santa Cruz Island', observeRadius: 9, note: 'A little gray guardian with cinnamon ears. Wait quietly and the hollow soon returns to its own small business.' },
	{ kind: 'seaLion', placeIds: ['rookery'], name: 'California sea lion', plural: 'Sea lions', habitat: 'Sea Lion Cove · Santa Rosa Island', observeRadius: 12, note: 'A whiskered face turns toward the sun. Between the barks, the whole rookery seems to breathe together.' },
	{ kind: 'deer', placeIds: ['cypress', 'big-sur', 'redwoods', 'mendocino'], name: 'Black-tailed deer', plural: 'Black-tailed deer', habitat: 'Cypress Point · Big Sur · northern forests', observeRadius: 18, note: 'Leaf-shaped ears turn before the head does. Give them room and their watchful stillness becomes grazing again.' },
	{ kind: 'rabbit', placeIds: ['poppies', 'cypress', 'redwoods'], name: 'Brush rabbit', plural: 'Brush rabbits', habitat: 'Poppy Bluff · Cypress Point · redwood understory', observeRadius: 10, note: 'A small brown comma at the edge of the path. A hop, a pause, and the meadow carries on around it.' },
	{ kind: 'quail', placeIds: ['cypress', 'poppies', 'big-sur', 'harbor'], name: 'California quail', plural: 'California quail', habitat: 'Coastal gardens · open groves · meadow edges', observeRadius: 10, note: 'A crooked little topknot leads the procession. One bird keeps watch while the others investigate the ground.' },
	{ kind: 'butterfly', placeIds: ['poppies', 'cypress', 'harbor'], name: 'Painted lady', plural: 'Painted lady butterflies', habitat: 'Harbor flowers · Poppy Bluff · Cypress Point', observeRadius: 7, note: 'Apricot wings draw loose stitches through the flowers. For a moment, even the wind seems to slow down.' },
].map( species => Object.freeze( { ...species, placeIds: Object.freeze( species.placeIds ) } ) ) );

export const WILDLIFE_BY_KIND = Object.freeze( Object.fromEntries( WILDLIFE_SPECIES.map( species => [ species.kind, species ] ) ) );

// Fixed populations: the length of a coastline never multiplies the simulation
// budget. Shared models and distance culling keep only nearby habitats active.
export const WILDLIFE_HABITATS = Object.freeze( [
	{ place: 'foxes', kind: 'fox', count: 20, spread: 24 },
	{ place: 'rookery', kind: 'seaLion', count: 12, spread: 20 },
	{ place: 'cypress', kind: 'deer', count: 4, spread: 30 },
	{ place: 'cypress', kind: 'rabbit', count: 4, spread: 20 },
	{ place: 'cypress', kind: 'quail', count: 5, spread: 16 },
	{ place: 'cypress', kind: 'butterfly', count: 7, spread: 20 },
	{ place: 'poppies', kind: 'rabbit', count: 5, spread: 26 },
	{ place: 'poppies', kind: 'quail', count: 5, spread: 18 },
	{ place: 'poppies', kind: 'butterfly', count: 9, spread: 25 },
	{ place: 'big-sur', kind: 'deer', count: 4, spread: 38 },
	{ place: 'big-sur', kind: 'quail', count: 4, spread: 25 },
	{ place: 'redwoods', kind: 'deer', count: 5, spread: 35 },
	{ place: 'redwoods', kind: 'rabbit', count: 4, spread: 20 },
	{ place: 'mendocino', kind: 'deer', count: 3, spread: 35 },
	{ place: 'harbor', kind: 'quail', count: 4, spread: 16 },
	{ place: 'harbor', kind: 'butterfly', count: 7, spread: 15 },
].map( habitat => Object.freeze( habitat ) ) );

export const WILDLIFE_POPULATION_LIMIT = WILDLIFE_HABITATS.reduce( ( sum, habitat ) => sum + habitat.count, 0 );

export const WILDLIFE_BEHAVIOR = Object.freeze( {
	fox: { speed: 0.8, fleeSpeed: 2.8, comfort: 3, range: 260, roam: 18, legSwing: 0.35 },
	seaLion: { speed: 0.2, fleeSpeed: 0.45, comfort: 2.5, range: 300, roam: 12, legSwing: 0.16 },
	deer: { speed: 0.72, fleeSpeed: 4.6, comfort: 6, range: 300, roam: 32, legSwing: 0.3 },
	rabbit: { speed: 0.55, fleeSpeed: 2.6, comfort: 3.5, range: 130, roam: 18, legSwing: 0.35 },
	quail: { speed: 0.45, fleeSpeed: 1.8, comfort: 3, range: 130, roam: 15, legSwing: 0.45 },
	butterfly: { speed: 0.65, fleeSpeed: 0.9, comfort: 0.8, range: 90, roam: 14, legSwing: 0 },
	goat: { speed: 0.8, fleeSpeed: 2, comfort: 3, range: 300, roam: 18, legSwing: 0.35 },
	tortoise: { speed: 0.2, fleeSpeed: 0.35, comfort: 2, range: 160, roam: 14, legSwing: 0.2 },
} );
