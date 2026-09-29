#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${SPLISHSPLASH_WASM_WORK_ROOT:-${RUNNER_TEMP:-/tmp}/splishsplash-wasm-probe}"
SRC_DIR="$WORK_ROOT/SPlisHSPlasH"
BUILD_DIR="$WORK_ROOT/build"
OUT_DIR="$TEST_DIR/out"

rm -rf "$WORK_ROOT" "$OUT_DIR"
mkdir -p "$WORK_ROOT" "$OUT_DIR"

echo "== toolchain =="
emcc --version
emcmake cmake --version
ninja --version
node --version

echo "== clone upstream =="
git clone --depth 1 --branch 2.18.1   https://github.com/InteractiveComputerGraphics/SPlisHSPlasH.git   "$SRC_DIR"

python3 "$TEST_DIR/prepare_emscripten.py" "$SRC_DIR"

rm -rf "$SRC_DIR/WasmSmoke"
cp -R "$TEST_DIR/wasm-smoke" "$SRC_DIR/WasmSmoke"
cat >> "$SRC_DIR/CMakeLists.txt" <<'CMAKE_EOF'

if (EMSCRIPTEN)
    add_subdirectory(WasmSmoke)
endif()
CMAKE_EOF

echo "== configure =="
emcmake cmake   -S "$SRC_DIR"   -B "$BUILD_DIR"   -G Ninja   -DCMAKE_BUILD_TYPE=Release   -DCMAKE_POLICY_VERSION_MINIMUM=3.10   -DEIGEN3_INCLUDE_DIR=/usr/include/eigen3   -DSPH_LIBS_ONLY=ON   -DBUILD_SHARED_LIBS=OFF   -DUSE_AVX=OFF   -DUSE_OpenMP=OFF   -DUSE_DOUBLE_PRECISION=OFF   -DUSE_PYTHON_BINDINGS=OFF   -DUSE_THIRD_PARTY_METHODS=OFF

echo "== build wasm ExternalProject dependencies first =="
cmake --build "$BUILD_DIR" --target Ext_NeighborhoodSearch Ext_GenericParameters Ext_Discregrid --parallel 2

echo "== build real SPlisHSPlasH-linked wasm smoke target =="
cmake --build "$BUILD_DIR" --target splishsplash_wasm_smoke --parallel 2

JS_FILE="$(find "$SRC_DIR/bin" "$BUILD_DIR" -type f -name 'splishsplash_wasm_smoke.js' -print -quit 2>/dev/null || true)"
if [[ -z "$JS_FILE" ]]; then
  echo "generated .js launcher not found" >&2
  find "$SRC_DIR/bin" "$BUILD_DIR" -maxdepth 4 -type f 2>/dev/null | sort | tail -200 || true
  exit 3
fi

WASM_FILE="${JS_FILE%.js}.wasm"
if [[ ! -s "$WASM_FILE" ]]; then
  echo "generated .wasm payload not found next to $JS_FILE" >&2
  exit 4
fi

echo "== execute wasm under Node =="
echo "PATH node: $(command -v node) ($(node --version))"
if [[ -x /usr/bin/node ]]; then
  echo "/usr/bin/node: $(/usr/bin/node --version)"
fi

set +e
node "$JS_FILE" > >(tee "$OUT_DIR/runtime.log") 2> >(tee "$OUT_DIR/runtime.err.log" >&2)
NODE_STATUS=$?
set -e
echo "node_exit_status=$NODE_STATUS" | tee "$OUT_DIR/runtime-status.txt"
if [[ "$NODE_STATUS" -ne 0 ]]; then
  exit "$NODE_STATUS"
fi
grep -q 'SPLISHSPLASH_WASM_SMOKE_OK' "$OUT_DIR/runtime.log"

cp "$JS_FILE" "$OUT_DIR/"
cp "$WASM_FILE" "$OUT_DIR/"

{
  echo "upstream=SPlisHSPlasH"
  echo "upstream_tag=2.18.1"
  echo "emcc=$(emcc --version | head -1)"
  echo "js_bytes=$(wc -c < "$JS_FILE")"
  echo "wasm_bytes=$(wc -c < "$WASM_FILE")"
} | tee "$OUT_DIR/build-info.txt"

echo "SPlisHSPlasH WebAssembly build probe passed."
