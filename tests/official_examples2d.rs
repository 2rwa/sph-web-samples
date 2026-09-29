use sph_web_samples::OfficialExample2dSimulation;

fn assert_mode(mode: &str, expected_fluids: usize, expected_particles: usize) {
    let mut sim = OfficialExample2dSimulation::new(mode);
    assert_eq!(sim.fluid_count(), expected_fluids, "{mode}");
    assert_eq!(sim.particle_count(), expected_particles, "{mode}");

    let mut counted = 0usize;
    for i in 0..sim.fluid_count() {
        let positions = sim.fluid_positions(i);
        assert_eq!(positions.len() % 2, 0, "{mode} fluid {i}");
        assert!(positions.iter().all(|v| v.is_finite()), "{mode} fluid {i}");
        counted += positions.len() / 2;
    }
    assert_eq!(counted, expected_particles, "{mode}");

    for _ in 0..3 {
        sim.step(1.0 / 200.0);
    }
    for i in 0..sim.fluid_count() {
        assert!(
            sim.fluid_positions(i).iter().all(|v| v.is_finite()),
            "{mode} fluid {i} after step"
        );
    }
}

#[test]
fn official_basic_web_port_contract() {
    assert_mode("basic", 3, 1_110);
}

#[test]
fn official_custom_forces_web_port_contract() {
    assert_mode("custom-forces", 1, 900);
}

#[test]
fn official_elasticity_web_port_contract() {
    assert_mode("elasticity", 2, 750);
}

#[test]
fn official_layers_web_port_contract() {
    assert_mode("layers", 3, 1_110);
}

#[test]
fn official_surface_tension_web_port_contract() {
    assert_mode("surface-tension", 1, 400);
}

#[test]
fn official_example_unknown_mode_falls_back_to_basic() {
    let sim = OfficialExample2dSimulation::new("does-not-exist");
    assert_eq!(sim.example_name(), "Basic");
    assert_eq!(sim.particle_count(), 1_110);
}
