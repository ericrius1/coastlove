use crate::{
    data::World,
    fidelity::{self, Ocean},
    mesh::{self, Building, Mesh, Plant},
    stream::{CityStream, LandscapeStream},
};
use eframe::wgpu::{self, util::DeviceExt};
use glam::{DMat4, DVec3, Mat4, Vec3, Vec4};
use std::{
    collections::{HashMap, HashSet},
    ops::Range,
    sync::Arc,
};

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Instance {
    matrix: [[f32; 4]; 4],
}
impl Instance {
    fn new(matrix: DMat4, origin: DVec3) -> Self {
        let mut m = matrix;
        m.w_axis -= origin.extend(0.);
        Self {
            matrix: m.as_mat4().to_cols_array_2d(),
        }
    }
}
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    view: [[f32; 4]; 4],
    inverse_view: [[f32; 4]; 4],
    light: [[f32; 4]; 4],
    camera: [f32; 4],
    sun: [f32; 4],
    sky: [f32; 4],
    params: [f32; 4],
    origin: [f32; 4],
    viewport: [f32; 4],
    ocean_phase: [[f32; 4]; 2],
}
#[derive(Clone, Copy)]
pub struct Pose {
    pub matrix: DMat4,
    pub visible: bool,
}
pub struct View {
    pub eye: DVec3,
    pub target: DVec3,
    pub time: f32,
    pub hour: f32,
    pub far: f32,
    pub levels: usize,
    pub shadows: bool,
}
#[derive(Default, Clone)]
pub struct Stats {
    pub draws: u32,
    pub triangles: u64,
    pub instances: u32,
    pub city_cells: usize,
    pub trees: usize,
    pub uploaded_mb: f64,
}
struct GpuMesh {
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
    origin: DVec3,
    radius: f32,
    bytes: usize,
}
impl GpuMesh {
    fn new(device: &wgpu::Device, m: &Mesh) -> Self {
        Self {
            vertices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("mesh vertices"),
                contents: bytemuck::cast_slice(&m.vertices),
                usage: wgpu::BufferUsages::VERTEX,
            }),
            indices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("mesh indices"),
                contents: bytemuck::cast_slice(&m.indices),
                usage: wgpu::BufferUsages::INDEX,
            }),
            count: m.indices.len() as u32,
            origin: m.origin,
            radius: m.radius,
            bytes: m.vertices.len() * 64 + m.indices.len() * 4,
        }
    }
}
struct Targets {
    pub color: wgpu::Texture,
    pub color_view: wgpu::TextureView,
    hdr: wgpu::TextureView,
    opaque: wgpu::TextureView,
    composite: wgpu::TextureView,
    water_bind: wgpu::BindGroup,
    depth: wgpu::TextureView,
    finish: wgpu::BindGroup,
    size: [u32; 2],
}
pub struct Renderer {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    world: Arc<World>,
    pub stats: Stats,
    uniform: wgpu::Buffer,
    frame_bind: wgpu::BindGroup,
    shadow_bind: wgpu::BindGroup,
    material_bind: wgpu::BindGroup,
    ocean: Ocean,
    water_pipeline: wgpu::RenderPipeline,
    copy_pipeline: wgpu::RenderPipeline,
    ocean_mesh: GpuMesh,
    water_layout: wgpu::BindGroupLayout,
    shadow: wgpu::TextureView,
    scene_pipeline: wgpu::RenderPipeline,
    shadow_pipeline: wgpu::RenderPipeline,
    sky_pipeline: wgpu::RenderPipeline,
    finish_pipeline: wgpu::RenderPipeline,
    finish_layout: wgpu::BindGroupLayout,
    targets: Targets,
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    instances: wgpu::Buffer,
    instance_capacity: usize,
    plants: Vec<Plant>,
    plant_meshes: Vec<GpuMesh>,
    terrain: Option<GpuMesh>,
    roads: Option<GpuMesh>,
    landscape: LandscapeStream,
    cities: HashMap<(usize, i32, i32), GpuMesh>,
    pub city_rows: HashMap<(usize, i32, i32), Vec<Building>>,
    pub city_stream: CityStream,
    skylines: HashMap<(usize, i32, i32), GpuMesh>,
}
const VERTEX_ATTR: [wgpu::VertexAttribute; 6] = wgpu::vertex_attr_array![0=>Float32x3,1=>Float32x3,2=>Float32x3,3=>Float32x2,4=>Float32,9=>Float32x4];
const INSTANCE_ATTR: [wgpu::VertexAttribute; 4] =
    wgpu::vertex_attr_array![5=>Float32x4,6=>Float32x4,7=>Float32x4,8=>Float32x4];
fn layouts() -> [wgpu::VertexBufferLayout<'static>; 2] {
    [
        wgpu::VertexBufferLayout {
            array_stride: 64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &VERTEX_ATTR,
        },
        wgpu::VertexBufferLayout {
            array_stride: 64,
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &INSTANCE_ATTR,
        },
    ]
}
fn texture(
    device: &wgpu::Device,
    label: &str,
    size: [u32; 2],
    format: wgpu::TextureFormat,
    usage: wgpu::TextureUsages,
) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d {
            width: size[0],
            height: size[1],
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage,
        view_formats: &[],
    })
}
fn targets(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    water_layout: &wgpu::BindGroupLayout,
    size: [u32; 2],
) -> Targets {
    let use_ = wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING;
    let color = texture(
        device,
        "native final",
        size,
        wgpu::TextureFormat::Rgba8Unorm,
        use_ | wgpu::TextureUsages::COPY_SRC,
    );
    let color_view = color.create_view(&Default::default());
    let msaa = |label, format| {
        device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d {
                    width: size[0],
                    height: size[1],
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 4,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage: use_,
                view_formats: &[],
            })
            .create_view(&Default::default())
    };
    let hdr = msaa("4x foliage HDR", wgpu::TextureFormat::Rgba16Float);
    let depth = msaa("4x reversed depth", wgpu::TextureFormat::Depth32Float);
    let opaque = texture(
        device,
        "resolved opaque HDR",
        size,
        wgpu::TextureFormat::Rgba16Float,
        use_,
    )
    .create_view(&Default::default());
    let composite = texture(
        device,
        "water and aerial perspective HDR",
        size,
        wgpu::TextureFormat::Rgba16Float,
        use_,
    )
    .create_view(&Default::default());
    let water_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("opaque refraction input"),
        layout: water_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&opaque),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(&depth),
            },
        ],
    });
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    });
    let finish = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("tonemap input"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&composite),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    Targets {
        color,
        color_view,
        hdr,
        opaque,
        composite,
        water_bind,
        depth,
        finish,
        size,
    }
}
impl Renderer {
    pub fn new(
        device: wgpu::Device,
        queue: wgpu::Queue,
        world: Arc<World>,
        size: [u32; 2],
    ) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("native coast WGSL"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/world.wgsl").into()),
        });
        let finish_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("native tonemap WGSL"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/finish.wgsl").into()),
        });
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("native frame"),
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let frame_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("frame layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let frame_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("native frame"),
            layout: &frame_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform.as_entire_binding(),
            }],
        });
        let shadow = texture(
            &device,
            "sun shadow",
            [3072, 3072],
            wgpu::TextureFormat::Depth32Float,
            wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        )
        .create_view(&Default::default());
        let ocean = Ocean::new(&device, &world.root);
        let maps = fidelity::material_textures(&device, &queue, &world.root);
        let material_entries = (0..7)
            .map(|i| wgpu::BindGroupLayoutEntry {
                binding: i,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            })
            .chain(std::iter::once(wgpu::BindGroupLayoutEntry {
                binding: 7,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                count: None,
            }))
            .collect::<Vec<_>>();
        let material_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("botanical and original PBR maps"),
            entries: &material_entries,
        });
        let material_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("8x anisotropic materials"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            anisotropy_clamp: 8,
            ..Default::default()
        });
        let mut material_entries = maps
            .iter()
            .enumerate()
            .map(|(i, t)| wgpu::BindGroupEntry {
                binding: i as u32,
                resource: wgpu::BindingResource::TextureView(t),
            })
            .collect::<Vec<_>>();
        material_entries.push(wgpu::BindGroupEntry {
            binding: 7,
            resource: wgpu::BindingResource::Sampler(&material_sampler),
        });
        let material_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("original material maps"),
            layout: &material_layout,
            entries: &material_entries,
        });
        let shadow_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("shadow layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let shadow_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("sun PCF"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });
        let shadow_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("sun sampling"),
            layout: &shadow_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&shadow),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&shadow_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&ocean.displacement),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&ocean.derivatives),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::Sampler(&material_sampler),
                },
            ],
        });
        let main_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("coast layout"),
            bind_group_layouts: &[&frame_layout, &material_layout, &shadow_layout],
            push_constant_ranges: &[],
        });
        let sun_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("sun layout"),
            bind_group_layouts: &[&frame_layout, &material_layout],
            push_constant_ranges: &[],
        });
        let depth = wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: true,
            depth_compare: wgpu::CompareFunction::GreaterEqual,
            stencil: Default::default(),
            bias: Default::default(),
        };
        // Build explicitly to keep the fragment target slice alive for the descriptor.
        let make = |name: &str,
                    vs: &str,
                    fs: Option<&str>,
                    layout: &wgpu::PipelineLayout,
                    buffers: &[wgpu::VertexBufferLayout<'_>],
                    d: Option<wgpu::DepthStencilState>,
                    fmt: wgpu::TextureFormat,
                    sh: &wgpu::ShaderModule| {
            let color = [Some(wgpu::ColorTargetState {
                format: fmt,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })];
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(name),
                layout: Some(layout),
                vertex: wgpu::VertexState {
                    module: sh,
                    entry_point: Some(vs),
                    buffers,
                    compilation_options: Default::default(),
                },
                fragment: fs.map(|f| wgpu::FragmentState {
                    module: sh,
                    entry_point: Some(f),
                    targets: if name == "sun" { &[] } else { &color },
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    cull_mode: None,
                    ..Default::default()
                },
                depth_stencil: d,
                multisample: wgpu::MultisampleState {
                    count: if name == "coast" || name == "sky and sea" {
                        4
                    } else {
                        1
                    },
                    alpha_to_coverage_enabled: name == "coast",
                    ..Default::default()
                },
                multiview: None,
                cache: None,
            })
        };
        let scene_pipeline = make(
            "coast",
            "vs_main",
            Some("fs_main"),
            &main_layout,
            &layouts(),
            Some(depth.clone()),
            wgpu::TextureFormat::Rgba16Float,
            &shader,
        );
        let shadow_pipeline = make(
            "sun",
            "vs_shadow",
            Some("fs_shadow"),
            &sun_layout,
            &layouts(),
            Some(wgpu::DepthStencilState {
                depth_compare: wgpu::CompareFunction::LessEqual,
                bias: wgpu::DepthBiasState {
                    constant: 2,
                    slope_scale: 1.5,
                    clamp: 0.,
                },
                ..depth.clone()
            }),
            wgpu::TextureFormat::Rgba16Float,
            &shader,
        );
        let sky_pipeline = make(
            "sky and sea",
            "vs_full",
            Some("fs_sky"),
            &sun_layout,
            &[],
            Some(depth),
            wgpu::TextureFormat::Rgba16Float,
            &shader,
        );
        let water_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("screen optics"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: true,
                    },
                    count: None,
                },
            ],
        });
        let water_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ocean optics layout"),
            bind_group_layouts: &[
                &frame_layout,
                &material_layout,
                &shadow_layout,
                &water_layout,
            ],
            push_constant_ranges: &[],
        });
        let water_pipeline = make(
            "ocean optics",
            "vs_water",
            Some("fs_water"),
            &water_pl,
            &layouts()[..1],
            None,
            wgpu::TextureFormat::Rgba16Float,
            &shader,
        );
        let copy_pipeline = make(
            "opaque copy",
            "vs_full",
            Some("fs_copy"),
            &water_pl,
            &[],
            None,
            wgpu::TextureFormat::Rgba16Float,
            &shader,
        );
        let ocean_mesh = GpuMesh::new(&device, &crate::botany::ocean_grid());
        let finish_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("finish layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let finish_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("finish pipeline layout"),
            bind_group_layouts: &[&finish_layout],
            push_constant_ranges: &[],
        });
        let finish_pipeline = make(
            "finish",
            "vs",
            Some("fs"),
            &finish_pl,
            &[],
            None,
            wgpu::TextureFormat::Rgba8Unorm,
            &finish_shader,
        );
        let targets = targets(&device, &finish_layout, &water_layout, size);
        let vertices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("shared original art"),
            contents: bytemuck::cast_slice(&world.vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let indices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("shared original indices"),
            contents: bytemuck::cast_slice(&world.indices),
            usage: wgpu::BufferUsages::INDEX,
        });
        let instances = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("instance transforms"),
            size: 65536 * 64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let plant_meshes = (0..5)
            .flat_map(|k| {
                [true, false]
                    .map(|near| GpuMesh::new(&device, &fidelity::plant(&world.root, k, near)))
            })
            .collect();
        let mut skylines = HashMap::new();
        for (city_id, city) in ["sf", "la"].iter().enumerate() {
            if let Ok(b) = std::fs::read(
                world
                    .root
                    .join(format!("public/geodata/{city}/skyline.json")),
            ) && let Ok(rows) = serde_json::from_slice::<Vec<Building>>(&b)
            {
                let mut cells: HashMap<(i32, i32), Vec<Building>> = HashMap::new();
                for row in rows {
                    if row.p.len() > 2 {
                        cells
                            .entry(mesh::building_cell(&row))
                            .or_default()
                            .push(row);
                    }
                }
                for ((x, z), rows) in cells {
                    let m = mesh::buildings(
                        &world,
                        &rows,
                        DVec3::new(x as f64 * 512., 0., z as f64 * 512.),
                    );
                    skylines.insert((city_id, x, z), GpuMesh::new(&device, &m));
                }
            }
        }
        let landscape = LandscapeStream::new(world.clone());
        let city_stream = CityStream::new(world.clone());
        Self {
            device,
            queue,
            world,
            stats: Stats::default(),
            uniform,
            frame_bind,
            shadow_bind,
            material_bind,
            ocean,
            water_pipeline,
            copy_pipeline,
            ocean_mesh,
            water_layout,
            shadow,
            scene_pipeline,
            shadow_pipeline,
            sky_pipeline,
            finish_pipeline,
            finish_layout,
            targets,
            vertices,
            indices,
            instances,
            instance_capacity: 65536,
            plants: Vec::new(),
            plant_meshes,
            terrain: None,
            roads: None,
            landscape,
            cities: HashMap::new(),
            city_rows: HashMap::new(),
            city_stream,
            skylines,
        }
    }
    pub fn color_view(&self) -> &wgpu::TextureView {
        &self.targets.color_view
    }
    pub fn color_texture(&self) -> &wgpu::Texture {
        &self.targets.color
    }
    pub fn size(&self) -> [u32; 2] {
        self.targets.size
    }
    pub fn ready(&self) -> bool {
        self.terrain.is_some()
    }
    pub fn resize(&mut self, size: [u32; 2]) -> bool {
        let size = [size[0].clamp(320, 4096), size[1].clamp(180, 4096)];
        if size == self.targets.size {
            return false;
        }
        self.targets = targets(&self.device, &self.finish_layout, &self.water_layout, size);
        true
    }
    pub fn stream(&mut self, p: DVec3, levels: usize) {
        self.landscape.request(p, levels);
        if let Ok(l) = self.landscape.rx.try_recv() {
            self.terrain = Some(GpuMesh::new(&self.device, &l.terrain));
            self.roads = Some(GpuMesh::new(&self.device, &l.roads));
            self.plants = l.plants;
        }
        let resident = self.cities.keys().copied().collect::<HashSet<_>>();
        self.city_stream.request(p, &resident);
        self.cities
            .retain(|k, _| self.city_stream.desired.contains(k));
        self.city_rows
            .retain(|k, _| self.city_stream.desired.contains(k));
        // One cell per frame bounds upload latency; the worker's queue holds at most two.
        if let Ok(c) = self.city_stream.rx.try_recv()
            && self.city_stream.desired.contains(&c.key)
        {
            if !c.mesh.indices.is_empty() {
                self.cities
                    .insert(c.key, GpuMesh::new(&self.device, &c.mesh));
            }
            self.city_rows.insert(c.key, c.buildings);
        }
    }
    pub fn blocked(&self, p: DVec3, r: f64) -> bool {
        self.city_stream.blocked(&self.city_rows, p, r)
    }
    pub fn city_roof(&self, p: DVec3) -> f64 {
        let c = crate::data::cell(p.x, p.z, 512.);
        let mut top = 0f64;
        for city in 0..2 {
            for z in c.1 - 1..=c.1 + 1 {
                for x in c.0 - 1..=c.0 + 1 {
                    if let Some(rows) = self.city_rows.get(&(city, x, z)) {
                        for b in rows {
                            if mesh::polygon_contains(&b.p, p.x, p.z, 8.) {
                                let base =
                                    b.p.iter()
                                        .map(|p| self.world.height(p[0], p[1]))
                                        .fold(f64::INFINITY, f64::min);
                                top = top.max(base + b.h);
                            }
                        }
                    }
                }
            }
        }
        top
    }
    pub fn render(&mut self, view: &View, poses: &[Pose]) {
        self.stream(view.eye, view.levels);
        let origin = (view.eye / 256.).floor() * 256.;
        let eye = (view.eye - origin).as_vec3();
        let target = (view.target - origin).as_vec3();
        let vp = Mat4::perspective_infinite_reverse_rh(
            58f32.to_radians(),
            self.targets.size[0] as f32 / self.targets.size[1] as f32,
            0.12,
        ) * Mat4::look_at_rh(eye, target, Vec3::Y);
        let angle = (view.hour - 6.) / 24. * std::f32::consts::TAU;
        let sun = Vec3::new(angle.cos() * 0.75, angle.sin(), 0.32).normalize();
        let day = ((sun.y + 0.12) / 0.32).clamp(0., 1.);
        let sun_dir = Vec3::new(sun.x, sun.y.max(0.13), sun.z).normalize();
        let focus = Vec3::new(
            (eye.x / 2.).floor() * 2.,
            (target.y / 2.).floor() * 2.,
            (eye.z / 2.).floor() * 2.,
        );
        let light = Mat4::orthographic_rh(-150., 150., -150., 150., 1., 1600.)
            * Mat4::look_at_rh(focus + sun_dir * 800., focus, Vec3::Y);
        let u = Uniforms {
            view: vp.to_cols_array_2d(),
            inverse_view: vp.inverse().to_cols_array_2d(),
            light: light.to_cols_array_2d(),
            camera: eye.extend(1.).to_array(),
            sun: sun.extend(day).to_array(),
            sky: [0.; 4],
            ocean_phase: fidelity::ocean_phases(origin),
            params: [view.time, view.hour, view.far, 0.],
            origin: [
                (origin.x % 4096.) as f32,
                origin.y as f32,
                (origin.z % 4096.) as f32,
                crate::data::smooth(-260000., -620000., origin.z) as f32,
            ],
            viewport: [
                self.targets.size[0] as f32,
                self.targets.size[1] as f32,
                0.,
                0.,
            ],
        };
        self.queue
            .write_buffer(&self.uniform, 0, bytemuck::bytes_of(&u));
        let frustum = Frustum::new(vp);
        let light_frustum = Frustum::new(light);
        let geometry_count = self.world.meta.geometries.len();
        let mut lists = vec![Vec::new(); geometry_count + 10];
        let mut shadow_lists = vec![Vec::new(); geometry_count + 10];
        for draw in &self.world.meta.draws {
            let mut matrix = DMat4::from_cols_array(&draw.matrix);
            if draw.entity >= 0 {
                let Some(p) = poses.get(draw.entity as usize) else {
                    continue;
                };
                if !p.visible {
                    continue;
                }
                let phase = view.time as f64 + draw.entity as f64 * 0.7;
                let joint = match draw.joint.as_str() {
                    "propeller" => DMat4::from_rotation_z(phase * 45.),
                    "wings" => DMat4::from_rotation_z((phase * 18.).sin() * 0.6),
                    "legs" => DMat4::from_rotation_x((phase * 3.2).sin() * 0.12),
                    "head" => DMat4::from_rotation_x((phase * 0.8).sin() * 0.07),
                    _ => DMat4::IDENTITY,
                };
                matrix *= joint;
                matrix = p.matrix * matrix;
            }
            let pos = matrix.w_axis.truncate();
            let scale = matrix
                .x_axis
                .truncate()
                .length()
                .max(matrix.y_axis.truncate().length())
                .max(matrix.z_axis.truncate().length());
            let radius = self.world.meta.geometries[draw.geometry].radius * scale as f32;
            if (pos - view.eye).length() > view.far as f64 + radius as f64 {
                continue;
            }
            let instance = Instance::new(matrix, origin);
            if frustum.visible((pos - origin).as_vec3(), radius) {
                lists[draw.geometry].push(instance);
            }
            if view.shadows && (pos - view.eye).length() < 400. + radius as f64 {
                shadow_lists[draw.geometry].push(instance);
            }
        }
        for p in &self.plants {
            let distance = (p.position - view.eye).length();
            if distance > 1500. || p.kind >= 2 && p.kind != 3 && distance > 300. {
                continue;
            }
            let id = geometry_count + p.kind * 2 + usize::from(distance > 220.);
            let radius = if p.kind == 2 || p.kind == 4 { 2. } else { 48. } * p.scale;
            let m = DMat4::from_scale_rotation_translation(
                DVec3::splat(p.scale as f64),
                glam::DQuat::from_rotation_y(p.heading as f64),
                p.position,
            );
            let i = Instance::new(m, origin);
            if frustum.visible(
                (p.position - origin).as_vec3() + Vec3::Y * radius * 0.4,
                radius,
            ) {
                lists[id].push(i)
            }
            if view.shadows
                && distance < 300.
                && light_frustum.visible(
                    (p.position - origin).as_vec3() + Vec3::Y * radius * 0.4,
                    radius,
                )
            {
                // Shadow texels cannot resolve the near mesh's tiny twigs at
                // this range. Keep the silhouette and save the alpha overdraw.
                let shadow_id = geometry_count + p.kind * 2 + usize::from(distance > 90.);
                shadow_lists[shadow_id].push(i)
            }
        }
        // Depth rejection is particularly valuable for dense cutout forests.
        for list in &mut lists[geometry_count..] {
            list.sort_unstable_by(|a, b| {
                let dist = |i: &Instance| {
                    Vec3::new(
                        i.matrix[3][0] - eye.x,
                        i.matrix[3][1] - eye.y,
                        i.matrix[3][2] - eye.z,
                    )
                    .length_squared()
                };
                dist(a).total_cmp(&dist(b))
            });
        }
        let mut packed = Vec::with_capacity(16000);
        let mut batches = Vec::new();
        let mut shadow_batches = Vec::new();
        for list in &lists {
            let start = packed.len() as u32;
            packed.extend_from_slice(list);
            batches.push(start..packed.len() as u32);
        }
        for list in &shadow_lists {
            let start = packed.len() as u32;
            packed.extend_from_slice(list);
            shadow_batches.push(start..packed.len() as u32);
        }
        let mut extra = Vec::new();
        if let Some(t) = &self.terrain {
            extra.push(t)
        }
        if let Some(r) = &self.roads {
            extra.push(r)
        }
        let visible = |m: &&GpuMesh| {
            frustum.visible(
                (m.origin - origin).as_vec3() + Vec3::new(256., 80., 256.),
                m.radius,
            )
        };
        extra.extend(self.cities.values().filter(visible));
        extra.extend(
            self.skylines
                .iter()
                .filter(|(key, _)| !self.cities.contains_key(key))
                .map(|(_, mesh)| mesh)
                .filter(|s| (s.origin - view.eye).length() < view.far as f64 + s.radius as f64)
                .filter(visible),
        );
        let extra_offset = packed.len() as u32;
        for m in &extra {
            packed.push(Instance::new(DMat4::from_translation(m.origin), origin));
        }
        if packed.len() > self.instance_capacity {
            self.instance_capacity = packed.len().next_power_of_two();
            self.instances = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("instance transforms"),
                size: self.instance_capacity as u64 * 64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
        }
        self.queue
            .write_buffer(&self.instances, 0, bytemuck::cast_slice(&packed));
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("native coast frame"),
            });
        self.ocean.update(&self.queue, &mut encoder, view.time);
        let draw_batches = |pass: &mut wgpu::RenderPass<'_>, ranges: &[Range<u32>]| {
            pass.set_vertex_buffer(1, self.instances.slice(..));
            pass.set_vertex_buffer(0, self.vertices.slice(..));
            pass.set_index_buffer(self.indices.slice(..), wgpu::IndexFormat::Uint32);
            for (i, range) in ranges[..geometry_count].iter().enumerate() {
                if !range.is_empty() {
                    let g = &self.world.meta.geometries[i];
                    pass.draw_indexed(g.first..g.first + g.count, 0, range.clone());
                }
            }
            for (i, m) in self.plant_meshes.iter().enumerate() {
                let range = &ranges[geometry_count + i];
                if range.is_empty() {
                    continue;
                }
                pass.set_vertex_buffer(0, m.vertices.slice(..));
                pass.set_index_buffer(m.indices.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..m.count, 0, range.clone());
            }
        };
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("sun shadows"),
                color_attachments: &[],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.shadow,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            if view.shadows && day > 0.01 {
                pass.set_pipeline(&self.shadow_pipeline);
                pass.set_bind_group(0, &self.frame_bind, &[]);
                pass.set_bind_group(1, &self.material_bind, &[]);
                draw_batches(&mut pass, &shadow_batches);
                for (i, m) in extra
                    .iter()
                    .enumerate()
                    .filter(|(_, m)| (m.origin - view.eye).length() < 1100.)
                {
                    pass.set_vertex_buffer(0, m.vertices.slice(..));
                    pass.set_index_buffer(m.indices.slice(..), wgpu::IndexFormat::Uint32);
                    pass.draw_indexed(
                        0..m.count,
                        0,
                        extra_offset + i as u32..extra_offset + i as u32 + 1,
                    );
                }
            }
        }
        {
            let color = [Some(wgpu::RenderPassColorAttachment {
                view: &self.targets.hdr,
                resolve_target: Some(&self.targets.opaque),
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })];
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("coast HDR"),
                color_attachments: &color,
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.targets.depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(0.),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.sky_pipeline);
            pass.set_bind_group(0, &self.frame_bind, &[]);
            pass.set_bind_group(1, &self.material_bind, &[]);
            pass.draw(0..3, 0..1);
            pass.set_pipeline(&self.scene_pipeline);
            pass.set_bind_group(2, &self.shadow_bind, &[]);
            draw_batches(&mut pass, &batches);
            for (i, m) in extra.iter().enumerate() {
                pass.set_vertex_buffer(0, m.vertices.slice(..));
                pass.set_index_buffer(m.indices.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(
                    0..m.count,
                    0,
                    extra_offset + i as u32..extra_offset + i as u32 + 1,
                );
            }
        }
        {
            let color = [Some(wgpu::RenderPassColorAttachment {
                view: &self.targets.composite,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })];
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("spectral water, refraction and contact shading"),
                color_attachments: &color,
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.copy_pipeline);
            pass.set_bind_group(0, &self.frame_bind, &[]);
            pass.set_bind_group(1, &self.material_bind, &[]);
            pass.set_bind_group(2, &self.shadow_bind, &[]);
            pass.set_bind_group(3, &self.targets.water_bind, &[]);
            pass.draw(0..3, 0..1);
            pass.set_pipeline(&self.water_pipeline);
            pass.set_vertex_buffer(0, self.ocean_mesh.vertices.slice(..));
            pass.set_index_buffer(self.ocean_mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..self.ocean_mesh.count, 0, 0..1);
        }
        {
            let color = [Some(wgpu::RenderPassColorAttachment {
                view: &self.targets.color_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })];
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("optical glow and tone mapping"),
                color_attachments: &color,
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.finish_pipeline);
            pass.set_bind_group(0, &self.targets.finish, &[]);
            pass.draw(0..3, 0..1);
        }
        self.queue.submit([encoder.finish()]);
        let mut stats = Stats {
            city_cells: self.cities.len(),
            trees: self.plants.len(),
            ..Default::default()
        };
        for (i, r) in batches.iter().enumerate() {
            if !r.is_empty() {
                stats.draws += 1;
                stats.instances += r.len() as u32;
                let count = if i < geometry_count {
                    self.world.meta.geometries[i].count
                } else {
                    self.plant_meshes[i - geometry_count].count
                };
                stats.triangles += count as u64 / 3 * r.len() as u64;
            }
        }
        stats.draws += extra.len() as u32 + 4;
        stats.triangles += u64::from(self.ocean_mesh.count) / 3;
        stats.triangles += extra.iter().map(|m| m.count as u64 / 3).sum::<u64>();
        stats.uploaded_mb = (self.world.vertices.len() * 64
            + self.world.indices.len() * 4
            + self.ocean_mesh.bytes
            + self.plant_meshes.iter().map(|m| m.bytes).sum::<usize>()
            + extra.iter().map(|m| m.bytes).sum::<usize>()) as f64
            / 1048576.;
        self.stats = stats;
    }
}
struct Frustum([Vec4; 6]);
impl Frustum {
    fn new(m: Mat4) -> Self {
        let t = m.transpose();
        let r = t.to_cols_array_2d().map(Vec4::from);
        Self([
            r[3] + r[0],
            r[3] - r[0],
            r[3] + r[1],
            r[3] - r[1],
            r[2],
            r[3] - r[2],
        ])
    }
    fn visible(&self, p: Vec3, r: f32) -> bool {
        self.0
            .iter()
            .all(|plane| plane.dot(p.extend(1.)) >= -r * plane.truncate().length())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shaders_validate_without_a_gpu() {
        for source in [
            include_str!("../shaders/world.wgsl"),
            include_str!("../shaders/finish.wgsl"),
        ] {
            let module = naga::front::wgsl::parse_str(source).expect("valid WGSL syntax");
            naga::valid::Validator::new(
                naga::valid::ValidationFlags::all(),
                naga::valid::Capabilities::all(),
            )
            .validate(&module)
            .expect("valid shader module");
        }
    }
    #[test]
    fn reverse_depth_frustum_keeps_near_and_distant_objects() {
        let m = Mat4::perspective_infinite_reverse_rh(1., 1.6, 0.1);
        let f = Frustum::new(m);
        assert!(f.visible(Vec3::new(0., 0., -1.), 0.1));
        assert!(f.visible(Vec3::new(0., 0., -70000.), 100.));
        assert!(!f.visible(Vec3::new(0., 0., 10.), 1.));
        assert!(!f.visible(Vec3::new(100., 0., -1.), 1.));
    }
}
