# Windward Isle

A playable exploration extension of Daniel Greenheck’s [Tidewater](https://github.com/dgreenheck/tidewater), retaining the original rendering engine, ocean, fishing systems, assets, MIT license and third-party credits.

## Play locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5189/ in a WebGPU-capable browser. Keep the tab in the foreground while it initializes. The first launch compiles the ocean and landscape shaders and can take a minute or more.

## Exploration controls

| Key | Action |
| --- | --- |
| 1 / numpad 1 | Summon the boat at nearby clear, deep water and take the helm |
| 2 / numpad 2 | Launch Marigold, the courier seaplane, above your current location |
| 3 / numpad 3 | Arrive safely at the nearest suitable ground |
| WASD | Walk / drive; in the plane W/S adjust speed and A/D turn |
| Space / C | Climb / descend in the plane |
| Shift | Run / boost |
| E | Listen to an islander; advance the conversation |
| J | Field journal; choose an islander to track by compass bearing and distance |
| Escape | Leave a conversation or close the journal |
| R / I | Original fishing rod / cooler |
| F1 | Full controls and replayable introduction |

The number keys offer instant travel. Flight uses an accessible arcade model with automatic terrain clearance; it does not simulate a runway takeoff, stall or water landing. Going on foot searches for dry, clear terrain rather than dropping the player from altitude. The boat retains Tidewater’s buoyancy, handling, fuel and upgrades.

## The island

The terrain uses seed 19 with horizontal dimensions multiplied by √2. Against the same seed at the original scale, measured land area increases from **0.831 km² to 1.662 km²** before building pads. This is twice the area, rather than twice the width. Heightmap resolution stays at 2048² to control memory. Material masks, terrain queries, paths, shore maps, vegetation bounds and the minimap follow the larger domain.

Four residents—Inés the pilot, Rowan the grove keeper, Sana the naturalist and Elias the night watch—wander short routes near their homes. Each has a three-part story. Find 32 goats and tortoises around these locations; approach within nine metres on foot to record each species. Complete all four stories and both sightings to finish the field expedition. Journal progress is saved separately from fishing progress in browser storage (`tidewater.windward.journal.v1`).

The plane and animals are procedural models. Residents reuse Tidewater’s credited Rocketbox character assets, with procedural fallbacks if loading fails. These are a first gameplay pass, with text conversations and simple ambient behavior; bespoke character art, voiced dialogue and deeper quests are future work.

## Validation

```sh
npm run build
npm test
npm run test:exploration
```

Exploration checks cover safe placement, shoreline rejection, flight steering and altitude, world boundaries, exact area scaling, resident placement and dry-ground wandering. Existing tests cover fishing logic and a headless WebGPU render.

## Main extension files

- `src/exploration/Exploration.js`: travel modes, dialogue, journal and discovery progress.
- `src/exploration/Seaplane.js`: procedural aircraft, arcade flight and chase camera.
- `src/exploration/IslandLife.js`: stories, resident routes, creature models and wandering.
- `src/exploration/Navigation.js`: shared dry-ground / open-water placement checks.
- `src/exploration/exploration.css`: travel card, conversations and journal.

Original licensing and asset attributions remain in `LICENSE` and `CREDITS.md`.
