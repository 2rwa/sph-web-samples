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


function queueSurfaceTension(Module, material) {
  const method = Number(material.surfaceTensionMethod ?? 0);
  requireCall(
    Module._sph_scene_set_surface_tension_method(method),
    "sph_scene_set_surface_tension_method",
  );

  const ignored = [];
  if (method !== 5) return ignored;

  const params = material.surfaceTensionParameters ?? {};
  const realNames = new Set([
    "surfaceTension",
    "surfTZRr-ratio",
    "surfTZRtau",
    "surfTZRd",
    "surfTZRPcaMixNrm",
    "surfTZRPcaMixCur",
  ]);
  const intNames = new Set([
    "surfTZRversion",
    "surfTZRCsd",
    "surfTZRsampling",
    "surfTZRnormal-mode",
    "surfTZRMCSamples",
  ]);
  const boolNames = new Set([
    "surfTZRtemporalSmooth",
  ]);

  for (const [name, rawValue] of Object.entries(params)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      ignored.push(name);
      continue;
    }

    let result = 0;
    if (realNames.has(name)) {
      result = Module.ccall(
        "sph_scene_set_surface_real",
        "number",
        ["string", "number"],
        [name, value],
      );
    } else if (intNames.has(name)) {
      result = Module.ccall(
        "sph_scene_set_surface_int",
        "number",
        ["string", "number"],
        [name, Math.trunc(value)],
      );
    } else if (boolNames.has(name)) {
      result = Module.ccall(
        "sph_scene_set_surface_bool",
        "number",
        ["string", "number"],
        [name, rawValue ? 1 : 0],
      );
    } else {
      ignored.push(name);
      continue;
    }
    requireCall(result, `surface parameter ${name}`);
  }

  return ignored;
}

export function buildSceneFromIR(Module, ir) {
  const simulationMethod = ir.configuration.simulationMethod.name;
  if (!["WCSPH", "DFSPH", "ICSPH", "PF", "IISPH"].includes(simulationMethod)) {
    throw new Error(`Generic browser ABI currently validates WCSPH/DFSPH/ICSPH/PF/IISPH only; got ${simulationMethod}`);
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

  if (simulationMethod === "WCSPH") {
    requireCall(
      Module._sph_scene_set_wcsph(
        Number(ir.solver.parameters.stiffness ?? 50),
        Number(ir.solver.parameters.exponent ?? 7),
      ),
      "sph_scene_set_wcsph",
    );
  } else if (simulationMethod === "DFSPH") {
    requireCall(
      Module._sph_scene_set_dfsph(
        Number(ir.solver.parameters.minIterations ?? 2),
        Number(ir.solver.parameters.maxIterations ?? 100),
        Number(ir.solver.parameters.maxError ?? 0.01),
        Number(ir.solver.parameters.maxIterationsV ?? 100),
        Number(ir.solver.parameters.maxErrorV ?? 0.1),
        ir.solver.parameters.enableDivergenceSolver === false ? 0 : 1,
      ),
      "sph_scene_set_dfsph",
    );
  } else if (simulationMethod === "ICSPH") {
    requireCall(
      Module._sph_scene_set_icsph(
        Number(ir.solver.parameters.minIterations ?? 2),
        Number(ir.solver.parameters.maxIterations ?? 100),
        Number(ir.solver.parameters.maxError ?? 0.01),
        Number(ir.solver.parameters.lambda ?? 200000),
        ir.solver.parameters.pressureClamping === false ? 0 : 1,
      ),
      "sph_scene_set_icsph",
    );
  } else if (simulationMethod === "PF") {
    requireCall(
      Module._sph_scene_set_pf(
        Number(ir.solver.parameters.minIterations ?? 2),
        Number(ir.solver.parameters.maxIterations ?? 100),
        Number(ir.solver.parameters.maxError ?? 1e-10),
        Number(ir.solver.parameters.stiffness ?? 50000),
      ),
      "sph_scene_set_pf",
    );
  } else if (simulationMethod === "IISPH") {
    requireCall(
      Module._sph_scene_set_iisph(
        Number(ir.solver.parameters.minIterations ?? 2),
        Number(ir.solver.parameters.maxIterations ?? 100),
        Number(ir.solver.parameters.maxError ?? 0.01),
      ),
      "sph_scene_set_iisph",
    );
  }

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
  if (material.viscosityMethod === 1) {
    requireCall(
      Module._sph_scene_set_standard_viscosity(material.standardViscosity),
      "sph_scene_set_standard_viscosity",
    );
  } else if (material.viscosityMethod === 3) {
    requireCall(
      Module._sph_scene_set_peer2015_viscosity(
        material.peer2015Viscosity,
        material.peer2015MaxIterations,
        material.peer2015MaxError,
      ),
      "sph_scene_set_peer2015_viscosity",
    );
  } else if (material.viscosityMethod === 4) {
    requireCall(
      Module._sph_scene_set_peer2016_viscosity(
        material.peer2016Viscosity,
        material.peer2016MaxIterationsV,
        material.peer2016MaxErrorV,
        material.peer2016MaxIterationsOmega,
        material.peer2016MaxErrorOmega,
      ),
      "sph_scene_set_peer2016_viscosity",
    );
  } else if (material.viscosityMethod === 2) {
    requireCall(
      Module._sph_scene_set_bender2017_viscosity(
        material.bender2017Viscosity,
        material.bender2017MaxIterations,
        material.bender2017MaxError,
      ),
      "sph_scene_set_bender2017_viscosity",
    );
  } else if (material.viscosityMethod === 5) {
    requireCall(
      Module._sph_scene_set_takahashi2015_viscosity(
        material.takahashi2015Viscosity,
        material.takahashi2015MaxIterations,
        material.takahashi2015MaxError,
      ),
      "sph_scene_set_takahashi2015_viscosity",
    );
  } else if (material.viscosityMethod === 6) {
    requireCall(
      Module._sph_scene_set_weiler2018_viscosity(
        material.weiler2018Viscosity,
        material.weiler2018BoundaryViscosity,
        material.weiler2018MaxIterations,
        material.weiler2018MaxError,
      ),
      "sph_scene_set_weiler2018_viscosity",
    );
  }

  const ignoredSurfaceParameters = queueSurfaceTension(Module, material);

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
    simulationMethod,
    sourceBoundaryMethod: ir.configuration.boundaryHandlingMethod.name,
    effectiveBoundaryMethod: ir.rigidBodies.length ? "Akinci2012" : ir.configuration.boundaryHandlingMethod.name,
    sourceCflMax,
    effectiveCflMax,
    particles,
    boundaryParticles: Module._sph_boundary_count(),
    boundaryModels: Module._sph_boundary_model_count(),
    surfaceTensionMethod: Module._sph_surface_tension_method(),
    surfaceParameterMissingCount: Module._sph_surface_parameter_missing_count(),
    ignoredSurfaceParameters,
    substitutions,
  };
}


function benderMapKey(body) {
  const s = body.scale.map((v) => Number(v));
  const r = body.mapResolution.map((v) => Number(v));
  if (
    s[0] === 3.1 && s[1] === 3.1 && s[2] === 3.1 &&
    r[0] === 25 && r[1] === 25 && r[2] === 25 &&
    body.mapInvert === true &&
    Number(body.mapThickness) === 0
  ) {
    return "unitbox-3p1-r25-i1-t0.cdm";
  }
  if (
    s[0] === 4 && s[1] === 3 && s[2] === 1.5 &&
    r[0] === 40 && r[1] === 30 && r[2] === 15 &&
    body.mapInvert === true &&
    Number(body.mapThickness) === 0
  ) {
    return "unitbox-4x3x1p5-r40x30x15-i1-t0.cdm";
  }
  if (
    s[0] === 3 && s[1] === 0.5 && s[2] === 3 &&
    r[0] === 20 && r[1] === 20 && r[2] === 20 &&
    body.mapInvert === false &&
    Number(body.mapThickness) === 0
  ) {
    return "unitbox-3x0p5x3-r20-i0-t0.cdm";
  }
  if (
    body.geometryFile?.endsWith("sphere.obj") &&
    s[0] === 1 && s[1] === 1 && s[2] === 1 &&
    r[0] === 20 && r[1] === 20 && r[2] === 20 &&
    body.mapInvert === false &&
    Number(body.mapThickness) === 0
  ) {
    return "sphere-s1-r20-i0-t0.cdm";
  }
  return null;
}

export async function prepareBender2019Maps(Module, ir) {
  if (ir.configuration.boundaryHandlingMethod.name !== "Bender2019") {
    return { prepared: 0, files: [] };
  }

  const files = [];
  for (const body of ir.rigidBodies) {
    if (body.isDynamic || Math.abs(body.rotationAngle) > 1e-8) {
      throw new Error("Bender2019 browser bridge currently supports static unrotated rigid bodies only");
    }

    const key = benderMapKey(body);
    if (!key) {
      throw new Error(`No precomputed Bender2019 map for scale=${body.scale.join("x")} resolution=${body.mapResolution.join("x")}`);
    }

    const fsPath = `/${key}`;
    try {
      Module.FS.stat(fsPath);
    } catch {
      const url = new URL(`./vendor/splishsplash/maps/${key}`, import.meta.url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not load Bender2019 map: HTTP ${response.status} ${url}`);
      }
      Module.FS.writeFile(fsPath, new Uint8Array(await response.arrayBuffer()));
    }
    files.push({ key, fsPath });
  }

  Module.__splishBenderMapFiles = files;
  return { prepared: files.length, files };
}

export function buildSceneFromIRWithPreparedBender(Module, ir) {
  if (ir.configuration.boundaryHandlingMethod.name !== "Bender2019") {
    return buildSceneFromIR(Module, ir);
  }

  const simulationMethod = ir.configuration.simulationMethod.name;
  if (!["WCSPH", "DFSPH", "ICSPH", "PF", "IISPH"].includes(simulationMethod)) {
    throw new Error(`Generic browser ABI currently validates WCSPH/DFSPH/ICSPH/PF/IISPH only; got ${simulationMethod}`);
  }

  requireCall(
    Module._sph_scene_begin(
      ir.configuration.particleRadius,
      ir.configuration.simulationMethod.id,
      ir.configuration.boundaryHandlingMethod.id,
    ),
    "sph_scene_begin",
  );

  requireCall(Module._sph_scene_set_gravity(...ir.configuration.gravity), "sph_scene_set_gravity");
  requireCall(
    Module._sph_scene_set_timing(
      ir.configuration.cflMethod,
      ir.configuration.cflFactor,
      ir.configuration.cflMaxTimeStepSize,
      Math.min(ir.configuration.timeStepSize, ir.configuration.cflMaxTimeStepSize),
    ),
    "sph_scene_set_timing",
  );

  if (simulationMethod === "WCSPH") {
    requireCall(Module._sph_scene_set_wcsph(
      Number(ir.solver.parameters.stiffness ?? 50),
      Number(ir.solver.parameters.exponent ?? 7),
    ), "sph_scene_set_wcsph");
  } else if (simulationMethod === "DFSPH") {
    requireCall(Module._sph_scene_set_dfsph(
      Number(ir.solver.parameters.minIterations ?? 2),
      Number(ir.solver.parameters.maxIterations ?? 100),
      Number(ir.solver.parameters.maxError ?? 0.01),
      Number(ir.solver.parameters.maxIterationsV ?? 100),
      Number(ir.solver.parameters.maxErrorV ?? 0.1),
      ir.solver.parameters.enableDivergenceSolver === false ? 0 : 1,
    ), "sph_scene_set_dfsph");
  } else if (simulationMethod === "ICSPH") {
    requireCall(Module._sph_scene_set_icsph(
      Number(ir.solver.parameters.minIterations ?? 2),
      Number(ir.solver.parameters.maxIterations ?? 100),
      Number(ir.solver.parameters.maxError ?? 0.01),
      Number(ir.solver.parameters.lambda ?? 200000),
      ir.solver.parameters.pressureClamping === false ? 0 : 1,
    ), "sph_scene_set_icsph");
  } else if (simulationMethod === "PF") {
    requireCall(Module._sph_scene_set_pf(
      Number(ir.solver.parameters.minIterations ?? 2),
      Number(ir.solver.parameters.maxIterations ?? 100),
      Number(ir.solver.parameters.maxError ?? 1e-10),
      Number(ir.solver.parameters.stiffness ?? 50000),
    ), "sph_scene_set_pf");
  } else if (simulationMethod === "IISPH") {
    requireCall(Module._sph_scene_set_iisph(
      Number(ir.solver.parameters.minIterations ?? 2),
      Number(ir.solver.parameters.maxIterations ?? 100),
      Number(ir.solver.parameters.maxError ?? 0.01),
    ), "sph_scene_set_iisph");
  }

  const material = ir.materials[0] ?? { density0:1000, viscosityMethod:1 };
  requireCall(Module._sph_scene_set_material(material.density0, material.viscosityMethod), "sph_scene_set_material");
  if (material.viscosityMethod === 1) {
    requireCall(
      Module._sph_scene_set_standard_viscosity(material.standardViscosity),
      "sph_scene_set_standard_viscosity",
    );
  } else if (material.viscosityMethod === 2) {
    requireCall(Module._sph_scene_set_bender2017_viscosity(
      material.bender2017Viscosity,
      material.bender2017MaxIterations,
      material.bender2017MaxError,
    ), "sph_scene_set_bender2017_viscosity");
  } else if (material.viscosityMethod === 3) {
    requireCall(Module._sph_scene_set_peer2015_viscosity(
      material.peer2015Viscosity,
      material.peer2015MaxIterations,
      material.peer2015MaxError,
    ), "sph_scene_set_peer2015_viscosity");
  } else if (material.viscosityMethod === 4) {
    requireCall(Module._sph_scene_set_peer2016_viscosity(
      material.peer2016Viscosity,
      material.peer2016MaxIterationsV,
      material.peer2016MaxErrorV,
      material.peer2016MaxIterationsOmega,
      material.peer2016MaxErrorOmega,
    ), "sph_scene_set_peer2016_viscosity");
  } else if (material.viscosityMethod === 5) {
    requireCall(Module._sph_scene_set_takahashi2015_viscosity(
      material.takahashi2015Viscosity,
      material.takahashi2015MaxIterations,
      material.takahashi2015MaxError,
    ), "sph_scene_set_takahashi2015_viscosity");
  } else if (material.viscosityMethod === 6) {
    requireCall(Module._sph_scene_set_weiler2018_viscosity(
      material.weiler2018Viscosity,
      material.weiler2018BoundaryViscosity,
      material.weiler2018MaxIterations,
      material.weiler2018MaxError,
    ), "sph_scene_set_weiler2018_viscosity");
  }

  const ignoredSurfaceParameters = queueSurfaceTension(Module, material);

  for (const block of ir.fluidBlocks) {
    requireCall(Module._sph_scene_add_fluid_block(
      ...block.start, ...block.end, ...block.translation, ...block.scale,
      ...block.initialVelocity, block.denseMode,
    ), "sph_scene_add_fluid_block");
  }

  const prepared = Module.__splishBenderMapFiles ?? [];
  if (prepared.length !== ir.rigidBodies.length) {
    throw new Error("Bender2019 maps were not prepared before scene build");
  }

  for (let i = 0; i < ir.rigidBodies.length; i += 1) {
    const body = ir.rigidBodies[i];
    const mapFile = prepared[i].fsPath;
    if (body.geometryFile?.endsWith("UnitBox.obj")) {
      const result = Module.ccall(
        "sph_scene_add_unit_box_bender_file",
        "number",
        ["number","number","number","number","number","number","string"],
        [...body.translation, ...body.scale, mapFile],
      );
      requireCall(result, "sph_scene_add_unit_box_bender_file");
    } else {
      const result = Module.ccall(
        "sph_scene_add_mesh_bender_file",
        "number",
        ["number","number","number","string"],
        [...body.translation, mapFile],
      );
      requireCall(result, "sph_scene_add_mesh_bender_file");
    }
  }

  const particles = Module._sph_scene_commit();
  if (particles <= 0) throw new Error(`sph_scene_commit failed with code ${particles}`);

  return {
    sourceScene: ir.sourceName,
    simulationMethod,
    sourceBoundaryMethod: "Bender2019",
    effectiveBoundaryMethod: "Bender2019",
    sourceCflMax: ir.configuration.cflMaxTimeStepSize,
    effectiveCflMax: ir.configuration.cflMaxTimeStepSize,
    particles,
    boundaryParticles: Module._sph_boundary_count(),
    boundaryModels: Module._sph_boundary_model_count(),
    surfaceTensionMethod: Module._sph_surface_tension_method(),
    surfaceParameterMissingCount: Module._sph_surface_parameter_missing_count(),
    ignoredSurfaceParameters,
    substitutions: [
      ...(ir.rigidBodies.length
        ? ["Bender2019 rigid-body volume map loaded from precomputed Discregrid .cdm"]
        : []),
      ...(ignoredSurfaceParameters.length
        ? [`Ignored source-only surface parameters: ${ignoredSurfaceParameters.join(", ")}`]
        : []),
    ],
  };
}
