# WebGPU Height Field Hybrid Raymarch

This sample reuses the official Salva 3D `heightfield` simulation.

## Hybrid representation

The scene contains two fundamentally different objects:

- Fluid: 3375 Salva particles.
- Terrain: a Rapier heightfield generated from a 41x41 grid using sin(x)+cos(z), with a raised outer border.

The WebGPU renderer keeps those representations separate.

### Fluid

Particle XYZ positions are splatted into a 64x64x64 fixed-point atomic density buffer, normalized into an r32float 3D texture, and rendered as an iso-density surface.

### Terrain

The terrain is not converted to particles or voxels. The render shader evaluates a continuous approximation of the same upstream height formula:

- world x/z in [-6, 6] map to local x/z in [0, 12].
- interior height = sin(localX) + cos(localZ).
- the outer 0.30 world-unit band blends toward height 3.0, approximating the raised edge row/column in the 41x41 Rapier heightfield.

The shader searches for the first sign change of y - terrainHeight(x,z) and refines it with binary search. The function is not treated as an SDF.

## Why hybrid

Voxelizing the static terrain would spend compute and memory on data that already has a compact analytic description. Keeping the terrain procedural leaves the 3D density texture entirely for the fluid.

## CI

The ci=1 path advances the full 3375-particle Salva simulation by one 1/200 s step, runs atomic clear/splat/normalize on the 64-cubed volume, and executes the combined fluid+terrain raymarch into a 160x120 offscreen WebGPU texture. Validation scopes and queue completion are checked.
