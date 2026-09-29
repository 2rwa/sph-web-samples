import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=1.30";

const root = document.querySelector("[data-example3d]");
const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const ctx = canvas.getContext("2d", { alpha: false });
const mode = root.dataset.example3d;

const baseColors = [
  [190, 205, 255],
  [145, 215, 145],
  [255, 150, 180],
];

let sim;
let paused = false;
let yaw = 0.78;
let pitch = 0.40;
let distanceScale = 1.0;
let dragging = false;
let lastX = 0;
let lastY = 0;
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

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function camera() {
  const target = [
    sim.view_center_x(),
    sim.view_center_y(),
    sim.view_center_z(),
  ];
  const distance = sim.view_distance() * distanceScale;
  const cp = Math.cos(pitch);
  const eye = [
    target[0] + Math.sin(yaw) * cp * distance,
    target[1] + Math.sin(pitch) * distance,
    target[2] + Math.cos(yaw) * cp * distance,
  ];
  const forward = normalize([
    target[0] - eye[0],
    target[1] - eye[1],
    target[2] - eye[2],
  ]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { eye, forward, right, up };
}

function project(point, cam) {
  const rel = [
    point[0] - cam.eye[0],
    point[1] - cam.eye[1],
    point[2] - cam.eye[2],
  ];
  const depth = dot(rel, cam.forward);
  if (depth <= 0.02) return null;

  const focal = canvas.height / (2 * Math.tan(55 * Math.PI / 360));
  return {
    x: canvas.width * 0.5 + dot(rel, cam.right) * focal / depth,
    y: canvas.height * 0.5 - dot(rel, cam.up) * focal / depth,
    depth,
  };
}

function particleColor(fluidIndex, speed) {
  const [r, g, b] = baseColors[fluidIndex % baseColors.length];
  const gain = Math.max(0.45, Math.min(1.25, 0.65 + speed * 0.10));
  return `rgb(${Math.min(255, r * gain)}, ${Math.min(255, g * gain)}, ${Math.min(255, b * gain)})`;
}

function drawScene() {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cam = camera();
  const boundaryRaw = sim.boundary_positions();
  const boundaryProjected = [];

  for (let i = 0; i < boundaryRaw.length; i += 3) {
    const p = project([boundaryRaw[i], boundaryRaw[i + 1], boundaryRaw[i + 2]], cam);
    if (p) boundaryProjected.push(p);
  }
  boundaryProjected.sort((a, b) => b.depth - a.depth);

  ctx.fillStyle = "#6f665b";
  for (const p of boundaryProjected) {
    const radius = Math.max(0.55, Math.min(1.6, 3.0 / p.depth));
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const particles = [];
  for (let fluidIndex = 0; fluidIndex < sim.fluid_count(); fluidIndex += 1) {
    const pos = sim.fluid_positions(fluidIndex);
    const vel = sim.fluid_velocities(fluidIndex);
    for (let i = 0; i < pos.length; i += 3) {
      const projected = project([pos[i], pos[i + 1], pos[i + 2]], cam);
      if (!projected) continue;
      const speed = vel.length > i + 2
        ? Math.hypot(vel[i], vel[i + 1], vel[i + 2])
        : 0;
      particles.push({ ...projected, fluidIndex, speed });
    }
  }

  particles.sort((a, b) => b.depth - a.depth);

  for (const p of particles) {
    const radius = Math.max(0.85, Math.min(4.0, 6.0 / p.depth));
    ctx.fillStyle = particleColor(p.fluidIndex, p.speed);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resetSimulation() {
  if (sim) sim.free();
  sim = new OfficialExample3dSimulation(mode);
  accumulator = 0;
  previous = performance.now();
  frames = 0;
  fps = 0;
  fpsSince = previous;
  distanceScale = 1.0;
}

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
});

resetButton.addEventListener("click", resetSimulation);

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  yaw -= dx * 0.008;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.008));
});

canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointercancel", () => { dragging = false; });

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  distanceScale = Math.max(0.35, Math.min(3.5, distanceScale * Math.exp(event.deltaY * 0.001)));
}, { passive: false });

async function main() {
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.30", import.meta.url));
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
