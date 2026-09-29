use sph_web_samples::InteractiveSimulation;

#[test]
fn interactive_sample_starts_with_one_thousand_particles() {
    let sim = InteractiveSimulation::new();
    assert_eq!(sim.particle_count(), 1_000);
    assert_eq!(sim.obstacle_count(), 0);
    assert!(sim.obstacle_points().is_empty());
}

#[test]
fn interactive_obstacles_can_be_added_and_cleared() {
    let mut sim = InteractiveSimulation::new();

    assert!(sim.add_circle_obstacle(0.0, 0.0, 0.20));
    assert!(sim.add_box_obstacle(-0.35, 0.15, 0.18, 0.12));
    assert!(sim.add_line_obstacle(-0.7, -0.2, 0.7, -0.1));
    assert!(sim.add_polyline_obstacle(vec![-0.6, 0.45, -0.2, 0.55, 0.2, 0.45]));

    assert_eq!(sim.obstacle_count(), 4);
    assert!(!sim.obstacle_points().is_empty());

    sim.clear_obstacles();
    assert_eq!(sim.obstacle_count(), 0);
    assert!(sim.obstacle_points().is_empty());
    assert_eq!(sim.particle_count(), 1_000);
}

#[test]
fn interactive_obstacles_reject_degenerate_shapes() {
    let mut sim = InteractiveSimulation::new();

    assert!(!sim.add_circle_obstacle(0.0, 0.0, 0.0));
    assert!(!sim.add_box_obstacle(0.0, 0.0, 0.0, 0.2));
    assert!(!sim.add_line_obstacle(0.0, 0.0, 0.0, 0.0));
    assert!(!sim.add_polyline_obstacle(vec![0.0, 0.0]));

    assert_eq!(sim.obstacle_count(), 0);
}

#[test]
fn resetting_particles_preserves_user_obstacles() {
    let mut sim = InteractiveSimulation::new();

    assert!(sim.add_circle_obstacle(0.0, -0.2, 0.15));
    assert!(sim.add_line_obstacle(-0.7, 0.2, 0.7, 0.2));
    let obstacle_points_before = sim.obstacle_points();

    assert_eq!(sim.reset_particles(3_000), 3_000);
    assert_eq!(sim.particle_count(), 3_000);
    assert_eq!(sim.positions().len(), 6_000);
    assert_eq!(sim.obstacle_count(), 2);
    assert_eq!(sim.obstacle_points(), obstacle_points_before);

    assert_eq!(sim.reset_particles(5_000), 5_000);
    assert_eq!(sim.particle_count(), 5_000);
    assert_eq!(sim.obstacle_count(), 2);
}

#[test]
fn resetting_particles_clamps_to_supported_range() {
    let mut sim = InteractiveSimulation::new();

    assert_eq!(sim.reset_particles(100), 1_000);
    assert_eq!(sim.particle_count(), 1_000);

    assert_eq!(sim.reset_particles(99_999), 5_000);
    assert_eq!(sim.particle_count(), 5_000);
}

#[test]
fn interactive_sample_remains_finite_after_obstacles_and_steps() {
    let mut sim = InteractiveSimulation::new();
    assert!(sim.add_circle_obstacle(0.0, -0.2, 0.15));
    assert!(sim.add_line_obstacle(-0.7, 0.2, 0.7, 0.2));

    for _ in 0..5 {
        sim.step(1.0 / 200.0);
    }

    let positions = sim.positions();
    assert_eq!(positions.len(), 2_000);
    assert!(positions.iter().all(|v| v.is_finite()));
}
