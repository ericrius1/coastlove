import { Group, Mesh, InstancedMesh } from '../engine/index.js';
import { prepare, mergePrepared, sphere, cylinder, box, torus, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { standard } from '../materials/Materials.js';
import { mulberry32, smoothstep } from '../util/Noise.js';
import { findSafeSpot } from './Navigation.js';
import { TIDE_LETTERS } from './TideLetters.js';
import { PLACES } from '../california/Region.js';

// The tiny fictional lights are a visual reply to the letters, not a new animal.
// Six static batches, with motion on the GPU and no per-frame instance uploads.
export class LetterLanterns {
	constructor(app) {
		this.sites = new Map();
		this.material = createPropMaterial('saltWornLetters');
		this.light = standard({ name: 'letterLight', color: 0xa0bfad, emissive: 0x8dcab5,
			emissiveIntensity: 1, roughness: .55, receiveShadows: false,
			vertex: `let seed = f32(v.instance) * 2.39996;
				v.worldOffset = vec3f(sin(frame.time * 0.31 + seed) * 0.23, sin(frame.time * 0.43 + seed * 1.7) * 0.22, cos(frame.time * 0.27 + seed) * 0.23);
				let previous = frame.time - frame.dt;
				v.prevWorldOffset = vec3f(sin(previous * 0.31 + seed) * 0.23, sin(previous * 0.43 + seed * 1.7) * 0.22, cos(previous * 0.27 + seed) * 0.23);`,
			surface: 's.emissive *= 0.55 + 0.45 * sin(frame.time * 1.4 + in.P.y * 2.0);',
		});
		const mote = sphere(.033, 5, 4);
		for (const letter of TIDE_LETTERS) {
			const place = PLACES.find(p => p.id === letter.placeId);
			let position = { x: place.x, y: place.water ? .15 : app.terrainData.heightAt(place.x, place.z), z: place.z };
			if (letter.id === 'home') position = findSafeSpot(app.terrainData, app.colliders, place.x - 27, place.z + 24, false, 60) || position;
			const group = new Group(); group.position.copy(position); group.name = `Letter · ${letter.title}`;
			app.scene.add(group);
			const parts = [], add = (geo, color, matrix) => parts.push(prepare(geo, { color, rough: .8, matrix }));
			if (letter.id === 'seed' || letter.id === 'stars') {
				const x = letter.id === 'seed' ? 2.4 : -3;
				add(sphere(1, 9, 6), 0x7b8270, mat4(x, .27, 1.8, 0, .4, 0, .65, .33, .48));
				add(box(.46, .11, .32), 0xa48c52, mat4(x, .6, 1.8, 0, -.22, 0));
				add(box(.36, .012, .24), 0xe4d9b8, mat4(x, .666, 1.8, 0, -.22, 0));
				add(torus(.065, .012, 4, 12), 0x667b68, mat4(x, .677, 1.8, Math.PI / 2));
			} else if (letter.id === 'light') {
				add(box(.6, .45, .08), 0xb1995f, mat4(1.5, 1.2, 2.8, 0, .45, 0));
				for (let i = 0; i < 6; i++) add(sphere(.022, 5, 4), 0xe2d7b0, mat4(1.3 + i * .065, 1.22 + Math.sin(i) * .08, 2.855 - i * .03));
			} else if (letter.id === 'home') {
				// Pebbles, curled fern-colored shoots, and a seedling in an open ring.
				const random = mulberry32(613);
				for (let i = 0; i < 18; i++) {
					const a = i / 18 * Math.PI * 2, x = Math.sin(a) * 2.5, z = Math.cos(a) * 2.5;
					const y = app.terrainData.heightAt(position.x + x, position.z + z) - position.y;
					add(sphere(1, 7, 5), i % 3 ? 0x8e9987 : 0xadb69c, mat4(x, y + .16, z, 0, a, 0, .25 + random() * .13, .18, .32));
				}
				add(cylinder(.022, .06, 1.6, 7), 0x75634c, mat4(0, .8, 0));
				for (let i = 0; i < 7; i++) {
					const a = i * 2.4;
					add(sphere(1, 7, 5), i % 2 ? 0x739565 : 0x4e775e, mat4(Math.sin(a) * .2, .7 + i * .13, Math.cos(a) * .2, 0, a, .5, .13, .04, .35));
				}
				add(box(.65, .045, .43), 0xc2b288, mat4(-.8, .24, 1.5, -.2, .3, 0));
			}
			if (parts.length) { const mesh = new Mesh(mergePrepared(parts), this.material); mesh.castShadow = true; group.add(mesh); }
			const lights = new InstancedMesh(mote, this.light, 24), random = mulberry32(430 + this.sites.size);
			for (let i = 0; i < 24; i++) {
				const a = random() * Math.PI * 2, r = 1 + random() * 5;
				lights.setMatrixAt(i, mat4(Math.sin(a) * r, .4 + random() * 1.7, Math.cos(a) * r));
			}
			lights.instanceMatrix.needsUpdate = true; lights.visible = false; group.add(lights);
			this.sites.set(letter.id, { group, lights, position: group.position, place });
		}
	}

	update(player, hour, letters) {
		const dark = 1 - smoothstep(5, 7, hour) + smoothstep(18, 20.5, hour);
		this.light.emissiveIntensity = .35 + dark * 2.5;
		for (const [id, site] of this.sites) {
			const dx = site.position.x - player.x, dz = site.position.z - player.z;
			site.group.visible = dx * dx + dz * dz < 350 * 350;
			site.lights.visible = site.group.visible && (letters.found.has(id) || (letters.current?.id === id && letters.progress > .12));
		}
	}
}
