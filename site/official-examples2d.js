import init, { OfficialExample2dSimulation } from "./pkg/sph_web_samples.js?v=1.10";

const root = document.querySelector("[data-example]");
const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const ctx = canvas.getContext("2d", { alpha: false });
const mode = root.dataset.example;

const palettes = {
  "basic": ["#c7b7ff", "#ff7398", "#92d58b"],
  "custom-forces": ["#c7b7ff"],
  "elasticity": ["#c7b7ff", "#92d58b"],
  "layers": ["#c7b7ff", "#ff7398", "#92d58b"],
  "surface-tension": ["#c7b7ff"],
};

let sim;
let paused = false;
let accumulator = 0;
let previous = performance.now();
let frames = 0;
let fpsSince = previous;
let fps = 0;
let stepMs = 0;

function resizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function worldToCanvas(x, y) {
  const cx = sim.view_center_x();
  const cy = sim.view_center_y();
  const hw = sim.view_half_width();
  const hh = sim.view_half_height();
  return [
    (x - (cx - hw)) / (hw * 2) * canvas.width,
    canvas.height - (y - (cy - hh)) / (hh * 2) * canvas.height,
  ];
}

function drawPoints(flat, color, radius) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < flat.length; i += 2) {
    const [x, y] = worldToCanvas(flat[i], flat[i + 1]);
    if (x < -radius || x > canvas.width + radius || y < -radius || y > canvas.height + radius) continue;
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawScene() {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boundaries = sim.boundary_positions();
  if (boundaries.length) {
    drawPoints(boundaries, "#d99755", Math.max(0.8, canvas.width / 1050));
  }

  const colors = palettes[mode] ?? palettes.basic;
  const radius = Math.max(1.0, canvas.width / 720);
  for (let i = 0; i < sim.fluid_count(); i += 1) {
    drawPoints(sim.fluid_positions(i), colors[i % colors.length], radius);
  }
}

function resetSimulation() {
  if (sim) sim.free();
  sim = new OfficialExample2dSimulation(mode);
  accumulator = 0;
  previous = performance.now();
  frames = 0;
  fps = 0;
  fpsSince = previous;
}

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
});

resetButton.addEventListener("click", resetSimulation);

async function main() {
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.10", import.meta.url));
  resetSimulation();

  const fixedDt = 1 / 200;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.05);
    previous = now;

    const start = performance.now();
    if (!paused) {
      accumulator += frameDt;
      let substeps = 0;
      while (accumulator >= fixedDt && substeps < 4) {
        sim.step(fixedDt);
        accumulator -= fixedDt;
        substeps += 1;
      }
    }
    stepMs = performance.now() - start;

    drawScene();

    frames += 1;
    if (now - fpsSince >= 1000) {
      fps = frames * 1000 / (now - fpsSince);
      frames = 0;
      fpsSince = now;
    }

    status.textContent =
      `${sim.example_name()} · ${sim.particle_count().toLocaleString()} particles · ${stepMs.toFixed(2)} ms/frame physics · ${fps.toFixed(1)} fps`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  status.textContent = `Failed to start: ${error?.message ?? error}`;
});
