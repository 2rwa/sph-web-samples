use nalgebra::Vector2;
use salva2d::object::interaction_groups::InteractionGroups;
use salva2d::object::{Boundary, Fluid, FluidHandle};
use salva2d::solver::IISPHSolver;
use salva2d::LiquidWorld;
use wasm_bindgen::prelude::*;

const PARTICLE_RADIUS: f32 = 0.03;
const SMOOTHING_FACTOR: f32 = 2.0;
const PARTICLES_X: usize = 18;
const PARTICLES_Y: usize = 12;

const BENCH_MIN_PARTICLES: usize = 100;
const BENCH_MAX_PARTICLES: usize = 10_000;
const BENCH_PARTICLE_RADIUS: f32 = 0.02;

#[wasm_bindgen]
pub struct Simulation {
    world: LiquidWorld,
    fluid: FluidHandle,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let solver: IISPHSolver = IISPHSolver::new();
        let mut world = LiquidWorld::new(
            solver,
            PARTICLE_RADIUS,
            SMOOTHING_FACTOR,
            1.0,
        );

        let fluid = Fluid::new(
            initial_particles(),
            PARTICLE_RADIUS,
            1.0,
            InteractionGroups::default(),
        );
        let fluid = world.add_fluid(fluid);

        let boundary = Boundary::new(
            container_boundary(),
            InteractionGroups::default(),
        );
        world.add_boundary(boundary);

        Self { world, fluid }
    }

    pub fn particle_count(&self) -> usize {
        self.world
            .fluids()
            .get(self.fluid)
            .map(Fluid::num_particles)
            .unwrap_or(0)
    }

    pub fn step(&mut self, dt: f32) {
        step_world(&mut self.world, dt);
    }

    pub fn positions(&self) -> Vec<f32> {
        flattened_positions(&self.world, self.fluid)
    }
}

impl Default for Simulation {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
pub struct BenchmarkSimulation {
    world: LiquidWorld,
    fluid: FluidHandle,
    half_width: f32,
    half_height: f32,
}

#[wasm_bindgen]
impl BenchmarkSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new(particle_count: usize) -> Self {
        let particle_count = particle_count.clamp(BENCH_MIN_PARTICLES, BENCH_MAX_PARTICLES);
        let spacing = BENCH_PARTICLE_RADIUS * 2.0;

        // A slightly landscape-oriented block keeps the browser view compact.
        let columns = ((particle_count as f32 * 1.5).sqrt().ceil() as usize).max(1);
        let rows = particle_count.div_ceil(columns);

        let fluid_width = columns.saturating_sub(1) as f32 * spacing;
        let fluid_height = rows.saturating_sub(1) as f32 * spacing;
        let half_width = (fluid_width * 0.5 + 0.30).max(0.90);
        let half_height = (fluid_height + 0.80).max(0.90);

        let particles = benchmark_particles(
            particle_count,
            columns,
            spacing,
            fluid_width,
            fluid_height,
        );

        let solver: IISPHSolver = IISPHSolver::new();
        let mut world = LiquidWorld::new(
            solver,
            BENCH_PARTICLE_RADIUS,
            SMOOTHING_FACTOR,
            1.0,
        );

        let fluid = Fluid::new(
            particles,
            BENCH_PARTICLE_RADIUS,
            1.0,
            InteractionGroups::default(),
        );
        let fluid = world.add_fluid(fluid);

        world.add_boundary(Boundary::new(
            rectangular_boundary(half_width, half_height, spacing),
            InteractionGroups::default(),
        ));

        Self {
            world,
            fluid,
            half_width,
            half_height,
        }
    }

    pub fn particle_count(&self) -> usize {
        self.world
            .fluids()
            .get(self.fluid)
            .map(Fluid::num_particles)
            .unwrap_or(0)
    }

    pub fn step(&mut self, dt: f32) {
        step_world(&mut self.world, dt);
    }

    pub fn positions(&self) -> Vec<f32> {
        flattened_positions(&self.world, self.fluid)
    }

    pub fn half_width(&self) -> f32 {
        self.half_width
    }

    pub fn half_height(&self) -> f32 {
        self.half_height
    }
}

fn step_world(world: &mut LiquidWorld, dt: f32) {
    if !dt.is_finite() || dt <= 0.0 {
        return;
    }

    let dt = dt.clamp(1.0 / 1000.0, 1.0 / 60.0);
    let gravity = Vector2::new(0.0, -9.81);
    world.step(dt, &gravity);
}

fn flattened_positions(world: &LiquidWorld, fluid: FluidHandle) -> Vec<f32> {
    let Some(fluid) = world.fluids().get(fluid) else {
        return Vec::new();
    };

    let mut out = Vec::with_capacity(fluid.positions.len() * 2);
    for p in &fluid.positions {
        out.push(p.x);
        out.push(p.y);
    }
    out
}

fn initial_particles() -> Vec<Vector2<f32>> {
    let spacing = PARTICLE_RADIUS * 2.0;
    let mut particles = Vec::with_capacity(PARTICLES_X * PARTICLES_Y);

    for y in 0..PARTICLES_Y {
        for x in 0..PARTICLES_X {
            particles.push(Vector2::new(
                -0.78 + x as f32 * spacing,
                0.02 + y as f32 * spacing,
            ));
        }
    }

    particles
}

fn benchmark_particles(
    particle_count: usize,
    columns: usize,
    spacing: f32,
    fluid_width: f32,
    fluid_height: f32,
) -> Vec<Vector2<f32>> {
    let mut particles = Vec::with_capacity(particle_count);
    let left = -fluid_width * 0.5;
    let bottom = -fluid_height * 0.35;

    for i in 0..particle_count {
        let x = i % columns;
        let y = i / columns;
        particles.push(Vector2::new(
            left + x as f32 * spacing,
            bottom + y as f32 * spacing,
        ));
    }

    particles
}

fn container_boundary() -> Vec<Vector2<f32>> {
    rectangular_boundary(1.0, 0.85, PARTICLE_RADIUS * 2.0)
}

fn rectangular_boundary(half_width: f32, half_height: f32, spacing: f32) -> Vec<Vector2<f32>> {
    let mut points = Vec::new();

    // Two particle layers make the simple static box less prone to leakage.
    for layer in 0..2 {
        let offset = layer as f32 * spacing;
        let left = -half_width - offset;
        let right = half_width + offset;
        let bottom = -half_height - offset;
        let top = half_height + offset;

        let nx = (((right - left) / spacing).ceil() as usize).max(1);
        for i in 0..=nx {
            let t = i as f32 / nx as f32;
            let x = left + (right - left) * t;
            points.push(Vector2::new(x, bottom));
            points.push(Vector2::new(x, top));
        }

        let ny = (((top - bottom) / spacing).ceil() as usize).max(1);
        for i in 0..=ny {
            let t = i as f32 / ny as f32;
            let y = bottom + (top - bottom) * t;
            points.push(Vector2::new(left, y));
            points.push(Vector2::new(right, y));
        }
    }

    points
}
