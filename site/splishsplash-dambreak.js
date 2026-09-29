const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const resolutionEl = document.querySelector("#resolution");
const stepsPerFrameEl = document.querySelector("#steps-per-frame");
const pauseEl = document.querySelector("#pause");
const resetEl = document.querySelector("#reset");
const particlesEl = document.querySelector("#particles");
const boundaryParticlesEl = document.querySelector("#boundary-particles");
const stepsEl = document.querySelector("#steps");
const simTimeEl = document.querySelector("#sim-time");
const physicsMsEl = document.querySelector("#physics-ms");
const minYEl = document.querySelector("#min-y");
const maxXEl = document.querySelector("#max-x");

let Module;
let running = true;
let yaw = 0.62;
let pitch = -0.33;
let zoom = 560;
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
  const ry = cp * (y - 0.42) - sp * rz0;
  const rz = sp * (y - 0.42) + cp * rz0 + 1.55;
  const scale = zoom / Math.max(0.3, rz);

  return {
    x: canvas.width * 0.5 + rx * scale,
    y: canvas.height * 0.54 - ry * scale,
    z: rz,
    r: Math.max(1.3, 0.016 * scale),
  };
}

function readPoints(countFn, ptrFn) {
  const count = countFn();
  const ptr = ptrFn();
  if (!ptr || count <= 0) return [];

  const base = ptr >> 2;
  const heap = Module.HEAPF32;
  const result = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = base + i * 3;
    result[i] = project(heap[o], heap[o + 1], heap[o + 2]);
  }
  return result;
}

function draw() {
  resize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!Module) return;

  const boundary = readPoints(
    () => Module._sph_boundary_count(),
    () => Module._sph_boundary_positions_ptr(),
  );
  const fluid = readPoints(
    () => Module._sph_particle_count(),
    () => Module._sph_positions_ptr(),
  );

  const combined = [];
  for (const p of boundary) combined.push({ ...p, boundary: true });
  for (const p of fluid) combined.push({ ...p, boundary: false });
  combined.sort((a, b) => b.z - a.z);

  for (const p of combined) {
    if (p.boundary) {
      ctx.fillStyle = "rgba(255,155,70,.50)";
      ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    } else {
      const shade = Math.max(0.25, Math.min(1, 1.9 - p.z * 0.65));
      ctx.fillStyle = `rgba(55,165,255,${0.5 + 0.45 * shade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function updateMetrics(ms = 0) {
  if (!Module) return;
  particlesEl.textContent = String(Module._sph_particle_count());
  boundaryParticlesEl.textContent = String(Module._sph_boundary_count());
  stepsEl.textContent = String(Module._sph_step_count());
  simTimeEl.textContent = Module._sph_time().toFixed(4);
  physicsMsEl.textContent = ms.toFixed(3);
  minYEl.textContent = Module._sph_min_y().toFixed(5);
  maxXEl.textContent = Module._sph_max_x().toFixed(5);
}

function initScene() {
  const resolution = Number(resolutionEl.value);
  const count = Module._sph_init_dambreak(resolution);
  if (
    count <= 0 ||
    Module._sph_boundary_count() <= 0 ||
    !Module._sph_all_finite()
  ) {
    throw new Error("Dam Break initialization failed");
  }
  statusEl.textContent = "Running WCSPH + Akinci2012";
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
  statusEl.textContent = running ? "Running WCSPH + Akinci2012" : "Paused";
});

resetEl.addEventListener("click", () => {
  try {
    initScene();
    running = true;
    pauseEl.textContent = "Pause";
  } catch (error) {
    statusEl.textContent = `Failed: ${error.message}`;
  }
});

resolutionEl.addEventListener("change", () => resetEl.click());

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
  zoom = Math.max(180, Math.min(1300, zoom * Math.exp(-event.deltaY * 0.001)));
}, { passive: false });

async function boot() {
  try {
    statusEl.textContent = "Instantiating SPlisHSPlasH WASM…";
    Module = await globalThis.createSPlisHSPlasH({
      locateFile(path) {
        return new URL(`./vendor/splishsplash/${path}`, new URL("../../", import.meta.url)).href;
      },
    });

    initScene();

    if (new URLSearchParams(location.search).get("ci") === "1") {
      running = false;
      const t0 = performance.now();
      Module._sph_step(220);
      const elapsed = performance.now() - t0;
      updateMetrics(elapsed);
      draw();

      const minY = Module._sph_min_y();
      const ok =
        Module._sph_particle_count() === 432 &&
        Module._sph_boundary_count() > 1000 &&
        Module._sph_step_count() === 220 &&
        Module._sph_all_finite() &&
        Module._sph_time() > 0.25 &&
        Number.isFinite(minY) &&
        minY > -0.25;

      statusEl.textContent = ok
        ? "CI SPlisHSPlasH Dam Break ok"
        : `Failed: Dam Break containment check minY=${minY}`;
      return;
    }

    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Failed: ${error?.message ?? error}`;
  }
}

boot();
