#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
WORK_ROOT="${SPLISHSPLASH_WASM_WORK_ROOT:-$REPO_ROOT/.cache/splishsplash-wasm-probe}"
SRC_DIR="$WORK_ROOT/SPlisHSPlasH"
BUILD_DIR="$WORK_ROOT/build"
OUT_DIR="$TEST_DIR/out"
SITE_VENDOR_DIR="$REPO_ROOT/site/vendor/splishsplash"
SITE_MAP_DIR="$SITE_VENDOR_DIR/maps"
BUILD_STAMP="$WORK_ROOT/build-input.sha256"
UPSTREAM_TAG="2.18.1"

rm -rf "$OUT_DIR" "$SITE_VENDOR_DIR"
MAP_DIR="$WORK_ROOT/maps"
mkdir -p "$WORK_ROOT" "$OUT_DIR" "$SITE_VENDOR_DIR" "$SITE_MAP_DIR" "$MAP_DIR"
cp "$TEST_DIR/wasm-smoke/assets/sphere.obj" "$MAP_DIR/sphere.obj"
rm -f "$MAP_DIR/sphere-s1-r20-i0-t0.cdm"

echo "== toolchain =="
EMCC_VERSION="$(emcc --version | head -1)"
echo "$EMCC_VERSION"
emcmake cmake --version
ninja --version
node --version

compute_input_hash() {
  {
    printf '%s\n' \
      "cache-format=v2" \
      "upstream=$UPSTREAM_TAG" \
      "generator=Ninja" \
      "build-type=Release" \
      "sph-libs-only=ON" \
      "shared-libs=OFF" \
      "avx=OFF" \
      "openmp=OFF" \
      "double=OFF" \
      "python=OFF" \
      "third-party=ON" \
      "$EMCC_VERSION"

    sha256sum "$TEST_DIR/prepare_emscripten.py"

    while IFS= read -r -d '' file; do
      sha256sum "$file"
    done < <(find "$TEST_DIR/wasm-smoke" -type f -print0 | sort -z)
  } | sha256sum | awk '{print $1}'
}

INPUT_HASH="$(compute_input_hash)"
echo "wasm_build_input_hash=$INPUT_HASH"

find_generated() {
  local name="$1"
  find "$SRC_DIR/bin" "$BUILD_DIR" -type f -name "$name" -print -quit 2>/dev/null || true
}

cached_outputs_exist() {
  local kernel_js sim_js browser_js
  kernel_js="$(find_generated splishsplash_wasm_smoke.js)"
  sim_js="$(find_generated splishsplash_sim_smoke.js)"
  browser_js="$(find_generated splishsplash_browser.js)"

  [[ -n "$kernel_js" && -s "$kernel_js" && -s "${kernel_js%.js}.wasm" ]] &&
  [[ -n "$sim_js" && -s "$sim_js" && -s "${sim_js%.js}.wasm" ]] &&
  [[ -n "$browser_js" && -s "$browser_js" && -s "${browser_js%.js}.wasm" ]]
}

EXACT_BUILD_HIT=0
if [[ -f "$BUILD_STAMP" ]] &&
   [[ "$(cat "$BUILD_STAMP")" == "$INPUT_HASH" ]] &&
   cached_outputs_exist; then
  EXACT_BUILD_HIT=1
fi

if [[ "$EXACT_BUILD_HIT" -eq 1 ]]; then
  echo "== exact compiled WASM cache hit =="
  echo "WASM_BUILD_CACHE_EXACT_HIT"
  echo "Skipping upstream preparation, CMake configure, ExternalProjects, and Ninja build."
else
  echo "== prepare upstream checkout =="
  if [[ ! -d "$SRC_DIR/.git" ]]; then
    git clone --depth 1 --branch "$UPSTREAM_TAG" \
      https://github.com/InteractiveComputerGraphics/SPlisHSPlasH.git \
      "$SRC_DIR"
  else
    echo "Reusing cached upstream checkout: $SRC_DIR"
  fi

  python3 "$TEST_DIR/prepare_emscripten.py" "$SRC_DIR"

  rm -rf "$SRC_DIR/WasmSmoke"
  cp -R "$TEST_DIR/wasm-smoke" "$SRC_DIR/WasmSmoke"
  if ! grep -q 'add_subdirectory(WasmSmoke)' "$SRC_DIR/CMakeLists.txt"; then
    cat >> "$SRC_DIR/CMakeLists.txt" <<'CMAKE_EOF'

if (EMSCRIPTEN)
    add_subdirectory(WasmSmoke)
endif()
CMAKE_EOF
  fi

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
    -DUSE_THIRD_PARTY_METHODS=ON

  echo "== build wasm ExternalProject dependencies first =="
  cmake --build "$BUILD_DIR" \
    --target Ext_NeighborhoodSearch Ext_GenericParameters Ext_Discregrid \
    --parallel 2

  echo "== build SPlisHSPlasH WASM targets =="
  cmake --build "$BUILD_DIR" \
    --target splishsplash_wasm_smoke splishsplash_sim_smoke splishsplash_browser \
    --parallel 2

  # The compiled outputs are valid even if a later runtime smoke test fails.
  printf '%s\n' "$INPUT_HASH" > "$BUILD_STAMP"
fi

KERNEL_JS="$(find_generated splishsplash_wasm_smoke.js)"
SIM_JS="$(find_generated splishsplash_sim_smoke.js)"
BROWSER_JS="$(find_generated splishsplash_browser.js)"

if [[ -z "$KERNEL_JS" || -z "$SIM_JS" || -z "$BROWSER_JS" ]]; then
  echo "one or more generated JS files not found" >&2
  find "$SRC_DIR/bin" "$BUILD_DIR" -maxdepth 5 -type f 2>/dev/null | sort | tail -250 || true
  exit 3
fi

KERNEL_WASM="${KERNEL_JS%.js}.wasm"
SIM_WASM="${SIM_JS%.js}.wasm"
BROWSER_WASM="${BROWSER_JS%.js}.wasm"

# Preserve compiled artifacts before runtime tests. If a probe fails, upload-artifact
# still receives the exact JS/WASM pair that was tested.
cp "$KERNEL_JS" "$KERNEL_WASM" "$OUT_DIR/"
cp "$SIM_JS" "$SIM_WASM" "$OUT_DIR/"
cp "$BROWSER_JS" "$BROWSER_WASM" "$OUT_DIR/"
cp "$BROWSER_JS" "$SITE_VENDOR_DIR/splishsplash_browser.js"
cp "$BROWSER_WASM" "$SITE_VENDOR_DIR/splishsplash_browser.wasm"

{
  echo "upstream=SPlisHSPlasH"
  echo "upstream_tag=$UPSTREAM_TAG"
  echo "emcc=$EMCC_VERSION"
  echo "build_input_hash=$INPUT_HASH"
  echo "exact_compiled_cache_hit=$EXACT_BUILD_HIT"
  echo "kernel_js_bytes=$(wc -c < "$KERNEL_JS")"
  echo "kernel_wasm_bytes=$(wc -c < "$KERNEL_WASM")"
  echo "simulation_js_bytes=$(wc -c < "$SIM_JS")"
  echo "simulation_wasm_bytes=$(wc -c < "$SIM_WASM")"
  echo "browser_js_bytes=$(wc -c < "$BROWSER_JS")"
  echo "browser_wasm_bytes=$(wc -c < "$BROWSER_WASM")"
} | tee "$OUT_DIR/build-info.txt"

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

run_node_probe "$KERNEL_JS" "SPLISHSPLASH_WASM_SMOKE_OK" "kernel-runtime.log"

echo "== execute real WCSPH simulation smoke under Node =="
(
  cd "$MAP_DIR"
  run_node_probe "$SIM_JS" "SPLISHSPLASH_SIM_WASM_OK" "simulation-runtime.log"
)

shopt -s nullglob
for map_file in "$MAP_DIR"/*.cdm; do
  cp "$map_file" "$SITE_MAP_DIR/"
done
shopt -u nullglob

echo "== cached Bender2019 maps =="
find "$MAP_DIR" -maxdepth 1 -type f -name '*.cdm' -printf '%f %s bytes\n' | sort || true

echo "SPlisHSPlasH WebAssembly build + WCSPH simulation probes passed."
