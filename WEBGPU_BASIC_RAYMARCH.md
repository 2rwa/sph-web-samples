# WebGPU Basic Density Raymarch

This sample reuses the official Salva 3D Basic simulation with 3375 particles.

## Purpose

Basic is the clean performance/reference case:

- one fluid;
- fixed particle count;
- fixed Rapier basin;
- no procedural terrain;
- no multiple density fields;
- no particle emission.

It therefore provides a direct comparison against the existing Canvas and WebGL2 Basic pages.

## Representation

Fluid particles use the same fixed-point atomic splat pipeline as the other scalable WebGPU samples:

particle storage buffer -> atomic u32 density buffer -> 64 cubed r32float texture -> fixed-step iso raymarch.

The static Rapier basin is not voxelized. Its geometry is reproduced analytically as five boxes:

- floor: center (0,0,0), half extents (2.5,0.2,2.5)
- x walls: centers +/-2.5,0.7,0, half extents (0.2,0.7,2.5)
- z walls: centers 0,0.7,+/-2.5, half extents (2.5,0.7,0.2)

Each box uses exact slab ray intersection.

## CI

ci=1 advances the 3375-particle simulation by one 1/200 second step, runs the full 64 cubed atomic clear/splat/normalize sequence, and renders fluid plus analytic basin into a 160x120 offscreen texture. Validation and queue completion are required for success.
