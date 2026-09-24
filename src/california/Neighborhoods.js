import {project} from './Geography.js';
// Named street-level stops, in the same metre projection as OSM and the DEM.
export const NEIGHBORHOODS=[
 ['sf-marina','Marina · Chestnut Street',-122.4376,37.8003,'bay'],
 ['sf-north-beach','North Beach · Columbus Avenue',-122.4095,37.7992,'bay'],
 ['sf-nob-hill','Nob Hill · California Street',-122.4145,37.7912,'bay'],
 ['sf-mission','Mission · Valencia Street',-122.4215,37.7599,'bay'],
 ['sf-sunset','Sunset · Irving Street',-122.4667,37.7637,'bay'],
 ['sf-twin-peaks','Twin Peaks · the downhill run',-122.4476,37.7520,'bay'],
 ['sf-downtown','Downtown SF · Market Street',-122.3998,37.7910,'bay'],
 ['sf-golden-gate','Golden Gate · southern approach',-122.4753,37.8060,'bay'],
 ['la-santa-monica','Santa Monica · Ocean Avenue',-118.4963,34.0147,'south'],
 ['la-venice','Venice · Pacific Avenue',-118.4722,33.9870,'south'],
 ['la-beverly','Beverly Hills · Rodeo Drive',-118.4014,34.0694,'south'],
 ['la-hollywood','Hollywood Boulevard',-118.3407,34.1016,'south'],
 ['la-downtown','Downtown LA · Grand Avenue',-118.2512,34.0528,'south'],
 ['la-griffith','Griffith Park · Observatory Road',-118.2991,34.1193,'south'],
 ['la-mulholland','Mulholland Drive · mountain run',-118.3711,34.1286,'south'],
 ['la-topanga','Topanga · canyon roads',-118.6004,34.1043,'south'],
].map(([id,label,lon,lat,region])=>({id,label,name:label,lon,lat,...project(lon,lat),region,kind:'neighborhood',radius:65,hint:'Real streets, real distances. Press 4 for a car; M returns to the atlas.',story:'Another corner of California, at its own unhurried scale.'}));
