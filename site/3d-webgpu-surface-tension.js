import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=1.50";

const GRID_EDGE = 48;
const MAX_PARTICLES = 1024;
const WORKGROUP_EDGE = 4;
const CI_MODE = new URLSearchParams(location.search).get("ci") === "1";

const root = document.querySelector("[data-webgpu-raymarch]");
const canvas = document.querySelector("#view");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const kernelSlider = document.querySelector("#kernel-radius");
const isoSlider = document.querySelector("#iso-level");
const kernelValue = document.querySelector("#kernel-value");
const isoValue = document.querySelector("#iso-value");
const particleLabel = document.querySelector("#particles");
const physicsLabel = document.querySelector("#physics-ms");
const renderLabel = document.querySelector("#render-ms");
const fpsLabel = document.querySelector("#fps");
const gpuStatus = document.querySelector("#gpu-status");

if (!root || root.dataset.webgpuRaymarch !== "surface-tension") {
  throw new Error("Surface tension WebGPU page contract is missing");
}

if (!navigator.gpu) {
  gpuStatus.textContent = "WebGPU unavailable";
  throw new Error("WebGPU is not available in this browser");
}

const densityShaderSource = `
struct DensityParams {
  volumeMin: vec4f,
  volumeMax: vec4f,
  densityValues: vec4f,
};

@group(0) @binding(0) var<storage, read> particleValues: array<f32>;
@group(0) @binding(1) var densityVolume: texture_storage_3d<r32float, write>;
@group(0) @binding(2) var<uniform> densityParams: DensityParams;

@compute @workgroup_size(4, 4, 4)
fn densityMain(@builtin(global_invocation_id) voxelIndex: vec3u) {
  let gridEdge = u32(densityParams.densityValues.z + 0.5);
  if (voxelIndex.x >= gridEdge || voxelIndex.y >= gridEdge || voxelIndex.z >= gridEdge) {
    return;
  }

  let gridCoord = (vec3f(voxelIndex) + vec3f(0.5)) / f32(gridEdge);
  let volumeMin = densityParams.volumeMin.xyz;
  let volumeMax = densityParams.volumeMax.xyz;
  let worldPos = volumeMin + gridCoord * (volumeMax - volumeMin);
  let particleCount = u32(densityParams.densityValues.x + 0.5);
  let influenceRadius = densityParams.densityValues.y;

  var densityAccum = 0.0;
  for (var particleIndex = 0u; particleIndex < particleCount; particleIndex = particleIndex + 1u) {
    let baseIndex = particleIndex * 3u;
    let particlePos = vec3f(
      particleValues[baseIndex],
      particleValues[baseIndex + 1u],
      particleValues[baseIndex + 2u]
    );
    let particleDistance = distance(worldPos, particlePos);
    let kernelValue = 1.0 - particleDistance / influenceRadius;
    if (kernelValue > 0.0) {
      densityAccum = densityAccum + kernelValue * kernelValue * kernelValue;
    }
  }

  textureStore(densityVolume, vec3i(voxelIndex), vec4f(densityAccum, 0.0, 0.0, 1.0));
}
`;

const renderShaderSource = `
const GRID_EDGE: i32 = 48;
const MAX_RAY_STEPS: u32 = 128u;
const REFINE_STEPS: u32 = 6u;

struct RenderParams {
  cameraPos: vec4f,
  cameraRight: vec4f,
  cameraUp: vec4f,
  cameraForward: vec4f,
  volumeMin: vec4f,
  volumeMax: vec4f,
  rayValues: vec4f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) ndcCoord: vec2f,
};

@group(0) @binding(0) var densityTexture: texture_3d<f32>;
@group(0) @binding(1) var<uniform> renderParams: RenderParams;

fn lerpValue(firstValue: f32, secondValue: f32, factorValue: f32) -> f32 {
  return firstValue + (secondValue - firstValue) * factorValue;
}

fn safeReciprocal(inputValue: f32) -> f32 {
  var safeValue = inputValue;
  if (abs(safeValue) < 0.000001) {
    if (safeValue < 0.0) {
      safeValue = -0.000001;
    } else {
      safeValue = 0.000001;
    }
  }
  return 1.0 / safeValue;
}

fn rayBoxInterval(rayOrigin: vec3f, rayDirection: vec3f, boxMin: vec3f, boxMax: vec3f) -> vec2f {
  let reciprocalDirection = vec3f(
    safeReciprocal(rayDirection.x),
    safeReciprocal(rayDirection.y),
    safeReciprocal(rayDirection.z)
  );
  let firstValues = (boxMin - rayOrigin) * reciprocalDirection;
  let secondValues = (boxMax - rayOrigin) * reciprocalDirection;
  let nearValues = min(firstValues, secondValues);
  let farValues = max(firstValues, secondValues);
  let nearDistance = max(max(nearValues.x, nearValues.y), nearValues.z);
  let farDistance = min(min(farValues.x, farValues.y), farValues.z);
  return vec2f(nearDistance, farDistance);
}

fn loadDensity(gridCoord: vec3i) -> f32 {
  let clampedCoord = clamp(
    gridCoord,
    vec3i(0),
    vec3i(GRID_EDGE - 1)
  );
  return textureLoad(densityTexture, clampedCoord, 0).x;
}

fn sampleDensity(volumeCoord: vec3f) -> f32 {
  let clampedCoord = clamp(volumeCoord, vec3f(0.0), vec3f(1.0));
  let gridPos = clampedCoord * f32(GRID_EDGE - 1);
  let baseCoord = vec3i(floor(gridPos));
  let fractionCoord = fract(gridPos);

  let c000 = loadDensity(baseCoord + vec3i(0, 0, 0));
  let c100 = loadDensity(baseCoord + vec3i(1, 0, 0));
  let c010 = loadDensity(baseCoord + vec3i(0, 1, 0));
  let c110 = loadDensity(baseCoord + vec3i(1, 1, 0));
  let c001 = loadDensity(baseCoord + vec3i(0, 0, 1));
  let c101 = loadDensity(baseCoord + vec3i(1, 0, 1));
  let c011 = loadDensity(baseCoord + vec3i(0, 1, 1));
  let c111 = loadDensity(baseCoord + vec3i(1, 1, 1));

  let x00 = lerpValue(c000, c100, fractionCoord.x);
  let x10 = lerpValue(c010, c110, fractionCoord.x);
  let x01 = lerpValue(c001, c101, fractionCoord.x);
  let x11 = lerpValue(c011, c111, fractionCoord.x);
  let y0 = lerpValue(x00, x10, fractionCoord.y);
  let y1 = lerpValue(x01, x11, fractionCoord.y);
  return lerpValue(y0, y1, fractionCoord.z);
}

fn densityAtWorld(worldPos: vec3f) -> f32 {
  let volumeMin = renderParams.volumeMin.xyz;
  let volumeMax = renderParams.volumeMax.xyz;
  let volumeCoord = (worldPos - volumeMin) / (volumeMax - volumeMin);
  if (
    volumeCoord.x < 0.0 || volumeCoord.x > 1.0 ||
    volumeCoord.y < 0.0 || volumeCoord.y > 1.0 ||
    volumeCoord.z < 0.0 || volumeCoord.z > 1.0
  ) {
    return 0.0;
  }
  return sampleDensity(volumeCoord);
}

fn refineDensityHit(
  rayOrigin: vec3f,
  rayDirection: vec3f,
  lowDistanceStart: f32,
  highDistanceStart: f32,
  isoLevel: f32
) -> f32 {
  var lowDistance = lowDistanceStart;
  var highDistance = highDistanceStart;
  for (var refineIndex = 0u; refineIndex < REFINE_STEPS; refineIndex = refineIndex + 1u) {
    let middleDistance = (lowDistance + highDistance) * 0.5;
    let middleDensity = densityAtWorld(rayOrigin + rayDirection * middleDistance);
    if (middleDensity >= isoLevel) {
      highDistance = middleDistance;
    } else {
      lowDistance = middleDistance;
    }
  }
  return highDistance;
}

fn marchDensity(
  rayOrigin: vec3f,
  rayDirection: vec3f,
  boxInterval: vec2f,
  isoLevel: f32,
  rayStep: f32
) -> f32 {
  var walkDistance = max(boxInterval.x, 0.0);
  if (boxInterval.y <= walkDistance) {
    return -1.0;
  }

  var previousDensity = densityAtWorld(rayOrigin + rayDirection * walkDistance);
  if (previousDensity >= isoLevel) {
    return walkDistance;
  }

  for (var stepIndex = 0u; stepIndex < MAX_RAY_STEPS; stepIndex = stepIndex + 1u) {
    let nextDistance = walkDistance + rayStep;
    if (nextDistance > boxInterval.y) {
      break;
    }

    let currentDensity = densityAtWorld(rayOrigin + rayDirection * nextDistance);
    if (previousDensity < isoLevel && currentDensity >= isoLevel) {
      return refineDensityHit(
        rayOrigin,
        rayDirection,
        walkDistance,
        nextDistance,
        isoLevel
      );
    }

    walkDistance = nextDistance;
    previousDensity = currentDensity;
  }

  return -1.0;
}

fn densityNormal(worldPos: vec3f) -> vec3f {
  let volumeExtent = renderParams.volumeMax.xyz - renderParams.volumeMin.xyz;
  let sampleOffset = volumeExtent / f32(GRID_EDGE);

  let densityXp = densityAtWorld(worldPos + vec3f(sampleOffset.x, 0.0, 0.0));
  let densityXm = densityAtWorld(worldPos - vec3f(sampleOffset.x, 0.0, 0.0));
  let densityYp = densityAtWorld(worldPos + vec3f(0.0, sampleOffset.y, 0.0));
  let densityYm = densityAtWorld(worldPos - vec3f(0.0, sampleOffset.y, 0.0));
  let densityZp = densityAtWorld(worldPos + vec3f(0.0, 0.0, sampleOffset.z));
  let densityZm = densityAtWorld(worldPos - vec3f(0.0, 0.0, sampleOffset.z));

  let gradientValue = vec3f(
    (densityXp - densityXm) / max(sampleOffset.x, 0.000001),
    (densityYp - densityYm) / max(sampleOffset.y, 0.000001),
    (densityZp - densityZm) / max(sampleOffset.z, 0.000001)
  );
  return normalize(-gradientValue);
}

fn groundNormal(hitPos: vec3f) -> vec3f {
  let halfSize = vec3f(0.15, 0.02, 0.15);
  let faceValue = abs(hitPos) / halfSize;
  if (faceValue.y >= faceValue.x && faceValue.y >= faceValue.z) {
    return vec3f(0.0, sign(hitPos.y), 0.0);
  }
  if (faceValue.x >= faceValue.z) {
    return vec3f(sign(hitPos.x), 0.0, 0.0);
  }
  return vec3f(0.0, 0.0, sign(hitPos.z));
}

fn skyColor(rayDirection: vec3f) -> vec3f {
  let skyFactor = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  return vec3f(0.018, 0.025, 0.038) +
    vec3f(0.035, 0.055, 0.085) * skyFactor;
}

fn shadeFluid(
  hitPos: vec3f,
  surfaceNormal: vec3f,
  rayDirection: vec3f
) -> vec3f {
  let lightDirection = normalize(vec3f(-0.45, 0.85, 0.35));
  let viewDirection = normalize(-rayDirection);
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuseValue = max(dot(surfaceNormal, lightDirection), 0.0);
  let specularValue = pow(max(dot(surfaceNormal, halfDirection), 0.0), 72.0);
  let fresnelValue = pow(1.0 - max(dot(surfaceNormal, viewDirection), 0.0), 3.0);
  let baseColor = vec3f(0.12, 0.58, 0.78);
  let reflectedColor = skyColor(reflect(rayDirection, surfaceNormal));
  return baseColor * (0.28 + 0.72 * diffuseValue) +
    vec3f(1.0) * specularValue * 0.9 +
    reflectedColor * fresnelValue * 0.65;
}

@vertex
fn fullScreenVertex(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );

  var outputValue: VertexOutput;
  let clipPos = positions[vertexIndex];
  outputValue.position = vec4f(clipPos, 0.0, 1.0);
  outputValue.ndcCoord = clipPos;
  return outputValue;
}

@fragment
fn raymarchFragment(inputValue: VertexOutput) -> @location(0) vec4f {
  let tangentHalfFov = renderParams.rayValues.x;
  let aspectRatio = renderParams.rayValues.y;
  let isoLevel = renderParams.rayValues.z;
  let rayStep = renderParams.rayValues.w;

  let rayOrigin = renderParams.cameraPos.xyz;
  let rayDirection = normalize(
    renderParams.cameraForward.xyz +
    renderParams.cameraRight.xyz * inputValue.ndcCoord.x * aspectRatio * tangentHalfFov +
    renderParams.cameraUp.xyz * inputValue.ndcCoord.y * tangentHalfFov
  );

  let volumeInterval = rayBoxInterval(
    rayOrigin,
    rayDirection,
    renderParams.volumeMin.xyz,
    renderParams.volumeMax.xyz
  );
  let fluidDistance = marchDensity(
    rayOrigin,
    rayDirection,
    volumeInterval,
    isoLevel,
    rayStep
  );

  let groundInterval = rayBoxInterval(
    rayOrigin,
    rayDirection,
    vec3f(-0.15, -0.02, -0.15),
    vec3f(0.15, 0.02, 0.15)
  );

  var groundDistance = 1000000.0;
  let groundNear = max(groundInterval.x, 0.0);
  if (groundInterval.y >= groundNear) {
    groundDistance = groundNear;
  }

  if (fluidDistance >= 0.0 && fluidDistance < groundDistance) {
    let hitPos = rayOrigin + rayDirection * fluidDistance;
    let surfaceNormal = densityNormal(hitPos);
    let fluidColor = shadeFluid(hitPos, surfaceNormal, rayDirection);
    return vec4f(fluidColor, 1.0);
  }

  if (groundDistance < 999999.0) {
    let groundPos = rayOrigin + rayDirection * groundDistance;
    let normalValue = groundNormal(groundPos);
    let lightDirection = normalize(vec3f(-0.45, 0.85, 0.35));
    let lightValue = max(dot(normalValue, lightDirection), 0.0);
    let checkerValue = f32((i32(floor((groundPos.x + 0.15) * 35.0)) +
      i32(floor((groundPos.z + 0.15) * 35.0))) & 1);
    let groundColor = vec3f(0.16, 0.17, 0.18) +
      vec3f(0.035) * checkerValue;
    return vec4f(groundColor * (0.45 + 0.55 * lightValue), 1.0);
  }

  return vec4f(skyColor(rayDirection), 1.0);
}
`;

let sim;
let adapter;
let device;
let canvasContext;
let densityTexture;
let densityView;
let particleBuffer;
let densityParamsBuffer;
let renderParamsBuffer;
let densityPipeline;
let renderPipeline;
let densityBindGroup;
let renderBindGroup;

let paused = false;
let yaw = 0.75;
let pitch = 0.35;
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

const volumeMin = [-0.13, -0.03, -0.13];
const volumeMax = [0.13, 0.20, 0.13];

function setStage(stageText) {
  gpuStatus.textContent = stageText;
}

function normalize(vectorValue) {
  const lengthValue = Math.hypot(
    vectorValue[0],
    vectorValue[1],
    vectorValue[2]
  ) || 1;
  return [
    vectorValue[0] / lengthValue,
    vectorValue[1] / lengthValue,
    vectorValue[2] / lengthValue,
  ];
}

function cross(firstVector, secondVector) {
  return [
    firstVector[1] * secondVector[2] - firstVector[2] * secondVector[1],
    firstVector[2] * secondVector[0] - firstVector[0] * secondVector[2],
    firstVector[0] * secondVector[1] - firstVector[1] * secondVector[0],
  ];
}

function cameraBasis() {
  const center = [
    sim.view_center_x(),
    sim.view_center_y(),
    sim.view_center_z(),
  ];
  const distanceValue = sim.view_distance() * distanceScale;
  const cosPitch = Math.cos(pitch);
  const cameraPos = [
    center[0] + Math.sin(yaw) * cosPitch * distanceValue,
    center[1] + Math.sin(pitch) * distanceValue,
    center[2] + Math.cos(yaw) * cosPitch * distanceValue,
  ];
  const cameraForward = normalize([
    center[0] - cameraPos[0],
    center[1] - cameraPos[1],
    center[2] - cameraPos[2],
  ]);
  const cameraRight = normalize(cross(cameraForward, [0, 1, 0]));
  const cameraUp = cross(cameraRight, cameraForward);
  return { cameraPos, cameraForward, cameraRight, cameraUp };
}

function resizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

async function assertShaderCompiles(shaderModule, labelText) {
  const compilationInfo = await shaderModule.getCompilationInfo();
  const errors = compilationInfo.messages.filter(
    (messageValue) => messageValue.type === "error"
  );
  if (errors.length) {
    throw new Error(
      `${labelText} WGSL errors: ${errors.map((messageValue) => messageValue.message).join(" | ")}`
    );
  }
}

function createGpuResources(outputFormat) {
  particleBuffer = device.createBuffer({
    size: MAX_PARTICLES * 3 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  densityParamsBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  renderParamsBuffer = device.createBuffer({
    size: 112,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  densityTexture = device.createTexture({
    size: {
      width: GRID_EDGE,
      height: GRID_EDGE,
      depthOrArrayLayers: GRID_EDGE,
    },
    dimension: "3d",
    format: "r32float",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  densityView = densityTexture.createView({ dimension: "3d" });

  const densityModule = device.createShaderModule({
    label: "surface-tension-density-compute",
    code: densityShaderSource,
  });
  const renderModule = device.createShaderModule({
    label: "surface-tension-raymarch-render",
    code: renderShaderSource,
  });

  return { densityModule, renderModule, outputFormat };
}

async function createPipelines(outputFormat) {
  setStage("shader-compilation-info");
  const { densityModule, renderModule } = createGpuResources(outputFormat);
  await Promise.all([
    assertShaderCompiles(densityModule, "density compute"),
    assertShaderCompiles(renderModule, "raymarch render"),
  ]);

  setStage("create-pipeline");
  densityPipeline = device.createComputePipeline({
    label: "surface-tension-density-pipeline",
    layout: "auto",
    compute: {
      module: densityModule,
      entryPoint: "densityMain",
    },
  });

  renderPipeline = device.createRenderPipeline({
    label: "surface-tension-raymarch-pipeline",
    layout: "auto",
    vertex: {
      module: renderModule,
      entryPoint: "fullScreenVertex",
    },
    fragment: {
      module: renderModule,
      entryPoint: "raymarchFragment",
      targets: [{ format: outputFormat }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  densityBindGroup = device.createBindGroup({
    label: "surface-tension-density-bind-group",
    layout: densityPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: densityView },
      { binding: 2, resource: { buffer: densityParamsBuffer } },
    ],
  });

  renderBindGroup = device.createBindGroup({
    label: "surface-tension-raymarch-bind-group",
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: densityView },
      { binding: 1, resource: { buffer: renderParamsBuffer } },
    ],
  });
}

function writeGpuInputs(renderWidth, renderHeight) {
  const positions = sim.fluid_positions(0);
  if (positions.byteLength > particleBuffer.size) {
    throw new Error("Particle buffer capacity exceeded");
  }
  device.queue.writeBuffer(particleBuffer, 0, positions);

  const kernelRadius = Number(kernelSlider.value);
  const densityParams = new Float32Array([
    volumeMin[0], volumeMin[1], volumeMin[2], 0,
    volumeMax[0], volumeMax[1], volumeMax[2], 0,
    sim.particle_count(), kernelRadius, GRID_EDGE, 0,
  ]);
  device.queue.writeBuffer(densityParamsBuffer, 0, densityParams);

  const { cameraPos, cameraForward, cameraRight, cameraUp } = cameraBasis();
  const aspectRatio = renderWidth / renderHeight;
  const tangentHalfFov = Math.tan(55 * Math.PI / 360);
  const isoLevel = Number(isoSlider.value);
  const rayStep = 0.003;

  const renderParams = new Float32Array([
    cameraPos[0], cameraPos[1], cameraPos[2], 0,
    cameraRight[0], cameraRight[1], cameraRight[2], 0,
    cameraUp[0], cameraUp[1], cameraUp[2], 0,
    cameraForward[0], cameraForward[1], cameraForward[2], 0,
    volumeMin[0], volumeMin[1], volumeMin[2], 0,
    volumeMax[0], volumeMax[1], volumeMax[2], 0,
    tangentHalfFov, aspectRatio, isoLevel, rayStep,
  ]);
  device.queue.writeBuffer(renderParamsBuffer, 0, renderParams);
}

function encodeGpuFrame(renderView, renderWidth, renderHeight) {
  writeGpuInputs(renderWidth, renderHeight);

  const encoder = device.createCommandEncoder({
    label: "surface-tension-frame-encoder",
  });

  const computePass = encoder.beginComputePass({
    label: "density-volume-pass",
  });
  computePass.setPipeline(densityPipeline);
  computePass.setBindGroup(0, densityBindGroup);
  computePass.dispatchWorkgroups(
    Math.ceil(GRID_EDGE / WORKGROUP_EDGE),
    Math.ceil(GRID_EDGE / WORKGROUP_EDGE),
    Math.ceil(GRID_EDGE / WORKGROUP_EDGE),
  );
  computePass.end();

  const renderPass = encoder.beginRenderPass({
    label: "raymarch-render-pass",
    colorAttachments: [{
      view: renderView,
      clearValue: { r: 0.018, g: 0.025, b: 0.038, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    }],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroup);
  renderPass.draw(3, 1, 0, 0);
  renderPass.end();

  device.queue.submit([encoder.finish()]);
}

function resetSimulation() {
  if (sim) {
    sim.free();
  }
  sim = new OfficialExample3dSimulation("surface-tension");
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

function updateSliderLabels() {
  kernelValue.textContent = Number(kernelSlider.value).toFixed(3);
  isoValue.textContent = Number(isoSlider.value).toFixed(2);
}

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
});

resetButton.addEventListener("click", resetSimulation);
kernelSlider.addEventListener("input", updateSliderLabels);
isoSlider.addEventListener("input", updateSliderLabels);

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) {
    return;
  }
  const deltaX = event.clientX - lastX;
  const deltaY = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  yaw -= deltaX * 0.008;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - deltaY * 0.008));
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  distanceScale = Math.max(
    0.45,
    Math.min(2.4, distanceScale * Math.exp(event.deltaY * 0.001))
  );
}, { passive: false });

async function runCiFrame(outputFormat) {
  setStage("validation-scope");
  device.pushErrorScope("validation");

  const offscreenTexture = device.createTexture({
    size: { width: 256, height: 256 },
    format: outputFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  sim.step(1 / 200);
  encodeGpuFrame(offscreenTexture.createView(), 256, 256);

  setStage("submitted-work-wait");
  await device.queue.onSubmittedWorkDone();

  const validationError = await device.popErrorScope();
  if (validationError) {
    throw new Error(`WebGPU validation error: ${validationError.message}`);
  }

  offscreenTexture.destroy();
  setStage("CI WebGPU ok");
}

async function main() {
  updateSliderLabels();
  setStage("wasm-init");
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.50", import.meta.url));
  resetSimulation();

  setStage("request-adapter");
  adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("requestAdapter() returned null");
  }

  setStage("request-device");
  device = await adapter.requestDevice();
  device.lost.then((lostInfo) => {
    setStage(`device-lost: ${lostInfo.reason} ${lostInfo.message}`);
  });

  const outputFormat = navigator.gpu.getPreferredCanvasFormat();

  if (!CI_MODE) {
    canvasContext = canvas.getContext("webgpu");
    if (!canvasContext) {
      throw new Error("WebGPU canvas context is unavailable");
    }
    canvasContext.configure({
      device,
      format: outputFormat,
      alphaMode: "opaque",
    });
  }

  await createPipelines(outputFormat);

  if (CI_MODE) {
    await runCiFrame(outputFormat);
    return;
  }

  setStage("running");
  const fixedDt = 1 / 200;

  function frame(now) {
    const frameDt = Math.min((now - previous) / 1000, 0.05);
    previous = now;

    const physicsStart = performance.now();
    if (!paused) {
      accumulator += frameDt;
      let substepCount = 0;
      while (accumulator >= fixedDt && substepCount < 4) {
        sim.step(fixedDt);
        accumulator -= fixedDt;
        substepCount += 1;
      }
    }
    const physicsMs = performance.now() - physicsStart;
    smoothedPhysicsMs = smoothedPhysicsMs === 0
      ? physicsMs
      : smoothedPhysicsMs * 0.9 + physicsMs * 0.1;

    resizeCanvas();
    const renderStart = performance.now();
    const renderView = canvasContext.getCurrentTexture().createView();
    encodeGpuFrame(renderView, canvas.width, canvas.height);
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
  setStage(`Failed: ${error?.message ?? error}`);
});
