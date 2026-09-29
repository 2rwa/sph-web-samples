# SPlisHSPlasH WebAssembly build probe

Exploratory Emscripten build test for upstream **SPlisHSPlasH 2.18.1**.

## Goal

This probe answers a deliberately narrow first question:

> Can the current SPlisHSPlasH C++ core and its required libraries be compiled and linked into a runnable WebAssembly module?

Success is not just CMake configuration. The workflow must:

1. clone upstream tag `2.18.1`,
2. configure a headless/library-only build,
3. compile SPlisHSPlasH and required dependencies with Emscripten,
4. link a tiny executable that calls `SPH::CubicKernel`,
5. run the generated JavaScript/WASM under Node,
6. observe `SPLISHSPLASH_WASM_SMOKE_OK`.

## Compatibility patches

`prepare_emscripten.py` applies only build-system compatibility changes to the temporary upstream checkout:

- removes host `-march=...` flags when `EMSCRIPTEN` is active,
- forwards `CMAKE_TOOLCHAIN_FILE` into CMake `ExternalProject` dependencies,\n- disables the hard-required OpenMP CMake blocks in CompactNSearch and Discregrid for the initial single-thread WASM probe.

The upstream source is never vendored or modified in this repository.

## Local reproduction

On a machine with Emscripten, CMake, Ninja, Git, Python 3, Node, and Eigen3 headers:

```bash
bash tests/splishsplash-wasm/build.sh
```

Generated smoke artifacts are written to `tests/splishsplash-wasm/out/` and are intentionally not committed.
