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

## WebGPU raymarch experiments

- [Surface tension density raymarch](./site/samples/salva-3d-webgpu-surface-tension/)
  - Reuses the 343-particle official Surface tension simulation.
  - WebGPU compute generates a 48³ `r32float` density texture.
  - The render pass performs fixed-step iso-surface raymarching with binary hit refinement.
  - The density field is explicitly treated as non-SDF; no sphere tracing is used.
  - Kernel radius and iso threshold are interactive.

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

All samples use:

- Physics: [Salva](https://github.com/dimforge/salva) 0.10.0
- Build: Rust `wasm32-unknown-unknown` via `wasm-pack`
- Display: plain HTML Canvas
- Tests: native Rust behavior tests + generated WASM/page contract tests

GitHub Pages publishes `site/`. The top page is intentionally a simple text index; each experiment lives under `site/samples/`.

## Local build

```bash
cargo test
wasm-pack build --release --target web --out-dir site/pkg
node tests/page_contract.mjs
python3 -m http.server -d site 8000
```

Then open <http://localhost:8000/>.
