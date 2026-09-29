import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import init, { InteractiveSimulation } from "../site/pkg/sph_web_samples.js";

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
