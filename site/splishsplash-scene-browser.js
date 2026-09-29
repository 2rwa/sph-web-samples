import { loadSPlisHSPlasHScene } from "./splishsplash-scene-adapter.js";
import {
  createSPlisHSPlasHBrowserModule,
  prepareBender2019Maps,
  buildSceneFromIRWithPreparedBender,
} from "./splishsplash-scene-runtime.js";

const SCENES = {
  "CompressibleSPH_WCSPH.json": { method: "WCSPH", particles: 9826, boundary: 23066 },
  "DamBreakModel.json": { method: "DFSPH", particles: 9261, boundary: 18002 },
  "DoubleDamBreak.json": { method: "DFSPH", particles: 7200, boundary: 23066 },
  "CompressibleSPH_ICSPH.json": { method: "ICSPH", particles: 9826, boundary: 23066 },
  "CompressibleSPH_PF.json": { method: "PF", particles: 9826, boundary: 23066 },
};

const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d");
const sceneEl = document.querySelector("#scene");
const pauseEl = document.querySelector("#pause");
const resetEl = document.querySelector("#reset");
const statusEl = document.querySelector("#status");
const bridgeEl = document.querySelector("#bridge");
const methodEl = document.querySelector("#method");
const particlesEl = document.querySelector("#particles");
const boundaryParticlesEl = document.querySelector("#boundary-particles");
const stepsEl = document.querySelector("#steps");
const simTimeEl = document.querySelector("#sim-time");
const physicsMsEl = document.querySelector("#physics-ms");
const centerYEl = document.querySelector("#center-y");
const minYEl = document.querySelector("#min-y");

let Module;
let running = true;
let loading = false;
let yaw = 0.55;
let pitch = -0.26;
let zoom = 430;
let dragging = false;
let lastX = 0;
let lastY = 0;

function sceneUrl(name) {
  return new URL(`./scenes/splishsplash/2.18.1/${name}`, import.meta.url);
}

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
  const rz = sp * yy + cp * rz0 + 5.2;
  const scale = zoom / Math.max(0.6, rz);
  return {
    x: canvas.width * 0.5 + rx * scale,
    y: canvas.height * 0.52 - ry * scale,
    z: rz,
    r: Math.max(1.0, 0.012 * scale),
  };
}

function readProjected(count, ptr, stride) {
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
      boundaryCount,
      Module._sph_boundary_positions_ptr(),
      boundaryStride,
    ).map((p) => ({ ...p, boundary: true })),
    ...readProjected(
      fluidCount,
      Module._sph_positions_ptr(),
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

async function loadScene(name, updateSelect = true) {
  if (!SCENES[name]) throw new Error(`Unknown scene ${name}`);
  loading = true;
  statusEl.textContent = `Loading ${name}…`;

  const ir = await loadSPlisHSPlasHScene(sceneUrl(name));
  await prepareBender2019Maps(Module, ir);
  const report = buildSceneFromIRWithPreparedBender(Module, ir);

  if (updateSelect) sceneEl.value = name;
  methodEl.textContent = report.simulationMethod;
  bridgeEl.textContent = report.substitutions.join(" · ");
  statusEl.textContent = `Running ${name} / ${report.simulationMethod}`;
  running = true;
  pauseEl.textContent = "Pause";
  loading = false;
  metrics();
  draw();
  return report;
}

function frame() {
  let ms = 0;
  if (Module && running && !loading) {
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

sceneEl.addEventListener("change", async () => {
  try {
    await loadScene(sceneEl.value);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
});

pauseEl.addEventListener("click", () => {
  running = !running;
  pauseEl.textContent = running ? "Pause" : "Resume";
});

resetEl.addEventListener("click", async () => {
  try {
    await loadScene(sceneEl.value);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
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
    Module = await createSPlisHSPlasHBrowserModule();

    if (new URLSearchParams(location.search).get("ci") === "1") {
      running = false;
      const results = [];
      for (const [name, expected] of Object.entries(SCENES)) {
        const report = await loadScene(name, false);
        running = false;
        const centerY0 = Module._sph_center_y();
        Module._sph_step(1);
        const centerY1 = Module._sph_center_y();
        const minY = Module._sph_min_y();
        const simTime = Module._sph_time();
        const ok =
          report.simulationMethod === expected.method &&
          report.particles === expected.particles &&
          report.boundaryModels === 1 &&
          report.effectiveBoundaryMethod === "Bender2019" &&
          Module._sph_step_count() === 1 &&
          Module._sph_all_finite() &&
          Number.isFinite(centerY1) &&
          Number.isFinite(minY) &&
          simTime > 0;
        results.push({
          name,
          ok,
          method: report.simulationMethod,
          particles: report.particles,
          boundaryModels: report.boundaryModels,
          centerY0,
          centerY1,
          minY,
          simTime,
        });
      }
      const ok = results.every((entry) => entry.ok);
      statusEl.textContent = ok
        ? "CI SPlisHSPlasH scene browser ok"
        : `Failed: scene browser ${JSON.stringify(results)}`;
      return;
    }

    await loadScene(sceneEl.value);
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
}

boot();
