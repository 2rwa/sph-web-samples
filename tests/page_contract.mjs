import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const top = readFileSync("site/index.html", "utf8");
const sample = readFileSync("site/samples/salva-canvas/index.html", "utf8");
const benchmark = readFileSync("site/samples/salva-benchmark/index.html", "utf8");
const interactive = readFileSync("site/samples/salva-interactive-obstacles/index.html", "utf8");
const app = readFileSync("site/app.js", "utf8");
const benchmarkApp = readFileSync("site/benchmark.js", "utf8");
const interactiveApp = readFileSync("site/interactive-obstacles.js", "utf8");
const glue = readFileSync("site/pkg/sph_web_samples.js", "utf8");
const wasm = readFileSync("site/pkg/sph_web_samples_bg.wasm");

assert.match(top, /<h1>SPH Web Samples<\/h1>/);
assert.match(top, /href="\.\/samples\/salva-canvas\/"/);
assert.match(top, /href="\.\/samples\/salva-benchmark\/"/);
assert.match(top, /href="\.\/samples\/salva-interactive-obstacles\/"/);
assert.doesNotMatch(top, /<canvas\b/);

assert.match(sample, /<canvas\s+id="view"/);
assert.match(sample, /type="module"\s+src="\.\.\/\.\.\/app\.js"/);
assert.match(sample, /href="\.\.\/\.\.\/"/);

assert.match(benchmark, /id="particle-count"/);
assert.match(benchmark, /min="100"/);
assert.match(benchmark, /max="10000"/);
assert.match(benchmark, /step="100"/);
assert.match(benchmark, /value="100"/);
assert.match(benchmark, /Known behavior: occasional particles escape the box/);
assert.match(benchmark, /boundary discretization and\/or timestep size/);
assert.match(benchmark, /Rapier collider sampled as a Salva boundary/);
assert.match(benchmark, /type="module"\s+src="\.\.\/\.\.\/benchmark\.js"/);
assert.match(benchmarkApp, /BenchmarkSimulation/);
assert.match(benchmarkApp, /slider\.addEventListener\("input"/);
assert.match(benchmarkApp, /sim\.step\(1 \/ 120\)/);

assert.match(interactive, /data-tool="circle"/);
assert.match(interactive, /data-tool="box"/);
assert.match(interactive, /data-tool="line"/);
assert.match(interactive, /data-tool="draw"/);
assert.match(interactive, /id="clear-obstacles"/);
assert.match(interactive, /Orange dots are the actual sampled boundary particles/);
assert.match(interactive, /type="module"\s+src="\.\.\/\.\.\/interactive-obstacles\.js"/);
assert.match(interactiveApp, /InteractiveSimulation/);
assert.match(interactiveApp, /pointerdown/);
assert.match(interactiveApp, /add_circle_obstacle/);
assert.match(interactiveApp, /add_box_obstacle/);
assert.match(interactiveApp, /add_line_obstacle/);
assert.match(interactiveApp, /add_polyline_obstacle/);
assert.match(interactiveApp, /clear_obstacles/);

assert.match(app, /Simulation/);
assert.match(app, /\.\/pkg\/sph_web_samples\.js/);
assert.match(app, /sim\.step\(fixedDt\)/);
assert.match(glue, /class Simulation/);
assert.match(glue, /class BenchmarkSimulation/);
assert.match(glue, /class InteractiveSimulation/);

assert.ok(statSync("site/pkg/sph_web_samples_bg.wasm").size > 10_000, "WASM should be non-trivial");
assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], "WASM magic must be valid");

const module = new WebAssembly.Module(wasm);
const exportNames = WebAssembly.Module.exports(module).map((entry) => entry.name);
assert.ok(exportNames.some((name) => name.includes("simulation")), "WASM should export simulation bindings");

console.log(`page contract OK: top + three samples, wasm=${wasm.length} bytes, exports=${exportNames.length}`);
