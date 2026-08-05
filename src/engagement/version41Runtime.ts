import * as THREE from "three";
import { ProgressRepository } from "../persistence/progress";
import { GameView } from "../render/gameView";
import type { Gate } from "../sim/course";
import type { ActiveLivingWorldEvent } from "../sim/obstacleVariety";
import type { SimState } from "../sim/state";
import {
  createRunId,
  HostedTelemetryTransport,
  TelemetryClient,
  type TelemetryEventName,
  type TelemetryPayload
} from "../telemetry/telemetry";
import {
  VERSION41_CONFIG,
  VERSION41_RELICS,
  Version41ProgressRepository,
  auditVersion41Budgets,
  collectibleHit,
  createVersion41Plan,
  moteLateralPosition,
  segmentAtTime,
  validateVersion41Plan,
  version41QaTimeScale,
  type Version41Segment,
  type Version41SegmentKind,
  type Version41Storage
} from "./version41Plan";

const MODE = "expedition-v41";
const AUTO_START = "glowfin.version41.auto-start";
const HIDDEN = 0.0001;
const PLAN = createVersion41Plan();

interface Result {
  moteCount: number;
  bestChain: number;
  relicFound: boolean;
  rescueLights: number;
  miriRescued: boolean;
  raceGapUnits: number;
  raceWon: boolean;
  currentBreaks: number;
  chaseGapUnits: number;
  chaseSucceeded: boolean;
}

type RuntimeEvent =
  | { type: "ready"; drawCalls: number; triangles: number; materials: number }
  | { type: "segment"; segment: Version41Segment; elapsedSec: number }
  | { type: "mote"; count: number; chain: number; best: number }
  | { type: "relic"; found: boolean }
  | { type: "rescue"; count: number; rescued: boolean }
  | { type: "race"; gap: number; complete: boolean }
  | { type: "chase"; breaks: number; gap: number; complete: boolean }
  | { type: "complete"; elapsedSec: number; result: Result }
  | { type: "reset" };

type Emit = (event: RuntimeEvent) => void;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeStorage(): Version41Storage & Storage {
  try {
    const key = "glowfin.version41.probe";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return localStorage;
  } catch {
    const values = new Map<string, string>();
    return {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); }
    };
  }
}

function coloured<T extends THREE.BufferGeometry>(geometry: T, colour: number): T {
  const count = geometry.getAttribute("position").count;
  const rgb = new THREE.Color(colour);
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const offset = index * 3;
    values[offset] = rgb.r;
    values[offset + 1] = rgb.g;
    values[offset + 2] = rgb.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return geometry;
}

function swimmerGeometry(colour: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.5, -1.25, -0.7, 0, -0.55, 0, -0.42, -0.55, 0.7, 0, -0.55,
    -1.5, -0.06, 0.15, 0, 0.16, 0.55, 1.5, -0.06, 0.15,
    -0.5, 0, 0.5, 0, 0, 1.55, 0.5, 0, 0.5
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2, 3, 2, 5, 3, 5, 6,
    2, 7, 8, 2, 8, 9
  ]);
  geometry.computeVertexNormals();
  return coloured(geometry, colour);
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
}

function presentationOnly(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.userData["hideInArtMask"] = true;
    child.userData["version41Presentation"] = true;
  });
}

class LivingCurrentLayer {
  readonly group = new THREE.Group();
  private readonly glow = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  private readonly shadow = new THREE.MeshBasicMaterial({
    color: 0x180a2c,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  private readonly moteGeometry = new THREE.OctahedronGeometry(0.22, 0);
  private readonly markerGeometry = new THREE.TorusGeometry(1.5, 0.08, 4, 18);
  private readonly waveGeometry = new THREE.BoxGeometry(5.6, 4, 0.25);
  private readonly neriGeometry = swimmerGeometry(0xa879ff);
  private readonly miriGeometry = swimmerGeometry(0x70f2d8);
  private readonly duskmawGeometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -2.8),
      new THREE.Vector3(-0.3, 0.15, -1.3),
      new THREE.Vector3(0.35, -0.1, 0.2),
      new THREE.Vector3(-0.2, 0.08, 1.6),
      new THREE.Vector3(0, 0, 3.2)
    ]),
    18,
    0.68,
    6,
    false
  );
  private readonly relicGeometry = coloured(new THREE.IcosahedronGeometry(0.68, 1), 0xffd46f);
  private readonly portalGeometry = coloured(new THREE.TorusGeometry(3.1, 0.18, 5, 24), 0x83f3ff);
  private readonly motes = new THREE.InstancedMesh(
    this.moteGeometry,
    this.glow,
    VERSION41_CONFIG.collectibles.motePool
  );
  private readonly markers = new THREE.InstancedMesh(this.markerGeometry, this.glow, 3);
  private readonly waves = new THREE.InstancedMesh(this.waveGeometry, this.shadow, 3);
  private readonly neri = new THREE.Mesh(this.neriGeometry, this.glow);
  private readonly miri = new THREE.Mesh(this.miriGeometry, this.glow);
  private readonly duskmaw = new THREE.Mesh(this.duskmawGeometry, this.shadow);
  private readonly relic = new THREE.Mesh(this.relicGeometry, this.glow);
  private readonly portal = new THREE.Mesh(this.portalGeometry, this.glow);
  private readonly matrix = new THREE.Matrix4();
  private readonly colour = new THREE.Color();
  private readonly origins = new Map<Version41SegmentKind, number>();
  private readonly resolvedMotes = new Set<number>();
  private readonly collectedMotes = new Set<number>();
  private readonly rescued = new Set<number>();
  private readonly breaks = new Set<number>();
  private active: Version41SegmentKind | null = null;
  private previousElapsed = -1;
  private moteOrigin = 16;
  private nextMiss = 0;
  private chain = 0;
  private bestChain = 0;
  private relicFound = false;
  private relicDone = false;
  private raceDone = false;
  private raceGap = 0;
  private chaseDone = false;
  private chaseGap = VERSION41_CONFIG.chase.initialGapUnits;
  private complete = false;
  private portalDistance: number | null = null;

  constructor(private readonly view: GameView, private readonly emit: Emit) {
    const planIssues = validateVersion41Plan(PLAN);
    if (planIssues.length) throw new Error(`Version 41 plan rejected: ${planIssues.join("; ")}`);
    for (const instanced of [this.motes, this.markers, this.waves]) {
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.frustumCulled = false;
    }
    this.group.name = "Version41LivingCurrent";
    this.group.add(this.motes, this.markers, this.waves, this.neri, this.miri, this.duskmaw, this.relic, this.portal);
    presentationOnly(this.group);
    this.view.scene.add(this.group);
    this.neri.visible = this.miri.visible = this.duskmaw.visible = this.relic.visible = this.portal.visible = false;
    this.markers.count = this.waves.count = 0;
    const triangles = Math.ceil(
      triangleCount(this.moteGeometry) * VERSION41_CONFIG.collectibles.motePool +
      triangleCount(this.markerGeometry) * 3 + triangleCount(this.waveGeometry) * 3 +
      triangleCount(this.neriGeometry) + triangleCount(this.miriGeometry) +
      triangleCount(this.duskmawGeometry) + triangleCount(this.relicGeometry) + triangleCount(this.portalGeometry)
    );
    const budget = { additionalDrawCalls: 8, additionalTriangles: triangles, additionalMaterials: 2 };
    const issues = auditVersion41Budgets(budget);
    if (issues.length) throw new Error(`Version 41 budget rejected: ${issues.join("; ")}`);
    this.emit({ type: "ready", drawCalls: 8, triangles, materials: 2 });
  }

  setVisible(visible: boolean): void { this.group.visible = visible; }

  update(sim: SimState, frameSec: number): void {
    const elapsed = sim.elapsedSec * version41QaTimeScale(window.location);
    if (this.previousElapsed > 1 && (elapsed + 0.1 < this.previousElapsed || sim.forwardDistance < 1)) this.reset(sim);
    this.previousElapsed = elapsed;
    const segment = segmentAtTime(PLAN, elapsed);
    if (segment.kind !== this.active) {
      this.active = segment.kind;
      this.origins.set(segment.kind, sim.forwardDistance);
      this.emit({ type: "segment", segment, elapsedSec: Math.min(elapsed, PLAN.durationSec) });
    }
    this.updateMotes(sim, elapsed);
    this.updateRelic(sim, segment, elapsed, frameSec);
    this.updateRescue(sim, segment, elapsed);
    this.updateRace(sim, segment, elapsed);
    this.updateChase(sim, segment, elapsed);
    this.updateFinish(sim, segment, elapsed, frameSec);
  }

  private reset(sim: SimState): void {
    this.origins.clear(); this.resolvedMotes.clear(); this.collectedMotes.clear(); this.rescued.clear(); this.breaks.clear();
    this.active = null; this.previousElapsed = -1; this.moteOrigin = sim.forwardDistance + 16; this.nextMiss = 0;
    this.chain = this.bestChain = 0; this.relicFound = this.relicDone = this.raceDone = this.chaseDone = this.complete = false;
    this.raceGap = 0; this.chaseGap = VERSION41_CONFIG.chase.initialGapUnits; this.portalDistance = null;
    this.neri.visible = this.miri.visible = this.duskmaw.visible = this.relic.visible = this.portal.visible = false;
    this.markers.count = this.waves.count = 0;
    this.emit({ type: "reset" });
  }

  private updateMotes(sim: SimState, elapsed: number): void {
    const cfg = VERSION41_CONFIG.collectibles;
    const first = Math.max(0, Math.floor((sim.forwardDistance - this.moteOrigin) / cfg.moteSpacingUnits) - 2);
    for (let slot = 0; slot < cfg.motePool; slot++) {
      const sequence = first + slot;
      const distance = this.moteOrigin + sequence * cfg.moteSpacingUnits;
      const visible = !this.resolvedMotes.has(sequence) && distance > sim.forwardDistance - 24 && distance < sim.forwardDistance + 96;
      const scale = visible ? 0.22 * (1 + Math.sin(elapsed * 3.2 + sequence) * 0.14) : HIDDEN;
      this.matrix.compose(
        new THREE.Vector3(moteLateralPosition(sequence), 0.25 + Math.sin(sequence * 0.4) * 0.32, -distance),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      this.motes.setMatrixAt(slot, this.matrix);
      this.motes.setColorAt(slot, this.colour.setHSL(0.12 + sequence % 4 * 0.012, 0.95, 0.66));
    }
    this.motes.instanceMatrix.needsUpdate = true;
    if (this.motes.instanceColor) this.motes.instanceColor.needsUpdate = true;
    const near = Math.max(0, Math.round((sim.forwardDistance - this.moteOrigin) / cfg.moteSpacingUnits));
    for (let sequence = Math.max(0, near - 2); sequence <= near + 2; sequence++) {
      if (this.resolvedMotes.has(sequence)) continue;
      if (collectibleHit(sim.forwardDistance, sim.lateralPosition, this.moteOrigin + sequence * cfg.moteSpacingUnits, moteLateralPosition(sequence), cfg.moteCollectRadius)) {
        this.resolvedMotes.add(sequence); this.collectedMotes.add(sequence); this.chain += 1; this.bestChain = Math.max(this.bestChain, this.chain);
        this.emit({ type: "mote", count: this.collectedMotes.size, chain: this.chain, best: this.bestChain });
      }
    }
    while (this.moteOrigin + this.nextMiss * cfg.moteSpacingUnits < sim.forwardDistance - cfg.moteMissDistanceUnits) {
      if (!this.resolvedMotes.has(this.nextMiss)) {
        this.resolvedMotes.add(this.nextMiss);
        if (this.chain) { this.chain = 0; this.emit({ type: "mote", count: this.collectedMotes.size, chain: 0, best: this.bestChain }); }
      }
      this.nextMiss += 1;
    }
  }

  private updateRelic(sim: SimState, segment: Version41Segment, elapsed: number, frameSec: number): void {
    const origin = this.origins.get("relic-fork");
    const active = segment.kind === "relic-fork" && origin !== undefined && !this.relicDone;
    this.relic.visible = active;
    if (!active || origin === undefined) return;
    const distance = origin + VERSION41_CONFIG.collectibles.relicAheadUnits;
    this.relic.position.set(4.15, 0.7, -distance);
    this.relic.rotation.y += reducedMotion() ? 0 : frameSec * 1.7;
    this.relic.scale.setScalar(reducedMotion() ? 1 : 1 + Math.sin(elapsed * 4) * 0.12);
    if (collectibleHit(sim.forwardDistance, sim.lateralPosition, distance, 4.15, VERSION41_CONFIG.collectibles.relicCollectRadius)) {
      this.relicDone = this.relicFound = true; this.relic.visible = false; this.emit({ type: "relic", found: true });
    } else if (sim.forwardDistance > distance + 4) {
      this.relicDone = true; this.relic.visible = false; this.emit({ type: "relic", found: false });
    }
  }

  private setMarker(index: number, distance: number, lateral: number, visible: boolean, colour: number): void {
    const scale = visible ? 1 : HIDDEN;
    this.matrix.compose(
      new THREE.Vector3(lateral, 0.4, -distance),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      new THREE.Vector3(scale, scale, scale)
    );
    this.markers.setMatrixAt(index, this.matrix);
    this.markers.setColorAt(index, this.colour.set(colour));
  }

  private updateRescue(sim: SimState, segment: Version41Segment, elapsed: number): void {
    const origin = this.origins.get("rescue-miri");
    const active = segment.kind === "rescue-miri" && origin !== undefined;
    this.markers.count = active ? 3 : 0;
    if (active && origin !== undefined) {
      const laterals = [-3.25, 3.25, 0];
      VERSION41_CONFIG.collectibles.rescueAheadUnits.forEach((ahead, index) => {
        const distance = origin + ahead;
        const lateral = laterals[index] ?? 0;
        this.setMarker(index, distance, lateral, !this.rescued.has(index), 0x72f4d8);
        if (!this.rescued.has(index) && collectibleHit(sim.forwardDistance, sim.lateralPosition, distance, lateral, VERSION41_CONFIG.collectibles.rescueCollectRadius)) {
          this.rescued.add(index); this.emit({ type: "rescue", count: this.rescued.size, rescued: this.rescued.size === 3 });
        }
      });
      this.markers.instanceMatrix.needsUpdate = true;
      if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    }
    const saved = this.rescued.size === 3;
    this.miri.visible = active || saved;
    if (this.miri.visible) {
      const finalAhead = VERSION41_CONFIG.collectibles.rescueAheadUnits[2] ?? 226;
      const distance = saved ? sim.forwardDistance - 2.5 : (origin ?? sim.forwardDistance) + finalAhead + 9;
      this.miri.position.set(2.9, 0.15 + (reducedMotion() ? 0 : Math.sin(elapsed * 2.2) * 0.18), -distance);
      this.miri.rotation.y = Math.PI; this.miri.scale.set(0.9, 0.65, 0.82);
    }
  }

  private updateRace(sim: SimState, segment: Version41Segment, elapsed: number): void {
    const race = PLAN.segments.find((entry) => entry.kind === "race-neri");
    const origin = this.origins.get("race-neri");
    const cameo = segment.kind === "follow-light" && elapsed >= 12;
    const active = segment.kind === "race-neri" && race && origin !== undefined;
    this.neri.visible = Boolean(cameo || active || segment.kind === "return-moonwell");
    if (this.neri.visible) {
      if (active && race && origin !== undefined) {
        this.raceGap = sim.forwardDistance - (origin + VERSION41_CONFIG.race.targetSpeedUnitsPerSec * clamp(elapsed - race.startSec, 0, 30));
        this.emit({ type: "race", gap: this.raceGap, complete: false });
      }
      const visualGap = active ? clamp(this.raceGap, -18, 18) : (segment.kind === "return-moonwell" ? 4 : -7);
      this.neri.position.set(-2.8 + (reducedMotion() ? 0 : Math.sin(elapsed * 1.7) * 0.35), 0.2, -(sim.forwardDistance - visualGap));
      this.neri.rotation.y = Math.PI; this.neri.rotation.z = reducedMotion() ? 0 : Math.sin(elapsed * 2.1) * 0.08;
      this.neri.scale.set(0.84, 0.72, 0.92);
    }
    if (!this.raceDone && race && elapsed >= race.endSec) {
      this.raceDone = true; this.emit({ type: "race", gap: this.raceGap, complete: true });
    }
  }

  private updateChase(sim: SimState, segment: Version41Segment, elapsed: number): void {
    const chase = PLAN.segments.find((entry) => entry.kind === "duskmaw-chase");
    const origin = this.origins.get("duskmaw-chase");
    const active = segment.kind === "duskmaw-chase" && chase && origin !== undefined;
    this.duskmaw.visible = Boolean(active); this.markers.count = active ? 3 : (segment.kind === "rescue-miri" ? this.markers.count : 0); this.waves.count = active ? 3 : 0;
    if (active && chase && origin !== undefined) {
      const laterals = [-3.1, 3.1, 2.6];
      VERSION41_CONFIG.collectibles.currentBreakAheadUnits.forEach((ahead, index) => {
        const distance = origin + ahead; const lateral = laterals[index] ?? 0;
        this.setMarker(index, distance, lateral, !this.breaks.has(index), 0x75f5ff);
        if (!this.breaks.has(index) && collectibleHit(sim.forwardDistance, sim.lateralPosition, distance, lateral, VERSION41_CONFIG.collectibles.currentBreakCollectRadius)) this.breaks.add(index);
      });
      this.markers.instanceMatrix.needsUpdate = true;
      if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
      const chaseElapsed = clamp(elapsed - chase.startSec, 0, 30);
      this.chaseGap = clamp(
        VERSION41_CONFIG.chase.initialGapUnits + this.breaks.size * VERSION41_CONFIG.chase.breakGainUnits - chaseElapsed * VERSION41_CONFIG.chase.closingUnitsPerSec,
        VERSION41_CONFIG.chase.minimumGapUnits,
        VERSION41_CONFIG.chase.maximumGapUnits
      );
      this.duskmaw.position.set(sim.lateralPosition * 0.34 + (reducedMotion() ? 0 : Math.sin(elapsed * 2.4) * 0.45), 0.3, -(sim.forwardDistance - this.chaseGap));
      this.duskmaw.rotation.y = Math.PI; this.duskmaw.scale.setScalar(1.15);
      for (let index = 0; index < 3; index++) {
        const phase = clamp((chaseElapsed - (4 + index * 8)) / 4, 0, 1);
        const visible = chaseElapsed >= 4 + index * 8 && chaseElapsed <= 8 + index * 8;
        this.matrix.compose(
          new THREE.Vector3((index % 2 ? 1 : -1) * (3.6 - phase), 1.25, -(sim.forwardDistance + 35 + index * 5)),
          new THREE.Quaternion(),
          new THREE.Vector3(visible ? 1 : HIDDEN, visible ? 1 : HIDDEN, visible ? 1 : HIDDEN)
        );
        this.waves.setMatrixAt(index, this.matrix);
      }
      this.waves.instanceMatrix.needsUpdate = true;
      this.emit({ type: "chase", breaks: this.breaks.size, gap: this.chaseGap, complete: false });
    }
    if (!this.chaseDone && chase && elapsed >= chase.endSec) {
      this.chaseDone = true; this.emit({ type: "chase", breaks: this.breaks.size, gap: this.chaseGap, complete: true });
    }
  }

  private updateFinish(sim: SimState, segment: Version41Segment, elapsed: number, frameSec: number): void {
    if (segment.kind !== "return-moonwell") { this.portal.visible = false; return; }
    if (this.portalDistance === null) this.portalDistance = sim.forwardDistance + VERSION41_CONFIG.presentation.finishAheadUnits;
    this.portal.visible = true; this.portal.position.set(0, 1.3, -this.portalDistance); this.portal.rotation.x = Math.PI / 2;
    if (!reducedMotion()) this.portal.rotation.z += frameSec * 0.55;
    if (!this.complete && (elapsed >= PLAN.durationSec || (sim.forwardDistance >= this.portalDistance - 0.8 && Math.abs(sim.lateralPosition) <= 3.1))) {
      this.complete = true;
      this.emit({ type: "complete", elapsedSec: Math.min(elapsed, PLAN.durationSec), result: this.result() });
    }
  }

  private result(): Result {
    return {
      moteCount: this.collectedMotes.size, bestChain: this.bestChain, relicFound: this.relicFound,
      rescueLights: this.rescued.size, miriRescued: this.rescued.size === 3,
      raceGapUnits: Math.max(0, this.raceGap), raceWon: this.raceGap >= 0,
      currentBreaks: this.breaks.size, chaseGapUnits: this.chaseGap,
      chaseSucceeded: this.chaseGap >= VERSION41_CONFIG.chase.successGapUnits
    };
  }

  dispose(): void {
    this.view.scene.remove(this.group);
    for (const geometry of [this.moteGeometry, this.markerGeometry, this.waveGeometry, this.neriGeometry, this.miriGeometry, this.duskmawGeometry, this.relicGeometry, this.portalGeometry]) geometry.dispose();
    this.glow.dispose(); this.shadow.dispose();
  }
}

function reducedMotion(): boolean {
  return document.documentElement.dataset["glowfinReducedMotion"] === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

let emit: Emit = () => undefined;
const layers = new WeakMap<GameView, LivingCurrentLayer>();
const originalRender = GameView.prototype.render;
const originalDispose = GameView.prototype.dispose;

GameView.prototype.render = function version41Render(
  sim: SimState,
  gates: readonly Gate[],
  lightFraction: number,
  elapsedSec: number,
  frameSec: number,
  ghostSim: SimState | null = null,
  activeLivingEvents: readonly ActiveLivingWorldEvent[] = []
): void {
  const active = document.documentElement.dataset["glowfinMode"] === MODE && document.getElementById("moonwell-hub")?.dataset["active"] !== "true";
  let layer = layers.get(this);
  if (active) {
    if (!layer) { layer = new LivingCurrentLayer(this, (event) => emit(event)); layers.set(this, layer); }
    layer.setVisible(true); layer.update(sim, frameSec);
  } else layer?.setVisible(false);
  originalRender.call(this, sim, gates, lightFraction, elapsedSec, frameSec, ghostSim, activeLivingEvents);
};

GameView.prototype.dispose = function version41Dispose(): void {
  layers.get(this)?.dispose(); layers.delete(this); originalDispose.call(this);
};

function installStyles(): void {
  const style = document.createElement("style");
  style.id = "version41-styles";
  style.textContent = `
#v41-entry{width:100%;min-height:76px;margin-top:10px;padding:12px;display:grid;grid-template-columns:46px 1fr auto;align-items:center;gap:11px;border:1px solid #ffd47899;border-radius:20px;background:linear-gradient(135deg,#49346fee,#076b7cee);color:#f5fcff;text-align:left}
#v41-entry i{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,#fff6b8,#ffcf67 25%,#795ac9 65%,transparent 70%);font-style:normal}#v41-entry strong,#v41-entry span{display:block}#v41-entry strong{color:#fff1bc;font-size:15px}#v41-entry span{margin-top:3px;color:#dff6ffcc;font-size:12px}#v41-entry b{color:#ffe6a4;font-size:10px}
#v41-hud{position:fixed;left:50%;top:max(82px,calc(var(--glowfin-safe-top) + 70px));z-index:6;width:min(390px,calc(100vw - 28px));display:none;transform:translateX(-50%);pointer-events:none}#v41-hud[data-active=true]{display:block}.v41-card{padding:10px 12px;border:1px solid #ffda7d77;border-radius:17px;background:#07182de8;backdrop-filter:blur(6px)}.v41-top{display:flex;justify-content:space-between;gap:10px}#v41-segment-title{color:#fff1ba;font-size:14px}#v41-timer,#v41-objective{color:#bfefff;font-size:12px}#v41-objective{margin:4px 0 7px}.v41-bar{height:4px;border-radius:5px;background:#ffffff1c;overflow:hidden}#v41-progress-fill{height:100%;width:0;background:linear-gradient(90deg,#ffd46e,#63e8ff,#ae72ff)}.v41-stats{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.v41-stats span{padding:3px 6px;border-radius:10px;background:#02121fb8;color:#dff8ff;font-size:10px}
#v41-toast{position:fixed;left:50%;bottom:max(110px,calc(var(--glowfin-safe-bottom) + 96px));z-index:8;display:none;transform:translateX(-50%);padding:8px 12px;border:1px solid #ffdb836e;border-radius:18px;background:#0b1c36ed;color:#fff0b7;font-size:12px;font-weight:800;text-align:center;pointer-events:none}#v41-toast[data-active=true]{display:block}
#v41-complete{position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;padding:18px;background:#030713e8;backdrop-filter:blur(8px)}#v41-complete[data-active=true]{display:flex}.v41-done{width:min(390px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:20px 17px;border:1px solid #ffdb8477;border-radius:24px;background:linear-gradient(160deg,#092f43,#28174e);text-align:center}.v41-orb{width:82px;height:82px;margin:0 auto 10px;border-radius:50%;background:radial-gradient(circle,#fffbd1,#ffd268 20%,#65eaff 48%,#7655c9 70%,transparent 74%);box-shadow:0 0 38px #67eaff88}.v41-done h2{margin:0;color:#fff2bb;font-size:27px}.v41-done p{color:#def7ffc7;font-size:13px}#v41-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:11px 0}#v41-result-grid div{padding:8px;border-radius:12px;background:#03142699}#v41-result-grid strong,#v41-result-grid span{display:block}#v41-result-grid strong{color:#a9f3ff}#v41-result-grid span{color:#d5eff8aa;font-size:10px}.v41-actions{display:grid;gap:7px}.v41-actions button,.v41-back{min-height:46px;border:1px solid #91e7ff55;border-radius:15px;background:#071c31;color:#f2fcff;font:800 13px inherit}#v41-rematch{background:linear-gradient(135deg,#0fa3bb,#5348b8)}
#v41-atlas-list{display:grid;gap:7px}.v41-relic{display:flex;justify-content:space-between;gap:10px;padding:9px 11px;border:1px solid #8fe5ff33;border-radius:14px;background:#03142699}.v41-relic[data-found=true]{border-color:#ffda7d88}.v41-relic strong,.v41-relic span{display:block}.v41-relic strong{color:#effbff;font-size:13px}.v41-relic span{color:#ccebf6aa;font-size:11px}.v41-relic b{color:#ffe5a5;font-size:10px}#v41-restoration{padding:10px;border-radius:13px;background:#39544555;color:#baffdc;font-size:12px}
html[data-glowfin-high-contrast=true] .v41-card,html[data-glowfin-high-contrast=true] #v41-entry{border-width:2px;background-color:#000c19f5}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
  document.head.append(style);
}

function text(id: string, value: string): void { const node = document.getElementById(id); if (node) node.textContent = value; }
function timer(elapsed: number): string { const remaining = Math.max(0, 180 - elapsed); return `${Math.floor(remaining / 60)}:${Math.floor(remaining % 60).toString().padStart(2, "0")}`; }

function install(): void {
  if (document.getElementById("v41-entry")) return;
  installStyles();
  const storage = safeStorage();
  const progressRepository = new Version41ProgressRepository(storage);
  let progress = progressRepository.load().progress;
  const baseProgress = new ProgressRepository(storage);
  const telemetry = new TelemetryClient(baseProgress.load().progress.telemetryConsent, new HostedTelemetryTransport());
  const runId = createRunId();
  const track = (name: TelemetryEventName, payload: TelemetryPayload): void => {
    telemetry.setConsent(baseProgress.load().progress.telemetryConsent); telemetry.track(name, payload, runId);
  };

  document.body.insertAdjacentHTML("beforeend", `
<aside id="v41-hud" data-active="false" aria-live="polite"><div class="v41-card"><div class="v41-top"><strong id="v41-segment-title">The Missing Moonseed</strong><span id="v41-timer">3:00</span></div><p id="v41-objective">Follow the golden current.</p><div class="v41-bar"><div id="v41-progress-fill"></div></div><div class="v41-stats"><span id="v41-chain">Chain 0</span><span id="v41-relic">Relic not found</span><span id="v41-rescue">Miri 0/3</span><span id="v41-race">Neri nearby</span><span id="v41-chase">Current calm</span></div></div></aside>
<div id="v41-toast" role="status" aria-live="polite"></div>
<section id="v41-complete" data-active="false"><div class="v41-done"><div class="v41-orb"></div><h2>Moonseed restored</h2><p>Glowfin, Neri and Miri return together. The Moon Well carries a new living light.</p><div id="v41-result-grid"></div><div class="v41-actions"><button id="v41-rematch" type="button">Dive Again · Missing Moonseed</button><button id="v41-return" type="button">Return to the Moon Well</button></div></div></section>`);
  const entry = document.createElement("button");
  entry.id = "v41-entry"; entry.type = "button"; entry.dataset.hudAction = "";
  entry.innerHTML = `<i>✦</i><span><strong>The Missing Moonseed</strong><span>3-minute Expedition · collect · rescue · race · escape</span></span><b>NEW</b>`;
  document.getElementById("moonwell-dive")?.insertAdjacentElement("afterend", entry);
  const hub = document.getElementById("moonwell-hub");
  hub?.setAttribute("data-v41-restored", String(progress.moonWellRestored));

  const nav = document.querySelector("#moonwell-home .moonwell-nav");
  const shell = document.querySelector("#moonwell-hub .moonwell-shell");
  let atlas: HTMLElement | null = null;
  if (nav && shell) {
    nav.insertAdjacentHTML("beforeend", `<button id="v41-atlas-open" type="button"><strong>Relic Atlas</strong><span>Six Moon-Garden discoveries</span></button>`);
    shell.insertAdjacentHTML("beforeend", `<section id="v41-atlas" class="moonwell-view moonwell-panel" hidden><div class="moonwell-panel-heading"><button class="v41-back" type="button">Back</button><div><span>Moon-Garden discoveries</span><h2>Relic Atlas</h2></div></div><p id="v41-restoration"></p><div id="v41-atlas-list"></div></section>`);
    atlas = document.getElementById("v41-atlas");
  }
  const renderAtlas = (): void => {
    progress = progressRepository.load().progress;
    text("v41-restoration", progress.moonWellRestored ? "Moonseed Fountain restored · its light welcomes future Expeditions." : "Complete The Missing Moonseed to awaken the first restoration.");
    const list = document.getElementById("v41-atlas-list");
    if (list) list.innerHTML = VERSION41_RELICS.map((relic) => {
      const found = progress.discoveredRelics.includes(relic.id);
      return `<article class="v41-relic" data-found="${found}"><span><strong>${found ? relic.name : "Undiscovered relic"}</strong><span>${relic.clue}</span></span><b>${found ? "FOUND" : "LOCKED"}</b></article>`;
    }).join("");
  };
  document.getElementById("v41-atlas-open")?.addEventListener("click", () => {
    document.getElementById("moonwell-home")?.setAttribute("hidden", "");
    document.querySelectorAll<HTMLElement>("#moonwell-hub .moonwell-panel").forEach((panel) => { panel.hidden = panel !== atlas; });
    if (atlas) atlas.hidden = false; renderAtlas();
  });
  atlas?.querySelector(".v41-back")?.addEventListener("click", () => { atlas!.hidden = true; document.getElementById("moonwell-home")?.removeAttribute("hidden"); });
  renderAtlas();

  let running = false; let finished = false; let toastTimer = 0;
  const toast = (message: string): void => {
    const node = document.getElementById("v41-toast"); if (!node) return;
    node.textContent = message; node.dataset.active = "true"; clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { node.dataset.active = "false"; }, 1800);
  };
  const start = (): void => {
    running = true; finished = false; document.documentElement.dataset["glowfinMode"] = MODE;
    document.getElementById("v41-hud")?.setAttribute("data-active", "true");
    document.getElementById("v41-complete")?.setAttribute("data-active", "false");
    track("tap_to_dive", { mode: "expedition", expedition: VERSION41_CONFIG.expeditionId, contentVersion: 41, planHash: PLAN.planHash });
    document.getElementById("moonwell-dive")?.click();
  };
  entry.addEventListener("click", (event) => { event.stopPropagation(); start(); });

  emit = (event): void => {
    if (!running) return;
    const hud = document.getElementById("v41-hud");
    if (event.type === "ready") {
      hud?.setAttribute("data-plan-hash", PLAN.planHash); hud?.setAttribute("data-additional-draw-calls", String(event.drawCalls));
      hud?.setAttribute("data-additional-triangles", String(event.triangles)); hud?.setAttribute("data-additional-materials", String(event.materials));
    } else if (event.type === "segment") {
      hud?.setAttribute("data-segment", event.segment.kind); hud?.setAttribute("data-state", "active");
      text("v41-segment-title", event.segment.title); text("v41-objective", event.segment.objective); text("v41-timer", timer(event.elapsedSec));
      const fill = document.getElementById("v41-progress-fill"); if (fill) fill.style.width = `${event.elapsedSec / 1.8}%`;
      track("signature_obstacle", { content: "version41", encounter: event.segment.kind, phase: "start", planHash: PLAN.planHash }); toast(event.segment.title);
    } else if (event.type === "mote") {
      text("v41-chain", `Chain ${event.chain} · Best ${event.best}`); if (event.chain && event.chain % 8 === 0) toast(`${event.chain} Lumen Chain`);
    } else if (event.type === "relic") {
      text("v41-relic", event.found ? "Moonseed Fragment found" : "Relic route missed"); toast(event.found ? "Moonseed Fragment discovered" : "The relic current closed");
    } else if (event.type === "rescue") {
      text("v41-rescue", event.rescued ? "Miri rescued" : `Miri ${event.count}/3`); if (event.rescued) toast("Miri is free—and swimming beside you");
    } else if (event.type === "race") {
      text("v41-race", event.gap >= 0 ? `Ahead of Neri ${Math.abs(event.gap).toFixed(1)}` : `Neri ahead ${Math.abs(event.gap).toFixed(1)}`); if (event.complete) toast(event.gap >= 0 ? "You edged ahead of Neri" : "Neri wins this current—rematch ready");
    } else if (event.type === "chase") {
      text("v41-chase", `Duskmaw gap ${event.gap.toFixed(1)} · ${event.breaks}/3`); if (event.complete) toast(event.gap >= 17 ? "Duskmaw falls into the dark current" : "The guardian guides Glowfin home");
    } else if (event.type === "complete" && !finished) {
      finished = true;
      progress = progressRepository.recordExpedition(progress, {
        relicFound: event.result.relicFound, moteChain: event.result.bestChain, raceGapUnits: event.result.raceGapUnits,
        chaseGapUnits: event.result.chaseGapUnits, miriRescued: event.result.miriRescued
      });
      hub?.setAttribute("data-v41-restored", "true"); hud?.setAttribute("data-state", "complete");
      const grid = document.getElementById("v41-result-grid"); if (grid) grid.innerHTML = [
        [event.result.bestChain, "Best Lumen Chain"], [event.result.relicFound ? "Found" : "Missed", "Moonseed Fragment"],
        [event.result.miriRescued ? "Rescued" : `${event.result.rescueLights}/3`, "Miri"], [event.result.raceWon ? "Won" : "Close", "Race with Neri"],
        [`${event.result.currentBreaks}/3`, "Current Breaks"], [event.result.chaseSucceeded ? "Escaped" : "Recovered", "Duskmaw"]
      ].map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
      document.getElementById("v41-complete")?.setAttribute("data-active", "true");
      track("reward_granted", { reward: "moonwell-restoration", expedition: VERSION41_CONFIG.expeditionId, firstRestoration: progress.expeditionCompletions === 1 });
      track("run_end", { mode: "expedition", expedition: VERSION41_CONFIG.expeditionId, outcome: "complete", seconds: Math.round(event.elapsedSec), planHash: PLAN.planHash }); void telemetry.flush();
    } else if (event.type === "reset") finished = false;
  };

  document.getElementById("v41-rematch")?.addEventListener("click", () => { sessionStorage.setItem(AUTO_START, "1"); location.reload(); });
  document.getElementById("v41-return")?.addEventListener("click", () => { const url = new URL(location.href); url.searchParams.delete("expedition"); url.searchParams.delete("v41qa"); location.assign(url); });
  addEventListener("pagehide", () => { if (running && !finished) track("run_end", { mode: "expedition", expedition: VERSION41_CONFIG.expeditionId, outcome: "abandoned" }); void telemetry.flush(); });
  const queryStart = new URLSearchParams(location.search).get("expedition") === "missing-moonseed";
  const rematch = sessionStorage.getItem(AUTO_START) === "1"; if (rematch) sessionStorage.removeItem(AUTO_START);
  if (queryStart || rematch) setTimeout(start, 0);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
