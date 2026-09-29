# SPlisHSPlasH Scene JSON browser adapter plan

## Goal

Run upstream SPlisHSPlasH demo scenes in the browser without porting the solver to JavaScript and without carrying the desktop ImGui/OpenGL application into WebAssembly.

The target architecture is:

```text
SPlisHSPlasH data/Scenes/*.json
            ↓
browser Scene JSON adapter (JavaScript)
            ↓
normalized scene IR
            ↓
thin C ABI
            ↓
SPlisHSPlasH 2.18.1 WASM core
            ↓
browser renderer + controls
```

## Why this direction

The existing milestone already proves that:

- the SPlisHSPlasH core compiles and runs under Emscripten,
- real WCSPH stepping works,
- CompactNSearch works,
- Akinci2012 boundary particles work,
- JavaScript can read live particle buffers,
- browser rendering does not need the upstream desktop GUI.

Therefore the next high-value work is compatibility at the scene/orchestration layer rather than another physics rewrite.

## First upstream scenes

Start with three upstream 2.18.1 scene files:

1. `CompressibleSPH_WCSPH.json`
2. `DamBreakModel.json`
3. `DoubleDamBreak.json`

They cover:

- WCSPH and DFSPH method selection,
- global gravity / CFL values,
- method-specific parameter blocks,
- materials and viscosity,
- one or multiple fluid blocks,
- static UnitBox boundaries,
- Bender2019 boundary handling.

## Phase 1 — JavaScript parser / normalized IR

Implement a browser module that reads the upstream JSON without changing it and produces a normalized structure:

```js
{
  configuration,
  solver,
  materials,
  fluidBlocks,
  rigidBodies,
  compatibility,
  bridgeRequirements
}
```

The parser should preserve unknown fields so later scene features are not silently lost.

It should distinguish:

- supported now,
- core supports it but browser ABI does not expose it yet,
- desktop Simulator feature that needs a browser replacement,
- genuinely unsupported/unknown.

## Current progress

- Phase 1 JavaScript parser / normalized IR: implemented and used by the shared Scene Browser.
- Phase 2 generic C ABI: WCSPH, DFSPH, IISPH, ICSPH, and Projective Fluids are implemented.
- Material forwarding now covers the viscosity models used by the current compressible and buckling fixtures: Standard, Bender2017, Peer2015, Peer2016, Takahashi2015, and Weiler2018.
- Native Bender2019 is used in the shared Scene Browser through precomputed Discregrid `.cdm` maps.
- Three UnitBox maps currently cover the validated scene set: 3.1³/25³ inverted, 4×3×1.5/40×30×15 inverted, and 3×0.5×3/20³ non-inverted.

## Phase 2 — generic C ABI

Replace scene-specific entry points with a small builder API.

Candidate shape:

```c
sph_scene_begin()

sph_set_particle_radius(...)
sph_set_gravity(...)
sph_set_simulation_method(...)
sph_set_cfl(...)
sph_set_solver_parameter(...)

sph_add_material(...)
sph_add_fluid_block(...)
sph_add_boundary_particles(...)

sph_scene_commit()
sph_step(...)

Implemented first-pass ABI names:

```text
sph_scene_begin
sph_scene_set_gravity
sph_scene_set_timing
sph_scene_set_wcsph
sph_scene_set_material
sph_scene_add_fluid_block
sph_scene_add_unit_box
sph_scene_commit
```
```

This wrapper may change. The important constraint is that the SPlisHSPlasH core remains upstream and unmodified.

## Phase 3 — static UnitBox bridge

The selected upstream scenes use `../models/UnitBox.obj`.

Do not immediately port the complete desktop mesh/cache pipeline.

First implement a deterministic browser bridge for the known static UnitBox wall:

- read translation / rotation / scale,
- generate equivalent boundary representation,
- keep the original JSON values visible,
- record whether the representation is exact or an approximation.

The upstream Bender2019 volume-map path is now integrated into the shared Scene Browser. Two serialized UnitBox `.cdm` maps cover the current five fixtures. The browser preloads the matching map into Emscripten MEMFS and initializes native `BoundaryModel_Bender2019`; the previous sampled-Akinci2012 substitution remains only in older standalone regression pages.

## Phase 4 — method coverage

Current browser milestone explicitly exercises WCSPH.

The SPlisHSPlasH library already contains other solver implementations in the build. Add browser ABI method selection and validate one method at a time:

- DFSPH,
- IISPH,
- PCISPH,
- PBF,
- PF,
- ICSPH.

Each method gets a small Node/WASM regression before being exposed in the browser scene selector.

## Phase 5 — browser Demo shell

Current first pass: a shared scene browser switches the validated upstream compressible, dam-break, and buckling fixtures in one Emscripten module. CI rebuilds every listed scene sequentially through the generic ABI.



Once scene construction is generic:

- scene selector,
- pause/resume/reset/single-step,
- camera controls,
- solver and scene parameter inspector,
- particle field coloring,
- boundary visibility,
- performance metrics,
- WebGL2 first,
- WebGPU/raymarch as a separate rendering layer.

## Non-goals for the first pass

Defer these until static JSON scenes work:

- ImGui port,
- desktop OpenGL port,
- PBD rigid-body coupling,
- animated rigid bodies,
- emitters,
- exporters,
- file dialogs,
- Python bindings,
- pthreads / SharedArrayBuffer.

## Success criterion for the first browser-scene phase

A browser page should be able to load an unedited upstream scene JSON, show the normalized interpretation, state any bridge substitutions explicitly, create the simulation through the generic ABI, and run it without a scene-specific C++ initializer.
