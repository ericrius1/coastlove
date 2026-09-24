# Coastlove

A standalone California exploration game built on [David Greenheck’s Tidewater](https://github.com/dgreenheck/tidewater). Explore the **Santa Barbara Channel**, from the Santa Barbara–Ventura mainland coast to **San Miguel, Santa Rosa, Santa Cruz, and Anacapa**.

The original Windward Isle project is kept separately and unchanged. Coastlove has its own repository, dependencies, port, and journal save key.

## Play

```sh
cd /Users/eric/codeprojects/coastlove
npm install
npm run dev
```

Open **http://127.0.0.1:5190** in Chrome with WebGPU enabled. The first visit compiles shaders. Double-click `Play Coastlove.command` for subsequent launches on this Mac.

| Control | Action |
| --- | --- |
| 1 / 2 / 3 | Boat / seaplane / safe arrival on foot |
| WASD | Walk, steer the boat, or turn/change speed in flight |
| Shift | Run or boost |
| Space / C in flight | Climb / descend |
| Hold Z + two-finger trackpad swipe | Scrub time backward / forward; horizontal and vertical gestures work |
| Hold Z + mouse drag | Alternative time scrub |
| E | Enter / exit a nearby car, talk, or interact |
| WASD / Space in a car | Accelerate/reverse, steer, brake; Shift for extra speed |
| J | Coastal chart, quick visits, collected stories, picture quality |
| V | Boat camera |
| T | Start / pause the day cycle |
| R / I | Fishing rod / inventory |
| F1 | Full controls |

## The coast

The 8.192 × 8.192 km world covers **67.1 km²**, about **8× Windward’s overall world area**. Its sampled land is approximately **35.06 km²**, about **21.1× Windward’s 1.662 km²**. Most extra land is the mainland hinterland; the ten detailed stops are concentrated along the coast and islands.

The shoreline comes from **Natural Earth’s real land polygons**, projected around Santa Barbara Harbor and scaled uniformly **1:18 horizontally**. The actual island arrangement and coastline shapes are retained. Natural Earth is cartographic data at 1:10 million scale, not a 10-metre survey. Elevation is procedural, with interpolated ridges, softened arrival areas, and invented story locations. The village, characters, and embellished landmarks are fictional. This is an artistic playable interpretation, not a surveyed recreation or navigation map.

There are four three-part NPC stories, 20 wandering island foxes, 12 sea lions, ten saved discoveries, a poppy/lupine bluff, wind-shaped grove, sea arch, lighthouse with a rotating night beam, luminous grotto, ship’s bell, and a telescope camp. Tidewater’s ocean, sky, fishing, marine life, sound, and boat physics are retained. The seaplane is an arcade travel mode with terrain clearance; switching to 3 provides the safe walking arrival.

## Coastal driving

Eight open-top roadsters patrol a 5.36 km two-lane mainland loop with visible NPC drivers. Use **Coastal drive · find a car** on the travel card to arrive beside an available vehicle, then press **E** to take the wheel. The NPC moves to the passenger seat while you drive and takes over again after you get out. Cars yield to people, avoid buildings and water, and use a bounded path search to return from nearby off-road areas. If a return route is blocked, the driver waits and retries instead of teleporting.

W accelerates, S brakes/reverses, A/D steer, Space brakes, and Shift gives extra speed. The chase camera follows the terrain; mouse/trackpad look lets you glance around. Headlights turn on at night and engine audio follows the throttle. The road is a fictional scenic route adapted to the real coastline. Boat, plane, walking, and Z + trackpad time controls still work.

## Performance and validation

Default **Full detail · long views** renders at native resolution, with the original 2048-pixel shadow maps. The chart also offers 80% and 65% internal resolution with temporal reconstruction; all three retain exactly the same draw distances. The height atlas remains 2048², the grass mask is capped at 4 MB, vegetation is limited to 6,500 trees / 14,000 shrubs / 28 harbor palms, and creatures are simulated only nearby. Terrain LOD keeps fine geometry 50% farther out. Trees and landmarks extend across the map to 12 km; foliage fades by projected pixel size, replacing the old 180 m shrub cutoff and 50% distant crown thinning. Clearer coastal haze preserves distant island contrast. Up to 850 additional boulders reuse the original instanced rock renderer along the real shorelines. The original detailed cloud and water shaders remain enabled.

On the development M5 MacBook Air (24 GB), the improved native-resolution build measured about 52–54 fps at the harbor. A six-second cross-channel flight sample measured a median 54 fps, minimum 50 fps, and maximum 56 fps. A nighttime lighthouse view showed approximately 41 fps. With cars added, a six-second driving check measured 46–54 fps (median 52 fps) at native resolution. These are short local samples, not a guarantee across every view or during shader compilation.

```sh
npm test
npm run test:exploration
npm run test:california
npm run test:traffic
npm run build
```

Browser integration checks: after loading the game, run `await (await import('/test/california-browser.mjs')).checkCalifornia(__app)` in development tools. This tests numeric controls, every arrival, time direction and midnight wrapping, night effects, characters, story saving, and completion, then restores journal data. `await (await import('/test/traffic-browser.mjs')).checkTraffic(__app)` checks actual road clearances, NPC driving, E entry/exit, braking, safe arrivals, and vehicle handoffs. Run it while on foot.

## Sources and credits

- [Tidewater](https://github.com/dgreenheck/tidewater), MIT — original engine and world systems. Original project notes are in [TIDEWATER.md](TIDEWATER.md). Asset credits and licenses remain with their files.
- [Natural Earth land polygons](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/), public domain — real shoreline geometry in `src/california/Coastline.js`.
- [National Park Service maps](https://www.nps.gov/chis/planyourvisit/maps.htm) — regional reference.
- Characters reuse the credited Rocketbox assets already distributed with Tidewater.
