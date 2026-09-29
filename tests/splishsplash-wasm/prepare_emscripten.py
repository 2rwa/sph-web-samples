#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: prepare_emscripten.py <SPlisHSPlasH-source>")

root = Path(sys.argv[1]).resolve()


def patch_common() -> None:
    path = root / "CMake" / "Common.cmake"
    text = path.read_text()
    marker = "\tif (CI_BUILD)\n"
    replacement = (
        "\tif (EMSCRIPTEN)\n"
        "\t\t# wasm32 has no host CPU target for -march=native/-march=x86-64.\n"
        "\t\tset(CMAKE_CXX_FLAGS_RELEASE \"-O3 -DNDEBUG\")\n"
        "\t\tset(CMAKE_CXX_FLAGS_RELWITHDEBINFO \"-O3 -DNDEBUG\")\n"
        "\telseif (CI_BUILD)\n"
    )
    if replacement in text:
        return
    if text.count(marker) != 1:
        raise RuntimeError(f"unexpected Common.cmake CI_BUILD layout: {text.count(marker)} matches")
    path.write_text(text.replace(marker, replacement, 1))


def forward_toolchain(relative: str) -> None:
    path = root / relative
    text = path.read_text()
    needle = "CMAKE_ARGS "
    inserted = "CMAKE_ARGS -DCMAKE_TOOLCHAIN_FILE:FILEPATH=${CMAKE_TOOLCHAIN_FILE} "
    if inserted in text:
        return
    count = text.count(needle)
    if count == 0:
        raise RuntimeError(f"no CMAKE_ARGS entries found in {relative}")
    path.write_text(text.replace(needle, inserted))


patch_common()
forward_toolchain("CMake/NeighborhoodSearch.cmake")
forward_toolchain("CMake/SetUpExternalProjects.cmake")
print("Applied Emscripten compatibility patches.")
