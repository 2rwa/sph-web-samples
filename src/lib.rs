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
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }

        let dt = dt.clamp(1.0 / 1000.0, 1.0 / 60.0);
        let gravity = Vector2::new(0.0, -9.81);
        self.world.step(dt, &gravity);
    }

    pub fn positions(&self) -> Vec<f32> {
        let Some(fluid) = self.world.fluids().get(self.fluid) else {
            return Vec::new();
        };

        let mut out = Vec::with_capacity(fluid.positions.len() * 2);
        for p in &fluid.positions {
            out.push(p.x);
            out.push(p.y);
        }
        out
    }
}

impl Default for Simulation {
    fn default() -> Self {
        Self::new()
    }
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

fn container_boundary() -> Vec<Vector2<f32>> {
    let spacing = PARTICLE_RADIUS * 2.0;
    let mut points = Vec::new();

    // Two particle layers make the simple static box less prone to leakage.
    for layer in 0..2 {
        let offset = layer as f32 * spacing;
        let left = -1.0 - offset;
        let right = 1.0 + offset;
        let bottom = -0.85 - offset;
        let top = 0.85 + offset;

        let nx = ((right - left) / spacing).ceil() as usize;
        for i in 0..=nx {
            let t = i as f32 / nx as f32;
            let x = left + (right - left) * t;
            points.push(Vector2::new(x, bottom));
            points.push(Vector2::new(x, top));
        }

        let ny = ((top - bottom) / spacing).ceil() as usize;
        for i in 0..=ny {
            let t = i as f32 / ny as f32;
            let y = bottom + (top - bottom) * t;
            points.push(Vector2::new(left, y));
            points.push(Vector2::new(right, y));
        }
    }

    points
}
