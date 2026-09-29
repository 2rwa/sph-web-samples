import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=1.70";

const GRID_X = 56;
const GRID_Y = 72;
const GRID_Z = 56;
const TOTAL_VOXELS = GRID_X * GRID_Y * GRID_Z;
const MAX_PARTICLES_PER_FLUID = 1024;
const FIXED_POINT_SCALE = 4096;
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

if (!root || root.dataset.webgpuRaymarch !== "elasticity") {
  throw new Error("Elasticity WebGPU page contract is missing");
}
if (!navigator.gpu) {
  gpuStatus.textContent = "WebGPU unavailable";
  throw new Error("WebGPU is not available in this browser");
}

const volumeMin = [-0.62, -0.24, -0.62];
const volumeMax = [0.62, 1.58, 0.62];

const densityShaderSource = `
struct DensityParams {
  volumeMin: vec4f,
  volumeMax: vec4f,
  values: vec4f,
};

const GRID_DIMS: vec3u = vec3u(56u, 72u, 56u);
const TOTAL_VOXELS: u32 = 225792u;

@group(0) @binding(0) var<storage, read> particleValues: array<f32>;
@group(0) @binding(1) var<storage, read_write> densityAtoms: array<atomic<u32>>;
@group(0) @binding(2) var densityVolume: texture_storage_3d<r32float, write>;
@group(0) @binding(3) var<uniform> densityParams: DensityParams;

fn linearVoxelIndex(voxelCoord: vec3u) -> u32 {
  return voxelCoord.x + GRID_DIMS.x * (voxelCoord.y + GRID_DIMS.y * voxelCoord.z);
}

@compute @workgroup_size(256)
fn clearDensityMain(@builtin(global_invocation_id) invocationId: vec3u) {
  let flatIndex = invocationId.x;
  if (flatIndex >= TOTAL_VOXELS) {
    return;
  }
  atomicStore(&densityAtoms[flatIndex], 0u);
}

@compute @workgroup_size(64)
fn splatParticlesMain(@builtin(global_invocation_id) invocationId: vec3u) {
  let particleIndex = invocationId.x;
  let particleCount = u32(densityParams.values.x + 0.5);
  if (particleIndex >= particleCount) {
    return;
  }

  let baseIndex = particleIndex * 3u;
  let particlePos = vec3f(
    particleValues[baseIndex],
    particleValues[baseIndex + 1u],
    particleValues[baseIndex + 2u]
  );

  let minCorner = densityParams.volumeMin.xyz;
  let maxCorner = densityParams.volumeMax.xyz;
  let volumeSize = maxCorner - minCorner;
  let gridDimsF = vec3f(GRID_DIMS);
  let voxelSize = volumeSize / gridDimsF;
  let influenceRadius = densityParams.values.y;
  let fixedScale = densityParams.values.z;

  let centerCoordF = (particlePos - minCorner) / volumeSize * gridDimsF - vec3f(0.5);
  let centerCoord = vec3i(round(centerCoordF));
  let radiusCells = vec3i(ceil(vec3f(influenceRadius) / voxelSize)) + vec3i(1);

  for (var oz = -radiusCells.z; oz <= radiusCells.z; oz = oz + 1) {
    for (var oy = -radiusCells.y; oy <= radiusCells.y; oy = oy + 1) {
      for (var ox = -radiusCells.x; ox <= radiusCells.x; ox = ox + 1) {
        let voxelCoordI = centerCoord + vec3i(ox, oy, oz);
        if (
          voxelCoordI.x < 0 || voxelCoordI.y < 0 || voxelCoordI.z < 0 ||
          voxelCoordI.x >= i32(GRID_DIMS.x) ||
          voxelCoordI.y >= i32(GRID_DIMS.y) ||
          voxelCoordI.z >= i32(GRID_DIMS.z)
        ) {
          continue;
        }

        let voxelCoord = vec3u(voxelCoordI);
        let worldPos = minCorner + (vec3f(voxelCoord) + vec3f(0.5)) * voxelSize;
        let particleDistance = distance(worldPos, particlePos);
        let kernelWeight = 1.0 - particleDistance / influenceRadius;
        if (kernelWeight <= 0.0) {
          continue;
        }

        let densityContribution = kernelWeight * kernelWeight * kernelWeight;
        let fixedContribution = u32(max(1.0, round(densityContribution * fixedScale)));
        atomicAdd(&densityAtoms[linearVoxelIndex(voxelCoord)], fixedContribution);
      }
    }
  }
}

@compute @workgroup_size(4, 4, 4)
fn normalizeDensityMain(@builtin(global_invocation_id) voxelCoord: vec3u) {
  if (
    voxelCoord.x >= GRID_DIMS.x ||
    voxelCoord.y >= GRID_DIMS.y ||
    voxelCoord.z >= GRID_DIMS.z
  ) {
    return;
  }

  let densityValue =
    f32(atomicLoad(&densityAtoms[linearVoxelIndex(voxelCoord)])) /
    densityParams.values.z;

  textureStore(
    densityVolume,
    vec3i(voxelCoord),
    vec4f(densityValue, 0.0, 0.0, 1.0)
  );
}
`;

const renderShaderSource = `
const GRID_DIMS: vec3i = vec3i(56, 72, 56);
const MAX_RAY_STEPS: u32 = 220u;
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

@group(0) @binding(0) var textureA: texture_3d<f32>;
@group(0) @binding(1) var textureB: texture_3d<f32>;
@group(0) @binding(2) var<uniform> renderParams: RenderParams;

fn safeReciprocal(value: f32) -> f32 {
  var safeValue = value;
  if (abs(safeValue) < 0.000001) {
    safeValue = select(0.000001, -0.000001, safeValue < 0.0);
  }
  return 1.0 / safeValue;
}

fn rayBoxInterval(ro: vec3f, rd: vec3f, boxMin: vec3f, boxMax: vec3f) -> vec2f {
  let invDir = vec3f(
    safeReciprocal(rd.x),
    safeReciprocal(rd.y),
    safeReciprocal(rd.z)
  );
  let first = (boxMin - ro) * invDir;
  let second = (boxMax - ro) * invDir;
  let nearV = min(first, second);
  let farV = max(first, second);
  return vec2f(
    max(max(nearV.x, nearV.y), nearV.z),
    min(min(farV.x, farV.y), farV.z)
  );
}

fn loadA(coord: vec3i) -> f32 {
  return textureLoad(textureA, clamp(coord, vec3i(0), GRID_DIMS - vec3i(1)), 0).x;
}
fn loadB(coord: vec3i) -> f32 {
  return textureLoad(textureB, clamp(coord, vec3i(0), GRID_DIMS - vec3i(1)), 0).x;
}
fn lerpValue(a: f32, b: f32, t: f32) -> f32 {
  return a + (b - a) * t;
}

fn sampleA(coord: vec3f) -> f32 {
  let gridPos = clamp(coord, vec3f(0.0), vec3f(1.0)) * vec3f(GRID_DIMS - vec3i(1));
  let base = vec3i(floor(gridPos));
  let f = fract(gridPos);
  let x00 = lerpValue(loadA(base), loadA(base + vec3i(1,0,0)), f.x);
  let x10 = lerpValue(loadA(base + vec3i(0,1,0)), loadA(base + vec3i(1,1,0)), f.x);
  let x01 = lerpValue(loadA(base + vec3i(0,0,1)), loadA(base + vec3i(1,0,1)), f.x);
  let x11 = lerpValue(loadA(base + vec3i(0,1,1)), loadA(base + vec3i(1,1,1)), f.x);
  return lerpValue(lerpValue(x00, x10, f.y), lerpValue(x01, x11, f.y), f.z);
}

fn sampleB(coord: vec3f) -> f32 {
  let gridPos = clamp(coord, vec3f(0.0), vec3f(1.0)) * vec3f(GRID_DIMS - vec3i(1));
  let base = vec3i(floor(gridPos));
  let f = fract(gridPos);
  let x00 = lerpValue(loadB(base), loadB(base + vec3i(1,0,0)), f.x);
  let x10 = lerpValue(loadB(base + vec3i(0,1,0)), loadB(base + vec3i(1,1,0)), f.x);
  let x01 = lerpValue(loadB(base + vec3i(0,0,1)), loadB(base + vec3i(1,0,1)), f.x);
  let x11 = lerpValue(loadB(base + vec3i(0,1,1)), loadB(base + vec3i(1,1,1)), f.x);
  return lerpValue(lerpValue(x00, x10, f.y), lerpValue(x01, x11, f.y), f.z);
}

fn worldToVolume(worldPos: vec3f) -> vec3f {
  return (worldPos - renderParams.volumeMin.xyz) /
    (renderParams.volumeMax.xyz - renderParams.volumeMin.xyz);
}

fn densityAtWorldA(worldPos: vec3f) -> f32 {
  let coord = worldToVolume(worldPos);
  if (any(coord < vec3f(0.0)) || any(coord > vec3f(1.0))) {
    return 0.0;
  }
  return sampleA(coord);
}

fn densityAtWorldB(worldPos: vec3f) -> f32 {
  let coord = worldToVolume(worldPos);
  if (any(coord < vec3f(0.0)) || any(coord > vec3f(1.0))) {
    return 0.0;
  }
  return sampleB(coord);
}

fn refineDensityHitA(ro: vec3f, rd: vec3f, lowStart: f32, highStart: f32, iso: f32) -> f32 {
  var low = lowStart;
  var high = highStart;
  for (var i = 0u; i < REFINE_STEPS; i = i + 1u) {
    let mid = (low + high) * 0.5;
    if (densityAtWorldA(ro + rd * mid) >= iso) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return high;
}

fn refineDensityHitB(ro: vec3f, rd: vec3f, lowStart: f32, highStart: f32, iso: f32) -> f32 {
  var low = lowStart;
  var high = highStart;
  for (var i = 0u; i < REFINE_STEPS; i = i + 1u) {
    let mid = (low + high) * 0.5;
    if (densityAtWorldB(ro + rd * mid) >= iso) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return high;
}

fn marchDensityA(ro: vec3f, rd: vec3f, interval: vec2f, iso: f32, stepSize: f32) -> f32 {
  var walk = max(interval.x, 0.0);
  if (interval.y <= walk) { return -1.0; }
  var prev = densityAtWorldA(ro + rd * walk);
  if (prev >= iso) { return walk; }

  for (var i = 0u; i < MAX_RAY_STEPS; i = i + 1u) {
    let next = walk + stepSize;
    if (next > interval.y) { break; }
    let current = densityAtWorldA(ro + rd * next);
    if (prev < iso && current >= iso) {
      return refineDensityHitA(ro, rd, walk, next, iso);
    }
    walk = next;
    prev = current;
  }
  return -1.0;
}

fn marchDensityB(ro: vec3f, rd: vec3f, interval: vec2f, iso: f32, stepSize: f32) -> f32 {
  var walk = max(interval.x, 0.0);
  if (interval.y <= walk) { return -1.0; }
  var prev = densityAtWorldB(ro + rd * walk);
  if (prev >= iso) { return walk; }

  for (var i = 0u; i < MAX_RAY_STEPS; i = i + 1u) {
    let next = walk + stepSize;
    if (next > interval.y) { break; }
    let current = densityAtWorldB(ro + rd * next);
    if (prev < iso && current >= iso) {
      return refineDensityHitB(ro, rd, walk, next, iso);
    }
    walk = next;
    prev = current;
  }
  return -1.0;
}

fn normalA(worldPos: vec3f) -> vec3f {
  let d = (renderParams.volumeMax.xyz - renderParams.volumeMin.xyz) / vec3f(GRID_DIMS);
  return normalize(-vec3f(
    densityAtWorldA(worldPos + vec3f(d.x,0.0,0.0)) - densityAtWorldA(worldPos - vec3f(d.x,0.0,0.0)),
    densityAtWorldA(worldPos + vec3f(0.0,d.y,0.0)) - densityAtWorldA(worldPos - vec3f(0.0,d.y,0.0)),
    densityAtWorldA(worldPos + vec3f(0.0,0.0,d.z)) - densityAtWorldA(worldPos - vec3f(0.0,0.0,d.z))
  ));
}

fn normalB(worldPos: vec3f) -> vec3f {
  let d = (renderParams.volumeMax.xyz - renderParams.volumeMin.xyz) / vec3f(GRID_DIMS);
  return normalize(-vec3f(
    densityAtWorldB(worldPos + vec3f(d.x,0.0,0.0)) - densityAtWorldB(worldPos - vec3f(d.x,0.0,0.0)),
    densityAtWorldB(worldPos + vec3f(0.0,d.y,0.0)) - densityAtWorldB(worldPos - vec3f(0.0,d.y,0.0)),
    densityAtWorldB(worldPos + vec3f(0.0,0.0,d.z)) - densityAtWorldB(worldPos - vec3f(0.0,0.0,d.z))
  ));
}

fn skyColor(rd: vec3f) -> vec3f {
  let f = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  return vec3f(0.018,0.024,0.035) + vec3f(0.035,0.055,0.080) * f;
}

fn shadeSurface(n: vec3f, rd: vec3f, baseColor: vec3f) -> vec3f {
  let light = normalize(vec3f(-0.45,0.85,0.30));
  let viewDir = normalize(-rd);
  let halfDir = normalize(light + viewDir);
  let diffuse = max(dot(n, light), 0.0);
  let specular = pow(max(dot(n, halfDir), 0.0), 58.0);
  let fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  return baseColor * (0.25 + 0.75 * diffuse) +
    vec3f(1.0) * specular * 0.8 +
    skyColor(reflect(rd,n)) * fresnel * 0.45;
}

@vertex
fn fullScreenVertex(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f,3>(
    vec2f(-1.0,-1.0),
    vec2f(3.0,-1.0),
    vec2f(-1.0,3.0)
  );
  var out: VertexOutput;
  let p = positions[vertexIndex];
  out.position = vec4f(p,0.0,1.0);
  out.ndcCoord = p;
  return out;
}

@fragment
fn raymarchFragment(input: VertexOutput) -> @location(0) vec4f {
  let tanHalfFov = renderParams.rayValues.x;
  let aspect = renderParams.rayValues.y;
  let iso = renderParams.rayValues.z;
  let stepSize = renderParams.rayValues.w;

  let ro = renderParams.cameraPos.xyz;
  let rd = normalize(
    renderParams.cameraForward.xyz +
    renderParams.cameraRight.xyz * input.ndcCoord.x * aspect * tanHalfFov +
    renderParams.cameraUp.xyz * input.ndcCoord.y * tanHalfFov
  );

  let interval = rayBoxInterval(ro, rd, renderParams.volumeMin.xyz, renderParams.volumeMax.xyz);
  let hitA = marchDensityA(ro, rd, interval, iso, stepSize);
  let hitB = marchDensityB(ro, rd, interval, iso, stepSize);

  let groundInterval = rayBoxInterval(
    ro, rd,
    vec3f(-1.5,-0.2,-1.5),
    vec3f(1.5,0.2,1.5)
  );
  var groundHit = 1000000.0;
  let groundNear = max(groundInterval.x, 0.0);
  if (groundInterval.y >= groundNear) {
    groundHit = groundNear;
  }

  var elasticHit = 1000000.0;
  var elasticId = -1;
  if (hitA >= 0.0 && hitA < elasticHit) {
    elasticHit = hitA;
    elasticId = 0;
  }
  if (hitB >= 0.0 && hitB < elasticHit) {
    elasticHit = hitB;
    elasticId = 1;
  }

  if (elasticHit < groundHit) {
    let hitPos = ro + rd * elasticHit;
    if (elasticId == 0) {
      return vec4f(shadeSurface(normalA(hitPos), rd, vec3f(0.20,0.55,0.95)), 1.0);
    }
    return vec4f(shadeSurface(normalB(hitPos), rd, vec3f(0.48,0.88,0.42)), 1.0);
  }

  if (groundHit < 999999.0) {
    let hitPos = ro + rd * groundHit;
    let normalValue = select(
      vec3f(0.0,1.0,0.0),
      vec3f(0.0,-1.0,0.0),
      hitPos.y < 0.0
    );
    let light = normalize(vec3f(-0.45,0.85,0.30));
    let diffuse = max(dot(normalValue, light), 0.0);
    return vec4f(vec3f(0.18,0.18,0.20) * (0.35 + 0.65 * diffuse), 1.0);
  }

  return vec4f(skyColor(rd), 1.0);
}
`;

let sim;
let device;
let canvasContext;
let fieldA;
let fieldB;
let clearPipeline;
let splatPipeline;
let normalizePipeline;
let renderPipeline;
let renderBindGroup;
let renderParamsBuffer;

let paused = false;
let yaw = 0.75;
let pitch = 0.30;
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

function setStage(text) {
  gpuStatus.textContent = text;
}

function normalize(v) {
  const l = Math.hypot(v[0],v[1],v[2]) || 1;
  return [v[0]/l,v[1]/l,v[2]/l];
}
function cross(a,b) {
  return [
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0],
  ];
}
function cameraBasis() {
  const center = [0.0,0.72,0.0];
  const distance = 3.0 * distanceScale;
  const cp = Math.cos(pitch);
  const pos = [
    center[0] + Math.sin(yaw)*cp*distance,
    center[1] + Math.sin(pitch)*distance,
    center[2] + Math.cos(yaw)*cp*distance,
  ];
  const forward = normalize([
    center[0]-pos[0],
    center[1]-pos[1],
    center[2]-pos[2],
  ]);
  const right = normalize(cross(forward,[0,1,0]));
  const up = cross(right,forward);
  return {pos,forward,right,up};
}

function resizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width*dpr));
  const height = Math.max(1, Math.round(rect.height*dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

async function assertShaderCompiles(module,label) {
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(m => m.type === "error");
  if (errors.length) {
    throw new Error(`${label} WGSL errors: ${errors.map(m=>m.message).join(" | ")}`);
  }
}

function createDensityField(computeBindGroupLayout) {
  const particleBuffer = device.createBuffer({
    size: MAX_PARTICLES_PER_FLUID * 3 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const atomicBuffer = device.createBuffer({
    size: TOTAL_VOXELS * 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const paramsBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const densityTexture = device.createTexture({
    size: {width:GRID_X,height:GRID_Y,depthOrArrayLayers:GRID_Z},
    dimension: "3d",
    format: "r32float",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const view = densityTexture.createView({dimension:"3d"});
  const bindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      {binding:0,resource:{buffer:particleBuffer}},
      {binding:1,resource:{buffer:atomicBuffer}},
      {binding:2,resource:view},
      {binding:3,resource:{buffer:paramsBuffer}},
    ],
  });
  return {particleBuffer,atomicBuffer,paramsBuffer,densityTexture,view,bindGroup};
}

async function createPipelines(outputFormat) {
  const densityModule = device.createShaderModule({
    label:"elasticity-density",
    code:densityShaderSource,
  });
  const renderModule = device.createShaderModule({
    label:"elasticity-raymarch",
    code:renderShaderSource,
  });

  setStage("shader-compilation-info");
  await Promise.all([
    assertShaderCompiles(densityModule,"elasticity density"),
    assertShaderCompiles(renderModule,"elasticity render"),
  ]);

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,storageTexture:{
        access:"write-only",format:"r32float",viewDimension:"3d"
      }},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},
    ],
  });
  const computeLayout = device.createPipelineLayout({
    bindGroupLayouts:[computeBindGroupLayout],
  });

  clearPipeline = device.createComputePipeline({
    layout:computeLayout,
    compute:{module:densityModule,entryPoint:"clearDensityMain"},
  });
  splatPipeline = device.createComputePipeline({
    layout:computeLayout,
    compute:{module:densityModule,entryPoint:"splatParticlesMain"},
  });
  normalizePipeline = device.createComputePipeline({
    layout:computeLayout,
    compute:{module:densityModule,entryPoint:"normalizeDensityMain"},
  });

  fieldA = createDensityField(computeBindGroupLayout);
  fieldB = createDensityField(computeBindGroupLayout);

  renderParamsBuffer = device.createBuffer({
    size:112,
    usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  renderPipeline = device.createRenderPipeline({
    layout:"auto",
    vertex:{module:renderModule,entryPoint:"fullScreenVertex"},
    fragment:{
      module:renderModule,
      entryPoint:"raymarchFragment",
      targets:[{format:outputFormat}],
    },
    primitive:{topology:"triangle-list"},
  });

  renderBindGroup = device.createBindGroup({
    layout:renderPipeline.getBindGroupLayout(0),
    entries:[
      {binding:0,resource:fieldA.view},
      {binding:1,resource:fieldB.view},
      {binding:2,resource:{buffer:renderParamsBuffer}},
    ],
  });
}

function writeField(field, positions) {
  if (positions.length / 3 > MAX_PARTICLES_PER_FLUID) {
    throw new Error("Elasticity particle capacity exceeded");
  }
  device.queue.writeBuffer(field.particleBuffer,0,positions);
  const params = new Float32Array([
    volumeMin[0],volumeMin[1],volumeMin[2],0,
    volumeMax[0],volumeMax[1],volumeMax[2],0,
    positions.length/3,
    Number(kernelSlider.value),
    FIXED_POINT_SCALE,
    0,
  ]);
  device.queue.writeBuffer(field.paramsBuffer,0,params);
}

function writeRenderParams(width,height) {
  const {pos,forward,right,up} = cameraBasis();
  const params = new Float32Array([
    pos[0],pos[1],pos[2],0,
    right[0],right[1],right[2],0,
    up[0],up[1],up[2],0,
    forward[0],forward[1],forward[2],0,
    volumeMin[0],volumeMin[1],volumeMin[2],0,
    volumeMax[0],volumeMax[1],volumeMax[2],0,
    Math.tan(55*Math.PI/360),
    width/height,
    Number(isoSlider.value),
    0.010,
  ]);
  device.queue.writeBuffer(renderParamsBuffer,0,params);
}

function encodeField(encoder,field,particleCount,label) {
  const clearPass = encoder.beginComputePass({label:`${label}-clear`});
  clearPass.setPipeline(clearPipeline);
  clearPass.setBindGroup(0,field.bindGroup);
  clearPass.dispatchWorkgroups(Math.ceil(TOTAL_VOXELS/256));
  clearPass.end();

  if (particleCount > 0) {
    const splatPass = encoder.beginComputePass({label:`${label}-splat`});
    splatPass.setPipeline(splatPipeline);
    splatPass.setBindGroup(0,field.bindGroup);
    splatPass.dispatchWorkgroups(Math.ceil(particleCount/64));
    splatPass.end();
  }

  const normalizePass = encoder.beginComputePass({label:`${label}-normalize`});
  normalizePass.setPipeline(normalizePipeline);
  normalizePass.setBindGroup(0,field.bindGroup);
  normalizePass.dispatchWorkgroups(
    Math.ceil(GRID_X/4),
    Math.ceil(GRID_Y/4),
    Math.ceil(GRID_Z/4),
  );
  normalizePass.end();
}

function encodeGpuFrame(view,width,height) {
  const positionsA = sim.fluid_positions(0);
  const positionsB = sim.fluid_positions(1);
  writeField(fieldA,positionsA);
  writeField(fieldB,positionsB);
  writeRenderParams(width,height);

  const encoder = device.createCommandEncoder();
  encodeField(encoder,fieldA,positionsA.length/3,"elastic-a");
  encodeField(encoder,fieldB,positionsB.length/3,"elastic-b");

  const renderPass = encoder.beginRenderPass({
    colorAttachments:[{
      view,
      clearValue:{r:0.018,g:0.024,b:0.035,a:1},
      loadOp:"clear",
      storeOp:"store",
    }],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0,renderBindGroup);
  renderPass.draw(3,1,0,0);
  renderPass.end();
  device.queue.submit([encoder.finish()]);
}

function resetSimulation() {
  if (sim) sim.free();
  sim = new OfficialExample3dSimulation("elasticity");
  if (sim.fluid_count() !== 2) {
    throw new Error(`Elasticity expected 2 fluids, got ${sim.fluid_count()}`);
  }
  accumulator=0;
  previous=performance.now();
  frames=0;
  fps=0;
  fpsSince=previous;
  smoothedPhysicsMs=0;
  smoothedRenderMs=0;
  distanceScale=1.0;
  particleLabel.textContent=sim.particle_count().toLocaleString();
}

function updateSliderLabels() {
  kernelValue.textContent=Number(kernelSlider.value).toFixed(4);
  isoValue.textContent=Number(isoSlider.value).toFixed(2);
}

pauseButton.addEventListener("click",()=>{
  paused=!paused;
  pauseButton.textContent=paused ? "Resume" : "Pause";
});
resetButton.addEventListener("click",resetSimulation);
kernelSlider.addEventListener("input",updateSliderLabels);
isoSlider.addEventListener("input",updateSliderLabels);

canvas.addEventListener("pointerdown",(event)=>{
  dragging=true;
  lastX=event.clientX;
  lastY=event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove",(event)=>{
  if(!dragging) return;
  const dx=event.clientX-lastX;
  const dy=event.clientY-lastY;
  lastX=event.clientX;
  lastY=event.clientY;
  yaw-=dx*0.008;
  pitch=Math.max(-1.15,Math.min(1.15,pitch-dy*0.008));
});
canvas.addEventListener("pointerup",()=>{dragging=false;});
canvas.addEventListener("pointercancel",()=>{dragging=false;});
canvas.addEventListener("wheel",(event)=>{
  event.preventDefault();
  distanceScale=Math.max(0.55,Math.min(2.5,distanceScale*Math.exp(event.deltaY*0.001)));
},{passive:false});

async function runCiFrame(outputFormat) {
  for (let i=0;i<3;i+=1) sim.step(1/200);
  device.pushErrorScope("validation");
  const offscreen = device.createTexture({
    size:{width:256,height:256},
    format:outputFormat,
    usage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  encodeGpuFrame(offscreen.createView(),256,256);
  setStage("submitted-work-wait");
  await device.queue.onSubmittedWorkDone();
  const error=await device.popErrorScope();
  if(error) throw new Error(`WebGPU validation error: ${error.message}`);
  offscreen.destroy();
  setStage("CI WebGPU elasticity ok");
}

async function main() {
  updateSliderLabels();
  setStage("wasm-init");
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.70", import.meta.url));
  resetSimulation();

  setStage("request-adapter");
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter) throw new Error("requestAdapter() returned null");

  setStage("request-device");
  device=await adapter.requestDevice();
  device.lost.then(info=>setStage(`device-lost: ${info.reason} ${info.message}`));

  const outputFormat=navigator.gpu.getPreferredCanvasFormat();
  if(!CI_MODE){
    canvasContext=canvas.getContext("webgpu");
    if(!canvasContext) throw new Error("WebGPU canvas context is unavailable");
    canvasContext.configure({device,format:outputFormat,alphaMode:"opaque"});
  }

  await createPipelines(outputFormat);

  if(CI_MODE){
    await runCiFrame(outputFormat);
    return;
  }

  setStage("running");
  const fixedDt=1/200;

  function frame(now){
    const frameDt=Math.min((now-previous)/1000,0.05);
    previous=now;

    const physicsStart=performance.now();
    if(!paused){
      accumulator+=frameDt;
      let substeps=0;
      while(accumulator>=fixedDt && substeps<4){
        sim.step(fixedDt);
        accumulator-=fixedDt;
        substeps+=1;
      }
    }
    const physicsMs=performance.now()-physicsStart;
    smoothedPhysicsMs=smoothedPhysicsMs===0 ? physicsMs : smoothedPhysicsMs*0.9+physicsMs*0.1;

    resizeCanvas();
    const renderStart=performance.now();
    encodeGpuFrame(canvasContext.getCurrentTexture().createView(),canvas.width,canvas.height);
    const renderMs=performance.now()-renderStart;
    smoothedRenderMs=smoothedRenderMs===0 ? renderMs : smoothedRenderMs*0.9+renderMs*0.1;

    frames+=1;
    if(now-fpsSince>=1000){
      fps=frames*1000/(now-fpsSince);
      frames=0;
      fpsSince=now;
      fpsLabel.textContent=fps.toFixed(1);
    }

    particleLabel.textContent=sim.particle_count().toLocaleString();
    physicsLabel.textContent=smoothedPhysicsMs.toFixed(2);
    renderLabel.textContent=smoothedRenderMs.toFixed(2);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((error)=>{
  console.error(error);
  setStage(`Failed: ${error?.message ?? error}`);
});
