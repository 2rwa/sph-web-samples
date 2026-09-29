import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=1.40";

const canvas = document.querySelector("#view");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const particleLabel = document.querySelector("#particles");
const physicsLabel = document.querySelector("#physics-ms");
const renderLabel = document.querySelector("#render-ms");
const fpsLabel = document.querySelector("#fps");
const gpuStatus = document.querySelector("#gpu-status");

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: true,
  depth: true,
  powerPreference: "high-performance",
});

if (!gl) {
  gpuStatus.textContent = "WebGL2 unavailable";
  throw new Error("WebGL2 is not available in this browser");
}

const vertexSource = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;

uniform mat4 u_view_proj;
uniform float u_point_scale;
uniform vec3 u_color;

out vec3 v_color;

void main() {
  vec4 clip = u_view_proj * vec4(a_position, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(u_point_scale / max(clip.w, 0.001), 1.0, 9.0);
  v_color = u_color;
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 out_color;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) {
    discard;
  }

  float sphere = sqrt(max(0.0, 1.0 - r2));
  float shade = 0.62 + sphere * 0.38;
  out_color = vec4(v_color * shade, 1.0);
}
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${message}`);
  }
  return shader;
}

function createProgram() {
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${message}`);
  }
  return program;
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

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye, center, upHint) {
  const z = normalize(subtract(eye, center));
  const x = normalize(cross(upHint, z));
  const y = cross(z, x);

  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

function multiplyMat4(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

const program = createProgram();
const viewProjLocation = gl.getUniformLocation(program, "u_view_proj");
const pointScaleLocation = gl.getUniformLocation(program, "u_point_scale");
const colorLocation = gl.getUniformLocation(program, "u_color");

const fluidVao = gl.createVertexArray();
const fluidBuffer = gl.createBuffer();
gl.bindVertexArray(fluidVao);
gl.bindBuffer(gl.ARRAY_BUFFER, fluidBuffer);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

const boundaryVao = gl.createVertexArray();
const boundaryBuffer = gl.createBuffer();
gl.bindVertexArray(boundaryVao);
gl.bindBuffer(gl.ARRAY_BUFFER, boundaryBuffer);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

gl.bindVertexArray(null);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearColor(0.02, 0.03, 0.04, 1.0);

let sim;
let boundaryCount = 0;
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
let smoothedPhysicsMs = 0;
let smoothedRenderMs = 0;

function resizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function cameraMatrix() {
  const center = [
    sim.view_center_x(),
    sim.view_center_y(),
    sim.view_center_z(),
  ];
  const distance = sim.view_distance() * distanceScale;
  const cp = Math.cos(pitch);
  const eye = [
    center[0] + Math.sin(yaw) * cp * distance,
    center[1] + Math.sin(pitch) * distance,
    center[2] + Math.cos(yaw) * cp * distance,
  ];

  const projection = perspective(
    55 * Math.PI / 180,
    canvas.width / canvas.height,
    0.02,
    Math.max(50, distance * 10),
  );
  const view = lookAt(eye, center, [0, 1, 0]);
  return multiplyMat4(projection, view);
}

function uploadBoundary() {
  const boundary = sim.boundary_positions();
  boundaryCount = boundary.length / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, boundaryBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, boundary, gl.STATIC_DRAW);
}

function drawBuffer(vao, count, color, pointScale) {
  if (count === 0) return;
  gl.uniform3fv(colorLocation, color);
  gl.uniform1f(pointScaleLocation, pointScale);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.POINTS, 0, count);
}

function render() {
  resizeCanvas();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniformMatrix4fv(viewProjLocation, false, cameraMatrix());

  drawBuffer(boundaryVao, boundaryCount, new Float32Array([0.44, 0.39, 0.32]), 5.0);

  const fluid = sim.fluid_positions(0);
  gl.bindBuffer(gl.ARRAY_BUFFER, fluidBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, fluid, gl.DYNAMIC_DRAW);
  drawBuffer(fluidVao, fluid.length / 3, new Float32Array([0.45, 0.78, 1.0]), 13.0);
}

function resetSimulation() {
  if (sim) sim.free();
  sim = new OfficialExample3dSimulation("basic");
  uploadBoundary();
  accumulator = 0;
  previous = performance.now();
  frames = 0;
  fps = 0;
  fpsSince = previous;
  smoothedPhysicsMs = 0;
  smoothedRenderMs = 0;
  distanceScale = 1.0;
  particleLabel.textContent = sim.particle_count().toLocaleString();
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
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.40", import.meta.url));
  resetSimulation();
  gpuStatus.textContent = `WebGL2 · ${gl.getParameter(gl.RENDERER)}`;

  const fixedDt = 1 / 200;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.05);
    previous = now;

    const physicsStart = performance.now();
    if (!paused) {
      accumulator += frameDt;
      let substeps = 0;
      while (accumulator >= fixedDt && substeps < 4) {
        sim.step(fixedDt);
        accumulator -= fixedDt;
        substeps += 1;
      }
    }
    const physicsMs = performance.now() - physicsStart;
    smoothedPhysicsMs = smoothedPhysicsMs === 0
      ? physicsMs
      : smoothedPhysicsMs * 0.9 + physicsMs * 0.1;

    const renderStart = performance.now();
    render();
    const renderMs = performance.now() - renderStart;
    smoothedRenderMs = smoothedRenderMs === 0
      ? renderMs
      : smoothedRenderMs * 0.9 + renderMs * 0.1;

    frames += 1;
    if (now - fpsSince >= 1000) {
      fps = frames * 1000 / (now - fpsSince);
      frames = 0;
      fpsSince = now;
      fpsLabel.textContent = fps.toFixed(1);
    }

    particleLabel.textContent = sim.particle_count().toLocaleString();
    physicsLabel.textContent = smoothedPhysicsMs.toFixed(2);
    renderLabel.textContent = smoothedRenderMs.toFixed(2);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  gpuStatus.textContent = `Failed: ${error?.message ?? error}`;
});
