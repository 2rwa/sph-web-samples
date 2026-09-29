const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d");
const modeEl = document.querySelector("#mode");
const massEl = document.querySelector("#mass");
const fluidVyEl = document.querySelector("#fluid-vy");
const pauseEl = document.querySelector("#pause");
const resetEl = document.querySelector("#reset");
const statusEl = document.querySelector("#status");
const modeNoteEl = document.querySelector("#mode-note");
const particlesEl = document.querySelector("#particles");
const stepsEl = document.querySelector("#steps");
const simTimeEl = document.querySelector("#sim-time");
const gravityYEl = document.querySelector("#gravity-y");
const plateYEl = document.querySelector("#plate-y");
const plateDyEl = document.querySelector("#plate-dy");
const plateSpeedEl = document.querySelector("#plate-speed");
const maxForceEl = document.querySelector("#max-force");
const physicsMsEl = document.querySelector("#physics-ms");

let Module;
let running = true;
let rebuilding = false;
let plateY0 = -0.25;
let currentGravityY = 0;
let yaw = 0.55;
let pitch = -0.30;
let zoom = 430;
let dragging = false;
let lastX = 0;
let lastY = 0;

const PRESETS = {
  impact: {
    mass: "250",
    fluidVy: "-0.5",
    gravityY: 0,
    note: "Direct impact isolates the coupling path with zero gravity: 250 kg plate and fluid initial velocity −0.5 m/s.",
  },
  gravity: {
    mass: "1000",
    fluidVy: "0",
    gravityY: -9.81,
    note: "Gravity drop applies −9.81 m/s² to the SPH fluid while the PBD plate has zero gravitational acceleration, modelling a supported plate so the measured motion comes from fluid impact.",
  },
};

function activePreset() {
  return PRESETS[modeEl.value] ?? PRESETS.impact;
}

function applyPreset() {
  const preset = activePreset();
  massEl.value = preset.mass;
  fluidVyEl.value = preset.fluidVy;
  modeNoteEl.textContent = preset.note;
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

function project(x,y,z) {
  const cy=Math.cos(yaw), sy=Math.sin(yaw);
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  const rx=cy*x-sy*z;
  const rz0=sy*x+cy*z;
  const yy=y-0.15;
  const ry=cp*yy-sp*rz0;
  const rz=sp*yy+cp*rz0+4.2;
  const s=zoom/Math.max(0.6,rz);
  return {x:canvas.width*0.5+rx*s,y:canvas.height*0.52-ry*s,z:rz,r:Math.max(1,0.014*s)};
}

function readFluid() {
  const count=Module._sph_particle_count();
  const ptr=Module._sph_positions_ptr();
  if (!ptr || count<=0) return [];
  const heap=Module.HEAPF32;
  const base=ptr>>2;
  const stride=Math.max(1,Math.floor(count/9000));
  const out=[];
  for(let i=0;i<count;i+=stride) {
    const o=base+i*3;
    out.push(project(heap[o],heap[o+1],heap[o+2]));
  }
  return out;
}

function drawPlate() {
  const tx=Module._sph_pbd_body_position_x();
  const ty=Module._sph_pbd_body_position_y();
  const tz=Module._sph_pbd_body_position_z();
  const sx=1.5, sy=0.25, sz=1.5;
  const c=[
    [-sx,-sy,-sz],[sx,-sy,-sz],[-sx,sy,-sz],[sx,sy,-sz],
    [-sx,-sy,sz],[sx,-sy,sz],[-sx,sy,sz],[sx,sy,sz],
  ].map(([x,y,z])=>project(x+tx,y+ty,z+tz));
  const edges=[[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]];
  ctx.save();
  ctx.strokeStyle="rgba(255,165,80,.92)";
  ctx.lineWidth=Math.max(1.2,canvas.width/850);
  ctx.beginPath();
  for(const [a,b] of edges){ctx.moveTo(c[a].x,c[a].y);ctx.lineTo(c[b].x,c[b].y);}
  ctx.stroke();
  ctx.restore();
}

function draw() {
  resize();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!Module) return;
  const points=readFluid().sort((a,b)=>b.z-a.z);
  for(const p of points) {
    ctx.fillStyle="rgba(65,170,255,.84)";
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fill();
  }
  drawPlate();
}

function metrics(ms=0) {
  if(!Module) return;
  const y=Module._sph_pbd_body_position_y();
  particlesEl.textContent=String(Module._sph_particle_count());
  stepsEl.textContent=String(Module._sph_step_count());
  simTimeEl.textContent=Module._sph_time().toFixed(4);
  gravityYEl.textContent=currentGravityY.toFixed(2)+" m/s²";
  plateYEl.textContent=y.toFixed(5);
  plateDyEl.textContent=(y-plateY0).toFixed(5);
  plateSpeedEl.textContent=Module._sph_pbd_body_speed().toFixed(5);
  maxForceEl.textContent=Module._sph_pbd_max_boundary_force().toFixed(1)+" N";
  physicsMsEl.textContent=ms.toFixed(3);
}

async function ensureMap() {
  const path="/unitbox-3x0p5x3-r20-i0-t0.cdm";
  try { Module.FS.stat(path); return path; } catch {}
  const url=new URL("./vendor/splishsplash/maps/unitbox-3x0p5x3-r20-i0-t0.cdm", import.meta.url);
  const response=await fetch(url);
  if(!response.ok) throw new Error("Could not load Bender2019 map: HTTP "+response.status);
  Module.FS.writeFile(path,new Uint8Array(await response.arrayBuffer()));
  return path;
}

async function rebuild() {
  rebuilding=true;
  statusEl.textContent="Rebuilding…";
  const mapFile=await ensureMap();
  const mass=Number(massEl.value);
  const fluidVy=Number(fluidVyEl.value);
  const preset=activePreset();
  currentGravityY=preset.gravityY;
  modeNoteEl.textContent=preset.note;

  if(!Module._sph_scene_begin(0.025,4,2)) throw new Error("sph_scene_begin failed");
  Module._sph_scene_set_gravity(0,currentGravityY,0);
  Module._sph_scene_set_timing(1,1,0.0025,0.0005);
  Module._sph_scene_set_dfsph(2,100,0.01,100,0.1,1);
  Module._sph_scene_set_material(1000,1);
  Module._sph_scene_set_standard_viscosity(0.01);
  Module._sph_scene_add_fluid_block(
    -0.25,0.05,-0.25,
     0.25,0.55, 0.25,
     0,0,0,
     1,1,1,
     0,fluidVy,0,
     0
  );
  const boundary=Module.ccall(
    "sph_scene_add_unit_box_bender_file_rotated","number",
    ["number","number","number","number","number","number","number","number","number","number","string"],
    [0,-0.25,0,3,0.5,3,0,0,1,0,mapFile]
  );
  if(!boundary) throw new Error("Bender2019 boundary creation failed");
  const particles=Module._sph_scene_commit();
  if(particles!==1331) throw new Error("Unexpected particle count "+particles);
  if(!Module._sph_bender_promote_dynamic_pbd_box(mass,3,0.5,3)) throw new Error("PBD promotion failed");
  if(!Module._sph_pbd_enable_upstream_timestep(0)) throw new Error("upstream PBD timestep setup failed");

  plateY0=Module._sph_pbd_body_position_y();
  running=true;
  pauseEl.textContent="Pause";
  statusEl.textContent=`Running / upstream PBD / ${modeEl.value} / mass=${mass} kg / fluidVy=${fluidVy} m/s / fluidGravityY=${currentGravityY}`;
  rebuilding=false;
  metrics();
  draw();
}

function frame() {
  let ms=0;
  if(Module && running && !rebuilding) {
    const t0=performance.now();
    Module._sph_step_dynamic_pbd_upstream(1);
    ms=performance.now()-t0;
    if(!Module._sph_all_finite()) {
      running=false;
      statusEl.textContent="Failed: non-finite state";
    }
  }
  metrics(ms);
  draw();
  requestAnimationFrame(frame);
}

pauseEl.addEventListener("click",()=>{
  running=!running;
  pauseEl.textContent=running?"Pause":"Resume";
});
resetEl.addEventListener("click",()=>rebuild().catch(fail));
modeEl.addEventListener("change",()=>{
  applyPreset();
  rebuild().catch(fail);
});
massEl.addEventListener("change",()=>rebuild().catch(fail));
fluidVyEl.addEventListener("change",()=>rebuild().catch(fail));
canvas.addEventListener("pointerdown",(e)=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",(e)=>{if(!dragging)return;yaw+=(e.clientX-lastX)*0.008;pitch=Math.max(-1.2,Math.min(1.2,pitch+(e.clientY-lastY)*0.008));lastX=e.clientX;lastY=e.clientY;});
canvas.addEventListener("pointerup",()=>dragging=false);
canvas.addEventListener("pointercancel",()=>dragging=false);
canvas.addEventListener("wheel",(e)=>{e.preventDefault();zoom=Math.max(150,Math.min(1000,zoom*Math.exp(-e.deltaY*0.001)));},{passive:false});

function fail(error) {
  console.error(error);
  running=false;
  rebuilding=false;
  statusEl.textContent="Failed: "+(error?.message??error);
}

function sampleCoupling(steps) {
  const y0=Module._sph_pbd_body_position_y();
  const stepResult=Module._sph_step_dynamic_pbd_upstream(steps);
  const y1=Module._sph_pbd_body_position_y();
  return {
    steps:stepResult,
    displacement:y1-y0,
    speed:Module._sph_pbd_body_speed(),
    force:Module._sph_pbd_max_boundary_force(),
    finite:Boolean(Module._sph_all_finite()),
    particles:Module._sph_particle_count(),
  };
}

async function boot() {
  try {
    Module=await globalThis.createSPlisHSPlasHPBD({
      locateFile(path){return new URL(`./vendor/splishsplash-pbd/${path}`,import.meta.url).href;}
    });
    applyPreset();
    await rebuild();

    if(new URLSearchParams(location.search).get("ci")==="1") {
      running=false;
      const impact=sampleCoupling(120);
      const impactOk=
        impact.steps===120 &&
        impact.particles===1331 &&
        impact.finite &&
        impact.displacement < -0.002 &&
        impact.displacement > -0.25 &&
        impact.speed>0 &&
        impact.speed<2 &&
        impact.force>1000;

      modeEl.value="gravity";
      applyPreset();
      await rebuild();
      running=false;
      const gravity=sampleCoupling(160);
      const gravityOk=
        gravity.steps===160 &&
        gravity.particles===1331 &&
        gravity.finite &&
        gravity.displacement < -0.002 &&
        gravity.displacement > -0.35 &&
        gravity.speed>0 &&
        gravity.speed<3 &&
        gravity.force>1000;

      const ok=impactOk&&gravityOk;
      statusEl.textContent=ok
        ? `CI SPlisHSPlasH PBD browser ok / impactDy=${impact.displacement.toFixed(5)} / gravityDy=${gravity.displacement.toFixed(5)} / gravityForce=${gravity.force.toFixed(1)}`
        : `Failed: PBD browser impact=${JSON.stringify(impact)} gravity=${JSON.stringify(gravity)}`;
      metrics();
      draw();
      return;
    }
    requestAnimationFrame(frame);
  } catch(error) { fail(error); }
}
boot();
