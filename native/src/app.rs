use crate::{
    audio::Soundscape,
    data::World,
    game::{Controls, Game, Mode, Quality, Save},
    render::Renderer,
};
use eframe::{
    egui::{self, Color32, Key, RichText},
    egui_wgpu,
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

const CREAM: Color32 = Color32::from_rgb(233, 226, 204);
const GOLD: Color32 = Color32::from_rgb(221, 177, 101);
pub struct CoastApp {
    game: Game,
    renderer: Renderer,
    render_state: egui_wgpu::RenderState,
    texture: egui::TextureId,
    audio: Option<Soundscape>,
    last: Instant,
    last_save: Instant,
    atlas: bool,
    journal: bool,
    settings: bool,
    help: bool,
    debug: bool,
    journal_tab: usize,
    search: String,
    frame_ms: f64,
    render_ms: f64,
    adapter: String,
}
impl CoastApp {
    pub fn new(cc: &eframe::CreationContext<'_>, world: Arc<World>) -> Self {
        let state = cc.wgpu_render_state.clone().expect("wgpu render state");
        let mut style = (*cc.egui_ctx.style()).clone();
        style.visuals = egui::Visuals::dark();
        style.visuals.panel_fill = Color32::from_rgba_unmultiplied(19, 32, 31, 244);
        style.visuals.window_fill = Color32::from_rgba_unmultiplied(19, 32, 31, 249);
        style.visuals.override_text_color = Some(CREAM);
        style.visuals.selection.bg_fill = Color32::from_rgb(62, 92, 76);
        style.visuals.widgets.active.bg_fill = Color32::from_rgb(82, 113, 89);
        style.visuals.widgets.hovered.bg_fill = Color32::from_rgb(52, 75, 63);
        style.spacing.item_spacing = egui::vec2(10., 9.);
        style.spacing.button_padding = egui::vec2(12., 7.);
        cc.egui_ctx.set_style(style);
        let game = Game::new(world.clone(), Save::load());
        let renderer = Renderer::new(
            state.device.clone(),
            state.queue.clone(),
            world.clone(),
            [1280, 800],
        );
        let texture = state.renderer.write().register_native_texture(
            &state.device,
            renderer.color_view(),
            eframe::wgpu::FilterMode::Linear,
        );
        let audio = match Soundscape::new(&world.root) {
            Ok(a) => Some(a),
            Err(e) => {
                eprintln!("Audio unavailable: {e}");
                None
            }
        };
        let adapter = state.adapter.get_info().name;
        Self {
            game,
            renderer,
            render_state: state,
            texture,
            audio,
            last: Instant::now(),
            last_save: Instant::now(),
            atlas: false,
            journal: false,
            settings: false,
            help: true,
            debug: false,
            journal_tab: 0,
            search: String::new(),
            frame_ms: 16.7,
            render_ms: 0.,
            adapter,
        }
    }
    fn windows(&mut self, ctx: &egui::Context) {
        let mut travel = None;
        if self.atlas {
            egui::Window::new("The coastal atlas")
                .open(&mut self.atlas)
                .default_size([820., 590.])
                .show(ctx, |ui| {
                    ui.label(
                        RichText::new("A whole coast. No deadline.")
                            .color(GOLD)
                            .size(22.),
                    );
                    ui.label("Choose a place to visit. In Marigold, you arrive above it.");
                    ui.add_space(6.);
                    ui.columns(2, |cols| {
                        let ui = &mut cols[0];
                        let (rect, _) = ui.allocate_exact_size(
                            egui::vec2(ui.available_width(), 450.),
                            egui::Sense::hover(),
                        );
                        let paint = ui.painter_at(rect);
                        paint.rect_filled(rect, 12., Color32::from_rgb(25, 54, 59));
                        let places = &self.game.world.meta.places;
                        let xmin = -460000.;
                        let xmax = 300000.;
                        let zmin = -900000.;
                        let zmax = 220000.;
                        let project = |x: f64, z: f64| {
                            egui::pos2(
                                rect.left() + ((x - xmin) / (xmax - xmin)) as f32 * rect.width(),
                                rect.top() + ((z - zmin) / (zmax - zmin)) as f32 * rect.height(),
                            )
                        };
                        let mut coastal = places
                            .iter()
                            .filter(|p| !p.water && p.x.abs() > 1000.)
                            .collect::<Vec<_>>();
                        coastal.sort_by(|a, b| a.z.total_cmp(&b.z));
                        for pair in coastal.windows(2) {
                            paint.line_segment(
                                [project(pair[0].x, pair[0].z), project(pair[1].x, pair[1].z)],
                                egui::Stroke::new(2_f32, Color32::from_rgb(96, 121, 99)),
                            );
                        }
                        for (i, p) in places.iter().enumerate() {
                            let pos = project(p.x, p.z);
                            let visited = self.game.save.visited.contains(&p.id);
                            paint.circle_filled(
                                pos,
                                if visited { 4. } else { 3. },
                                if visited {
                                    GOLD
                                } else {
                                    Color32::from_rgb(156, 174, 153)
                                },
                            );
                            let response = ui.interact(
                                egui::Rect::from_center_size(pos, egui::vec2(14., 14.)),
                                ui.id().with(i),
                                egui::Sense::click(),
                            );
                            if response.hovered() {
                                paint.text(
                                    pos + egui::vec2(8., -8.),
                                    egui::Align2::LEFT_BOTTOM,
                                    p.title(),
                                    egui::FontId::proportional(13.),
                                    CREAM,
                                );
                            }
                            if response.clicked() {
                                travel = Some(i);
                            }
                        }
                        let p = self.game.position;
                        paint.circle_stroke(
                            project(p.x, p.z),
                            8.,
                            egui::Stroke::new(2_f32, Color32::WHITE),
                        );
                        paint.text(
                            rect.left_bottom() + egui::vec2(14., -14.),
                            egui::Align2::LEFT_BOTTOM,
                            "PACIFIC OCEAN",
                            egui::FontId::proportional(13.),
                            Color32::from_rgb(122, 165, 164),
                        );
                        let ui = &mut cols[1];
                        ui.add(
                            egui::TextEdit::singleline(&mut self.search)
                                .hint_text("Find a town, island, or quiet place…"),
                        );
                        let query = self.search.to_lowercase();
                        egui::ScrollArea::vertical()
                            .max_height(450.)
                            .show(ui, |ui| {
                                for (i, p) in self.game.world.meta.places.iter().enumerate() {
                                    if !format!("{} {} {}", p.title(), p.name, p.hint)
                                        .to_lowercase()
                                        .contains(&query)
                                    {
                                        continue;
                                    }
                                    let mark = if self.game.save.visited.contains(&p.id) {
                                        "●"
                                    } else {
                                        "○"
                                    };
                                    if ui
                                        .add_sized(
                                            [ui.available_width(), 30.],
                                            egui::Button::new(format!("{mark}  {}", p.title())),
                                        )
                                        .clicked()
                                    {
                                        travel = Some(i);
                                    }
                                    if !p.hint.is_empty() {
                                        ui.label(RichText::new(&p.hint).small().weak());
                                    }
                                    ui.add_space(4.);
                                }
                            });
                    });
                });
        }
        if let Some(i) = travel {
            self.game.travel(i);
            self.atlas = false;
        }
        if self.journal {
            egui::Window::new("Field notes").open(&mut self.journal).default_size([620.,540.]).show(ctx,|ui|{
   ui.label(RichText::new("Things worth carrying home").size(23.).color(GOLD));ui.horizontal(|ui|{for(i,title)in ["Places","Wildlife","Voices","Letters","Catch"].iter().enumerate(){ui.selectable_value(&mut self.journal_tab,i,*title);}});ui.separator();
   egui::ScrollArea::vertical().max_height(440.).show(ui,|ui|{match self.journal_tab{
    0=>{ui.label(format!("{} of {} places remembered",self.game.save.visited.len(),self.game.world.meta.places.len()));for p in &self.game.world.meta.places{if self.game.save.visited.contains(&p.id){ui.add_space(10.);ui.label(RichText::new(p.title()).strong().color(GOLD));ui.label(&p.story);}}}
    1=>{ui.label("Give the little lives room. Watch quietly to add a field note.");for(kind,name,note)in [("fox","Island fox","Small feet, enormous curiosity. Give her room to choose the distance."),("seaLion","California sea lion","The rocks have become a noisy, sun-warmed living room."),("deer","Mule deer","Ears turn before hooves. A clearing can be full of listening."),("rabbit","Brush rabbit","A flicker at the edge of the path, then stillness."),("quail","California quail","A small procession through the understory."),("butterfly","Painted lady","A long journey folded into two small wings.")]{ui.add_space(10.);if self.game.save.wildlife.contains(kind){ui.label(RichText::new(name).strong().color(GOLD));ui.label(note);}else{ui.label(format!("○  {name} · still to be met"));}}}
    2=>{for s in &self.game.world.meta.stories{if self.game.save.conversations.contains(&s.id){ui.collapsing(format!("{} · {}",s.name,s.role),|ui|{for p in &s.pages{ui.label(p);ui.add_space(9.);}});}else{ui.label(format!("○  {} · {}",s.name,s.role));}}}
    3=>{ui.label(format!("{} of six letters",self.game.save.letters.len()));for(i,l)in self.game.world.meta.letters.iter().enumerate(){if i<self.game.save.letters.len(){ui.collapsing(&l.title,|ui|{ui.label(&l.text);ui.add_space(10.);ui.label(RichText::new(&l.reply).italics().color(GOLD));});}else if i==self.game.save.letters.len(){ui.add_space(16.);ui.label(RichText::new("The next small mystery").color(GOLD));ui.label(&l.clue);ui.label(RichText::new(&l.instruction).italics());}}}
    _=>{ui.label("A record of patient afternoons. R casts and reels in.");if self.game.save.fish.is_empty(){ui.label("Nothing caught yet. The ocean is in no hurry.");}for fish in &self.game.save.fish{ui.label(format!("• {fish}"));}}
   }});
  });
        }
        if self.settings {
            egui::Window::new("Make yourself comfortable").open(&mut self.settings).default_width(370.).show(ctx,|ui|{
   ui.label(RichText::new("Light, sound, and breathing room").color(GOLD));ui.add(egui::Slider::new(&mut self.game.save.hour,0.0..=23.99).text("Hour").fixed_decimals(1));ui.add(egui::Slider::new(&mut self.game.save.volume,0.0..=1.0).text("Sound"));ui.add_space(10.);for q in [Quality::Quiet,Quality::Air,Quality::Full]{ui.radio_value(&mut self.game.save.quality,q,q.label());}
   ui.label(RichText::new("Air renders up to 1600 pixels wide with a 48 km horizon. The interface stays sharp at your display’s resolution. Quiet lowers detail and caps at 30 fps.").small().weak());ui.label("Drag in the world to look around. Z + horizontal drag changes the hour.");if self.audio.is_none(){ui.colored_label(GOLD,"Audio device unavailable. Visual exploration still works.");}
if ui.button("Save this moment").clicked(){self.game.persist();self.game.notify("Your journey is saved.");}
  });
        }
        if self.help {
            egui::Window::new("Welcome to Coastlove").open(&mut self.help).anchor(egui::Align2::CENTER_CENTER,[0.,0.]).default_width(460.).show(ctx,|ui|{
   ui.label(RichText::new("A little further, a little slower.").size(24.).color(GOLD));ui.label("A native journey along California’s coast. Wander through the harbor, take Marigold over the islands, or follow the six salt-worn letters north.");ui.add_space(10.);
   egui::Grid::new("controls").spacing([25.,9.]).show(ui,|ui|{for(key,action)in [("W A S D","Move / steer"),("Drag / ← →","Look / turn"),("Shift","Run / faster travel"),("1 · 2 · 3 · 4","Boat · plane · walk · car"),("Space / C","Plane climb / descend"),("E","Listen, ring a bell, leave a vehicle"),("R","Cast / reel in"),("M · J","Atlas · field notes"),("Z + drag","Borrow a different hour"),("Esc · H · F3","Settings · help · performance")]{ui.label(RichText::new(key).color(GOLD));ui.label(action);ui.end_row();}});ui.add_space(12.);ui.label("Progress saves automatically. Close this card when you are ready.");
  });
        }
        if let Some((id, page)) = self.game.dialogue {
            let s = &self.game.world.meta.stories[id];
            let mut next = false;
            egui::Window::new(format!("{} · {}", s.name, s.role))
                .anchor(egui::Align2::CENTER_BOTTOM, [0., -95.])
                .default_width(540.)
                .collapsible(false)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.label(RichText::new(&s.pages[page]).size(17.));
                    ui.add_space(10.);
                    next = ui
                        .button(if page + 1 < s.pages.len() {
                            "Listen a little longer   [E]"
                        } else {
                            "Thank you   [E]"
                        })
                        .clicked();
                });
            if next {
                if page + 1 < self.game.world.meta.stories[id].pages.len() {
                    self.game.dialogue = Some((id, page + 1))
                } else {
                    self.game.dialogue = None
                }
            }
        }
        if let Some(id) = self.game.letter_reveal {
            let l = &self.game.world.meta.letters[id];
            let mut close = false;
            egui::Window::new(&l.title)
                .anchor(egui::Align2::CENTER_CENTER, [0., 0.])
                .default_width(560.)
                .collapsible(false)
                .show(ctx, |ui| {
                    ui.label(
                        RichText::new(format!("LETTER {} OF SIX", id + 1))
                            .small()
                            .color(GOLD),
                    );
                    ui.add_space(10.);
                    ui.label(RichText::new(&l.text).size(18.));
                    ui.add_space(16.);
                    ui.label(RichText::new(&l.reply).italics().color(GOLD));
                    ui.add_space(10.);
                    close = ui.button("Carry it with you").clicked();
                });
            if close {
                self.game.letter_reveal = None;
            }
        }
    }
}
impl eframe::App for CoastApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let started = Instant::now();
        let dt = (started - self.last).as_secs_f64().min(0.1);
        self.last = started;
        self.frame_ms += (dt * 1000. - self.frame_ms) * 0.06;
        let focused = ctx.input(|i| i.focused);
        if let Some(audio) = &self.audio {
            audio.active(focused)
        }
        if !ctx.wants_keyboard_input() {
            ctx.input(|i| {
                if i.key_pressed(Key::M) {
                    self.atlas = !self.atlas;
                }
                if i.key_pressed(Key::J) {
                    self.journal = !self.journal;
                }
                if i.key_pressed(Key::H) {
                    self.help = !self.help;
                }
                if i.key_pressed(Key::F3) {
                    self.debug = !self.debug;
                }
                if i.key_pressed(Key::Escape) {
                    if self.atlas
                        || self.journal
                        || self.help
                        || self.game.dialogue.is_some()
                        || self.game.letter_reveal.is_some()
                    {
                        self.atlas = false;
                        self.journal = false;
                        self.help = false;
                        self.game.dialogue = None;
                        self.game.letter_reveal = None;
                    } else {
                        self.settings = !self.settings;
                    }
                }
                for (k, m) in [
                    (Key::Num1, Mode::Boat),
                    (Key::Num2, Mode::Plane),
                    (Key::Num3, Mode::Walk),
                    (Key::Num4, Mode::Car),
                ] {
                    if i.key_pressed(k) {
                        self.game.switch_mode(m);
                    }
                }
                if i.key_pressed(Key::R) {
                    self.game.fish();
                }
            });
        }
        let paused = !focused
            || self.atlas
            || self.journal
            || self.settings
            || self.help
            || self.game.dialogue.is_some()
            || self.game.letter_reveal.is_some();
        let mut controls = Controls::default();
        if focused && self.game.dialogue.is_some() && !ctx.wants_keyboard_input() {
            controls.interact = ctx.input(|i| i.key_pressed(Key::E));
        }
        if !paused && !ctx.wants_keyboard_input() {
            ctx.input(|i| {
                let axis = |a, b| i.key_down(a) as u8 as f64 - i.key_down(b) as u8 as f64;
                controls.forward = axis(Key::W, Key::S);
                controls.side = axis(Key::D, Key::A);
                controls.turn = axis(Key::ArrowRight, Key::ArrowLeft);
                controls.climb = axis(Key::Space, Key::C);
                controls.brake = i.key_down(Key::Space);
                controls.boost = i.modifiers.shift;
                controls.interact = i.key_pressed(Key::E);
            });
        }
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ctx, |ui| {
                let rect = ui.max_rect();
                let response = ui.allocate_rect(rect, egui::Sense::drag());
                ui.painter().image(
                    self.texture,
                    rect,
                    egui::Rect::from_min_max(egui::pos2(0., 0.), egui::pos2(1., 1.)),
                    Color32::WHITE,
                );
                if response.dragged() && !paused {
                    let delta = ctx.input(|i| i.pointer.delta());
                    if ctx.input(|i| i.key_down(Key::Z)) {
                        self.game.save.hour =
                            (self.game.save.hour + delta.x * 0.03).rem_euclid(24.);
                    } else {
                        controls.look = [delta.x as f64, delta.y as f64];
                    }
                }
            });
        self.game
            .update(dt, &controls, Some(&self.renderer), paused);
        if let Some(audio) = &mut self.audio
            && focused
        {
            audio.update(&mut self.game, dt);
        }
        self.windows(ctx);
        egui::Area::new("top coast hud".into())
            .anchor(egui::Align2::LEFT_TOP, [20., 15.])
            .show(ctx, |ui| {
                egui::Frame::new()
                    .fill(Color32::from_black_alpha(130))
                    .corner_radius(12)
                    .inner_margin(12)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new("C O A S T L O V E")
                                    .strong()
                                    .size(19.)
                                    .color(CREAM),
                            );
                            ui.separator();
                            ui.label(RichText::new(self.game.save.mode.label()).color(GOLD));
                            let h = self.game.save.hour.floor() as u32;
                            let m = ((self.game.save.hour.fract()) * 60.) as u32;
                            ui.label(format!("{h:02}:{m:02}"));
                        });
                        ui.horizontal(|ui| {
                            if ui.small_button("Atlas  M").clicked() {
                                self.atlas = !self.atlas;
                            }
                            if ui.small_button("Field notes  J").clicked() {
                                self.journal = !self.journal;
                            }
                            if ui.small_button("Light & sound").clicked() {
                                self.settings = !self.settings;
                            }
                            if ui.small_button("Help  H").clicked() {
                                self.help = !self.help;
                            }
                        });
                    });
            });
        egui::Area::new("coast moments".into()).anchor(egui::Align2::CENTER_BOTTOM,[0.,-24.]).show(ctx,|ui|{egui::Frame::new().fill(Color32::from_black_alpha(145)).corner_radius(12).inner_margin(12).show(ui,|ui|{
   if !self.renderer.ready(){ui.horizontal(|ui|{ui.spinner();ui.label("The coast is waking up…");});}
   else if self.game.time<self.game.toast_until{ui.label(RichText::new(&self.game.toast).color(CREAM));}
   else if self.game.nearest_story().is_some()&&self.game.dialogue.is_none(){ui.label("E · listen to a coastal story");}
   else {ui.label(RichText::new("WASD to wander  ·  drag to look  ·  1 boat  2 plane  3 walk  4 car").small());}
   if self.game.letter_progress>0.{let l=&self.game.world.meta.letters[self.game.save.letters.len()];ui.add(egui::ProgressBar::new((self.game.letter_progress/l.duration)as f32).text("Stay a little longer…"));}
  });});
        if self.debug {
            egui::Window::new("Performance")
                .default_pos([20., 120.])
                .show(ctx, |ui| {
                    let s = &self.renderer.stats;
                    ui.label(&self.adapter);
                    ui.label(format!(
                        "{:.1} fps · {:.2} ms frame interval",
                        1000. / self.frame_ms,
                        self.frame_ms
                    ));
                    ui.label(format!("{:.2} ms CPU prepare + submit", self.render_ms));
                    ui.label(format!(
                        "{} × {} · {:.0} km horizon",
                        self.renderer.size()[0],
                        self.renderer.size()[1],
                        self.game.save.quality.distance() / 1000.
                    ));
                    ui.label(format!(
                        "{} draws · {:.2} M triangles · {} instances",
                        s.draws,
                        s.triangles as f64 / 1e6,
                        s.instances
                    ));
                    ui.label(format!(
                        "{} resident city cells · {} plants",
                        s.city_cells, s.trees
                    ));
                    ui.label(format!("{:.0} MiB mesh buffers", s.uploaded_mb));
                    ui.label(format!(
                        "{:.0} m altitude · {:.0} km/h",
                        self.game.position.y,
                        self.game.speed.abs() * 3.6
                    ));
                });
        }
        if focused {
            let size = ctx.content_rect().size() * ctx.pixels_per_point();
            let scale = (self.game.save.quality.max_width() / size.x).min(1.);
            let pixels = [(size.x * scale) as u32, (size.y * scale) as u32];
            if self.renderer.resize(pixels) {
                self.render_state
                    .renderer
                    .write()
                    .update_egui_texture_from_wgpu_texture(
                        &self.render_state.device,
                        self.renderer.color_view(),
                        eframe::wgpu::FilterMode::Linear,
                        self.texture,
                    );
            }
            let render_start = Instant::now();
            self.renderer.render(&self.game.view(), &self.game.poses);
            self.render_ms += (render_start.elapsed().as_secs_f64() * 1000. - self.render_ms) * 0.1;
            if self.game.save.quality == Quality::Quiet {
                ctx.request_repaint_after(Duration::from_secs_f64(
                    (1. / self.game.save.quality.fps() - started.elapsed().as_secs_f64())
                        .max(0.001),
                ));
            } else {
                ctx.request_repaint();
            }
        } else {
            ctx.request_repaint_after(Duration::from_secs(1));
        }
        if self.last_save.elapsed() > Duration::from_secs(30) {
            self.game.persist();
            self.last_save = Instant::now();
        }
    }
}
impl Drop for CoastApp {
    fn drop(&mut self) {
        self.game.persist();
    }
}
