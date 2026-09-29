use sph_web_samples::BenchmarkSimulation;

#[test]
fn benchmark_defaults_to_one_hundred_particles() {
    let sim = BenchmarkSimulation::new(100);
    assert_eq!(sim.particle_count(), 100);
    assert_eq!(sim.positions().len(), 200);
}

#[test]
fn benchmark_clamps_particle_count_to_supported_range() {
    let low = BenchmarkSimulation::new(1);
    let high = BenchmarkSimulation::new(50_000);

    assert_eq!(low.particle_count(), 100);
    assert_eq!(high.particle_count(), 10_000);
    assert_eq!(high.positions().len(), 20_000);
}

#[test]
fn benchmark_small_case_advances_with_finite_positions() {
    let mut sim = BenchmarkSimulation::new(100);
    let before = sim.positions();

    sim.step(1.0 / 120.0);

    let after = sim.positions();
    assert_eq!(after.len(), before.len());
    assert!(after.iter().all(|v| v.is_finite()));
    assert_ne!(before, after);
}

#[test]
fn benchmark_exposes_positive_view_bounds() {
    let small = BenchmarkSimulation::new(100);
    let large = BenchmarkSimulation::new(10_000);

    assert!(small.half_width() > 0.0);
    assert!(small.half_height() > 0.0);
    assert!(large.half_width() >= small.half_width());
    assert!(large.half_height() >= small.half_height());
}
