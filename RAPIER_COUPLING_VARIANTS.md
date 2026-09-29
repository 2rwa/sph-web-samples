# Rapier × Salva two-way coupling variants

This batch extends the browser ports of Salva's upstream `basic2.rs` and `layers2.rs` examples with real Rapier 2D rigid bodies.

## Coupling path

1. Rapier integrates rigid-body motion.
2. Salva updates collider-backed boundaries.
3. Salva advances SPH at the same timestep.
4. Fluid forces accumulated on boundary particles are transmitted back to Rapier as impulses.
5. The next Rapier step integrates those impulses.

This mirrors the update order used by Salva's Rapier testbed plugin.

Dynamic bodies use `ColliderSampling::StaticSampling` with `shape_surface_ray_sample`. The heightfield basin uses `ColliderSampling::DynamicContactSampling`.

## Variants

| Variant | Bodies | Density / groups | Purpose |
| --- | ---: | --- | --- |
| Upstream Basic | 3 | 0.8 | Browser reproduction of the upstream cuboid, ball, and capsule coupling. |
| Light floaters | 3 | 0.18 | Exaggerate buoyancy and body response to fluid forces. |
| Heavy sinkers | 3 | 3.0 | Exaggerate penetration/sinking and fluid displacement. |
| Layers filtered | 3 | GROUP_2 box, GROUP_1 ball, GROUP_3 capsule | Reproduce the upstream Layers filtering idea; no fluid belongs to GROUP_3. |
| Mixed body rain | 9 | repeating 0.2 / 0.8 / 2.5 | Stress the coupling with more bodies, shapes, and mass ratios. |

## Canvas encoding

- Blue / pink / green dots: the three Salva fluids.
- Brown dots: current Salva boundary contact/sample points.
- Rigid-body fill: density class.
- Rigid-body outline in Layers filtered: interaction group.
- Shape and rotation are read from Rapier state every frame.

Cache-busting version for this batch: `v=1.20`.
