import proj4 from 'proj4';
// California Albers (EPSG:3310), metres. +X east, +Z south; no travel compression.
// The projection's small cartographic distortion is not an artistic scale factor.
const albers = '+proj=aea +lat_1=34 +lat_2=40.5 +lat_0=0 +lon_0=-120 +x_0=0 +y_0=-4000000 +datum=NAD83 +units=m +no_defs';
const projection = proj4('EPSG:4326', albers);
export const GEO = Object.freeze({lon:-119.685,lat:34.410,scale:1,inlandMiles:10,crs:'EPSG:3310'});
const [ox,oy] = projection.forward([GEO.lon,GEO.lat]);
export function project(lon,lat) { const [x,y]=projection.forward([lon,lat]);return{x:x-ox,z:oy-y}; }
export function unproject(x,z) { const [lon,lat]=projection.inverse([x+ox,oy-z]);return{lon,lat}; }
export function legacyPoint(x,z) { return project(GEO.lon+x*32/(111320*Math.cos(GEO.lat*Math.PI/180)),GEO.lat-z*32/111320); }
export const INLAND=GEO.inlandMiles*1609.344;
export function regionAt(x,z) { const{lat}=unproject(x,z);return lat>=39.3?'north':lat>=37?'bay':lat>=34.6?'central':'south'; }
