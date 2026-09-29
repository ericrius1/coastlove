use anyhow::{Context, Result, bail};
use glam::{DVec3, Vec3};
use serde::Deserialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Deserialize, Clone)]
pub struct Geometry {
    pub first: u32,
    pub count: u32,
    pub radius: f32,
}
#[derive(Deserialize, Clone)]
pub struct Draw {
    pub geometry: usize,
    pub matrix: [f64; 16],
    pub entity: i32,
    #[serde(default)]
    pub joint: String,
}
#[derive(Deserialize, Clone)]
pub struct Entity {
    pub kind: String,
    pub id: String,
    pub position: [f64; 3],
    pub heading: f64,
}
#[derive(Deserialize, Clone)]
pub struct Place {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub label: String,
    pub x: f64,
    pub z: f64,
    #[serde(default)]
    pub hint: String,
    #[serde(default)]
    pub story: String,
    #[serde(default)]
    pub water: bool,
}
impl Place {
    pub fn title(&self) -> &str {
        if self.label.is_empty() {
            &self.name
        } else {
            &self.label
        }
    }
}
#[derive(Deserialize, Clone)]
pub struct Story {
    pub id: String,
    pub name: String,
    pub role: String,
    pub pages: Vec<String>,
    pub position: [f64; 3],
}
#[derive(Deserialize, Clone)]
pub struct Letter {
    pub id: String,
    pub title: String,
    pub window: String,
    pub duration: f64,
    pub radius: f64,
    pub instruction: String,
    pub clue: String,
    pub text: String,
    pub reply: String,
    pub position: [f64; 3],
}
#[derive(Deserialize, Clone)]
pub struct Pad {
    pub x: f64,
    pub z: f64,
    pub radius: f64,
    pub height: f64,
    pub falloff: f64,
}
#[derive(Deserialize, Clone)]
pub struct Road {
    pub width: f64,
    pub bridge: bool,
    pub points: Vec<[f64; 3]>,
}
#[derive(Deserialize, Clone)]
pub struct BoxCollider {
    pub center: [f64; 3],
    pub half: [f64; 3],
    pub angle: f64,
    pub solid: bool,
    pub walkable: bool,
}
#[derive(Deserialize, Clone)]
pub struct Cylinder {
    pub x: f64,
    pub z: f64,
    pub radius: f64,
    #[serde(rename = "yMin")]
    pub ymin: f64,
    #[serde(rename = "yMax")]
    pub ymax: f64,
}
#[derive(Deserialize, Clone)]
pub struct Ramp {
    pub x: f64,
    pub z: f64,
    pub sx: f64,
    pub sz: f64,
    pub length: f64,
    pub width: f64,
    pub back: f64,
    pub front: f64,
}
#[derive(Deserialize)]
pub struct Metadata {
    pub version: u32,
    pub geometries: Vec<Geometry>,
    pub draws: Vec<Draw>,
    pub entities: Vec<Entity>,
    #[serde(rename = "townPlants")]
    pub town_plants: Vec<crate::mesh::Plant>,
    pub places: Vec<Place>,
    pub stories: Vec<Story>,
    pub letters: Vec<Letter>,
    pub pads: Vec<Pad>,
    pub roads: Vec<Road>,
    pub boxes: Vec<BoxCollider>,
    pub cylinders: Vec<Cylinder>,
    pub ramps: Vec<Ramp>,
}
#[derive(Deserialize)]
struct GridInfo {
    x: f64,
    z: f64,
    width: usize,
    height: usize,
    step: f64,
    scale: f64,
}
struct HeightGrid {
    info: GridInfo,
    values: Vec<i16>,
}
impl HeightGrid {
    fn sample(&self, x: f64, z: f64) -> Option<f64> {
        let m = &self.info;
        let u = (x - m.x) / m.step;
        let v = (z - m.z) / m.step;
        if u < 0. || v < 0. || u >= (m.width - 1) as f64 || v >= (m.height - 1) as f64 {
            return None;
        }
        let i = u.floor() as usize;
        let j = v.floor() as usize;
        let a = u - i as f64;
        let b = v - j as f64;
        let h = |dx, dz| self.values[(j + dz) * m.width + i + dx] as f64 * m.scale;
        Some((h(0, 0) * (1. - a) + h(1, 0) * a) * (1. - b) + (h(0, 1) * (1. - a) + h(1, 1) * a) * b)
    }
}
#[derive(Clone, Copy)]
pub struct Segment {
    pub a: DVec3,
    pub b: DVec3,
    pub width: f64,
    pub bridge: bool,
}
impl Segment {
    pub fn near(&self, x: f64, z: f64) -> (f64, f64) {
        let d = self.b - self.a;
        let u = (((x - self.a.x) * d.x + (z - self.a.z) * d.z)
            / (d.x * d.x + d.z * d.z).max(0.001))
        .clamp(0., 1.);
        let p = self.a + d * u;
        ((x - p.x).hypot(z - p.z), p.y)
    }
}
pub struct World {
    pub root: PathBuf,
    pub meta: Metadata,
    grids: Vec<HeightGrid>,
    coast: HeightGrid,
    pub segments: Vec<Segment>,
    pub road_cells: HashMap<(i32, i32), Vec<usize>>,
    pub city_cells: HashSet<(i32, i32)>,
    pub city_plants: Vec<(f64, f64, String, f64)>,
    box_cells: HashMap<(i32, i32), Vec<usize>>,
    pad_cells: HashMap<(i32, i32), Vec<usize>>,
    pub vertices: Vec<crate::mesh::Vertex>,
    pub indices: Vec<u32>,
}
pub fn smooth(a: f64, b: f64, x: f64) -> f64 {
    let t = ((x - a) / (b - a)).clamp(0., 1.);
    t * t * (3. - 2. * t)
}
pub fn cell(x: f64, z: f64, size: f64) -> (i32, i32) {
    ((x / size).floor() as i32, (z / size).floor() as i32)
}
fn index_bounds(
    map: &mut HashMap<(i32, i32), Vec<usize>>,
    lo: [f64; 2],
    hi: [f64; 2],
    size: f64,
    id: usize,
) {
    let a = cell(lo[0], lo[1], size);
    let b = cell(hi[0], hi[1], size);
    for z in a.1..=b.1 {
        for x in a.0..=b.0 {
            map.entry((x, z)).or_default().push(id);
        }
    }
}
impl World {
    pub fn load(root: &Path) -> Result<Arc<Self>> {
        let assets = root.join("native/assets");
        let meta: Metadata = serde_json::from_slice(
            &std::fs::read(assets.join("world.json"))
                .context("Native assets missing. Run npm run native:assets once.")?,
        )?;
        if meta.version != 2 {
            bail!("Unsupported native world version")
        }
        let mut grids = Vec::new();
        for name in ["sf", "la", "harbor", "california"] {
            let info: GridInfo = serde_json::from_slice(&std::fs::read(
                root.join(format!("public/geodata/{name}-height.json")),
            )?)?;
            let bytes = std::fs::read(root.join(format!("public/geodata/{name}-height.bin")))?;
            if bytes.len() != info.width * info.height * 2 {
                bail!("Invalid {name} DEM length")
            }
            grids.push(HeightGrid {
                info,
                values: bytes
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|b| i16::from_le_bytes([b[0], b[1]]))
                    .collect(),
            });
        }
        let vb = std::fs::read(assets.join("vertices.bin"))?;
        let ib = std::fs::read(assets.join("indices.bin"))?;
        if vb.len() % 64 != 0 || ib.len() % 4 != 0 {
            bail!("Truncated native geometry")
        }
        let vertices = vb
            .as_chunks::<64>()
            .0
            .iter()
            .map(|b| bytemuck::pod_read_unaligned(b))
            .collect::<Vec<_>>();
        let indices = ib
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| u32::from_le_bytes(*b))
            .collect::<Vec<_>>();
        if indices.iter().any(|&i| i as usize >= vertices.len())
            || meta
                .geometries
                .iter()
                .any(|g| g.first as usize + g.count as usize > indices.len())
        {
            bail!("Invalid native mesh indices")
        }
        let coast_bytes = std::fs::read(assets.join("coast-mask.bin"))
            .context("Coast mask missing. Run npm run native:assets.")?;
        if coast_bytes.len() != 4096 * 4096 * 2 {
            bail!("Truncated coast mask");
        }
        let coast = HeightGrid {
            info: GridInfo {
                x: -1048320.,
                z: -1048320.,
                step: 512.,
                width: 4096,
                height: 4096,
                scale: 1.,
            },
            values: coast_bytes
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| i16::from_le_bytes(*b))
                .collect(),
        };
        let mut world = Self {
            coast,
            root: root.to_path_buf(),
            meta,
            grids,
            segments: Vec::new(),
            road_cells: HashMap::new(),
            city_cells: HashSet::new(),
            city_plants: serde_json::from_slice(&std::fs::read(
                root.join("public/geodata/city-greenery.json"),
            )?)?,
            box_cells: HashMap::new(),
            pad_cells: HashMap::new(),
            vertices,
            indices,
        };
        for city in ["sf", "la"] {
            let index: serde_json::Value = serde_json::from_slice(&std::fs::read(
                root.join(format!("public/geodata/{city}/index.json")),
            )?)?;
            for value in index["cells"].as_array().context("Invalid city index")? {
                if let Some((x, z)) = value.as_str().and_then(|s| s.split_once(',')) {
                    world.city_cells.insert((x.parse()?, z.parse()?));
                }
            }
        }
        for r in &world.meta.roads {
            for p in r.points.windows(2) {
                let a = DVec3::from(p[0]);
                let b = DVec3::from(p[1]);
                let pad = r.width / 2. + 6.;
                let id = world.segments.len();
                world.segments.push(Segment {
                    a,
                    b,
                    width: r.width,
                    bridge: r.bridge,
                });
                index_bounds(
                    &mut world.road_cells,
                    [a.x.min(b.x) - pad, a.z.min(b.z) - pad],
                    [a.x.max(b.x) + pad, a.z.max(b.z) + pad],
                    64.,
                    id,
                );
            }
        }
        for (i, b) in world.meta.boxes.iter().enumerate() {
            let r = b.half[0].hypot(b.half[2]) + 4.;
            index_bounds(
                &mut world.box_cells,
                [b.center[0] - r, b.center[2] - r],
                [b.center[0] + r, b.center[2] + r],
                128.,
                i,
            );
        }
        for (i, p) in world.meta.pads.iter().enumerate() {
            let r = p.radius + p.falloff;
            index_bounds(
                &mut world.pad_cells,
                [p.x - r, p.z - r],
                [p.x + r, p.z + r],
                512.,
                i,
            );
        }
        Ok(Arc::new(world))
    }
    pub fn raw_height(&self, x: f64, z: f64) -> f64 {
        let mut h = self
            .grids
            .iter()
            .find_map(|g| g.sample(x, z))
            .unwrap_or(-150.);
        // Local Terrarium tiles contain near-zero masked ocean pixels. Use
        // offshore bathymetry there so waves do not expose a checkerboard bed.
        if (-0.5..0.75).contains(&h) {
            let offshore = self.grids.last().and_then(|g| g.sample(x, z)).unwrap_or(0.);
            let coast = self.coast.sample(x, z).unwrap_or(24000.);
            if offshore < -1. {
                h = offshore;
            } else if coast > 16. {
                h = -(2. + coast * 0.06).min(150.);
            }
        }
        let blend = (1. - smooth(140., 350., x.abs())) * (1. - smooth(140., 360., (z + 42.).abs()));
        if blend > 0. {
            let d = z + 42.;
            let harbor = if d > 0. {
                -(d * 0.14).min(70.)
            } else {
                (-d * 0.1).min(8.)
            };
            h += (harbor - h) * blend;
        }
        h
    }
    pub fn height(&self, x: f64, z: f64) -> f64 {
        let mut h = self.raw_height(x, z);
        if let Some(ids) = self.pad_cells.get(&cell(x, z, 512.)) {
            for &id in ids {
                let p = &self.meta.pads[id];
                let d = (x - p.x).hypot(z - p.z);
                if d < p.radius + p.falloff {
                    h += (p.height - h) * (1. - smooth(p.radius, p.radius + p.falloff, d));
                }
            }
        }
        if let Some(ids) = self.road_cells.get(&cell(x, z, 64.)) {
            let mut best = f64::INFINITY;
            let mut target = h;
            let mut width = 0.;
            for &id in ids {
                let s = &self.segments[id];
                if s.bridge {
                    continue;
                }
                let (d, y) = s.near(x, z);
                if d < best {
                    best = d;
                    target = y;
                    width = s.width;
                }
            }
            h += (target - h) * (1. - smooth(width / 2. + 4.5, width / 2. + 6., best));
        }
        h
    }
    pub fn ground(&self, x: f64, z: f64, max_y: f64) -> f64 {
        let mut h = self.height(x, z);
        if let Some(ids) = self.road_cells.get(&cell(x, z, 64.)) {
            for &id in ids {
                let s = self.segments[id];
                if s.bridge {
                    let (d, y) = s.near(x, z);
                    if d < s.width / 2. && y <= max_y {
                        h = h.max(y);
                    }
                }
            }
        }
        if let Some(ids) = self.box_cells.get(&cell(x, z, 128.)) {
            for &id in ids {
                let b = &self.meta.boxes[id];
                let top = b.center[1] + b.half[1];
                if b.walkable && top <= max_y && inside_box(b, x, z, 0.) {
                    h = h.max(top);
                }
            }
        }
        for r in &self.meta.ramps {
            let dx = x - r.x;
            let dz = z - r.z;
            let s = dx * r.sx + dz * r.sz;
            if s.abs() <= r.length / 2. && (dx * r.sz - dz * r.sx).abs() <= r.width / 2. {
                h = h.max(r.back + (r.front - r.back) * (s / r.length + 0.5));
            }
        }
        h
    }
    pub fn blocked(&self, p: DVec3, r: f64) -> bool {
        if let Some(ids) = self.box_cells.get(&cell(p.x, p.z, 128.)) {
            for &id in ids {
                let b = &self.meta.boxes[id];
                if b.solid
                    && p.y + 1.6 > b.center[1] - b.half[1]
                    && p.y + 0.4 < b.center[1] + b.half[1]
                    && inside_box(b, p.x, p.z, r)
                {
                    return true;
                }
            }
        }
        self.meta.cylinders.iter().any(|c| {
            p.y + 1.6 > c.ymin && p.y + 0.4 < c.ymax && (p.x - c.x).hypot(p.z - c.z) < c.radius + r
        })
    }
    pub fn safe_land(&self, x: f64, z: f64) -> DVec3 {
        // An atlas pin may be inside a real city footprint. Arrive at the
        // nearest street verge while detailed building cells are still loading.
        if self.city_cells.contains(&cell(x, z, 512.)) {
            let c = cell(x, z, 64.);
            let mut best = f64::INFINITY;
            let mut arrival = None;
            for dz in -6..=6 {
                for dx in -6..=6 {
                    if let Some(ids) = self.road_cells.get(&(c.0 + dx, c.1 + dz)) {
                        for &id in ids {
                            let road = self.segments[id];
                            if road.bridge {
                                continue;
                            }
                            let delta = road.b - road.a;
                            let len2 = delta.x * delta.x + delta.z * delta.z;
                            let t = (((x - road.a.x) * delta.x + (z - road.a.z) * delta.z)
                                / len2.max(0.001))
                            .clamp(0., 1.);
                            let p = road.a + delta * t;
                            let side = DVec3::new(delta.z, 0., -delta.x) / len2.sqrt().max(0.001);
                            for sign in [-1., 1.] {
                                let mut p = p + side * (road.width / 2. + 1.2) * sign;
                                p.y = self.ground(p.x, p.z, f64::INFINITY);
                                let d = (p.x - x).hypot(p.z - z);
                                if d < best && p.y > 0.4 && !self.blocked(p, 0.7) {
                                    best = d;
                                    arrival = Some(p);
                                }
                            }
                        }
                    }
                }
            }
            if let Some(p) = arrival {
                return p;
            }
        }
        for i in 0..2400 {
            let a = i as f64 * 2.399963;
            let r = (i as f64).sqrt() * 2.5;
            let px = x + a.sin() * r;
            let pz = z + a.cos() * r;
            let y = self.ground(px, pz, f64::INFINITY);
            let p = DVec3::new(px, y, pz);
            if y > 0.4
                && !self.blocked(p, 0.7)
                && !self
                    .meta
                    .stories
                    .iter()
                    .any(|s| (DVec3::from(s.position) - p).length() < 3.)
                && (self.height(px + 2., pz) - self.height(px - 2., pz)).abs() < 2.5
                && (self.height(px, pz + 2.) - self.height(px, pz - 2.)).abs() < 2.5
            {
                return p;
            }
        }
        DVec3::new(x, self.ground(x, z, f64::INFINITY).max(0.), z)
    }
    pub fn obstacle_top(&self, x: f64, z: f64) -> f64 {
        let mut top = self.ground(x, z, f64::INFINITY).max(0.);
        if let Some(ids) = self.box_cells.get(&cell(x, z, 128.)) {
            for &id in ids {
                let b = &self.meta.boxes[id];
                if inside_box(b, x, z, 8.) {
                    top = top.max(b.center[1] + b.half[1]);
                }
            }
        }
        for c in &self.meta.cylinders {
            if (x - c.x).hypot(z - c.z) < c.radius + 8. {
                top = top.max(c.ymax);
            }
        }
        top
    }
    pub fn normal(&self, x: f64, z: f64, step: f64) -> Vec3 {
        Vec3::new(
            (self.height(x - step, z) - self.height(x + step, z)) as f32,
            (step * 2.) as f32,
            (self.height(x, z - step) - self.height(x, z + step)) as f32,
        )
        .normalize()
    }
    pub fn road_distance(&self, x: f64, z: f64) -> f64 {
        self.road_cells
            .get(&cell(x, z, 64.))
            .map(|ids| {
                ids.iter()
                    .map(|&i| {
                        let s = self.segments[i];
                        s.near(x, z).0 - s.width / 2.
                    })
                    .fold(f64::INFINITY, f64::min)
            })
            .unwrap_or(f64::INFINITY)
    }
}
pub fn inside_box(b: &BoxCollider, x: f64, z: f64, pad: f64) -> bool {
    let dx = x - b.center[0];
    let dz = z - b.center[2];
    let (c, s) = (b.angle.cos(), b.angle.sin());
    (dx * c - dz * s).abs() < b.half[0] + pad && (dx * s + dz * c).abs() < b.half[2] + pad
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn negative_cell_keys_do_not_alias() {
        assert_ne!(cell(-65., 0., 64.), cell(-1., 0., 64.));
        assert_eq!(cell(-0.1, 0., 64.), (-1, 0));
    }
    #[test]
    fn dem_bilinear() {
        let g = HeightGrid {
            info: GridInfo {
                x: 0.,
                z: 0.,
                width: 2,
                height: 2,
                step: 8.,
                scale: 0.1,
            },
            values: vec![0, 100, 200, 300],
        };
        assert_eq!(g.sample(4., 4.), Some(15.));
        assert_eq!(g.sample(-1., 4.), None);
    }
    #[test]
    fn precision_across_california() {
        let world = DVec3::new(-246880.302703, 22., -869300.99);
        let p = world + DVec3::new(0.002, 0., 0.);
        assert!(((p - world).as_vec3().x - 0.002).abs() < 1e-7);
    }
}
