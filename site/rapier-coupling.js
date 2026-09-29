import init, { RapierCoupledSimulation } from "./pkg/sph_web_samples.js?v=1.20";

const root = document.querySelector("[data-coupling-variant]");
const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const ctx = canvas.getContext("2d", { alpha: false });
const mode = root.dataset.couplingVariant;

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

function pixelsPerWorld() {
  return [
    canvas.width / (sim.view_half_width() * 2),
    canvas.height / (sim.view_half_height() * 2),
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

function bodyFill(density) {
  if (density < 0.4) return "#86d9cb";
  if (density > 1.5) return "#d08c70";
  return "#e4c36f";
}

function bodyStroke(group) {
  if (group === 1) return "#8fb7ff";
  if (group === 2) return "#ff9ab2";
  if (group === 3) return "#a8df92";
  return "#f5e6b7";
}

function drawBox(a, b, sx, sy) {
  ctx.beginPath();
  ctx.rect(-a * sx, -b * sy, a * sx * 2, b * sy * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBall(r, sx, sy) {
  ctx.beginPath();
  ctx.ellipse(0, 0, r * sx, r * sy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawCapsule(halfHeight, radius, sx, sy) {
  const rx = radius * sx;
  const ry = radius * sy;
  const h = halfHeight * sy;
  ctx.beginPath();
  ctx.moveTo(-rx, -h);
  ctx.lineTo(-rx, h);
  ctx.ellipse(0, h, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(rx, -h);
  ctx.ellipse(0, -h, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawRigidBodies() {
  const state = sim.rigid_body_states();
  const [sx, sy] = pixelsPerWorld();

  for (let i = 0; i < state.length; i += 8) {
    const x = state[i];
    const y = state[i + 1];
    const angle = state[i + 2];
    const shape = Math.round(state[i + 3]);
    const a = state[i + 4];
    const b = state[i + 5];
    const density = state[i + 6];
    const group = Math.round(state[i + 7]);
    const [px, py] = worldToCanvas(x, y);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-angle);
    ctx.fillStyle = bodyFill(density);
    ctx.strokeStyle = bodyStroke(group);
    ctx.lineWidth = Math.max(1.5, canvas.width / 600);

    if (shape === 0) drawBox(a, b, sx, sy);
    else if (shape === 1) drawBall(a, sx, sy);
    else drawCapsule(a, b, sx, sy);

    ctx.restore();
  }
}

function drawScene() {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boundary = sim.boundary_positions();
  if (boundary.length) {
    drawPoints(boundary, "#765f45", Math.max(0.7, canvas.width / 1200));
  }

  const colors = ["#b7c8ff", "#ff8eab", "#94d78f"];
  const radius = Math.max(1.0, canvas.width / 740);
  for (let i = 0; i < sim.fluid_count(); i += 1) {
    drawPoints(sim.fluid_positions(i), colors[i % colors.length], radius);
  }

  drawRigidBodies();
}

function resetSimulation() {
  if (sim) sim.free();
  sim = new RapierCoupledSimulation(mode);
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
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.20", import.meta.url));
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
      `${sim.variant_name()} · ${sim.particle_count().toLocaleString()} fluid particles · ${sim.rigid_body_count()} dynamic bodies · ${stepMs.toFixed(2)} ms/frame physics · ${fps.toFixed(1)} fps`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  status.textContent = `Failed to start: ${error?.message ?? error}`;
});
