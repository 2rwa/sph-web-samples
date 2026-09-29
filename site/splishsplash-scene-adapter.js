const SIMULATION_METHODS = new Map([
  [0, "WCSPH"],
  [1, "PCISPH"],
  [2, "PBF"],
  [3, "IISPH"],
  [4, "DFSPH"],
  [5, "PF"],
  [6, "ICSPH"],
]);

const BOUNDARY_METHODS = new Map([
  [0, "Akinci2012"],
  [1, "Koschier2017"],
  [2, "Bender2019"],
]);

function vec(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((v, i) => Number.isFinite(Number(value[i])) ? Number(value[i]) : v);
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function scaleAdd(v, scale, translate) {
  return v.map((x, i) => x * scale[i] + translate[i]);
}

function estimateBlockParticles(block, radius) {
  const diameter = radius * 2;
  if (!(diameter > 0)) return null;
  const extents = block.worldEnd.map((v, i) => Math.abs(v - block.worldStart[i]));
  return extents.reduce((product, extent) => product * Math.max(1, Math.floor(extent / diameter) + 1), 1);
}

export function normalizeSPlisHSPlasHScene(rawScene, sourceName = "scene") {
  if (!rawScene || typeof rawScene !== "object" || Array.isArray(rawScene)) {
    throw new TypeError("SPlisHSPlasH scene must be a JSON object");
  }

  const source = structuredClone(rawScene);
  const config = source.Configuration ?? {};
  const particleRadius = numberOr(config.particleRadius, 0.025);
  const simulationMethodId = numberOr(config.simulationMethod, 4);
  const boundaryMethodId = numberOr(config.boundaryHandlingMethod, 2);
  const simulationMethod = SIMULATION_METHODS.get(simulationMethodId) ?? `unknown(${simulationMethodId})`;
  const boundaryMethod = BOUNDARY_METHODS.get(boundaryMethodId) ?? `unknown(${boundaryMethodId})`;

  const materials = (source.Materials ?? []).map((material, index) => ({
    index,
    id: material.id ?? `Material${index}`,
    density0: numberOr(material.density0, 1000),
    viscosityMethod: numberOr(material.viscosityMethod, 0),
    standardViscosity: numberOr(material["Standard viscosity"]?.viscosity, 0),
    raw: structuredClone(material),
  }));

  const fluidBlocks = (source.FluidBlocks ?? []).map((block, index) => {
    const start = vec(block.start, [0, 0, 0]);
    const end = vec(block.end, [0, 0, 0]);
    const translation = vec(block.translation, [0, 0, 0]);
    const scale = vec(block.scale, [1, 1, 1]);
    const normalized = {
      index,
      denseMode: numberOr(block.denseMode, 0),
      start,
      end,
      translation,
      scale,
      initialVelocity: vec(block.initialVelocity, [0, 0, 0]),
      worldStart: scaleAdd(start, scale, translation),
      worldEnd: scaleAdd(end, scale, translation),
      raw: structuredClone(block),
    };
    normalized.estimatedParticles = estimateBlockParticles(normalized, particleRadius);
    return normalized;
  });

  const rigidBodies = (source.RigidBodies ?? []).map((body, index) => ({
    index,
    geometryFile: body.geometryFile ?? null,
    translation: vec(body.translation, [0, 0, 0]),
    rotationAxis: vec(body.rotationAxis, [1, 0, 0]),
    rotationAngle: numberOr(body.rotationAngle, 0),
    scale: vec(body.scale, [1, 1, 1]),
    isDynamic: Boolean(body.isDynamic),
    isWall: Boolean(body.isWall),
    mapInvert: Boolean(body.mapInvert),
    mapThickness: numberOr(body.mapThickness, 0),
    mapResolution: vec(body.mapResolution, [0, 0, 0]),
    raw: structuredClone(body),
  }));

  const bridgeRequirements = [];
  const coreMethodKnown = SIMULATION_METHODS.has(simulationMethodId);
  const browserMethodValidated =
    simulationMethod === "WCSPH" || simulationMethod === "DFSPH";

  if (!coreMethodKnown) {
    bridgeRequirements.push(`Unknown simulationMethod ${simulationMethodId}`);
  } else if (!browserMethodValidated) {
    bridgeRequirements.push(`${simulationMethod} exists in the compiled core but does not yet have a browser ABI regression`);
  }

  if (boundaryMethod === "Bender2019") {
    bridgeRequirements.push("Bender2019 rigid-boundary volume-map bridge is not exposed by the current browser ABI");
  } else if (boundaryMethod === "Koschier2017") {
    bridgeRequirements.push("Koschier2017 density-map bridge is not exposed by the current browser ABI");
  } else if (boundaryMethod !== "Akinci2012") {
    bridgeRequirements.push(`Unknown boundaryHandlingMethod ${boundaryMethodId}`);
  }

  for (const body of rigidBodies) {
    if (body.geometryFile?.endsWith("UnitBox.obj") && body.isWall && !body.isDynamic) {
      bridgeRequirements.push("Static UnitBox wall needs browser boundary construction from translation/rotation/scale");
    } else {
      bridgeRequirements.push(`Rigid body ${body.geometryFile ?? body.index} needs a browser geometry/boundary bridge`);
    }
  }

  const solverParameters =
    simulationMethod === "WCSPH" ? structuredClone(config.WCSPH ?? {}) :
    simulationMethod === "DFSPH" ? structuredClone(config.DFSPH ?? {}) :
    {};

  const uniqueBridgeRequirements = [...new Set(bridgeRequirements)];

  return {
    schema: "splishsplash-browser-scene-ir/v1",
    sourceName,
    source,
    configuration: {
      particleRadius,
      numberOfStepsPerRenderUpdate: numberOr(config.numberOfStepsPerRenderUpdate, 1),
      simulationMethod: { id: simulationMethodId, name: simulationMethod },
      boundaryHandlingMethod: { id: boundaryMethodId, name: boundaryMethod },
      gravity: vec(config.gravitation, [0, -9.81, 0]),
      timeStepSize: numberOr(config.timeStepSize, 0.001),
      cflMethod: numberOr(config.cflMethod, 1),
      cflFactor: numberOr(config.cflFactor, 0.5),
      cflMaxTimeStepSize: numberOr(config.cflMaxTimeStepSize, 0.005),
      cameraPosition: vec(config.cameraPosition, [0, 2, 5]),
      cameraLookat: vec(config.cameraLookat, [0, 0, 0]),
    },
    solver: {
      name: simulationMethod,
      parameters: solverParameters,
      coreMethodKnown,
      browserMethodValidated,
    },
    materials,
    fluidBlocks,
    rigidBodies,
    compatibility: {
      currentMilestoneCanRunDirectly:
        browserMethodValidated &&
        boundaryMethod === "Akinci2012" &&
        rigidBodies.length === 0,
      nextGenericAbiCandidate:
        coreMethodKnown &&
        fluidBlocks.length > 0,
    },
    bridgeRequirements: uniqueBridgeRequirements,
    summary: {
      materials: materials.length,
      fluidBlocks: fluidBlocks.length,
      rigidBodies: rigidBodies.length,
      estimatedParticles: fluidBlocks.reduce(
        (sum, block) => sum + (block.estimatedParticles ?? 0),
        0,
      ),
    },
  };
}

export async function loadSPlisHSPlasHScene(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load scene: HTTP ${response.status} ${response.statusText}`);
  }
  return normalizeSPlisHSPlasHScene(await response.json(), String(url));
}
