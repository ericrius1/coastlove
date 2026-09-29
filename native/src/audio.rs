use crate::game::{Game, Mode};
use rodio::{OutputStream, OutputStreamHandle, Sink, Source, buffer::SamplesBuffer};
use serde::Deserialize;
use std::{collections::HashMap, path::Path, sync::Arc};

#[derive(Deserialize)]
struct AudioMeta {
    channels: u16,
    rate: u32,
    slices: Vec<[f64; 2]>,
}

struct Clip {
    channels: u16,
    rate: u32,
    samples: Arc<[f32]>,
    slices: Vec<[f64; 2]>,
}
struct Layer {
    sink: Sink,
    volume: f32,
}
pub struct Soundscape {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    layers: HashMap<&'static str, Layer>,
    clips: HashMap<&'static str, Clip>,
    effects: Vec<Sink>,
    last_bird: f64,
    sequence: usize,
    pub enabled: bool,
}
impl Soundscape {
    pub fn new(root: &Path) -> anyhow::Result<Self> {
        let (stream, handle) = OutputStream::try_default()?;
        let mut s = Self {
            _stream: stream,
            handle,
            layers: HashMap::new(),
            clips: HashMap::new(),
            effects: Vec::new(),
            last_bird: 0.,
            sequence: 0,
            enabled: true,
        };
        let bank: HashMap<String, AudioMeta> =
            serde_json::from_slice(&std::fs::read(root.join("native/assets/audio.json"))?)?;
        for name in [
            "wind",
            "palms",
            "crickets",
            "surf_far",
            "boat_lap",
            "boat_engine",
            "bird_forest",
            "birds_dawn",
            "bird_dove",
            "gull",
            "step_grass",
            "step_sand",
            "step_wood",
            "step_water",
        ] {
            let meta = bank
                .get(name)
                .ok_or_else(|| anyhow::anyhow!("Missing audio metadata: {name}"))?;
            let bytes = std::fs::read(root.join(format!("native/assets/audio/{name}.pcm")))?;
            anyhow::ensure!(
                bytes.len() % 4 == 0 && !bytes.is_empty(),
                "Invalid PCM recording: {name}"
            );
            let samples = bytes
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| i16::from_le_bytes(*b) as f32 / 32768.)
                .collect::<Vec<_>>();
            s.clips.insert(
                name,
                Clip {
                    channels: meta.channels,
                    rate: meta.rate,
                    samples: samples.into(),
                    slices: meta.slices.clone(),
                },
            );
        }
        for name in [
            "wind",
            "palms",
            "crickets",
            "surf_far",
            "boat_lap",
            "boat_engine",
        ] {
            let sink = Sink::try_new(&s.handle)?;
            let clip = &s.clips[name];
            sink.append(
                SamplesBuffer::new(clip.channels, clip.rate, clip.samples.to_vec())
                    .repeat_infinite(),
            );
            sink.set_volume(0.);
            s.layers.insert(name, Layer { sink, volume: 0. });
        }
        Ok(s)
    }
    pub fn active(&self, active: bool) {
        for l in self.layers.values() {
            if active {
                l.sink.play()
            } else {
                l.sink.pause()
            }
        }
        for e in &self.effects {
            if active { e.play() } else { e.pause() }
        }
    }
    fn effect(&mut self, name: &str, volume: f32) {
        if self.effects.len() >= 8 {
            return;
        }
        if let Some(c) = self.clips.get(name)
            && let Ok(sink) = Sink::try_new(&self.handle)
        {
            sink.set_volume(volume);
            let (start, end) = if c.slices.is_empty() {
                (0, c.samples.len())
            } else {
                let [start, duration] = c.slices[self.sequence % c.slices.len()];
                let frame = c.rate as f64 * c.channels as f64;
                (
                    ((start * frame) as usize).min(c.samples.len()),
                    (((start + duration) * frame) as usize).min(c.samples.len()),
                )
            };
            self.sequence = self.sequence.wrapping_add(1);
            sink.append(SamplesBuffer::new(
                c.channels,
                c.rate,
                c.samples[start..end].to_vec(),
            ));
            self.effects.push(sink);
        }
    }
    pub fn bell(&mut self, volume: f32, discovery: bool) {
        if self.effects.len() >= 8 {
            return;
        }
        let rate = 24000;
        let duration = if discovery { 2.5 } else { 4. };
        let samples = (0..(duration * rate as f64) as usize)
            .map(|i| {
                let t = i as f64 / rate as f64;
                let mut v = 0.;
                for (f, a) in if discovery {
                    [
                        (523.25, 0.3),
                        (659.25, 0.20),
                        (783.99, 0.16),
                        (1046.5, 0.08),
                    ]
                } else {
                    [(220., 0.3), (448.8, 0.18), (594., 0.13), (880., 0.07)]
                } {
                    v += (t * f * std::f64::consts::TAU).sin() * a * (-t * (1. + f / 900.)).exp();
                }
                (v * (t * 80.).min(1.)) as f32
            })
            .collect::<Vec<_>>();
        if let Ok(sink) = Sink::try_new(&self.handle) {
            sink.set_volume(volume);
            sink.append(SamplesBuffer::new(1, rate, samples));
            self.effects.push(sink);
        }
    }
    pub fn update(&mut self, game: &mut Game, dt: f64) {
        self.effects.retain(|s| !s.empty());
        let master = if self.enabled { game.save.volume } else { 0. };
        let p = game.position;
        let ground = game.world.height(p.x, p.z);
        let altitude = (p.y - ground.max(0.)).max(0.);
        let near_ground = (-altitude / 90.).exp() as f32;
        let night = if game.save.hour >= 20. || game.save.hour < 5.5 {
            1.
        } else {
            0.
        };
        let shore = if ground < 3. {
            1.
        } else {
            (-ground / 35.).exp() as f32
        };
        let forest = crate::data::smooth(-260000., -620000., p.z) as f32 * (1. - shore * 0.5);
        for (name, l) in &mut self.layers {
            let volume = match *name {
                "wind" => {
                    0.11 + if game.save.mode == Mode::Plane {
                        0.08
                    } else {
                        0.
                    }
                }
                "palms" => 0.13 * near_ground * (0.4 + forest),
                "crickets" => 0.30 * night * near_ground * (1. - shore * 0.65),
                "surf_far" => 0.34 * shore * near_ground,
                "boat_lap" => {
                    if game.save.mode == Mode::Boat {
                        0.20
                    } else {
                        0.
                    }
                }
                "boat_engine" if game.save.mode == Mode::Boat => {
                    (game.speed.abs() / 9.) as f32 * 0.10
                }
                _ => 0.,
            } * master;
            l.volume += (volume - l.volume) * (1. - (-dt * 2.5).exp()) as f32;
            l.sink.set_volume(l.volume);
        }
        if game.time - self.last_bird > if forest > 0.5 { 11. } else { 19. } {
            self.last_bird = game.time;
            if night < 0.5 && near_ground > 0.5 {
                self.effect(
                    if forest > 0.4 {
                        "bird_forest"
                    } else if shore > 0.7 {
                        "gull"
                    } else if game.save.hour < 9. {
                        "birds_dawn"
                    } else {
                        "bird_dove"
                    },
                    master * 0.18 * near_ground,
                );
            }
        }
        if game.discovery_sound {
            game.discovery_sound = false;
            self.bell(master * 0.35, true);
        }
        if game.bell_sound {
            game.bell_sound = false;
            self.bell(master * 0.50, false);
        }
        if game.step_sound {
            let name = if ground < 0. {
                "step_water"
            } else if ground < 3. {
                "step_sand"
            } else {
                "step_grass"
            };
            self.effect(name, master * 0.15);
        }
    }
}
