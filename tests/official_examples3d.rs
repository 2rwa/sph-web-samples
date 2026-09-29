use sph_web_samples::OfficialExample3dSimulation;

fn assert_xyz(sim: &OfficialExample3dSimulation, expected: usize, mode: &str) {
    assert_eq!(sim.particle_count(), expected, "{mode}");
    assert!(sim.fluid_count() >= 1, "{mode}");
    let mut counted = 0usize;
    for i in 0..sim.fluid_count() {
        let positions = sim.fluid_positions(i);
        assert_eq!(positions.len() % 3, 0, "{mode} fluid {i}");
        assert!(positions.iter().all(|v| v.is_finite()), "{mode} fluid {i}");
        counted += positions.len() / 3;
    }
    assert_eq!(counted, expected, "{mode}");
}

#[test]
fn official_3d_basic_contract() {
    let mut sim = OfficialExample3dSimulation::new("basic");
    assert_xyz(&sim, 15 * 15 * 15, "basic");
    assert!(!sim.boundary_positions().is_empty());
    sim.step(1.0 / 200.0);
}

#[test]
fn official_3d_custom_forces_contract() {
    let mut sim = OfficialExample3dSimulation::new("custom-forces");
    assert_xyz(&sim, 10 * 10 * 10, "custom-forces");
    sim.step(1.0 / 200.0);
}

#[test]
fn official_3d_elasticity_contract() {
    let mut sim = OfficialExample3dSimulation::new("elasticity");
    assert_xyz(&sim, 2 * 12 * 6 * 12, "elasticity");
    sim.step(1.0 / 200.0);
}

#[test]
fn official_3d_faucet_emits_particles() {
    let mut sim = OfficialExample3dSimulation::new("faucet");
    assert_xyz(&sim, 0, "faucet");

    for _ in 0..13 {
        sim.step(1.0 / 200.0);
    }

    assert_eq!(sim.particle_count(), 100);
    assert_eq!(sim.fluid_positions(0).len(), 300);
}

#[test]
fn official_3d_heightfield_contract() {
    let mut sim = OfficialExample3dSimulation::new("heightfield");
    assert_xyz(&sim, 15 * 15 * 15, "heightfield");
    assert!(!sim.boundary_positions().is_empty());
    sim.step(1.0 / 200.0);
}

#[test]
fn official_3d_surface_tension_contract() {
    let mut sim = OfficialExample3dSimulation::new("surface-tension");
    assert_xyz(&sim, 7 * 7 * 7, "surface-tension");
    sim.step(1.0 / 200.0);
}

#[test]
fn official_3d_modes_report_expected_names() {
    assert_eq!(OfficialExample3dSimulation::new("basic").example_name(), "Basic");
    assert_eq!(OfficialExample3dSimulation::new("custom-forces").example_name(), "Custom forces");
    assert_eq!(OfficialExample3dSimulation::new("elasticity").example_name(), "Elasticity");
    assert_eq!(OfficialExample3dSimulation::new("faucet").example_name(), "Faucet");
    assert_eq!(OfficialExample3dSimulation::new("heightfield").example_name(), "Height field");
    assert_eq!(OfficialExample3dSimulation::new("surface-tension").example_name(), "Surface tension");
}
