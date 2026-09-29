import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("site/tests/splishsplash-scene-browser/index.html", "utf8");
const app = readFileSync("site/splishsplash-scene-browser.js", "utf8");

assert.match(page, /upstream Scene JSON browser/);
assert.match(page, /CompressibleSPH_WCSPH\.json/);
assert.match(page, /DamBreakModel\.json/);
assert.match(page, /DoubleDamBreak\.json/);
assert.match(page, /CompressibleSPH_ICSPH\.json/);
assert.match(page, /CompressibleSPH_PF\.json/);
assert.match(app, /CI SPlisHSPlasH scene browser ok/);
assert.match(app, /prepareBender2019Maps/);
assert.match(app, /buildSceneFromIRWithPreparedBender/);
assert.match(app, /for \(const \[name, expected\] of Object\.entries\(SCENES\)\)/);

console.log("SPlisHSPlasH scene browser contract ok");

const runtime = readFileSync("site/splishsplash-scene-runtime.js", "utf8");
assert.match(runtime, /sph_scene_add_unit_box_bender_file/);
assert.match(runtime, /Bender2019 UnitBox volume map loaded from precomputed Discregrid \.cdm/);
