#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
WORK_ROOT="${SPLISHSPLASH_WASM_WORK_ROOT:-${RUNNER_TEMP:-/tmp}/splishsplash-wasm-probe}"
SRC_DIR="$WORK_ROOT/SPlisHSPlasH"
BUILD_DIR="$WORK_ROOT/build"
OUT_DIR="$TEST_DIR/out"
SITE_VENDOR_DIR="$REPO_ROOT/site/vendor/splishsplash"

rm -rf "$WORK_ROOT" "$OUT_DIR" "$SITE_VENDOR_DIR"
mkdir -p "$WORK_ROOT" "$OUT_DIR" "$SITE_VENDOR_DIR"

echo "== toolchain =="
emcc --version
emcmake cmake --version
ninja --version
node --version

echo "== clone upstream =="
git clone --depth 1 --branch 2.18.1 \
  https://github.com/InteractiveComputerGraphics/SPlisHSPlasH.git \
  "$SRC_DIR"

python3 "$TEST_DIR/prepare_emscripten.py" "$SRC_DIR"

rm -rf "$SRC_DIR/WasmSmoke"
cp -R "$TEST_DIR/wasm-smoke" "$SRC_DIR/WasmSmoke"
cat >> "$SRC_DIR/CMakeLists.txt" <<'CMAKE_EOF'

if (EMSCRIPTEN)
    add_subdirectory(WasmSmoke)
endif()
CMAKE_EOF

echo "== configure =="
emcmake cmake \
  -S "$SRC_DIR" \
  -B "$BUILD_DIR" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.10 \
  -DEIGEN3_INCLUDE_DIR=/usr/include/eigen3 \
  -DSPH_LIBS_ONLY=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DUSE_AVX=OFF \
  -DUSE_OpenMP=OFF \
  -DUSE_DOUBLE_PRECISION=OFF \
  -DUSE_PYTHON_BINDINGS=OFF \
  -DUSE_THIRD_PARTY_METHODS=OFF

echo "== build wasm ExternalProject dependencies first =="
cmake --build "$BUILD_DIR" \
  --target Ext_NeighborhoodSearch Ext_GenericParameters Ext_Discregrid \
  --parallel 2

echo "== build SPlisHSPlasH WASM targets =="
cmake --build "$BUILD_DIR" \
  --target splishsplash_wasm_smoke splishsplash_sim_smoke splishsplash_browser \
  --parallel 2

find_generated() {
  local name="$1"
  find "$SRC_DIR/bin" "$BUILD_DIR" -type f -name "$name" -print -quit 2>/dev/null || true
}

run_node_probe() {
  local js_file="$1"
  local marker="$2"
  local log_file="$3"

  local wasm_file="${js_file%.js}.wasm"
  if [[ ! -s "$js_file" || ! -s "$wasm_file" ]]; then
    echo "missing JS/WASM pair for $js_file" >&2
    exit 4
  fi

  set +e
  node "$js_file" > >(tee "$OUT_DIR/$log_file") \
    2> >(tee "$OUT_DIR/${log_file%.log}.err.log" >&2)
  local status=$?
  set -e

  echo "node_exit_status=$status" | tee "$OUT_DIR/${log_file%.log}-status.txt"
  if [[ "$status" -ne 0 ]]; then
    exit "$status"
  fi
  grep -q "$marker" "$OUT_DIR/$log_file"
}

echo "== execute kernel smoke under Node =="
echo "PATH node: $(command -v node) ($(node --version))"
if [[ -x /usr/bin/node ]]; then
  echo "/usr/bin/node: $(/usr/bin/node --version)"
fi

KERNEL_JS="$(find_generated splishsplash_wasm_smoke.js)"
SIM_JS="$(find_generated splishsplash_sim_smoke.js)"
BROWSER_JS="$(find_generated splishsplash_browser.js)"

if [[ -z "$KERNEL_JS" || -z "$SIM_JS" || -z "$BROWSER_JS" ]]; then
  echo "one or more generated JS files not found" >&2
  find "$SRC_DIR/bin" "$BUILD_DIR" -maxdepth 5 -type f 2>/dev/null | sort | tail -250 || true
  exit 3
fi

run_node_probe "$KERNEL_JS" "SPLISHSPLASH_WASM_SMOKE_OK" "kernel-runtime.log"

echo "== execute real WCSPH simulation smoke under Node =="
run_node_probe "$SIM_JS" "SPLISHSPLASH_SIM_WASM_OK" "simulation-runtime.log"

BROWSER_WASM="${BROWSER_JS%.js}.wasm"
cp "$KERNEL_JS" "${KERNEL_JS%.js}.wasm" "$OUT_DIR/"
cp "$SIM_JS" "${SIM_JS%.js}.wasm" "$OUT_DIR/"
cp "$BROWSER_JS" "$BROWSER_WASM" "$OUT_DIR/"
cp "$BROWSER_JS" "$SITE_VENDOR_DIR/splishsplash_browser.js"
cp "$BROWSER_WASM" "$SITE_VENDOR_DIR/splishsplash_browser.wasm"

{
  echo "upstream=SPlisHSPlasH"
  echo "upstream_tag=2.18.1"
  echo "emcc=$(emcc --version | head -1)"
  echo "kernel_js_bytes=$(wc -c < "$KERNEL_JS")"
  echo "kernel_wasm_bytes=$(wc -c < "${KERNEL_JS%.js}.wasm")"
  echo "simulation_js_bytes=$(wc -c < "$SIM_JS")"
  echo "simulation_wasm_bytes=$(wc -c < "${SIM_JS%.js}.wasm")"
  echo "browser_js_bytes=$(wc -c < "$BROWSER_JS")"
  echo "browser_wasm_bytes=$(wc -c < "$BROWSER_WASM")"
} | tee "$OUT_DIR/build-info.txt"

echo "SPlisHSPlasH WebAssembly build + WCSPH simulation probes passed."
