import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("site/tests/splishsplash-scene-dfsph/index.html", "utf8");
const runtime = readFileSync("site/splishsplash-scene-runtime.js", "utf8");
const runner = readFileSync("site/splishsplash-scene-dfsph-runner.js", "utf8");

assert.match(page, /DamBreakModel\.json/);
assert.match(page, /DFSPH WASM/);
assert.match(runtime, /_sph_scene_set_dfsph/);
assert.match(runtime, /simulationMethod === "DFSPH"/);
assert.match(runner, /CI SPlisHSPlasH generic DFSPH scene ok/);
assert.match(runner, /report\.particles === 9261/);
assert.match(runner, /report\.boundaryParticles === 18002/);
assert.match(runner, /new URL\([\s\S]*import\.meta\.url/);

console.log("SPlisHSPlasH generic DFSPH scene contract ok");
