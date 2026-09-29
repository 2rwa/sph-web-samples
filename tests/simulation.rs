use sph_web_samples::Simulation;

fn average_y(positions: &[f32]) -> f32 {
    let mut sum = 0.0;
    let mut count = 0usize;
    for xy in positions.chunks_exact(2) {
        sum += xy[1];
        count += 1;
    }
    sum / count as f32
}

#[test]
fn starts_with_expected_particle_block() {
    let sim = Simulation::new();
    assert_eq!(sim.particle_count(), 18 * 12);

    let positions = sim.positions();
    assert_eq!(positions.len(), sim.particle_count() * 2);
    assert!(positions.iter().all(|v| v.is_finite()));
}

#[test]
fn gravity_moves_the_fluid_downward() {
    let mut sim = Simulation::new();
    let before = sim.positions();
    let before_y = average_y(&before);

    for _ in 0..8 {
        sim.step(1.0 / 240.0);
    }

    let after = sim.positions();
    let after_y = average_y(&after);

    assert!(
        after_y < before_y - 0.0001,
        "expected center of mass to move downward: before={before_y}, after={after_y}"
    );
    assert!(after.iter().all(|v| v.is_finite()));
}

#[test]
fn repeated_steps_keep_particle_buffer_shape_stable() {
    let mut sim = Simulation::new();
    let expected_len = sim.particle_count() * 2;

    for _ in 0..60 {
        sim.step(1.0 / 240.0);
    }

    let positions = sim.positions();
    assert_eq!(positions.len(), expected_len);
    assert!(positions.iter().all(|v| v.is_finite()));
}
