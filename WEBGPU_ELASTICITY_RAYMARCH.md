# WebGPU Elasticity Dual-Density Raymarch

This experiment reuses the official Salva 3D `elasticity` mode.

## Two independent implicit objects

The upstream example contains two 864-particle elastic fluids with different Young's moduli. A single metaball density field would visually merge them when they touch, hiding that they are distinct elastic bodies.

The WebGPU version therefore allocates two complete density pipelines:

- Fluid A -> atomic density A -> 56x72x56 r32float texture A.
- Fluid B -> atomic density B -> 56x72x56 r32float texture B.

Both use the same clear/splat/normalize compute pipelines through separate bind groups.

The render pass raymarches both density fields, finds the first iso-surface hit for each, and renders whichever is nearest. Fluid A is blue; fluid B is green.

## Rendering

The density fields are not signed-distance fields. Both are traversed with a fixed ray step and six binary hit-refinement iterations. Surface normals use central density differences.

The Rapier ground cuboid is rendered analytically.

## CI

The `?ci=1` path constructs both fields, advances Salva by three 1/200 s steps, executes both atomic-splat compute pipelines, renders both volumes to an offscreen WebGPU texture, waits for queue completion, and fails on WebGPU validation errors.
