import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const top = readFileSync("site/index.html", "utf8");
const sample = readFileSync("site/samples/salva-canvas/index.html", "utf8");
const benchmark = readFileSync("site/samples/salva-benchmark/index.html", "utf8");
const interactive = readFileSync("site/samples/salva-interactive-obstacles/index.html", "utf8");
const sample3d = readFileSync("site/samples/salva-3d-canvas/index.html", "utf8");
const app = readFileSync("site/app.js", "utf8");
const benchmarkApp = readFileSync("site/benchmark.js", "utf8");
const interactiveApp = readFileSync("site/interactive-obstacles.js", "utf8");
const app3d = readFileSync("site/3d-canvas.js", "utf8");
const officialApp = readFileSync("site/official-examples2d.js", "utf8");
const couplingApp = readFileSync("site/rapier-coupling.js", "utf8");
const couplingPages = {
  "upstream-basic": readFileSync("site/samples/salva-rapier-upstream-basic/index.html", "utf8"),
  "light-floaters": readFileSync("site/samples/salva-rapier-light-floaters/index.html", "utf8"),
  "heavy-sinkers": readFileSync("site/samples/salva-rapier-heavy-sinkers/index.html", "utf8"),
  "layers-filtered": readFileSync("site/samples/salva-rapier-layers-filtered/index.html", "utf8"),
  "mixed-body-rain": readFileSync("site/samples/salva-rapier-mixed-body-rain/index.html", "utf8"),
};
const officialPages = {
  "basic": readFileSync("site/samples/salva-official-basic/index.html", "utf8"),
  "custom-forces": readFileSync("site/samples/salva-official-custom-forces/index.html", "utf8"),
  "elasticity": readFileSync("site/samples/salva-official-elasticity/index.html", "utf8"),
  "layers": readFileSync("site/samples/salva-official-layers/index.html", "utf8"),
  "surface-tension": readFileSync("site/samples/salva-official-surface-tension/index.html", "utf8"),
};
const glue = readFileSync("site/pkg/sph_web_samples.js", "utf8");
const wasm = readFileSync("site/pkg/sph_web_samples_bg.wasm");

assert.match(top, /<h1>SPH Web Samples<\/h1>/);
assert.match(top, /href="\.\/samples\/salva-canvas\/"/);
assert.match(top, /href="\.\/samples\/salva-benchmark\/"/);
assert.match(top, /href="\.\/samples\/salva-interactive-obstacles\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-canvas\/"/);
assert.match(top, /href="\.\/samples\/salva-official-basic\/"/);
assert.match(top, /href="\.\/samples\/salva-official-custom-forces\/"/);
assert.match(top, /href="\.\/samples\/salva-official-elasticity\/"/);
assert.match(top, /href="\.\/samples\/salva-official-layers\/"/);
assert.match(top, /href="\.\/samples\/salva-official-surface-tension\/"/);
assert.match(top, /href="\.\/samples\/salva-rapier-upstream-basic\/"/);
assert.match(top, /href="\.\/samples\/salva-rapier-light-floaters\/"/);
assert.match(top, /href="\.\/samples\/salva-rapier-heavy-sinkers\/"/);
assert.match(top, /href="\.\/samples\/salva-rapier-layers-filtered\/"/);
assert.match(top, /href="\.\/samples\/salva-rapier-mixed-body-rain\/"/);
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
assert.match(interactive, /id="particle-count"/);
assert.match(interactive, /<option value="1000" selected>/);
assert.match(interactive, /<option value="5000">/);
assert.match(interactive, /id="reset-particles"/);
assert.match(interactive, /Reset particles only/);
assert.match(interactive, /Orange dots are the actual sampled boundary particles/);
assert.match(interactive, /type="module"\s+src="\.\.\/\.\.\/interactive-obstacles\.js\?v=/);
assert.match(interactiveApp, /InteractiveSimulation/);
assert.match(interactiveApp, /sph_web_samples\.js\?v=/);
assert.match(interactiveApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.04", import\.meta\.url\)/);
assert.match(interactiveApp, /pointerdown/);
assert.match(interactiveApp, /add_circle_obstacle/);
assert.match(interactiveApp, /add_box_obstacle/);
assert.match(interactiveApp, /add_line_obstacle/);
assert.match(interactiveApp, /add_polyline_obstacle/);
assert.match(interactiveApp, /clear_obstacles/);
assert.match(interactiveApp, /reset_particles/);
assert.match(interactiveApp, /particleCountSelect\.value/);

assert.match(sample3d, /<canvas\s+id="view"/);
assert.match(sample3d, /3D SPH particles projected as Canvas dots/);
assert.match(sample3d, /3d-canvas\.js\?v=1\.04/);
assert.match(app3d, /Simulation3d/);
assert.match(app3d, /sph_web_samples\.js\?v=1\.04/);
assert.match(app3d, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.04", import\.meta\.url\)/);
assert.match(app3d, /projected\.sort/);
assert.match(app3d, /sim\.step\(fixedDt\)/);

for (const [mode, html] of Object.entries(officialPages)) {
  assert.match(html, new RegExp(`data-example="${mode}"`));
  assert.match(html, /<canvas\s+id="view"/);
  assert.match(html, /official-examples2d\.js\?v=1\.10/);
  assert.match(html, /upstream .*\.rs/);
}
assert.match(officialApp, /OfficialExample2dSimulation/);
assert.match(officialApp, /sph_web_samples\.js\?v=1\.10/);
assert.match(officialApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.10", import\.meta\.url\)/);
assert.match(officialApp, /boundary_positions/);
assert.match(officialApp, /fluid_positions/);
assert.match(officialApp, /sim\.step\(fixedDt\)/);

for (const [mode, html] of Object.entries(couplingPages)) {
  assert.match(html, new RegExp(`data-coupling-variant="${mode}"`));
  assert.match(html, /<canvas\s+id="view"/);
  assert.match(html, /rapier-coupling\.js\?v=1\.20/);
}
assert.match(couplingApp, /RapierCoupledSimulation/);
assert.match(couplingApp, /sph_web_samples\.js\?v=1\.20/);
assert.match(couplingApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.20", import\.meta\.url\)/);
assert.match(couplingApp, /rigid_body_states/);
assert.match(couplingApp, /drawRigidBodies/);
assert.match(couplingApp, /sim\.step\(fixedDt\)/);

assert.match(app, /Simulation/);
assert.match(app, /\.\/pkg\/sph_web_samples\.js/);
assert.match(app, /sim\.step\(fixedDt\)/);
assert.match(glue, /class Simulation/);
assert.match(glue, /class BenchmarkSimulation/);
assert.match(glue, /class InteractiveSimulation/);
assert.match(glue, /class Simulation3d/);
assert.match(glue, /class OfficialExample2dSimulation/);
assert.match(glue, /class RapierCoupledSimulation/);

assert.ok(statSync("site/pkg/sph_web_samples_bg.wasm").size > 10_000, "WASM should be non-trivial");
assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], "WASM magic must be valid");

const module = new WebAssembly.Module(wasm);
const exportNames = WebAssembly.Module.exports(module).map((entry) => entry.name);
assert.ok(exportNames.some((name) => name.includes("simulation")), "WASM should export simulation bindings");

console.log(`page contract OK: top + fourteen samples, wasm=${wasm.length} bytes, exports=${exportNames.length}`);
