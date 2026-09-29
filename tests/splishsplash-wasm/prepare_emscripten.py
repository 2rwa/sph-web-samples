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


def write_external_openmp_patcher() -> None:
    helper = root / "CMake" / "disable_external_openmp.py"
    helper.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit("usage: disable_external_openmp.py <compact|discregrid> <source-dir>")

kind = sys.argv[1]
src = Path(sys.argv[2]).resolve()

if kind == "compact":
    path = src / "CMakeLists.txt"
    start_marker = "find_package(OpenMP REQUIRED)"
    end_marker = "OPTION(BUILD_AS_SHARED_LIBS"
elif kind == "discregrid":
    path = src / "discregrid" / "CMakeLists.txt"
    start_marker = "# OpenMP support."
    end_marker = "# Eigen library."
elif kind == "pbd":
    path = src / "CMake" / "Common.cmake"
    text = path.read_text()
    marker = "\\tif (CI_BUILD)\\n"
    replacement = (
        "\\tif (EMSCRIPTEN)\\n"
        "\\t\\t# wasm32 has no host CPU target for -march=native/-march=x86-64.\\n"
        "\\t\\tset(CMAKE_CXX_FLAGS_RELEASE \\"-O3 -DNDEBUG\\")\\n"
        "\\t\\tset(CMAKE_CXX_FLAGS_RELWITHDEBINFO \\"-O3 -DNDEBUG\\")\\n"
        "\\telseif (CI_BUILD)\\n"
    )
    if replacement in text:
        print(f"Emscripten release flags already patched in {path}")
        raise SystemExit(0)
    if text.count(marker) != 1:
        raise RuntimeError(f"unexpected PBD Common.cmake CI_BUILD layout: {text.count(marker)} matches")
    path.write_text(text.replace(marker, replacement, 1))
    print(f"Patched Emscripten release flags in {path}")
    raise SystemExit(0)
else:
    raise SystemExit(f"unknown dependency kind: {kind}")

text = path.read_text()
replacement = "# OpenMP disabled for the Emscripten single-thread WASM probe.\\n\\n"

if replacement in text:
    print(f"OpenMP requirement already disabled in {path}")
    raise SystemExit(0)

start = text.find(start_marker)
end = text.find(end_marker, start + 1)
if start < 0 or end < 0:
    raise RuntimeError(f"OpenMP block markers not found in {path}")

path.write_text(text[:start] + replacement + text[end:])
print(f"Disabled OpenMP requirement in {path}")
"""
    )


def forward_pbd_eigen() -> None:
    path = root / "CMake" / "SetUpExternalProjects.cmake"
    text = path.read_text()
    needle = "\t-DUSE_DOUBLE_PRECISION:BOOL=${USE_DOUBLE_PRECISION}\n"
    inserted = (
        needle
        + "\t-DEIGEN3_INCLUDE_DIR:PATH=${EIGEN3_INCLUDE_DIR}\n"
    )
    if inserted in text:
        return
    if text.count(needle) != 1:
        raise RuntimeError(
            f"unexpected PBD USE_DOUBLE_PRECISION layout: {text.count(needle)} matches"
        )
    path.write_text(text.replace(needle, inserted, 1))


def add_external_patch(relative: str, git_tag: str, kind: str) -> None:
    path = root / relative
    text = path.read_text()
    tag_line = f'GIT_TAG "{git_tag}"'
    patch_line = (
        f'PATCH_COMMAND python3 "${{CMAKE_SOURCE_DIR}}/CMake/disable_external_openmp.py" '
        f'{kind} "<SOURCE_DIR>"'
    )
    if patch_line in text:
        return
    pos = text.find(tag_line)
    if pos < 0:
        raise RuntimeError(f"git tag {git_tag} not found in {relative}")
    line_end = text.find("\n", pos)
    indent = text[text.rfind("\n", 0, pos) + 1:pos]
    insertion = "\n" + indent + patch_line
    path.write_text(text[:line_end] + insertion + text[line_end:])


patch_common()
forward_toolchain("CMake/NeighborhoodSearch.cmake")
forward_toolchain("CMake/SetUpExternalProjects.cmake")
forward_pbd_eigen()
write_external_openmp_patcher()
add_external_patch(
    "CMake/NeighborhoodSearch.cmake",
    "b40afcf47fe1963b363eba2371f04b42720fcb1d",
    "compact",
)
add_external_patch(
    "CMake/SetUpExternalProjects.cmake",
    "ddf20dc0480874bf02e0bdc6ded76c1f101b17fb",
    "discregrid",
)
add_external_patch(
    "CMake/SetUpExternalProjects.cmake",
    "10a70bc146a97873dc3c8fef372f5217e010542e",
    "pbd",
)
print("Applied Emscripten compatibility patches.")
