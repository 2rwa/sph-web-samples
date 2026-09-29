import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=2.10";

const root = document.querySelector("[data-deep-dive]");
const mode = root?.dataset.deepDive;
const canvas = document.querySelector("#view");
const pauseButton = document.querySelector("#pause");
const resetButton = document.querySelector("#reset");
const particleLabel = document.querySelector("#particles");
const physicsLabel = document.querySelector("#physics-ms");
const renderLabel = document.querySelector("#render-ms");
const fpsLabel = document.querySelector("#fps");
const gpuStatus = document.querySelector("#gpu-status");
const CI_MODE = new URLSearchParams(location.search).get("ci") === "1";
const MAX_PARTICLES = 8192;
const DENSITY_SCALE = 4096;
const SPEED_SCALE = 1024;

const configs = {
  "basic-quality": {
    simulation: "basic",
    volumeMin: [-2.7,-0.25,-2.7],
    volumeMax: [2.7,2.25,2.7],
    grid: [48,48,48],
    kernel: 0.20,
    iso: 0.35,
    rayStep: 0.055,
    cameraCenter: [0,0.75,0],
    cameraDistance: 6.4,
    renderScale: 0.75,
    status: "CI deep basic-quality ok",
  },
  "faucet-velocity": {
    simulation: "faucet",
    volumeMin: [-0.38,-2.05,-0.38],
    volumeMax: [0.38,0.72,0.38],
    grid: [40,96,40],
    kernel: 0.05,
    iso: 0.40,
    rayStep: 0.012,
    cameraCenter: [0,-0.55,0],
    cameraDistance: 2.65,
    renderScale: 1.0,
    status: "CI deep faucet-velocity ok",
  },
  "force-slice": {
    simulation: "custom-forces",
    volumeMin: [-1.35,-1.15,-1.15],
    volumeMax: [1.35,1.15,1.15],
    grid: [56,56,56],
    kernel: 0.085,
    iso: 0.32,
    rayStep: 0.020,
    cameraCenter: [0,0,0],
    cameraDistance: 3.25,
    renderScale: 1.0,
    status: "CI deep force-slice ok",
  },
  "heightfield-section": {
    simulation: "heightfield",
    volumeMin: [-6.2,-2.5,-6.2],
    volumeMax: [6.2,9.0,6.2],
    grid: [64,64,64],
    kernel: 0.45,
    iso: 0.35,
    rayStep: 0.08,
    cameraCenter: [0,2.6,0],
    cameraDistance: 14.5,
    renderScale: 1.0,
    status: "CI deep heightfield-section ok",
  },
};

if (!configs[mode]) throw new Error(`Unknown deep-dive mode: ${mode}`);
if (!navigator.gpu) {
  gpuStatus.textContent = "WebGPU unavailable";
  throw new Error("WebGPU unavailable");
}
const config = configs[mode];

let sim;
let device;
let canvasContext;
let outputFormat;
let computeBindGroupLayout;
let clearPipeline;
let splatPipeline;
let normalizePipeline;
let renderPipeline;
let renderBindGroup;
let computeBindGroup;
let particleBuffer;
let velocityBuffer;
let densityAtoms;
let speedAtoms;
let densityTexture;
let speedTexture;
let densityView;
let speedView;
let densityParamsBuffer;
let renderParamsBuffer;
let gridDims = [...config.grid];
let renderScale = config.renderScale;
let paused = false;
let yaw = 0.72;
let pitch = mode === "heightfield-section" ? 0.34 : 0.24;
let distanceScale = 1.0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let accumulator = 0;
let previous = performance.now();
let frames = 0;
let fpsSince = previous;
let smoothedPhysicsMs = 0;
let smoothedRenderMs = 0;

const densityShaderSource = `
struct DensityParams {
  volumeMin: vec4f,
  volumeMax: vec4f,
  values: vec4f,
  gridValues: vec4f,
};
@group(0) @binding(0) var<storage, read> particleValues: array<f32>;
@group(0) @binding(1) var<storage, read> velocityValues: array<f32>;
@group(0) @binding(2) var<storage, read_write> densityAtoms: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> speedAtoms: array<atomic<u32>>;
@group(0) @binding(4) var densityVolume: texture_storage_3d<r32float, write>;
@group(0) @binding(5) var speedVolume: texture_storage_3d<r32float, write>;
@group(0) @binding(6) var<uniform> densityParams: DensityParams;

fn gridDims() -> vec3u {
  return vec3u(
    u32(densityParams.gridValues.x + 0.5),
    u32(densityParams.gridValues.y + 0.5),
    u32(densityParams.gridValues.z + 0.5)
  );
}
fn linearIndex(coord: vec3u, dims: vec3u) -> u32 {
  return coord.x + dims.x * (coord.y + dims.y * coord.z);
}
@compute @workgroup_size(256)
fn clearDensityMain(@builtin(global_invocation_id) id: vec3u) {
  let flatIndex = id.x;
  let total = u32(densityParams.gridValues.w + 0.5);
  if (flatIndex >= total) { return; }
  atomicStore(&densityAtoms[flatIndex], 0u);
  atomicStore(&speedAtoms[flatIndex], 0u);
}
@compute @workgroup_size(64)
fn splatParticlesMain(@builtin(global_invocation_id) id: vec3u) {
  let particleIndex = id.x;
  let particleCount = u32(densityParams.values.x + 0.5);
  if (particleIndex >= particleCount) { return; }

  let base = particleIndex * 3u;
  let particlePos = vec3f(particleValues[base], particleValues[base+1u], particleValues[base+2u]);
  let particleVelocity = vec3f(velocityValues[base], velocityValues[base+1u], velocityValues[base+2u]);
  let particleSpeed = min(length(particleVelocity), 40.0);

  let dims = gridDims();
  let dimsF = vec3f(dims);
  let minCorner = densityParams.volumeMin.xyz;
  let maxCorner = densityParams.volumeMax.xyz;
  let volumeSize = maxCorner - minCorner;
  let voxelSize = volumeSize / dimsF;
  let influenceRadius = densityParams.values.y;
  let densityScale = densityParams.values.z;
  let speedScale = densityParams.values.w;
  let centerF = (particlePos - minCorner) / volumeSize * dimsF - vec3f(0.5);
  let center = vec3i(round(centerF));
  let radiusCells = vec3i(ceil(vec3f(influenceRadius) / voxelSize)) + vec3i(1);

  for (var oz = -radiusCells.z; oz <= radiusCells.z; oz = oz + 1) {
    for (var oy = -radiusCells.y; oy <= radiusCells.y; oy = oy + 1) {
      for (var ox = -radiusCells.x; ox <= radiusCells.x; ox = ox + 1) {
        let coordI = center + vec3i(ox,oy,oz);
        if (coordI.x < 0 || coordI.y < 0 || coordI.z < 0 ||
            coordI.x >= i32(dims.x) || coordI.y >= i32(dims.y) || coordI.z >= i32(dims.z)) {
          continue;
        }
        let coord = vec3u(coordI);
        let worldPos = minCorner + (vec3f(coord)+vec3f(0.5))*voxelSize;
        let dist = distance(worldPos, particlePos);
        let k = 1.0 - dist / influenceRadius;
        if (k <= 0.0) { continue; }
        let weight = k*k*k;
        let index = linearIndex(coord,dims);
        atomicAdd(&densityAtoms[index], u32(max(1.0, round(weight*densityScale))));
        atomicAdd(&speedAtoms[index], u32(max(0.0, round(weight*particleSpeed*speedScale))));
      }
    }
  }
}
@compute @workgroup_size(4,4,4)
fn normalizeDensityMain(@builtin(global_invocation_id) coord: vec3u) {
  let dims = gridDims();
  if (any(coord >= dims)) { return; }
  let index = linearIndex(coord,dims);
  let densityFixed = atomicLoad(&densityAtoms[index]);
  let speedFixed = atomicLoad(&speedAtoms[index]);
  let densityValue = f32(densityFixed) / densityParams.values.z;
  var speedValue = 0.0;
  if (densityFixed > 0u) {
    let weightedSpeed = f32(speedFixed) / densityParams.values.w;
    speedValue = weightedSpeed / max(densityValue, 0.000001);
  }
  textureStore(densityVolume, vec3i(coord), vec4f(densityValue,0.0,0.0,1.0));
  textureStore(speedVolume, vec3i(coord), vec4f(speedValue,0.0,0.0,1.0));
}
`;

const commonRenderSource = `
const MAX_RAY_STEPS: u32 = 280u;
const REFINE_STEPS: u32 = 7u;
struct RenderParams {
  cameraPos: vec4f,
  cameraRight: vec4f,
  cameraUp: vec4f,
  cameraForward: vec4f,
  volumeMin: vec4f,
  volumeMax: vec4f,
  rayValues: vec4f,
  modeValues: vec4f,
  auxValues: vec4f,
};
struct VertexOutput { @builtin(position) position: vec4f, @location(0) ndcCoord: vec2f };
@group(0) @binding(0) var densityTexture: texture_3d<f32>;
@group(0) @binding(1) var speedTexture: texture_3d<f32>;
@group(0) @binding(2) var<uniform> renderParams: RenderParams;

fn safeReciprocal(v:f32)->f32{
  var s=v; if(abs(s)<0.000001){s=select(0.000001,-0.000001,s<0.0);} return 1.0/s;
}
fn rayBoxInterval(ro:vec3f,rd:vec3f,bmin:vec3f,bmax:vec3f)->vec2f{
  let inv=vec3f(safeReciprocal(rd.x),safeReciprocal(rd.y),safeReciprocal(rd.z));
  let a=(bmin-ro)*inv; let b=(bmax-ro)*inv; let n=min(a,b); let f=max(a,b);
  return vec2f(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));
}
fn lerpValue(a:f32,b:f32,t:f32)->f32{return a+(b-a)*t;}
fn loadDensity(c:vec3i)->f32{
  let dims=vec3i(textureDimensions(densityTexture));
  return textureLoad(densityTexture,clamp(c,vec3i(0),dims-vec3i(1)),0).x;
}
fn loadSpeed(c:vec3i)->f32{
  let dims=vec3i(textureDimensions(speedTexture));
  return textureLoad(speedTexture,clamp(c,vec3i(0),dims-vec3i(1)),0).x;
}
fn sampleVolumeDensity(uvw:vec3f)->f32{
  let dims=vec3i(textureDimensions(densityTexture));
  let p=clamp(uvw,vec3f(0.0),vec3f(1.0))*vec3f(dims-vec3i(1));
  let b=vec3i(floor(p)); let f=fract(p);
  let x00=lerpValue(loadDensity(b),loadDensity(b+vec3i(1,0,0)),f.x);
  let x10=lerpValue(loadDensity(b+vec3i(0,1,0)),loadDensity(b+vec3i(1,1,0)),f.x);
  let x01=lerpValue(loadDensity(b+vec3i(0,0,1)),loadDensity(b+vec3i(1,0,1)),f.x);
  let x11=lerpValue(loadDensity(b+vec3i(0,1,1)),loadDensity(b+vec3i(1,1,1)),f.x);
  return lerpValue(lerpValue(x00,x10,f.y),lerpValue(x01,x11,f.y),f.z);
}
fn sampleVolumeSpeed(uvw:vec3f)->f32{
  let dims=vec3i(textureDimensions(speedTexture));
  let p=clamp(uvw,vec3f(0.0),vec3f(1.0))*vec3f(dims-vec3i(1));
  let b=vec3i(floor(p)); let f=fract(p);
  let x00=lerpValue(loadSpeed(b),loadSpeed(b+vec3i(1,0,0)),f.x);
  let x10=lerpValue(loadSpeed(b+vec3i(0,1,0)),loadSpeed(b+vec3i(1,1,0)),f.x);
  let x01=lerpValue(loadSpeed(b+vec3i(0,0,1)),loadSpeed(b+vec3i(1,0,1)),f.x);
  let x11=lerpValue(loadSpeed(b+vec3i(0,1,1)),loadSpeed(b+vec3i(1,1,1)),f.x);
  return lerpValue(lerpValue(x00,x10,f.y),lerpValue(x01,x11,f.y),f.z);
}
fn worldUVW(p:vec3f)->vec3f{return (p-renderParams.volumeMin.xyz)/(renderParams.volumeMax.xyz-renderParams.volumeMin.xyz);}
fn densityAtWorldRaw(p:vec3f)->f32{
  let uvw=worldUVW(p); if(any(uvw<vec3f(0.0))||any(uvw>vec3f(1.0))){return 0.0;} return sampleVolumeDensity(uvw);
}
fn densityAtWorld(p:vec3f)->f32{return densityAtWorldRaw(p);}
fn speedAtWorld(p:vec3f)->f32{
  let uvw=worldUVW(p); if(any(uvw<vec3f(0.0))||any(uvw>vec3f(1.0))){return 0.0;} return sampleVolumeSpeed(uvw);
}
fn refineDensityHit(ro:vec3f,rd:vec3f,lo0:f32,hi0:f32,iso:f32)->f32{
  var lo=lo0; var hi=hi0;
  for(var i=0u;i<REFINE_STEPS;i=i+1u){let m=(lo+hi)*0.5;if(densityAtWorld(ro+rd*m)>=iso){hi=m;}else{lo=m;}}
  return hi;
}
fn marchDensity(ro:vec3f,rd:vec3f,interval:vec2f,iso:f32,stepSize:f32)->f32{
  var t=max(interval.x,0.0); if(interval.y<=t){return -1.0;}
  var prev=densityAtWorld(ro+rd*t); if(prev>=iso){return t;}
  for(var i=0u;i<MAX_RAY_STEPS;i=i+1u){
    let nt=t+stepSize; if(nt>interval.y){break;} let cur=densityAtWorld(ro+rd*nt);
    if(prev<iso && cur>=iso){return refineDensityHit(ro,rd,t,nt,iso);}
    t=nt; prev=cur;
  } return -1.0;
}
fn densityNormal(p:vec3f)->vec3f{
  let dims=vec3f(textureDimensions(densityTexture));
  let d=(renderParams.volumeMax.xyz-renderParams.volumeMin.xyz)/dims;
  return normalize(-vec3f(
    densityAtWorldRaw(p+vec3f(d.x,0,0))-densityAtWorldRaw(p-vec3f(d.x,0,0)),
    densityAtWorldRaw(p+vec3f(0,d.y,0))-densityAtWorldRaw(p-vec3f(0,d.y,0)),
    densityAtWorldRaw(p+vec3f(0,0,d.z))-densityAtWorldRaw(p-vec3f(0,0,d.z))
  ));
}
fn skyColor(rd:vec3f)->vec3f{let f=clamp(rd.y*0.5+0.5,0.0,1.0);return vec3f(0.015,0.023,0.036)+vec3f(0.038,0.060,0.088)*f;}
fn shadeFluid(n:vec3f,rd:vec3f,base:vec3f)->vec3f{
  let l=normalize(vec3f(-0.46,0.84,0.30));let v=normalize(-rd);let h=normalize(l+v);
  let diff=max(dot(n,l),0.0);let spec=pow(max(dot(n,h),0.0),64.0);let fres=pow(1.0-max(dot(n,v),0.0),3.0);
  return base*(0.22+0.78*diff)+vec3f(1.0)*spec+skyColor(reflect(rd,n))*fres*0.55;
}
fn forceContribution(origin:vec3f,p:vec3f)->vec3f{
  let delta=origin-p;let dist=length(delta);if(dist<=0.1){return vec3f(0.0);}return delta/(dist*dist);
}
fn forceFieldVector(p:vec3f)->vec3f{return forceContribution(vec3f(1.0,0.0,0.0),p)+forceContribution(vec3f(-1.0,0.0,0.0),p);}
fn terrainHeight(x:f32,z:f32)->f32{
  let cx=clamp(x,-6.0,6.0);let cz=clamp(z,-6.0,6.0);let localX=cx+6.0;let localZ=cz+6.0;
  let interior=sin(localX)+cos(localZ);let edge=min(6.0-abs(cx),6.0-abs(cz));let blend=clamp(edge/0.30,0.0,1.0);
  return 3.0*(1.0-blend)+interior*blend;
}
fn sectionPlane(ro:vec3f,rd:vec3f,zValue:f32)->f32{
  if(abs(rd.z)<0.000001){return -1.0;}let t=(zValue-ro.z)/rd.z;return select(-1.0,t,t>=0.0);
}
@vertex fn fullScreenVertex(@builtin(vertex_index) vertexIndex:u32)->VertexOutput{
  var positions=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var out:VertexOutput;
  let p=positions[vertexIndex];out.position=vec4f(p,0,1);out.ndcCoord=p;return out;
}
`;

function fragmentForMode() {
  if (mode === "faucet-velocity") return `
@fragment fn raymarchFragment(input:VertexOutput)->@location(0) vec4f{
  let ro=renderParams.cameraPos.xyz;
  let rd=normalize(renderParams.cameraForward.xyz+renderParams.cameraRight.xyz*input.ndcCoord.x*renderParams.rayValues.y*renderParams.rayValues.x+renderParams.cameraUp.xyz*input.ndcCoord.y*renderParams.rayValues.x);
  let interval=rayBoxInterval(ro,rd,renderParams.volumeMin.xyz,renderParams.volumeMax.xyz);
  let hit=marchDensity(ro,rd,interval,renderParams.rayValues.z,renderParams.rayValues.w);
  if(hit>=0.0){let p=ro+rd*hit;let speed=clamp(speedAtWorld(p)*renderParams.modeValues.x*0.18,0.0,1.0);
    let slow=vec3f(0.08,0.42,0.92);let fast=vec3f(1.0,0.24,0.08);return vec4f(shadeFluid(densityNormal(p),rd,slow+(fast-slow)*speed),1.0);}
  return vec4f(skyColor(rd),1.0);
}`;
  if (mode === "force-slice") return `
@fragment fn raymarchFragment(input:VertexOutput)->@location(0) vec4f{
  let ro=renderParams.cameraPos.xyz;
  let rd=normalize(renderParams.cameraForward.xyz+renderParams.cameraRight.xyz*input.ndcCoord.x*renderParams.rayValues.y*renderParams.rayValues.x+renderParams.cameraUp.xyz*input.ndcCoord.y*renderParams.rayValues.x);
  let interval=rayBoxInterval(ro,rd,renderParams.volumeMin.xyz,renderParams.volumeMax.xyz);
  let hit=marchDensity(ro,rd,interval,renderParams.rayValues.z,renderParams.rayValues.w);
  let planeHit=sectionPlane(ro,rd,renderParams.modeValues.x);
  var base=skyColor(rd);
  if(hit>=0.0){let p=ro+rd*hit;base=shadeFluid(densityNormal(p),rd,vec3f(0.10,0.50,0.82));}
  if(planeHit>=0.0 && (hit<0.0 || planeHit<hit)){
    let p=ro+rd*planeHit;
    if(all(p>=renderParams.volumeMin.xyz)&&all(p<=renderParams.volumeMax.xyz)){
      let rightMag=length(forceContribution(vec3f(1.0,0.0,0.0),p));let leftMag=length(forceContribution(vec3f(-1.0,0.0,0.0),p));
      let field=forceFieldVector(p);let mag=length(field);
      let bands=0.72+0.28*step(0.5,fract(log2(1.0+mag)*3.0));
      let fieldColor=(vec3f(0.95,0.18,0.78)*rightMag+vec3f(0.10,0.78,1.0)*leftMag)/max(rightMag+leftMag,0.0001);
      let alpha=renderParams.modeValues.y*(0.20+0.65*(1.0-exp(-mag*0.18)));
      base=base*(1.0-alpha)+fieldColor*bands*alpha;
    }
  }
  return vec4f(base,1.0);
}`;
  if (mode === "heightfield-section") return `
fn clippedDensityAtWorld(p:vec3f)->f32{if(p.z>renderParams.modeValues.x){return 0.0;}return densityAtWorldRaw(p);}
fn marchClipped(ro:vec3f,rd:vec3f,interval:vec2f,iso:f32,stepSize:f32)->f32{
  var t=max(interval.x,0.0);if(interval.y<=t){return -1.0;}var prev=clippedDensityAtWorld(ro+rd*t);
  for(var i=0u;i<MAX_RAY_STEPS;i=i+1u){let nt=t+stepSize;if(nt>interval.y){break;}let cur=clippedDensityAtWorld(ro+rd*nt);
    if(prev<iso&&cur>=iso){var lo=t;var hi=nt;for(var j=0u;j<REFINE_STEPS;j=j+1u){let m=(lo+hi)*0.5;if(clippedDensityAtWorld(ro+rd*m)>=iso){hi=m;}else{lo=m;}}return hi;}
    t=nt;prev=cur;}return -1.0;
}
fn marchTerrain(ro:vec3f,rd:vec3f)->f32{
  let interval=rayBoxInterval(ro,rd,vec3f(-6,-2.5,-6),vec3f(6,3.2,6));var t=max(interval.x,0.0);if(interval.y<=t){return -1.0;}
  var prev=(ro+rd*t).y-terrainHeight((ro+rd*t).x,(ro+rd*t).z);
  for(var i=0u;i<260u;i=i+1u){let nt=t+0.08;if(nt>interval.y){break;}let p=ro+rd*nt;let cur=p.y-terrainHeight(p.x,p.z);
    if(prev>0.0&&cur<=0.0){var lo=t;var hi=nt;for(var j=0u;j<REFINE_STEPS;j=j+1u){let m=(lo+hi)*0.5;let mp=ro+rd*m;if(mp.y-terrainHeight(mp.x,mp.z)<=0.0){hi=m;}else{lo=m;}}return hi;}
    t=nt;prev=cur;}return -1.0;
}
@fragment fn raymarchFragment(input:VertexOutput)->@location(0) vec4f{
  let ro=renderParams.cameraPos.xyz;
  let rd=normalize(renderParams.cameraForward.xyz+renderParams.cameraRight.xyz*input.ndcCoord.x*renderParams.rayValues.y*renderParams.rayValues.x+renderParams.cameraUp.xyz*input.ndcCoord.y*renderParams.rayValues.x);
  let interval=rayBoxInterval(ro,rd,renderParams.volumeMin.xyz,renderParams.volumeMax.xyz);
  let fluidHit=marchClipped(ro,rd,interval,renderParams.rayValues.z,renderParams.rayValues.w);
  let terrainHit=marchTerrain(ro,rd);let planeHit=sectionPlane(ro,rd,renderParams.modeValues.x);
  var nearest=1000000.0;var color=skyColor(rd);
  if(terrainHit>=0.0&&terrainHit<nearest){nearest=terrainHit;let p=ro+rd*terrainHit;color=vec3f(0.20,0.24,0.12)*(0.45+0.55*max(dot(normalize(vec3f(0,1,0)),normalize(vec3f(-0.4,0.85,0.3))),0.0));}
  if(fluidHit>=0.0&&fluidHit<nearest){nearest=fluidHit;let p=ro+rd*fluidHit;color=shadeFluid(densityNormal(p),rd,vec3f(0.08,0.48,0.82));}
  if(planeHit>=0.0&&planeHit<nearest){
    let p=ro+rd*planeHit;if(abs(p.x)<=6.0&&p.y>=-2.5&&p.y<=9.0){
      let density=densityAtWorldRaw(p);let terrainDelta=abs(p.y-terrainHeight(p.x,p.z));let heat=clamp(density*0.7,0.0,1.0);
      var planeColor=vec3f(0.04,0.08,0.12)+vec3f(0.10,0.55,1.0)*heat;
      if(terrainDelta<0.08){planeColor=vec3f(0.95,0.82,0.18);}
      let alpha=renderParams.modeValues.y*(0.18+0.65*heat+select(0.0,0.7,terrainDelta<0.08));
      color=color*(1.0-clamp(alpha,0.0,0.92))+planeColor*clamp(alpha,0.0,0.92);
    }
  }
  return vec4f(color,1.0);
}`;
  return `
struct BasinHit{distanceValue:f32,surfaceNormal:vec3f};
fn boxNormal(p:vec3f,c:vec3f,h:vec3f)->vec3f{let l=p-c;let s=abs(l)/h;if(s.y>=s.x&&s.y>=s.z){return vec3f(0,sign(l.y),0);}if(s.x>=s.z){return vec3f(sign(l.x),0,0);}return vec3f(0,0,sign(l.z));}
fn boxHit(ro:vec3f,rd:vec3f,c:vec3f,h:vec3f)->BasinHit{let i=rayBoxInterval(ro,rd,c-h,c+h);let n=max(i.x,0.0);if(i.y<n){return BasinHit(1000000.0,vec3f(0));}let p=ro+rd*n;return BasinHit(n,boxNormal(p,c,h));}
fn nearer(a:BasinHit,b:BasinHit)->BasinHit{if(b.distanceValue<a.distanceValue){return b;}return a;}
fn basin(ro:vec3f,rd:vec3f)->BasinHit{var h=boxHit(ro,rd,vec3f(0,0,0),vec3f(2.5,0.2,2.5));
 h=nearer(h,boxHit(ro,rd,vec3f(2.5,0.7,0),vec3f(0.2,0.7,2.5)));h=nearer(h,boxHit(ro,rd,vec3f(-2.5,0.7,0),vec3f(0.2,0.7,2.5)));
 h=nearer(h,boxHit(ro,rd,vec3f(0,0.7,2.5),vec3f(2.5,0.7,0.2)));h=nearer(h,boxHit(ro,rd,vec3f(0,0.7,-2.5),vec3f(2.5,0.7,0.2)));return h;}
@fragment fn raymarchFragment(input:VertexOutput)->@location(0) vec4f{
 let ro=renderParams.cameraPos.xyz;let rd=normalize(renderParams.cameraForward.xyz+renderParams.cameraRight.xyz*input.ndcCoord.x*renderParams.rayValues.y*renderParams.rayValues.x+renderParams.cameraUp.xyz*input.ndcCoord.y*renderParams.rayValues.x);
 let interval=rayBoxInterval(ro,rd,renderParams.volumeMin.xyz,renderParams.volumeMax.xyz);let hit=marchDensity(ro,rd,interval,renderParams.rayValues.z,renderParams.rayValues.w);let b=basin(ro,rd);
 if(hit>=0.0&&hit<b.distanceValue){let p=ro+rd*hit;return vec4f(shadeFluid(densityNormal(p),rd,vec3f(0.08,0.50,0.82)),1.0);}
 if(b.distanceValue<999999.0){let d=max(dot(b.surfaceNormal,normalize(vec3f(-0.46,0.84,0.30))),0.0);return vec4f(vec3f(0.18,0.19,0.21)*(0.35+0.65*d),1.0);}
 return vec4f(skyColor(rd),1.0);
}`;
}

function setStage(text){gpuStatus.textContent=text;}
function norm(v){const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function cameraBasis(){
  const c=config.cameraCenter,d=config.cameraDistance*distanceScale,cp=Math.cos(pitch);
  const p=[c[0]+Math.sin(yaw)*cp*d,c[1]+Math.sin(pitch)*d,c[2]+Math.cos(yaw)*cp*d];
  const f=norm([c[0]-p[0],c[1]-p[1],c[2]-p[2]]),r=norm(cross(f,[0,1,0])),u=cross(r,f);
  return {p,f,r,u};
}
function resizeCanvas(){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.4);
  const w=Math.max(1,Math.round(rect.width*dpr*renderScale)),h=Math.max(1,Math.round(rect.height*dpr*renderScale));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
}
async function assertShaderCompiles(module,label){
  const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==="error");
  if(errors.length)throw new Error(`${label} WGSL errors: ${errors.map(m=>m.message).join(" | ")}`);
}
function destroyVolumeResources(){
  densityAtoms?.destroy();speedAtoms?.destroy();densityTexture?.destroy();speedTexture?.destroy();
}
function rebuildVolumeResources(nextDims){
  gridDims=[...nextDims];destroyVolumeResources();
  const total=gridDims[0]*gridDims[1]*gridDims[2];
  densityAtoms=device.createBuffer({size:total*4,usage:GPUBufferUsage.STORAGE});
  speedAtoms=device.createBuffer({size:total*4,usage:GPUBufferUsage.STORAGE});
  densityTexture=device.createTexture({size:{width:gridDims[0],height:gridDims[1],depthOrArrayLayers:gridDims[2]},dimension:"3d",format:"r32float",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});
  speedTexture=device.createTexture({size:{width:gridDims[0],height:gridDims[1],depthOrArrayLayers:gridDims[2]},dimension:"3d",format:"r32float",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});
  densityView=densityTexture.createView({dimension:"3d"});speedView=speedTexture.createView({dimension:"3d"});
  computeBindGroup=device.createBindGroup({layout:computeBindGroupLayout,entries:[
    {binding:0,resource:{buffer:particleBuffer}},{binding:1,resource:{buffer:velocityBuffer}},
    {binding:2,resource:{buffer:densityAtoms}},{binding:3,resource:{buffer:speedAtoms}},
    {binding:4,resource:densityView},{binding:5,resource:speedView},{binding:6,resource:{buffer:densityParamsBuffer}}
  ]});
  renderBindGroup=device.createBindGroup({layout:renderPipeline.getBindGroupLayout(0),entries:[
    {binding:0,resource:densityView},{binding:1,resource:speedView},{binding:2,resource:{buffer:renderParamsBuffer}}
  ]});
}

async function createPipelines(){
  particleBuffer=device.createBuffer({size:MAX_PARTICLES*3*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  velocityBuffer=device.createBuffer({size:MAX_PARTICLES*3*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  densityParamsBuffer=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  renderParamsBuffer=device.createBuffer({size:144,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});

  const densityModule=device.createShaderModule({code:densityShaderSource});
  const renderModule=device.createShaderModule({code:commonRenderSource+fragmentForMode()});
  setStage("shader-compilation-info");
  await Promise.all([assertShaderCompiles(densityModule,"deep density"),assertShaderCompiles(renderModule,"deep render")]);

  computeBindGroupLayout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},
    {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},
    {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},
    {binding:4,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"write-only",format:"r32float",viewDimension:"3d"}},
    {binding:5,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"write-only",format:"r32float",viewDimension:"3d"}},
    {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},
  ]});
  const layout=device.createPipelineLayout({bindGroupLayouts:[computeBindGroupLayout]});
  clearPipeline=device.createComputePipeline({layout,compute:{module:densityModule,entryPoint:"clearDensityMain"}});
  splatPipeline=device.createComputePipeline({layout,compute:{module:densityModule,entryPoint:"splatParticlesMain"}});
  normalizePipeline=device.createComputePipeline({layout,compute:{module:densityModule,entryPoint:"normalizeDensityMain"}});
  renderPipeline=device.createRenderPipeline({layout:"auto",vertex:{module:renderModule,entryPoint:"fullScreenVertex"},fragment:{module:renderModule,entryPoint:"raymarchFragment",targets:[{format:outputFormat}]},primitive:{topology:"triangle-list"}});
  rebuildVolumeResources(gridDims);
}

function currentControls(){
  const iso=Number(document.querySelector("#iso-level")?.value ?? config.iso);
  const kernel=Number(document.querySelector("#kernel-radius")?.value ?? config.kernel);
  let modeA=0,modeB=0;
  if(mode==="faucet-velocity")modeA=Number(document.querySelector("#speed-scale").value);
  if(mode==="force-slice"){modeA=Number(document.querySelector("#slice-z").value);modeB=Number(document.querySelector("#slice-opacity").value);}
  if(mode==="heightfield-section"){modeA=Number(document.querySelector("#section-z").value);modeB=Number(document.querySelector("#slice-opacity").value);}
  return {iso,kernel,modeA,modeB};
}
function updateLabels(){
  const pairs=[["#iso-level","#iso-value",2],["#kernel-radius","#kernel-value",3],["#speed-scale","#speed-value",2],["#slice-z","#slice-value",3],["#section-z","#section-value",2],["#slice-opacity","#opacity-value",2]];
  for(const [a,b,n] of pairs){const input=document.querySelector(a),out=document.querySelector(b);if(input&&out)out.textContent=Number(input.value).toFixed(n);}
}
function applyQualityPreset(){
  if(mode!=="basic-quality")return;
  const value=document.querySelector("#quality-preset").value;
  const presets={low:{grid:32,step:0.09,scale:0.5},medium:{grid:48,step:0.055,scale:0.75},high:{grid:64,step:0.035,scale:1.0}};
  const p=presets[value];config.rayStep=p.step;renderScale=p.scale;rebuildVolumeResources([p.grid,p.grid,p.grid]);
  document.querySelector("#grid-info").textContent=`${p.grid}³`;
  document.querySelector("#step-info").textContent=p.step.toFixed(3);
  document.querySelector("#scale-info").textContent=`${p.scale.toFixed(2)}×`;
}

function writeInputs(width,height){
  const positions=sim.fluid_positions(0),velocities=sim.fluid_velocities(0),count=positions.length/3;
  if(count>MAX_PARTICLES)throw new Error(`particle capacity exceeded: ${count}`);
  device.queue.writeBuffer(particleBuffer,0,positions);
  if(velocities.length===positions.length)device.queue.writeBuffer(velocityBuffer,0,velocities);
  else device.queue.writeBuffer(velocityBuffer,0,new Float32Array(positions.length));

  const controls=currentControls(),total=gridDims[0]*gridDims[1]*gridDims[2];
  device.queue.writeBuffer(densityParamsBuffer,0,new Float32Array([
    ...config.volumeMin,0,...config.volumeMax,0,count,controls.kernel,DENSITY_SCALE,SPEED_SCALE,
    gridDims[0],gridDims[1],gridDims[2],total
  ]));
  const {p,f,r,u}=cameraBasis();
  device.queue.writeBuffer(renderParamsBuffer,0,new Float32Array([
    ...p,0,...r,0,...u,0,...f,0,...config.volumeMin,0,...config.volumeMax,0,
    Math.tan(55*Math.PI/360),width/height,controls.iso,config.rayStep,
    controls.modeA,controls.modeB,0,0,
    0,0,0,0
  ]));
}
function encodeFrame(view,width,height){
  writeInputs(width,height);const total=gridDims[0]*gridDims[1]*gridDims[2],encoder=device.createCommandEncoder();
  let pass=encoder.beginComputePass();pass.setPipeline(clearPipeline);pass.setBindGroup(0,computeBindGroup);pass.dispatchWorkgroups(Math.ceil(total/256));pass.end();
  const count=sim.particle_count();if(count>0){pass=encoder.beginComputePass();pass.setPipeline(splatPipeline);pass.setBindGroup(0,computeBindGroup);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();}
  pass=encoder.beginComputePass();pass.setPipeline(normalizePipeline);pass.setBindGroup(0,computeBindGroup);pass.dispatchWorkgroups(Math.ceil(gridDims[0]/4),Math.ceil(gridDims[1]/4),Math.ceil(gridDims[2]/4));pass.end();
  const renderPass=encoder.beginRenderPass({colorAttachments:[{view,clearValue:{r:.015,g:.023,b:.036,a:1},loadOp:"clear",storeOp:"store"}]});
  renderPass.setPipeline(renderPipeline);renderPass.setBindGroup(0,renderBindGroup);renderPass.draw(3);renderPass.end();device.queue.submit([encoder.finish()]);
}
function resetSimulation(){if(sim)sim.free();sim=new OfficialExample3dSimulation(config.simulation);accumulator=0;previous=performance.now();particleLabel.textContent=sim.particle_count().toLocaleString();}
pauseButton.addEventListener("click",()=>{paused=!paused;pauseButton.textContent=paused?"Resume":"Pause";});
resetButton.addEventListener("click",resetSimulation);
document.querySelectorAll("input").forEach(el=>el.addEventListener("input",updateLabels));
document.querySelector("#quality-preset")?.addEventListener("change",applyQualityPreset);
canvas.addEventListener("pointerdown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.008;pitch=Math.max(-1.05,Math.min(1.05,pitch-dy*.008));});
canvas.addEventListener("pointerup",()=>dragging=false);canvas.addEventListener("pointercancel",()=>dragging=false);
canvas.addEventListener("wheel",e=>{e.preventDefault();distanceScale=Math.max(.5,Math.min(2.5,distanceScale*Math.exp(e.deltaY*.001)));},{passive:false});

async function runCi(){
  const steps=mode==="faucet-velocity"?13:1;for(let i=0;i<steps;i++)sim.step(1/200);
  device.pushErrorScope("validation");const tex=device.createTexture({size:{width:192,height:144},format:outputFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  encodeFrame(tex.createView(),192,144);setStage("submitted-work-wait");await device.queue.onSubmittedWorkDone();const err=await device.popErrorScope();if(err)throw new Error(err.message);tex.destroy();setStage(config.status);
}
async function main(){
  updateLabels();setStage("wasm-init");await init(new URL("./pkg/sph_web_samples_bg.wasm?v=2.10", import.meta.url));resetSimulation();
  setStage("request-adapter");const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error("requestAdapter() returned null");
  setStage("request-device");device=await adapter.requestDevice();device.lost.then(info=>setStage(`device-lost: ${info.reason} ${info.message}`));outputFormat=navigator.gpu.getPreferredCanvasFormat();
  if(!CI_MODE){canvasContext=canvas.getContext("webgpu");if(!canvasContext)throw new Error("webgpu canvas unavailable");canvasContext.configure({device,format:outputFormat,alphaMode:"opaque"});}
  await createPipelines();if(mode==="basic-quality")applyQualityPreset();if(CI_MODE){await runCi();return;}
  setStage("running");const fixedDt=1/200;
  function frame(now){
    const dt=Math.min((now-previous)/1000,.05);previous=now;const p0=performance.now();
    if(!paused){accumulator+=dt;let sub=0;while(accumulator>=fixedDt&&sub<4){sim.step(fixedDt);accumulator-=fixedDt;sub++;}}
    const pms=performance.now()-p0;smoothedPhysicsMs=smoothedPhysicsMs?smoothedPhysicsMs*.9+pms*.1:pms;resizeCanvas();
    const r0=performance.now();encodeFrame(canvasContext.getCurrentTexture().createView(),canvas.width,canvas.height);const rms=performance.now()-r0;smoothedRenderMs=smoothedRenderMs?smoothedRenderMs*.9+rms*.1:rms;
    frames++;if(now-fpsSince>=1000){fpsLabel.textContent=(frames*1000/(now-fpsSince)).toFixed(1);frames=0;fpsSince=now;}
    particleLabel.textContent=sim.particle_count().toLocaleString();physicsLabel.textContent=smoothedPhysicsMs.toFixed(2);renderLabel.textContent=smoothedRenderMs.toFixed(2);requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
}
main().catch(error=>{console.error(error);setStage(`Failed: ${error?.message??error}`);});
