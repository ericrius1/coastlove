use crate::{
    data::{World, cell},
    mesh::{self, Building, Mesh, Plant},
};
use glam::DVec3;
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, mpsc},
    thread,
};

pub struct Landscape {
    pub terrain: Mesh,
    pub roads: Mesh,
    pub plants: Vec<Plant>,
}
pub struct LandscapeStream {
    tx: mpsc::SyncSender<(DVec3, usize)>,
    pub rx: mpsc::Receiver<Landscape>,
    last: Option<(i32, i32, usize)>,
}
impl LandscapeStream {
    pub fn new(world: Arc<World>) -> Self {
        let (tx, requests) = mpsc::sync_channel::<(DVec3, usize)>(1);
        let (results, rx) = mpsc::sync_channel(1);
        thread::Builder::new()
            .name("coastlove-landscape".into())
            .spawn(move || {
                while let Ok(mut request) = requests.recv() {
                    while let Ok(next) = requests.try_recv() {
                        request = next;
                    }
                    let (p, levels) = request;
                    let landscape = Landscape {
                        terrain: mesh::terrain(&world, p, levels),
                        roads: mesh::roads(&world, DVec3::new(p.x, 0., p.z)),
                        plants: mesh::forest(&world, p),
                    };
                    if results.send(landscape).is_err() {
                        break;
                    }
                }
            })
            .expect("landscape worker");
        Self { tx, rx, last: None }
    }
    pub fn request(&mut self, p: DVec3, levels: usize) {
        let c = cell(p.x, p.z, 128.);
        let key = (c.0, c.1, levels);
        if self.last != Some(key) && self.tx.try_send((p, levels)).is_ok() {
            self.last = Some(key);
        }
    }
}
pub struct CityResult {
    pub key: (usize, i32, i32),
    pub mesh: Mesh,
    pub buildings: Vec<Building>,
}
pub struct CityStream {
    tx: mpsc::SyncSender<Vec<(usize, i32, i32)>>,
    pub rx: mpsc::Receiver<CityResult>,
    pub available: [HashSet<(i32, i32)>; 2],
    pub desired: HashSet<(usize, i32, i32)>,
    requested: HashSet<(usize, i32, i32)>,
    last: (i32, i32),
}
impl CityStream {
    pub fn new(world: Arc<World>) -> Self {
        let available = std::array::from_fn(|i| {
            let path = world
                .root
                .join(format!("public/geodata/{}/index.json", ["sf", "la"][i]));
            let data: serde_json::Value =
                serde_json::from_slice(&std::fs::read(path).unwrap_or_default())
                    .unwrap_or_default();
            data["cells"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|v| {
                    let s = v.as_str()?;
                    let (x, z) = s.split_once(',')?;
                    Some((x.parse().ok()?, z.parse().ok()?))
                })
                .collect()
        });
        let (tx, requests) = mpsc::sync_channel::<Vec<(usize, i32, i32)>>(1);
        let (results, rx) = mpsc::sync_channel(2);
        thread::Builder::new()
            .name("coastlove-city".into())
            .spawn(move || {
                let mut pending = Vec::new();
                loop {
                    if pending.is_empty() {
                        match requests.recv() {
                            Ok(r) => pending = r,
                            Err(_) => break,
                        }
                    }
                    if let Ok(r) = requests.try_recv() {
                        pending = r;
                    }
                    let Some(key) = pending.pop() else { continue };
                    let (city, x, z) = key;
                    let path = world.root.join(format!(
                        "public/geodata/{}/cells/{x},{z}.json",
                        ["sf", "la"][city]
                    ));
                    match std::fs::read(&path)
                        .map_err(anyhow::Error::from)
                        .and_then(|b| Ok(serde_json::from_slice::<Vec<Building>>(&b)?))
                    {
                        Ok(rows) => {
                            let mesh = mesh::buildings(
                                &world,
                                &rows,
                                DVec3::new(x as f64 * 512., 0., z as f64 * 512.),
                            );
                            if results
                                .send(CityResult {
                                    key,
                                    mesh,
                                    buildings: rows,
                                })
                                .is_err()
                            {
                                break;
                            }
                        }
                        Err(e) => {
                            eprintln!("City cell {}: {e}", path.display());
                            if results
                                .send(CityResult {
                                    key,
                                    mesh: Mesh::default(),
                                    buildings: Vec::new(),
                                })
                                .is_err()
                            {
                                break;
                            }
                        }
                    }
                }
            })
            .expect("city worker");
        Self {
            tx,
            rx,
            available,
            desired: HashSet::new(),
            requested: HashSet::new(),
            last: (i32::MAX, i32::MAX),
        }
    }
    pub fn request(&mut self, p: DVec3, resident: &HashSet<(usize, i32, i32)>) {
        let c = cell(p.x, p.z, 512.);
        if c == self.last {
            return;
        }
        let mut keys = Vec::new();
        for city in 0..2 {
            for z in c.1 - 4..=c.1 + 4 {
                for x in c.0 - 4..=c.0 + 4 {
                    if self.available[city].contains(&(x, z)) {
                        keys.push((city, x, z));
                    }
                }
            }
        }
        keys.sort_by_key(|&(_, x, z)| -((x - c.0).pow(2) + (z - c.1).pow(2)));
        self.desired = keys.iter().copied().collect();
        keys.retain(|key| !resident.contains(key));
        if self.tx.try_send(keys.clone()).is_ok() {
            self.requested = keys.into_iter().collect();
            self.last = c;
        }
    }
    pub fn blocked(
        &self,
        cells: &HashMap<(usize, i32, i32), Vec<Building>>,
        p: DVec3,
        r: f64,
    ) -> bool {
        let c = cell(p.x, p.z, 512.);
        for city in 0..2 {
            for z in c.1 - 1..=c.1 + 1 {
                for x in c.0 - 1..=c.0 + 1 {
                    if let Some(rows) = cells.get(&(city, x, z))
                        && rows
                            .iter()
                            .any(|b| mesh::polygon_contains(&b.p, p.x, p.z, r))
                    {
                        return true;
                    }
                }
            }
        }
        false
    }
}
