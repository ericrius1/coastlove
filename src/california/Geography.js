// Geographic positions remain consistent everywhere: map, terrain, settlements,
// habitats and stories. Heights / street layouts are an artistic interpretation.
export const GEO = Object.freeze({ lon: -119.685, lat: 34.410, scale: 32, inlandMiles: 10 });
const MX = 111320 * Math.cos(GEO.lat * Math.PI / 180) / GEO.scale;
const MZ = 111320 / GEO.scale;
export function project(lon, lat) { return { x: (lon - GEO.lon) * MX, z: -(lat - GEO.lat) * MZ }; }
export function unproject(x, z) { return { lon: x / MX + GEO.lon, lat: GEO.lat - z / MZ }; }
export const INLAND = GEO.inlandMiles * 1609.344 / GEO.scale;
export function regionAt(x, z) {
 const {lat} = unproject(x,z);
 return lat >= 39.3 ? 'north' : lat >= 37.0 ? 'bay' : lat >= 34.6 ? 'central' : 'south';
}
