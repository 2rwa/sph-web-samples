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
