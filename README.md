# Coastlove

A California exploration game built on [David Greenheck’s Tidewater](https://github.com/dgreenheck/tidewater).

**[Play Coastlove](https://ericrius1.github.io/coastlove/)** · **[GitHub](https://github.com/ericrius1/coastlove)**

Travel from Border Field near San Diego to the Oregon line, with the Bay and eight Channel Islands. Coastlove is a separate project; the original Tidewater and San Francisco projects are unchanged.

## Real scale and real cities

**One game metre equals one real metre.** California Albers coordinates preserve geographic placement without the old 1:32 travel compression. Elevation comes from public terrain data, interpolated for smooth movement. Local road grading and small town/harbor pads soften rough transitions.

SF uses **169,462** DataSF building footprints with LiDAR roof heights, plus stylized landmark supplements. LA has **874,991** OSM building footprints across downtown, Hollywood, the Westside, Griffith Park and the canyon areas. Actual street centre lines create recognizable grids and neighborhoods. Street widths use supplied tags or class estimates; buildings without measured heights use estimates. The Golden Gate model uses a 1,280 m main span, 27 m overall width and 227 m towers, with a driving surface and connected approaches.

There are **56 destinations**, including Nob Hill, North Beach, the Mission, Twin Peaks, Santa Monica, Venice, Hollywood, downtown LA, Griffith Park, Mulholland Drive and Topanga. The 28 smaller town districts, starter harbor, plants, stories and stunt props remain artistic compositions. SF's survey predates newer construction; façades are stylized, and tunnels and complex interchanges are simplified. See [data sources, accuracy and licenses](public/geodata/README.md).

Tidewater's ocean, sky, fishing, marine life, sound and boat physics remain. Nine NPC stories, foxes, sea lions, regional bird flocks, a nighttime grotto, bell and telescope camp give you reasons to stop.

## Controls

| Control | Action |
| --- | --- |
| **1 / 2 / 3 / 4** | Boat / plane / walk / car (number row or numpad) |
| **E** | Enter or exit the nearby vehicle; talk when no vehicle is nearby. In flight, land nearby and get out. |
| **W / S in a car** | Accelerate / brake and reverse |
| **A / D or trackpad in a car** | Steer; click the scene to capture the pointer |
| **Shift / Space in a car** | Boost / handbrake drift |
| **Trackpad in flight** | Horizontal movement turns the plane; vertical movement pitches it |
| **A / D · W / S in flight** | Turn · speed up/down |
| **Shift + W · L · Space / C** | Fast cruise · level nose · rise/descend |
| **M** | Almost full-screen inset atlas: pan, zoom, search, or click anywhere to place a teleport pin and press Enter. The world keeps running. |
| **F (map open)** | Center and zoom to your current location |
| **Map drag / scroll or pinch** | Pan / zoom beneath the pointer; arrows and +/− also work |
| **J** | Field notes, stories and picture quality |
| **Hold Z + trackpad swipe** | Scrub time forward or backward |
| **WASD / Shift on foot** | Walk / run |
| **V / T / R / I / F1** | Boat camera / day cycle / fishing rod / inventory / full controls |

Cars have independent arcade handling, momentum, drifting, suspension, airborne motion and landings. Leave the road, run down hills, or find the optional ramps near Twin Peaks, Mulholland and Griffith Park. NPCs use a pool of sixteen cars on nearby streets and resume driving after you exit. Ramps and handling are fictional gameplay additions in metre units.

Map input belongs to the map while it is open. Traffic, birds, waves and time continue; an occupied vehicle coasts or continues flying. Close it with M or Escape to regain control.

## Performance

The default preserves native picture resolution, 2048-pixel shadows and long terrain views. **J → Picture quality → Air** renders at 80% internal resolution with temporal reconstruction and the same geometry, effects and draw distances. Smooth uses 65%.

A bounded 2048² statewide atlas and one moving 4 km ground patch replace area-proportional allocations. Nearby ground detail and building cells stream around the player. Terrain visibility bounds are cached; building shadows and collision geometry are local; taller buildings retain distant silhouettes. Grass, pebbles, traffic and wildlife have fixed nearby budgets. Camera-relative rendering avoids sky and geometry precision problems hundreds of kilometres from the origin.

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
npm run build
```

The WebGPU water regression checks that shoreline displacement, crest phase and beach wash advance on every frame at 30, 60 and 120 fps, including statewide clock ranges. Tests cover metre projection and data completeness, bridge surfaces, terrain visibility, safe arrivals, flight controls, wildlife budgets, vehicle interactions, ten simulated minutes of NPC driving, arcade steering, drifting, ramp jumps, landings and collision substeps. Browser tests in `test/controls-browser.mjs` exercise map focus, continued simulation, pan/zoom, teleportation and unified E interactions against the running app.

Data rebuild scripts and prerequisites are documented in [public/geodata/README.md](public/geodata/README.md). Normal builds do not need Python or live map APIs. Pushing `main` builds and deploys through GitHub Actions.

## Credits

- [Tidewater](https://github.com/dgreenheck/tidewater), MIT. Original documentation is retained in [TIDEWATER.md](TIDEWATER.md); asset licenses remain with their files.
- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; [Geofabrik](https://download.geofabrik.de/north-america/us/california.html).
- [DataSF Building Footprints](https://data.sfgov.org/d/ynuv-fyni), PDDL.
- [Mapzen/Terrarium terrain](https://registry.opendata.aws/terrain-tiles/), including USGS and NOAA public-domain material; [full attribution](public/geodata/README.md).
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public-domain overview coastlines.
- [Golden Gate Bridge official dimensions](https://www.goldengate.org/bridge/history-research/statistics-data/design-construction-stats/) and [Salesforce Tower dimensions](https://salesforcetower.com/about/).
- National Park Service habitat references: [Channel Islands](https://www.nps.gov/chis/learn/nature/seabirds.htm), [Point Reyes](https://www.nps.gov/pore/planyourvisit/wildlife_viewing_birds.htm), [Redwood](https://www.nps.gov/redw/learn/nature/upload/bird-checklist-2015-508.pdf), [Cabrillo](https://www.nps.gov/cabr/learn/nature/birds.htm).
- Harbor characters reuse the credited Rocketbox assets distributed with Tidewater. New residents and stories are fictional.
