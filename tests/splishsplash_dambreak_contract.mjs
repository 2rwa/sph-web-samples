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
assert.match(app, /new URL\(`\.\/vendor\/splishsplash\/\$\{path\}`, import\.meta\.url\)\.href/);
assert.doesNotMatch(app, /new URL\("\.\.\/\.\.\/", import\.meta\.url\)/);

const pagesBase = new URL("https://2rwa.github.io/sph-web-samples/splishsplash-dambreak.js");
assert.equal(
  new URL("./vendor/splishsplash/splishsplash_browser.wasm", pagesBase).href,
  "https://2rwa.github.io/sph-web-samples/vendor/splishsplash/splishsplash_browser.wasm",
);

console.log("SPlisHSPlasH Dam Break page contract ok");
