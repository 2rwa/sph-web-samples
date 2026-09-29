use sph_web_samples::RapierCoupledSimulation;

fn assert_mode(mode: &str, bodies: usize) {
    let mut sim = RapierCoupledSimulation::new(mode);
    assert_eq!(sim.particle_count(), 1_110, "{mode}");
    assert_eq!(sim.rigid_body_count(), bodies, "{mode}");
    assert_eq!(sim.rigid_body_states().len(), bodies * 8, "{mode}");
    assert!(sim.fluid_positions(0).iter().all(|v| v.is_finite()), "{mode}");
    assert!(sim.boundary_positions().iter().all(|v| v.is_finite()), "{mode}");

    let before = sim.rigid_body_states();
    for _ in 0..4 {
        sim.step(1.0 / 200.0);
    }
    let after = sim.rigid_body_states();
    assert!(after.iter().all(|v| v.is_finite()), "{mode}");
    assert_ne!(before, after, "{mode} rigid bodies should advance");
}

#[test]
fn upstream_basic_coupling_contract() {
    assert_mode("upstream-basic", 3);
}

#[test]
fn light_floaters_coupling_contract() {
    assert_mode("light-floaters", 3);
}

#[test]
fn heavy_sinkers_coupling_contract() {
    assert_mode("heavy-sinkers", 3);
}

#[test]
fn layers_filtered_coupling_contract() {
    assert_mode("layers-filtered", 3);
}

#[test]
fn mixed_body_rain_coupling_contract() {
    assert_mode("mixed-body-rain", 9);
}

#[test]
fn coupled_modes_report_expected_names() {
    assert_eq!(RapierCoupledSimulation::new("upstream-basic").variant_name(), "Upstream Basic");
    assert_eq!(RapierCoupledSimulation::new("light-floaters").variant_name(), "Light floaters");
    assert_eq!(RapierCoupledSimulation::new("heavy-sinkers").variant_name(), "Heavy sinkers");
    assert_eq!(RapierCoupledSimulation::new("layers-filtered").variant_name(), "Layers filtered");
    assert_eq!(RapierCoupledSimulation::new("mixed-body-rain").variant_name(), "Mixed body rain");
}
