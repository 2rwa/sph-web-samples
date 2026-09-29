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
assert.match(page, /BucklingModel_Peer2015\.json/);
assert.match(page, /BucklingModel_Peer2016\.json/);
assert.match(page, /BucklingModel_Bender2017\.json/);
assert.match(page, /BucklingModel_Takahashi2015\.json/);
assert.match(page, /BucklingModel_Weiler2018\.json/);
assert.match(page, /SurfaceTension_NoGravCube_ZR2020\.json/);
assert.match(page, /SurfaceTension_DoubleDroplet_ZR2020\.json/);
assert.match(page, /SurfaceTension_BreakDamZR2020\.json/);
assert.match(page, /SurfaceTension_CoveredSphere_ZR2020\.json/);
assert.match(app, /CI SPlisHSPlasH scene browser ok/);
assert.match(app, /prepareBender2019Maps/);
assert.match(app, /buildSceneFromIRWithPreparedBender/);
assert.match(app, /for \(const \[name, expected\] of Object\.entries\(SCENES\)\)/);

console.log("SPlisHSPlasH scene browser contract ok");

const runtime = readFileSync("site/splishsplash-scene-runtime.js", "utf8");
assert.match(runtime, /sph_scene_add_unit_box_bender_file/);
assert.match(runtime, /Bender2019 UnitBox volume map loaded from precomputed Discregrid \.cdm/);

assert.match(runtime, /sph_scene_set_iisph/);
assert.match(runtime, /sph_scene_set_peer2015_viscosity/);
assert.match(runtime, /unitbox-3x0p5x3-r20-i0-t0\.cdm/);
assert.match(runtime, /sphere-s1-r20-i0-t0\.cdm/);
assert.match(runtime, /sph_scene_add_mesh_bender_file/);

assert.match(runtime, /sph_scene_set_peer2016_viscosity/);

assert.match(runtime, /sph_scene_set_bender2017_viscosity/);
assert.match(runtime, /sph_scene_set_takahashi2015_viscosity/);
assert.match(runtime, /sph_scene_set_weiler2018_viscosity/);

assert.match(runtime, /sph_scene_set_surface_tension_method/);
assert.match(runtime, /sph_scene_set_surface_real/);
assert.match(runtime, /sph_scene_set_surface_int/);
assert.match(runtime, /Ignored source-only surface parameters/);
assert.match(app, /surfaceTensionMethod: 5/);

assert.match(runtime, /sph_scene_set_surface_bool/);
assert.match(runtime, /surfTZRtemporalSmooth/);

assert.match(app, /boundaryMethod: "Akinci2012"/);
