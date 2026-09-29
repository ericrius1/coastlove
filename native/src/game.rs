use crate::{
    data::World,
    mesh::hash,
    render::{Pose, Renderer, View},
};
use glam::{DMat4, DQuat, DVec3};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Mode {
    Walk,
    Boat,
    Plane,
    Car,
}
impl Mode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Walk => "On foot",
            Self::Boat => "Lobster boat",
            Self::Plane => "Marigold",
            Self::Car => "Seafoam",
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Quality {
    Quiet,
    #[default]
    Air,
    Full,
}
impl Quality {
    pub fn label(self) -> &'static str {
        match self {
            Self::Quiet => "Quiet · 30 fps",
            Self::Air => "Air · 60 fps",
            Self::Full => "Full · 60 fps",
        }
    }
    pub fn max_width(self) -> f32 {
        match self {
            Self::Quiet => 1280.,
            Self::Air => 1600.,
            Self::Full => 2560.,
        }
    }
    pub fn distance(self) -> f32 {
        match self {
            Self::Quiet => 24000.,
            Self::Air => 48000.,
            Self::Full => 72000.,
        }
    }
    pub fn levels(self) -> usize {
        match self {
            Self::Quiet => 9,
            Self::Air => 10,
            Self::Full => 11,
        }
    }
    pub fn fps(self) -> f64 {
        if self == Self::Quiet { 30. } else { 60. }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(default)]
pub struct Save {
    pub version: u32,
    pub position: [f64; 3],
    pub heading: f64,
    pub hour: f32,
    pub mode: Mode,
    pub quality: Quality,
    pub volume: f32,
    pub visited: BTreeSet<String>,
    pub wildlife: BTreeSet<String>,
    pub conversations: BTreeSet<String>,
    pub letters: Vec<String>,
    pub fish: Vec<String>,
}
impl Default for Save {
    fn default() -> Self {
        Self {
            version: 1,
            position: [30., 0., 40.],
            heading: std::f64::consts::PI,
            hour: 16.2,
            mode: Mode::Boat,
            quality: Quality::Air,
            volume: 0.45,
            visited: BTreeSet::new(),
            wildlife: BTreeSet::new(),
            conversations: BTreeSet::new(),
            letters: Vec::new(),
            fish: Vec::new(),
        }
    }
}
impl Save {
    pub fn path() -> PathBuf {
        if cfg!(target_os = "macos") {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
                .join("Library/Application Support/Coastlove/native-save.json")
        } else if cfg!(target_os = "windows") {
            PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default())
                .join("Coastlove/native-save.json")
        } else {
            PathBuf::from(std::env::var_os("XDG_DATA_HOME").unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
                    .join(".local/share")
                    .into()
            }))
            .join("coastlove/native-save.json")
        }
    }
    pub fn load() -> Self {
        std::fs::read(Self::path())
            .ok()
            .and_then(|b| serde_json::from_slice::<Self>(&b).ok())
            .filter(|s| {
                s.version == 1
                    && s.position
                        .iter()
                        .all(|v| v.is_finite() && v.abs() < 2_000_000.)
                    && s.heading.is_finite()
                    && s.hour.is_finite()
                    && s.volume.is_finite()
            })
            .map(|mut s| {
                s.hour = s.hour.rem_euclid(24.);
                s.volume = s.volume.clamp(0., 1.);
                s
            })
            .unwrap_or_default()
    }
    pub fn write(&self) -> anyhow::Result<()> {
        let path = Self::path();
        std::fs::create_dir_all(path.parent().unwrap())?;
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        if cfg!(target_os = "windows") && path.exists() {
            let backup = path.with_extension("previous.json");
            std::fs::copy(&path, &backup)?;
            std::fs::remove_file(&path)?;
        }
        std::fs::rename(tmp, path)?;
        Ok(())
    }
}
#[derive(Default)]
pub struct Controls {
    pub forward: f64,
    pub side: f64,
    pub turn: f64,
    pub climb: f64,
    pub boost: bool,
    pub brake: bool,
    pub look: [f64; 2],
    pub interact: bool,
}
struct Animal {
    position: DVec3,
    home: DVec3,
    heading: f64,
    timer: f64,
    phase: f64,
    moving: bool,
    accum: f64,
}
pub struct Game {
    pub world: Arc<World>,
    pub save: Save,
    pub position: DVec3,
    pub heading: f64,
    pub pitch: f64,
    pub speed: f64,
    pub time: f64,
    pub poses: Vec<Pose>,
    animals: Vec<Animal>,
    pub toast: String,
    pub toast_until: f64,
    pub dialogue: Option<(usize, usize)>,
    pub letter_progress: f64,
    pub letter_reveal: Option<usize>,
    pub fishing: Option<f64>,
    pub bite: bool,
    pub discovery_sound: bool,
    pub bell_sound: bool,
    pub step_sound: bool,
    step_timer: f64,
    vehicle_positions: [DVec3; 3],
}
pub fn hour_ready(window: &str, h: f32) -> bool {
    let h = h.rem_euclid(24.);
    match window {
        "any" => true,
        "night" => h >= 20. || h < 5.,
        "dusk" => (18.0..20.5).contains(&h),
        "dawn" => (5.0..8.0).contains(&h),
        _ => false,
    }
}
impl Game {
    pub fn new(world: Arc<World>, mut save: Save) -> Self {
        let mut contiguous = Vec::new();
        for l in &world.meta.letters {
            if save.letters.contains(&l.id) {
                contiguous.push(l.id.clone())
            } else {
                break;
            }
        }
        save.letters = contiguous;
        let mut position = DVec3::from(save.position);
        if save.mode == Mode::Boat {
            position.y = 0.35;
        }
        if save.mode == Mode::Walk || save.mode == Mode::Car {
            position.y = world
                .ground(position.x, position.z, f64::INFINITY)
                .max(-0.2);
        }
        if save.mode == Mode::Plane {
            position.y = position.y.max(world.height(position.x, position.z) + 30.);
        }
        let heading = save.heading;
        let animals = world
            .meta
            .entities
            .iter()
            .enumerate()
            .map(|(i, e)| Animal {
                position: e.position.into(),
                home: e.position.into(),
                heading: e.heading,
                timer: hash(i as i32, 0, 18) * 4.,
                phase: hash(i as i32, 0, 121) * std::f64::consts::TAU,
                moving: false,
                accum: 0.,
            })
            .collect();
        let poses = world
            .meta
            .entities
            .iter()
            .map(|e| Pose {
                matrix: DMat4::from_rotation_translation(
                    DQuat::from_rotation_y(e.heading),
                    e.position.into(),
                ),
                visible: true,
            })
            .collect();
        Self {
            world,
            save,
            position,
            heading,
            pitch: -0.05,
            speed: 0.,
            time: 0.,
            poses,
            animals,
            toast: "Take a little time. The coast is yours.".into(),
            toast_until: 8.,
            dialogue: None,
            letter_progress: 0.,
            letter_reveal: None,
            fishing: None,
            bite: false,
            discovery_sound: false,
            bell_sound: false,
            step_sound: false,
            step_timer: 0.,
            vehicle_positions: [
                DVec3::new(30., 0., 10.),
                DVec3::new(5., 90., -110.),
                DVec3::new(35., 8., -130.),
            ],
        }
    }
    pub fn notify(&mut self, text: impl Into<String>) {
        self.toast = text.into();
        self.toast_until = self.time + 7.;
    }
    pub fn snapshot(&mut self) {
        self.save.position = self.position.to_array();
        self.save.heading = self.heading;
    }
    pub fn persist(&mut self) {
        self.snapshot();
        if let Err(e) = self.save.write() {
            self.notify(format!("Could not save your journey: {e}"));
        }
    }
    pub fn switch_mode(&mut self, mode: Mode) {
        if self.save.mode == mode {
            return;
        }
        self.store_vehicle();
        match mode {
            Mode::Plane => {
                self.position.y = self
                    .position
                    .y
                    .max(self.world.height(self.position.x, self.position.z) + 55.)
                    .max(65.);
                self.speed = 52.;
                self.pitch = 0.05;
            }
            Mode::Boat => {
                let mut found = None;
                for i in 0..4000 {
                    let a = i as f64 * 2.39996;
                    let r = (i as f64).sqrt() * 8.;
                    let x = self.position.x + a.sin() * r;
                    let z = self.position.z + a.cos() * r;
                    if self.world.height(x, z) < -1.5 {
                        found = Some(DVec3::new(x, 0.35, z));
                        break;
                    }
                }
                if let Some(p) = found {
                    self.position = p;
                    self.speed = 0.;
                    self.pitch = -0.07;
                } else {
                    self.notify("The boat needs open water. Fly to the coast, or choose a harbor on the atlas.");
                    return;
                }
            }
            Mode::Walk => {
                self.position = self.world.safe_land(self.position.x, self.position.z);
                self.speed = 0.;
                self.pitch = -0.05;
            }
            Mode::Car => {
                self.position = self.world.safe_land(self.position.x, self.position.z);
                self.speed = 0.;
                self.pitch = -0.10;
            }
        }
        self.save.mode = mode;
        self.fishing = None;
        self.letter_progress = 0.;
        self.dialogue = None;
        self.notify(format!(
            "{} · {}",
            mode.label(),
            match mode {
                Mode::Plane => "W/S speed · A/D turn · Space/C climb · Shift to soar",
                Mode::Boat => "W/S throttle · A/D steer · R to fish",
                Mode::Car => "W/S pedals · A/D steer · Space to brake",
                Mode::Walk => "WASD wander · drag to look · E listen",
            }
        ));
    }
    fn store_vehicle(&mut self) {
        match self.save.mode {
            Mode::Boat => self.vehicle_positions[0] = self.position,
            Mode::Plane => self.vehicle_positions[1] = self.position,
            Mode::Car => self.vehicle_positions[2] = self.position,
            Mode::Walk => {}
        }
    }
    pub fn travel(&mut self, index: usize) {
        let p = &self.world.meta.places[index];
        let (x, z, water, title) = (p.x, p.z, p.water, p.title().to_owned());
        self.store_vehicle();
        self.dialogue = None;
        self.letter_reveal = None;
        self.letter_progress = 0.;
        self.speed = 0.;
        self.heading = 0.;
        self.pitch = -0.08;
        if self.save.mode == Mode::Plane {
            self.position = DVec3::new(x, self.world.height(x, z).max(0.) + 120., z - 110.);
            self.speed = 52.;
        } else if water {
            self.position = DVec3::new(x, 0., z);
            self.save.mode = Mode::Boat;
        } else {
            self.position = self.world.safe_land(x, z);
            self.save.mode = Mode::Walk;
        }
        self.notify(format!("{title} · a new little departure"));
        self.fishing = None;
    }
    pub fn fish(&mut self) {
        if let Some(cast) = self.fishing {
            if self.bite {
                let names = [
                    "Pacific mackerel",
                    "California halibut",
                    "Kelp bass",
                    "Rockfish",
                    "Sardine",
                    "A very determined boot",
                ];
                let index = (hash((self.time * 100.) as i32, self.save.fish.len() as i32, 919)
                    * names.len() as f64) as usize;
                let name = names[index.min(names.len() - 1)];
                self.save.fish.push(name.to_owned());
                self.notify(format!("{name}. A small story for the field journal."));
                self.discovery_sound = true;
                self.fishing = None;
                self.bite = false;
            } else if self.time - cast > 1. {
                self.fishing = None;
                self.notify("You reel in quietly. The water keeps its secrets.");
            }
        } else if self.save.mode == Mode::Boat
            || self.world.height(self.position.x, self.position.z) < 2.
        {
            self.speed = 0.;
            self.fishing = Some(self.time);
            self.bite = false;
            self.notify("The line settles. Wait for the bite, then press R.");
        } else {
            self.notify("Find the water’s edge, or cast from the boat.");
        }
    }
    pub fn update(&mut self, dt: f64, input: &Controls, renderer: Option<&Renderer>, paused: bool) {
        let dt = dt.clamp(0., 0.05);
        self.time += dt;
        self.step_sound = false;
        if !paused {
            if self.save.mode == Mode::Walk
                && renderer.is_some_and(|r| r.blocked(self.position, 0.35))
            {
                let p = self.world.safe_land(self.position.x, self.position.z);
                if !renderer.is_some_and(|r| r.blocked(p, 0.35)) {
                    self.position = p;
                }
            }
            self.heading -= input.look[0] * 0.003;
            self.pitch = (self.pitch - input.look[1] * 0.003).clamp(-1.15, 1.15);
            let steps = (dt / (1. / 120.)).ceil().max(1.) as usize;
            for _ in 0..steps {
                self.move_step(dt / steps as f64, input, renderer);
            }
        }
        if input.interact && (!paused || self.dialogue.is_some()) {
            self.interact();
        }
        self.store_vehicle();
        self.update_entities(dt);
        if !paused {
            self.discover(dt, input);
        }
        if let Some(cast) = self.fishing {
            let age = self.time - cast;
            let wait = 4. + hash(cast as i32, 0, 82) * 5.;
            if !self.bite && age > wait {
                self.bite = true;
                self.notify("A silver tug! Press R to reel in.");
                self.bell_sound = true;
            }
            if age > wait + 3.5 {
                self.fishing = None;
                self.bite = false;
                self.notify(
                    "A flash beneath the surface, and it is gone. Cast again whenever you like.",
                );
            }
        }
    }
    fn move_step(&mut self, dt: f64, input: &Controls, renderer: Option<&Renderer>) {
        let old = self.position;
        let mode = self.save.mode;
        match mode {
            Mode::Walk => {
                self.heading -= input.turn * dt * 1.5;
                let f = DVec3::new(self.heading.sin(), 0., self.heading.cos());
                let right = DVec3::new(-f.z, 0., f.x);
                let dir = (f * input.forward + right * input.side).normalize_or_zero();
                let speed = if input.boost { 8. } else { 3.8 };
                let candidate = self.position + dir * speed * dt;
                let ground = self
                    .world
                    .ground(candidate.x, candidate.z, self.position.y + 0.7)
                    .max(-0.2);
                let next = DVec3::new(candidate.x, ground, candidate.z);
                if ground - self.position.y < 0.65
                    && !self.world.blocked(next, 0.35)
                    && !renderer.is_some_and(|r| r.blocked(next, 0.35))
                {
                    self.position = next;
                } else {
                    for axis in [0, 2] {
                        let mut slide = self.position;
                        slide[axis] = candidate[axis];
                        slide.y = self
                            .world
                            .ground(slide.x, slide.z, self.position.y + 0.65)
                            .max(-0.2);
                        if slide.y - self.position.y < 0.65
                            && !self.world.blocked(slide, 0.35)
                            && !renderer.is_some_and(|r| r.blocked(slide, 0.35))
                        {
                            self.position = slide;
                        }
                    }
                }
                self.speed = (self.position - old).length() / dt.max(0.00001);
                if self.speed > 0.2 {
                    self.step_timer += dt;
                    if self.step_timer > if input.boost { 0.32 } else { 0.53 } {
                        self.step_timer = 0.;
                        self.step_sound = true;
                    }
                }
            }
            Mode::Plane => {
                let goal = if input.boost {
                    if input.forward > 0. { 360. } else { 124. }
                } else if input.forward > 0. {
                    84.
                } else if input.forward < 0. {
                    28.
                } else {
                    52.
                };
                self.speed += (goal - self.speed) * (1. - (-dt * 1.8).exp());
                self.heading -= (input.side + input.turn) * dt * 0.9;
                let f = DVec3::new(self.heading.sin(), 0., self.heading.cos());
                self.position += f * self.speed * dt;
                self.position.y += (self.pitch.sin() * self.speed * 0.7 + input.climb * 32.) * dt;
                let ahead = self.position + f * self.speed * 0.5;
                self.position.y = self.position.y.max(
                    self.world
                        .obstacle_top(ahead.x, ahead.z)
                        .max(renderer.map_or(0., |r| r.city_roof(ahead)))
                        + 12.,
                );
            }
            Mode::Boat => {
                let throttle = if self.fishing.is_some() {
                    0.
                } else {
                    input.forward
                };
                self.speed += (throttle * if input.boost { 15. } else { 9. } - self.speed)
                    * (1. - (-dt * 0.65).exp());
                self.heading -=
                    (input.side + input.turn) * dt * 0.5 * (self.speed / 4.).clamp(-1., 1.);
                let p = self.position
                    + DVec3::new(self.heading.sin(), 0., self.heading.cos()) * self.speed * dt;
                if self.world.height(p.x, p.z) < -0.8 {
                    self.position = p
                } else {
                    self.speed *= (-dt * 8.).exp();
                }
                self.position.y = 0.35 + (self.time * 1.2).sin() * 0.12;
            }
            Mode::Car => {
                let accel = if input.forward > 0. {
                    12.
                } else if input.forward < 0. {
                    -18.
                } else {
                    -self.speed * 0.8
                };
                self.speed =
                    (self.speed + accel * dt).clamp(-8., if input.boost { 44. } else { 28. });
                if input.brake {
                    self.speed *= (-dt * 5.).exp();
                }
                self.heading -=
                    (input.side + input.turn) * dt * 1.25 * (self.speed / 7.).clamp(-1., 1.)
                        / (1. + self.speed.abs() * 0.02);
                let mut p = self.position
                    + DVec3::new(self.heading.sin(), 0., self.heading.cos()) * self.speed * dt;
                p.y = self.world.ground(p.x, p.z, f64::INFINITY);
                if p.y > 0.3
                    && !self.world.blocked(p, 1.)
                    && !renderer.is_some_and(|r| r.blocked(p, 1.))
                {
                    self.position = p;
                } else {
                    self.speed *= (-dt * 12.).exp();
                }
            }
        }
    }
    fn update_entities(&mut self, dt: f64) {
        for (i, e) in self.world.meta.entities.iter().enumerate() {
            let a = &mut self.animals[i];
            let mut position = a.position;
            let mut heading = a.heading;
            let mut pitch = 0.;
            let mut bank = 0.;
            let mut visible = true;
            match e.kind.as_str() {
                "letterLight" => {
                    visible = self.save.letters.contains(&e.id)
                        || self
                            .world
                            .meta
                            .letters
                            .get(self.save.letters.len())
                            .is_some_and(|l| l.id == e.id && self.letter_progress > 0.5);
                    visible &= (position - self.position).length() < 250.;
                    position.y += (self.time * 0.5 + a.phase).sin() * 0.09;
                }
                "boat" => {
                    position = self.vehicle_positions[0];
                    heading = if self.save.mode == Mode::Boat {
                        self.heading
                    } else {
                        0.
                    };
                    pitch = (self.time * 1.1).sin() * 0.015;
                    bank = (self.time * 0.8).cos() * 0.022;
                }
                "plane" => {
                    position = self.vehicle_positions[1];
                    heading = if self.save.mode == Mode::Plane {
                        self.heading
                    } else {
                        0.
                    };
                    pitch = if self.save.mode == Mode::Plane {
                        -self.pitch * 0.2
                    } else {
                        0.
                    };
                    visible = self.save.mode == Mode::Plane;
                }
                "car" => {
                    position = self.vehicle_positions[2];
                    heading = if self.save.mode == Mode::Car {
                        self.heading
                    } else {
                        0.
                    };
                }
                "resident" => {
                    visible = (position - self.position).length() < 400.;
                    if (position - self.position).length() < 10. {
                        heading =
                            (self.position.x - position.x).atan2(self.position.z - position.z);
                    }
                }
                _ => {
                    let distance = (position - self.position).length();
                    visible = distance < if e.kind == "butterfly" { 100. } else { 500. };
                    if visible {
                        a.accum += dt;
                        if a.accum > if distance < 60. { 0.02 } else { 0.12 } {
                            let step = a.accum;
                            a.accum = 0.;
                            a.timer -= step;
                            let shy =
                                matches!(e.kind.as_str(), "deer" | "rabbit" | "quail" | "fox");
                            let flee = shy && distance < if e.kind == "deer" { 10. } else { 5. };
                            if a.timer <= 0. {
                                a.timer = 2. + hash((self.time * 10.) as i32, i as i32, 61) * 5.;
                                a.moving = !a.moving;
                                a.heading = (a.home.x - a.position.x)
                                    .atan2(a.home.z - a.position.z)
                                    + (hash(i as i32, self.time as i32, 83) - 0.5) * 2.5;
                            }
                            if flee {
                                a.heading = (a.position.x - self.position.x)
                                    .atan2(a.position.z - self.position.z);
                                a.moving = true;
                            }
                            if a.moving && e.kind != "seaLion" {
                                let speed = if flee {
                                    3.5
                                } else {
                                    match e.kind.as_str() {
                                        "butterfly" => 1.3,
                                        "deer" => 0.7,
                                        "rabbit" => 0.5,
                                        _ => 0.3,
                                    }
                                };
                                let mut next = a.position
                                    + DVec3::new(a.heading.sin(), 0., a.heading.cos())
                                        * speed
                                        * step;
                                let h = self.world.height(next.x, next.z);
                                if h > 0.4
                                    && !self.world.blocked(DVec3::new(next.x, h, next.z), 0.7)
                                    && (next - a.home).length() < 65.
                                {
                                    next.y = h;
                                    a.position = next
                                } else {
                                    a.heading += 2.;
                                }
                            }
                        }
                        position = a.position;
                        heading = a.heading;
                        if e.kind == "butterfly" {
                            position.y += 1. + (self.time * 2. + a.phase).sin() * 0.35;
                        }
                        if e.kind == "rabbit" && a.moving {
                            position.y += (self.time * 8. + a.phase).sin().max(0.) * 0.2;
                        }
                        if distance < if e.kind == "butterfly" { 10. } else { 35. } {
                            self.save.wildlife.insert(e.kind.clone());
                        }
                    }
                }
            }
            self.poses[i] = Pose {
                matrix: DMat4::from_rotation_translation(
                    DQuat::from_euler(glam::EulerRot::YXZ, heading, pitch, bank),
                    position,
                ),
                visible,
            };
        }
    }
    pub fn nearest_story(&self) -> Option<usize> {
        self.world
            .meta
            .stories
            .iter()
            .enumerate()
            .filter_map(|(i, s)| {
                let d = (DVec3::from(s.position) - self.position).length();
                (d < 8.).then_some((i, d))
            })
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|v| v.0)
    }
    fn interact(&mut self) {
        if let Some((id, page)) = self.dialogue {
            if page + 1 < self.world.meta.stories[id].pages.len() {
                self.dialogue = Some((id, page + 1));
            } else {
                self.dialogue = None;
            }
            return;
        }
        let chapter = self.save.letters.len();
        if let Some(l) = self.world.meta.letters.get(chapter)
            && l.id == "bell"
            && (DVec3::from(l.position) - self.position).length() < l.radius
        {
            self.complete_letter(chapter);
            self.bell_sound = true;
            return;
        }
        if let Some(id) = self.nearest_story() {
            self.dialogue = Some((id, 0));
            self.save
                .conversations
                .insert(self.world.meta.stories[id].id.clone());
        } else if self.save.mode != Mode::Walk {
            self.switch_mode(Mode::Walk);
        }
    }
    fn discover(&mut self, dt: f64, input: &Controls) {
        let mut message = None;
        for p in &self.world.meta.places {
            if (p.x - self.position.x).hypot(p.z - self.position.z) < 90.
                && self.position.y - self.world.height(p.x, p.z).max(0.) < 160.
                && self.save.visited.insert(p.id.clone())
            {
                message = Some(format!("{} · a page for your journal", p.title()));
                self.discovery_sound = true;
            }
        }
        if let Some(m) = message {
            self.notify(m)
        }
        let chapter = self.save.letters.len();
        if let Some(l) = self.world.meta.letters.get(chapter) {
            let ground = self.world.height(self.position.x, self.position.z).max(0.);
            let near = (self.position.x - l.position[0]).hypot(self.position.z - l.position[2])
                < l.radius
                && self.position.y - ground < 4.;
            if l.duration > 0.
                && near
                && hour_ready(&l.window, self.save.hour)
                && self.speed.abs() < 0.6
                && self.save.mode != Mode::Plane
                && self.save.mode != Mode::Car
                && input.forward.abs() < 0.1
            {
                self.letter_progress += dt;
                if self.letter_progress >= l.duration {
                    self.complete_letter(chapter);
                }
            } else {
                self.letter_progress = 0.;
            }
        }
    }
    fn complete_letter(&mut self, id: usize) {
        self.save
            .letters
            .push(self.world.meta.letters[id].id.clone());
        self.letter_reveal = Some(id);
        self.letter_progress = 0.;
        self.discovery_sound = true;
        self.persist();
    }
    pub fn view(&self) -> View {
        let forward = DVec3::new(self.heading.sin(), 0., self.heading.cos());
        let (eye, target) = match self.save.mode {
            Mode::Walk => {
                let eye = self.position
                    + DVec3::Y
                        * (1.68
                            + if self.speed > 1. {
                                (self.time * 8.).sin() * 0.025
                            } else {
                                0.
                            });
                (
                    eye,
                    eye + DVec3::new(
                        forward.x * self.pitch.cos(),
                        self.pitch.sin(),
                        forward.z * self.pitch.cos(),
                    ) * 20.,
                )
            }
            Mode::Plane => (
                self.position - forward * 18. + DVec3::Y * 5.,
                self.position + forward * 22. + DVec3::Y * (self.pitch.sin() * 16.),
            ),
            Mode::Boat => (
                self.position - forward * 14. + DVec3::Y * 6.,
                self.position + forward * 6. + DVec3::Y * 1.5,
            ),
            Mode::Car => (
                self.position - forward * 8. + DVec3::Y * 3.8,
                self.position + forward * 8. + DVec3::Y * 1.2,
            ),
        };
        let ground = self.world.height(eye.x, eye.z).max(0.) + 1.;
        let eye = DVec3::new(eye.x, eye.y.max(ground), eye.z);
        View {
            eye,
            target,
            time: self.time as f32,
            hour: self.save.hour,
            far: self.save.quality.distance(),
            levels: self.save.quality.levels(),
            shadows: self.save.quality != Quality::Quiet,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn letter_windows_are_half_open() {
        assert!(hour_ready("night", 20.));
        assert!(!hour_ready("night", 5.));
        assert!(hour_ready("dusk", 18.));
        assert!(!hour_ready("dusk", 20.5));
        assert!(hour_ready("dawn", 5.));
        assert!(!hour_ready("dawn", 8.));
    }
    #[test]
    fn save_roundtrip_keeps_progress() {
        let mut s = Save {
            letters: vec!["seed".into(), "bell".into()],
            ..Default::default()
        };
        s.visited.insert("redwoods".into());
        let d: Save = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(d.letters, s.letters);
        assert_eq!(d.visited, s.visited);
    }
}
