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
