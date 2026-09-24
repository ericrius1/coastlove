# Coastlove

A standalone California exploration game built on [David Greenheck’s Tidewater](https://github.com/dgreenheck/tidewater). Follow the Pacific from **Border Field, south of San Diego, to Pelican State Beach at the Oregon line**, including San Francisco Bay and all eight Channel Islands.

**[Play Coastlove](https://ericrius1.github.io/coastlove/)** · **[Repository](https://github.com/ericrius1/coastlove)**

The original Windward Isle project remains separate. Coastlove has its own repository, dependencies, port and saved journal.

## The coast

The map uses real Natural Earth shoreline polygons at **1:32 horizontal travel scale**, with a populated corridor extending roughly **10 real miles inland from the coast and bays**. The 65.536 km square terrain domain provides continuous coastline and inexpensive distant mountain scenery. Hills are procedural; town blocks, roads, gardens, landmarks and stories are composed for pleasant exploration. Shoreline data is cartographic at 1:10 million scale, not a local elevation survey. Small coast features and arrivals are softened or embellished for smooth walking. This is an artistic interpretation with real geographic anchors, not a street-for-street reconstruction.

There are **30 town districts, 40 discovery stops and nine three-part NPC stories**. Los Angeles, San Diego and San José—the state's three largest cities—receive larger districts, more buildings and additional landmarks. San Francisco also has a skyline district and a Golden Gate Bridge interpretation. Regional palettes change from southern stucco and tile to central coast cottages, Bay Area rooftops and northern Victorian houses and redwoods. Public art, garden courtyards, café terraces, observation wheels and illuminated windows give the stops something to explore.

The original Santa Barbara harbor and Channel Island discoveries remain: island foxes, sea lions, poppy and lupine bluffs, sea arch, lighthouse, nighttime grotto, wreck bell and telescope camp. Tidewater's ocean, sky, fishing, marine life, sound and boat physics are retained.

## Controls

| Control | Action |
| --- | --- |
| 1 / 2 / 3 | Boat / seaplane / safe arrival on foot |
| WASD | Walk, drive or steer the boat |
| Trackpad in flight | Move right to turn right, left to turn left; vertical movement pitches the nose. Click the game view to capture the pointer. |
| A / D in flight | Turn left / right |
| W / S in flight | Speed up / slow down |
| Shift / Shift + W in flight | Boost / fast coastal cruise |
| L in flight | Hold to level the nose |
| Space / C in flight | Rise / descend |
| Hold Z + two-finger trackpad swipe | Scrub time backward / forward; horizontal and vertical gestures both work |
| Hold Z + mouse drag | Alternative time scrub |
| E | Enter / exit a nearby car, talk or interact |
| WASD / Space in a car | Accelerate/reverse, steer / brake; Shift for extra speed |
| J | Coastal chart, instant visits, stories, region filter and picture quality |
| Chart scroll / drag / double-click | Zoom / pan / fit the whole coast |
| V / T / R / I / F1 | Boat camera / day cycle / fishing rod / inventory / full controls |

Flight uses the San Francisco project's input response with the coordinate sign corrected for this engine. Turning and pitching are rate-limited, the chase camera follows smoothly, and terrain and rooftop clearance help avoid crashes. With a level nose, releasing the altitude keys holds height. Press 3 for a safe walking arrival, or J to visit another part of California instantly.

## Traffic and birds

A pool of **sixteen roadsters** follows the region you explore. NPCs circulate on the statewide scenic coastal drive, the Santa Barbara loop and local town roads. Use **Coastal drive · find a car**, then press **E**. The driver moves into the passenger seat and takes over again when you get out. Cars yield to pedestrians, avoid buildings and water, and physically return from reachable off-road shoulders. Only distant, unoccupied cars are reassigned to another area. The road network is an invented scenic route adapted to the real shore, not surveyed Highway 1.

Regional flocks add western gulls, brown pelicans and Brandt's cormorants along the coast, royal terns in the south, common ravens inland, and Steller's jays in northern forest areas. Pelicans and cormorants fly in lines; other birds circle in groups. These are habitat-inspired artistic populations, not a seasonal wildlife census. Up to **280 regional birds** are simulated near the player, sharing the original instanced bird renderer.

## Performance

**Full detail · long views** remains the default at native resolution with the original 2048-pixel shadow maps. The 80% and 65% picture settings retain the same draw distances. Continuous terrain LOD spans the entire coast; larger landmarks and cities remain visible farther away. Detail budgets stay bounded: a 4096² height atlas, 4 MB grass mask, 6,500 scattered trees, 14,000 shrubs, nearby city collision pool, instanced town geometry, and nearby traffic and wildlife simulation. Regional town groves add palms and redwoods.

A camera-following shore field restores **4 m surf sampling** near each beach. Its worker runs off the main thread, while the statewide field supplies distant waves. The local minimap follows travel anywhere on the coast.

Browser checks on the development M5 MacBook Air at native resolution showed approximately **43–54 fps** in sampled harbor and southern coastal views. These are short samples, not a statewide benchmark; first-use shader compilation and dense views can run slower. The original cloud and water effects remain enabled.

## Run and verify

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5190 in a WebGPU-capable Chrome browser. The first launch compiles shaders. On this Mac, `Play Coastlove.command` also launches the project.

```sh
npm test
npm run test:exploration
npm run test:california
npm run test:traffic
npm run build
```

Checks cover flight input direction at four compass headings, pitch and clearance, statewide geographic bounds, stable town placement, all 40 safe arrivals with buildings, both road lanes, traffic after all 30 town visits, regional bird habitats and budgets, vegetation limits and distant terrain coverage. The traffic suite also runs ten simulated minutes of NPC driving, takeover, braking, safe exit and off-road recovery.

In the development browser, `await (await import('/test/california-browser.mjs')).checkCalifornia(__app)` exercises numeric controls, arrivals, Z time scrubbing, stories and journal saving; it restores journal data afterward. `await (await import('/test/traffic-browser.mjs')).checkTraffic(__app)` checks vehicle interactions; start on foot.

`scripts/build-coast.py path/to/ne_10m_land.geojson` regenerates the shoreline and scenic route (Python with Shapely). Geometry is committed, so normal builds need no map download or Python packages. Pushing `main` builds and deploys through GitHub Actions to GitHub Pages.

## Sources and credits

- [Tidewater](https://github.com/dgreenheck/tidewater), MIT — original engine and world systems. Original notes remain in [TIDEWATER.md](TIDEWATER.md); asset credits and licenses remain with their files.
- [Natural Earth land polygons](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/), public domain — shoreline geometry.
- [California Department of Finance city populations](https://dof.ca.gov/media/docs/forecasting/Demographics/estimates/E-1_2025_Press_Release.pdf) — largest-city selection.
- National Park Service habitat references: [Channel Islands seabirds](https://www.nps.gov/chis/learn/nature/seabirds.htm), [Point Reyes birds](https://www.nps.gov/pore/planyourvisit/wildlife_viewing_birds.htm), [Redwood bird checklist](https://www.nps.gov/redw/learn/nature/upload/bird-checklist-2015-508.pdf), [Cabrillo birds](https://www.nps.gov/cabr/learn/nature/birds.htm).
- Harbor characters reuse the credited Rocketbox assets distributed with Tidewater. New story residents use lightweight procedural figures; all story text is fictional.
