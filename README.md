# sph-web-samples

Small browser experiments for SPH implementations.

## Samples

- [Salva 2D + WebAssembly + Canvas](./site/samples/salva-canvas/)
  - Physics: [Salva](https://github.com/dimforge/salva) 0.10.0
  - Build: Rust `wasm32-unknown-unknown` via `wasm-pack`
  - Display: plain HTML Canvas dots
  - Tests: native Rust behavior tests + generated WASM/page contract test

GitHub Pages publishes `site/`. The top page is intentionally a simple text index; each experiment lives under `site/samples/`.

## Local build

```bash
cargo test
wasm-pack build --release --target web --out-dir site/pkg
node tests/page_contract.mjs
python3 -m http.server -d site 8000
```

Then open <http://localhost:8000/>.
