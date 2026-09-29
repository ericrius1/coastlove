# M5 native measurements

Measured locally on Apple M5 (24 GB unified memory), Metal, release build, 2026-09-28. Air preset, 1600 × 1000, 48 km terrain horizon. Each scene warmed its streaming workers, then completed 180 frames.

Included: four 256² JONSWAP FFT ocean cascades and compute mip chains, displaced water geometry, depth-aware refraction, screen-space reflections, shore foam, alpha-tested botanical foliage, 4× MSAA, 3072 px filtered sun shadows with shadow LOD, original baked PBR texture maps, contact occlusion, atmospheric haze, and HDR glow/tone mapping.

| Scene | Completed frame median (ms) | 95th percentile (ms) | CPU prepare/submit median (ms) | Submitted scene triangles |
| --- | ---: | ---: | ---: | ---: |
| harbor | 10.49 | 17.54 | 0.17 | 500,206 |
| redwoods | 11.13 | 17.77 | 0.41 | 2,978,546 |
| san-francisco | 8.21 | 17.04 | 0.61 | 995,802 |

These are serial offscreen CPU + GPU completion timings, excluding window presentation. They support a 60 Hz target in these sampled views; they are not a measured browser speedup, a sustained thermal/battery test, or a guarantee for every view. Dense close forest views cost more, and percentile spikes can exceed 16.7 ms. Use Quiet for a lower power target. Full increases resolution and costs more.

The original stripped native renderer measured 4.75/8.54/7.11 ms medians in earlier harbor/redwoods/SF captures. That version omitted the spectral ocean, PBR maps and real foliage. Those numbers are not an equal-quality comparison; placement and camera details also changed during corrections.

Validation: eight Rust tests including shader validation and floating-origin phase continuity; all 56 destinations and content/progression checks; all four native ocean displacement/foam and derivative textures match the web engine's t=0 GPU reference exactly on this M5 (maximum error 0); clean Clippy and formatting; x86_64 Windows MSVC cargo check. Windows hardware playtesting and full web renderer feature parity remain outstanding; see PORT_STATUS.md.
