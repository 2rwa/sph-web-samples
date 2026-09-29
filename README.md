# sph-web-samples

Small browser experiments for SPH implementations.

## Samples

- [Salva 2D + WebAssembly + Canvas](./site/samples/salva-canvas/)
  - 216-particle minimal sample.
- [Salva 2D WASM benchmark](./site/samples/salva-benchmark/)
  - Adjustable from 100 to 10,000 particles in 100-particle increments.
  - Displays FPS and measured milliseconds per SPH step.
- [Salva 3D + WebAssembly + Canvas dots](./site/samples/salva-3d-canvas/)
  - 512 particles (8 × 8 × 8) simulated with Salva 3D.
  - XYZ positions are perspective-projected and depth-sorted in plain Canvas 2D.
  - Drag to orbit; wheel to zoom.
- [Salva 3D Basic + WebAssembly + WebGL2 points](./site/samples/salva-3d-webgl2/)
  - Reuses the official 3D Basic WASM simulation with 3,375 particles.
  - WebGL2 performs projection, depth testing, and point-sprite rasterization.
  - Displays separate physics ms, render ms, and FPS.
  - Boundary samples use a static VBO; fluid XYZ uses a dynamic VBO.
- [Salva interactive obstacles](./site/samples/salva-interactive-obstacles/)
  - Selectable 1,000–5,000 particles.
  - Particle-only reset preserves the outer container and all user obstacles.
  - Circle, Box, Line, and Free Draw tools.
  - User-created shapes become real Salva boundary particles in WASM.
  - Clear removes user obstacles while keeping the outer container.

## SPlisHSPlasH WebAssembly

- [SPlisHSPlasH 2.18.1 WCSPH browser probe](./site/tests/splishsplash-wasm/)
  - Builds upstream SPlisHSPlasH C++ with Emscripten rather than reimplementing the solver.
  - Uses the real `TimeStepWCSPH::step()` path.
  - 216 / 512 / 1000 particle lattice presets.
  - Browser UI exposes particle count, simulation steps/time, center Y, and physics time.
  - The first milestone is deliberately boundary-free so browser execution can be isolated from boundary-model setup.
  - CI runs 40 WCSPH steps in both Node and Headless Chrome and verifies finite positions plus downward center-of-mass motion.
  - Generated browser JS/WASM is placed in `site/vendor/splishsplash/` during the Pages build.
- [SPlisHSPlasH WCSPH + Akinci2012 Dam Break](./site/tests/splishsplash-wasm-dambreak/)
  - Uses the upstream `BoundaryModel_Akinci2012` and `StaticRigidBody` path.
  - The open-top tank is sampled as actual boundary particles and visualized in orange.
  - Fluid presets: 432 / 896 / 1600 particles.
  - CI advances 320 WCSPH steps and verifies finite positions plus floor containment; the successful reference run ended at minY=0.025922 after about 0.32 s of simulation time.
  - Boundary count, minimum fluid Y, maximum fluid X, simulation time, and physics ms are shown in the browser.
- [SPlisHSPlasH upstream Scene JSON adapter](./site/tests/splishsplash-scene-json/)
  - Loads unedited SPlisHSPlasH 2.18.1 scene fixtures in JavaScript.
  - Normalizes solver, boundary method, materials, rigid bodies, and fluid blocks into a browser scene IR.
  - Reports browser bridge requirements explicitly instead of silently rewriting unsupported desktop features.
  - Initial fixtures: `CompressibleSPH_WCSPH.json`, `DamBreakModel.json`, and `DoubleDamBreak.json`.
- [SPlisHSPlasH JSON-driven generic scene runner](./site/tests/splishsplash-scene-runner/)
  - Uses a scene-builder C ABI instead of a scene-specific C++ initializer.
  - Reads upstream `CompressibleSPH_WCSPH.json` in JavaScript and forwards its WCSPH parameters, gravity, material and two fluid blocks into WASM.
  - The two upstream blocks create 9,826 fluid particles with ±5 initial X velocity.
  - First boundary bridge: static, unrotated upstream `UnitBox.obj` with Bender2019 is explicitly substituted by a sampled Akinci2012 UnitBox. The source JSON remains unmodified.
  - Because that first sampled-boundary bridge is less stable than the upstream Bender2019 volume map, the effective CFL max is transparently capped at 0.001 for this bridge.

See [SPLISHSPLASH_WASM_MILESTONE_20260929.md](./SPLISHSPLASH_WASM_MILESTONE_20260929.md) for the frozen WASM milestone and [SCENE_JSON_BROWSER_PLAN.md](./SCENE_JSON_BROWSER_PLAN.md) for the next architecture phase.

## WebGPU raymarch experiments

- [Surface tension density raymarch](./site/samples/salva-3d-webgpu-surface-tension/)
  - Reuses the 343-particle official Surface tension simulation.
  - WebGPU compute generates a 48³ `r32float` density texture.
  - The render pass performs fixed-step iso-surface raymarching with binary hit refinement.
  - The density field is explicitly treated as non-SDF; no sphere tracing is used.
  - Kernel radius and iso threshold are interactive.
- [Faucet atomic-splat raymarch](./site/samples/salva-3d-webgpu-faucet/)
  - Reuses the continuously emitting official Faucet simulation.
  - Each particle splats fixed-point density only into neighboring voxels using `atomic<u32>`.
  - A normalize compute pass writes a 40×96×40 `r32float` 3D texture.
  - The same fixed-step + binary-refinement raymarch strategy extracts the liquid surface.
  - The upstream spherical obstacle is rendered analytically.
- [Elasticity dual-density raymarch](./site/samples/salva-3d-webgpu-elasticity/)
  - Reuses the two 864-particle official Elasticity fluids.
  - Each elastic body owns an independent fixed-point atomic density buffer and 56×72×56 `r32float` texture.
  - The raymarch pass tracks both iso-surfaces independently and colors them separately.
  - This prevents the two elastic bodies from visually merging into one implicit density field.
- [Height field hybrid raymarch](./site/samples/salva-3d-webgpu-heightfield/)
  - Reuses the 3,375-particle official Height field simulation.
  - Fluid particles splat into a 64³ fixed-point atomic density grid and `r32float` texture.
  - The terrain is evaluated procedurally from the upstream `sin(x)+cos(z)` height formula and raised border.
  - Fluid and terrain are raymarched independently and the nearest hit is shaded.
- [Basic density raymarch](./site/samples/salva-3d-webgpu-basic/)
  - Reuses the same 3,375-particle Basic simulation used by the Canvas and WebGL2 comparison pages.
  - Fluid uses a 64³ fixed-point atomic density grid and `r32float` texture.
  - The Rapier floor and four walls are rendered as five exact analytic ray-box intersections.
  - This is the simplest 3,375-particle WebGPU raymarch baseline.
- [Custom forces surface + force volume](./site/samples/salva-3d-webgpu-custom-forces/)
  - Reuses the 1,000-particle zero-gravity Custom forces simulation.
  - Fluid uses a 56³ atomic-splat density texture and implicit surface.
  - The two upstream forces at (+1,0,0) and (-1,0,0) are evaluated analytically in the raymarch shader.
  - Cyan and magenta volume emission visualize the force contributions around the moving particle body.

## WebGPU deep-dive experiments

- Basic quality ladder — changes density-grid edge, ray step and render scale together (32³ / 48³ / 64³).
- Faucet velocity surface — reconstructs a weighted-average speed volume from a second fixed-point atomic accumulator and colors the implicit surface by local speed.
- Custom-force slice explorer — overlays a movable analytic slice of the ±X force field through the 3D fluid.
- Height-field cutaway — clips fluid at a movable Z plane and overlays density plus the procedural terrain profile.
- Elasticity material metrics — tracks per-body bounding-box stretch, extent-volume ratio, COM, RMS speed and max speed over time.

These samples are intentionally diagnostic: they expose quality/performance tradeoffs, hidden fields, interior sections, and coarse response measurements instead of only producing prettier surfaces.

## WebGL2 examples3d ports

All six registered examples3d modes now have WebGL2 point-sprite versions:

- Basic
- Custom forces
- Elasticity
- Faucet
- Height field
- Surface tension

They share `site/3d-webgl2.js`. WebGL2 handles camera projection, depth testing, and shaded point sprites. Fluid XYZ arrays are dynamic VBOs; fixed boundary samples are uploaded as a static VBO. Physics remains the same Rust/WASM Salva + Rapier implementation as the Canvas ports.

## Upstream examples3d ports

The six examples registered by Salva's `examples3d/all_examples3.rs` are exposed as browser pages:

- Basic
- Custom forces
- Elasticity
- Faucet
- Height field
- Surface tension

They run Salva 3D in Rust/WASM and use plain Canvas 2D for perspective projection and depth-sorted particle rendering. Rapier 3D coupling is retained where the upstream example uses it.

See [OFFICIAL_EXAMPLES3D_PORTS.md](./OFFICIAL_EXAMPLES3D_PORTS.md).

## Rapier × Salva two-way coupling variants

- Upstream Basic coupling — box / ball / capsule at density 0.8.
- Light floaters — the same three bodies at density 0.18.
- Heavy sinkers — density 3.0.
- Layers filtered — GROUP_1 / GROUP_2 / GROUP_3 filtering.
- Mixed body rain — nine bodies with mixed shapes and densities.

These use Salva's Rapier integration with static collider surface sampling for dynamic bodies and dynamic-contact sampling for the upstream heightfield basin. Fluid forces are transmitted back to Rapier as impulses.

See [RAPIER_COUPLING_VARIANTS.md](./RAPIER_COUPLING_VARIANTS.md).

## Upstream examples2d ports

The five examples currently registered by Salva's `examples2d/all_examples2.rs` are exposed as browser pages:

- Basic
- Custom forces
- Elasticity
- Layers
- Surface tension

The first web pass prioritizes Salva behavior and Canvas visualization. Rapier-coupled dynamic rigid bodies from upstream Basic/Layers are documented but not yet reproduced.

See [OFFICIAL_EXAMPLES2D_PORTS.md](./OFFICIAL_EXAMPLES2D_PORTS.md).

The Salva samples use:

- Physics: [Salva](https://github.com/dimforge/salva) 0.10.0
- Build: Rust `wasm32-unknown-unknown` via `wasm-pack`
- Display: plain HTML Canvas
- Tests: native Rust behavior tests + generated WASM/page contract tests

GitHub Pages publishes `site/`. The top page is intentionally a simple text index; each experiment lives under `site/samples/`.

## Local build

```bash
cargo test
wasm-pack build --release --target web --out-dir site/pkg
bash tests/splishsplash-wasm/build.sh
node tests/page_contract.mjs
node tests/splishsplash_browser_contract.mjs
node tests/splishsplash_dambreak_contract.mjs
node tests/splishsplash_scene_json_contract.mjs
node tests/splishsplash_generic_scene_contract.mjs
python3 -m http.server -d site 8000
```

Then open <http://localhost:8000/>.
