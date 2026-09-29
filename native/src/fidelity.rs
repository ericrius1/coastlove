//! Native GPU resources shared with the original artwork. Assets are baked at
//! build time; the four-cascade FFT runs as GPU compute on every native frame.
use crate::mesh::{Mesh, Vertex};
use eframe::wgpu::{self, util::DeviceExt};
use serde::Deserialize;
use std::{collections::HashMap, path::Path};

pub fn ocean_phases(origin: glam::DVec3) -> [[f32; 4]; 2] {
    let mut out = [[0.; 4]; 2];
    for (i, size) in [733., 157., 33.3, 7.1].into_iter().enumerate() {
        out[i / 2][(i % 2) * 2] = (origin.x.rem_euclid(size) / size) as f32;
        out[i / 2][(i % 2) * 2 + 1] = (origin.z.rem_euclid(size) / size) as f32;
    }
    out
}

#[derive(Deserialize)]
struct TextureInfo {
    name: String,
    width: u32,
    height: u32,
    mips: u32,
}
pub fn material_textures(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    root: &Path,
) -> Vec<wgpu::TextureView> {
    let dir = root.join("native/assets/rendering");
    let infos: Vec<TextureInfo> = serde_json::from_slice(
        &std::fs::read(dir.join("textures.json")).expect("Run npm run native:assets"),
    )
    .unwrap();
    [
        "leaves", "woodA", "woodN", "stoneA", "stoneN", "roofA", "roofN",
    ]
    .iter()
    .map(|name| {
        let info = infos.iter().find(|i| i.name == *name).unwrap();
        let tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some(name),
            size: wgpu::Extent3d {
                width: info.width,
                height: info.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: info.mips,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let bytes = std::fs::read(dir.join(format!("{name}.bin"))).unwrap();
        let mut offset = 0;
        for mip in 0..info.mips {
            let w = (info.width >> mip).max(1);
            let h = (info.height >> mip).max(1);
            let count = (w * h * 4) as usize;
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &tex,
                    mip_level: mip,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &bytes[offset..offset + count],
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(w * 4),
                    rows_per_image: Some(h),
                },
                wgpu::Extent3d {
                    width: w,
                    height: h,
                    depth_or_array_layers: 1,
                },
            );
            offset += count;
        }
        tex.create_view(&Default::default())
    })
    .collect()
}
pub fn plant(root: &Path, kind: usize, near: bool) -> Mesh {
    if kind == 1 {
        return crate::botany::redwood(near);
    }
    let name = ["tree", "tree", "fern", "palm", "shrub"][kind];
    let dir = root.join("native/assets/rendering");
    let lod = if near { "near" } else { "far" };
    let bytes = std::fs::read(dir.join(format!("{name}-{lod}-vertices.bin"))).unwrap();
    let vertices: Vec<Vertex> = bytes
        .as_chunks::<64>()
        .0
        .iter()
        .map(|b| bytemuck::pod_read_unaligned(b))
        .collect();
    let ib = std::fs::read(dir.join(format!("{name}-{lod}-indices.bin"))).unwrap();
    Mesh {
        vertices,
        indices: ib
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| u32::from_le_bytes(*b))
            .collect(),
        radius: 48.,
        ..Default::default()
    }
}
struct Kernel {
    pipeline: wgpu::ComputePipeline,
    bind: wgpu::BindGroup,
    groups: [u32; 3],
}
pub struct Ocean {
    displacement_texture: wgpu::Texture,
    derivative_texture: wgpu::Texture,
    pub displacement: wgpu::TextureView,
    pub derivatives: wgpu::TextureView,
    params: wgpu::Buffer,
    kernels: Vec<Kernel>,
    previous_time: Option<f32>,
}
impl Ocean {
    pub fn new(device: &wgpu::Device, root: &Path) -> Self {
        let dir = root.join("native/assets/rendering");
        let mut buffers = HashMap::new();
        for (name, size) in [
            ("h0", 4 * 256 * 256 * 16),
            ("waveData", 4 * 256 * 256 * 16),
            ("tmp", 4 * 256 * 256 * 32),
            ("foam", 4 * 256 * 256 * 4),
            ("mipSrc", 4 * 256 * 256 * 32),
            ("mipMid", 4 * 64 * 32),
        ] {
            let path = dir.join(format!("ocean-{name}.bin"));
            let data = std::fs::read(path).unwrap_or_else(|_| vec![0; size]);
            buffers.insert(
                name.to_string(),
                device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some(name),
                    contents: &data,
                    usage: wgpu::BufferUsages::STORAGE,
                }),
            );
        }
        let mut params = std::fs::read(dir.join("ocean-params.bin")).unwrap();
        params.resize(240, 0);
        let params = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ocean spectrum controls"),
            contents: &params,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let make_tex = |name| {
            device.create_texture(&wgpu::TextureDescriptor {
                label: Some(name),
                size: wgpu::Extent3d {
                    width: 256,
                    height: 256,
                    depth_or_array_layers: 4,
                },
                mip_level_count: 9,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba16Float,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::STORAGE_BINDING
                    | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            })
        };
        let displacement = make_tex("four ocean displacement cascades");
        let derivatives = make_tex("ocean spectral slopes");
        let views = |tex: &wgpu::Texture| {
            (0..9)
                .map(|mip| {
                    tex.create_view(&wgpu::TextureViewDescriptor {
                        dimension: Some(wgpu::TextureViewDimension::D2Array),
                        base_mip_level: mip,
                        mip_level_count: Some(1),
                        ..Default::default()
                    })
                })
                .collect::<Vec<_>>()
        };
        let disp = views(&displacement);
        let deriv = views(&derivatives);
        #[derive(Deserialize)]
        struct Spec {
            name: String,
            bindings: Vec<String>,
        }
        let specs: Vec<Spec> =
            serde_json::from_slice(&std::fs::read(dir.join("ocean-kernels.json")).unwrap())
                .unwrap();
        let kernels = specs
            .into_iter()
            .map(|spec| {
                let source =
                    std::fs::read_to_string(dir.join(format!("ocean-{}.wgsl", spec.name))).unwrap();
                let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some(&spec.name),
                    source: wgpu::ShaderSource::Wgsl(source.into()),
                });
                let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                    label: Some(&spec.name),
                    layout: None,
                    module: &shader,
                    entry_point: Some("main"),
                    compilation_options: Default::default(),
                    cache: None,
                });
                let entries = spec
                    .bindings
                    .iter()
                    .enumerate()
                    .map(|(i, name)| {
                        let resource = match name.as_str() {
                            "ocean" => params.as_entire_binding(),
                            "dispOut" => wgpu::BindingResource::TextureView(&disp[0]),
                            "derivOut" => wgpu::BindingResource::TextureView(&deriv[0]),
                            s if s.starts_with("out") => {
                                let level = s[3..].parse::<usize>().unwrap();
                                wgpu::BindingResource::TextureView(if spec.name.ends_with('0') {
                                    &disp[level]
                                } else {
                                    &deriv[level]
                                })
                            }
                            _ => buffers[name].as_entire_binding(),
                        };
                        wgpu::BindGroupEntry {
                            binding: i as u32,
                            resource,
                        }
                    })
                    .collect::<Vec<_>>();
                let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some(&spec.name),
                    layout: &pipeline.get_bind_group_layout(0),
                    entries: &entries,
                });
                let groups = if spec.name.starts_with("mip-a") {
                    [8, 8, 4]
                } else if spec.name.starts_with("mip-b") {
                    [1, 1, 4]
                } else {
                    [256, 4, 1]
                };
                Kernel {
                    pipeline,
                    bind,
                    groups,
                }
            })
            .collect();
        Self {
            params,
            kernels,
            displacement: displacement.create_view(&Default::default()),
            derivatives: derivatives.create_view(&Default::default()),
            displacement_texture: displacement,
            derivative_texture: derivatives,
            previous_time: None,
        }
    }
    pub fn update(&mut self, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, time: f32) {
        // Use elapsed simulation time for foam; screenshots and paused frames
        // must not age it according to how quickly the GPU happens to render.
        let dt = self
            .previous_time
            .map_or(0., |t| (time - t).clamp(0., 0.05));
        self.previous_time = Some(time);
        queue.write_buffer(&self.params, 212, bytemuck::bytes_of(&time));
        queue.write_buffer(&self.params, 224, bytemuck::bytes_of(&dt));
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Tessendorf ocean and mip chains"),
            timestamp_writes: None,
        });
        for k in &self.kernels {
            pass.set_pipeline(&k.pipeline);
            pass.set_bind_group(0, &k.bind, &[]);
            pass.dispatch_workgroups(k.groups[0], k.groups[1], k.groups[2]);
        }
    }
}

/// Integration check against the web engine's actual FFT output at t=0.
/// Comparing every cascade catches binding, packing, normalization and origin
/// mistakes that shader compilation alone cannot find.
pub fn verify(device: &wgpu::Device, queue: &wgpu::Queue, root: &Path) -> anyhow::Result<()> {
    let mut ocean = Ocean::new(device, root);
    let mut encoder = device.create_command_encoder(&Default::default());
    ocean.update(queue, &mut encoder, 0.);
    queue.submit([encoder.finish()]);
    for (name, tex) in [
        ("displacement", &ocean.displacement_texture),
        ("derivatives", &ocean.derivative_texture),
    ] {
        let bytes = 4 * 256 * 256 * 8;
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ocean parity readback"),
            size: bytes,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut encoder = device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(256 * 8),
                    rows_per_image: Some(256),
                },
            },
            wgpu::Extent3d {
                width: 256,
                height: 256,
                depth_or_array_layers: 4,
            },
        );
        queue.submit([encoder.finish()]);
        let (tx, rx) = std::sync::mpsc::channel();
        buffer.slice(..).map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        device.poll(wgpu::PollType::wait_indefinitely())?;
        rx.recv()??;
        let actual = buffer.slice(..).get_mapped_range();
        let expected =
            std::fs::read(root.join(format!("native/assets/rendering/reference-{name}.bin")))?;
        anyhow::ensure!(
            actual.len() == expected.len(),
            "Ocean reference size mismatch"
        );
        let half = |b: &[u8; 2]| {
            let h = u16::from_le_bytes(*b);
            let sign = if h & 0x8000 != 0 { -1. } else { 1. };
            let e = ((h >> 10) & 31) as i32;
            let f = (h & 1023) as f32;
            sign * if e == 0 {
                2f32.powi(-14) * f / 1024.
            } else {
                2f32.powi(e - 15) * (1. + f / 1024.)
            }
        };
        let mut error = 0f32;
        let mut energy = 0f64;
        for (a, b) in actual
            .as_chunks::<2>()
            .0
            .iter()
            .zip(expected.as_chunks::<2>().0)
        {
            let a = half(a);
            let b = half(b);
            anyhow::ensure!(a.is_finite() && b.is_finite(), "Nonfinite ocean output");
            error = error.max((a - b).abs());
            energy += f64::from(a * a);
        }
        anyhow::ensure!(
            error < 0.025 && energy > 1.,
            "{name} differs from web FFT: max error {error}, energy {energy}"
        );
        println!(
            "{name}: four cascades match web FFT · maximum error {error:.6} · energy {energy:.2}"
        );
        drop(actual);
        buffer.unmap();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn spectrum_stays_in_place_across_floating_origin_changes() {
        let point = glam::DVec3::new(-365717.23, 0., -779669.41);
        let base = (point / 256.).floor() * 256.;
        for offset in [glam::DVec3::ZERO, glam::DVec3::new(256., 0., -256.)] {
            let origin = base + offset;
            let phases = ocean_phases(origin);
            for (i, size) in [733., 157., 33.3, 7.1].into_iter().enumerate() {
                for (axis, world) in [(0, point.x), (1, point.z)] {
                    let local = if axis == 0 {
                        point.x - origin.x
                    } else {
                        point.z - origin.z
                    };
                    let sample = ((local as f32) / (size as f32)
                        + phases[i / 2][(i % 2) * 2 + axis])
                        .rem_euclid(1.);
                    let reference = (world.rem_euclid(size) / size) as f32;
                    let error = (sample - reference).abs();
                    assert!(
                        error.min(1. - error) < 0.00001,
                        "cascade {i} phase jumped: {error}"
                    );
                }
            }
        }
    }
}
