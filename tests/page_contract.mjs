import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const top = readFileSync("site/index.html", "utf8");
const sample = readFileSync("site/samples/salva-canvas/index.html", "utf8");
const benchmark = readFileSync("site/samples/salva-benchmark/index.html", "utf8");
const interactive = readFileSync("site/samples/salva-interactive-obstacles/index.html", "utf8");
const sample3d = readFileSync("site/samples/salva-3d-canvas/index.html", "utf8");
const webgl3dPages = {
  "basic": readFileSync("site/samples/salva-3d-webgl2/index.html", "utf8"),
  "custom-forces": readFileSync("site/samples/salva-3d-webgl2-custom-forces/index.html", "utf8"),
  "elasticity": readFileSync("site/samples/salva-3d-webgl2-elasticity/index.html", "utf8"),
  "faucet": readFileSync("site/samples/salva-3d-webgl2-faucet/index.html", "utf8"),
  "heightfield": readFileSync("site/samples/salva-3d-webgl2-heightfield/index.html", "utf8"),
  "surface-tension": readFileSync("site/samples/salva-3d-webgl2-surface-tension/index.html", "utf8"),
};
const app = readFileSync("site/app.js", "utf8");
const benchmarkApp = readFileSync("site/benchmark.js", "utf8");
const interactiveApp = readFileSync("site/interactive-obstacles.js", "utf8");
const app3d = readFileSync("site/3d-canvas.js", "utf8");
const webgl3dApp = readFileSync("site/3d-webgl2.js", "utf8");
const webgpuSurface = readFileSync("site/samples/salva-3d-webgpu-surface-tension/index.html", "utf8");
const webgpuSurfaceApp = readFileSync("site/3d-webgpu-surface-tension.js", "utf8");
const webgpuFaucet = readFileSync("site/samples/salva-3d-webgpu-faucet/index.html", "utf8");
const webgpuFaucetApp = readFileSync("site/3d-webgpu-faucet.js", "utf8");
const webgpuElasticity = readFileSync("site/samples/salva-3d-webgpu-elasticity/index.html", "utf8");
const webgpuElasticityApp = readFileSync("site/3d-webgpu-elasticity.js", "utf8");
const officialApp = readFileSync("site/official-examples2d.js", "utf8");
const couplingApp = readFileSync("site/rapier-coupling.js", "utf8");
const official3dApp = readFileSync("site/official-examples3d.js", "utf8");
const official3dPages = {
  "basic": readFileSync("site/samples/salva-official-3d-basic/index.html", "utf8"),
  "custom-forces": readFileSync("site/samples/salva-official-3d-custom-forces/index.html", "utf8"),
  "elasticity": readFileSync("site/samples/salva-official-3d-elasticity/index.html", "utf8"),
  "faucet": readFileSync("site/samples/salva-official-3d-faucet/index.html", "utf8"),
  "heightfield": readFileSync("site/samples/salva-official-3d-heightfield/index.html", "utf8"),
  "surface-tension": readFileSync("site/samples/salva-official-3d-surface-tension/index.html", "utf8"),
};
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
assert.match(top, /href="\.\/samples\/salva-3d-webgl2\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgl2-custom-forces\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgl2-elasticity\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgl2-faucet\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgl2-heightfield\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgl2-surface-tension\/"/);
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
assert.match(top, /href="\.\/samples\/salva-official-3d-basic\/"/);
assert.match(top, /href="\.\/samples\/salva-official-3d-custom-forces\/"/);
assert.match(top, /href="\.\/samples\/salva-official-3d-elasticity\/"/);
assert.match(top, /href="\.\/samples\/salva-official-3d-faucet\/"/);
assert.match(top, /href="\.\/samples\/salva-official-3d-heightfield\/"/);
assert.match(top, /href="\.\/samples\/salva-official-3d-surface-tension\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgpu-surface-tension\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgpu-faucet\/"/);
assert.match(top, /href="\.\/samples\/salva-3d-webgpu-elasticity\/"/);
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

for (const [mode, html] of Object.entries(webgl3dPages)) {
  assert.match(html, new RegExp(`data-webgl3d-mode="${mode}"`));
  assert.match(html, /<canvas\s+id="view"/);
  assert.match(html, /WebGL2/);
  assert.match(html, /3d-webgl2\.js\?v=1\.41/);
  assert.match(html, /Physics ms/);
  assert.match(html, /Render ms/);
}
assert.match(webgl3dApp, /OfficialExample3dSimulation/);
assert.match(webgl3dApp, /dataset\.webgl3dMode/);
assert.match(webgl3dApp, /new OfficialExample3dSimulation\(mode\)/);
assert.match(webgl3dApp, /sim\.fluid_count\(\)/);
assert.match(webgl3dApp, /getContext\("webgl2"/);
assert.match(webgl3dApp, /gl\.enable\(gl\.DEPTH_TEST\)/);
assert.match(webgl3dApp, /gl\.drawArrays\(gl\.POINTS/);
assert.match(webgl3dApp, /gl\.bufferData/);
assert.match(webgl3dApp, /gl_PointCoord/);
assert.match(webgl3dApp, /sph_web_samples\.js\?v=1\.41/);
assert.match(webgl3dApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.41", import\.meta\.url\)/);
assert.doesNotMatch(webgl3dApp, /projected\.sort/);

assert.match(webgpuSurface, /data-webgpu-raymarch="surface-tension"/);
assert.match(webgpuSurface, /<canvas\s+id="view"/);
assert.match(webgpuSurface, /Kernel radius/);
assert.match(webgpuSurface, /Iso level/);
assert.match(webgpuSurface, /48³ density grid/);
assert.match(webgpuSurface, /3d-webgpu-surface-tension\.js\?v=1\.50/);
assert.match(webgpuSurfaceApp, /OfficialExample3dSimulation/);
assert.match(webgpuSurfaceApp, /new OfficialExample3dSimulation\("surface-tension"\)/);
assert.match(webgpuSurfaceApp, /navigator\.gpu/);
assert.match(webgpuSurfaceApp, /requestAdapter\(\)/);
assert.match(webgpuSurfaceApp, /requestDevice\(\)/);
assert.match(webgpuSurfaceApp, /texture_storage_3d<r32float, write>/);
assert.match(webgpuSurfaceApp, /texture_3d<f32>/);
assert.match(webgpuSurfaceApp, /@compute/);
assert.match(webgpuSurfaceApp, /textureStore/);
assert.match(webgpuSurfaceApp, /textureLoad/);
assert.match(webgpuSurfaceApp, /rayBoxInterval/);
assert.match(webgpuSurfaceApp, /refineDensityHit/);
assert.match(webgpuSurfaceApp, /marchDensity/);
assert.match(webgpuSurfaceApp, /GPUTextureUsage\.STORAGE_BINDING/);
assert.match(webgpuSurfaceApp, /GPUTextureUsage\.TEXTURE_BINDING/);
assert.match(webgpuSurfaceApp, /GPUTextureUsage\.RENDER_ATTACHMENT/);
assert.match(webgpuSurfaceApp, /getCompilationInfo/);
assert.match(webgpuSurfaceApp, /pushErrorScope\("validation"\)/);
assert.match(webgpuSurfaceApp, /queue\.onSubmittedWorkDone\(\)/);
assert.match(webgpuSurfaceApp, /sph_web_samples\.js\?v=1\.50/);
assert.match(webgpuSurfaceApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.50", import\.meta\.url\)/);
assert.doesNotMatch(webgpuSurfaceApp, /t\s*\+=\s*density/);

assert.match(webgpuFaucet, /data-webgpu-raymarch="faucet"/);
assert.match(webgpuFaucet, /<canvas\s+id="view"/);
assert.match(webgpuFaucet, /atomic splat/);
assert.match(webgpuFaucet, /40×96×40 density grid/);
assert.match(webgpuFaucet, /3d-webgpu-faucet\.js\?v=1\.60/);
assert.match(webgpuFaucetApp, /new OfficialExample3dSimulation\("faucet"\)/);
assert.match(webgpuFaucetApp, /array<atomic<u32>>/);
assert.match(webgpuFaucetApp, /atomicStore/);
assert.match(webgpuFaucetApp, /atomicAdd/);
assert.match(webgpuFaucetApp, /@compute/);
assert.match(webgpuFaucetApp, /clearDensityMain/);
assert.match(webgpuFaucetApp, /splatParticlesMain/);
assert.match(webgpuFaucetApp, /normalizeDensityMain/);
assert.match(webgpuFaucetApp, /texture_storage_3d<r32float, write>/);
assert.match(webgpuFaucetApp, /texture_3d<f32>/);
assert.match(webgpuFaucetApp, /GPUBufferUsage\.STORAGE/);
assert.match(webgpuFaucetApp, /GPUTextureUsage\.STORAGE_BINDING/);
assert.match(webgpuFaucetApp, /raySphereInterval/);
assert.match(webgpuFaucetApp, /marchDensity/);
assert.match(webgpuFaucetApp, /refineDensityHit/);
assert.match(webgpuFaucetApp, /getCompilationInfo/);
assert.match(webgpuFaucetApp, /pushErrorScope\("validation"\)/);
assert.match(webgpuFaucetApp, /queue\.onSubmittedWorkDone\(\)/);
assert.match(webgpuFaucetApp, /sph_web_samples\.js\?v=1\.60/);
assert.match(webgpuFaucetApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.60", import\.meta\.url\)/);
assert.doesNotMatch(webgpuFaucetApp, /t\s*\+=\s*density/);

assert.match(webgpuElasticity, /data-webgpu-raymarch="elasticity"/);
assert.match(webgpuElasticity, /two independent density fields/);
assert.match(webgpuElasticity, /56×72×56/);
assert.match(webgpuElasticity, /3d-webgpu-elasticity\.js\?v=1\.70/);
assert.match(webgpuElasticityApp, /new OfficialExample3dSimulation\("elasticity"\)/);
assert.match(webgpuElasticityApp, /fluid_count\(\)/);
assert.match(webgpuElasticityApp, /fluid_positions\(0\)/);
assert.match(webgpuElasticityApp, /fluid_positions\(1\)/);
assert.match(webgpuElasticityApp, /array<atomic<u32>>/);
assert.match(webgpuElasticityApp, /createDensityField/);
assert.match(webgpuElasticityApp, /densityTextureA/);
assert.match(webgpuElasticityApp, /densityTextureB/);
assert.match(webgpuElasticityApp, /textureA: texture_3d<f32>/);
assert.match(webgpuElasticityApp, /textureB: texture_3d<f32>/);
assert.match(webgpuElasticityApp, /marchDensityA/);
assert.match(webgpuElasticityApp, /marchDensityB/);
assert.match(webgpuElasticityApp, /rayBoxInterval/);
assert.match(webgpuElasticityApp, /GPUTextureUsage\.STORAGE_BINDING/);
assert.match(webgpuElasticityApp, /getCompilationInfo/);
assert.match(webgpuElasticityApp, /pushErrorScope\("validation"\)/);
assert.match(webgpuElasticityApp, /queue\.onSubmittedWorkDone\(\)/);
assert.match(webgpuElasticityApp, /sph_web_samples\.js\?v=1\.70/);
assert.match(webgpuElasticityApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.70", import\.meta\.url\)/);
assert.doesNotMatch(webgpuElasticityApp, /t\s*\+=\s*density/);

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

for (const [mode, html] of Object.entries(official3dPages)) {
  assert.match(html, new RegExp(`data-example3d="${mode}"`));
  assert.match(html, /<canvas\s+id="view"/);
  assert.match(html, /official-examples3d\.js\?v=1\.30/);
  assert.match(html, /upstream .*3\.rs/);
}
assert.match(official3dApp, /OfficialExample3dSimulation/);
assert.match(official3dApp, /sph_web_samples\.js\?v=1\.30/);
assert.match(official3dApp, /new URL\("\.\/pkg\/sph_web_samples_bg\.wasm\?v=1\.30", import\.meta\.url\)/);
assert.match(official3dApp, /fluid_velocities/);
assert.match(official3dApp, /boundary_positions/);
assert.match(official3dApp, /particles\.sort/);
assert.match(official3dApp, /sim\.step\(fixedDt\)/);

assert.match(app, /Simulation/);
assert.match(app, /\.\/pkg\/sph_web_samples\.js/);
assert.match(app, /sim\.step\(fixedDt\)/);
assert.match(glue, /class Simulation/);
assert.match(glue, /class BenchmarkSimulation/);
assert.match(glue, /class InteractiveSimulation/);
assert.match(glue, /class Simulation3d/);
assert.match(glue, /class OfficialExample2dSimulation/);
assert.match(glue, /class RapierCoupledSimulation/);
assert.match(glue, /class OfficialExample3dSimulation/);

assert.ok(statSync("site/pkg/sph_web_samples_bg.wasm").size > 10_000, "WASM should be non-trivial");
assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], "WASM magic must be valid");

const module = new WebAssembly.Module(wasm);
const exportNames = WebAssembly.Module.exports(module).map((entry) => entry.name);
assert.ok(exportNames.some((name) => name.includes("simulation")), "WASM should export simulation bindings");

console.log(`page contract OK: top + twenty-nine samples, wasm=${wasm.length} bytes, exports=${exportNames.length}`);
