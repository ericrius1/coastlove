import {readFile} from 'node:fs/promises';
import {loadElevation} from '../src/california/Elevation.js';
import {loadRoadData,StreetNetwork} from '../src/california/RealRoads.js';
import {CaliforniaTerrain} from '../src/california/CaliforniaTerrain.js';
export async function readGeo(path){const b=await readFile(new URL('../public/geodata/'+path,import.meta.url));return path.endsWith('.json')?JSON.parse(b):b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
export async function realTerrain(){await Promise.all([loadElevation(readGeo),loadRoadData(readGeo)]);const t=new CaliforniaTerrain();t.streets=new StreetNetwork(t);return t;}
