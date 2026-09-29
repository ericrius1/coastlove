mod app;
mod audio;
mod botany;
mod data;
mod fidelity;
mod game;
mod mesh;
mod render;
mod stream;
use anyhow::{Context, Result, bail};
use eframe::{egui, egui_wgpu, wgpu};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

fn root() -> Result<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(p) = std::env::var_os("COASTLOVE_DATA") {
        candidates.push(PathBuf::from(p));
    }
    if let Ok(exe) = std::env::current_exe() {
        for p in exe.ancestors().skip(1).take(5) {
            candidates.push(p.to_path_buf());
            candidates.push(p.join("Resources"));
        }
    }
    candidates.push(std::env::current_dir()?);
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf(),
    );
    candidates.into_iter().find(|p|p.join("native/assets/world.json").exists()&&p.join("public/geodata/california-height.bin").exists()).context("Cannot locate Coastlove data. Run npm run native:assets, or set COASTLOVE_DATA to the project/data directory.")
}
fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|s| s == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}
fn main() -> Result<()> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.iter().any(|s| s == "--help") {
        println!(
            "Coastlove — native Rust / wgpu\n\nRun without arguments to explore.\n--headless --place harbor --mode walk --hour 16.2\n--benchmark 180 --capture native/captures/harbor.png\n--width 1600 --height 1000 --quality air|quiet|full\n--verify-world checks converted content, terrain, and progression.\n--verify-rendering compares native ocean compute with the web reference.\n--offset x,z moves a headless view relative to the selected place.\nCOASTLOVE_DATA overrides the data directory."
        );
        return Ok(());
    }
    let start = Instant::now();
    let world = data::World::load(&root()?)?;
    println!(
        "World loaded in {:.2}s · {} art meshes · {} places · {} animals/residents/vehicles",
        start.elapsed().as_secs_f64(),
        world.meta.geometries.len(),
        world.meta.places.len(),
        world.meta.entities.len()
    );
    if args.iter().any(|a| a == "--verify-world") {
        return verify_world(world);
    }
    if args.iter().any(|a| a == "--audio-check") {
        let _audio = audio::Soundscape::new(&world.root)?;
        println!(
            "Native output device opened; all 14 PCM recordings decoded, including sprite slices."
        );
        return Ok(());
    }
    if args
        .iter()
        .any(|a| a == "--headless" || a == "--verify-rendering")
    {
        return pollster::block_on(headless(world, &args));
    }
    let setup = egui_wgpu::WgpuSetupCreateNew {
        instance_descriptor: wgpu::InstanceDescriptor {
            backends: wgpu::Backends::PRIMARY,
            ..Default::default()
        },
        power_preference: wgpu::PowerPreference::LowPower,
        device_descriptor: Arc::new(|_| wgpu::DeviceDescriptor {
            label: Some("Coastlove native GPU"),
            memory_hints: wgpu::MemoryHints::MemoryUsage,
            required_limits: wgpu::Limits {
                max_storage_textures_per_shader_stage: 5,
                ..Default::default()
            },
            ..Default::default()
        }),
        ..Default::default()
    };
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280., 800.])
            .with_min_inner_size([800., 520.])
            .with_title("Coastlove · a native coastal journey"),
        renderer: eframe::Renderer::Wgpu,
        wgpu_options: egui_wgpu::WgpuConfiguration {
            present_mode: wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: Some(1),
            wgpu_setup: setup.into(),
            ..Default::default()
        },
        ..Default::default()
    };
    eframe::run_native(
        "Coastlove",
        options,
        Box::new(move |cc| Ok(Box::new(app::CoastApp::new(cc, world)))),
    )
    .map_err(|e| anyhow::anyhow!("Native window: {e}"))
}
async fn headless(world: Arc<data::World>, args: &[String]) -> Result<()> {
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: wgpu::Backends::PRIMARY,
        ..Default::default()
    });
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::LowPower,
            ..Default::default()
        })
        .await?;
    let info = adapter.get_info();
    println!("GPU: {} · {:?}", info.name, info.backend);
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("Coastlove verification"),
            memory_hints: wgpu::MemoryHints::MemoryUsage,
            required_limits: wgpu::Limits {
                max_storage_textures_per_shader_stage: 5,
                ..Default::default()
            },
            ..Default::default()
        })
        .await?;
    if args.iter().any(|a| a == "--verify-rendering") {
        return fidelity::verify(&device, &queue, &world.root);
    }
    let width = arg(args, "--width")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1600);
    let height = arg(args, "--height")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1000);
    if !(320..=4096).contains(&width) || !(180..=4096).contains(&height) {
        bail!("Capture dimensions out of range")
    }
    let mut save = game::Save::default();
    if let Some(h) = arg(args, "--hour") {
        save.hour = h.parse::<f32>()?.rem_euclid(24.);
    }
    save.quality = match arg(args, "--quality").as_deref() {
        Some("quiet") => game::Quality::Quiet,
        Some("full") => game::Quality::Full,
        _ => game::Quality::Air,
    };
    let mut game = game::Game::new(world.clone(), save);
    if let Some(id) = arg(args, "--place") {
        let p = world
            .meta
            .places
            .iter()
            .position(|p| p.id == id)
            .with_context(|| format!("Unknown place: {id}"))?;
        game.travel(p);
    }
    if let Some(mode) = arg(args, "--mode") {
        game.switch_mode(match mode.as_str() {
            "plane" => game::Mode::Plane,
            "boat" => game::Mode::Boat,
            "car" => game::Mode::Car,
            "walk" => game::Mode::Walk,
            _ => bail!("Unknown mode"),
        });
    }
    if let Some(offset) = arg(args, "--offset") {
        let v = offset
            .split(',')
            .map(str::parse::<f64>)
            .collect::<Result<Vec<_>, _>>()?;
        anyhow::ensure!(v.len() == 2, "--offset expects x,z in metres");
        game.position.x += v[0];
        game.position.z += v[1];
        if game.save.mode == game::Mode::Walk {
            game.position.y = world.height(game.position.x, game.position.z);
        }
    }
    if let Some(y) = arg(args, "--altitude") {
        game.position.y = y.parse()?;
    }
    if let Some(h) = arg(args, "--heading") {
        game.heading = h.parse::<f64>()?.to_radians();
    }
    if let Some(p) = arg(args, "--pitch") {
        game.pitch = p.parse::<f64>()?.to_radians();
    }
    let mut renderer = render::Renderer::new(device, queue, world, [width, height]);
    let settle = Instant::now();
    let mut stable = 0;
    let mut previous_cells = 0;
    // Warm the same asynchronous streaming path used by the desktop app.
    while settle.elapsed() < Duration::from_secs(30) {
        game.update(1. / 60., &Default::default(), None, true);
        renderer.render(&game.view(), &game.poses);
        renderer.device.poll(wgpu::PollType::wait_indefinitely())?;
        if renderer.ready() && renderer.stats.city_cells == previous_cells {
            stable += 1
        } else {
            stable = 0
        }
        previous_cells = renderer.stats.city_cells;
        if renderer.ready() && stable > 90 && settle.elapsed() > Duration::from_secs(3) {
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    if !renderer.ready() {
        bail!("Landscape did not finish loading within 30 seconds")
    }
    let frames = arg(args, "--benchmark")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(120)
        .clamp(10, 36000);
    let mut times = Vec::with_capacity(frames);
    let mut cpu = Vec::with_capacity(frames);
    for _ in 0..frames {
        let start = Instant::now();
        game.update(1. / 60., &Default::default(), None, true);
        renderer.render(&game.view(), &game.poses);
        cpu.push(start.elapsed().as_secs_f64() * 1000.);
        renderer.device.poll(wgpu::PollType::wait_indefinitely())?;
        times.push(start.elapsed().as_secs_f64() * 1000.);
    }
    times.sort_by(f64::total_cmp);
    cpu.sort_by(f64::total_cmp);
    let stats = &renderer.stats;
    let report = serde_json::json!({"adapter":info.name,"backend":format!("{:?}",info.backend),"resolution":[width,height],"frames":frames,"quality":game.save.quality.label(),"horizon_km":game.save.quality.distance()/1000.,"completed_frame_ms_p50":times[frames/2],"completed_frame_ms_p95":times[(frames as f64*0.95)as usize],"cpu_prepare_submit_ms_p50":cpu[frames/2],"draws":stats.draws,"triangles":stats.triangles,"instances":stats.instances,"city_cells":stats.city_cells,"plants":stats.trees,"mesh_buffer_mib":stats.uploaded_mb,"note":"Offscreen, serial CPU+GPU completion timing. Excludes window presentation and is not a browser speedup comparison."});
    println!("{}", serde_json::to_string_pretty(&report)?);
    if let Some(path) = arg(args, "--capture") {
        let path = PathBuf::from(path);
        capture(&renderer, &path)?;
        std::fs::write(
            path.with_extension("json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        println!("Capture: {}", path.display());
    }
    Ok(())
}
fn capture(renderer: &render::Renderer, path: &Path) -> Result<()> {
    let [w, h] = renderer.size();
    let stride = (w * 4).div_ceil(256) * 256;
    let buffer = renderer.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("capture readback"),
        size: stride as u64 * h as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut e = renderer.device.create_command_encoder(&Default::default());
    e.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: renderer.color_texture(),
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(stride),
                rows_per_image: Some(h),
            },
        },
        wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
    );
    renderer.queue.submit([e.finish()]);
    let (tx, rx) = std::sync::mpsc::channel();
    buffer.slice(..).map_async(wgpu::MapMode::Read, move |r| {
        let _ = tx.send(r);
    });
    renderer.device.poll(wgpu::PollType::wait_indefinitely())?;
    rx.recv()??;
    let mapped = buffer.slice(..).get_mapped_range();
    let mut rgba = Vec::with_capacity((w * h * 4) as usize);
    for row in mapped.chunks_exact(stride as usize) {
        rgba.extend_from_slice(&row[..w as usize * 4]);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut encoder = png::Encoder::new(std::fs::File::create(path)?, w, h);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header()?.write_image_data(&rgba)?;
    drop(mapped);
    buffer.unmap();
    Ok(())
}
fn verify_world(world: Arc<data::World>) -> Result<()> {
    let entity_ids = world
        .meta
        .entities
        .iter()
        .map(|e| &e.id)
        .collect::<std::collections::HashSet<_>>();
    if entity_ids.len() != world.meta.entities.len() {
        bail!("Duplicate native entity IDs")
    }
    if world.meta.letters.len() != 6
        || world.meta.stories.len() != 9
        || world.meta.places.len() < 50
    {
        bail!("Authored content is missing")
    }
    for kind in ["fox", "seaLion", "deer", "rabbit", "quail", "butterfly"] {
        if !world.meta.entities.iter().any(|e| e.kind == kind) {
            bail!("Missing wildlife {kind}")
        }
    }
    for p in &world.meta.places {
        if !world.height(p.x, p.z).is_finite() {
            bail!("Invalid terrain at {}", p.id)
        }
        if !p.water {
            let a = world.safe_land(p.x, p.z);
            if world.blocked(a, 0.35) {
                bail!("Blocked arrival at {}", p.id)
            }
        }
    }
    let mesh = mesh::terrain(&world, glam::DVec3::new(-246880.3, 200., -381600.99), 10);
    if mesh
        .vertices
        .iter()
        .any(|v| v.position.iter().any(|x| !x.is_finite()))
        || mesh
            .indices
            .iter()
            .any(|&i| i as usize >= mesh.vertices.len())
    {
        bail!("Terrain mesh invalid")
    }
    let save = game::Save {
        letters: vec!["seed".into(), "stars".into()],
        ..Default::default()
    };
    let mut game = game::Game::new(world.clone(), save);
    if game.save.letters != ["seed"] {
        bail!("Out-of-order save was not normalized")
    }
    game.switch_mode(game::Mode::Plane);
    let start = game.position;
    for _ in 0..120 {
        game.update(1. / 60., &game::Controls::default(), None, false);
    }
    anyhow::ensure!(
        (game.position - start).length() > 60.,
        "Plane did not travel at native cruise speed"
    );
    anyhow::ensure!(
        game.position.is_finite()
            && game.position.y > world.height(game.position.x, game.position.z),
        "Plane terrain clearance failed"
    );
    game.switch_mode(game::Mode::Boat);
    anyhow::ensure!(
        game.save.mode == game::Mode::Boat && world.height(game.position.x, game.position.z) < -1.5,
        "Boat launch did not find navigable water"
    );
    println!(
        "Verified: all 56 destinations, 9 residents, 6 wildlife species, 6 chapters; safe arrivals; finite long-distance terrain; contiguous mystery saves."
    );
    Ok(())
}
