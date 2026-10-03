# Coastlove

A California exploration game built on [David Greenheck’s Tidewater](https://github.com/dgreenheck/tidewater).

**[Play Coastlove](https://ericrius1.github.io/coastlove/)** · **[GitHub](https://github.com/ericrius1/coastlove)**

Travel from Border Field near San Diego to the Oregon line, with the Bay and eight Channel Islands. Coastlove is a separate project; the original Tidewater and San Francisco projects are unchanged.

## Native desktop version

Run `npm run native` for the Rust/wgpu desktop version, with Metal on Mac and Direct3D 12/Vulkan on Windows. Its Air preset targets a 1600-pixel 3D view and a 48 km terrain horizon. It includes the existing geography, artwork, stories, wildlife, vehicles, atlas, journal, and local sound, with native streaming and rendering. See the [native guide](native/README.md) for builds and controls, and [port status](native/PORT_STATUS.md) for the remaining renderer and simulation differences.

## Real scale and real cities

**One game metre equals one real metre.** California Albers coordinates preserve geographic placement without the old 1:32 travel compression. Elevation comes from public terrain data, interpolated for smooth movement. Local road grading and small town/harbor pads soften rough transitions.

SF uses **169,462** DataSF building footprints with LiDAR roof heights, plus stylized landmark supplements. LA has **874,991** OSM building footprints across downtown, Hollywood, the Westside, Griffith Park and the canyon areas. Actual street centre lines create recognizable grids and neighborhoods. Street widths use supplied tags or class estimates; buildings without measured heights use estimates. The Golden Gate model uses a 1,280 m main span, 27 m overall width and 227 m towers, with a driving surface and connected approaches.

There are **56 destinations**, including Nob Hill, North Beach, the Mission, Twin Peaks, Santa Monica, Venice, Hollywood, downtown LA, Griffith Park, Mulholland Drive and Topanga. The 28 smaller town districts, starter harbor, plants, stories and stunt props remain artistic compositions. SF's survey predates newer construction; façades are stylized, and tunnels and complex interchanges are simplified. See [data sources, accuracy and licenses](public/geodata/README.md).

Tidewater's ocean, sky, fishing, marine life, sound and boat physics remain. Nine expanded resident stories, six wildlife species, regional bird flocks, and a mystery in six letters give you reasons to stop.

## A coast worth lingering in

**J opens the field journal:** Places, People, Wildlife, and Tide letters. Track a bearing or visit a habitat, reread a conversation, and keep the small things you have noticed. Existing journal progress carries forward.

Island foxes and sea lions are joined by black-tailed deer, brush rabbits, California quail, and painted lady butterflies. Their 102 fixed encounters graze, rest, hop, flutter, and retreat when you approach too closely. Walk gently within the journal's observation distance to record a sighting. Cypress Point and Poppy Bluff are good first stops; northern forests have their own quieter company.

The northern woods have taller, layered crowns and drifts of ferns, with younger trees and small openings between groves. The sound changes as you step beneath cover: sheltered wind, moving leaves, scattered birds, and insects arriving at dusk. Nature uses the existing licensed field recordings. The fictional bell and letter replies have a soft, spatial resonance of their own.

**Letters on the tide** begins beside Rowan's bench at Cypress Point. Follow an unaddressed envelope through a bell, painted water, evening light, stars, and a northern dawn. The clues explain where and when to linger; nothing expires. Hold Z and swipe, or use the visible time slider, to borrow a different hour. Remembered places keep a few little lights for your return.

## Light, scenery, and cinema

The browser's **Borrow a little light** card offers Pacific, Golden, Dawn, and Moonlight moods. Each combines the physical time of day with cloud cover, coastal haze, light shafts, bloom, and restrained color grading. The time slider still lets you choose any hour. **Effects → Coastal color** adjusts the new cool-shade / warm-highlight grade, including a neutral setting at zero. Moods preserve your picture quality and draw distances; optional `?mood=golden` (or `pacific`, `dawn`, `moonlight`) starts in a chosen light.

A compact travel card now shows your nearest destination and camera bearing. Open **Journey & controls** for guidance and progress. **Cinema / F10** clears the interface; F10, Escape, or the return button brings it back. Tab reveals and focuses the return button. The original **P** photo mode remains available. Moonlight includes subtle lunar surface detail and structure in the Milky Way.

## Controls

| Control | Action |
| --- | --- |
| **1 / 2 / 3 / 4** | Boat / plane / walk / car (number row or numpad) |
| **E** | Enter or exit the nearby vehicle; talk when no vehicle is nearby. In flight, land nearby and get out. |
| **W / S in a car** | Accelerate / brake and reverse |
| **A / D or trackpad in a car** | Steer; click the scene to capture the pointer |
| **Shift / Space in a car** | Boost / handbrake drift |
| **V in the Trail Rover / cabriolet** | Switch exterior / driver-seat camera; right-drag to orbit or look around |
| **F in a car** | Magical takeoff / assisted landing in the same car |
| **Space / C in a flying car** | Rise / descend; WASD steers and controls speed |
| **Trackpad in flight** | Horizontal movement turns the plane; vertical movement pitches it |
| **A / D · W / S in flight** | Turn · speed up/down |
| **Shift + W · L · Space / C** | Fast cruise · level nose · rise/descend |
| **M** | Almost full-screen inset atlas: pan, zoom, search, or click anywhere to place a teleport pin and press Enter. The world keeps running. |
| **F (map open)** | Center and zoom to your current location |
| **Map drag / scroll or pinch** | Pan / zoom beneath the pointer; arrows and +/− also work |
| **J** | Field notes, stories and picture quality |
| **F10** | Cinema view; F10 or Escape restores controls |
| **Hold Z + trackpad swipe** | Scrub time forward or backward |
| **WASD / Shift on foot** | Walk / run |
| **V / T / R / I / F1** | Boat camera / day cycle / fishing rod / inventory / full controls |

Cars have independent arcade handling, momentum, drifting, suspension, airborne motion and landings. Leave the road, run down hills, or find the optional ramps near Twin Peaks, Mulholland and Griffith Park. NPCs use a pool of sixteen cars on nearby streets and resume driving after you exit. Ramps and handling are fictional gameplay additions in metre units.

Every web car is enchanted: get in with **E**, drive normally, then press **F** (or the **Magic flight** button) to lift off. The wheels tuck in and a soft blue glow trails the car. **Space / C** controls altitude, **WASD / trackpad** controls speed and steering, and **Shift** boosts flight. **F** floats down onto a nearby clear patch of dry ground; press F during landing to fly again. **E** lands before getting out. Over water or blocked ground, keep flying toward an open shore to land. The travel card shows flight speed, height and controls.

Map input belongs to the map while it is open. Traffic, birds, waves and time continue; an occupied vehicle coasts or continues flying. Close it with M or Escape to regain control.

## Modular cars and residents

Drive / **4** now summons the **Powder Blue Trail Rover**, based on the supplied open-top off-roader photo: pale blue scalloped bodywork, bronze cage and roof basket, treaded beadlock wheels, exposed gold hardware and reservoirs, louvered rear panel, and a strapped upright spare. **V** or the travel card switches between exterior and driver-seat views. Right-drag orbits outside or looks around inside while WASD keeps controlling the car. The cockpit has a working steering wheel and speedometer. Its appearance remains the same across regional travel; the unseen front and dashboard are inferred.

The rest of the web fleet has eight body families: a cabriolet, coupe, surf wagon, hatchback, pickup, Coastliner van, rally car, and touring sedan. Sculpted bodywork, wheel arches, separate grilles and lamps, cabin trim, five wheel styles, two-tone roofs, stripes, roof racks, luggage, and surfboards combine with 24 coastal paint colors. The sixteen-car traffic pool adopts deterministic regional appearances only when a car is far away and unoccupied. Your current car keeps its identity.

`describeCar(seed)` in `src/exploration/CarVariants.js` creates a stable appearance recipe; `makeCar(seed)` builds the drivable model; `makeCar()` defaults to the reference rover. Numeric seeds 0–7 showcase every family. Strings work too, such as `makeCar('venice:boardwalk:840')`. Extend the family, palette, wheel and compatible accessory catalogs to add modules. Reusable body templates and shared wheel kits keep construction cheap; generated cars own disposable color/accessory geometry and reduce detail at a distance. The regression suite checks 4,096 distinct appearance combinations without counting their IDs.

Every named resident across California now receives the same textured, animated character foundation as the harbor. `describeCharacter(stableId, overrides)` in `src/game/CharacterVariants.js` combines wardrobe colors and patterns, hair colors, proportions, glasses, headwear, scarves, cameras and bags; story IDs retain a consistent look on return visits. `createCharacterVariant(descriptor)` assembles the animated model, while `createCharacterFallback(descriptor)` supplies its inexpensive distant/loading figure. Accessories follow the animated head and torso. These are thousands of appearance combinations built on the two credited Rocketbox source characters, rather than thousands of separately downloaded models or unique face scans.

The nearby character budget is six detailed residents, with two concurrent loads, shared source textures/geometry and at most six reusable rigs per source. Hysteresis between the loading and retention distances prevents repeated swapping at one boundary. Teleporting cancels stale arrivals, and a failed download retains the procedural figure. Existing stories, greetings and conversations remain available. Skinning and normal-map derivatives preserve local precision; split object translations keep faces, attached accessories and motion stable even at the northern end of the state.

The [generated car concept sheet](design/coastal-car-concepts.png) guided the silhouettes; its [imagegen prompt](design/coastal-car-concepts.prompt.txt) is retained for future additions. It is an art reference and adds no runtime image download. Development targets the web version unless native work is explicitly requested.

## Performance

The default preserves native picture resolution, 2048-pixel shadows and long terrain views. **J → Picture quality → Air** renders at 80% internal resolution with temporal reconstruction and the same geometry, effects and draw distances. Smooth uses 65%.

A bounded 2048² statewide atlas and one moving 4 km ground patch replace area-proportional allocations. Nearby ground detail and building cells stream around the player. Terrain visibility bounds are cached; building shadows and collision geometry are local; taller buildings retain distant silhouettes. Grass, pebbles, traffic and wildlife have fixed nearby budgets. Camera-relative rendering avoids sky and geometry precision problems hundreds of kilometres from the origin.

The streamed vegetation budget stays at 6,500 trees and 14,000 shrubs, with up to 4,800 ferns. Nearby spatial cells supply distant crowns and palms; distant plants no longer upload across the whole state when you move a few metres. Wildlife sleeps outside its viewing range and reduces terrain work at a distance. Habitat audio samples nearby canopy, releases silent loops, limits voices, and skips shoreline work when the surf is inaudible. Listener movement remains accurate at statewide coordinates.

Browser geometry updates now upload only changed ranges, with correct alignment for packed attributes. Camera uniforms and terrain/ocean LOD records reuse their storage, and unchanged LOD selections skip GPU uploads. The moving terrain patch reuses exactly aligned heights and interior normals: a 768 m shift of the 4 km patch avoids 81.25% of height queries. Two reusable staging buffers keep publication atomic; edits and teleports rebuild the affected samples. These are reductions in work, not a claim of a fixed frame rate.

First launch compiles WebGPU shaders and can take a few minutes. The full static data is committed for GitHub Pages; only nearby building cells are fetched and meshed during play. Frame rate depends on viewport, picture quality and scene density; no claim of a locked frame rate across the state is made.

## Development and checks

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5190 in a WebGPU-capable browser.

```sh
npm test
npm run test:exploration
npm run test:california
npm run test:traffic
npm run test:controls
npm run test:metric
npm run test:water
npm run test:nature
npm run test:appearance
node test/sky-radiance.mjs
npm run build
```

The WebGPU water regression checks that shoreline displacement, crest phase and beach wash advance on every frame at 30, 60 and 120 fps, including statewide clock ranges. Tests cover metre projection and data completeness, bridge surfaces, terrain visibility, safe arrivals, flight controls, wildlife budgets, vehicle interactions, ten simulated minutes of NPC driving, arcade steering, drifting, ramp jumps, landings and collision substeps. Browser tests in `test/controls-browser.mjs` exercise map focus, continued simulation, pan/zoom, teleportation and unified E interactions against the running app.

The nature suite checks all six letter chapters, persistence, time windows, animal behavior and town placement, deterministic forests, distant plant streaming, audio lifecycle and spatial precision, and animated grotto pixels on WebGPU. `test/field-journal.mjs` adds optional DOM integration checks for the full journal and mystery flow; its header documents installing Linkedom in a temporary directory without changing project dependencies. `test/soundscape-browser.mjs` provides an optional real Web Audio offline render check.

`node test/vehicle-gallery.mjs` and `node test/character-gallery.mjs` render the actual modular models through WebGPU for visual review (the textured character gallery uses macOS `sips` to decode embedded images). The appearance suite covers deterministic variety, geometry budgets, detail transitions, safe traffic recycling, shared character resources, independent animation, and canceled loads. Its GPU precision test compares silhouettes, mapped normals and animated motion at the origin and three statewide locations.

Data rebuild scripts and prerequisites are documented in [public/geodata/README.md](public/geodata/README.md). Normal builds do not need Python or live map APIs. Pushing `main` builds and deploys through GitHub Actions.

## Credits

- [Tidewater](https://github.com/dgreenheck/tidewater), MIT. Original documentation is retained in [TIDEWATER.md](TIDEWATER.md); asset licenses remain with their files.
- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; [Geofabrik](https://download.geofabrik.de/north-america/us/california.html).
- [DataSF Building Footprints](https://data.sfgov.org/d/ynuv-fyni), PDDL.
- [Mapzen/Terrarium terrain](https://registry.opendata.aws/terrain-tiles/), including USGS and NOAA public-domain material; [full attribution](public/geodata/README.md).
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public-domain overview coastlines.
- [Golden Gate Bridge official dimensions](https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/) and [Salesforce Tower dimensions](https://salesforcetower.com/about/).
- National Park Service habitat references: [Channel Islands](https://www.nps.gov/chis/learn/nature/seabirds.htm), [Point Reyes](https://www.nps.gov/pore/planyourvisit/wildlife_viewing_birds.htm), [Redwood](https://www.nps.gov/redw/learn/nature/upload/bird-checklist-2015-508.pdf), [Cabrillo](https://www.nps.gov/cabr/learn/nature/birds.htm).
- California residents reuse the two credited Rocketbox character assets distributed with Tidewater, with modular clothing and accessories. New residents and stories are fictional.
