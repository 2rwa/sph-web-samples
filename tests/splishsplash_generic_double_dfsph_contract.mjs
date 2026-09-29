import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("site/tests/splishsplash-scene-double-dfsph/index.html", "utf8");
const runner = readFileSync("site/splishsplash-scene-double-dfsph-runner.js", "utf8");

assert.match(page, /DoubleDamBreak\.json/);
assert.match(page, /Double DFSPH/);
assert.match(runner, /DoubleDamBreak\.json/);
assert.match(runner, /report\.particles === 7200/);
assert.match(runner, /report\.boundaryParticles === 23066/);
assert.match(runner, /CI SPlisHSPlasH generic Double DFSPH scene ok/);

console.log("SPlisHSPlasH generic Double DFSPH scene contract ok");
