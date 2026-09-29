# WebGPU Faucet Atomic-Splat Raymarch

This sample reuses the existing Salva 3D `faucet` WASM mode.

## Why the density builder differs from Surface tension

The Surface tension sample has only 343 particles, so evaluating every particle for every voxel is acceptable as a first experiment.

Faucet emits 100 particles every 0.06 seconds and deletes them only after they fall below y=-2. A voxel×particle density pass therefore scales poorly as the stream grows.

The Faucet WebGPU sample uses particle-local splatting instead:

1. Clear a 40×96×40 `array<atomic<u32>>` density buffer.
2. Dispatch one compute invocation per active Salva particle.
3. Each invocation visits only voxels within the selected kernel radius.
4. Compact-support kernel contributions are converted to fixed-point integers and accumulated with `atomicAdd`.
5. A second compute pass converts fixed-point atomic values into an `r32float` 3D texture.
6. The render pass fixed-step raymarches the texture and refines iso crossings by binary search.

This avoids relying on floating-point atomics.

## Scene

The density volume covers the faucet emission point down to the particle-deletion region. The upstream Rapier sphere at the origin is rendered analytically and participates in the Salva simulation as before.

## CI

`?ci=1` advances the faucet for 13 × 1/200 s to produce the first 100-particle batch, then executes clear → atomic splat → normalize → raymarch into an offscreen GPU texture and waits for `queue.onSubmittedWorkDone()`.
