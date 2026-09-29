use crate::data::{World, cell};
use glam::{DVec3, Vec3};
use serde::Deserialize;
use std::collections::HashSet;

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub color: [f32; 3],
    pub uv: [f32; 2],
    pub material: f32,
    pub surface: [f32; 4],
}
impl Vertex {
    pub fn new(p: Vec3, n: Vec3, c: [f32; 3], uv: [f32; 2], m: f32) -> Self {
        Self {
            position: p.to_array(),
            normal: n.to_array(),
            color: c,
            uv,
            material: m,
            surface: [0.85, 0., 0., 1.],
        }
    }
}
#[derive(Default)]
pub struct Mesh {
    pub vertices: Vec<Vertex>,
    pub indices: Vec<u32>,
    pub origin: DVec3,
    pub radius: f32,
}
impl Mesh {
    pub fn quad(&mut self, p: [Vec3; 4], n: Vec3, c: [f32; 3], m: f32) {
        let b = self.vertices.len() as u32;
        let w = p[0].distance(p[1]);
        let h = p[0].distance(p[3]);
        for (i, v) in p.into_iter().enumerate() {
            self.vertices.push(Vertex::new(
                v,
                n,
                c,
                [[0., 0.], [w, 0.], [w, h], [0., h]][i],
                m,
            ));
        }
        self.indices.extend([b, b + 1, b + 2, b, b + 2, b + 3]);
    }
}

pub fn hash(x: i32, z: i32, salt: u32) -> f64 {
    let mut n = (x as u32).wrapping_mul(374761393) ^ (z as u32).wrapping_mul(668265263) ^ salt;
    n = (n ^ (n >> 13)).wrapping_mul(1274126177);
    ((n ^ (n >> 16)) as f64) / u32::MAX as f64
}

// Nested, bounded clipmap rings. Matched outer edges use the coarser height
// interpolation; skirts cover the remaining T-junctions without growing the grid.
pub fn terrain(world: &World, center: DVec3, levels: usize) -> Mesh {
    let origin = DVec3::new(
        (center.x / 128.).floor() * 128.,
        0.,
        (center.z / 128.).floor() * 128.,
    );
    let mut mesh = Mesh {
        origin,
        radius: (32 * (4 << levels)) as f32,
        ..Default::default()
    };
    for level in 0..levels {
        let step = (4u32 << level) as f64;
        let base = mesh.vertices.len() as u32;
        for z in -32i32..=32 {
            for x in -32i32..=32 {
                let wx = origin.x + x as f64 * step;
                let wz = origin.z + z as f64 * step;
                let mut y = world.height(wx, wz);
                if x.abs() == 32 && z % 2 != 0 {
                    y = (world.height(wx, wz - step) + world.height(wx, wz + step)) * 0.5;
                }
                if z.abs() == 32 && x % 2 != 0 {
                    y = (world.height(wx - step, wz) + world.height(wx + step, wz)) * 0.5;
                }
                let n = world.normal(wx, wz, step.max(2.));
                mesh.vertices.push(Vertex::new(
                    Vec3::new((wx - origin.x) as f32, y as f32, (wz - origin.z) as f32),
                    n,
                    [0.25, 0.32, 0.15],
                    [((wx % 4096.) / 4.) as f32, ((wz % 4096.) / 4.) as f32],
                    1.,
                ));
            }
        }
        for z in 0..64 {
            for x in 0..64 {
                if level > 0 && (16..48).contains(&x) && (16..48).contains(&z) {
                    continue;
                }
                let a = base + (z * 65 + x) as u32;
                mesh.indices
                    .extend([a, a + 65, a + 1, a + 1, a + 65, a + 66]);
            }
        }
    }
    mesh
}
pub fn roads(world: &World, center: DVec3) -> Mesh {
    let mut mesh = Mesh {
        origin: center,
        radius: 3400.,
        ..Default::default()
    };
    let mut ids: HashSet<usize> = HashSet::new();
    let c = cell(center.x, center.z, 64.);
    for z in c.1 - 38..=c.1 + 38 {
        for x in c.0 - 38..=c.0 + 38 {
            if let Some(list) = world.road_cells.get(&(x, z)) {
                ids.extend(list.iter().copied());
            }
        }
    }
    for &id in &ids {
        let s = world.segments[id];
        let delta = s.b - s.a;
        let len = delta.x.hypot(delta.z);
        if len < 0.01 {
            continue;
        }
        let side = DVec3::new(delta.z, 0., -delta.x) / len;
        let count = (len / 12.).ceil().max(1.) as usize;
        for j in 0..count {
            let a = s.a + delta * (j as f64 / count as f64);
            let b = s.a + delta * ((j + 1) as f64 / count as f64);
            if (a.x - center.x).hypot(a.z - center.z) > 3300. {
                continue;
            }
            for (width, color, y, m) in [
                (s.width + 3., [0.45, 0.43, 0.36], 0.025, 0.),
                (s.width, [0.15, 0.16, 0.15], 0.045, 0.),
                (0.13, [0.74, 0.62, 0.32], 0.055, 2.),
            ] {
                let point = |p: DVec3, k: f64| {
                    let mut v = p + side * (k * width / 2.);
                    if !s.bridge {
                        v.y = world.height(v.x, v.z);
                    }
                    v.y += y;
                    (v - center).as_vec3()
                };
                mesh.quad(
                    [point(a, -1.), point(b, -1.), point(b, 1.), point(a, 1.)],
                    Vec3::Y,
                    color,
                    m,
                );
            }
        }
    }
    mesh
}
#[derive(Deserialize, Clone)]
pub struct Plant {
    pub position: DVec3,
    pub scale: f32,
    pub heading: f32,
    pub kind: usize,
}
pub fn forest(world: &World, center: DVec3) -> Vec<Plant> {
    let c = cell(center.x, center.z, 18.);
    let mut out = world
        .meta
        .town_plants
        .iter()
        .filter(|p| (p.position - center).length() < 2000.)
        .cloned()
        .collect::<Vec<_>>();
    // Deterministic world cells keep a tree in exactly the same place after travel.
    for z in c.1 - 88..=c.1 + 88 {
        for x in c.0 - 88..=c.0 + 88 {
            let wx = x as f64 * 18. + hash(x, z, 31) * 16.;
            let wz = z as f64 * 18. + hash(x, z, 57) * 16.;
            let d = (wx - center.x).hypot(wz - center.z);
            if d > 1500. || world.city_cells.contains(&cell(wx, wz, 512.)) {
                continue;
            }
            let h = world.height(wx, wz);
            if !(2.5..1500.).contains(&h) || world.road_distance(wx, wz) < 6. {
                continue;
            }
            let north = smooth(-260000., -620000., wz);
            let density = 0.23 + north * 0.55;
            let clump = hash(x.div_euclid(9), z.div_euclid(9), 333);
            if hash(x, z, 113) > density * (0.45 + clump * 0.8)
                || world.blocked(DVec3::new(wx, h, wz), 5.)
            {
                continue;
            }
            // Preserve the starter harbor clearing and the authored courtyards.
            if world
                .meta
                .places
                .iter()
                .any(|p| (p.x - wx).hypot(p.z - wz) < 28.)
            {
                continue;
            }
            if world.normal(wx, wz, 3.).y < 0.65 {
                continue;
            }
            let kind = if north > 0.5 || hash(x, z, 818) < 0.15 {
                1
            } else {
                0
            };
            out.push(Plant {
                position: DVec3::new(wx, h - 0.1, wz),
                scale: (0.7 + hash(x, z, 211) * 0.65) as f32,
                heading: (hash(x, z, 66) * std::f64::consts::TAU) as f32,
                kind,
            });
            if d < 260. {
                for i in 0..3 {
                    let a = hash(x, z, 700 + i) * std::f64::consts::TAU;
                    let r = 2. + hash(x, z, 810 + i) * 6.;
                    let px = wx + a.sin() * r;
                    let pz = wz + a.cos() * r;
                    let y = world.height(px, pz);
                    out.push(Plant {
                        position: DVec3::new(px, y, pz),
                        scale: (0.6 + hash(x, z, i) * 0.7) as f32,
                        heading: a as f32,
                        kind: if i == 0 { 4 } else { 2 },
                    });
                }
            }
        }
    }
    for &(x, z, ref kind, scale) in &world.city_plants {
        if (x - center.x).hypot(z - center.z) < 1500. {
            let y = world.height(x, z);
            if y > 0.5 && world.road_distance(x, z) > 0.8 {
                out.push(Plant {
                    position: DVec3::new(x, y, z),
                    scale: scale as f32,
                    heading: hash(x as i32, z as i32, 51) as f32 * std::f32::consts::TAU,
                    kind: if kind == "shrubs" {
                        4
                    } else if kind == "palms" {
                        3
                    } else {
                        0
                    },
                });
            }
        }
    }
    out
}
fn smooth(a: f64, b: f64, x: f64) -> f64 {
    crate::data::smooth(a, b, x)
}
#[derive(Deserialize, Clone)]
pub struct Building {
    pub p: Vec<[f64; 2]>,
    pub h: f64,
}
pub fn building_cell(b: &Building) -> (i32, i32) {
    let mut area = 0.;
    let mut x = 0.;
    let mut z = 0.;
    for (a, b) in b.p.iter().zip(b.p.iter().cycle().skip(1)).take(b.p.len()) {
        let cross = a[0] * b[1] - b[0] * a[1];
        area += cross;
        x += (a[0] + b[0]) * cross;
        z += (a[1] + b[1]) * cross;
    }
    if area.abs() > 0.001 {
        cell(x / (3. * area), z / (3. * area), 512.)
    } else {
        cell(b.p[0][0], b.p[0][1], 512.)
    }
}
pub fn buildings(world: &World, rows: &[Building], origin: DVec3) -> Mesh {
    let mut m = Mesh {
        origin,
        radius: 900.,
        ..Default::default()
    };
    for (i, row) in rows.iter().enumerate() {
        if row.p.len() < 3 {
            continue;
        }
        let mut p = row.p.clone();
        if p.first() == p.last() {
            p.pop();
        }
        if p.len() < 3 {
            continue;
        }
        let base = p
            .iter()
            .map(|p| world.height(p[0], p[1]))
            .fold(f64::INFINITY, f64::min)
            - 0.4;
        let top = p
            .iter()
            .map(|p| world.height(p[0], p[1]))
            .fold(f64::NEG_INFINITY, f64::max)
            .max(base + row.h);
        let tint = hash(i as i32, p[0][0] as i32, 41) as f32;
        let c = [0.45 + tint * 0.23, 0.43 + tint * 0.19, 0.36 + tint * 0.18];
        let area: f64 = p
            .iter()
            .zip(p.iter().cycle().skip(1))
            .map(|(a, b)| a[0] * b[1] - b[0] * a[1])
            .sum();
        for (a, b) in p.iter().zip(p.iter().cycle().skip(1)).take(p.len()) {
            let aa = Vec3::new(
                (a[0] - origin.x) as f32,
                base as f32,
                (a[1] - origin.z) as f32,
            );
            let bb = Vec3::new(
                (b[0] - origin.x) as f32,
                base as f32,
                (b[1] - origin.z) as f32,
            );
            let up = Vec3::Y * (top - base) as f32;
            let n = Vec3::new(bb.z - aa.z, 0., aa.x - bb.x).normalize_or_zero()
                * if area > 0. { 1. } else { -1. };
            m.quad([aa, bb, bb + up, aa + up], n, c, 3.);
        }
        let flat: Vec<f64> = p.iter().flatten().copied().collect();
        if let Ok(tris) = earcutr::earcut(&flat, &[], 2) {
            let base = m.vertices.len() as u32;
            for a in &p {
                m.vertices.push(Vertex::new(
                    Vec3::new(
                        (a[0] - origin.x) as f32,
                        top as f32,
                        (a[1] - origin.z) as f32,
                    ),
                    Vec3::Y,
                    [0.29, 0.30, 0.27],
                    [0., 0.],
                    0.,
                ));
            }
            m.indices.extend(tris.iter().map(|&v| base + v as u32));
        }
    }
    m
}
pub fn polygon_contains(p: &[[f64; 2]], x: f64, z: f64, pad: f64) -> bool {
    let mut inside = false;
    for (a, b) in p.iter().zip(p.iter().cycle().skip(1)).take(p.len()) {
        if (a[1] > z) != (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0] {
            inside = !inside;
        }
        let dx = b[0] - a[0];
        let dz = b[1] - a[1];
        let t =
            (((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz).max(0.001)).clamp(0., 1.);
        if (x - a[0] - t * dx).hypot(z - a[1] - t * dz) < pad {
            return true;
        }
    }
    inside
}
