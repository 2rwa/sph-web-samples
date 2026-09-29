import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("site/tests/splishsplash-scene-runner/index.html", "utf8");
const runtime = readFileSync("site/splishsplash-scene-runtime.js", "utf8");
const runner = readFileSync("site/splishsplash-scene-runner.js", "utf8");

assert.match(page, /generic ABI/);
assert.match(page, /CompressibleSPH_WCSPH\.json/);
assert.match(runtime, /_sph_scene_begin/);
assert.match(runtime, /_sph_scene_add_fluid_block/);
assert.match(runtime, /_sph_scene_add_unit_box/);
assert.match(runtime, /Bender2019 UnitBox volume-map boundary/);
assert.match(runtime, /Math\.min\(sourceCflMax, 0\.001\)/);
assert.match(runner, /CI SPlisHSPlasH generic scene ok/);
assert.match(runner, /report\.particles === 9826/);
assert.match(runner, /new URL\([\s\S]*import\.meta\.url/);

const pagesBase = new URL("https://2rwa.github.io/sph-web-samples/splishsplash-scene-runner.js");
assert.equal(
  new URL("./scenes/splishsplash/2.18.1/CompressibleSPH_WCSPH.json", pagesBase).href,
  "https://2rwa.github.io/sph-web-samples/scenes/splishsplash/2.18.1/CompressibleSPH_WCSPH.json",
);

console.log("SPlisHSPlasH generic scene runner contract ok");
