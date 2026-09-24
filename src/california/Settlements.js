import { project } from './Geography.js';
// Real town / district anchors. Buildings, plazas and street grids are composed
// for exploration, not cadastral data. Radius is in playable metres.
const data = [
 ['border','Border Field',-117.118,32.544,'south',75,'reserve','Where the Pacific meets the southern border. Shorebirds skim the estuary.'],
 ['san-diego','San Diego',-117.161,32.724,'south',180,'city','A sunlit waterfront, harbor terraces, Spanish Revival arcades and a green park.'],
 ['la-jolla','La Jolla',-117.268,32.847,'south',95,'village','Sandstone coves, low oceanfront homes and pelicans on the updrafts.'],
 ['oceanside','Oceanside',-117.376,33.199,'south',110,'surf','Pastel surf shops and a colorful observation wheel face the evening swell.'],
 ['laguna','Laguna Beach',-117.776,33.548,'south',95,'arts','Terracotta roofs, painted shopfronts and a little sculpture garden.'],
 ['long-beach','Long Beach',-118.183,33.776,'south',135,'port','Colorful harbor blocks, palms and warm rooflines facing the islands.'],
 ['los-angeles','Los Angeles · Westside',-118.418,34.052,'south',210,'city','Palm boulevards and a Westside skyline, with the Pacific just beyond the low rooftops.'],
 ['malibu','Malibu',-118.802,34.035,'south',105,'surf','A quiet line of surf cottages between golden hills and blue water.'],
 ['ventura','Ventura',-119.295,34.283,'south',115,'mission','A mission-inspired plaza, orange tiles and an old coastal main street.'],
 ['pismo','Pismo Beach',-120.637,35.147,'central',100,'surf','A seaside boardwalk and brightly painted cottages among the dunes.'],
 ['morro','Morro Bay',-120.848,35.372,'central',105,'port','Fishing sheds and a great volcanic silhouette at the mouth of the bay.'],
 ['cambria','Cambria',-121.089,35.567,'central',95,'village','Wooden cottages, a village green and cypress shade along the bluffs.'],
 ['big-sur','Big Sur',-121.799,36.267,'central',95,'reserve','A quiet rest stop and folded mountains above a brilliant ocean.'],
 ['monterey','Monterey',-121.895,36.609,'central',130,'port','Cannery-inspired shopfronts and a sheltered plaza above the bay.'],
 ['santa-cruz','Santa Cruz',-122.027,36.970,'bay',130,'boardwalk','A colorful boardwalk, beach houses and a wheel turning against Monterey Bay.'],
 ['san-jose','San José · South Bay',-121.940,37.388,'bay',200,'city','A garden city at the tidal Bay’s inland edge: modern offices, warm brick and orchard courtyards.'],
 ['half-moon','Half Moon Bay',-122.435,37.470,'bay',100,'village','Low gabled shopfronts and a broad beach under the coastal sky.'],
 ['san-francisco','San Francisco',-122.446,37.776,'bay',150,'city','Pastel Victorian streets climb toward a skyline; a red suspension bridge guards the Golden Gate.'],
 ['point-reyes','Point Reyes',-122.950,38.053,'bay',100,'reserve','Wind-shaped grassland, weathered barns and seabirds riding the headlands.'],
 ['bodega','Bodega Bay',-123.035,38.327,'bay',100,'port','A fishing village tucked behind the headland, with cormorants over the harbor.'],
 ['gualala','Gualala',-123.525,38.775,'bay',95,'arts','Cedar storefronts, meadow art and a river meeting the sea.'],
 ['mendocino','Mendocino',-123.799,39.307,'north',105,'village','Pale Victorian cottages and tall evergreens above the headlands.'],
 ['fort-bragg','Fort Bragg',-123.800,39.442,'north',110,'port','Weathered mill-town storefronts and coastal rocks below the bluffs.'],
 ['shelter-cove','Shelter Cove',-124.065,40.029,'north',90,'reserve','The Lost Coast opens into a small hamlet and an enormous sky.'],
 ['eureka','Eureka',-124.159,40.793,'north',135,'victorian','Ornate Victorian rooftops and a working waterfront on Humboldt Bay.'],
 ['trinidad','Trinidad',-124.136,41.060,'north',95,'village','Small houses and dark coastal rocks beyond the cove.'],
 ['redwoods','Prairie Creek Redwoods',-124.022,41.364,'north',90,'forest','A leafy rest stop beneath tall redwoods, with ravens and Steller’s jays.'],
 ['crescent','Crescent City',-124.197,41.759,'north',110,'port','A little seaside town with pale rooftops and salt mist at the redwood coast.'],
 ['oregon','Pelican State Beach',-124.205,41.995,'north',75,'reserve','The northern end of California: beach grass, low seabird flights and Oregon beyond.'],
 ['catalina','Avalon · Catalina',-118.327,33.344,'islands',80,'island','A jewel-shaped harbor, tiled terraces and a round seaside pavilion.'],
];
export const SETTLEMENTS = data.map(([id,label,lon,lat,region,radius,style,story]) => ({id,label,lon,lat,...project(lon,lat),region,radius,style,story,kind:'town',major:style==='city',hint:story}));
export const SHOWCASE_CITIES = ['los-angeles','san-diego','san-jose'];
