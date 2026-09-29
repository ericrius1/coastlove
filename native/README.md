# Coastlove native

A standalone Rust desktop runtime, rendered by wgpu: Metal on macOS, Direct3D 12 or Vulkan on Windows. It runs without a browser, JavaScript engine, dev server, or network. The browser game remains available alongside it.

## Run

Install a stable Rust toolchain and the platform compiler (Xcode Command Line Tools on macOS; Visual Studio C++ Build Tools on Windows). The first asset conversion also needs Node and FFmpeg on PATH (or set `FFMPEG` to its executable). From the project root:

```sh
npm run native
```

The first run converts the existing procedural art, original GPU texture bakes, and ocean spectrum using Node and decodes the Opus recordings into native PCM with FFmpeg, then compiles the release executable. Node and FFmpeg are build tools only. After that, run `native/target/release/coastlove-native` directly (`.exe` on Windows). Source changes to the browser world can be carried across with `npm run native:assets`.

To make a self-contained local application, run `python3 native/tools/package.py` after a release build. On macOS this produces `native/dist/Coastlove.app`, signed locally for development. It is not notarized for public distribution. Windows packaging must run after compiling the Windows executable on Windows.

The data directory can be moved independently by setting `COASTLOVE_DATA`. It must contain `native/assets` and `public/geodata` / `public/audio`.

## Play

| Key | Action |
| --- | --- |
| WASD | Move, throttle, steer |
| Drag in the world / left and right arrows | Look / turn |
| Shift | Run or faster travel |
| 1 / 2 / 3 / 4 | Boat / Marigold seaplane / walk / roadster |
| Space / C | Climb / descend in the plane |
| Space | Car brake |
| E | Talk, advance a conversation, ring the mystery bell, leave a vehicle |
| R | Cast a fishing line; reel in when it bites |
| M / J | Atlas / field journal |
| Z + horizontal drag | Change the hour |
| Esc / H / F3 | Settings / help / performance overlay |

The atlas travels to all 56 existing destinations. Native progress is separate from browser storage. It saves automatically every 30 seconds, when a letter is discovered, and on a clean exit. The macOS save is `~/Library/Application Support/Coastlove/native-save.json`; Windows uses `%APPDATA%\Coastlove\native-save.json`.

## M5 Air defaults

* **Air:** up to 1600 pixels wide for the 3D scene, sharp native-resolution UI, 48 km terrain horizon, 60 Hz vsync, 3072 px filtered sun shadows, 4× MSAA.
* **Quiet:** up to 1280 pixels, 24 km horizon, no sun shadow pass, 30 fps target.
* **Full:** up to 2560 pixels, 72 km horizon, sun shadows. Higher GPU cost, especially on Retina displays.

World coordinates stay in `f64`. GPU coordinates are relative to a nearby origin and use reversed infinite depth. Terrain detail uses bounded nested rings. Terrain, roads, vegetation, and city geometry are prepared by two background workers. City residency is bounded to 81 cells per nearby city; request and result queues are bounded. Static artwork and plant prototypes share vertex buffers and instanced draws. The four-cascade FFT runs in workgroup memory; its mip chains are generated in compute. Leaf coverage survives minification, foliage draws front to back, and shadow casters use a cheaper LOD when fine twigs are smaller than a shadow texel. Rendering and audio pause when the window loses focus.

## Verify and measure

```sh
cargo test --manifest-path native/Cargo.toml
cargo run --release --manifest-path native/Cargo.toml -- --verify-world
cargo run --release --manifest-path native/Cargo.toml -- --headless --verify-rendering
cargo run --release --manifest-path native/Cargo.toml -- \
  --headless --place harbor --benchmark 180 --capture native/captures/harbor.png
cargo run --release --manifest-path native/Cargo.toml -- \
  --headless --place san-francisco --mode plane --altitude 240 --benchmark 180 \
  --capture native/captures/san-francisco.png
```

`--verify-rendering` compares every displacement/foam and derivative texel in all four native ocean cascades against the web GPU reference at time zero. `--offset x,z` moves a capture camera relative to a destination; `--heading`, `--pitch`, and `--hour` make views reproducible.

Capture runs use the actual renderer and streaming workers. They write a PNG and JSON with adapter, resolution, detail settings, draw/triangle counts, and median/95th percentile completed-frame times. These are serial offscreen CPU + GPU completion timings, not window frame rates or proof of a speedup over the browser version. Run comparable routes in both versions before claiming a relative improvement.

See [PORT_STATUS.md](PORT_STATUS.md) for the exact scope and remaining fidelity differences. Original audio/data attribution remains in `public/audio/CREDITS.md` and the geodata source files.
