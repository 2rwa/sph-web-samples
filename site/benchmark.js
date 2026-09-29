import init, { BenchmarkSimulation } from "./pkg/sph_web_samples.js";

const canvas = document.querySelector("#view");
const slider = document.querySelector("#particle-count");
const value = document.querySelector("#particle-count-value");
const status = document.querySelector("#status");
const ctx = canvas.getContext("2d", { alpha: false });

let sim;
let rebuildTimer = 0;
let smoothedStepMs = 0;
let frames = 0;
let fpsSince = performance.now();
let fps = 0;

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
  const hw = sim.half_width() * 1.08;
  const hh = sim.half_height() * 1.08;
  return [
    (x + hw) / (hw * 2) * canvas.width,
    canvas.height - (y + hh) / (hh * 2) * canvas.height,
  ];
}

function draw() {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const [x0, y0] = worldToCanvas(-sim.half_width(), sim.half_height());
  const [x1, y1] = worldToCanvas(sim.half_width(), -sim.half_height());
  ctx.strokeStyle = "#31404d";
  ctx.lineWidth = Math.max(1, canvas.width / 800);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

  const positions = sim.positions();
  const dotRadius = Math.max(0.7, Math.min(2.2, canvas.width / Math.sqrt(sim.particle_count()) / 22));

  ctx.fillStyle = "#73c8ff";
  ctx.beginPath();
  for (let i = 0; i < positions.length; i += 2) {
    const [x, y] = worldToCanvas(positions[i], positions[i + 1]);
    ctx.moveTo(x + dotRadius, y);
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
  }
  ctx.fill();
}

function rebuild(count) {
  if (sim) sim.free();
  sim = new BenchmarkSimulation(count);
  smoothedStepMs = 0;
  frames = 0;
  fpsSince = performance.now();
  fps = 0;
  status.textContent = `${sim.particle_count().toLocaleString()} particles · warming up…`;
}

function scheduleRebuild(count) {
  value.value = Number(count).toLocaleString();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuild(Number(count)), 120);
}

slider.addEventListener("input", () => scheduleRebuild(slider.value));

async function main() {
  await init();
  rebuild(Number(slider.value));

  function frame(now) {
    const start = performance.now();
    sim.step(1 / 120);
    const stepMs = performance.now() - start;
    smoothedStepMs = smoothedStepMs === 0 ? stepMs : smoothedStepMs * 0.9 + stepMs * 0.1;

    draw();

    frames += 1;
    if (now - fpsSince >= 1000) {
      fps = frames * 1000 / (now - fpsSince);
      frames = 0;
      fpsSince = now;
    }

    status.textContent =
      `${sim.particle_count().toLocaleString()} particles · ${smoothedStepMs.toFixed(2)} ms/SPH step · ${fps.toFixed(1)} fps`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  status.textContent = `Failed to start: ${error?.message ?? error}`;
});
