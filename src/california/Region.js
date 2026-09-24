// Real Santa Barbara Channel shorelines, compressed 1:18 horizontally.
// Elevation, paths, characters and story locations are artistic adaptations.
export const REGION = {
	name: 'Coastlove', size: 8192, seed: 41,
 islands: [
  {id:'cruz',name:'Santa Cruz',x:-200,z:2380,rx:1150,rz:390,angle:-.1,summit:240},
  {id:'rosa',name:'Santa Rosa',x:-2100,z:2650,rx:730,rz:480,angle:.1,summit:160},
  {id:'miguel',name:'San Miguel',x:-3500,z:2200,rx:400,rz:240,angle:.2,summit:100},
  {id:'anacapa',name:'Anacapa',x:1500,z:2390,rx:245,rz:65,angle:.1,summit:75},
 ],
};

export const PLACES = [
	{ id: 'harbor', name: 'Harbor of little departures', label: 'Santa Barbara', x: 35, z: - 92, kind: 'harbor', hint: 'Begin at the weathered pier. Inés knows the crossing.', story: 'The mainland falls behind in a bright ribbon of palms, weathered piers, and salt air.', radius: 45 },
	{ id: 'poppies', name: 'The golden headland', label: 'Poppy Bluff', x: -1350, z: -420, kind: 'poppies', hint: 'A hillside that catches the last light. Follow the coast west.', story: 'Orange poppies and purple lupines catch the wind. Stay for sunset: the whole bluff turns to copper.', radius: 70 },
	{ id: 'cypress', name: 'The wind-bent grove', label: 'Cypress Point', x: 880, z: -170, kind: 'grove', hint: 'Find Rowan in the sheltered grove above the mainland.', story: 'Every trunk leans away from the Pacific. The bench faces the islands, not the road.', radius: 65 },
	{ id: 'arch', name: 'A doorway through the sea', label: 'Anacapa Arch', x: 1810, z: 2400, kind: 'arch', hint: 'An eastern island hides a stone doorway. Pass through by boat or plane.', story: 'You passed beneath the sea arch. Salt, light, and a thousand winters carved this doorway.', radius: 28, water: true },
	{ id: 'beacon', name: 'The lantern at the edge', label: 'Anacapa Light', x: 1660, z: 2357, kind: 'lighthouse', hint: 'An island lighthouse waits for blue hour. Elias keeps its stories.', story: 'The lantern sweeps the channel after sunset. Hold Z and swipe to watch the first beam find the water.', radius: 55 },
	{ id: 'grotto', name: 'The painted water', label: 'Painted Grotto', x: -830, z: 2005, kind: 'grotto', hint: 'Look for the low opening on Santa Cruz’s northern shore.', story: 'Mineral bands color the cave. After dark, little blue lights bloom along the water beneath the arch.', radius: 45, water: true },
	{ id: 'foxes', name: 'The island’s little guardians', label: 'Fox Hollow', x: -180, z: 2360, kind: 'foxes', hint: 'Sana studies the island foxes in a quiet hollow on Santa Cruz.', story: 'Small ears turn toward your footsteps. The foxes pause, then go back to their unhurried afternoon.', radius: 65 },
	{ id: 'rookery', name: 'The loudest beach', label: 'Sea Lion Cove', x: -1840, z: 2340, kind: 'rookery', hint: 'Take the boat to Bechers Bay on Santa Rosa.', story: 'Sea lions gather on sun-warmed rocks. One lifts its head as if to ask why you are in such a hurry.', radius: 60 },
	{ id: 'wreck', name: 'The bell without a boat', label: 'Driftwood Anchorage', x: -3500, z: 2110, kind: 'wreck', hint: 'A broken hull rests on a remote shore. Its bell still has a voice.', story: 'You ring the salvaged bell. A low note crosses the empty anchorage. Someone left a tiny bouquet beside the wheel.', radius: 50 },
	{ id: 'stars', name: 'An ocean of stars', label: 'Stargazer’s Camp', x: 490, z: 2450, kind: 'camp', hint: 'The eastern Santa Cruz ridge has a tent, a telescope, and a very dark sky.', story: 'The camp is yours for the night. Scrub past dusk and watch the stars take over the channel.', radius: 60 },
];

export const CALIFORNIA_STORIES = [
	{ id: 'ines', name: 'Inés', role: 'The channel pilot', x: 35, z: - 92, color: 0xc27846, pages: [
		'Welcome to Coastlove. That orange seaplane is Marigold. I fly mail, forgotten lunches, and people who have finally decided to take a day off. The islands make the city feel very far away.',
		'My mother taught me to navigate by the ridges. “Maps tell you where things are,” she said. “Light tells you where you want to go.” I still fly the long way home at sunset.',
		'Press 2 to take Marigold, and open J for the coastal chart. Look for the sea arch off Anacapa. Hold Z and swipe your trackpad whenever you want a different hour. There is no deadline out here.'
	] },
	{ id: 'rowan', name: 'Rowan', role: 'The coastal gardener', x: 880, z: -170, color: 0x627f56, pages: [
		'People ask why I garden where the wind never stops. Look at these trees. They don’t fight it. They just grow into a different shape. I could have learned that lesson much earlier.',
		'I used to make elaborate plans for this hillside. Then the rains brought poppies to all the places I had left alone. Now my best work is knowing when to put the shovel down.',
		'The western bluff is orange with flowers. Go late in the day. And if you find the old ship’s bell out on San Miguel, ring it once for all the people who meant to come back.'
	] },
	{ id: 'sana', name: 'Sana', role: 'The island naturalist', x: -180, z: 2360, color: 0x45878c, pages: [
		'I came here to study island foxes. Mostly they study me. One has learned exactly when I stop writing and open my lunch. I have never outsmarted her.',
		'An island makes the small things feel enormous. A seed crossing the water. A patch of shade. One family of foxes finding its way back. Recovery is usually a thousand quiet afternoons.',
		'Keep a little distance and watch them wander. There are sea lions on Santa Rosa too. And try the painted grotto after dark—the water has a surprise of its own.'
	] },
	{ id: 'elias', name: 'Elias', role: 'The lantern keeper', x: 1660, z: 2357, color: 0x657797, pages: [
		'I kept a real lighthouse before everything became automatic. These days I look after this little lantern and tell visitors that a light is only useful if somebody is looking for it.',
		'There was a foggy night when my daughter couldn’t see the shore from her boat. I rang a bell until she found the harbor. Ever since, she calls me on clear nights too. Just to say she can see the light.',
		'Wait for dusk—or borrow a few hours with Z and your trackpad. Watch the beam sweep past Santa Cruz. Then take the plane to the Santa Cruz camp. The stars are very good company.'
	] },
];
