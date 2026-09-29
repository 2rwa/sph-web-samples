import { loadSPlisHSPlasHScene } from "./splishsplash-scene-adapter.js";

const sceneEl = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const methodEl = document.querySelector("#method");
const boundaryEl = document.querySelector("#boundary");
const radiusEl = document.querySelector("#radius");
const blocksEl = document.querySelector("#blocks");
const particlesEl = document.querySelector("#particles");
const candidateEl = document.querySelector("#candidate");
const requirementsEl = document.querySelector("#requirements");
const irEl = document.querySelector("#ir");

async function loadSelected() {
  statusEl.textContent = "Loading…";
  const url = new URL(
    `./scenes/splishsplash/2.18.1/${sceneEl.value}`,
    import.meta.url,
  );

  try {
    const ir = await loadSPlisHSPlasHScene(url);
    methodEl.textContent = `${ir.configuration.simulationMethod.name} (${ir.configuration.simulationMethod.id})`;
    boundaryEl.textContent = `${ir.configuration.boundaryHandlingMethod.name} (${ir.configuration.boundaryHandlingMethod.id})`;
    radiusEl.textContent = String(ir.configuration.particleRadius);
    blocksEl.textContent = String(ir.summary.fluidBlocks);
    particlesEl.textContent = `~${ir.summary.estimatedParticles}`;
    candidateEl.textContent = ir.compatibility.nextGenericAbiCandidate ? "yes" : "no";

    requirementsEl.replaceChildren();
    for (const requirement of ir.bridgeRequirements) {
      const li = document.createElement("li");
      li.textContent = requirement;
      li.className = "warn";
      requirementsEl.append(li);
    }
    if (!ir.bridgeRequirements.length) {
      const li = document.createElement("li");
      li.textContent = "No browser bridge requirements detected.";
      requirementsEl.append(li);
    }

    irEl.textContent = JSON.stringify(ir, null, 2);
    statusEl.textContent = "Scene JSON normalized";
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
}

sceneEl.addEventListener("change", loadSelected);
loadSelected();
