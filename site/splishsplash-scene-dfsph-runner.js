import { loadSPlisHSPlasHScene } from "./splishsplash-scene-adapter.js";
import {
  createSPlisHSPlasHBrowserModule,
  buildSceneFromIR,
} from "./splishsplash-scene-runtime.js";

const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const bridgeEl = document.querySelector("#bridge");
const pauseEl = document.querySelector("#pause");
const resetEl = document.querySelector("#reset");
const particlesEl = document.querySelector("#particles");
const boundaryParticlesEl = document.querySelector("#boundary-particles");
const stepsEl = document.querySelector("#steps");
const simTimeEl = document.querySelector("#sim-time");
const physicsMsEl = document.querySelector("#physics-ms");
const centerYEl = document.querySelector("#center-y");
const minYEl = document.querySelector("#min-y");

let Module;
let ir;
let running = true;
let yaw = 0.55;
let pitch = -0.26;
let zoom = 430;
let dragging = false;
let lastX = 0;
let lastY = 0;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function project(x, y, z) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const rx = cy * x - sy * z;
  const rz0 = sy * x + cy * z;
  const yy = y - 1.45;
  const ry = cp * yy - sp * rz0;
  const rz = sp * yy + cp * rz0 + 5.1;
  const scale = zoom / Math.max(0.6, rz);
  return {
    x: canvas.width * 0.5 + rx * scale,
    y: canvas.height * 0.52 - ry * scale,
    z: rz,
    r: Math.max(1.0, 0.012 * scale),
  };
}

function readProjected(countFn, ptrFn, stride = 1) {
  const count = countFn();
  const ptr = ptrFn();
  if (!ptr || count <= 0) return [];
  const heap = Module.HEAPF32;
  const base = ptr >> 2;
  const out = [];
  for (let i = 0; i < count; i += stride) {
    const o = base + i * 3;
    out.push(project(heap[o], heap[o + 1], heap[o + 2]));
  }
  return out;
}

function draw() {
  resize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!Module) return;

  const boundaryCount = Module._sph_boundary_count();
  const fluidCount = Module._sph_particle_count();
  const boundaryStride = Math.max(1, Math.floor(boundaryCount / 6500));
  const fluidStride = Math.max(1, Math.floor(fluidCount / 9000));

  const points = [
    ...readProjected(
      () => boundaryCount,
      () => Module._sph_boundary_positions_ptr(),
      boundaryStride,
    ).map((p) => ({ ...p, boundary: true })),
    ...readProjected(
      () => fluidCount,
      () => Module._sph_positions_ptr(),
      fluidStride,
    ).map((p) => ({ ...p, boundary: false })),
  ];
  points.sort((a, b) => b.z - a.z);

  for (const p of points) {
    if (p.boundary) {
      ctx.fillStyle = "rgba(255,155,70,.35)";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    } else {
      ctx.fillStyle = "rgba(65,170,255,.80)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function metrics(ms = 0) {
  if (!Module) return;
  particlesEl.textContent = String(Module._sph_particle_count());
  boundaryParticlesEl.textContent = String(Module._sph_boundary_count());
  stepsEl.textContent = String(Module._sph_step_count());
  simTimeEl.textContent = Module._sph_time().toFixed(4);
  physicsMsEl.textContent = ms.toFixed(3);
  centerYEl.textContent = Module._sph_center_y().toFixed(5);
  minYEl.textContent = Module._sph_min_y().toFixed(5);
}

function build() {
  const report = buildSceneFromIR(Module, ir);
  bridgeEl.textContent = report.substitutions.join(" · ");
  statusEl.textContent = `Running JSON-driven ${report.simulationMethod}`;
  metrics();
  draw();
  return report;
}

function frame() {
  let ms = 0;
  if (Module && running) {
    const t0 = performance.now();
    Module._sph_step(1);
    ms = performance.now() - t0;
    if (!Module._sph_all_finite()) {
      running = false;
      statusEl.textContent = "Failed: non-finite particle position";
    }
  }
  metrics(ms);
  draw();
  requestAnimationFrame(frame);
}

pauseEl.addEventListener("click", () => {
  running = !running;
  pauseEl.textContent = running ? "Pause" : "Resume";
});

resetEl.addEventListener("click", () => {
  if (!Module) return;
  Module._sph_reset();
  running = true;
  pauseEl.textContent = "Pause";
  statusEl.textContent = "Running JSON-driven DFSPH";
});

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  yaw += (event.clientX - lastX) * 0.008;
  pitch = Math.max(-1.2, Math.min(1.2, pitch + (event.clientY - lastY) * 0.008));
  lastX = event.clientX;
  lastY = event.clientY;
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointercancel", () => { dragging = false; });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoom = Math.max(160, Math.min(1000, zoom * Math.exp(-event.deltaY * 0.001)));
}, { passive:false });

async function boot() {
  try {
    const sceneUrl = new URL(
      "./scenes/splishsplash/2.18.1/DamBreakModel.json",
      import.meta.url,
    );
    [Module, ir] = await Promise.all([
      createSPlisHSPlasHBrowserModule(),
      loadSPlisHSPlasHScene(sceneUrl),
    ]);
    const report = build();
    const centerY0 = Module._sph_center_y();

    if (new URLSearchParams(location.search).get("ci") === "1") {
      running = false;
      const t0 = performance.now();
      Module._sph_step(2);
      const elapsed = performance.now() - t0;
      metrics(elapsed);
      draw();

      const ok =
        report.simulationMethod === "DFSPH" &&
        report.particles === 9261 &&
        report.boundaryParticles === 18002 &&
        Module._sph_step_count() === 2 &&
        Module._sph_all_finite() &&
        Module._sph_center_y() < centerY0 &&
        Module._sph_min_y() > 0.0;

      statusEl.textContent = ok
        ? "CI SPlisHSPlasH generic DFSPH scene ok"
        : "Failed: generic DFSPH scene runtime check";
      return;
    }

    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
}

boot();
