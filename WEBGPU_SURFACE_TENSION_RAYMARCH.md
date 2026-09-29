# WebGPU Surface Tension Raymarch

This sample reuses the existing Salva 3D `surface-tension` WASM mode.

## Pipeline

1. Salva/WASM advances the 343 SPH particles.
2. XYZ positions are uploaded to a WebGPU storage buffer.
3. A compute shader evaluates a compact-support density kernel on a 48³ grid.
4. Density is written to a 3D `r32float` storage texture.
5. A fullscreen render pass raymarches the density texture.
6. The first below→above iso-level crossing is refined with six binary-search steps.
7. Central density differences estimate the surface normal for lighting/reflection.

The density field is not a signed-distance field. The renderer therefore uses a fixed world-space ray step instead of sphere tracing.

## Controls

- Kernel radius changes the particle influence radius used by the compute pass.
- Iso level changes the extracted density surface.
- Drag orbits the camera.
- Wheel changes camera distance.
- Pause freezes Salva physics while leaving the raymarch controls interactive.

## CI mode

Appending `?ci=1` skips the WebGPU canvas swapchain and renders with the same shaders, bind groups, compute dispatch, and render pipeline into an offscreen `GPUTexture`. The CI path waits for `queue.onSubmittedWorkDone()` and reports validation errors via `#gpu-status`.
