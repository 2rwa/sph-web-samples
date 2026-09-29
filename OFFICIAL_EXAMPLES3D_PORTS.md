# Official Salva examples3d web ports

Source: `dimforge/salva/examples3d` on upstream `master`.

| Upstream | Web page | Main behavior preserved |
| --- | --- | --- |
| `basic3.rs` | `salva-official-3d-basic` | 15³ particles, artificial viscosity, Rapier cuboid floor/walls, StaticSampling. |
| `custom_forces3.rs` | `salva-official-3d-custom-forces` | 10³ particles, zero gravity, two custom inverse-distance NonPressureForce fields. |
| `elasticity3.rs` | `salva-official-3d-elasticity` | Two 12×6×12 elastic blocks, Young's moduli 500000/100000, XSPH viscosity, Rapier ground with DynamicContactSampling. |
| `faucet3.rs` | `salva-official-3d-faucet` | Empty initial fluid, 10×10 emission every 0.06 s, surface tension + viscosity, spherical StaticSampling obstacle, deletion below y=-2. |
| `heightfield3.rs` | `salva-official-3d-heightfield` | 15³ particles, initial -10 Y velocity, 41×41 sin(x)+cos(z) Rapier heightfield with raised border and StaticSampling. |
| `surface_tension3.rs` | `salva-official-3d-surface-tension` | 7³ droplet, Akinci 2013 tension, artificial viscosity, -0.981 gravity, DynamicContactSampling ground. |

## Browser rendering

All six pages share `site/official-examples3d.js`.

- Physics: Salva 3D + Rapier 3D in Rust/WASM.
- Rendering: Canvas 2D only.
- Camera: perspective projection, drag-to-orbit, wheel zoom.
- Occlusion approximation: particle depth sort.
- Velocity-rendering examples: particle brightness is modulated by velocity magnitude.
- Boundary sample points are rendered where practical.

Cache-busting version: `v=1.30`.

## Notes

`harness_basic3.rs` is not a registered viewer example; it is a headless harness for Basic and therefore is not exposed as a separate browser page. Its coupled update pattern is already represented by the Basic web port.
