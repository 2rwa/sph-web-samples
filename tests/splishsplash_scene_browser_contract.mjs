import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("site/tests/splishsplash-scene-browser/index.html", "utf8");
const app = readFileSync("site/splishsplash-scene-browser.js", "utf8");

assert.match(page, /upstream Scene JSON browser/);
assert.match(page, /CompressibleSPH_WCSPH\.json/);
assert.match(page, /DamBreakModel\.json/);
assert.match(page, /DoubleDamBreak\.json/);
assert.match(app, /CI SPlisHSPlasH scene browser ok/);
assert.match(app, /buildSceneFromIR/);
assert.match(app, /for \(const \[name, expected\] of Object\.entries\(SCENES\)\)/);

console.log("SPlisHSPlasH scene browser contract ok");
