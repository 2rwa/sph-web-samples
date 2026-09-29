#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
WORK_ROOT="${SPLISHSPLASH_WASM_WORK_ROOT:-$REPO_ROOT/.cache/splishsplash-wasm-probe}"
BUILD_DIR="$WORK_ROOT/build"
OUT_DIR="$TEST_DIR/pbd-out"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "== ensure the cached SPlisHSPlasH tree matches the current prepare/build inputs =="
bash "$TEST_DIR/build.sh"

echo "== build SPlisHSPlasH-pinned PositionBasedDynamics with Emscripten =="
cmake --build "$BUILD_DIR" --target Ext_PBD --parallel 2

# Cached ExternalProject stamps can skip PATCH_COMMAND even when the helper
# implementation changed.  Normalize the installed consumer header as well so
# SPlisHSPlasH/Simulation.h and PBD Simulation/Simulation.h can coexist.
PBD_SIM_HEADER="$BUILD_DIR/extern/install/PositionBasedDynamics/include/Simulation/Simulation.h"
python3 - "$PBD_SIM_HEADER" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = "#ifndef __Simulation_h__\n#define __Simulation_h__"
new = "#ifndef __PBD_Simulation_h__\n#define __PBD_Simulation_h__"
if new not in text:
    if text.count(old) != 1:
        raise SystemExit(
            f"unexpected installed PBD Simulation.h guard layout: {text.count(old)} matches"
        )
    path.write_text(text.replace(old, new, 1))
print(f"pbd_simulation_header_guard={new.splitlines()[0]}")
PY

PBD_LIB="$(find "$BUILD_DIR" -type f -path '*PositionBasedDynamics*' -name 'libPositionBasedDynamics.a' -print -quit 2>/dev/null || true)"
SIM_LIB="$(find "$BUILD_DIR" -type f -path '*PositionBasedDynamics*' -name 'libSimulation.a' -print -quit 2>/dev/null || true)"
UTIL_LIB="$(find "$BUILD_DIR" -type f -path '*PositionBasedDynamics*' -name 'libUtils.a' -print -quit 2>/dev/null || true)"

if [[ -z "$PBD_LIB" || -z "$SIM_LIB" || -z "$UTIL_LIB" ]]; then
  echo "PBD build completed but expected Emscripten static libraries were not found" >&2
  find "$BUILD_DIR" -type f -path '*PositionBasedDynamics*' | sort | tail -200 >&2 || true
  exit 20
fi

{
  echo "marker=SPLISHSPLASH_PBD_WASM_BUILD_OK"
  echo "pbd_commit=10a70bc146a97873dc3c8fef372f5217e010542e"
  echo "emcc=$(emcc --version | head -1)"
  echo "position_based_dynamics_lib=$PBD_LIB"
  echo "position_based_dynamics_bytes=$(wc -c < "$PBD_LIB")"
  echo "simulation_lib=$SIM_LIB"
  echo "simulation_bytes=$(wc -c < "$SIM_LIB")"
  echo "utils_lib=$UTIL_LIB"
  echo "utils_bytes=$(wc -c < "$UTIL_LIB")"
} | tee "$OUT_DIR/build-info.txt"

echo "SPLISHSPLASH_PBD_WASM_BUILD_OK"

echo "== link minimal SPlisHSPlasH PBDRigidBody bridge probe =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_smoke --parallel 2

PBD_SMOKE_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_smoke.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_SMOKE_JS" || ! -s "$PBD_SMOKE_JS" || ! -s "${PBD_SMOKE_JS%.js}.wasm" ]]; then
  echo "PBD rigid-body smoke output not found" >&2
  find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_smoke*' -print 2>/dev/null || true
  exit 21
fi

echo "pbd_smoke_js=$PBD_SMOKE_JS" | tee -a "$OUT_DIR/build-info.txt"
echo "pbd_smoke_wasm_bytes=$(wc -c < "${PBD_SMOKE_JS%.js}.wasm")" | tee -a "$OUT_DIR/build-info.txt"

/usr/bin/node "$PBD_SMOKE_JS" | tee "$OUT_DIR/runtime.txt"
grep -q 'SPLISHSPLASH_PBD_RIGIDBODY_WASM_OK' "$OUT_DIR/runtime.txt"

echo "== run real SPH -> Bender2019 -> PBD two-way coupling probe =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_coupling_smoke --parallel 2
PBD_COUPLING_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_coupling_smoke.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_COUPLING_JS" || ! -s "$PBD_COUPLING_JS" || ! -s "${PBD_COUPLING_JS%.js}.wasm" ]]; then
  echo "PBD coupling smoke output not found" >&2
  exit 22
fi

echo "pbd_coupling_wasm_bytes=$(wc -c < "${PBD_COUPLING_JS%.js}.wasm")" | tee -a "$OUT_DIR/build-info.txt"
(
  cd "$WORK_ROOT/maps"
  /usr/bin/node "$PBD_COUPLING_JS"
) | tee "$OUT_DIR/coupling-runtime.txt"
grep -q 'SPLISHSPLASH_PBD_COUPLING_WASM_OK' "$OUT_DIR/coupling-runtime.txt"

echo "== sweep stable SPH -> PBD coupling parameters =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_coupling_sweep --parallel 2
PBD_SWEEP_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_coupling_sweep.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_SWEEP_JS" || ! -s "$PBD_SWEEP_JS" || ! -s "${PBD_SWEEP_JS%.js}.wasm" ]]; then
  echo "PBD coupling sweep output not found" >&2
  exit 23
fi
(
  cd "$WORK_ROOT/maps"
  /usr/bin/node "$PBD_SWEEP_JS"
) | tee "$OUT_DIR/coupling-sweep.txt"
grep -q 'SPLISHSPLASH_PBD_SWEEP_OK' "$OUT_DIR/coupling-sweep.txt"

echo "== build browser PBD coupling module =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_browser --parallel 2
PBD_BROWSER_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_browser.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_BROWSER_JS" || ! -s "$PBD_BROWSER_JS" || ! -s "${PBD_BROWSER_JS%.js}.wasm" ]]; then
  echo "PBD browser output not found" >&2
  exit 24
fi
PBD_SITE_DIR="$REPO_ROOT/site/vendor/splishsplash-pbd"
mkdir -p "$PBD_SITE_DIR"
cp "$PBD_BROWSER_JS" "$PBD_SITE_DIR/splishsplash_pbd_browser.js"
cp "${PBD_BROWSER_JS%.js}.wasm" "$PBD_SITE_DIR/splishsplash_pbd_browser.wasm"
echo "pbd_browser_wasm_bytes=$(wc -c < "${PBD_BROWSER_JS%.js}.wasm")" | tee -a "$OUT_DIR/build-info.txt"

echo "== sweep gravity-driven fluid impact into supported PBD plate =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_gravity_sweep --parallel 2
PBD_GRAVITY_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_gravity_sweep.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_GRAVITY_JS" || ! -s "$PBD_GRAVITY_JS" || ! -s "${PBD_GRAVITY_JS%.js}.wasm" ]]; then
  echo "PBD gravity sweep output not found" >&2
  exit 25
fi
(
  cd "$WORK_ROOT/maps"
  /usr/bin/node "$PBD_GRAVITY_JS"
) | tee "$OUT_DIR/gravity-sweep.txt"
grep -q 'SPLISHSPLASH_PBD_GRAVITY_SWEEP_OK' "$OUT_DIR/gravity-sweep.txt"

echo "pbd_timestep_controller_probe=enabled" | tee -a "$OUT_DIR/build-info.txt"
echo "== run upstream PBD TimeStepController bridge probe =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_timestep_smoke --parallel 2
PBD_TIMESTEP_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_timestep_smoke.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_TIMESTEP_JS" || ! -s "$PBD_TIMESTEP_JS" || ! -s "${PBD_TIMESTEP_JS%.js}.wasm" ]]; then
  echo "PBD timestep smoke output not found" >&2
  exit 26
fi
/usr/bin/node "$PBD_TIMESTEP_JS" | tee "$OUT_DIR/pbd-timestep-runtime.txt"
grep -q 'SPLISHSPLASH_PBD_TIMESTEP_WASM_OK' "$OUT_DIR/pbd-timestep-runtime.txt"

echo "== run SPH -> Bender2019 -> upstream PBD timestep coupling probe =="
cmake --build "$BUILD_DIR" --target splishsplash_pbd_upstream_coupling_smoke --parallel 2
PBD_UPSTREAM_JS="$(find "$WORK_ROOT/SPlisHSPlasH/bin" "$BUILD_DIR" -type f -name 'splishsplash_pbd_upstream_coupling_smoke.js' -print -quit 2>/dev/null || true)"
if [[ -z "$PBD_UPSTREAM_JS" || ! -s "$PBD_UPSTREAM_JS" || ! -s "${PBD_UPSTREAM_JS%.js}.wasm" ]]; then
  echo "PBD upstream coupling smoke output not found" >&2
  exit 27
fi
(
  cd "$WORK_ROOT/maps"
  /usr/bin/node "$PBD_UPSTREAM_JS"
) | tee "$OUT_DIR/pbd-upstream-coupling-runtime.txt"
grep -q 'SPLISHSPLASH_PBD_UPSTREAM_COUPLING_WASM_OK' "$OUT_DIR/pbd-upstream-coupling-runtime.txt"
