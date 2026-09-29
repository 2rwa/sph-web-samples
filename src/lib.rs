use nalgebra::Vector2;
use salva2d::object::interaction_groups::InteractionGroups;
use salva2d::object::{Boundary, BoundaryHandle, Fluid, FluidHandle};
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

const INTERACTIVE_PARTICLE_RADIUS: f32 = 0.02;
const INTERACTIVE_MIN_PARTICLES: usize = 1_000;
const INTERACTIVE_MAX_PARTICLES: usize = 5_000;
const INTERACTIVE_HALF_WIDTH: f32 = 1.80;
const INTERACTIVE_HALF_HEIGHT: f32 = 1.35;

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
        fluid_particle_count(&self.world, self.fluid)
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
        fluid_particle_count(&self.world, self.fluid)
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

#[wasm_bindgen]
pub struct InteractiveSimulation {
    world: LiquidWorld,
    fluid: FluidHandle,
    obstacle_handles: Vec<BoundaryHandle>,
    obstacle_point_sets: Vec<Vec<Vector2<f32>>>,
}

#[wasm_bindgen]
impl InteractiveSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let spacing = INTERACTIVE_PARTICLE_RADIUS * 2.0;
        let solver: IISPHSolver = IISPHSolver::new();
        let mut world = LiquidWorld::new(
            solver,
            INTERACTIVE_PARTICLE_RADIUS,
            SMOOTHING_FACTOR,
            1.0,
        );

        let fluid = Fluid::new(
            interactive_particles(INTERACTIVE_MIN_PARTICLES),
            INTERACTIVE_PARTICLE_RADIUS,
            1.0,
            InteractionGroups::default(),
        );
        let fluid = world.add_fluid(fluid);

        world.add_boundary(Boundary::new(
            rectangular_boundary(
                INTERACTIVE_HALF_WIDTH,
                INTERACTIVE_HALF_HEIGHT,
                spacing,
            ),
            InteractionGroups::default(),
        ));

        Self {
            world,
            fluid,
            obstacle_handles: Vec::new(),
            obstacle_point_sets: Vec::new(),
        }
    }

    pub fn particle_count(&self) -> usize {
        fluid_particle_count(&self.world, self.fluid)
    }

    pub fn obstacle_count(&self) -> usize {
        self.obstacle_handles.len()
    }

    pub fn reset_particles(&mut self, particle_count: usize) -> usize {
        let particle_count = particle_count.clamp(
            INTERACTIVE_MIN_PARTICLES,
            INTERACTIVE_MAX_PARTICLES,
        );

        let _ = self.world.remove_fluid(self.fluid);
        let fluid = Fluid::new(
            interactive_particles(particle_count),
            INTERACTIVE_PARTICLE_RADIUS,
            1.0,
            InteractionGroups::default(),
        );
        self.fluid = self.world.add_fluid(fluid);

        particle_count
    }

    pub fn step(&mut self, dt: f32) {
        step_world(&mut self.world, dt);
    }

    pub fn positions(&self) -> Vec<f32> {
        flattened_positions(&self.world, self.fluid)
    }

    pub fn obstacle_points(&self) -> Vec<f32> {
        let point_count: usize = self.obstacle_point_sets.iter().map(Vec::len).sum();
        let mut out = Vec::with_capacity(point_count * 2);
        for points in &self.obstacle_point_sets {
            for p in points {
                out.push(p.x);
                out.push(p.y);
            }
        }
        out
    }

    pub fn half_width(&self) -> f32 {
        INTERACTIVE_HALF_WIDTH
    }

    pub fn half_height(&self) -> f32 {
        INTERACTIVE_HALF_HEIGHT
    }

    pub fn add_circle_obstacle(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite()
            || !y.is_finite()
            || !radius.is_finite()
            || radius < INTERACTIVE_PARTICLE_RADIUS * 2.0
        {
            return false;
        }

        let spacing = INTERACTIVE_PARTICLE_RADIUS * 2.0;
        let points = circle_boundary_points(Vector2::new(x, y), radius, spacing);
        self.add_obstacle_points(points)
    }

    pub fn add_box_obstacle(
        &mut self,
        x: f32,
        y: f32,
        half_width: f32,
        half_height: f32,
    ) -> bool {
        if !x.is_finite()
            || !y.is_finite()
            || !half_width.is_finite()
            || !half_height.is_finite()
            || half_width < INTERACTIVE_PARTICLE_RADIUS * 2.0
            || half_height < INTERACTIVE_PARTICLE_RADIUS * 2.0
        {
            return false;
        }

        let spacing = INTERACTIVE_PARTICLE_RADIUS * 2.0;
        let points = offset_rectangular_boundary(
            Vector2::new(x, y),
            half_width,
            half_height,
            spacing,
        );
        self.add_obstacle_points(points)
    }

    pub fn add_line_obstacle(&mut self, x0: f32, y0: f32, x1: f32, y1: f32) -> bool {
        if ![x0, y0, x1, y1].iter().all(|v| v.is_finite()) {
            return false;
        }

        let a = Vector2::new(x0, y0);
        let b = Vector2::new(x1, y1);
        let spacing = INTERACTIVE_PARTICLE_RADIUS * 2.0;
        if (b - a).norm() < spacing {
            return false;
        }

        self.add_obstacle_points(layered_line_points(a, b, spacing))
    }

    #[wasm_bindgen(js_name = add_polyline_obstacle)]
    pub fn add_polyline_obstacle_wasm(&mut self, flat_points: Box<[f32]>) -> bool {
        self.add_polyline_obstacle(flat_points.into_vec())
    }

    pub fn clear_obstacles(&mut self) {
        for handle in self.obstacle_handles.drain(..) {
            let _ = self.world.remove_boundary(handle);
        }
        self.obstacle_point_sets.clear();
    }
}

impl InteractiveSimulation {
    pub fn add_polyline_obstacle(&mut self, flat_points: Vec<f32>) -> bool {
        if flat_points.len() < 4
            || flat_points.len() % 2 != 0
            || !flat_points.iter().all(|v| v.is_finite())
        {
            return false;
        }

        let path: Vec<_> = flat_points
            .chunks_exact(2)
            .map(|xy| Vector2::new(xy[0], xy[1]))
            .collect();

        let spacing = INTERACTIVE_PARTICLE_RADIUS * 2.0;
        let mut points = Vec::new();
        for segment in path.windows(2) {
            let a = segment[0];
            let b = segment[1];
            if (b - a).norm() >= spacing * 0.5 {
                points.extend(layered_line_points(a, b, spacing));
            }
        }

        self.add_obstacle_points(points)
    }

    fn add_obstacle_points(&mut self, points: Vec<Vector2<f32>>) -> bool {
        if points.len() < 2 {
            return false;
        }

        let handle = self.world.add_boundary(Boundary::new(
            points.clone(),
            InteractionGroups::default(),
        ));
        self.obstacle_handles.push(handle);
        self.obstacle_point_sets.push(points);
        true
    }
}

impl Default for InteractiveSimulation {
    fn default() -> Self {
        Self::new()
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

fn fluid_particle_count(world: &LiquidWorld, fluid: FluidHandle) -> usize {
    world
        .fluids()
        .get(fluid)
        .map(Fluid::num_particles)
        .unwrap_or(0)
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

fn interactive_particles(particle_count: usize) -> Vec<Vector2<f32>> {
    let spacing = INTERACTIVE_PARTICLE_RADIUS * 2.0;
    let columns = ((particle_count as f32 * 4.0 / 3.0).sqrt().ceil() as usize).max(1);
    let rows = particle_count.div_ceil(columns);
    let width = columns.saturating_sub(1) as f32 * spacing;
    let height = rows.saturating_sub(1) as f32 * spacing;
    let left = -width * 0.5;
    let bottom = 0.05 - height * 0.5;

    let mut particles = Vec::with_capacity(particle_count);
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
    offset_rectangular_boundary(Vector2::new(0.0, 0.0), half_width, half_height, spacing)
}

fn offset_rectangular_boundary(
    center: Vector2<f32>,
    half_width: f32,
    half_height: f32,
    spacing: f32,
) -> Vec<Vector2<f32>> {
    let mut points = Vec::new();

    for layer in 0..2 {
        let offset = layer as f32 * spacing;
        let left = center.x - half_width - offset;
        let right = center.x + half_width + offset;
        let bottom = center.y - half_height - offset;
        let top = center.y + half_height + offset;

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

fn circle_boundary_points(
    center: Vector2<f32>,
    radius: f32,
    spacing: f32,
) -> Vec<Vector2<f32>> {
    let mut points = Vec::new();

    for layer in 0..2 {
        let r = radius + layer as f32 * spacing;
        let circumference = std::f32::consts::TAU * r;
        let count = ((circumference / spacing).ceil() as usize).max(12);
        for i in 0..count {
            let angle = std::f32::consts::TAU * i as f32 / count as f32;
            points.push(center + Vector2::new(angle.cos(), angle.sin()) * r);
        }
    }

    points
}

fn layered_line_points(
    a: Vector2<f32>,
    b: Vector2<f32>,
    spacing: f32,
) -> Vec<Vector2<f32>> {
    let delta = b - a;
    let length = delta.norm();
    if length <= f32::EPSILON {
        return Vec::new();
    }

    let tangent = delta / length;
    let normal = Vector2::new(-tangent.y, tangent.x);
    let steps = ((length / spacing).ceil() as usize).max(1);
    let mut points = Vec::with_capacity((steps + 1) * 2);

    for offset in [-spacing * 0.5, spacing * 0.5] {
        for i in 0..=steps {
            let t = i as f32 / steps as f32;
            points.push(a + delta * t + normal * offset);
        }
    }

    points
}
