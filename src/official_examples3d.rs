use nalgebra::{Isometry3, Unit, Vector3};
use rapier3d::dynamics::RigidBodyBuilder;
use rapier3d::geometry::{Array2, ColliderBuilder, SharedShape};
use rapier3d::math::{Pose, Vector as RapierVector};
use rapier3d::pipeline::PhysicsWorld;
use salva3d::integrations::rapier::{ColliderSampling, FluidsPipeline};
use salva3d::object::interaction_groups::InteractionGroups;
use salva3d::object::{Boundary, Fluid, FluidHandle};
use salva3d::solver::{
    Akinci2013SurfaceTension, ArtificialViscosity, Becker2009Elasticity, NonPressureForce,
    XSPHViscosity,
};
use wasm_bindgen::prelude::*;

const SMOOTHING_FACTOR: f32 = 2.0;

#[derive(Clone, Copy)]
enum Example3dKind {
    Basic,
    CustomForces,
    Elasticity,
    Faucet,
    Heightfield,
    SurfaceTension,
}

impl Example3dKind {
    fn from_mode(mode: &str) -> Self {
        match mode {
            "custom-forces" => Self::CustomForces,
            "elasticity" => Self::Elasticity,
            "faucet" => Self::Faucet,
            "heightfield" => Self::Heightfield,
            "surface-tension" => Self::SurfaceTension,
            _ => Self::Basic,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Basic => "Basic",
            Self::CustomForces => "Custom forces",
            Self::Elasticity => "Elasticity",
            Self::Faucet => "Faucet",
            Self::Heightfield => "Height field",
            Self::SurfaceTension => "Surface tension",
        }
    }

    fn camera(self) -> (Vector3<f32>, f32) {
        match self {
            Self::Basic => (Vector3::new(0.0, 0.7, 0.0), 6.0),
            Self::CustomForces => (Vector3::zeros(), 3.2),
            Self::Elasticity => (Vector3::new(0.0, 0.75, 0.0), 3.0),
            Self::Faucet => (Vector3::new(0.0, 0.0, 0.0), 2.2),
            Self::Heightfield => (Vector3::new(0.0, 2.0, 0.0), 16.0),
            Self::SurfaceTension => (Vector3::new(0.0, 0.05, 0.0), 0.45),
        }
    }
}

#[wasm_bindgen]
pub struct OfficialExample3dSimulation {
    world: PhysicsWorld,
    fluids: FluidsPipeline,
    fluid_handles: Vec<FluidHandle>,
    static_boundary_points: Vec<Vector3<f32>>,
    kind: Example3dKind,
    time: f32,
    last_emit: f32,
}

#[wasm_bindgen]
impl OfficialExample3dSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new(mode: &str) -> Self {
        let kind = Example3dKind::from_mode(mode);
        let (world, fluids, fluid_handles, static_boundary_points) = match kind {
            Example3dKind::Basic => build_basic(),
            Example3dKind::CustomForces => build_custom_forces(),
            Example3dKind::Elasticity => build_elasticity(),
            Example3dKind::Faucet => build_faucet(),
            Example3dKind::Heightfield => build_heightfield(),
            Example3dKind::SurfaceTension => build_surface_tension(),
        };

        Self {
            world,
            fluids,
            fluid_handles,
            static_boundary_points,
            kind,
            time: 0.0,
            last_emit: 0.0,
        }
    }

    pub fn example_name(&self) -> String {
        self.kind.name().to_owned()
    }

    pub fn fluid_count(&self) -> usize {
        self.fluid_handles.len()
    }

    pub fn particle_count(&self) -> usize {
        self.fluid_handles
            .iter()
            .map(|handle| {
                self.fluids
                    .liquid_world
                    .fluids()
                    .get(*handle)
                    .map(Fluid::num_particles)
                    .unwrap_or(0)
            })
            .sum()
    }

    pub fn fluid_positions(&self, index: usize) -> Vec<f32> {
        let Some(handle) = self.fluid_handles.get(index).copied() else {
            return Vec::new();
        };
        let Some(fluid) = self.fluids.liquid_world.fluids().get(handle) else {
            return Vec::new();
        };

        let mut out = Vec::with_capacity(fluid.positions.len() * 3);
        for p in &fluid.positions {
            out.extend_from_slice(&[p.x, p.y, p.z]);
        }
        out
    }

    pub fn fluid_velocities(&self, index: usize) -> Vec<f32> {
        let Some(handle) = self.fluid_handles.get(index).copied() else {
            return Vec::new();
        };
        let Some(fluid) = self.fluids.liquid_world.fluids().get(handle) else {
            return Vec::new();
        };

        let mut out = Vec::with_capacity(fluid.velocities.len() * 3);
        for v in &fluid.velocities {
            out.extend_from_slice(&[v.x, v.y, v.z]);
        }
        out
    }

    pub fn boundary_positions(&self) -> Vec<f32> {
        if !self.static_boundary_points.is_empty() {
            let mut out = Vec::with_capacity(self.static_boundary_points.len() * 3);
            for p in &self.static_boundary_points {
                out.extend_from_slice(&[p.x, p.y, p.z]);
            }
            return out;
        }

        let count: usize = self
            .fluids
            .liquid_world
            .boundaries()
            .iter()
            .map(|(_, boundary)| boundary.positions.len())
            .sum();
        let mut out = Vec::with_capacity(count * 3);
        for (_, boundary) in self.fluids.liquid_world.boundaries().iter() {
            for p in &boundary.positions {
                out.extend_from_slice(&[p.x, p.y, p.z]);
            }
        }
        out
    }

    pub fn step(&mut self, dt: f32) {
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }

        let dt = dt.clamp(1.0 / 1000.0, 1.0 / 60.0);
        self.world.integration_parameters.dt = dt;
        self.world.step();
        self.fluids.step(
            &self.world.gravity,
            dt,
            &self.world.colliders,
            &mut self.world.bodies,
        );

        if matches!(self.kind, Example3dKind::Faucet) {
            self.time += dt;
            self.update_faucet();
        }
    }

    pub fn view_center_x(&self) -> f32 {
        self.kind.camera().0.x
    }

    pub fn view_center_y(&self) -> f32 {
        self.kind.camera().0.y
    }

    pub fn view_center_z(&self) -> f32 {
        self.kind.camera().0.z
    }

    pub fn view_distance(&self) -> f32 {
        self.kind.camera().1
    }
}

impl OfficialExample3dSimulation {
    fn update_faucet(&mut self) {
        let Some(handle) = self.fluid_handles.first().copied() else {
            return;
        };
        let Some(fluid) = self.fluids.liquid_world.fluids_mut().get_mut(handle) else {
            return;
        };

        for i in 0..fluid.num_particles() {
            if fluid.positions[i].y < -2.0 {
                fluid.delete_particle_at_next_timestep(i);
            }
        }

        if self.time - self.last_emit >= 0.06 {
            self.last_emit = self.time;
            let particle_radius = 0.025 / 2.0;
            let diam = particle_radius * 2.0;
            let nparticles = 10usize;
            let shift = -(nparticles as f32) * particle_radius;
            let mut particles = Vec::with_capacity(nparticles * nparticles);
            let mut velocities = Vec::with_capacity(nparticles * nparticles);

            for i in 0..nparticles {
                for j in 0..nparticles {
                    particles.push(
                        Vector3::new(i as f32 * diam, 0.6, j as f32 * diam)
                            + Vector3::new(shift, 0.0, shift),
                    );
                    velocities.push(Vector3::zeros());
                }
            }

            fluid.add_particles(&particles, Some(&velocities));
        }
    }
}

fn cube_fluid(
    ni: usize,
    nj: usize,
    nk: usize,
    particle_radius: f32,
    density: f32,
) -> Fluid {
    let half_extents = Vector3::new(ni as f32, nj as f32, nk as f32) * particle_radius;
    let mut points = Vec::with_capacity(ni * nj * nk);

    for i in 0..ni {
        for j in 0..nj {
            for k in 0..nk {
                let p = Vector3::new(
                    i as f32 * particle_radius * 2.0,
                    j as f32 * particle_radius * 2.0,
                    k as f32 * particle_radius * 2.0,
                ) + Vector3::repeat(particle_radius)
                    - half_extents;
                points.push(p);
            }
        }
    }

    Fluid::new(
        points,
        particle_radius,
        density,
        InteractionGroups::default(),
    )
}

fn transform_samples(
    samples: &[Vector3<f32>],
    pose: &Pose,
) -> Vec<Vector3<f32>> {
    samples.iter().map(|p| pose * *p).collect()
}

fn sample_shape(
    shape: &dyn rapier3d::parry::shape::Shape,
    radius: f32,
) -> Vec<Vector3<f32>> {
    salva3d::sampling::shape_surface_ray_sample(shape, radius).unwrap_or_default()
}

fn build_basic() -> (
    PhysicsWorld,
    FluidsPipeline,
    Vec<FluidHandle>,
    Vec<Vector3<f32>>,
) {
    let particle_radius = 0.05;
    let mut world = PhysicsWorld::new();
    world.gravity = RapierVector::Y * -9.81;
    world.integration_parameters.dt = 1.0 / 200.0;
    let mut fluids = FluidsPipeline::new(particle_radius, SMOOTHING_FACTOR);

    let ground_thickness = 0.2;
    let ground_half_width = 2.5;
    let ground_half_height = 0.7;

    let mut fluid = cube_fluid(15, 15, 15, particle_radius, 1000.0);
    fluid.transform_by(&Isometry3::translation(
        0.0,
        ground_thickness + 15.0 * particle_radius,
        0.0,
    ));
    fluid
        .nonpressure_forces
        .push(Box::new(ArtificialViscosity::new(1.0, 0.0)));
    let fluid_handle = fluids.liquid_world.add_fluid(fluid);

    let ground_shape =
        SharedShape::cuboid(ground_half_width, ground_thickness, ground_half_width);
    let wall_shape =
        SharedShape::cuboid(ground_thickness, ground_half_height, ground_half_width);
    let ground_body = world.bodies.insert(RigidBodyBuilder::fixed().build());

    let wall_poses = [
        Pose::new(
            RapierVector::new(0.0, ground_half_height, ground_half_width),
            RapierVector::Y * (std::f32::consts::PI / 2.0),
        ),
        Pose::new(
            RapierVector::new(0.0, ground_half_height, -ground_half_width),
            RapierVector::Y * (std::f32::consts::PI / 2.0),
        ),
        Pose::from_translation(RapierVector::new(
            ground_half_width,
            ground_half_height,
            0.0,
        )),
        Pose::from_translation(RapierVector::new(
            -ground_half_width,
            ground_half_height,
            0.0,
        )),
    ];

    let mut visual = Vec::new();

    for pose in wall_poses {
        let samples = sample_shape(&*wall_shape, particle_radius);
        visual.extend(transform_samples(&samples, &pose));
        let collider = ColliderBuilder::new(wall_shape.clone()).position(pose).build();
        let collider_handle = world
            .colliders
            .insert_with_parent(collider, ground_body, &mut world.bodies);
        let boundary_handle = fluids.liquid_world.add_boundary(Boundary::new(
            Vec::new(),
            InteractionGroups::default(),
        ));
        fluids.coupling.register_coupling(
            boundary_handle,
            collider_handle,
            ColliderSampling::StaticSampling(samples),
        );
    }

    let samples = sample_shape(&*ground_shape, particle_radius);
    visual.extend(samples.iter().copied());
    let collider = ColliderBuilder::new(ground_shape).build();
    let collider_handle = world
        .colliders
        .insert_with_parent(collider, ground_body, &mut world.bodies);
    let boundary_handle = fluids.liquid_world.add_boundary(Boundary::new(
        Vec::new(),
        InteractionGroups::default(),
    ));
    fluids.coupling.register_coupling(
        boundary_handle,
        collider_handle,
        ColliderSampling::StaticSampling(samples),
    );

    (world, fluids, vec![fluid_handle], visual)
}

struct CustomForceField {
    origin: Vector3<f32>,
}

impl NonPressureForce for CustomForceField {
    fn solve(
        &mut self,
        _timestep: &salva3d::TimestepManager,
        _kernel_radius: f32,
        _fluid_fluid_contacts: &salva3d::geometry::ParticlesContacts,
        _fluid_boundaries_contacts: &salva3d::geometry::ParticlesContacts,
        fluid: &mut Fluid,
        _boundaries: &[Boundary],
        _densities: &[f32],
    ) {
        for (pos, acc) in fluid.positions.iter().zip(fluid.accelerations.iter_mut()) {
            if let Some((dir, dist)) = Unit::try_new_and_get(self.origin - pos, 0.1) {
                *acc += *dir / dist;
            }
        }
    }

    fn apply_permutation(&mut self, _permutation: &[usize]) {}
}

fn build_custom_forces() -> (
    PhysicsWorld,
    FluidsPipeline,
    Vec<FluidHandle>,
    Vec<Vector3<f32>>,
) {
    let particle_radius = 0.025;
    let mut world = PhysicsWorld::new();
    world.gravity = RapierVector::ZERO;
    world.integration_parameters.dt = 1.0 / 200.0;
    let mut fluids = FluidsPipeline::new(particle_radius, SMOOTHING_FACTOR);

    let mut fluid = cube_fluid(10, 10, 10, particle_radius, 1000.0);
    fluid.nonpressure_forces.push(Box::new(CustomForceField {
        origin: Vector3::new(1.0, 0.0, 0.0),
    }));
    fluid.nonpressure_forces.push(Box::new(CustomForceField {
        origin: Vector3::new(-1.0, 0.0, 0.0),
    }));
    let handle = fluids.liquid_world.add_fluid(fluid);

    (world, fluids, vec![handle], Vec::new())
}

fn build_elasticity() -> (
    PhysicsWorld,
    FluidsPipeline,
    Vec<FluidHandle>,
    Vec<Vector3<f32>>,
) {
    let particle_radius = 0.025;
    let mut world = PhysicsWorld::new();
    world.gravity = RapierVector::Y * -9.81;
    world.integration_parameters.dt = 1.0 / 200.0;
    let mut fluids = FluidsPipeline::new(particle_radius, SMOOTHING_FACTOR);

    let ground_thickness = 0.2;
    let ground_half_width = 1.5;
    let height = 0.4;
    let nparticles = 6usize;

    let viscosity = XSPHViscosity::new(0.5, 1.0);
    let mut fluid1 = cube_fluid(
        nparticles * 2,
        nparticles,
        nparticles * 2,
        particle_radius,
        1000.0,
    );
    fluid1.transform_by(&Isometry3::translation(
        0.0,
        ground_thickness + particle_radius * nparticles as f32 + height,
        0.0,
    ));
    let elasticity1: Becker2009Elasticity =
        Becker2009Elasticity::new(500_000.0, 0.3, true);
    fluid1.nonpressure_forces.push(Box::new(elasticity1));
    fluid1
        .nonpressure_forces
        .push(Box::new(viscosity.clone()));
    let handle1 = fluids.liquid_world.add_fluid(fluid1);

    let mut fluid2 = cube_fluid(
        nparticles * 2,
        nparticles,
        nparticles * 2,
        particle_radius,
        1000.0,
    );
    fluid2.transform_by(&Isometry3::translation(
        0.0,
        ground_thickness + particle_radius * nparticles as f32 * 4.0 + height,
        0.0,
    ));
    let elasticity2: Becker2009Elasticity =
        Becker2009Elasticity::new(100_000.0, 0.3, true);
    fluid2.nonpressure_forces.push(Box::new(elasticity2));
    fluid2.nonpressure_forces.push(Box::new(viscosity));
    let handle2 = fluids.liquid_world.add_fluid(fluid2);

    let ground_body = world.bodies.insert(RigidBodyBuilder::fixed().build());
    let collider =
        ColliderBuilder::cuboid(ground_half_width, ground_thickness, ground_half_width)
            .build();
    let visual = sample_shape(collider.shape(), particle_radius);
    let collider_handle = world
        .colliders
        .insert_with_parent(collider, ground_body, &mut world.bodies);
    let boundary_handle = fluids.liquid_world.add_boundary(Boundary::new(
        Vec::new(),
        InteractionGroups::default(),
    ));
    fluids.coupling.register_coupling(
        boundary_handle,
        collider_handle,
        ColliderSampling::DynamicContactSampling,
    );

    (world, fluids, vec![handle1, handle2], visual)
}

fn build_faucet() -> (
    PhysicsWorld,
    FluidsPipeline,
    Vec<FluidHandle>,
    Vec<Vector3<f32>>,
) {
    let particle_radius = 0.025 / 2.0;
    let mut world = PhysicsWorld::new();
    world.gravity = RapierVector::Y * -9.81;
    world.integration_parameters.dt = 1.0 / 200.0;
    let mut fluids = FluidsPipeline::new(particle_radius, SMOOTHING_FACTOR);

    let mut fluid = Fluid::new(
        Vec::new(),
        particle_radius,
        1000.0,
        InteractionGroups::default(),
    );
    fluid
        .nonpressure_forces
        .push(Box::new(XSPHViscosity::new(0.5, 0.0)));
    fluid
        .nonpressure_forces
        .push(Box::new(Akinci2013SurfaceTension::new(1.0, 10.0)));
    let handle = fluids.liquid_world.add_fluid(fluid);

    let ground_body = world.bodies.insert(RigidBodyBuilder::fixed().build());
    let collider = ColliderBuilder::ball(0.15).build();
    let samples = sample_shape(collider.shape(), particle_radius);
    let visual = samples.clone();
    let collider_handle = world
        .colliders
        .insert_with_parent(collider, ground_body, &mut world.bodies);
    let boundary_handle = fluids.liquid_world.add_boundary(Boundary::new(
        Vec::new(),
        InteractionGroups::default(),
    ));
    fluids.coupling.register_coupling(
        boundary_handle,
        collider_handle,
        ColliderSampling::StaticSampling(samples),
    );

    (world, fluids, vec![handle], visual)
}

fn build_heightfield() -> (
    PhysicsWorld,
    FluidsPipeline,
    Vec<FluidHandle>,
    Vec<Vector3<f32>>,
) {
    let particle_radius = 0.15;
    let mut world = PhysicsWorld::new();
    world.gravity = RapierVector::Y * -9.81;
    world.integration_parameters.dt = 1.0 / 200.0;
    let mut fluids = FluidsPipeline::new(particle_radius, SMOOTHING_FACTOR);

    let mut fluid = cube_fluid(15, 15, 15, particle_radius, 1000.0);
    fluid.transform_by(&Isometry3::translation(
        0.0,
        1.0 + 15.0 * particle_radius * 2.0,
        0.0,
    ));
    fluid
        .nonpressure_forces
        .push(Box::new(ArtificialViscosity::new(1.0, 0.0)));
    fluid.velocities = vec![-Vector3::y() * 10.0; fluid.velocities.len()];
    let handle = fluids.liquid_world.add_fluid(fluid);

    let ground_size = RapierVector::new(12.0, 1.0, 12.0);
    let nsubdivs = 40usize;
    let values: Vec<f32> = (0..=nsubdivs)
        .flat_map(|j| {
            (0..=nsubdivs).map(move |i| {
                if i == 0 || i == nsubdivs || j == 0 || j == nsubdivs {
                    3.0
                } else {
                    let x = i as f32 * ground_size.x / nsubdivs as f32;
                    let z = j as f32 * ground_size.z / nsubdivs as f32;
                    x.sin() + z.cos()
                }
            })
        })
        .collect();
    let heights = Array2::new(nsubdivs + 1, nsubdivs + 1, values);

    let ground_body = world.bodies.insert(RigidBodyBuilder::fixed().build());
    let collider = ColliderBuilder::heightfield(heights, ground_size).build();
    let samples = sample_shape(collider.shape(), particle_radius / 1.5);
    let visual = samples.clone();
    let collider_handle = world
        .colliders
        .insert_with_parent(collider, ground_body, &mut world.bodies);
    let boundary_handle = fluids.liquid_world.add_boundary(Boundary::new(
        Vec::new(),
        InteractionGroups::default(),
    ));
    fluids.coupling.register_coupling(
        boundary_handle,
        collider_handle,
        ColliderSampling::StaticSampling(samples),
    );

    (world, fluids, vec![handle], visual)
}

fn build_surface_tension() -> (
    PhysicsWorld,
    FluidsPipeline,
    Vec<FluidHandle>,
    Vec<Vector3<f32>>,
) {
    let particle_radius = 0.005;
    let mut world = PhysicsWorld::new();
    world.gravity = RapierVector::Y * -0.981;
    world.integration_parameters.dt = 1.0 / 200.0;
    let mut fluids = FluidsPipeline::new(particle_radius, SMOOTHING_FACTOR);

    let mut fluid = cube_fluid(7, 7, 7, particle_radius, 1000.0);
    fluid.transform_by(&Isometry3::translation(0.0, 0.08, 0.0));
    fluid
        .nonpressure_forces
        .push(Box::new(Akinci2013SurfaceTension::new(1.0, 0.0)));
    fluid
        .nonpressure_forces
        .push(Box::new(ArtificialViscosity::new(0.01, 0.01)));
    let handle = fluids.liquid_world.add_fluid(fluid);

    let ground_body = world.bodies.insert(RigidBodyBuilder::fixed().build());
    let collider = ColliderBuilder::cuboid(0.15, 0.02, 0.15).build();
    let visual = sample_shape(collider.shape(), particle_radius);
    let collider_handle = world
        .colliders
        .insert_with_parent(collider, ground_body, &mut world.bodies);
    let boundary_handle = fluids.liquid_world.add_boundary(Boundary::new(
        Vec::new(),
        InteractionGroups::default(),
    ));
    fluids.coupling.register_coupling(
        boundary_handle,
        collider_handle,
        ColliderSampling::DynamicContactSampling,
    );

    (world, fluids, vec![handle], visual)
}
