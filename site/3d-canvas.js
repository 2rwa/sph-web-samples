import init, { Simulation3d } from "./pkg/sph_web_samples.js?v=1.03";

const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const ctx = canvas.getContext("2d", { alpha: false });

let sim;
let yaw = 0.78;
let pitch = 0.34;
let distance = 2.65;
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
  const target = [0, -0.12, 0];
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
  if (depth <= 0.05) return null;

  const focal = canvas.height / (2 * Math.tan(55 * Math.PI / 360));
  return {
    x: canvas.width * 0.5 + dot(rel, cam.right) * focal / depth,
    y: canvas.height * 0.5 - dot(rel, cam.up) * focal / depth,
    depth,
  };
}

function drawGround(cam) {
  const h = sim.floor_half_extent();
  const y = sim.floor_y();
  const corners = [
    [-h, y, -h],
    [ h, y, -h],
    [ h, y,  h],
    [-h, y,  h],
  ].map((p) => project(p, cam));

  if (corners.some((p) => !p)) return;
  ctx.strokeStyle = "#31404d";
  ctx.lineWidth = Math.max(1, canvas.width / 900);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();
}

function drawScene() {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cam = camera();
  drawGround(cam);

  const raw = sim.positions();
  const projected = [];
  for (let i = 0; i < raw.length; i += 3) {
    const p = project([raw[i], raw[i + 1], raw[i + 2]], cam);
    if (p) projected.push(p);
  }
  projected.sort((a, b) => b.depth - a.depth);

  ctx.fillStyle = "#73c8ff";
  for (const p of projected) {
    const radius = Math.max(1.0, Math.min(4.0, 7.5 / p.depth));
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

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
  pitch = Math.max(-1.1, Math.min(1.1, pitch - dy * 0.008));
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  distance = Math.max(1.4, Math.min(5.0, distance * Math.exp(event.deltaY * 0.001)));
}, { passive: false });

resetButton.addEventListener("click", () => {
  if (sim) sim.free();
  sim = new Simulation3d();
  accumulator = 0;
  previous = performance.now();
});

async function main() {
  await init("./pkg/sph_web_samples_bg.wasm?v=1.03");
  sim = new Simulation3d();

  const fixedDt = 1 / 200;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    accumulator += frameDt;

    const start = performance.now();
    let substeps = 0;
    while (accumulator >= fixedDt && substeps < 4) {
      sim.step(fixedDt);
      accumulator -= fixedDt;
      substeps += 1;
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
      `${sim.particle_count()} particles · 3D IISPH · ${stepMs.toFixed(2)} ms/frame physics · ${fps.toFixed(1)} fps`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  status.textContent = `Failed to start: ${error?.message ?? error}`;
});
