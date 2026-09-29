# Official Salva examples2d web ports

Source: `dimforge/salva/examples2d` on the upstream `master` branch.

| Upstream example | Web page | First-pass fidelity |
| --- | --- | --- |
| `basic2.rs` | `salva-official-basic` | Three Salva fluids, original elasticity/viscosity values, gravity, and cosine-style basin. Rapier-coupled falling box/ball/capsule deferred. |
| `custom_forces2.rs` | `salva-official-custom-forces` | 30×30 fluid, zero gravity, and both custom inverse-distance force fields ported to WASM. |
| `elasticity2.rs` | `salva-official-elasticity` | Two 25×15 elastic fluids, Young's moduli 500000/100000, XSPH viscosity, gravity. Rapier ground replaced by sampled Salva boundary particles. |
| `layers2.rs` | `salva-official-layers` | Three fluids and Salva interaction groups preserved. Rapier-coupled rigid bodies deferred; basin represented as Salva boundary particles. |
| `surface_tension2.rs` | `salva-official-surface-tension` | 20×20 droplet, Akinci2013 surface tension, artificial viscosity, scaled gravity. Rapier ground replaced by sampled Salva boundary particles. |

## Browser presentation

All five pages share `site/official-examples2d.js`. Physics runs in Rust/WASM. JavaScript advances the simulation, maps particle coordinates to Canvas coordinates, and draws fluid/boundary dots.

Cache-busting version for this batch: `v=1.10`.

## Next fidelity pass

1. Add Rapier2D WASM coupling for Basic dynamic cuboid / ball / capsule.
2. Add the same coupling with interaction-group filtering for Layers.
3. Add velocity-color rendering equivalent to the upstream testbed for Custom forces / Elasticity / Surface tension.
4. Compare screenshots and particle trajectories against upstream desktop examples.
