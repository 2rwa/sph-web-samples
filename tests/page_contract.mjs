import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const top = readFileSync("site/index.html", "utf8");
const sample = readFileSync("site/samples/salva-canvas/index.html", "utf8");
const app = readFileSync("site/app.js", "utf8");
const glue = readFileSync("site/pkg/sph_web_samples.js", "utf8");
const wasm = readFileSync("site/pkg/sph_web_samples_bg.wasm");

assert.match(top, /<h1>SPH Web Samples<\/h1>/);
assert.match(top, /href="\.\/samples\/salva-canvas\/"/);
assert.doesNotMatch(top, /<canvas\b/);

assert.match(sample, /<canvas\s+id="view"/);
assert.match(sample, /type="module"\s+src="\.\.\/\.\.\/app\.js"/);
assert.match(sample, /href="\.\.\/\.\.\/"/);

assert.match(app, /Simulation/);
assert.match(app, /\.\/pkg\/sph_web_samples\.js/);
assert.match(app, /sim\.step\(fixedDt\)/);
assert.match(glue, /class Simulation/);

assert.ok(statSync("site/pkg/sph_web_samples_bg.wasm").size > 10_000, "WASM should be non-trivial");
assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], "WASM magic must be valid");

const module = new WebAssembly.Module(wasm);
const exportNames = WebAssembly.Module.exports(module).map((entry) => entry.name);
assert.ok(exportNames.some((name) => name.includes("simulation")), "WASM should export Simulation bindings");

console.log(`page contract OK: top index + sample link, wasm=${wasm.length} bytes, exports=${exportNames.length}`);
