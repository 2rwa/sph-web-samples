# WebGPU Custom Forces Surface + Force Volume

This sample reuses the official Salva 3D custom-forces mode.

## Upstream force law

The Rust sample installs two NonPressureForce implementations with origins:

- (1, 0, 0)
- (-1, 0, 0)

For each particle, each force adds dir / dist when the distance is greater than 0.1. In vector form the renderer evaluates the same contribution as:

originMinusPosition / distanceSquared

for distance > 0.1, otherwise zero.

## Fluid representation

The 1000 Salva particles splat into a 56 cubed fixed-point atomic density grid. A normalize compute pass writes an r32float 3D texture. The surface uses fixed ray steps and binary iso-crossing refinement.

## Force volume

The fragment shader analytically evaluates both force contributions at each ray sample. The +X source contributes magenta emission and the -X source contributes cyan emission. The vector-sum magnitude contributes a darker central field component.

Volume emission is accumulated front-to-back until the ray exits the domain or hits the implicit fluid surface. The Force glow UI control scales this emission without changing the Salva physics.

## CI

ci=1 advances the 1000-particle simulation by one 1/200 s step, runs atomic clear/splat/normalize, evaluates the analytic force volume and fluid surface in the render shader, draws to a 192x144 offscreen WebGPU texture, and waits for queue completion under a WebGPU validation error scope.
