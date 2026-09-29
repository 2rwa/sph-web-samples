# sph-web-samples

Small browser experiments for SPH implementations.

## Samples

- [Salva 2D + WebAssembly + Canvas](./site/samples/salva-canvas/)
  - 216-particle minimal sample.
- [Salva 2D WASM benchmark](./site/samples/salva-benchmark/)
  - Adjustable from 100 to 10,000 particles in 100-particle increments.
  - Displays FPS and measured milliseconds per SPH step.
- [Salva interactive obstacles](./site/samples/salva-interactive-obstacles/)
  - 1,000 particles.
  - Circle, Box, Line, and Free Draw tools.
  - User-created shapes become real Salva boundary particles in WASM.
  - Clear removes user obstacles while keeping the outer container.

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
