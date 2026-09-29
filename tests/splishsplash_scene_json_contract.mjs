import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeSPlisHSPlasHScene } from "../site/splishsplash-scene-adapter.js";

function fixture(name) {
  return JSON.parse(readFileSync(`site/scenes/splishsplash/2.18.1/${name}`, "utf8"));
}

const wc = normalizeSPlisHSPlasHScene(
  fixture("CompressibleSPH_WCSPH.json"),
  "CompressibleSPH_WCSPH.json",
);

assert.equal(wc.schema, "splishsplash-browser-scene-ir/v1");
assert.equal(wc.configuration.simulationMethod.id, 0);
assert.equal(wc.configuration.simulationMethod.name, "WCSPH");
assert.equal(wc.configuration.boundaryHandlingMethod.name, "Bender2019");
assert.equal(wc.configuration.particleRadius, 0.025);
assert.equal(wc.solver.parameters.stiffness, 25000);
assert.equal(wc.solver.parameters.exponent, 1);
assert.equal(wc.fluidBlocks.length, 2);
assert.deepEqual(wc.fluidBlocks[0].initialVelocity, [5, 0, 0]);
assert.deepEqual(wc.fluidBlocks[1].initialVelocity, [-5, 0, 0]);
assert.equal(wc.compatibility.currentMilestoneCanRunDirectly, false);
assert.equal(wc.compatibility.nextGenericAbiCandidate, true);
assert.ok(wc.bridgeRequirements.some((item) => item.includes("Bender2019")));
assert.ok(wc.bridgeRequirements.some((item) => item.includes("UnitBox")));

const dam = normalizeSPlisHSPlasHScene(
  fixture("DamBreakModel.json"),
  "DamBreakModel.json",
);
assert.equal(dam.configuration.simulationMethod.name, "DFSPH");
assert.equal(dam.solver.parameters.maxIterations, 100);
assert.equal(dam.fluidBlocks.length, 1);
assert.deepEqual(dam.fluidBlocks[0].translation, [-1.45, 0.05, 0]);

const doubleDam = normalizeSPlisHSPlasHScene(
  fixture("DoubleDamBreak.json"),
  "DoubleDamBreak.json",
);
assert.equal(doubleDam.configuration.simulationMethod.name, "DFSPH");
assert.equal(doubleDam.fluidBlocks.length, 2);
assert.ok(doubleDam.summary.estimatedParticles > 0);

const page = readFileSync("site/tests/splishsplash-scene-json/index.html", "utf8");
const inspector = readFileSync("site/splishsplash-scene-inspector.js", "utf8");
assert.match(page, /SPlisHSPlasH upstream Scene JSON/);
assert.match(inspector, /loadSPlisHSPlasHScene/);
assert.match(inspector, /new URL\([\s\S]*import\.meta\.url/);
assert.doesNotMatch(inspector, /new URL\("\.\.\/\.\.\/", import\.meta\.url\)/);

const pagesBase = new URL("https://2rwa.github.io/sph-web-samples/splishsplash-scene-inspector.js");
assert.equal(
  new URL("./scenes/splishsplash/2.18.1/CompressibleSPH_WCSPH.json", pagesBase).href,
  "https://2rwa.github.io/sph-web-samples/scenes/splishsplash/2.18.1/CompressibleSPH_WCSPH.json",
);

console.log("SPlisHSPlasH Scene JSON adapter contract ok");
