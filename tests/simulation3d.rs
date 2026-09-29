use sph_web_samples::Simulation3d;

#[test]
fn simulation3d_exposes_xyz_positions() {
    let sim = Simulation3d::new();
    assert_eq!(sim.particle_count(), 8 * 8 * 8);

    let positions = sim.positions();
    assert_eq!(positions.len(), sim.particle_count() * 3);
    assert!(positions.iter().all(|v| v.is_finite()));
}

#[test]
fn simulation3d_has_depth_extent() {
    let sim = Simulation3d::new();
    let positions = sim.positions();

    let zs: Vec<f32> = positions.chunks_exact(3).map(|p| p[2]).collect();
    let min_z = zs.iter().copied().fold(f32::INFINITY, f32::min);
    let max_z = zs.iter().copied().fold(f32::NEG_INFINITY, f32::max);

    assert!(max_z - min_z > 0.4);
}

#[test]
fn simulation3d_gravity_moves_center_of_mass_down() {
    let mut sim = Simulation3d::new();
    let before = sim.positions();
    let before_avg_y =
        before.chunks_exact(3).map(|p| p[1]).sum::<f32>() / sim.particle_count() as f32;

    for _ in 0..8 {
        sim.step(1.0 / 200.0);
    }

    let after = sim.positions();
    let after_avg_y =
        after.chunks_exact(3).map(|p| p[1]).sum::<f32>() / sim.particle_count() as f32;

    assert!(after.iter().all(|v| v.is_finite()));
    assert!(after_avg_y < before_avg_y - 0.0001);
}
