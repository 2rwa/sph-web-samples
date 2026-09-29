import init, { InteractiveSimulation } from "./pkg/sph_web_samples.js";

const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const clearButton = document.querySelector("#clear-obstacles");
const particleCountSelect = document.querySelector("#particle-count");
const resetParticlesButton = document.querySelector("#reset-particles");
const toolButtons = [...document.querySelectorAll("[data-tool]")];
const ctx = canvas.getContext("2d", { alpha: false });

let sim;
let activeTool = "circle";
let pointerDown = false;
let startPoint = null;
let currentPoint = null;
let drawPath = [];
let frames = 0;
let fpsSince = performance.now();
let fps = 0;

function setTool(tool) {
  activeTool = tool;
  for (const button of toolButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  }
}

for (const button of toolButtons) {
  button.addEventListener("click", () => setTool(button.dataset.tool));
}

clearButton.addEventListener("click", () => {
  if (!sim) return;
  sim.clear_obstacles();
});

resetParticlesButton.addEventListener("click", () => {
  if (!sim) return;
  const requested = Number(particleCountSelect.value);
  const actual = sim.reset_particles(requested);
  particleCountSelect.value = String(actual);
  frames = 0;
  fps = 0;
  fpsSince = performance.now();
});

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

function canvasToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return [
    (nx * 2 - 1) * sim.half_width(),
    (1 - ny * 2) * sim.half_height(),
  ];
}

function worldToCanvas(x, y) {
  const hw = sim.half_width();
  const hh = sim.half_height();
  return [
    (x + hw) / (hw * 2) * canvas.width,
    canvas.height - (y + hh) / (hh * 2) * canvas.height,
  ];
}

function drawCirclePreview(a, b) {
  const [ax, ay] = worldToCanvas(a[0], a[1]);
  const [bx, by] = worldToCanvas(b[0], b[1]);
  const radius = Math.hypot(bx - ax, by - ay);
  ctx.beginPath();
  ctx.arc(ax, ay, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBoxPreview(a, b) {
  const [ax, ay] = worldToCanvas(a[0], a[1]);
  const [bx, by] = worldToCanvas(b[0], b[1]);
  ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
}

function drawLinePreview(a, b) {
  const [ax, ay] = worldToCanvas(a[0], a[1]);
  const [bx, by] = worldToCanvas(b[0], b[1]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function drawPathPreview(path) {
  if (path.length < 2) return;
  ctx.beginPath();
  let [x, y] = worldToCanvas(path[0][0], path[0][1]);
  ctx.moveTo(x, y);
  for (let i = 1; i < path.length; i += 1) {
    [x, y] = worldToCanvas(path[i][0], path[i][1]);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawScene() {
  resizeCanvas();
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#31404d";
  ctx.lineWidth = Math.max(1, canvas.width / 800);
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  const fluid = sim.positions();
  const fluidRadius = Math.max(0.85, canvas.width / 850);
  ctx.fillStyle = "#73c8ff";
  ctx.beginPath();
  for (let i = 0; i < fluid.length; i += 2) {
    const [x, y] = worldToCanvas(fluid[i], fluid[i + 1]);
    ctx.moveTo(x + fluidRadius, y);
    ctx.arc(x, y, fluidRadius, 0, Math.PI * 2);
  }
  ctx.fill();

  const obstaclePoints = sim.obstacle_points();
  const obstacleRadius = Math.max(1.0, canvas.width / 760);
  ctx.fillStyle = "#f1a35b";
  ctx.beginPath();
  for (let i = 0; i < obstaclePoints.length; i += 2) {
    const [x, y] = worldToCanvas(obstaclePoints[i], obstaclePoints[i + 1]);
    ctx.moveTo(x + obstacleRadius, y);
    ctx.arc(x, y, obstacleRadius, 0, Math.PI * 2);
  }
  ctx.fill();

  if (pointerDown && startPoint && currentPoint) {
    ctx.strokeStyle = "#f8d49b";
    ctx.lineWidth = Math.max(1.5, canvas.width / 550);
    if (activeTool === "circle") drawCirclePreview(startPoint, currentPoint);
    if (activeTool === "box") drawBoxPreview(startPoint, currentPoint);
    if (activeTool === "line") drawLinePreview(startPoint, currentPoint);
    if (activeTool === "draw") drawPathPreview(drawPath);
  }
}

function finishObstacle() {
  if (!startPoint || !currentPoint) return;

  const [x0, y0] = startPoint;
  const [x1, y1] = currentPoint;

  if (activeTool === "circle") {
    sim.add_circle_obstacle(x0, y0, Math.hypot(x1 - x0, y1 - y0));
  } else if (activeTool === "box") {
    sim.add_box_obstacle(
      (x0 + x1) * 0.5,
      (y0 + y1) * 0.5,
      Math.abs(x1 - x0) * 0.5,
      Math.abs(y1 - y0) * 0.5,
    );
  } else if (activeTool === "line") {
    sim.add_line_obstacle(x0, y0, x1, y1);
  } else if (activeTool === "draw" && drawPath.length >= 2) {
    const flat = new Float32Array(drawPath.length * 2);
    for (let i = 0; i < drawPath.length; i += 1) {
      flat[i * 2] = drawPath[i][0];
      flat[i * 2 + 1] = drawPath[i][1];
    }
    sim.add_polyline_obstacle(flat);
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (!sim) return;
  pointerDown = true;
  canvas.setPointerCapture(event.pointerId);
  startPoint = canvasToWorld(event.clientX, event.clientY);
  currentPoint = startPoint;
  drawPath = [startPoint];
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown || !sim) return;
  currentPoint = canvasToWorld(event.clientX, event.clientY);

  if (activeTool === "draw") {
    const last = drawPath[drawPath.length - 1];
    if (Math.hypot(currentPoint[0] - last[0], currentPoint[1] - last[1]) >= 0.025) {
      drawPath.push(currentPoint);
    }
  }
});

function endPointer(event) {
  if (!pointerDown || !sim) return;
  currentPoint = canvasToWorld(event.clientX, event.clientY);
  if (activeTool === "draw") drawPath.push(currentPoint);
  finishObstacle();
  pointerDown = false;
  startPoint = null;
  currentPoint = null;
  drawPath = [];
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", () => {
  pointerDown = false;
  startPoint = null;
  currentPoint = null;
  drawPath = [];
});

async function main() {
  await init();
  sim = new InteractiveSimulation();

  function frame(now) {
    const stepStart = performance.now();
    sim.step(1 / 200);
    const stepMs = performance.now() - stepStart;

    drawScene();

    frames += 1;
    if (now - fpsSince >= 1000) {
      fps = frames * 1000 / (now - fpsSince);
      frames = 0;
      fpsSince = now;
    }

    status.textContent =
      `${sim.particle_count().toLocaleString()} particles · ${sim.obstacle_count()} obstacles · ${stepMs.toFixed(2)} ms/SPH step · ${fps.toFixed(1)} fps`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  status.textContent = `Failed to start: ${error?.message ?? error}`;
});
