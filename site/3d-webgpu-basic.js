import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=1.90";

const GRID_EDGE = 64;
const TOTAL_VOXELS = GRID_EDGE * GRID_EDGE * GRID_EDGE;
const MAX_PARTICLES = 4096;
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

if (!root || root.dataset.webgpuRaymarch !== "basic") {
  throw new Error("Basic WebGPU page contract is missing");
}
if (!navigator.gpu) {
  gpuStatus.textContent = "WebGPU unavailable";
  throw new Error("WebGPU is not available in this browser");
}

const volumeMin = [-2.7, -0.25, -2.7];
const volumeMax = [2.7, 2.25, 2.7];

const densityShaderSource = `
struct DensityParams {
  volumeMin: vec4f,
  volumeMax: vec4f,
  values: vec4f,
};

const GRID_EDGE: u32 = 64u;
const TOTAL_VOXELS: u32 = 262144u;

@group(0) @binding(0) var<storage, read> particleValues: array<f32>;
@group(0) @binding(1) var<storage, read_write> densityAtoms: array<atomic<u32>>;
@group(0) @binding(2) var densityVolume: texture_storage_3d<r32float, write>;
@group(0) @binding(3) var<uniform> densityParams: DensityParams;

fn linearVoxelIndex(voxelCoord: vec3u) -> u32 {
  return voxelCoord.x + GRID_EDGE * (voxelCoord.y + GRID_EDGE * voxelCoord.z);
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
  let gridDimsF = vec3f(f32(GRID_EDGE));
  let voxelSize = volumeSize / gridDimsF;
  let influenceRadius = densityParams.values.y;
  let fixedScale = densityParams.values.z;

  let centerCoordF = (particlePos - minCorner) / volumeSize * gridDimsF - vec3f(0.5);
  let centerCoord = vec3i(round(centerCoordF));
  let radiusCells = vec3i(ceil(vec3f(influenceRadius) / voxelSize)) + vec3i(1);

  for (var offsetZ = -radiusCells.z; offsetZ <= radiusCells.z; offsetZ = offsetZ + 1) {
    for (var offsetY = -radiusCells.y; offsetY <= radiusCells.y; offsetY = offsetY + 1) {
      for (var offsetX = -radiusCells.x; offsetX <= radiusCells.x; offsetX = offsetX + 1) {
        let voxelCoordI = centerCoord + vec3i(offsetX, offsetY, offsetZ);
        if (
          voxelCoordI.x < 0 || voxelCoordI.y < 0 || voxelCoordI.z < 0 ||
          voxelCoordI.x >= i32(GRID_EDGE) ||
          voxelCoordI.y >= i32(GRID_EDGE) ||
          voxelCoordI.z >= i32(GRID_EDGE)
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
    voxelCoord.x >= GRID_EDGE ||
    voxelCoord.y >= GRID_EDGE ||
    voxelCoord.z >= GRID_EDGE
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
const GRID_EDGE: i32 = 64;
const MAX_FLUID_STEPS: u32 = 220u;
const REFINE_STEPS: u32 = 7u;

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

struct BasinHit {
  distanceValue: f32,
  surfaceNormal: vec3f,
};

@group(0) @binding(0) var densityTexture: texture_3d<f32>;
@group(0) @binding(1) var<uniform> renderParams: RenderParams;

fn safeReciprocal(inputValue: f32) -> f32 {
  var safeValue = inputValue;
  if (abs(safeValue) < 0.000001) {
    safeValue = select(0.000001, -0.000001, safeValue < 0.0);
  }
  return 1.0 / safeValue;
}

fn rayBoxInterval(
  rayOrigin: vec3f,
  rayDirection: vec3f,
  boxMin: vec3f,
  boxMax: vec3f
) -> vec2f {
  let reciprocalDirection = vec3f(
    safeReciprocal(rayDirection.x),
    safeReciprocal(rayDirection.y),
    safeReciprocal(rayDirection.z)
  );
  let firstValues = (boxMin - rayOrigin) * reciprocalDirection;
  let secondValues = (boxMax - rayOrigin) * reciprocalDirection;
  let nearValues = min(firstValues, secondValues);
  let farValues = max(firstValues, secondValues);
  return vec2f(
    max(max(nearValues.x, nearValues.y), nearValues.z),
    min(min(farValues.x, farValues.y), farValues.z)
  );
}

fn loadDensity(gridCoord: vec3i) -> f32 {
  return textureLoad(
    densityTexture,
    clamp(gridCoord, vec3i(0), vec3i(GRID_EDGE - 1)),
    0
  ).x;
}

fn lerpValue(firstValue: f32, secondValue: f32, factorValue: f32) -> f32 {
  return firstValue + (secondValue - firstValue) * factorValue;
}

fn sampleDensity(volumeCoord: vec3f) -> f32 {
  let safeCoord = clamp(volumeCoord, vec3f(0.0), vec3f(1.0));
  let gridPos = safeCoord * f32(GRID_EDGE - 1);
  let baseCoord = vec3i(floor(gridPos));
  let fractionCoord = fract(gridPos);

  let c000 = loadDensity(baseCoord + vec3i(0,0,0));
  let c100 = loadDensity(baseCoord + vec3i(1,0,0));
  let c010 = loadDensity(baseCoord + vec3i(0,1,0));
  let c110 = loadDensity(baseCoord + vec3i(1,1,0));
  let c001 = loadDensity(baseCoord + vec3i(0,0,1));
  let c101 = loadDensity(baseCoord + vec3i(1,0,1));
  let c011 = loadDensity(baseCoord + vec3i(0,1,1));
  let c111 = loadDensity(baseCoord + vec3i(1,1,1));

  let x00 = lerpValue(c000, c100, fractionCoord.x);
  let x10 = lerpValue(c010, c110, fractionCoord.x);
  let x01 = lerpValue(c001, c101, fractionCoord.x);
  let x11 = lerpValue(c011, c111, fractionCoord.x);
  return lerpValue(
    lerpValue(x00, x10, fractionCoord.y),
    lerpValue(x01, x11, fractionCoord.y),
    fractionCoord.z
  );
}

fn densityAtWorld(worldPos: vec3f) -> f32 {
  let volumeCoord =
    (worldPos - renderParams.volumeMin.xyz) /
    (renderParams.volumeMax.xyz - renderParams.volumeMin.xyz);
  if (any(volumeCoord < vec3f(0.0)) || any(volumeCoord > vec3f(1.0))) {
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
    if (densityAtWorld(rayOrigin + rayDirection * middleDistance) >= isoLevel) {
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

  for (var stepIndex = 0u; stepIndex < MAX_FLUID_STEPS; stepIndex = stepIndex + 1u) {
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

fn boxNormal(hitPos: vec3f, boxCenter: vec3f, halfSize: vec3f) -> vec3f {
  let localPos = hitPos - boxCenter;
  let scaled = abs(localPos) / halfSize;
  if (scaled.y >= scaled.x && scaled.y >= scaled.z) {
    return vec3f(0.0, sign(localPos.y), 0.0);
  }
  if (scaled.x >= scaled.z) {
    return vec3f(sign(localPos.x), 0.0, 0.0);
  }
  return vec3f(0.0, 0.0, sign(localPos.z));
}

fn boxHit(
  rayOrigin: vec3f,
  rayDirection: vec3f,
  boxCenter: vec3f,
  halfSize: vec3f
) -> BasinHit {
  let interval = rayBoxInterval(
    rayOrigin,
    rayDirection,
    boxCenter - halfSize,
    boxCenter + halfSize
  );
  let nearDistance = max(interval.x, 0.0);
  if (interval.y < nearDistance) {
    return BasinHit(1000000.0, vec3f(0.0));
  }
  let hitPos = rayOrigin + rayDirection * nearDistance;
  return BasinHit(nearDistance, boxNormal(hitPos, boxCenter, halfSize));
}

fn nearerBasinHit(firstHit: BasinHit, secondHit: BasinHit) -> BasinHit {
  if (secondHit.distanceValue < firstHit.distanceValue) {
    return secondHit;
  }
  return firstHit;
}

fn intersectBasin(rayOrigin: vec3f, rayDirection: vec3f) -> BasinHit {
  var nearestHit = boxHit(
    rayOrigin,
    rayDirection,
    vec3f(0.0, 0.0, 0.0),
    vec3f(2.5, 0.2, 2.5)
  );

  nearestHit = nearerBasinHit(
    nearestHit,
    boxHit(rayOrigin, rayDirection, vec3f(2.5, 0.7, 0.0), vec3f(0.2, 0.7, 2.5))
  );
  nearestHit = nearerBasinHit(
    nearestHit,
    boxHit(rayOrigin, rayDirection, vec3f(-2.5, 0.7, 0.0), vec3f(0.2, 0.7, 2.5))
  );
  nearestHit = nearerBasinHit(
    nearestHit,
    boxHit(rayOrigin, rayDirection, vec3f(0.0, 0.7, 2.5), vec3f(2.5, 0.7, 0.2))
  );
  nearestHit = nearerBasinHit(
    nearestHit,
    boxHit(rayOrigin, rayDirection, vec3f(0.0, 0.7, -2.5), vec3f(2.5, 0.7, 0.2))
  );
  return nearestHit;
}

fn densityNormal(worldPos: vec3f) -> vec3f {
  let sampleOffset =
    (renderParams.volumeMax.xyz - renderParams.volumeMin.xyz) / f32(GRID_EDGE);
  return normalize(-vec3f(
    densityAtWorld(worldPos + vec3f(sampleOffset.x,0.0,0.0)) -
      densityAtWorld(worldPos - vec3f(sampleOffset.x,0.0,0.0)),
    densityAtWorld(worldPos + vec3f(0.0,sampleOffset.y,0.0)) -
      densityAtWorld(worldPos - vec3f(0.0,sampleOffset.y,0.0)),
    densityAtWorld(worldPos + vec3f(0.0,0.0,sampleOffset.z)) -
      densityAtWorld(worldPos - vec3f(0.0,0.0,sampleOffset.z))
  ));
}

fn skyColor(rayDirection: vec3f) -> vec3f {
  let factorValue = clamp(rayDirection.y * 0.5 + 0.5, 0.0, 1.0);
  return vec3f(0.018,0.026,0.040) + vec3f(0.045,0.065,0.090) * factorValue;
}

fn shadeFluid(surfaceNormal: vec3f, rayDirection: vec3f) -> vec3f {
  let lightDirection = normalize(vec3f(-0.48,0.82,0.30));
  let viewDirection = normalize(-rayDirection);
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuseValue = max(dot(surfaceNormal, lightDirection),0.0);
  let specularValue = pow(max(dot(surfaceNormal,halfDirection),0.0),70.0);
  let fresnelValue = pow(1.0-max(dot(surfaceNormal,viewDirection),0.0),3.0);
  return vec3f(0.08,0.50,0.82)*(0.22+0.78*diffuseValue) +
    vec3f(1.0)*specularValue +
    skyColor(reflect(rayDirection,surfaceNormal))*fresnelValue*0.65;
}

fn shadeBasin(surfaceNormal: vec3f, hitPos: vec3f) -> vec3f {
  let lightDirection = normalize(vec3f(-0.48,0.82,0.30));
  let diffuseValue = max(dot(surfaceNormal, lightDirection),0.0);
  let checkerValue = f32(
    (i32(floor(hitPos.x * 2.0)) + i32(floor(hitPos.z * 2.0))) & 1
  );
  let baseColor = vec3f(0.18,0.19,0.21) + vec3f(0.025)*checkerValue;
  return baseColor*(0.35+0.65*diffuseValue);
}

@vertex
fn fullScreenVertex(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f,3>(
    vec2f(-1.0,-1.0),
    vec2f(3.0,-1.0),
    vec2f(-1.0,3.0)
  );
  var outputValue: VertexOutput;
  let clipPos = positions[vertexIndex];
  outputValue.position = vec4f(clipPos,0.0,1.0);
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

  let fluidInterval = rayBoxInterval(
    rayOrigin,
    rayDirection,
    renderParams.volumeMin.xyz,
    renderParams.volumeMax.xyz
  );
  let fluidHit = marchDensity(
    rayOrigin,
    rayDirection,
    fluidInterval,
    isoLevel,
    rayStep
  );
  let basinHit = intersectBasin(rayOrigin, rayDirection);

  if (fluidHit >= 0.0 && fluidHit < basinHit.distanceValue) {
    let hitPos = rayOrigin + rayDirection * fluidHit;
    return vec4f(shadeFluid(densityNormal(hitPos), rayDirection), 1.0);
  }

  if (basinHit.distanceValue < 999999.0) {
    let hitPos = rayOrigin + rayDirection * basinHit.distanceValue;
    return vec4f(shadeBasin(basinHit.surfaceNormal, hitPos), 1.0);
  }

  return vec4f(skyColor(rayDirection), 1.0);
}
`;

let sim;
let device;
let canvasContext;
let particleBuffer;
let atomicBuffer;
let densityTexture;
let densityView;
let densityParamsBuffer;
let renderParamsBuffer;
let clearPipeline;
let splatPipeline;
let normalizePipeline;
let renderPipeline;
let densityBindGroup;
let renderBindGroup;

let paused=false;
let yaw=0.74;
let pitch=0.32;
let distanceScale=1.0;
let dragging=false;
let lastX=0;
let lastY=0;
let accumulator=0;
let previous=performance.now();
let frames=0;
let fpsSince=previous;
let fps=0;
let smoothedPhysicsMs=0;
let smoothedRenderMs=0;

function setStage(stageText){gpuStatus.textContent=stageText;}

function normalize(vectorValue){
  const lengthValue=Math.hypot(vectorValue[0],vectorValue[1],vectorValue[2])||1;
  return [
    vectorValue[0]/lengthValue,
    vectorValue[1]/lengthValue,
    vectorValue[2]/lengthValue,
  ];
}
function cross(firstVector,secondVector){
  return [
    firstVector[1]*secondVector[2]-firstVector[2]*secondVector[1],
    firstVector[2]*secondVector[0]-firstVector[0]*secondVector[2],
    firstVector[0]*secondVector[1]-firstVector[1]*secondVector[0],
  ];
}
function cameraBasis(){
  const center=[0.0,0.75,0.0];
  const distanceValue=6.4*distanceScale;
  const cosPitch=Math.cos(pitch);
  const cameraPos=[
    center[0]+Math.sin(yaw)*cosPitch*distanceValue,
    center[1]+Math.sin(pitch)*distanceValue,
    center[2]+Math.cos(yaw)*cosPitch*distanceValue,
  ];
  const cameraForward=normalize([
    center[0]-cameraPos[0],
    center[1]-cameraPos[1],
    center[2]-cameraPos[2],
  ]);
  const cameraRight=normalize(cross(cameraForward,[0,1,0]));
  const cameraUp=cross(cameraRight,cameraForward);
  return {cameraPos,cameraForward,cameraRight,cameraUp};
}

function resizeCanvas(){
  const dpr=Math.min(devicePixelRatio||1,1.4);
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width*dpr));
  const height=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==width||canvas.height!==height){
    canvas.width=width;
    canvas.height=height;
  }
}

async function assertShaderCompiles(shaderModule,labelText){
  const compilationInfo=await shaderModule.getCompilationInfo();
  const errors=compilationInfo.messages.filter(messageValue=>messageValue.type==="error");
  if(errors.length){
    throw new Error(
      `${labelText} WGSL errors: ${errors.map(messageValue=>messageValue.message).join(" | ")}`
    );
  }
}

async function createPipelines(outputFormat){
  particleBuffer=device.createBuffer({
    size:MAX_PARTICLES*3*4,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,
  });
  atomicBuffer=device.createBuffer({
    size:TOTAL_VOXELS*4,
    usage:GPUBufferUsage.STORAGE,
  });
  densityParamsBuffer=device.createBuffer({
    size:48,
    usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
  });
  renderParamsBuffer=device.createBuffer({
    size:112,
    usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,
  });
  densityTexture=device.createTexture({
    size:{width:GRID_EDGE,height:GRID_EDGE,depthOrArrayLayers:GRID_EDGE},
    dimension:"3d",
    format:"r32float",
    usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING,
  });
  densityView=densityTexture.createView({dimension:"3d"});

  const densityModule=device.createShaderModule({
    label:"basic-fluid-density",
    code:densityShaderSource,
  });
  const renderModule=device.createShaderModule({
    label:"basic-density-raymarch",
    code:renderShaderSource,
  });

  setStage("shader-compilation-info");
  await Promise.all([
    assertShaderCompiles(densityModule,"basic density"),
    assertShaderCompiles(renderModule,"basic render"),
  ]);

  const computeBindGroupLayout=device.createBindGroupLayout({
    entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,storageTexture:{
        access:"write-only",format:"r32float",viewDimension:"3d"
      }},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},
    ],
  });
  const computeLayout=device.createPipelineLayout({
    bindGroupLayouts:[computeBindGroupLayout],
  });

  clearPipeline=device.createComputePipeline({
    layout:computeLayout,
    compute:{module:densityModule,entryPoint:"clearDensityMain"},
  });
  splatPipeline=device.createComputePipeline({
    layout:computeLayout,
    compute:{module:densityModule,entryPoint:"splatParticlesMain"},
  });
  normalizePipeline=device.createComputePipeline({
    layout:computeLayout,
    compute:{module:densityModule,entryPoint:"normalizeDensityMain"},
  });

  densityBindGroup=device.createBindGroup({
    layout:computeBindGroupLayout,
    entries:[
      {binding:0,resource:{buffer:particleBuffer}},
      {binding:1,resource:{buffer:atomicBuffer}},
      {binding:2,resource:densityView},
      {binding:3,resource:{buffer:densityParamsBuffer}},
    ],
  });

  renderPipeline=device.createRenderPipeline({
    layout:"auto",
    vertex:{module:renderModule,entryPoint:"fullScreenVertex"},
    fragment:{
      module:renderModule,
      entryPoint:"raymarchFragment",
      targets:[{format:outputFormat}],
    },
    primitive:{topology:"triangle-list"},
  });

  renderBindGroup=device.createBindGroup({
    layout:renderPipeline.getBindGroupLayout(0),
    entries:[
      {binding:0,resource:densityView},
      {binding:1,resource:{buffer:renderParamsBuffer}},
    ],
  });
}

function writeGpuInputs(width,height){
  const positions=sim.fluid_positions(0);
  const particleCount=positions.length/3;
  if(particleCount>MAX_PARTICLES){
    throw new Error(`Basic particle capacity exceeded: ${particleCount}`);
  }
  device.queue.writeBuffer(particleBuffer,0,positions);

  device.queue.writeBuffer(
    densityParamsBuffer,
    0,
    new Float32Array([
      volumeMin[0],volumeMin[1],volumeMin[2],0,
      volumeMax[0],volumeMax[1],volumeMax[2],0,
      particleCount,
      Number(kernelSlider.value),
      FIXED_POINT_SCALE,
      0,
    ])
  );

  const {cameraPos,cameraForward,cameraRight,cameraUp}=cameraBasis();
  device.queue.writeBuffer(
    renderParamsBuffer,
    0,
    new Float32Array([
      cameraPos[0],cameraPos[1],cameraPos[2],0,
      cameraRight[0],cameraRight[1],cameraRight[2],0,
      cameraUp[0],cameraUp[1],cameraUp[2],0,
      cameraForward[0],cameraForward[1],cameraForward[2],0,
      volumeMin[0],volumeMin[1],volumeMin[2],0,
      volumeMax[0],volumeMax[1],volumeMax[2],0,
      Math.tan(55*Math.PI/360),
      width/height,
      Number(isoSlider.value),
      0.04,
    ])
  );
}

function encodeGpuFrame(renderView,width,height){
  writeGpuInputs(width,height);
  const encoder=device.createCommandEncoder({label:"basic-raymarch-frame"});

  const clearPass=encoder.beginComputePass({label:"basic-density-clear"});
  clearPass.setPipeline(clearPipeline);
  clearPass.setBindGroup(0,densityBindGroup);
  clearPass.dispatchWorkgroups(Math.ceil(TOTAL_VOXELS/256));
  clearPass.end();

  const splatPass=encoder.beginComputePass({label:"basic-particle-splat"});
  splatPass.setPipeline(splatPipeline);
  splatPass.setBindGroup(0,densityBindGroup);
  splatPass.dispatchWorkgroups(Math.ceil(sim.particle_count()/64));
  splatPass.end();

  const normalizePass=encoder.beginComputePass({label:"basic-density-normalize"});
  normalizePass.setPipeline(normalizePipeline);
  normalizePass.setBindGroup(0,densityBindGroup);
  normalizePass.dispatchWorkgroups(
    Math.ceil(GRID_EDGE/4),
    Math.ceil(GRID_EDGE/4),
    Math.ceil(GRID_EDGE/4),
  );
  normalizePass.end();

  const renderPass=encoder.beginRenderPass({
    label:"basic-density-raymarch",
    colorAttachments:[{
      view:renderView,
      clearValue:{r:0.018,g:0.026,b:0.040,a:1},
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

function resetSimulation(){
  if(sim)sim.free();
  sim=new OfficialExample3dSimulation("basic");
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

function updateSliderLabels(){
  kernelValue.textContent=Number(kernelSlider.value).toFixed(2);
  isoValue.textContent=Number(isoSlider.value).toFixed(2);
}

pauseButton.addEventListener("click",()=>{
  paused=!paused;
  pauseButton.textContent=paused?"Resume":"Pause";
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
  if(!dragging)return;
  const deltaX=event.clientX-lastX;
  const deltaY=event.clientY-lastY;
  lastX=event.clientX;
  lastY=event.clientY;
  yaw-=deltaX*0.008;
  pitch=Math.max(-1.05,Math.min(1.05,pitch-deltaY*0.008));
});
canvas.addEventListener("pointerup",()=>{dragging=false;});
canvas.addEventListener("pointercancel",()=>{dragging=false;});
canvas.addEventListener("wheel",(event)=>{
  event.preventDefault();
  distanceScale=Math.max(0.5,Math.min(2.5,distanceScale*Math.exp(event.deltaY*0.001)));
},{passive:false});

async function runCiFrame(outputFormat){
  sim.step(1/200);
  if(sim.particle_count()!==3375){
    throw new Error(`Basic CI expected 3375 particles, got ${sim.particle_count()}`);
  }

  device.pushErrorScope("validation");
  const offscreen=device.createTexture({
    size:{width:160,height:120},
    format:outputFormat,
    usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC,
  });
  encodeGpuFrame(offscreen.createView(),160,120);
  setStage("submitted-work-wait");
  await device.queue.onSubmittedWorkDone();
  const validationError=await device.popErrorScope();
  if(validationError){
    throw new Error(`WebGPU validation error: ${validationError.message}`);
  }
  offscreen.destroy();
  setStage("CI WebGPU basic ok");
}

async function main(){
  updateSliderLabels();
  setStage("wasm-init");
  await init(new URL("./pkg/sph_web_samples_bg.wasm?v=1.90", import.meta.url));
  resetSimulation();

  setStage("request-adapter");
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter)throw new Error("requestAdapter() returned null");

  setStage("request-device");
  device=await adapter.requestDevice();
  device.lost.then(info=>setStage(`device-lost: ${info.reason} ${info.message}`));

  const outputFormat=navigator.gpu.getPreferredCanvasFormat();
  if(!CI_MODE){
    canvasContext=canvas.getContext("webgpu");
    if(!canvasContext)throw new Error("WebGPU canvas context is unavailable");
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
      while(accumulator>=fixedDt&&substeps<4){
        sim.step(fixedDt);
        accumulator-=fixedDt;
        substeps+=1;
      }
    }
    const physicsMs=performance.now()-physicsStart;
    smoothedPhysicsMs=smoothedPhysicsMs===0?physicsMs:smoothedPhysicsMs*0.9+physicsMs*0.1;

    resizeCanvas();
    const renderStart=performance.now();
    encodeGpuFrame(canvasContext.getCurrentTexture().createView(),canvas.width,canvas.height);
    const renderMs=performance.now()-renderStart;
    smoothedRenderMs=smoothedRenderMs===0?renderMs:smoothedRenderMs*0.9+renderMs*0.1;

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
  setStage(`Failed: ${error?.message??error}`);
});
