# sph-web-samples

Small browser experiments for SPH implementations.

## Sample 01: Salva 2D + WebAssembly + Canvas

- Physics: [Salva](https://github.com/dimforge/salva) 0.10.0
- Build: Rust `wasm32-unknown-unknown` via `wasm-pack`
- Display: plain HTML Canvas dots
- Tests: native Rust behavior tests + generated WASM/page contract test
- CI: GitHub Actions builds the WASM and deploys `site/` to GitHub Pages

The first sample intentionally keeps rendering simple so the browser/WASM boundary and SPH behavior are easy to inspect.

### Local build

```bash
cargo test
wasm-pack build --release --target web --out-dir site/pkg
node tests/page_contract.mjs
python3 -m http.server -d site 8000
```

Then open <http://localhost:8000/>.
