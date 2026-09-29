import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const top = readFileSync("site/index.html", "utf8");
const page = readFileSync("site/tests/splishsplash-wasm-dambreak/index.html", "utf8");
const app = readFileSync("site/splishsplash-dambreak.js", "utf8");

assert.match(top, /href="\.\/tests\/splishsplash-wasm-dambreak\/"/);
assert.match(page, /Akinci2012 Dam Break/);
assert.match(page, /actual open-top tank boundary/);
assert.match(page, /splishsplash-dambreak\.js/);
assert.match(page, /vendor\/splishsplash\/splishsplash_browser\.js/);

assert.match(app, /_sph_init_dambreak/);
assert.match(app, /_sph_boundary_count/);
assert.match(app, /_sph_boundary_positions_ptr/);
assert.match(app, /_sph_min_y/);
assert.match(app, /CI SPlisHSPlasH Dam Break ok/);
assert.match(app, /_sph_step\(220\)/);

console.log("SPlisHSPlasH Dam Break page contract ok");
