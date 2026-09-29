import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import init, { InteractiveSimulation, Simulation3d, OfficialExample2dSimulation, RapierCoupledSimulation, OfficialExample3dSimulation } from "../site/pkg/sph_web_samples.js";

const wasm = await readFile(new URL("../site/pkg/sph_web_samples_bg.wasm", import.meta.url));
await init(wasm);

const sim = new InteractiveSimulation();
assert.equal(sim.particle_count(), 1000);
assert.equal(sim.obstacle_count(), 0);

assert.equal(sim.add_circle_obstacle(0.0, -0.2, 0.15), true);
assert.equal(sim.obstacle_count(), 1);
const obstaclePoints = sim.obstacle_points();

const actual = sim.reset_particles(3000);
assert.equal(actual, 3000);
assert.equal(sim.particle_count(), 3000);
assert.equal(sim.positions().length, 6000);
assert.equal(sim.obstacle_count(), 1);
assert.deepEqual(Array.from(sim.obstacle_points()), Array.from(obstaclePoints));

console.log("wasm runtime reset OK: 1000 -> 3000, obstacle preserved");


const sim3d = new Simulation3d();
assert.equal(sim3d.particle_count(), 512);
assert.equal(sim3d.positions().length, 1536);
sim3d.step(1 / 200);
assert.equal(sim3d.positions().length, 1536);
console.log("wasm runtime 3D OK: 512 particles, XYZ buffer");


for (const [mode, expected] of [
  ["basic", 1110],
  ["custom-forces", 900],
  ["elasticity", 750],
  ["layers", 1110],
  ["surface-tension", 400],
]) {
  const sample = new OfficialExample2dSimulation(mode);
  assert.equal(sample.particle_count(), expected, mode);
  assert.ok(sample.fluid_count() >= 1, mode);
  assert.equal(sample.boundary_positions().length % 2, 0, mode);
  sample.free();
}
console.log("wasm runtime official examples2d OK: 5 modes constructed");


for (const [mode, bodies] of [
  ["upstream-basic", 3],
  ["light-floaters", 3],
  ["heavy-sinkers", 3],
  ["layers-filtered", 3],
  ["mixed-body-rain", 9],
]) {
  const coupled = new RapierCoupledSimulation(mode);
  assert.equal(coupled.particle_count(), 1110, mode);
  assert.equal(coupled.rigid_body_count(), bodies, mode);
  assert.equal(coupled.rigid_body_states().length, bodies * 8, mode);
  coupled.step(1 / 200);
  assert.equal(coupled.rigid_body_states().length, bodies * 8, mode);
  coupled.free();
}
console.log("wasm runtime Rapier coupling OK: 5 variants constructed and stepped");


for (const [mode, expected] of [
  ["basic", 3375],
  ["custom-forces", 1000],
  ["elasticity", 1728],
  ["faucet", 0],
  ["heightfield", 3375],
  ["surface-tension", 343],
]) {
  const sample3d = new OfficialExample3dSimulation(mode);
  assert.equal(sample3d.particle_count(), expected, mode);
  assert.ok(sample3d.fluid_count() >= 1, mode);
  assert.equal(sample3d.fluid_positions(0).length % 3, 0, mode);
  sample3d.free();
}
const custom3d = new OfficialExample3dSimulation("custom-forces");
custom3d.step(1 / 200);
assert.equal(custom3d.particle_count(), 1000);
custom3d.free();

const faucet3d = new OfficialExample3dSimulation("faucet");
for (let i = 0; i < 13; i += 1) faucet3d.step(1 / 200);
assert.equal(faucet3d.particle_count(), 100);
faucet3d.free();

console.log("wasm runtime official examples3d OK: 6 modes constructed; custom/faucet stepped");
