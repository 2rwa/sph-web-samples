# SPlisHSPlasH browser Scene JSON status — 2026-09-30

## Reference point

Repository: `2rwa/sph-web-samples`

Validated implementation commit before this document:

- `fc946e0571b52a045195354caa0c1b9401a989d2` — ZR2020 break-dam surface scene
- Pages #113 — success
- WASM probe #40 — success
- Documentation follow-up `69d38fc87c78c55006134ff09d5a2027ef5e3ca7`
- Pages #114 — success

The shared browser page is:

`https://2rwa.github.io/sph-web-samples/tests/splishsplash-scene-browser/`

## Architecture now proven

```text
upstream SPlisHSPlasH 2.18.1 data/Scenes/*.json
        ↓
browser JavaScript Scene JSON adapter
        ↓
normalized scene IR
        ↓
thin generic C ABI
        ↓
upstream SPlisHSPlasH C++ core compiled by Emscripten
        ↓
browser renderer / controls
```

The upstream SPH solver implementation remains C++.
JavaScript replaces the desktop Simulator / SceneLoader / GUI orchestration layer.

Adding another already-supported static Scene JSON should normally require only
fixture / adapter / browser work, not a scene-specific C++ initializer.

## Validated solver methods

The generic WASM scene builder currently has regressions for:

- WCSPH — simulationMethod 0
- IISPH — simulationMethod 3
- DFSPH — simulationMethod 4
- Projective Fluids — simulationMethod 5
- ICSPH — simulationMethod 6

Still not browser-regressed:

- PCISPH — simulationMethod 1
- PBF — simulationMethod 2

## Validated viscosity methods

Scene JSON material forwarding currently covers the methods exercised by the
browser fixtures:

- Standard
- Bender and Koschier 2017
- Peer et al. 2015
- Peer et al. 2016
- Takahashi et al. 2015 (improved)
- Weiler et al. 2018

The buckling scenes verify these on real upstream solvers rather than only
checking parser output.

## Native Bender2019 browser bridge

Native `BoundaryModel_Bender2019` works in WASM.

The browser loads serialized Discregrid `.cdm` maps into Emscripten MEMFS and
then constructs the upstream boundary model.

Validated UnitBox maps:

1. `3.1 × 3.1 × 3.1`, resolution `25³`, inverted
2. `4 × 3 × 1.5`, resolution `40×30×15`, inverted
3. `3 × 0.5 × 3`, resolution `20³`, non-inverted

The expensive map-generation path also works in WASM; cached map loading is the
normal browser path.

The first general triangle-mesh Bender2019 path is now implemented.
Static rigid bodies now support arbitrary axis-angle transforms while reusing the same local-space volume map.

A core/WASM kinematic animation probe also succeeds by marking the existing
`StaticRigidBody` as animated, assigning linear/angular velocity, and advancing
it with `animate()`. This is an animated/kinematic boundary milestone only:
two-way force feedback through a true dynamic `PBDRigidBody` is still separate.

## Surface tension milestone

The browser build now uses:

```text
USE_THIRD_PARTY_METHODS=ON
```

This enables the upstream Zorilla/Ritter 2020 surface-tension implementation.

Instead of exposing one C function for every method-specific option, the wrapper
queues GenericParameters by name and applies them after the selected non-pressure
force object has been created.

This approach is intended to be reused for later:

- surface tension families
- vorticity
- drag
- elasticity
- other non-pressure-force modules

Known active ZR2020 parameters are typed and forwarded. Older keys still present
in upstream Scene JSON but absent from the 2.18.1 runtime parameter object remain
preserved in the source fixture and can be reported rather than silently changing
the fixture.

## Current 14 validated upstream scenes

### Compressible / solver coverage

1. `CompressibleSPH_WCSPH.json`
   - WCSPH
   - 9,826 fluid particles
   - Bender2019 UnitBox

2. `DamBreakModel.json`
   - DFSPH
   - 9,261 fluid particles
   - Bender2019 UnitBox

3. `DoubleDamBreak.json`
   - DFSPH
   - 7,200 fluid particles
   - Bender2019 UnitBox

4. `CompressibleSPH_ICSPH.json`
   - ICSPH
   - 9,826 fluid particles
   - Bender2019 UnitBox

5. `CompressibleSPH_PF.json`
   - Projective Fluids
   - 9,826 fluid particles
   - Bender2019 UnitBox

### Buckling / viscosity coverage

6. `BucklingModel_Peer2015.json`
   - IISPH
   - Peer2015 viscosity
   - 6,240 particles

7. `BucklingModel_Peer2016.json`
   - IISPH
   - Peer2016 viscosity
   - 6,240 particles

8. `BucklingModel_Bender2017.json`
   - DFSPH
   - Bender2017 viscosity
   - 6,240 particles

9. `BucklingModel_Takahashi2015.json`
   - DFSPH
   - Takahashi2015 viscosity
   - 6,240 particles

10. `BucklingModel_Weiler2018.json`
    - DFSPH
    - Weiler2018 viscosity
    - 6,240 particles

The five buckling fixtures reuse the non-inverted `3 × 0.5 × 3 / 20³`
Bender2019 obstacle map.

### Zorilla/Ritter 2020 surface tension

11. `SurfaceTension_NoGravCube_ZR2020.json`
    - IISPH
    - 12,167 particles
    - surfaceTensionMethod 5
    - no rigid body

Reference regression:

```text
SPLISHSPLASH_SURFACE_ZR2020_WASM_OK
particles=12167
surfaceMethod=5
missingParams=0
steps=1
method=3
iterations=2
minY=-0.450008
time=0.001
```

12. `SurfaceTension_DoubleDroplet_ZR2020.json`
    - IISPH
    - 9,826 particles
    - surfaceTensionMethod 5
    - `surfTZRtemporalSmooth=true`

Reference regression:

```text
SPLISHSPLASH_SURFACE_ZR2020_DOUBLE_WASM_OK
particles=9826
surfaceMethod=5
missingParams=0
steps=1
time=0.001
```

13. `SurfaceTension_BreakDamZR2020.json`
    - DFSPH
    - 30,682 fluid particles
    - 10,002 Akinci2012 boundary particles
    - surfaceTensionMethod 5

Reference regression:

```text
SPLISHSPLASH_SURFACE_ZR2020_BREAKDAM_WASM_OK
particles=30682
boundary=10002
boundaryMethod=0
surfaceMethod=5
missingParams=0
steps=1
minY=0.0432326
time=0.001
```

## Browser CI

The Scene Browser CI loads all current fixtures sequentially into one generated
Emscripten module, rebuilds the simulation through the generic ABI, advances one
step, and checks finite state / method / particle-count / boundary expectations.

Pages #113 produced:

```text
SPlisHSPlasH scene browser CI status: CI SPlisHSPlasH scene browser ok
```

Pages #114 also completed successfully after the documentation update.

## Current WASM size

With third-party methods enabled, the browser WASM observed in probe #38 was:

```text
browser_wasm_bytes=1329373
```

This remains small enough for the current Pages experiment.

## Important remaining compatibility gaps

High-value next targets:

1. General static triangle-mesh Bender2019 boundary
   - immediate target: upstream `sphere.obj`
   - target scene: `SurfaceTension_CoveredSphere_ZR2020.json`

2. General mesh/map cache keying
   - geometry content hash
   - transform / scale
   - map resolution
   - invert / thickness
   - SPlisHSPlasH / Discregrid version

3. Additional solver methods
   - PCISPH
   - PBF

4. Emitters
   - required by several Jeske 2023 surface-tension examples

5. Dynamic / animated rigid bodies and PBD coupling
   - animated/kinematic `StaticRigidBody` motion: core/WASM probe passed
   - browser Scene JSON wiring: pending
   - true dynamic `PBDRigidBody` / PositionBasedDynamics coupling: pending

6. Koschier2017 density maps

7. Generic non-pressure-force adapter extensions
   - vorticity
   - drag
   - elasticity

## Immediate next experiment

Use upstream:

`data/Scenes/SurfaceTension_CoveredSphere_ZR2020.json`

It combines:

- DFSPH
- ZR2020 surface tension
- Bender2019
- static `../models/sphere.obj`
- map resolution `20×20×20`
- non-inverted map

The physics and surface-tension parts are already validated.
The new unknown is specifically the general-mesh Bender2019 bridge.

Preferred implementation direction:

```text
upstream mesh asset
   ↓
browser/build-time mesh loader
   ↓
triangle mesh → Discregrid volume map
   ↓
serialize .cdm during Actions
   ↓
browser fetch → MEMFS
   ↓
BoundaryModel_Bender2019
```

Do not special-case a sphere analytically as the final implementation. An
analytic sphere SDF can be used as a diagnostic probe, but the compatibility
goal is the upstream triangle mesh and a reusable mesh-cache pipeline.

## Resume instruction

Read this file, inspect the current main branch and latest Actions, then continue
with general static-mesh Bender2019 support using
`SurfaceTension_CoveredSphere_ZR2020.json` as the first end-to-end target.


## General triangle-mesh Bender2019 result

Implemented commits:

- `b22e91f61a73d664b9093d2cfa21e6f562208023` — generic mesh Bender2019 WASM probe
- `e53fa5844e7d08cc6bad0d904d5a36a4c6818245` — upstream CoveredSphere scene
- `698915521901f4aa85081bac6bdf925c5d1752a6` — mesh boundary browser contract fix
- `a1f91cf36b73010c24fe013db18feb782851ca7d` — versioned generic mesh map keys

The probe reads the upstream OBJ file, scales the mesh in local space, creates
a `Discregrid::TriangleMeshDistance`, constructs the Bender volume field and
serializes the resulting `.cdm`.

Reference first-generation result:

```text
SPLISHSPLASH_MESH_BENDER_WASM_OK
particles=4851
boundaryModels=1
boundaryMethod=2
mesh=sphere.obj
mapResolution=20x20x20
mapSource=generated
mapMs=1104.35
steps=1
minY=1.03999
time=0.001
```

The versioned map key is:

```text
sphere-v2p18p1-pr0p02-s1x1x1-r20x20x20-i0-t0.cdm
```

Map size:

```text
3107048 bytes
```

Probe #42 regenerated the versioned key successfully (about 1.22 s).
Pages #119 then loaded the cached map in about 3.24 ms and reported:

```text
SPlisHSPlasH scene browser CI status: CI SPlisHSPlasH scene browser ok
```

### Scene 14

`SurfaceTension_CoveredSphere_ZR2020.json`

- DFSPH
- Zorilla/Ritter 2020 surface tension
- 90,988 fluid particles in the current browser block sampler
- upstream `sphere.obj`
- static native Bender2019 boundary
- 20×20×20 map
- mapInvert=false
- mapThickness=0
- Headless Chrome one-step regression passed in Pages #119

## Static rotation result

Implemented commits:

- `998bd47769ed12cb5b533181028216a2d2aece8f` — axis-angle transforms for static Bender2019 boundaries
- `b1760628bb3abbf897a0cb2b7e2f1b4ceff6bd0a` — close the rotation smoke-test main block

Validation:

- WASM build probe #44 — success
- Pages #122 — success

Reference regression:

```text
SPLISHSPLASH_ROTATED_BENDER_WASM_OK
particles=1331
boundaryModels=1
axis=0,0,1
expectedAngle=0.35
actualAngle=0.35
mapReuse=unitbox-3x0p5x3-r20-i0-t0.cdm
steps=1
time=0.001
```

The map stays in rigid-body local space. Rotation therefore does not require
regenerating the Discregrid map.

## Animated / kinematic boundary result

Commit:

- `49339e478d46da22f521db4e431f39315b1bf367` — minimal animated Bender2019 motion probe

Validation:

- WASM build probe #45 — success
- Pages #123 — success

Reference regression:

```text
SPLISHSPLASH_ANIMATED_BENDER_WASM_OK
particles=1331
boundaryModels=1
vx=0.25
wz=0.5
x0=0
x1=0.00025
angle0=0
angle1=0.0005
mapReuse=unitbox-3x0p5x3-r20-i0-t0.cdm
steps=1
time=0.001
```

This uses the upstream `StaticRigidBody` animation path rather than inventing a
browser-only transform. Bender2019 already transforms each particle query using
the rigid body's current position and rotation, so the cached local-space
volume map remains valid while the body moves.

This does **not** yet prove two-way rigid-fluid dynamics. A `StaticRigidBody`
reports `isDynamic() == false`; the next true-dynamic milestone is the
PositionBasedDynamics-backed `PBDRigidBody` path.

## Immediate next experiment

Compile the exact PositionBasedDynamics revision pinned by SPlisHSPlasH 2.18.1
under the same Emscripten toolchain.

The upstream SPlisHSPlasH CMake configuration pins:

```text
PositionBasedDynamics
10a70bc146a97873dc3c8fef372f5217e010542e
```

If the library-only PBD external project builds under Emscripten, the next
integration target is a minimal `PBDRigidBody` bridge, followed by upstream
`MotorScene.json` / `MotorScene2.json`.

The only upstream animated-body Scene JSON in the current 2.18.1 examples is
`AnimatedBody_2D.json`. It is useful later for browser-side scripted
kinematics, but it combines an Akinci2012 general mesh (`Dragon_50k.obj`) with
a Python animation script, so it is not the smallest next compatibility step.

## Resume instruction

Read this file, inspect current main and Actions, then continue from the PBD
Emscripten compile probe. Keep animated/kinematic boundaries distinct from true
dynamic/PBD coupling in tests and documentation.
