import init, { Simulation } from "./pkg/sph_web_samples.js";

const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const ctx = canvas.getContext("2d", { alpha: false });

const WORLD = {
  left: -1.15,
  right: 1.15,
  bottom: -1.0,
  top: 1.0,
};

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
  const px = (x - WORLD.left) / (WORLD.right - WORLD.left) * canvas.width;
  const py = canvas.height - (y - WORLD.bottom) / (WORLD.top - WORLD.bottom) * canvas.height;
  return [px, py];
}

function draw(sim) {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const [x0, y0] = worldToCanvas(-1.0, 0.85);
  const [x1, y1] = worldToCanvas(1.0, -0.85);
  ctx.strokeStyle = "#31404d";
  ctx.lineWidth = Math.max(1, canvas.width / 800);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

  const positions = sim.positions();
  const dotRadius = Math.max(1.5, canvas.width / 440);

  ctx.fillStyle = "#73c8ff";
  ctx.beginPath();
  for (let i = 0; i < positions.length; i += 2) {
    const [x, y] = worldToCanvas(positions[i], positions[i + 1]);
    ctx.moveTo(x + dotRadius, y);
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
  }
  ctx.fill();
}

async function main() {
  await init();
  const sim = new Simulation();

  const fixedDt = 1 / 240;
  let accumulator = 0;
  let previous = performance.now();
  let frames = 0;
  let fpsSince = previous;

  status.textContent = `${sim.particle_count()} particles · Salva 0.10.0 · WASM`;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    accumulator += frameDt;

    let substeps = 0;
    while (accumulator >= fixedDt && substeps < 12) {
      sim.step(fixedDt);
      accumulator -= fixedDt;
      substeps += 1;
    }

    draw(sim);

    frames += 1;
    if (now - fpsSince >= 1000) {
      const fps = frames * 1000 / (now - fpsSince);
      status.textContent = `${sim.particle_count()} particles · ${fps.toFixed(1)} fps · Salva 0.10.0 · WASM`;
      frames = 0;
      fpsSince = now;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  status.textContent = `Failed to start: ${error?.message ?? error}`;
});
