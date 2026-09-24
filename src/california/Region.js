import { SETTLEMENTS } from "./Settlements.js";
import { project } from "./Geography.js";
// California shoreline from the southern border to Oregon, compressed 1:32.
// Elevation, paths, characters and story locations are artistic adaptations.
export const REGION = {
	name: 'Coastlove', size: 65536, seed: 41,
 islands: [
  {id:'cruz',name:'Santa Cruz',x: -112.5,z: 1338.75,rx: 646.875,rz: 219.375,angle:-.1,summit:240},
  {id:'rosa',name:'Santa Rosa',x: -1181.25,z: 1490.625,rx: 410.625,rz: 270.0,angle:.1,summit:160},
  {id:'miguel',name:'San Miguel',x: -1968.75,z: 1237.5,rx: 225.0,rz: 135.0,angle:.2,summit:100},
  {id:'anacapa',name:'Anacapa',...project(-119.40,34.012),rx: 137.812,rz: 36.562,angle:.1,summit:75},
  {id:'catalina',name:'Santa Catalina',...project(-118.42,33.39),rx:570,rz:250,angle:-.7,summit:190},
  {id:'clemente',name:'San Clemente',...project(-118.50,32.90),rx:280,rz:700,angle:.6,summit:170},
  {id:'nicolas',name:'San Nicolas',...project(-119.50,33.25),rx:450,rz:180,angle:.3,summit:100},
  {id:'barbara',name:'Santa Barbara Island',...project(-119.035,33.475),rx:60,rz:90,angle:0,summit:70},
 ],
};

const CHANNEL_PLACES = [
	{ id: 'harbor', name: 'Harbor of little departures', label: 'Santa Barbara', x: 35, z: -92, kind: 'harbor', hint: 'Begin at the weathered pier. Inés knows the crossing.', story: 'The mainland falls behind in a bright ribbon of palms, weathered piers, and salt air.', radius: 45 },
	{ id: 'poppies', name: 'The golden headland', label: 'Poppy Bluff', x: -759.375, z: -236.25, kind: 'poppies', hint: 'A hillside that catches the last light. Follow the coast west.', story: 'Orange poppies and purple lupines catch the wind. Stay for sunset: the whole bluff turns to copper.', radius: 70 },
	{ id: 'cypress', name: 'The wind-bent grove', label: 'Cypress Point', x: 495.0, z: -95.625, kind: 'grove', hint: 'Find Rowan in the sheltered grove above the mainland.', story: 'Every trunk leans away from the Pacific. The bench faces the islands, not the road.', radius: 65 },
	{ id: 'arch', name: 'A doorway through the sea', label: 'Anacapa Arch', x: 1018.125, z: 1350.0, kind: 'arch', hint: 'An eastern island hides a stone doorway. Pass through by boat or plane.', story: 'You passed beneath the sea arch. Salt, light, and a thousand winters carved this doorway.', radius: 28, water: true },
	{ id: 'beacon', name: 'The lantern at the edge', label: 'Anacapa Light', x:920, z:1370, kind: 'lighthouse', hint: 'An island lighthouse waits for blue hour. Elias keeps its stories.', story: 'The lantern sweeps the channel after sunset. Hold Z and swipe to watch the first beam find the water.', radius: 55 },
	{ id: 'grotto', name: 'The painted water', label: 'Painted Grotto', x: -466.875, z: 1127.812, kind: 'grotto', hint: 'Look for the low opening on Santa Cruz’s northern shore.', story: 'Mineral bands color the cave. After dark, little blue lights bloom along the water beneath the arch.', radius: 45, water: true },
	{ id: 'foxes', name: 'The island’s little guardians', label: 'Fox Hollow', x: -101.25, z: 1327.5, kind: 'foxes', hint: 'Sana studies the island foxes in a quiet hollow on Santa Cruz.', story: 'Small ears turn toward your footsteps. The foxes pause, then go back to their unhurried afternoon.', radius: 65 },
	{ id: 'rookery', name: 'The loudest beach', label: 'Sea Lion Cove', x: -1035.0, z: 1316.25, kind: 'rookery', hint: 'Take the boat to Bechers Bay on Santa Rosa.', story: 'Sea lions gather on sun-warmed rocks. One lifts its head as if to ask why you are in such a hurry.', radius: 60 },
	{ id: 'wreck', name: 'The bell without a boat', label: 'Driftwood Anchorage', x: -1968.75, z: 1186.875, kind: 'wreck', hint: 'A broken hull rests on a remote shore. Its bell still has a voice.', story: 'You ring the salvaged bell. A low note crosses the empty anchorage. Someone left a tiny bouquet beside the wheel.', radius: 50 },
	{ id: 'stars', name: 'An ocean of stars', label: 'Stargazer’s Camp', x: 275.625, z: 1378.125, kind: 'camp', hint: 'The eastern Santa Cruz ridge has a tent, a telescope, and a very dark sky.', story: 'The camp is yours for the night. Scrub past dusk and watch the stars take over the channel.', radius: 60 },
];

export const PLACES = [...CHANNEL_PLACES, ...SETTLEMENTS];

export const CALIFORNIA_STORIES = [
	{ id: 'ines', name: 'Inés', role: 'The channel pilot', x: 35, z: -92, color: 0xc27846, pages: [
		'Welcome to Coastlove. That orange seaplane is Marigold. I fly mail, forgotten lunches, and people who have finally decided to take a day off. The islands make the city feel very far away.',
		'My mother taught me to navigate by the ridges. “Maps tell you where things are,” she said. “Light tells you where you want to go.” I still fly the long way home at sunset.',
		'Press 2 to take Marigold, and open J for the coastal chart. Look for the sea arch off Anacapa. Hold Z and swipe your trackpad whenever you want a different hour. There is no deadline out here.'
	] },
	{ id: 'rowan', name: 'Rowan', role: 'The coastal gardener', x: 495.0, z: -95.625, color: 0x627f56, pages: [
		'People ask why I garden where the wind never stops. Look at these trees. They don’t fight it. They just grow into a different shape. I could have learned that lesson much earlier.',
		'I used to make elaborate plans for this hillside. Then the rains brought poppies to all the places I had left alone. Now my best work is knowing when to put the shovel down.',
		'The western bluff is orange with flowers. Go late in the day. And if you find the old ship’s bell out on San Miguel, ring it once for all the people who meant to come back.'
	] },
	{ id: 'sana', name: 'Sana', role: 'The island naturalist', x: -101.25, z: 1327.5, color: 0x45878c, pages: [
		'I came here to study island foxes. Mostly they study me. One has learned exactly when I stop writing and open my lunch. I have never outsmarted her.',
		'An island makes the small things feel enormous. A seed crossing the water. A patch of shade. One family of foxes finding its way back. Recovery is usually a thousand quiet afternoons.',
		'Keep a little distance and watch them wander. There are sea lions on Santa Rosa too. And try the painted grotto after dark—the water has a surprise of its own.'
	] },
	{ id: 'elias', name: 'Elias', role: 'The lantern keeper', x:920, z:1370, color: 0x657797, pages: [
		'I kept a real lighthouse before everything became automatic. These days I look after this little lantern and tell visitors that a light is only useful if somebody is looking for it.',
		'There was a foggy night when my daughter couldn’t see the shore from her boat. I rang a bell until she found the harbor. Ever since, she calls me on clear nights too. Just to say she can see the light.',
		'Wait for dusk—or borrow a few hours with Z and your trackpad. Watch the beam sweep past Santa Cruz. Then take the plane to the Santa Cruz camp. The stars are very good company.'
	] },
];

for (const [site,id,name,role,color,pages] of [
 ['san-diego','marisol','Marisol','The harbor illustrator',0xbd754e,['I used to draw only boats. One day I noticed the people waiting for them were much more interesting. Now I draw the goodbyes too.','My favorite hour is when the arcades turn gold and every window seems to contain a little sunset. Take the long street through the park.','Follow the coast north, or borrow a roadster. The drivers leave room for a wanderer. There is always another beach.']],
 ['los-angeles','jules','Jules','The night projectionist',0x59888c,['I run a tiny outdoor cinema. The ocean is our sound system and the stars refuse to switch off during the movie.','People arrive with a whole city in their heads. By the second reel they can hear the waves again. That is my favorite part.','Stay until the lights come on. Some of the best corners of Los Angeles only introduce themselves after dark.']],
 ['san-jose','mei','Mei','The courtyard gardener',0x78865c,['These courtyards remind me of my grandfather’s orchard. I left space between the buildings for things that grow slowly.','Everyone asks what I am building next. Usually I am just waiting for a tree to cast a little more shade.','The Bay connects us to the ocean. Follow the birds north and the water will find you again.']],
 ['san-francisco','noah','Noah','The bridge painter',0x737c9d,['From a distance the bridge looks still. Up close it sings in the wind. I think of painting it as tuning an instrument.','My father used to bring me to the waterfront before the city woke up. I still keep his early hours, even on days off.','Fly through the red towers and keep going toward Point Reyes. There is a different kind of quiet beyond the headlands.']],
 ['redwoods','fern','Fern','The forest listener',0x537860,['I came north for a weekend and learned that a redwood weekend takes a little longer. I have been here six years.','Listen for the jays. They always sound as if you have arrived at exactly the wrong time. The ravens are more diplomatic.','The northern border is not far now. Take one more walk before you go. The forest never tells quite the same story twice.']],
]) { const p=SETTLEMENTS.find(p=>p.id===site); CALIFORNIA_STORIES.push({id,name,role,color,x:p.x,z:p.z,pages,site,procedural:true}); }
