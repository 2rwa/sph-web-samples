import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const top = readFileSync("site/index.html", "utf8");
const page = readFileSync("site/tests/splishsplash-wasm/index.html", "utf8");
const app = readFileSync("site/splishsplash-wasm-demo.js", "utf8");
const gluePath = "site/vendor/splishsplash/splishsplash_browser.js";
const wasmPath = "site/vendor/splishsplash/splishsplash_browser.wasm";
const glue = readFileSync(gluePath, "utf8");

assert.match(top, /href="\.\/tests\/splishsplash-wasm\/"/);
assert.match(page, /SPlisHSPlasH 2\.18\.1/);
assert.match(page, /WCSPH/);
assert.match(page, /no boundary model yet/);
assert.match(page, /id="view"/);
assert.match(page, /vendor\/splishsplash\/splishsplash_browser\.js/);
assert.match(page, /splishsplash-wasm-demo\.js/);

assert.match(app, /createSPlisHSPlasH/);
assert.match(app, /_sph_init/);
assert.match(app, /_sph_step/);
assert.match(app, /_sph_positions_ptr/);
assert.match(app, /HEAPF32/);
assert.match(app, /CI SPlisHSPlasH browser ok/);

assert.match(glue, /createSPlisHSPlasH/);
assert.ok(statSync(gluePath).size > 50_000, "browser JS glue unexpectedly small");
assert.ok(statSync(wasmPath).size > 100_000, "browser WASM unexpectedly small");

console.log("SPlisHSPlasH browser page contract ok");
