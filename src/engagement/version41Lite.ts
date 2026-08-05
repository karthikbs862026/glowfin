import * as THREE from "three";
import { ProgressRepository } from "../persistence/progress";
import { GameView } from "../render/gameView";
import type { Gate } from "../sim/course";
import type { ActiveLivingWorldEvent } from "../sim/obstacleVariety";
import type { SimState } from "../sim/state";
import { createRunId, HostedTelemetryTransport, TelemetryClient, type TelemetryEventName, type TelemetryPayload } from "../telemetry/telemetry";
import {
  VERSION41_CONFIG, VERSION41_RELICS, Version41ProgressRepository,
  auditVersion41Budgets, collectibleHit, createVersion41Plan, moteLateralPosition,
  segmentAtTime, validateVersion41Plan, version41QaTimeScale,
  type Version41SegmentKind, type Version41Storage
} from "./version41Plan";

const P = createVersion41Plan();
const MODE = "expedition-v41";
const AUTO = "glowfin.version41.auto-start";
const SMALL = 0.0001;

interface Result {
  chain: number; relic: boolean; rescue: number; race: number; breaks: number; chase: number;
}

function store(): Version41Storage & Storage {
  try {
    localStorage.setItem("v41-probe", "1"); localStorage.removeItem("v41-probe"); return localStorage;
  } catch {
    const map = new Map<string, string>();
    return {
      get length() { return map.size; }, clear: () => map.clear(), getItem: (key) => map.get(key) ?? null,
      key: (index) => [...map.keys()][index] ?? null, removeItem: (key) => { map.delete(key); },
      setItem: (key, value) => { map.set(key, value); }
    };
  }
}

function colour(geometry: THREE.BufferGeometry, value: number): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const rgb = new THREE.Color(value);
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([rgb.r, rgb.g, rgb.b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(data, 3));
  return geometry;
}

function swimmer(value: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0,.5,-1.2,-.7,0,-.5,0,-.4,-.5,.7,0,-.5,-1.5,0,.2,0,.15,.55,1.5,0,.2,-.5,0,.5,0,0,1.5,.5,0,.5
  ], 3));
  geometry.setIndex([0,1,2,0,2,3,1,4,5,1,5,2,3,2,5,3,5,6,2,7,8,2,8,9]);
  geometry.computeVertexNormals();
  return colour(geometry, value);
}

function tris(geometry: THREE.BufferGeometry): number {
  return (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
}

const storage = store();
const progressRepo = new Version41ProgressRepository(storage);
let progress = progressRepo.load().progress;
const baseRepo = new ProgressRepository(storage);
const telemetry = new TelemetryClient(baseRepo.load().progress.telemetryConsent, new HostedTelemetryTransport());
const runId = createRunId();
let running = false;
let finished = false;
let toastTimer = 0;

function track(name: TelemetryEventName, payload: TelemetryPayload): void {
  telemetry.setConsent(baseRepo.load().progress.telemetryConsent);
  telemetry.track(name, payload, runId);
}

function byId(id: string): HTMLElement | null { return document.getElementById(id); }
function setText(id: string, value: string): void { const node = byId(id); if (node) node.textContent = value; }
function reduced(): boolean { return document.documentElement.dataset["glowfinReducedMotion"] === "true" || matchMedia("(prefers-reduced-motion:reduce)").matches; }
function toast(value: string): void {
  const node = byId("v41-toast"); if (!node) return;
  node.textContent = value; node.dataset.active = "true"; clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.dataset.active = "false"; }, 1600);
}

function segmentUi(kind: Version41SegmentKind, elapsed: number): void {
  const segment = P.segments.find((item) => item.kind === kind);
  const hud = byId("v41-hud"); if (!segment || !hud) return;
  hud.dataset.segment = kind; hud.dataset.state = "active";
  setText("v41-segment-title", segment.title); setText("v41-objective", segment.objective);
  const left = Math.max(0, 180 - elapsed); setText("v41-timer", `${Math.floor(left / 60)}:${Math.floor(left % 60).toString().padStart(2,"0")}`);
  const fill = byId("v41-progress-fill"); if (fill) fill.style.width = `${elapsed / 1.8}%`;
  track("signature_obstacle", { content: "version41", encounter: kind, phase: "start", planHash: P.planHash });
  toast(segment.title);
}

function complete(result: Result, elapsed: number): void {
  if (finished) return;
  finished = true;
  progress = progressRepo.recordExpedition(progress, {
    relicFound: result.relic, moteChain: result.chain, raceGapUnits: Math.max(0, result.race),
    chaseGapUnits: result.chase, miriRescued: result.rescue === 3
  });
  byId("moonwell-hub")?.setAttribute("data-v41-restored", "true");
  byId("v41-hud")?.setAttribute("data-state", "complete");
  const values: [string | number, string][] = [
    [result.chain,"Best Lumen Chain"],[result.relic?"Found":"Missed","Moonseed Fragment"],
    [result.rescue===3?"Rescued":`${result.rescue}/3`,"Miri"],[result.race>=0?"Won":"Close","Race with Neri"],
    [`${result.breaks}/3`,"Current Breaks"],[result.chase>=17?"Escaped":"Recovered","Duskmaw"]
  ];
  const grid = byId("v41-result-grid"); if (grid) grid.innerHTML = values.map(([a,b]) => `<div><strong>${a}</strong><span>${b}</span></div>`).join("");
  byId("v41-complete")?.setAttribute("data-active", "true");
  track("reward_granted", { reward:"moonwell-restoration", expedition:VERSION41_CONFIG.expeditionId, firstRestoration:progress.expeditionCompletions===1 });
  track("run_end", { mode:"expedition", expedition:VERSION41_CONFIG.expeditionId, outcome:"complete", seconds:Math.round(elapsed), planHash:P.planHash });
  void telemetry.flush();
}

class Layer {
  readonly group = new THREE.Group();
  private readonly glow = new THREE.MeshBasicMaterial({ color:0xffffff, vertexColors:true, transparent:true, opacity:.92, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false });
  private readonly dark = new THREE.MeshBasicMaterial({ color:0x190a2d, transparent:true, opacity:.78, depthWrite:false, toneMapped:false });
  private readonly moteG = new THREE.OctahedronGeometry(.22,0);
  private readonly ringG = new THREE.TorusGeometry(1.5,.08,4,16);
  private readonly neriG = swimmer(0xaa78ff);
  private readonly miriG = swimmer(0x70f3d8);
  private readonly duskG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,-2.6),new THREE.Vector3(-.3,.15,-1.1),new THREE.Vector3(.35,-.1,.3),new THREE.Vector3(-.2,.1,1.6),new THREE.Vector3(0,0,3)
  ]),16,.68,6,false);
  private readonly relicG = colour(new THREE.IcosahedronGeometry(.68,1),0xffd46f);
  private readonly portalG = colour(new THREE.TorusGeometry(3.1,.18,4,22),0x83f3ff);
  private readonly motes = new THREE.InstancedMesh(this.moteG,this.glow,VERSION41_CONFIG.collectibles.motePool);
  private readonly rings = new THREE.InstancedMesh(this.ringG,this.glow,3);
  private readonly neri = new THREE.Mesh(this.neriG,this.glow);
  private readonly miri = new THREE.Mesh(this.miriG,this.glow);
  private readonly dusk = new THREE.Mesh(this.duskG,this.dark);
  private readonly relic = new THREE.Mesh(this.relicG,this.glow);
  private readonly portal = new THREE.Mesh(this.portalG,this.glow);
  private readonly matrix = new THREE.Matrix4();
  private readonly rgb = new THREE.Color();
  private readonly origins = new Map<Version41SegmentKind,number>();
  private readonly resolved = new Set<number>();
  private readonly saved = new Set<number>();
  private readonly breaks = new Set<number>();
  private kind: Version41SegmentKind | null = null;
  private previous = -1;
  private moteOrigin = 16;
  private nextMiss = 0;
  private chain = 0;
  private best = 0;
  private relicFound = false;
  private relicDone = false;
  private race = 0;
  private raceDone = false;
  private chase = 18;
  private chaseDone = false;
  private portalDistance: number | null = null;

  constructor(private readonly view: GameView) {
    const planIssues = validateVersion41Plan(P); if (planIssues.length) throw new Error(planIssues.join(";"));
    this.group.add(this.motes,this.rings,this.neri,this.miri,this.dusk,this.relic,this.portal);
    this.group.traverse((item) => { item.userData["hideInArtMask"] = true; item.userData["version41Presentation"] = true; });
    this.view.scene.add(this.group);
    for (const mesh of [this.motes,this.rings]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled=false; }
    this.neri.visible=this.miri.visible=this.dusk.visible=this.relic.visible=this.portal.visible=false; this.rings.count=0;
    const triangles=Math.ceil(tris(this.moteG)*48+tris(this.ringG)*3+tris(this.neriG)+tris(this.miriG)+tris(this.duskG)+tris(this.relicG)+tris(this.portalG));
    const issues=auditVersion41Budgets({additionalDrawCalls:7,additionalTriangles:triangles,additionalMaterials:2}); if(issues.length)throw new Error(issues.join(";"));
    const hud=byId("v41-hud"); hud?.setAttribute("data-plan-hash",P.planHash); hud?.setAttribute("data-additional-draw-calls","7");
    hud?.setAttribute("data-additional-triangles",String(triangles)); hud?.setAttribute("data-additional-materials","2");
  }

  show(value:boolean):void{this.group.visible=value;}

  update(sim:SimState,frame:number):void{
    const elapsed=sim.elapsedSec*version41QaTimeScale(location);
    if(this.previous>1&&(elapsed+.1<this.previous||sim.forwardDistance<1))this.reset(sim);
    this.previous=elapsed;
    const segment=segmentAtTime(P,elapsed);
    if(segment.kind!==this.kind){this.kind=segment.kind;this.origins.set(segment.kind,sim.forwardDistance);segmentUi(segment.kind,Math.min(elapsed,180));}
    this.updateMotes(sim,elapsed);
    this.updateRelic(sim,segment.kind,elapsed,frame);
    this.updateActors(sim,segment.kind,elapsed);
    if(segment.kind==="return-moonwell")this.updateFinish(sim,elapsed,frame);
  }

  private reset(sim:SimState):void{
    this.origins.clear();this.resolved.clear();this.saved.clear();this.breaks.clear();this.kind=null;this.previous=-1;this.moteOrigin=sim.forwardDistance+16;this.nextMiss=0;
    this.chain=this.best=this.race=0;this.relicFound=this.relicDone=this.raceDone=this.chaseDone=false;this.chase=18;this.portalDistance=null;finished=false;
    this.neri.visible=this.miri.visible=this.dusk.visible=this.relic.visible=this.portal.visible=false;this.rings.count=0;byId("v41-complete")?.setAttribute("data-active","false");
  }

  private updateMotes(sim:SimState,elapsed:number):void{
    const c=VERSION41_CONFIG.collectibles;const first=Math.max(0,Math.floor((sim.forwardDistance-this.moteOrigin)/c.moteSpacingUnits)-2);
    for(let slot=0;slot<c.motePool;slot++){
      const seq=first+slot,distance=this.moteOrigin+seq*c.moteSpacingUnits,visible=!this.resolved.has(seq)&&distance>sim.forwardDistance-24&&distance<sim.forwardDistance+96;
      const scale=visible?.22*(1+Math.sin(elapsed*3+seq)*.12):SMALL;
      this.matrix.compose(new THREE.Vector3(moteLateralPosition(seq),.25+Math.sin(seq*.4)*.3,-distance),new THREE.Quaternion(),new THREE.Vector3(scale,scale,scale));
      this.motes.setMatrixAt(slot,this.matrix);this.motes.setColorAt(slot,this.rgb.setHSL(.12+seq%4*.012,.95,.66));
    }
    this.motes.instanceMatrix.needsUpdate=true;if(this.motes.instanceColor)this.motes.instanceColor.needsUpdate=true;
    const near=Math.max(0,Math.round((sim.forwardDistance-this.moteOrigin)/c.moteSpacingUnits));
    for(let seq=Math.max(0,near-2);seq<=near+2;seq++)if(!this.resolved.has(seq)&&collectibleHit(sim.forwardDistance,sim.lateralPosition,this.moteOrigin+seq*c.moteSpacingUnits,moteLateralPosition(seq),c.moteCollectRadius)){
      this.resolved.add(seq);this.chain++;this.best=Math.max(this.best,this.chain);setText("v41-chain",`Chain ${this.chain} · Best ${this.best}`);if(this.chain%8===0)toast(`${this.chain} Lumen Chain`);
    }
    while(this.moteOrigin+this.nextMiss*c.moteSpacingUnits<sim.forwardDistance-c.moteMissDistanceUnits){if(!this.resolved.has(this.nextMiss)){this.resolved.add(this.nextMiss);this.chain=0;setText("v41-chain",`Chain 0 · Best ${this.best}`);}this.nextMiss++;}
  }

  private updateRelic(sim:SimState,kind:Version41SegmentKind,elapsed:number,frame:number):void{
    const origin=this.origins.get("relic-fork"),active=kind==="relic-fork"&&origin!==undefined&&!this.relicDone;this.relic.visible=active;if(!active||origin===undefined)return;
    const distance=origin+VERSION41_CONFIG.collectibles.relicAheadUnits;this.relic.position.set(4.15,.7,-distance);if(!reduced())this.relic.rotation.y+=frame*1.7;this.relic.scale.setScalar(reduced()?1:1+Math.sin(elapsed*4)*.1);
    if(collectibleHit(sim.forwardDistance,sim.lateralPosition,distance,4.15,VERSION41_CONFIG.collectibles.relicCollectRadius)){this.relicFound=this.relicDone=true;this.relic.visible=false;setText("v41-relic","Moonseed Fragment found");toast("Moonseed Fragment discovered");}
    else if(sim.forwardDistance>distance+4){this.relicDone=true;this.relic.visible=false;setText("v41-relic","Relic route missed");}
  }

  private ring(index:number,distance:number,lateral:number,visible:boolean,value:number):void{
    const scale=visible?1:SMALL;this.matrix.compose(new THREE.Vector3(lateral,.4,-distance),new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0)),new THREE.Vector3(scale,scale,scale));
    this.rings.setMatrixAt(index,this.matrix);this.rings.setColorAt(index,this.rgb.set(value));
  }

  private updateActors(sim:SimState,kind:Version41SegmentKind,elapsed:number):void{
    const rescueOrigin=this.origins.get("rescue-miri"),rescueActive=kind==="rescue-miri"&&rescueOrigin!==undefined;
    const chaseOrigin=this.origins.get("duskmaw-chase"),chaseSegment=P.segments.find((item)=>item.kind==="duskmaw-chase"),chaseActive=kind==="duskmaw-chase"&&chaseOrigin!==undefined&&chaseSegment;
    this.rings.count=rescueActive||chaseActive?3:0;
    if(rescueActive&&rescueOrigin!==undefined){
      const x=[-3.25,3.25,0];VERSION41_CONFIG.collectibles.rescueAheadUnits.forEach((ahead,index)=>{const distance=rescueOrigin+ahead,lateral=x[index]??0;this.ring(index,distance,lateral,!this.saved.has(index),0x72f4d8);if(!this.saved.has(index)&&collectibleHit(sim.forwardDistance,sim.lateralPosition,distance,lateral,1.55)){this.saved.add(index);setText("v41-rescue",this.saved.size===3?"Miri rescued":`Miri ${this.saved.size}/3`);if(this.saved.size===3)toast("Miri is free");}});
    }else if(chaseActive&&chaseOrigin!==undefined&&chaseSegment){
      const x=[-3.1,3.1,2.6];VERSION41_CONFIG.collectibles.currentBreakAheadUnits.forEach((ahead,index)=>{const distance=chaseOrigin+ahead,lateral=x[index]??0;this.ring(index,distance,lateral,!this.breaks.has(index),0x75f5ff);if(!this.breaks.has(index)&&collectibleHit(sim.forwardDistance,sim.lateralPosition,distance,lateral,1.8))this.breaks.add(index);});
      const time=Math.max(0,Math.min(30,elapsed-chaseSegment.startSec));this.chase=Math.max(7,Math.min(34,18+this.breaks.size*7-time*.28));
      this.dusk.visible=true;this.dusk.position.set(sim.lateralPosition*.34+(reduced()?0:Math.sin(elapsed*2.4)*.45),.3,-(sim.forwardDistance-this.chase));this.dusk.rotation.y=Math.PI;this.dusk.scale.setScalar(1.15);
      setText("v41-chase",`Duskmaw gap ${this.chase.toFixed(1)} · ${this.breaks.size}/3`);
    }else this.dusk.visible=false;
    if(this.rings.count){this.rings.instanceMatrix.needsUpdate=true;if(this.rings.instanceColor)this.rings.instanceColor.needsUpdate=true;}
    this.miri.visible=rescueActive||this.saved.size===3;if(this.miri.visible){this.miri.position.set(2.9,.15+(reduced()?0:Math.sin(elapsed*2.2)*.17),-(this.saved.size===3?sim.forwardDistance-2.5:(rescueOrigin??sim.forwardDistance)+235));this.miri.rotation.y=Math.PI;this.miri.scale.set(.9,.65,.82);}
    const raceSegment=P.segments.find((item)=>item.kind==="race-neri"),raceOrigin=this.origins.get("race-neri"),raceActive=kind==="race-neri"&&raceSegment&&raceOrigin!==undefined;
    this.neri.visible=(kind==="follow-light"&&elapsed>=12)||Boolean(raceActive)||kind==="return-moonwell";
    if(this.neri.visible){if(raceActive&&raceSegment&&raceOrigin!==undefined){this.race=sim.forwardDistance-(raceOrigin+34*Math.max(0,Math.min(30,elapsed-raceSegment.startSec)));setText("v41-race",this.race>=0?`Ahead of Neri ${Math.abs(this.race).toFixed(1)}`:`Neri ahead ${Math.abs(this.race).toFixed(1)}`);}const gap=raceActive?Math.max(-18,Math.min(18,this.race)):kind==="return-moonwell"?4:-7;this.neri.position.set(-2.8,.2,-(sim.forwardDistance-gap));this.neri.rotation.y=Math.PI;this.neri.scale.set(.84,.72,.92);}
    if(!this.raceDone&&raceSegment&&elapsed>=raceSegment.endSec){this.raceDone=true;toast(this.race>=0?"You edged ahead of Neri":"Neri wins—rematch ready");}
    if(!this.chaseDone&&chaseSegment&&elapsed>=chaseSegment.endSec){this.chaseDone=true;toast(this.chase>=17?"Duskmaw falls behind":"The guardian guides Glowfin home");}
  }

  private updateFinish(sim:SimState,elapsed:number,frame:number):void{
    if(this.portalDistance===null)this.portalDistance=sim.forwardDistance+78;this.portal.visible=true;this.portal.position.set(0,1.3,-this.portalDistance);this.portal.rotation.x=Math.PI/2;if(!reduced())this.portal.rotation.z+=frame*.55;
    if(elapsed>=180||(sim.forwardDistance>=this.portalDistance-.8&&Math.abs(sim.lateralPosition)<=3.1))complete({chain:this.best,relic:this.relicFound,rescue:this.saved.size,race:this.race,breaks:this.breaks.size,chase:this.chase},Math.min(elapsed,180));
  }

  dispose():void{this.view.scene.remove(this.group);for(const geometry of [this.moteG,this.ringG,this.neriG,this.miriG,this.duskG,this.relicG,this.portalG])geometry.dispose();this.glow.dispose();this.dark.dispose();}
}

const layers=new WeakMap<GameView,Layer>();
const render=GameView.prototype.render;
const dispose=GameView.prototype.dispose;
GameView.prototype.render=function(sim:SimState,gates:readonly Gate[],light:number,elapsed:number,frame:number,ghost:SimState|null=null,events:readonly ActiveLivingWorldEvent[]=[]):void{
  const active=document.documentElement.dataset["glowfinMode"]===MODE&&byId("moonwell-hub")?.dataset["active"]!=="true";let layer=layers.get(this);
  if(active){if(!layer){layer=new Layer(this);layers.set(this,layer);}layer.show(true);layer.update(sim,frame);}else layer?.show(false);
  render.call(this,sim,gates,light,elapsed,frame,ghost,events);
};
GameView.prototype.dispose=function():void{layers.get(this)?.dispose();layers.delete(this);dispose.call(this);};

function atlas():void{
  progress=progressRepo.load().progress;setText("v41-restoration",progress.moonWellRestored?"Moonseed Fountain restored · its light welcomes future Expeditions.":"Complete The Missing Moonseed to awaken the first restoration.");
  const list=byId("v41-atlas-list");if(list)list.innerHTML=VERSION41_RELICS.map((relic)=>{const found=progress.discoveredRelics.includes(relic.id);return `<article class="v41-relic" data-found="${found}"><span><strong>${found?relic.name:"Undiscovered relic"}</strong><small>${relic.clue}</small></span><b>${found?"FOUND":"LOCKED"}</b></article>`;}).join("");
}

function install():void{
  if(byId("v41-entry"))return;
  const style=document.createElement("style");style.textContent=`
#v41-entry{width:100%;margin-top:9px;padding:11px;display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;border:1px solid #ffd47899;border-radius:18px;background:#174866ee;color:#fff;text-align:left}#v41-entry i{font-size:24px;color:#ffd46e}#v41-entry strong,#v41-entry span{display:block}#v41-entry strong{color:#fff1bc;font-size:15px}#v41-entry span{color:#dff6ffcc;font-size:12px}#v41-entry b{font-size:10px;color:#ffe5a5}
#v41-hud{position:fixed;left:50%;top:max(82px,calc(var(--glowfin-safe-top) + 70px));z-index:6;width:min(390px,calc(100vw - 28px));display:none;transform:translateX(-50%);pointer-events:none}#v41-hud[data-active=true]{display:block}.v41-card{padding:9px 11px;border:1px solid #ffda7d77;border-radius:15px;background:#07182deb}#v41-segment-title{color:#fff1ba;font-size:14px}#v41-timer,#v41-objective{color:#bfefff;font-size:12px}#v41-timer{float:right}#v41-objective{margin:4px 0}.v41-bar{height:4px;background:#ffffff22}.v41-bar div{height:100%;background:#68eaff}.v41-stats{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.v41-stats span{padding:3px 5px;border-radius:8px;background:#02121f;color:#dff8ff;font-size:10px}
#v41-toast{position:fixed;left:50%;bottom:110px;z-index:8;display:none;transform:translateX(-50%);padding:8px 11px;border-radius:16px;background:#0b1c36ed;color:#fff0b7;font-size:12px;font-weight:800}#v41-toast[data-active=true]{display:block}#v41-complete{position:fixed;inset:0;z-index:30;display:none;place-items:center;padding:18px;background:#030713e8}#v41-complete[data-active=true]{display:grid}.v41-done{width:min(380px,100%);padding:18px;border:1px solid #ffdb8477;border-radius:22px;background:#17364f;text-align:center}.v41-done h2{color:#fff2bb}.v41-done p{color:#def7ff;font-size:13px}#v41-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:10px 0}#v41-result-grid div{padding:7px;border-radius:10px;background:#031426}#v41-result-grid strong,#v41-result-grid span{display:block}#v41-result-grid span{font-size:10px}.v41-actions{display:grid;gap:6px}.v41-actions button,.v41-back{min-height:44px;border:1px solid #91e7ff55;border-radius:13px;background:#071c31;color:#fff;font-weight:800}#v41-rematch{background:#146f9b}.v41-relic{display:flex;justify-content:space-between;padding:8px;margin:6px 0;border:1px solid #8fe5ff33;border-radius:12px}.v41-relic strong,.v41-relic small{display:block}.v41-relic small{font-size:10px}html[data-glowfin-high-contrast=true] .v41-card{border-width:2px;background:#000c19}
`;document.head.append(style);
  document.body.insertAdjacentHTML("beforeend",`<aside id="v41-hud" data-active="false"><div class="v41-card"><strong id="v41-segment-title">The Missing Moonseed</strong><span id="v41-timer">3:00</span><p id="v41-objective">Follow the golden current.</p><div class="v41-bar"><div id="v41-progress-fill"></div></div><div class="v41-stats"><span id="v41-chain">Chain 0</span><span id="v41-relic">Relic not found</span><span id="v41-rescue">Miri 0/3</span><span id="v41-race">Neri nearby</span><span id="v41-chase">Current calm</span></div></div></aside><div id="v41-toast" role="status"></div><section id="v41-complete" data-active="false"><div class="v41-done"><h2>Moonseed restored</h2><p>Glowfin, Neri and Miri return together. The Moon Well carries a new living light.</p><div id="v41-result-grid"></div><div class="v41-actions"><button id="v41-rematch">Dive Again · Missing Moonseed</button><button id="v41-return">Return to the Moon Well</button></div></div></section>`);
  const entry=document.createElement("button");entry.id="v41-entry";entry.innerHTML=`<i>✦</i><span><strong>The Missing Moonseed</strong><span>3-minute Expedition · collect · rescue · race · escape</span></span><b>NEW</b>`;byId("moonwell-dive")?.insertAdjacentElement("afterend",entry);
  const nav=document.querySelector("#moonwell-home .moonwell-nav"),shell=document.querySelector("#moonwell-hub .moonwell-shell");
  nav?.insertAdjacentHTML("beforeend",`<button id="v41-atlas-open"><strong>Relic Atlas</strong><span>Six Moon-Garden discoveries</span></button>`);shell?.insertAdjacentHTML("beforeend",`<section id="v41-atlas" class="moonwell-view moonwell-panel" hidden><div class="moonwell-panel-heading"><button class="v41-back">Back</button><div><span>Moon-Garden discoveries</span><h2>Relic Atlas</h2></div></div><p id="v41-restoration"></p><div id="v41-atlas-list"></div></section>`);
  const atlasPanel=byId("v41-atlas");byId("v41-atlas-open")?.addEventListener("click",()=>{byId("moonwell-home")?.setAttribute("hidden","");document.querySelectorAll<HTMLElement>("#moonwell-hub .moonwell-panel").forEach((panel)=>panel.hidden=panel!==atlasPanel);if(atlasPanel)atlasPanel.hidden=false;atlas();});atlasPanel?.querySelector(".v41-back")?.addEventListener("click",()=>{atlasPanel.hidden=true;byId("moonwell-home")?.removeAttribute("hidden");});atlas();byId("moonwell-hub")?.setAttribute("data-v41-restored",String(progress.moonWellRestored));
  const start=():void=>{running=true;finished=false;document.documentElement.dataset["glowfinMode"]=MODE;byId("v41-hud")?.setAttribute("data-active","true");byId("v41-complete")?.setAttribute("data-active","false");track("tap_to_dive",{mode:"expedition",expedition:VERSION41_CONFIG.expeditionId,contentVersion:41,planHash:P.planHash});byId("moonwell-dive")?.click();};
  entry.addEventListener("click",(event)=>{event.stopPropagation();start();});byId("v41-rematch")?.addEventListener("click",()=>{sessionStorage.setItem(AUTO,"1");location.reload();});byId("v41-return")?.addEventListener("click",()=>{const url=new URL(location.href);url.searchParams.delete("expedition");url.searchParams.delete("v41qa");location.assign(url.toString());});
  addEventListener("pagehide",()=>{if(running&&!finished)track("run_end",{mode:"expedition",expedition:VERSION41_CONFIG.expeditionId,outcome:"abandoned"});void telemetry.flush();});
  const query=new URLSearchParams(location.search).get("expedition")==="missing-moonseed",rematch=sessionStorage.getItem(AUTO)==="1";if(rematch)sessionStorage.removeItem(AUTO);if(query||rematch)setTimeout(start,0);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
