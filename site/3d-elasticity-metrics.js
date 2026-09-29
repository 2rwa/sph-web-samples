import init, { OfficialExample3dSimulation } from "./pkg/sph_web_samples.js?v=2.10";

const canvas=document.querySelector("#view"),ctx=canvas.getContext("2d"),chart=document.querySelector("#chart"),chartCtx=chart.getContext("2d");
const pauseButton=document.querySelector("#pause"),resetButton=document.querySelector("#reset"),timeScaleSelect=document.querySelector("#time-scale");
const particlesLabel=document.querySelector("#particles"),historyLabel=document.querySelector("#history-count"),physicsLabel=document.querySelector("#physics-ms"),fpsLabel=document.querySelector("#fps");
const tableA=document.querySelector("#metrics-a"),tableB=document.querySelector("#metrics-b");
let sim,initialA,initialB,paused=false,yaw=.72,pitch=.28,distanceScale=1,dragging=false,lastX=0,lastY=0,accumulator=0,previous=performance.now(),frames=0,fpsSince=previous,lastHistoryAt=0,smoothedPhysicsMs=0;
const history=[];

function computeMetrics(positions,velocities,initial){
  const count=positions.length/3,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],com=[0,0,0];
  let speedSq=0,maxSpeed=0;
  for(let i=0;i<count;i++){for(let a=0;a<3;a++){const v=positions[i*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);com[a]+=v;}
    const vx=velocities[i*3]??0,vy=velocities[i*3+1]??0,vz=velocities[i*3+2]??0,s=Math.hypot(vx,vy,vz);speedSq+=s*s;maxSpeed=Math.max(maxSpeed,s);}
  for(let a=0;a<3;a++)com[a]/=Math.max(count,1);
  const extents=max.map((v,a)=>v-min[a]),volume=extents[0]*extents[1]*extents[2];
  const stretchRatio=initial?extents.map((v,a)=>v/Math.max(initial.extents[a],1e-6)):[1,1,1];
  return {count,min,max,com,extents,volume,volumeRatio:initial?volume/Math.max(initial.volume,1e-9):1,stretchRatio,rmsSpeed:Math.sqrt(speedSq/Math.max(count,1)),maxSpeed};
}
function rows(m){return [
  ["Bounding-box stretch",m.stretchRatio.map(v=>v.toFixed(3)).join(" / ")],
  ["Extent XYZ",m.extents.map(v=>v.toFixed(3)).join(" / ")],
  ["Extent-volume ratio",m.volumeRatio.toFixed(3)],
  ["COM",m.com.map(v=>v.toFixed(3)).join(", ")],
  ["RMS speed",m.rmsSpeed.toFixed(3)],
  ["Max speed",m.maxSpeed.toFixed(3)],
].map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join("");}
function project(p,width,height){
  const center=[0,.72,0],d=3.0*distanceScale,cp=Math.cos(pitch),cam=[Math.sin(yaw)*cp*d+center[0],Math.sin(pitch)*d+center[1],Math.cos(yaw)*cp*d+center[2]];
  const f=norm([center[0]-cam[0],center[1]-cam[1],center[2]-cam[2]]),r=norm(cross(f,[0,1,0])),u=cross(r,f),rel=[p[0]-cam[0],p[1]-cam[1],p[2]-cam[2]],z=dot(rel,f);
  if(z<=.05)return null;const scale=(height*.72)/z;return [width*.5+dot(rel,r)*scale,height*.5-dot(rel,u)*scale,z];
}
function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l);}function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function drawParticles(a,b){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.clearRect(0,0,w,h);ctx.fillStyle="#071018";ctx.fillRect(0,0,w,h);const pts=[];
  for(const [arr,group] of [[a,0],[b,1]])for(let i=0;i<arr.length;i+=3){const q=project([arr[i],arr[i+1],arr[i+2]],w,h);if(q)pts.push({x:q[0],y:q[1],z:q[2],group});}
  pts.sort((x,y)=>y.z-x.z);for(const p of pts){ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.2,5/p.z),0,Math.PI*2);ctx.fillStyle=p.group===0?"#5ba8ff":"#7be36a";ctx.fill();}
}
function drawHistory(){
  const rect=chart.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.width/3*dpr));if(chart.width!==w||chart.height!==h){chart.width=w;chart.height=h;}
  chartCtx.clearRect(0,0,w,h);chartCtx.fillStyle="#071018";chartCtx.fillRect(0,0,w,h);chartCtx.strokeStyle="#33414d";chartCtx.strokeRect(.5,.5,w-1,h-1);
  if(history.length<2)return;const maxY=Math.max(1.25,...history.flatMap(p=>[p.a,p.b]));
  for(const [key,color] of [["a","#5ba8ff"],["b","#7be36a"]]){chartCtx.beginPath();history.forEach((p,i)=>{const x=i/(history.length-1)*(w-20)+10,y=h-10-(p[key]/maxY)*(h-20);if(i===0)chartCtx.moveTo(x,y);else chartCtx.lineTo(x,y);});chartCtx.strokeStyle=color;chartCtx.lineWidth=2*dpr;chartCtx.stroke();}
  chartCtx.fillStyle="#9fb5c8";chartCtx.font=`${12*dpr}px monospace`;chartCtx.fillText("extent-volume ratio history",10,16*dpr);
}
function reset(){if(sim)sim.free();sim=new OfficialExample3dSimulation("elasticity");initialA=computeMetrics(sim.fluid_positions(0),sim.fluid_velocities(0),null);initialB=computeMetrics(sim.fluid_positions(1),sim.fluid_velocities(1),null);history.length=0;accumulator=0;previous=performance.now();}
pauseButton.addEventListener("click",()=>{paused=!paused;pauseButton.textContent=paused?"Resume":"Pause";});resetButton.addEventListener("click",reset);
canvas.addEventListener("pointerdown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener("pointermove",e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.008;pitch=Math.max(-1.05,Math.min(1.05,pitch-dy*.008));});canvas.addEventListener("pointerup",()=>dragging=false);canvas.addEventListener("wheel",e=>{e.preventDefault();distanceScale=Math.max(.5,Math.min(2.5,distanceScale*Math.exp(e.deltaY*.001)));},{passive:false});
await init(new URL("./pkg/sph_web_samples_bg.wasm?v=2.10",import.meta.url));reset();
const fixedDt=1/200;
function frame(now){
  const dt=Math.min((now-previous)/1000,.05)*Number(timeScaleSelect.value);previous=now;const p0=performance.now();
  if(!paused){accumulator+=dt;let sub=0;while(accumulator>=fixedDt&&sub<5){sim.step(fixedDt);accumulator-=fixedDt;sub++;}}
  const pms=performance.now()-p0;smoothedPhysicsMs=smoothedPhysicsMs?smoothedPhysicsMs*.9+pms*.1:pms;
  const posA=sim.fluid_positions(0),posB=sim.fluid_positions(1),mA=computeMetrics(posA,sim.fluid_velocities(0),initialA),mB=computeMetrics(posB,sim.fluid_velocities(1),initialB);
  tableA.innerHTML=rows(mA);tableB.innerHTML=rows(mB);drawParticles(posA,posB);
  if(now-lastHistoryAt>100){lastHistoryAt=now;history.push({a:mA.volumeRatio,b:mB.volumeRatio});if(history.length>240)history.shift();drawHistory();}
  particlesLabel.textContent=sim.particle_count().toLocaleString();historyLabel.textContent=history.length;physicsLabel.textContent=smoothedPhysicsMs.toFixed(2);
  frames++;if(now-fpsSince>=1000){fpsLabel.textContent=(frames*1000/(now-fpsSince)).toFixed(1);frames=0;fpsSince=now;}requestAnimationFrame(frame);
}requestAnimationFrame(frame);
