//! Coastal conifers: woody limbs carrying flat, feathered evergreen sprays.
//! Near/far models share branch positions; neither LOD uses opaque crown blobs.
use crate::mesh::{Mesh, Vertex, hash};
use glam::Vec3;
fn branch(m: &mut Mesh, a: Vec3, b: Vec3, r0: f32, r1: f32, sides: usize) {
    let axis = (b - a).normalize();
    let x = axis
        .cross(if axis.y.abs() > 0.9 { Vec3::X } else { Vec3::Y })
        .normalize();
    let z = axis.cross(x);
    let start = m.vertices.len() as u32;
    let length = a.distance(b);
    for (j, p) in [a, b].into_iter().enumerate() {
        for i in 0..=sides {
            let angle = i as f32 / sides as f32 * std::f32::consts::TAU;
            let n = x * angle.cos() + z * angle.sin();
            m.vertices.push(Vertex::new(
                p + n * if j == 0 { r0 } else { r1 },
                n,
                [0.155, 0.092, 0.045],
                [i as f32 / sides as f32, j as f32 * length],
                5.,
            ));
        }
    }
    for i in 0..sides as u32 {
        let a = start + i;
        let b = a + sides as u32 + 1;
        m.indices.extend([a, a + 1, b, a + 1, b + 1, b]);
    }
}
fn spray(m: &mut Mesh, c: Vec3, axis: Vec3, width: f32, length: f32, tilt: f32, shade: f32) {
    let side = Vec3::new(-axis.z, 0., axis.x);
    let side = side * tilt.cos() + Vec3::Y * tilt.sin();
    let n = side.cross(axis).normalize();
    let n = if n.y < 0. { -n } else { n };
    let start = m.vertices.len() as u32;
    for (i, (u, v)) in [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
        .into_iter()
        .enumerate()
    {
        let p = c + axis * (v * length) + side * (u * width) - Vec3::Y * (v * v * length * 0.13);
        let normal =
            (n * 0.45 + Vec3::Y * 0.4 + Vec3::new(c.x, 0., c.z).normalize_or_zero() * 0.15)
                .normalize();
        let mut vertex = Vertex::new(
            p,
            normal,
            [0.036 * shade, 0.089 * shade, 0.041 * shade],
            [[0., 0.], [1., 0.], [1., 1.], [0., 1.]][i],
            6.1,
        );
        vertex.surface = [0.94, 0., 0., 0.68 + 0.25 * shade];
        m.vertices.push(vertex);
    }
    m.indices
        .extend([start, start + 1, start + 2, start, start + 2, start + 3]);
}
pub fn redwood(near: bool) -> Mesh {
    let mut m = Mesh {
        radius: 39.,
        ..Default::default()
    };
    // Tapered bole with a slightly crooked top; smooth radial normals, flared roots.
    let mut a = Vec3::new(0., -0.3, 0.);
    for j in 0..8 {
        let u = (j + 1) as f32 / 8.;
        let b = Vec3::new((u * 3.).sin() * 0.3, 35. * u, (u * 4.).cos() * 0.18);
        branch(
            &mut m,
            a,
            b,
            if j == 0 {
                0.88
            } else {
                0.63 * (1. - j as f32 / 8.).powf(0.7) + 0.025
            },
            0.63 * (1. - u).powf(0.7) + 0.025,
            if near { 12 } else { 6 },
        );
        a = b;
    }
    for i in 0..66 {
        if !near && i % 2 == 1 {
            continue;
        }
        let u = i as f32 / 66.;
        let angle = i as f32 * 2.39996;
        let dir = Vec3::new(angle.cos(), 0., angle.sin());
        let jitter = hash(i, 31, 782) as f32;
        let reach = (1. - u).powf(0.65) * 5.2 + 0.25;
        let y = 8. + u * 26. + (jitter - 0.5) * 0.8;
        let start = Vec3::Y * (y - 0.4);
        let end = dir * reach + Vec3::Y * (y + (u - 0.3) * 0.8);
        if near {
            branch(&mut m, start, end, 0.10 * (1. - u) + 0.018, 0.012, 5);
        }
        let count = if near { 7 } else { 4 };
        for j in 0..count {
            let f = 0.24 + j as f32 / count as f32 * 0.8;
            let c = start.lerp(end, f);
            let spread = Vec3::new(-dir.z, 0., dir.x) * (if j % 2 == 0 { 1. } else { -1. });
            let twig = (dir * 0.55 + spread * 0.6).normalize();
            let size = (1. - u * 0.75) * if near { 1.5 } else { 2. };
            for k in 0..if near { 3 } else { 2 } {
                let tilt = (k as f32 - 0.8) * 0.7;
                spray(
                    &mut m,
                    c + twig * size * 0.23,
                    twig,
                    size * 0.95,
                    size * 1.7,
                    tilt,
                    0.8 + jitter * 0.5,
                );
            }
        }
    }
    m
}

/// Nested ocean rings, displaced on the GPU by the same FFT used for shading.
/// The skirt-free grid is stitched at the outer edge of every level.
pub fn ocean_grid() -> Mesh {
    let mut m = Mesh::default();
    for level in 0..13 {
        let step = (1u32 << level) as f32;
        let base = m.vertices.len() as u32;
        for z in -32i32..=32 {
            for x in -32i32..=32 {
                let xx = if z.abs() == 32 && x % 2 != 0 {
                    x - 1
                } else {
                    x
                };
                let zz = if x.abs() == 32 && z % 2 != 0 {
                    z - 1
                } else {
                    z
                };
                m.vertices.push(Vertex::new(
                    Vec3::new(xx as f32 * step, 0., zz as f32 * step),
                    Vec3::Y,
                    [0.; 3],
                    [step, level as f32],
                    0.,
                ));
            }
        }
        for z in 0..64 {
            for x in 0..64 {
                if level > 0 && (16..48).contains(&x) && (16..48).contains(&z) {
                    continue;
                }
                let a = base + (z * 65 + x) as u32;
                m.indices.extend([a, a + 65, a + 1, a + 1, a + 65, a + 66]);
            }
        }
    }
    m
}
