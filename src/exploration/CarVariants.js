// Appearance is derived from the complete seed, independently of the eight body
// families. Cars eight places apart share a silhouette, not a fixed paint job.
const freezeEntries = entries => Object.freeze(entries.map(entry => Object.freeze(entry)));

export const CAR_FAMILIES = freezeEntries([
  { id: 'roadster', name: 'Cabriolet', label: 'Cabriolet' },
  { id: 'coupe', name: 'Coupe', label: 'Coupe' },
  { id: 'wagon', name: 'Surf Wagon', label: 'Surf Wagon' },
  { id: 'hatchback', name: 'Hatchback', label: 'Hatchback' },
  { id: 'pickup', name: 'Pickup', label: 'Pickup' },
  { id: 'van', name: 'Coastliner', label: 'Coastliner' },
  { id: 'rally', name: 'Rally', label: 'Rally' },
  { id: 'sedan', name: 'Sedan', label: 'Sedan' },
]);

export const CAR_PAINTS = freezeEntries([
  { id: 'seafoam', name: 'Seafoam', color: 0x71ada0 },
  { id: 'clementine', name: 'Clementine', color: 0xc9854e },
  { id: 'sunbeam', name: 'Sunbeam', color: 0xe0c775 },
  { id: 'bluebird', name: 'Bluebird', color: 0x648faf },
  { id: 'sage', name: 'Sage', color: 0x8eaa85 },
  { id: 'coral', name: 'Coral', color: 0xce887a },
  { id: 'indigo', name: 'Indigo', color: 0x536b91 },
  { id: 'sandpiper', name: 'Sandpiper', color: 0xbab08d },
  { id: 'pacific', name: 'Pacific', color: 0x357c8e },
  { id: 'eucalyptus', name: 'Eucalyptus', color: 0x527e68 },
  { id: 'apricot', name: 'Apricot', color: 0xe0a781 },
  { id: 'poppy', name: 'Poppy', color: 0xba6544 },
  { id: 'oatmilk', name: 'Oatmilk', color: 0xe3dcc1 },
  { id: 'catalina', name: 'Catalina', color: 0x86bac3 },
  { id: 'redwood', name: 'Redwood', color: 0x874f42 },
  { id: 'saltwater', name: 'Saltwater', color: 0xb8cbbb },
  { id: 'mulberry', name: 'Mulberry', color: 0x8e6678 },
  { id: 'driftwood', name: 'Driftwood', color: 0xa78a6a },
  { id: 'seagrass', name: 'Seagrass', color: 0xb3b77c },
  { id: 'golden-hour', name: 'Golden Hour', color: 0xbb944b },
  { id: 'pebble', name: 'Pebble', color: 0x929f9a },
  { id: 'persimmon', name: 'Persimmon', color: 0xbe705d },
  { id: 'tidepool', name: 'Tidepool', color: 0x456f72 },
  { id: 'midnight', name: 'Midnight', color: 0x354956 },
]);

export const CAR_WHEEL_STYLES = freezeEntries([
  { id: 'steel', name: 'Classic Steel' },
  { id: 'turbine', name: 'Turbine' },
  { id: 'five-spoke', name: 'Five Spoke' },
  { id: 'mesh', name: 'Basketweave' },
  { id: 'whitewall', name: 'Whitewall' },
]);

const TRIMS = freezeEntries([
  { name: 'Chrome', color: 0xc8cbbf },
  { name: 'Graphite', color: 0x394441 },
  { name: 'Warm Bronze', color: 0xa58a5b },
]);
const ROOFS = freezeEntries([
  { name: 'Ivory', color: 0xe1ddc8 },
  { name: 'Canvas', color: 0xb7aa88 },
  { name: 'Graphite', color: 0x394441 },
  { name: 'Ocean', color: 0x49636a },
]);
const INTERIORS = [0xa57b54, 0xc6ab7e, 0x485957, 0x805a45, 0x565c6c, 0xc4bd9d];
const LIGHT_ACCENTS = [0xe8dfb9, 0xc8d4cb, 0xe8c484, 0xcfb69b];
const DARK_ACCENTS = [0x39575b, 0x594c3b, 0x74483d, 0x405367];
const STRIPES = ['none', 'none', 'pinstripe', 'twin', 'side'];
const ACCESSORIES = {
  roadster: ['none', 'none', 'surfboard', 'spare'],
  coupe: ['none', 'none', 'surfboard', 'roofrack'],
  wagon: ['none', 'surfboard', 'roofrack', 'cargo'],
  hatchback: ['none', 'surfboard', 'roofrack', 'cargo'],
  pickup: ['none', 'surfboard', 'spare', 'cargo'],
  van: ['none', 'surfboard', 'roofrack', 'cargo'],
  rally: ['none', 'rally', 'spare', 'roofrack'],
  sedan: ['none', 'none', 'roofrack', 'cargo'],
};
const WHEELS = {
  roadster: [0, 1, 2, 3, 4],
  coupe: [0, 1, 2, 3, 4],
  wagon: [0, 1, 3, 4],
  hatchback: [0, 1, 2, 3],
  pickup: [0, 1, 2],
  van: [0, 1, 4],
  rally: [0, 2, 3],
  sedan: [0, 1, 2, 3, 4],
};

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function randomFrom(hash) {
  let state = hash;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Preserve seed identity rather than using the random hash as an ID: even hash
// collisions produce distinct car IDs. UTF-16 hex also handles arbitrary strings.
function seedId(seed) {
  if (typeof seed === 'number') {
    return `car-n-${String(seed).replace(/-/g, 'm').replace(/\+/g, 'p').replace(/\./g, 'd')}`;
  }
  let id = 'car-s-';
  for (let i = 0; i < seed.length; i++) id += seed.charCodeAt(i).toString(16).padStart(4, '0');
  return id;
}

/**
 * Pure, deterministic appearance descriptor. Colors are RGB integers; wheel,
 * stripe and accessory are geometry keys. Driver selects one of eight shared
 * appearances. Numeric seeds 0–7 deliberately showcase all eight silhouettes.
 */
export function describeCar(seed = 0) {
  if (typeof seed !== 'string' && (typeof seed !== 'number' || !Number.isFinite(seed))) {
    throw new TypeError('Car seed must be a finite number or string');
  }
  // Normalize negative zero so the same visible numeric seed has the same ID.
  if (Object.is(seed, -0)) seed = 0;
  const hash = hashSeed(`${typeof seed}:${seed}`);
  const random = randomFrom(hash);
  const pick = values => values[Math.floor(random() * values.length)];
  const familyIndex = Number.isSafeInteger(seed)
    ? ((seed % CAR_FAMILIES.length) + CAR_FAMILIES.length) % CAR_FAMILIES.length
    : hash % CAR_FAMILIES.length;
  const family = CAR_FAMILIES[familyIndex];
  const paint = pick(CAR_PAINTS);
  const roof = random() < 0.4 && family.id !== 'roadster'
    ? { name: paint.name, color: paint.color }
    : pick(ROOFS);
  const trim = pick(TRIMS);
  const wheel = CAR_WHEEL_STYLES[pick(WHEELS[family.id])];
  const accessory = pick(ACCESSORIES[family.id]);
  const brightness = ((paint.color >>> 16) * 299 + ((paint.color >>> 8) & 255) * 587 + (paint.color & 255) * 114) / 1000;
  const accent = pick(brightness > 150 ? DARK_ACCENTS : LIGHT_ACCENTS);
  const stripe = pick(STRIPES);
  const interior = pick(INTERIORS);
  const driver = Math.floor(random() * 8);

  return Object.freeze({
    seed,
    id: seedId(seed),
    name: `${paint.name} ${family.name}`,
    family: family.id,
    familyName: family.name,
    paint: paint.color,
    paintName: paint.name,
    roof: roof.color,
    roofName: roof.name,
    trim: trim.color,
    trimName: trim.name,
    wheel: wheel.id,
    wheelName: wheel.name,
    accessory,
    accent,
    stripe,
    interior,
    driver,
  });
}
