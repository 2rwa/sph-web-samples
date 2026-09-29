import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync("site/tests/splishsplash-pbd-browser/index.html","utf8");
const app=readFileSync("site/splishsplash-pbd-browser.js","utf8");
const cmake=readFileSync("tests/splishsplash-wasm/wasm-smoke/CMakeLists.txt","utf8");
const build=readFileSync("tests/splishsplash-wasm/build-pbd-probe.sh","utf8");

assert.match(page,/PBD two-way coupling/);
assert.match(page,/Direct impact/);
assert.match(page,/Gravity drop \(supported plate\)/);
assert.match(page,/250 kg/);
assert.match(page,/splishsplash_pbd_browser\.js/);
assert.match(app,/createSPlisHSPlasHPBD/);
assert.match(app,/gravityY: -9\.81/);
assert.match(app,/mass: "1000"/);
assert.match(app,/sph_bender_promote_dynamic_pbd_box/);
assert.match(app,/sph_step_dynamic_pbd/);
assert.match(app,/sampleCoupling\(120\)/);
assert.match(app,/sampleCoupling\(160\)/);
assert.match(app,/CI SPlisHSPlasH PBD browser ok/);
assert.match(cmake,/add_executable\(splishsplash_pbd_browser/);
assert.match(cmake,/SPLISHSPLASH_ENABLE_PBD=1/);
assert.match(build,/site\/vendor\/splishsplash-pbd/);
assert.match(build,/SPLISHSPLASH_PBD_GRAVITY_SWEEP_OK/);
console.log("SPlisHSPlasH PBD browser contract ok");
