use nalgebra::{Vector2, Vector3};
use salva3d::object::interaction_groups::InteractionGroups as InteractionGroups3d;
use salva3d::object::{Boundary as Boundary3d, Fluid as Fluid3d, FluidHandle as FluidHandle3d};
use salva3d::solver::IISPHSolver as IISPHSolver3d;
use salva3d::LiquidWorld as LiquidWorld3d;
use salva2d::object::interaction_groups::{Group, InteractionGroups};
use salva2d::object::{Boundary, BoundaryHandle, Fluid, FluidHandle};
use salva2d::solver::{Akinci2013SurfaceTension, ArtificialViscosity, Becker2009Elasticity, IISPHSolver, NonPressureForce, XSPHViscosity};
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

const PARTICLE3D_RADIUS: f32 = 0.04;
const PARTICLE3D_AXIS: usize = 8;
const FLOOR3D_HALF_EXTENT: f32 = 0.90;
const FLOOR3D_Y: f32 = -0.65;

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


#[wasm_bindgen]
pub struct Simulation3d {
    world: LiquidWorld3d,
    fluid: FluidHandle3d,
}

#[wasm_bindgen]
impl Simulation3d {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let solver: IISPHSolver3d = IISPHSolver3d::new();
        let mut world = LiquidWorld3d::new(
            solver,
            PARTICLE3D_RADIUS,
            SMOOTHING_FACTOR,
            1.0,
        );

        let fluid = Fluid3d::new(
            initial_particles_3d(),
            PARTICLE3D_RADIUS,
            1000.0,
            InteractionGroups3d::default(),
        );
        let fluid = world.add_fluid(fluid);

        world.add_boundary(Boundary3d::new(
            floor_boundary_3d(),
            InteractionGroups3d::default(),
        ));

        Self { world, fluid }
    }

    pub fn particle_count(&self) -> usize {
        self.world
            .fluids()
            .get(self.fluid)
            .map(Fluid3d::num_particles)
            .unwrap_or(0)
    }

    pub fn step(&mut self, dt: f32) {
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }

        let dt = dt.clamp(1.0 / 1000.0, 1.0 / 60.0);
        self.world.step(dt, &Vector3::new(0.0, -9.81, 0.0));
    }

    pub fn positions(&self) -> Vec<f32> {
        let Some(fluid) = self.world.fluids().get(self.fluid) else {
            return Vec::new();
        };

        let mut out = Vec::with_capacity(fluid.positions.len() * 3);
        for p in &fluid.positions {
            out.push(p.x);
            out.push(p.y);
            out.push(p.z);
        }
        out
    }

    pub fn floor_y(&self) -> f32 {
        FLOOR3D_Y
    }

    pub fn floor_half_extent(&self) -> f32 {
        FLOOR3D_HALF_EXTENT
    }
}

impl Default for Simulation3d {
    fn default() -> Self {
        Self::new()
    }
}

fn initial_particles_3d() -> Vec<Vector3<f32>> {
    let spacing = PARTICLE3D_RADIUS * 2.0;
    let extent = (PARTICLE3D_AXIS - 1) as f32 * spacing;
    let left = -extent * 0.5;
    let bottom = -0.15;
    let back = -extent * 0.5;
    let mut particles = Vec::with_capacity(PARTICLE3D_AXIS.pow(3));

    for y in 0..PARTICLE3D_AXIS {
        for x in 0..PARTICLE3D_AXIS {
            for z in 0..PARTICLE3D_AXIS {
                particles.push(Vector3::new(
                    left + x as f32 * spacing,
                    bottom + y as f32 * spacing,
                    back + z as f32 * spacing,
                ));
            }
        }
    }

    particles
}

fn floor_boundary_3d() -> Vec<Vector3<f32>> {
    let spacing = PARTICLE3D_RADIUS * 2.0;
    let side = ((FLOOR3D_HALF_EXTENT * 2.0 / spacing).ceil() as usize).max(1);
    let mut points = Vec::with_capacity((side + 1) * (side + 1) * 2);

    for layer in 0..2 {
        let y = FLOOR3D_Y - layer as f32 * spacing;
        for ix in 0..=side {
            let tx = ix as f32 / side as f32;
            let x = -FLOOR3D_HALF_EXTENT + tx * FLOOR3D_HALF_EXTENT * 2.0;
            for iz in 0..=side {
                let tz = iz as f32 / side as f32;
                let z = -FLOOR3D_HALF_EXTENT + tz * FLOOR3D_HALF_EXTENT * 2.0;
                points.push(Vector3::new(x, y, z));
            }
        }
    }

    points
}


#[derive(Clone, Copy)]
enum OfficialExample2dKind {
    Basic,
    CustomForces,
    Elasticity,
    Layers,
    SurfaceTension,
}

impl OfficialExample2dKind {
    fn from_mode(mode: &str) -> Self {
        match mode {
            "custom-forces" => Self::CustomForces,
            "elasticity" => Self::Elasticity,
            "layers" => Self::Layers,
            "surface-tension" => Self::SurfaceTension,
            _ => Self::Basic,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Basic => "Basic",
            Self::CustomForces => "Custom forces",
            Self::Elasticity => "Elasticity",
            Self::Layers => "Layers",
            Self::SurfaceTension => "Surface tension",
        }
    }

    fn view(self) -> (f32, f32, f32, f32) {
        match self {
            Self::Basic | Self::Layers => (0.0, 5.3, 5.8, 6.1),
            Self::CustomForces => (0.0, 0.0, 1.35, 1.0),
            Self::Elasticity => (0.0, 4.25, 3.4, 4.5),
            Self::SurfaceTension => (0.0, 0.065, 0.18, 0.13),
        }
    }
}

#[wasm_bindgen]
pub struct OfficialExample2dSimulation {
    world: LiquidWorld,
    fluids: Vec<FluidHandle>,
    boundary_points: Vec<Vector2<f32>>,
    gravity: Vector2<f32>,
    kind: OfficialExample2dKind,
}

#[wasm_bindgen]
impl OfficialExample2dSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new(mode: &str) -> Self {
        let kind = OfficialExample2dKind::from_mode(mode);
        let (world, fluids, boundary_points, gravity) = match kind {
            OfficialExample2dKind::Basic => build_official_basic(false),
            OfficialExample2dKind::CustomForces => build_official_custom_forces(),
            OfficialExample2dKind::Elasticity => build_official_elasticity(),
            OfficialExample2dKind::Layers => build_official_basic(true),
            OfficialExample2dKind::SurfaceTension => build_official_surface_tension(),
        };

        Self { world, fluids, boundary_points, gravity, kind }
    }

    pub fn example_name(&self) -> String {
        self.kind.name().to_owned()
    }

    pub fn fluid_count(&self) -> usize {
        self.fluids.len()
    }

    pub fn particle_count(&self) -> usize {
        self.fluids
            .iter()
            .map(|handle| fluid_particle_count(&self.world, *handle))
            .sum()
    }

    pub fn fluid_positions(&self, index: usize) -> Vec<f32> {
        let Some(handle) = self.fluids.get(index).copied() else {
            return Vec::new();
        };
        flattened_positions(&self.world, handle)
    }

    pub fn boundary_positions(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(self.boundary_points.len() * 2);
        for p in &self.boundary_points {
            out.push(p.x);
            out.push(p.y);
        }
        out
    }

    pub fn step(&mut self, dt: f32) {
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }
        let dt = dt.clamp(1.0 / 1000.0, 1.0 / 60.0);
        self.world.step(dt, &self.gravity);
    }

    pub fn view_center_x(&self) -> f32 { self.kind.view().0 }
    pub fn view_center_y(&self) -> f32 { self.kind.view().1 }
    pub fn view_half_width(&self) -> f32 { self.kind.view().2 }
    pub fn view_half_height(&self) -> f32 { self.kind.view().3 }
}

fn new_official_world(particle_radius: f32) -> LiquidWorld {
    let solver: IISPHSolver = IISPHSolver::new();
    LiquidWorld::new(solver, particle_radius, SMOOTHING_FACTOR, 1.0)
}

fn cube_fluid_points(ni: usize, nj: usize, particle_radius: f32) -> Vec<Vector2<f32>> {
    let half_extents = Vector2::new(ni as f32, nj as f32) * particle_radius;
    let mut points = Vec::with_capacity(ni * nj);
    for i in 0..ni {
        for j in 0..nj {
            let x = i as f32 * particle_radius * 2.0;
            let y = j as f32 * particle_radius * 2.0;
            points.push(Vector2::new(x, y) + Vector2::repeat(particle_radius) - half_extents);
        }
    }
    points
}

fn translate_points(points: &mut [Vector2<f32>], dx: f32, dy: f32) {
    for p in points {
        p.x += dx;
        p.y += dy;
    }
}

fn sample_segment_2d(out: &mut Vec<Vector2<f32>>, a: Vector2<f32>, b: Vector2<f32>, spacing: f32) {
    let length = (b - a).norm();
    let steps = ((length / spacing).ceil() as usize).max(1);
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        out.push(a + (b - a) * t);
    }
}

fn official_basin_boundary(particle_radius: f32) -> Vec<Vector2<f32>> {
    let spacing = particle_radius * 1.4;
    let width = 10.0;
    let nsubdivs = 50usize;
    let mut base = Vec::with_capacity(nsubdivs + 1);

    for i in 0..=nsubdivs {
        let t = i as f32 / nsubdivs as f32;
        let x = -width * 0.5 + t * width;
        let y = (i as f32 * width / nsubdivs as f32).cos() * 0.5;
        base.push(Vector2::new(x, y));
    }

    let mut points = Vec::new();
    for segment in base.windows(2) {
        sample_segment_2d(&mut points, segment[0], segment[1], spacing);
    }

    let left = base[0];
    let right = base[base.len() - 1];
    sample_segment_2d(&mut points, left, Vector2::new(left.x, 11.5), spacing);
    sample_segment_2d(&mut points, right, Vector2::new(right.x, 11.5), spacing);

    let first_layer = points.clone();
    points.extend(first_layer.into_iter().map(|p| Vector2::new(p.x, p.y - spacing)));
    points
}

fn official_ground_box(half_width: f32, half_height: f32, particle_radius: f32) -> Vec<Vector2<f32>> {
    offset_rectangular_boundary(
        Vector2::new(0.0, 0.0),
        half_width,
        half_height,
        particle_radius * 1.4,
    )
}

fn build_official_basic(layers: bool) -> (LiquidWorld, Vec<FluidHandle>, Vec<Vector2<f32>>, Vector2<f32>) {
    let particle_radius = 0.1;
    let mut world = new_official_world(particle_radius);
    let mut handles = Vec::new();

    let ni = 25usize;
    let nj = 15usize;
    let shift2 = nj as f32 * particle_radius * 2.0;
    let mut points1 = Vec::new();
    let mut points2 = Vec::new();
    let mut points3 = Vec::new();

    for i in 0..ni / 2 {
        for j in 0..nj {
            let x = i as f32 * particle_radius * 2.0 - ni as f32 * particle_radius;
            let y = (j as f32 + 1.0) * particle_radius * 2.0 + 0.5;
            points1.push(Vector2::new(x, y));
            points2.push(Vector2::new(x + ni as f32 * particle_radius, y));
        }
    }

    for i in 0..ni {
        for j in 0..nj * 2 {
            let x = i as f32 * particle_radius * 2.0 - ni as f32 * particle_radius;
            let y = (j as f32 + 1.0) * particle_radius * 2.0 + 0.5 + shift2;
            points3.push(Vector2::new(x, y));
        }
    }

    let groups1 = if layers {
        InteractionGroups::new(Group::GROUP_1, Group::GROUP_1)
    } else {
        InteractionGroups::default()
    };
    let groups2 = if layers {
        InteractionGroups::new(Group::GROUP_2, Group::GROUP_2)
    } else {
        InteractionGroups::default()
    };

    let mut fluid1 = Fluid::new(points1, particle_radius, 1.0, groups1);
    let elasticity1: Becker2009Elasticity = Becker2009Elasticity::new(1_000.0, 0.3, true);
    fluid1.nonpressure_forces.push(Box::new(elasticity1));
    fluid1.nonpressure_forces.push(Box::new(XSPHViscosity::new(0.5, 1.0)));
    handles.push(world.add_fluid(fluid1));

    let mut fluid2 = Fluid::new(points2, particle_radius, 1.0, groups2);
    let elasticity2: Becker2009Elasticity = Becker2009Elasticity::new(1_000.0, 0.3, true);
    fluid2.nonpressure_forces.push(Box::new(elasticity2));
    fluid2.nonpressure_forces.push(Box::new(XSPHViscosity::new(0.5, 1.0)));
    handles.push(world.add_fluid(fluid2));

    let mut fluid3 = Fluid::new(points3, particle_radius, 1.0, groups2);
    fluid3.nonpressure_forces.push(Box::new(ArtificialViscosity::new(0.5, 0.0)));
    handles.push(world.add_fluid(fluid3));

    let boundary_points = official_basin_boundary(particle_radius);
    world.add_boundary(Boundary::new(
        boundary_points.clone(),
        if layers { InteractionGroups::all() } else { InteractionGroups::default() },
    ));

    (world, handles, boundary_points, Vector2::new(0.0, -9.81))
}

struct WebCustomForceField {
    origin: Vector2<f32>,
}

impl NonPressureForce for WebCustomForceField {
    fn solve(
        &mut self,
        _timestep: &salva2d::TimestepManager,
        _kernel_radius: f32,
        _fluid_fluid_contacts: &salva2d::geometry::ParticlesContacts,
        _fluid_boundaries_contacts: &salva2d::geometry::ParticlesContacts,
        fluid: &mut Fluid,
        _boundaries: &[Boundary],
        _densities: &[f32],
    ) {
        for (pos, acc) in fluid.positions.iter().zip(fluid.accelerations.iter_mut()) {
            let delta = self.origin - pos;
            let dist = delta.norm();
            if dist > 0.1 {
                *acc += delta / (dist * dist);
            }
        }
    }

    fn apply_permutation(&mut self, _permutation: &[usize]) {}
}

fn build_official_custom_forces() -> (LiquidWorld, Vec<FluidHandle>, Vec<Vector2<f32>>, Vector2<f32>) {
    let particle_radius = 0.025;
    let mut world = new_official_world(particle_radius);
    let mut fluid = Fluid::new(
        cube_fluid_points(30, 30, particle_radius),
        particle_radius,
        1000.0,
        InteractionGroups::default(),
    );
    fluid.nonpressure_forces.push(Box::new(WebCustomForceField { origin: Vector2::new(1.0, 0.0) }));
    fluid.nonpressure_forces.push(Box::new(WebCustomForceField { origin: Vector2::new(-1.0, 0.0) }));
    let handle = world.add_fluid(fluid);
    (world, vec![handle], Vec::new(), Vector2::zeros())
}

fn build_official_elasticity() -> (LiquidWorld, Vec<FluidHandle>, Vec<Vector2<f32>>, Vector2<f32>) {
    let particle_radius = 0.1;
    let mut world = new_official_world(particle_radius);
    let ground_thickness = 0.2;
    let height = 0.4;
    let nparticlesx = 25usize;
    let nparticlesy = 15usize;
    let mut handles = Vec::new();

    let mut points1 = cube_fluid_points(nparticlesx, nparticlesy, particle_radius);
    translate_points(&mut points1, 0.0, ground_thickness + particle_radius * nparticlesy as f32 + height);
    let mut fluid1 = Fluid::new(points1, particle_radius, 1000.0, InteractionGroups::default());
    let elasticity1: Becker2009Elasticity = Becker2009Elasticity::new(500_000.0, 0.3, true);
    fluid1.nonpressure_forces.push(Box::new(elasticity1));
    fluid1.nonpressure_forces.push(Box::new(XSPHViscosity::new(0.5, 1.0)));
    handles.push(world.add_fluid(fluid1));

    let mut points2 = cube_fluid_points(nparticlesx, nparticlesy, particle_radius);
    translate_points(&mut points2, 0.0, ground_thickness + particle_radius * nparticlesy as f32 * 4.0 + height);
    let mut fluid2 = Fluid::new(points2, particle_radius, 1000.0, InteractionGroups::default());
    let elasticity2: Becker2009Elasticity = Becker2009Elasticity::new(100_000.0, 0.3, true);
    fluid2.nonpressure_forces.push(Box::new(elasticity2));
    fluid2.nonpressure_forces.push(Box::new(XSPHViscosity::new(0.5, 1.0)));
    handles.push(world.add_fluid(fluid2));

    let boundary_points = official_ground_box(3.0, ground_thickness, particle_radius);
    world.add_boundary(Boundary::new(boundary_points.clone(), InteractionGroups::default()));

    (world, handles, boundary_points, Vector2::new(0.0, -9.81))
}

fn build_official_surface_tension() -> (LiquidWorld, Vec<FluidHandle>, Vec<Vector2<f32>>, Vector2<f32>) {
    let particle_radius = 0.0025;
    let mut world = new_official_world(particle_radius);

    let mut points = cube_fluid_points(20, 20, particle_radius);
    translate_points(&mut points, 0.0, 0.08);
    let mut fluid = Fluid::new(points, particle_radius, 1000.0, InteractionGroups::default());
    fluid.nonpressure_forces.push(Box::new(Akinci2013SurfaceTension::new(1.0, 0.0)));
    fluid.nonpressure_forces.push(Box::new(ArtificialViscosity::new(0.01, 0.0)));
    let handle = world.add_fluid(fluid);

    let boundary_points = official_ground_box(0.15, 0.02, particle_radius);
    world.add_boundary(Boundary::new(boundary_points.clone(), InteractionGroups::default()));

    (world, vec![handle], boundary_points, Vector2::new(0.0, -0.981))
}
