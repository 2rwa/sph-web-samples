# SPlisHSPlasH WebAssembly probe

Exploratory Emscripten build and browser-execution test for upstream **SPlisHSPlasH 2.18.1**.

## Proven stages

The probe now checks more than a kernel-only link:

1. clone upstream tag `2.18.1`,
2. configure a headless/library-only Emscripten build,
3. build CompactNSearch, GenericParameters, Discregrid and the SPlisHSPlasH core,
4. link and execute a small `SPH::CubicKernel` Node/WASM smoke test,
5. instantiate a real 3D fluid model,
6. select upstream `WCSPH`,
7. execute `TimeStepWCSPH::step()` for 40 steps under Node/WASM,
8. verify finite particle positions, positive simulation time, and downward center-of-mass motion,
9. build a modular browser JS/WASM target,
10. publish it under `site/vendor/splishsplash/`,
11. run the Pages test page in Headless Chrome and repeat the 40-step motion check,
12. build an Akinci2012 open tank from real boundary particles,
13. run a 432-particle Dam Break for 220 steps under Node/WASM,
14. run the same Dam Break containment check in Headless Chrome.

Expected markers:

```text
SPLISHSPLASH_WASM_SMOKE_OK
SPLISHSPLASH_SIM_WASM_OK
CI SPlisHSPlasH browser ok
SPLISHSPLASH_DAMBREAK_WASM_OK
CI SPlisHSPlasH Dam Break ok
```

## Current browser scene

The first browser milestone uses a 3D lattice with 216, 512, or 1000 particles and **no boundary model**. That is intentional: it isolates actual SPlisHSPlasH/WCSPH execution from boundary setup. The particle block therefore free-falls under SPlisHSPlasH gravity and eventually passes through y=0.

The second browser milestone adds an open-top tank using upstream `BoundaryModel_Akinci2012` with a `StaticRigidBody`. The boundary surface is sampled directly onto the same 0.05-unit grid as the 0.025-radius fluid particles. The browser exposes 432 / 896 / 1600-particle Dam Break presets and renders the actual boundary particles separately from the fluid.

## Compatibility patches

`prepare_emscripten.py` changes only the temporary upstream checkout:

- removes host-only `-march=...` flags under Emscripten,
- forwards the Emscripten CMake toolchain into upstream `ExternalProject` builds,
- disables hard-required OpenMP blocks in CompactNSearch and Discregrid for the single-thread WASM build,
- keeps those patches idempotent because upstream ExternalProject patch steps can run more than once.

The upstream source is not vendored.

## Local reproduction

Requires Emscripten, CMake, Ninja, Git, Python 3, Node, and Eigen3 headers.

```bash
bash tests/splishsplash-wasm/build.sh
node tests/splishsplash_browser_contract.mjs
node tests/splishsplash_dambreak_contract.mjs
python3 -m http.server -d site 8000
```

Browser URL:

```text
http://localhost:8000/tests/splishsplash-wasm/
http://localhost:8000/tests/splishsplash-wasm-dambreak/
```

Generated build artifacts are written to `tests/splishsplash-wasm/out/`; browser JS/WASM is copied to `site/vendor/splishsplash/`. Both are build outputs and are not intended to be committed.
