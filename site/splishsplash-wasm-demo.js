const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const sideEl = document.querySelector("#side");
const stepsPerFrameEl = document.querySelector("#steps-per-frame");
const pauseEl = document.querySelector("#pause");
const resetEl = document.querySelector("#reset");
const particlesEl = document.querySelector("#particles");
const stepsEl = document.querySelector("#steps");
const simTimeEl = document.querySelector("#sim-time");
const physicsMsEl = document.querySelector("#physics-ms");
const centerYEl = document.querySelector("#center-y");

let Module;
let running = true;
let yaw = 0.65;
let pitch = -0.28;
let zoom = 520;
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
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const rx = cy * x - sy * z;
  const rz0 = sy * x + cy * z;
  const ry = cp * (y - 0.58) - sp * rz0;
  const rz = sp * (y - 0.58) + cp * rz0 + 1.45;

  const scale = zoom / Math.max(0.25, rz);
  return {
    x: canvas.width * 0.5 + rx * scale,
    y: canvas.height * 0.53 - ry * scale,
    z: rz,
    r: Math.max(1.5, 0.018 * scale),
  };
}

function draw() {
  resize();
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = Math.max(1, devicePixelRatio || 1);
  const g0 = project(-0.55, 0, 0);
  const g1 = project(0.55, 0, 0);
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();

  if (!Module) return;

  const count = Module._sph_particle_count();
  const ptr = Module._sph_positions_ptr();
  if (!ptr || count <= 0) return;

  const base = ptr >> 2;
  const heap = Module.HEAPF32;
  const projected = new Array(count);

  for (let i = 0; i < count; i += 1) {
    const o = base + i * 3;
    projected[i] = project(heap[o], heap[o + 1], heap[o + 2]);
  }

  projected.sort((a, b) => b.z - a.z);
  for (const p of projected) {
    const shade = Math.max(0.25, Math.min(1, 1.8 - p.z * 0.65));
    ctx.fillStyle = `rgba(70, 170, 255, ${0.45 + 0.5 * shade})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateMetrics(ms = 0) {
  if (!Module) return;
  particlesEl.textContent = String(Module._sph_particle_count());
  stepsEl.textContent = String(Module._sph_step_count());
  simTimeEl.textContent = Module._sph_time().toFixed(4);
  physicsMsEl.textContent = ms.toFixed(3);
  centerYEl.textContent = Module._sph_center_y().toFixed(5);
}

function resetSimulation() {
  const side = Number(sideEl.value);
  const count = Module._sph_init(side);
  if (count <= 0 || !Module._sph_all_finite()) {
    throw new Error("SPlisHSPlasH init failed");
  }
  statusEl.textContent = "Running WCSPH";
  updateMetrics(0);
  draw();
}

function frame() {
  let physicsMs = 0;
  if (Module && running) {
    const t0 = performance.now();
    Module._sph_step(Number(stepsPerFrameEl.value));
    physicsMs = performance.now() - t0;
    if (!Module._sph_all_finite()) {
      running = false;
      statusEl.textContent = "Failed: non-finite particle position";
    }
  }

  updateMetrics(physicsMs);
  draw();
  requestAnimationFrame(frame);
}

pauseEl.addEventListener("click", () => {
  running = !running;
  pauseEl.textContent = running ? "Pause" : "Resume";
  statusEl.textContent = running ? "Running WCSPH" : "Paused";
});

resetEl.addEventListener("click", () => {
  try {
    resetSimulation();
    running = true;
    pauseEl.textContent = "Pause";
  } catch (error) {
    statusEl.textContent = `Failed: ${error.message}`;
  }
});

sideEl.addEventListener("change", () => resetEl.click());

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
  zoom = Math.max(180, Math.min(1200, zoom * Math.exp(-event.deltaY * 0.001)));
}, { passive: false });

async function boot() {
  try {
    statusEl.textContent = "Instantiating SPlisHSPlasH WASM…";
    Module = await globalThis.createSPlisHSPlasH({
      locateFile(path) {
        return new URL(`./vendor/splishsplash/${path}`, import.meta.url).href;
      },
    });

    resetSimulation();

    const ci = new URLSearchParams(location.search).get("ci") === "1";
    if (ci) {
      running = false;
      const y0 = Module._sph_center_y();
      const t0 = performance.now();
      Module._sph_step(40);
      const elapsed = performance.now() - t0;
      const y1 = Module._sph_center_y();
      updateMetrics(elapsed);

      if (
        Module._sph_particle_count() === 512 &&
        Module._sph_step_count() === 40 &&
        Module._sph_all_finite() &&
        Number.isFinite(y0) &&
        Number.isFinite(y1) &&
        y1 < y0 - 1e-5
      ) {
        statusEl.textContent = "CI SPlisHSPlasH browser ok";
      } else {
        statusEl.textContent = `Failed: CI motion check y0=${y0} y1=${y1}`;
      }
      draw();
      return;
    }

    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
}

boot();
