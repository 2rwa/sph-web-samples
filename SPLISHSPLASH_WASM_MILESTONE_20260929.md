# SPlisHSPlasH WebAssembly milestone — 2026-09-29

## Status

The first SPlisHSPlasH WebAssembly milestone is complete.

The browser build uses the real upstream **SPlisHSPlasH 2.18.1** core compiled with Emscripten. The SPH solver is not reimplemented in JavaScript. JavaScript is currently responsible only for browser control and rendering.

Reference commit before the next phase:

```text
1ce6a0197c7c401a3b7d7e207a429abab62e29a8
ci: reuse compiled SPlisHSPlasH wasm artifacts
```

## Proven execution

### Kernel smoke test

The upstream SPlisHSPlasH library links into WebAssembly and executes under Node.

Expected marker:

```text
SPLISHSPLASH_WASM_SMOKE_OK
```

### Real WCSPH stepping

A 512-particle 3D block executes the real upstream `TimeStepWCSPH::step()` path.

Reference result:

```text
SPLISHSPLASPLASH_SIM_WASM_OK
particles=512
steps=40
y0=0.795
y1=0.601782
time=0.196
```

The block is intentionally boundary-free and falls under the upstream gravity implementation.

### Akinci2012 boundary + Dam Break

A second browser scene uses upstream:

- `BoundaryModel_Akinci2012`
- `StaticRigidBody`
- `TimeStepWCSPH`
- CompactNSearch through the normal SPlisHSPlasH neighborhood-search path

The open-top tank is sampled with 7,377 boundary particles. The test confirms that the fluid has real boundary-neighbor links and remains above the floor after 320 steps.

Reference result:

```text
SPLISHSPLASH_DAMBREAK_WASM_OK
particles=432
boundary=7377
steps=320
initialLinks=1404
linksAfter30=1620
initialMinY=0.05
minY=0.025922
initialMaxX=-0.23
maxX=0.11555
time=0.319999
```

The important WCSPH parameters were aligned with upstream scene values:

```text
stiffness = 25000
exponent = 1
CFL max timestep = 0.001
```

The smaller CFL limit is intentionally stricter than the upstream desktop WCSPH example because the hand-built Akinci2012 particle tank became unstable at 0.005.

## Browser deployment

Published pages:

- <https://2rwa.github.io/sph-web-samples/tests/splishsplash-wasm/>
- <https://2rwa.github.io/sph-web-samples/tests/splishsplash-wasm-dambreak/>

The GitHub Pages repository sub-path issue is fixed. Emscripten's `locateFile()` resolves the WASM relative to the JavaScript module so it keeps the `/sph-web-samples/` prefix.

## Reference Actions

Successful reference runs:

- WASM probe #17: <https://github.com/2rwa/sph-web-samples/actions/runs/36560253284>
- Pages #79: <https://github.com/2rwa/sph-web-samples/actions/runs/36560253245>
- WASM probe #18: <https://github.com/2rwa/sph-web-samples/actions/runs/36560712213>
- Pages #80: <https://github.com/2rwa/sph-web-samples/actions/runs/36560712060>

## Generated sizes

From WASM probe #18:

```text
kernel_js_bytes=105226
kernel_wasm_bytes=138713
simulation_js_bytes=112185
simulation_wasm_bytes=872092
browser_js_bytes=126102
browser_wasm_bytes=869726
```

The browser solver is therefore below 1 MiB before transfer compression.

## Build-cache behavior

The CI now keeps:

```text
.cache/splishsplash-wasm-probe/
├── SPlisHSPlasH/
└── build/
```

The cache includes the upstream checkout, ExternalProject builds, Ninja objects, generated JavaScript and generated WASM.

The current build script also computes an input hash from the upstream version, Emscripten version, build settings, compatibility patch, and `wasm-smoke/` sources.

When the exact compiled input is already cached, the intended path is:

```text
WASM_BUILD_CACHE_EXACT_HIT
→ skip upstream preparation
→ skip CMake configure
→ skip ExternalProjects
→ skip Ninja build
→ rerun runtime tests only
```

Generated JS/WASM files are copied into `tests/splishsplash-wasm/out/` before runtime validation, so a runtime failure still leaves the exact tested binaries as an Actions artifact.

## Compatibility changes

No upstream source is committed into this repository.

`tests/splishsplash-wasm/prepare_emscripten.py` patches only the temporary/cached checkout:

- removes host-only architecture flags,
- propagates the Emscripten toolchain into ExternalProjects,
- disables hard OpenMP requirements for the current single-thread WASM build,
- keeps the patch idempotent.

The SPlisHSPlasH solver itself remains upstream code.

## Current architectural boundary

The browser target currently exposes a deliberately small C ABI:

```text
initialize predefined scenes
step simulation
read particle positions
read boundary positions
read diagnostic values
reset/destroy
```

This was enough to prove SPlisHSPlasH itself works in WebAssembly, but it is not yet a generic browser Simulator.

## Frozen milestone vs next phase

Keep this milestone as the regression baseline.

The next phase should not expand the existing hard-coded scene functions indefinitely. Instead, build a browser-side replacement for the desktop Simulator/GUI layer:

```text
upstream data/Scenes/*.json
        ↓
JavaScript scene loader / normalizer
        ↓
thin generic C ABI
        ↓
unchanged SPlisHSPlasH core in WASM
        ↓
WebGL2 / WebGPU / HTML UI
```

The goal is to preserve upstream scene data and solver behavior while replacing desktop-only scene orchestration, ImGui, and OpenGL with browser-native code.
