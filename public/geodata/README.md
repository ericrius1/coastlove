# Coastlove geographic data

One game unit is one metre. Coordinates use California Albers (EPSG:3310), translated to longitude −119.685°, latitude 34.410°, with +X east and +Z south. No horizontal travel compression or vertical exaggeration is applied. Projection distortion is inherent to a statewide flat map.

## Sources and licensing

- `sf/roads.json` and `la/`: © OpenStreetMap contributors, [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). LA is compiled from [Geofabrik Southern California, 2026-09-23](https://download.geofabrik.de/north-america/us/california.html). SF streets were obtained through Overpass on 2026-09-24. These derived databases remain available here in editable JSON under ODbL. The game code's MIT license does not replace the data license.
- `sf/cells/`, `sf/skyline.json`: [DataSF Building Footprints, ynuv-fyni](https://data.sfgov.org/d/ynuv-fyni), City and County of San Francisco, under [PDDL 1.0](https://opendatacommons.org/licenses/pddl/1-0/). The 2016 survey contains LiDAR roof heights and detailed footprints. Downloaded 2026-09-24. Filtered to the playable SF region, simplified by at most 0.18 m, projected to metres and partitioned into 512 m cells. Roof medians represent the predominant roof surface, not necessarily the highest antenna or roof feature.
- SF's modern Salesforce Tower supplement uses a stylized rounded footprint and its published [1,070 ft architectural height](https://salesforcetower.com/about/). The Transamerica Pyramid is tapered to its architectural height. Those are stylized landmark models, not survey meshes.
- `*-height.bin`: [Mapzen/Terrarium terrain tiles on AWS](https://registry.opendata.aws/terrain-tiles/). United States 3DEP, GMTED2010 and SRTM data courtesy of the U.S. Geological Survey; ETOPO1 data from DOC/NOAA/NESDIS/NCEI, National Centers for Environmental Information, U.S. Department of Commerce; Mexico relief data source INEGI, Continental relief, 2016. [Provider attribution and terms](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). US government source material is not subject to copyright protection in the United States. Source data is interpolated, reprojected, quantized to decimetres and bathymetry clipped at −150 m. These modified data are not endorsed by the source agencies.
- `city-greenery.json`: deterministic ornamental plantings positioned clear of the building and road databases; not a surveyed tree inventory. OSM-derived placement data is distributed under ODbL alongside the source databases.
- The overview shoreline uses [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public domain. Its generalized coastline differs from the elevation grid at small inlets.

## Accuracy and runtime

Road centre lines, block layouts and surveyed footprints retain geographic positions. Widths use OSM width/lane tags where supplied, otherwise metre-based class estimates. LA heights use height/level tags where supplied; untagged structures have estimated heights marked in each record. Residential façades, trees, NPCs, ramps and other props are artistic interpretations. The 28 smaller town districts and starter harbor remain hand-composed. Tunnels are omitted from the drivable network; complex multi-level interchanges are simplified. This is an exploration game, not a navigation product.

Height grids: statewide 512 m, SF 8 m, LA 16 m, harbor 8 m. These are **output grid spacings**, not claims of source survey resolution. Bilinear interpolation and a moving 4 m rendering patch keep walking smooth; interpolation adds no surveyed detail. Small road cuts and harbor/town pads smooth gameplay locally.

Building cells load near the player and are evicted after travel. Larger buildings have separate distant silhouettes. Full source data is bundled for static GitHub Pages hosting; it is not all turned into meshes at startup.

## Rebuilding

Python 3 with requests, Pillow, numpy, pyproj, shapely, osmium:

1. `scripts/build-real-coast.py --cache <cache> --sf <reference-project> --part terrain` bakes the four terrain grids. Its legacy city option reproduces the initial OSM import; the next two scripts produce the current building datasets.
2. Download DataSF's public CSV export from `https://data.sfgov.org/api/views/ynuv-fyni/rows.csv?accessType=DOWNLOAD`, then run `scripts/bake-sf-survey.py <csv>`.
3. Download the Geofabrik Southern California `.osm.pbf`, then run `scripts/bake-osm-extract.py <pbf>`.
4. Run `scripts/bake-city-greenery.py` after both cities are baked.
5. `npm run test:metric` validates scale and data completeness.

Normal builds need only Node and the committed data; no live map service or API key is required.
