export async function createSPlisHSPlasHBrowserModule() {
  return globalThis.createSPlisHSPlasH({
    locateFile(path) {
      return new URL(`./vendor/splishsplash/${path}`, import.meta.url).href;
    },
  });
}

function requireCall(result, name) {
  if (!result) throw new Error(`${name} failed`);
  return result;
}

export function buildSceneFromIR(Module, ir) {
  if (ir.configuration.simulationMethod.name !== "WCSPH") {
    throw new Error(`Generic browser ABI currently validates WCSPH only; got ${ir.configuration.simulationMethod.name}`);
  }

  const unsupportedBodies = ir.rigidBodies.filter((body) =>
    !body.geometryFile?.endsWith("UnitBox.obj") ||
    body.isDynamic ||
    Math.abs(body.rotationAngle) > 1e-8
  );
  if (unsupportedBodies.length) {
    throw new Error("First generic bridge supports only static, unrotated UnitBox walls");
  }

  const sourceCflMax = ir.configuration.cflMaxTimeStepSize;
  const effectiveCflMax =
    ir.configuration.boundaryHandlingMethod.name === "Bender2019" &&
    ir.rigidBodies.length > 0
      ? Math.min(sourceCflMax, 0.001)
      : sourceCflMax;

  requireCall(
    Module._sph_scene_begin(
      ir.configuration.particleRadius,
      ir.configuration.simulationMethod.id,
      ir.configuration.boundaryHandlingMethod.id,
    ),
    "sph_scene_begin",
  );

  requireCall(
    Module._sph_scene_set_gravity(...ir.configuration.gravity),
    "sph_scene_set_gravity",
  );

  requireCall(
    Module._sph_scene_set_timing(
      ir.configuration.cflMethod,
      ir.configuration.cflFactor,
      effectiveCflMax,
      Math.min(ir.configuration.timeStepSize, effectiveCflMax),
    ),
    "sph_scene_set_timing",
  );

  requireCall(
    Module._sph_scene_set_wcsph(
      Number(ir.solver.parameters.stiffness ?? 50),
      Number(ir.solver.parameters.exponent ?? 7),
    ),
    "sph_scene_set_wcsph",
  );

  const material = ir.materials[0] ?? {
    density0: 1000,
    viscosityMethod: 1,
  };
  requireCall(
    Module._sph_scene_set_material(
      material.density0,
      material.viscosityMethod,
    ),
    "sph_scene_set_material",
  );

  for (const block of ir.fluidBlocks) {
    requireCall(
      Module._sph_scene_add_fluid_block(
        ...block.start,
        ...block.end,
        ...block.translation,
        ...block.scale,
        ...block.initialVelocity,
        block.denseMode,
      ),
      "sph_scene_add_fluid_block",
    );
  }

  for (const body of ir.rigidBodies) {
    requireCall(
      Module._sph_scene_add_unit_box(
        ...body.translation,
        ...body.scale,
      ),
      "sph_scene_add_unit_box",
    );
  }

  const particles = Module._sph_scene_commit();
  if (particles <= 0) {
    throw new Error(`sph_scene_commit failed with code ${particles}`);
  }

  const substitutions = [];
  if (
    ir.configuration.boundaryHandlingMethod.name === "Bender2019" &&
    ir.rigidBodies.length > 0
  ) {
    substitutions.push(
      "Bender2019 UnitBox volume-map boundary → Akinci2012 sampled UnitBox boundary",
    );
  }
  if (effectiveCflMax !== sourceCflMax) {
    substitutions.push(
      `CFL max timestep ${sourceCflMax} → ${effectiveCflMax} for the sampled-boundary bridge`,
    );
  }

  return {
    sourceScene: ir.sourceName,
    sourceBoundaryMethod: ir.configuration.boundaryHandlingMethod.name,
    effectiveBoundaryMethod: ir.rigidBodies.length ? "Akinci2012" : ir.configuration.boundaryHandlingMethod.name,
    sourceCflMax,
    effectiveCflMax,
    particles,
    boundaryParticles: Module._sph_boundary_count(),
    substitutions,
  };
}
