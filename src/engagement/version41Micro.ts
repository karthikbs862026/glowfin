import * as THREE from "three";
import rawConfig from "../../config/version41.json";
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

const C = rawConfig;
const S = C.segments;
const MODE = "expedition-v41";
const AUTO = "glowfin.version41.auto-start";
const PRIMARY = "glowfin.version41.v1.primary";
const BACKUP = "glowfin.version41.v1.backup";
const TINY = 0.0001;
const RELICS = [
  ["moonseed-fragment", "Moonseed Fragment", "Take the outer current during Relic Fork."],
  ["tidekeeper-crest", "Tidekeeper Crest", "A future guardian Expedition will reveal it."],
  ["crystal-song", "Crystal Song", "Its echo waits beyond the Moon-Garden."],
  ["mermaid-crown-piece", "Mermaid Crown Piece", "Restore another district to uncover its route."],
  ["leviathan-scale-echo", "Leviathan Scale Echo", "A deeper Duskmaw chapter is required."],
  ["astral-observatory-lens", "Astral Observatory Lens", "The archless observatory is still sleeping."]
] as const;

type Kind = typeof S[number]["kind"];
type Result = {
  chain: number;
  relic: boolean;
  rescue: number;
  race: number;
  breaks: number;
  chase: number;
};
type Save = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  discoveredRelics: string[];
  expeditionCompletions: number;
  bestMoteChain: number;
  bestRaceGapUnits: number;
  bestChaseGapUnits: number;
  miriRescued: boolean;
  moonWellRestored: boolean;
  recentClaims: string[];
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

const beats = [...new Set(S.flatMap((segment) => {
  const values = [segment.startSec, segment.endSec];
  for (let time = segment.startSec + C.budgets.maxPurposeGapSec; time < segment.endSec; time += C.budgets.maxPurposeGapSec) {
    values.push(time);
  }
  return values;
}))].sort((left, right) => left - right);
const PLAN_HASH = hash(JSON.stringify({
  schemaVersion: 1,
  contentVersion: 41,
  expeditionId: C.expeditionId,
  title: C.title,
  seed: C.seed,
  durationSec: C.durationSec,
  segments: S.map((segment) => ({ ...segment })),
  purposeBeatTimesSec: beats
}));

function storage(): StorageLike {
  try {
    localStorage.setItem("glowfin.v41.probe", "1");
    localStorage.removeItem("glowfin.v41.probe");
    return localStorage;
  } catch {
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); }
    };
  }
}

const STORE = storage();
const fresh = (): Save => ({
  schemaVersion: 1,
  revision: 0,
  updatedAt: new Date().toISOString(),
  discoveredRelics: [],
  expeditionCompletions: 0,
  bestMoteChain: 0,
  bestRaceGapUnits: 0,
  bestChaseGapUnits: 0,
  miriRescued: false,
  moonWellRestored: false,
  recentClaims: []
});

function decode(encoded: string | null): Save | null {
  if (!encoded || encoded.length > 16384) return null;
  try {
    const envelope = JSON.parse(encoded) as {
      envelopeVersion?: number;
      payload?: Save;
      checksum?: string;
    };
    const payload = envelope.payload;
    return envelope.envelopeVersion === 1 &&
      payload?.schemaVersion === 1 &&
      Number.isInteger(payload.revision) &&
      Array.isArray(payload.discoveredRelics) &&
      Array.isArray(payload.recentClaims) &&
      envelope.checksum === hash(JSON.stringify(payload))
      ? payload
      : null;
  } catch {
    return null;
  }
}

function load(): Save {
  const primary = decode(STORE.getItem(PRIMARY));
  const backup = decode(STORE.getItem(BACKUP));
  return primary && backup
    ? (primary.revision >= backup.revision ? primary : backup)
    : primary ?? backup ?? fresh();
}

function save(result: Result): Save {
  const current = load();
  const claims = new Set(current.recentClaims);
  const discovered = new Set(current.discoveredRelics);
  if (result.relic) {
    claims.add("relic:moonseed-fragment");
    discovered.add("moonseed-fragment");
  }
  claims.add(`restoration:${C.expeditionId}`);
  const next: Save = {
    ...current,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    discoveredRelics: [...discovered],
    expeditionCompletions: current.expeditionCompletions + 1,
    bestMoteChain: Math.max(current.bestMoteChain, result.chain),
    bestRaceGapUnits: Math.max(current.bestRaceGapUnits, Math.max(0, result.race)),
    bestChaseGapUnits: Math.max(current.bestChaseGapUnits, result.chase),
    miriRescued: current.miriRescued || result.rescue === 3,
    moonWellRestored: true,
    recentClaims: [...claims].slice(-64)
  };
  const encoded = JSON.stringify({
    envelopeVersion: 1,
    payload: next,
    checksum: hash(JSON.stringify(next))
  });
  try {
    STORE.setItem(BACKUP, encoded);
    STORE.setItem(PRIMARY, encoded);
  } catch {
    // A denied storage write does not invalidate the completed run.
  }
  return next;
}

const baseProgress = new ProgressRepository(STORE);
const telemetry = new TelemetryClient(
  baseProgress.load().progress.telemetryConsent,
  new HostedTelemetryTransport()
);
const runId = createRunId();
let progress = load();
let playing = false;
let finished = false;
let toastTimer = 0;

function track(name: TelemetryEventName, payload: TelemetryPayload): void {
  telemetry.setConsent(baseProgress.load().progress.telemetryConsent);
  telemetry.track(name, payload, runId);
}
function element(id: string): HTMLElement | null { return document.getElementById(id); }
function text(id: string, value: string): void {
  const node = element(id);
  if (node) node.textContent = value;
}
function reduced(): boolean {
  return document.documentElement.dataset["glowfinReducedMotion"] === "true" ||
    matchMedia("(prefers-reduced-motion:reduce)").matches;
}
function qaScale(): number {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return local && new URLSearchParams(location.search).get("v41qa") === "1" ? C.qaTimeScale : 1;
}
function hit(distance: number, lateral: number, targetDistance: number, targetLateral: number, radius: number): boolean {
  const forward = distance - targetDistance;
  const side = lateral - targetLateral;
  return forward * forward + side * side <= radius * radius;
}
function moteX(index: number): number {
  return Math.sin(index * 0.58) * 2.65 + Math.sin(index * 0.21 + 0.8) * 0.82;
}
function segmentAt(time: number): typeof S[number] {
  const segment = S.find((entry) => time >= entry.startSec && time < entry.endSec) ?? S[S.length - 1];
  if (!segment) throw new Error("Version 41 encounter plan is empty.");
  return segment;
}
function toast(value: string): void {
  const node = element("v41-toast");
  if (!node) return;
  node.textContent = value;
  node.dataset.active = "true";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.dataset.active = "false"; }, 1600);
}

function showSegment(kind: Kind, elapsed: number): void {
  const segment = S.find((entry) => entry.kind === kind);
  const hud = element("v41-hud");
  if (!segment || !hud) return;
  hud.dataset.segment = kind;
  const history = (hud.dataset["segmentHistory"] ?? "").split("|").filter(Boolean);
  if (history[history.length - 1] !== kind) history.push(kind);
  hud.dataset["segmentHistory"] = history.join("|");
  hud.dataset.state = "active";
  text("v41-segment-title", segment.title);
  text("v41-objective", segment.objective);
  const remaining = Math.max(0, C.durationSec - elapsed);
  text("v41-timer", `${Math.floor(remaining / 60)}:${Math.floor(remaining % 60).toString().padStart(2, "0")}`);
  const fill = element("v41-progress-fill");
  if (fill) fill.style.width = `${elapsed / C.durationSec * 100}%`;
  track("signature_obstacle", {
    content: "version41",
    encounter: kind,
    phase: "start",
    planHash: PLAN_HASH
  });
  toast(segment.title);
}

function finish(result: Result, elapsed: number): void {
  if (finished) return;
  finished = true;
  playing = false;
  window.dispatchEvent(new Event("glowfin:v41-complete"));
  progress = save(result);
  element("moonwell-hub")?.setAttribute("data-v41-restored", "true");
  element("v41-hud")?.setAttribute("data-state", "complete");
  const cards: [string | number, string][] = [
    [result.chain, "Best Lumen Chain"],
    [result.relic ? "Found" : "Missed", "Moonseed Fragment"],
    [result.rescue === 3 ? "Rescued" : `${result.rescue}/3`, "Miri"],
    [result.race >= 0 ? "Won" : "Close", "Race with Neri"],
    [`${result.breaks}/3`, "Current Breaks"],
    [result.chase >= C.chase.successGapUnits ? "Escaped" : "Recovered", "Duskmaw"]
  ];
  const grid = element("v41-result-grid");
  if (grid) {
    grid.innerHTML = cards.map(([value, label]) => (
      `<div><strong>${value}</strong><span>${label}</span></div>`
    )).join("");
  }
  element("v41-complete")?.setAttribute("data-active", "true");
  track("reward_granted", {
    reward: "moonwell-restoration",
    expedition: C.expeditionId,
    firstRestoration: progress.expeditionCompletions === 1
  });
  track("run_end", {
    mode: "expedition",
    expedition: C.expeditionId,
    outcome: "complete",
    seconds: Math.round(elapsed),
    planHash: PLAN_HASH
  });
  void telemetry.flush();
}

function painted(geometry: THREE.BufferGeometry, value: number): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const colour = new THREE.Color(value);
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    values.set([colour.r, colour.g, colour.b], index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return geometry;
}

function swimmer(value: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, .5, -1.2, -.7, 0, -.5, 0, -.4, -.5, .7, 0, -.5,
    -1.5, 0, .2, 0, .15, .55, 1.5, 0, .2, -.5, 0, .5, 0, 0, 1.5, .5, 0, .5
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2, 3, 2, 5, 3, 5, 6, 2, 7, 8, 2, 8, 9]);
  geometry.computeVertexNormals();
  return painted(geometry, value);
}

class Layer {
  readonly group = new THREE.Group();
  private readonly glow = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: .92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  private readonly dark = new THREE.MeshBasicMaterial({
    color: 0x190a2d,
    transparent: true,
    opacity: .78,
    depthWrite: false,
    toneMapped: false
  });
  private readonly moteGeometry = new THREE.OctahedronGeometry(.22, 0);
  private readonly ringGeometry = new THREE.TorusGeometry(1.5, .08, 4, 16);
  private readonly neriGeometry = swimmer(0xaa78ff);
  private readonly miriGeometry = swimmer(0x70f3d8);
  private readonly duskGeometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -2.6),
      new THREE.Vector3(-.3, .15, -1.1),
      new THREE.Vector3(.35, -.1, .3),
      new THREE.Vector3(-.2, .1, 1.6),
      new THREE.Vector3(0, 0, 3)
    ]),
    16,
    .68,
    6,
    false
  );
  private readonly relicGeometry = painted(new THREE.IcosahedronGeometry(.68, 1), 0xffd46f);
  private readonly portalGeometry = painted(new THREE.TorusGeometry(3.1, .18, 4, 22), 0x83f3ff);
  private readonly motes = new THREE.InstancedMesh(this.moteGeometry, this.glow, C.collectibles.motePool);
  private readonly rings = new THREE.InstancedMesh(this.ringGeometry, this.glow, 3);
  private readonly neri = new THREE.Mesh(this.neriGeometry, this.glow);
  private readonly miri = new THREE.Mesh(this.miriGeometry, this.glow);
  private readonly dusk = new THREE.Mesh(this.duskGeometry, this.dark);
  private readonly relic = new THREE.Mesh(this.relicGeometry, this.glow);
  private readonly portal = new THREE.Mesh(this.portalGeometry, this.glow);
  private readonly matrix = new THREE.Matrix4();
  private readonly colour = new THREE.Color();
  private readonly origins = new Map<Kind, number>();
  private readonly resolved = new Set<number>();
  private readonly rescue = new Set<number>();
  private readonly breaks = new Set<number>();
  private kind: Kind | null = null;
  private expeditionElapsed = 0;
  private lastDistance = 0;
  private moteOrigin = 16;
  private nextMiss = 0;
  private chain = 0;
  private bestChain = 0;
  private relicFound = false;
  private relicDone = false;
  private raceGap = 0;
  private raceDone = false;
  private chaseGap = C.chase.initialGapUnits;
  private chaseDone = false;
  private portalDistance: number | null = null;

  constructor(private readonly view: GameView) {
    this.group.add(this.motes, this.rings, this.neri, this.miri, this.dusk, this.relic, this.portal);
    this.group.traverse((object) => {
      object.userData["hideInArtMask"] = true;
      object.userData["version41Presentation"] = true;
    });
    this.view.scene.add(this.group);
    for (const mesh of [this.motes, this.rings]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    this.neri.visible = this.miri.visible = this.dusk.visible = this.relic.visible = this.portal.visible = false;
    this.rings.count = 0;
    const triangles = Math.ceil(
      (this.moteGeometry.getIndex()?.count ?? this.moteGeometry.getAttribute("position").count) / 3 * C.collectibles.motePool +
      (this.ringGeometry.getIndex()?.count ?? this.ringGeometry.getAttribute("position").count) +
      (this.duskGeometry.getIndex()?.count ?? this.duskGeometry.getAttribute("position").count) / 3
    );
    if (
      7 > C.budgets.maxAdditionalDrawCalls ||
      triangles > C.budgets.maxAdditionalTriangles ||
      2 > C.budgets.maxAdditionalMaterials
    ) {
      throw new Error("Version 41 additive render budget exceeded.");
    }
    const hud = element("v41-hud");
    hud?.setAttribute("data-plan-hash", PLAN_HASH);
    hud?.setAttribute("data-additional-draw-calls", "7");
    hud?.setAttribute("data-additional-triangles", String(triangles));
    hud?.setAttribute("data-additional-materials", "2");
  }

  show(value: boolean): void { this.group.visible = value; }

  update(sim: SimState, frame: number): void {
    const previousElapsed = this.expeditionElapsed;
    // Advance from active render time rather than rendered-frame count. The core
    // lifecycle resets frame delta after backgrounding/context recovery, so a
    // slow but active device must not turn this three-minute Expedition into a
    // much longer session. A bounded 1.25-second step still rejects extreme
    // debugger/OS stalls while allowing the 30 fps floor and software-rendered
    // CI to measure real elapsed play time correctly.
    this.expeditionElapsed += Math.max(0, Math.min(frame, 1.25)) * qaScale();
    const elapsed = this.expeditionElapsed;
    for (const crossed of S) {
      if (crossed.startSec > previousElapsed && crossed.startSec <= elapsed) {
        showSegment(crossed.kind, Math.min(crossed.startSec, C.durationSec));
      }
    }
    const segment = segmentAt(elapsed);
    if (sim.forwardDistance + 1 < this.lastDistance) {
      this.origins.set(segment.kind, sim.forwardDistance);
      this.moteOrigin = sim.forwardDistance + 16;
      this.nextMiss = 0;
      this.resolved.clear();
      this.chain = 0;
      this.portalDistance = null;
      text("v41-chain", `Chain 0 · Best ${this.bestChain}`);
    }
    this.lastDistance = sim.forwardDistance;
    if (segment.kind !== this.kind) {
      this.kind = segment.kind;
      this.origins.set(segment.kind, sim.forwardDistance);
      showSegment(segment.kind, Math.min(elapsed, C.durationSec));
    }
    this.updateMotes(sim, elapsed);
    this.updateRelic(sim, elapsed, frame);
    this.updateActors(sim, elapsed);
    if (segment.kind === "return-moonwell") this.updateFinish(sim, elapsed, frame);
  }


  private updateMotes(sim: SimState, elapsed: number): void {
    const spacing = C.collectibles.moteSpacingUnits;
    const first = Math.max(0, Math.floor((sim.forwardDistance - this.moteOrigin) / spacing) - 2);
    for (let slot = 0; slot < C.collectibles.motePool; slot++) {
      const sequence = first + slot;
      const distance = this.moteOrigin + sequence * spacing;
      const visible = !this.resolved.has(sequence) &&
        distance > sim.forwardDistance - C.presentation.maxVisibleBehindUnits &&
        distance < sim.forwardDistance + C.presentation.maxVisibleAheadUnits;
      const scale = visible ? C.presentation.moteScale * (1 + Math.sin(elapsed * 3 + sequence) * .12) : TINY;
      this.matrix.compose(
        new THREE.Vector3(moteX(sequence), .25 + Math.sin(sequence * .4) * .3, -distance),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      this.motes.setMatrixAt(slot, this.matrix);
      this.motes.setColorAt(slot, this.colour.setHSL(.12 + sequence % 4 * .012, .95, .66));
    }
    this.motes.instanceMatrix.needsUpdate = true;
    if (this.motes.instanceColor) this.motes.instanceColor.needsUpdate = true;
    const near = Math.max(0, Math.round((sim.forwardDistance - this.moteOrigin) / spacing));
    for (let sequence = Math.max(0, near - 2); sequence <= near + 2; sequence++) {
      if (
        !this.resolved.has(sequence) &&
        hit(
          sim.forwardDistance,
          sim.lateralPosition,
          this.moteOrigin + sequence * spacing,
          moteX(sequence),
          C.collectibles.moteCollectRadius
        )
      ) {
        this.resolved.add(sequence);
        this.chain += 1;
        this.bestChain = Math.max(this.bestChain, this.chain);
        text("v41-chain", `Chain ${this.chain} · Best ${this.bestChain}`);
        if (this.chain % 8 === 0) toast(`${this.chain} Lumen Chain`);
      }
    }
    while (this.moteOrigin + this.nextMiss * spacing < sim.forwardDistance - C.collectibles.moteMissDistanceUnits) {
      if (!this.resolved.has(this.nextMiss)) {
        this.resolved.add(this.nextMiss);
        this.chain = 0;
        text("v41-chain", `Chain 0 · Best ${this.bestChain}`);
      }
      this.nextMiss += 1;
    }
  }

  private updateRelic(sim: SimState, elapsed: number, frame: number): void {
    const origin = this.origins.get("relic-fork");
    const active = this.kind === "relic-fork" && origin !== undefined && !this.relicDone;
    this.relic.visible = active;
    if (!active || origin === undefined) return;
    const distance = origin + C.collectibles.relicAheadUnits;
    this.relic.position.set(4.15, .7, -distance);
    if (!reduced()) this.relic.rotation.y += frame * 1.7;
    this.relic.scale.setScalar(reduced() ? 1 : 1 + Math.sin(elapsed * 4) * .1);
    if (hit(sim.forwardDistance, sim.lateralPosition, distance, 4.15, C.collectibles.relicCollectRadius)) {
      this.relicFound = this.relicDone = true;
      this.relic.visible = false;
      text("v41-relic", "Moonseed Fragment found");
      toast("Moonseed Fragment discovered");
    } else if (sim.forwardDistance > distance + 4) {
      this.relicDone = true;
      this.relic.visible = false;
      text("v41-relic", "Relic route missed");
    }
  }

  private ring(index: number, distance: number, lateral: number, visible: boolean, value: number): void {
    const scale = visible ? 1 : TINY;
    this.matrix.compose(
      new THREE.Vector3(lateral, .4, -distance),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      new THREE.Vector3(scale, scale, scale)
    );
    this.rings.setMatrixAt(index, this.matrix);
    this.rings.setColorAt(index, this.colour.set(value));
  }

  private updateActors(sim: SimState, elapsed: number): void {
    const rescueOrigin = this.origins.get("rescue-miri");
    const rescueActive = this.kind === "rescue-miri" && rescueOrigin !== undefined;
    const chaseOrigin = this.origins.get("duskmaw-chase");
    const chaseSegment = S.find((entry) => entry.kind === "duskmaw-chase");
    const chaseActive = this.kind === "duskmaw-chase" && chaseOrigin !== undefined && chaseSegment;
    this.rings.count = rescueActive || chaseActive ? 3 : 0;

    if (rescueActive && rescueOrigin !== undefined) {
      const laterals = [-3.25, 3.25, 0];
      C.collectibles.rescueAheadUnits.forEach((ahead, index) => {
        const distance = rescueOrigin + ahead;
        const lateral = laterals[index] ?? 0;
        this.ring(index, distance, lateral, !this.rescue.has(index), 0x72f4d8);
        if (
          !this.rescue.has(index) &&
          hit(sim.forwardDistance, sim.lateralPosition, distance, lateral, C.collectibles.rescueCollectRadius)
        ) {
          this.rescue.add(index);
          text("v41-rescue", this.rescue.size === 3 ? "Miri rescued" : `Miri ${this.rescue.size}/3`);
          if (this.rescue.size === 3) toast("Miri is free");
        }
      });
    } else if (chaseActive && chaseOrigin !== undefined && chaseSegment) {
      const laterals = [-3.1, 3.1, 2.6];
      C.collectibles.currentBreakAheadUnits.forEach((ahead, index) => {
        const distance = chaseOrigin + ahead;
        const lateral = laterals[index] ?? 0;
        this.ring(index, distance, lateral, !this.breaks.has(index), 0x75f5ff);
        if (
          !this.breaks.has(index) &&
          hit(sim.forwardDistance, sim.lateralPosition, distance, lateral, C.collectibles.currentBreakCollectRadius)
        ) {
          this.breaks.add(index);
        }
      });
      const time = Math.max(0, Math.min(30, elapsed - chaseSegment.startSec));
      this.chaseGap = Math.max(
        C.chase.minimumGapUnits,
        Math.min(
          C.chase.maximumGapUnits,
          C.chase.initialGapUnits + this.breaks.size * C.chase.breakGainUnits - time * C.chase.closingUnitsPerSec
        )
      );
      this.dusk.visible = true;
      this.dusk.position.set(
        sim.lateralPosition * .34 + (reduced() ? 0 : Math.sin(elapsed * 2.4) * .45),
        C.presentation.duskmawHeight,
        -(sim.forwardDistance - this.chaseGap)
      );
      this.dusk.rotation.y = Math.PI;
      this.dusk.scale.setScalar(1.15);
      text("v41-chase", `Duskmaw gap ${this.chaseGap.toFixed(1)} · ${this.breaks.size}/3`);
    } else {
      this.dusk.visible = false;
    }
    if (this.rings.count) {
      this.rings.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }

    this.miri.visible = rescueActive || this.rescue.size === 3;
    if (this.miri.visible) {
      this.miri.position.set(
        C.presentation.miriLateralOffset,
        .15 + (reduced() ? 0 : Math.sin(elapsed * 2.2) * .17),
        -(this.rescue.size === 3 ? sim.forwardDistance - 2.5 : (rescueOrigin ?? sim.forwardDistance) + 235)
      );
      this.miri.rotation.y = Math.PI;
      this.miri.scale.set(.9, .65, .82);
    }

    const raceSegment = S.find((entry) => entry.kind === "race-neri");
    const raceOrigin = this.origins.get("race-neri");
    const raceActive = this.kind === "race-neri" && raceSegment && raceOrigin !== undefined;
    this.neri.visible = (this.kind === "follow-light" && elapsed >= 12) || Boolean(raceActive) || this.kind === "return-moonwell";
    if (this.neri.visible) {
      if (raceActive && raceSegment && raceOrigin !== undefined) {
        this.raceGap = sim.forwardDistance - (
          raceOrigin + C.race.targetSpeedUnitsPerSec * Math.max(0, Math.min(30, elapsed - raceSegment.startSec))
        );
        text(
          "v41-race",
          this.raceGap >= 0
            ? `Ahead of Neri ${Math.abs(this.raceGap).toFixed(1)}`
            : `Neri ahead ${Math.abs(this.raceGap).toFixed(1)}`
        );
      }
      const gap = raceActive
        ? Math.max(-C.race.visualGapLimitUnits, Math.min(C.race.visualGapLimitUnits, this.raceGap))
        : this.kind === "return-moonwell" ? 4 : -7;
      this.neri.position.set(C.presentation.rivalLateralOffset, .2, -(sim.forwardDistance - gap));
      this.neri.rotation.y = Math.PI;
      this.neri.scale.set(.84, .72, .92);
    }
    if (!this.raceDone && raceSegment && elapsed >= raceSegment.endSec) {
      this.raceDone = true;
      toast(this.raceGap >= 0 ? "You edged ahead of Neri" : "Neri wins—rematch ready");
    }
    if (!this.chaseDone && chaseSegment && elapsed >= chaseSegment.endSec) {
      this.chaseDone = true;
      toast(this.chaseGap >= C.chase.successGapUnits ? "Duskmaw falls behind" : "The guardian guides Glowfin home");
    }
  }

  private updateFinish(sim: SimState, elapsed: number, frame: number): void {
    if (this.portalDistance === null) this.portalDistance = sim.forwardDistance + C.presentation.finishAheadUnits;
    this.portal.visible = true;
    this.portal.position.set(0, 1.3, -this.portalDistance);
    this.portal.rotation.x = Math.PI / 2;
    if (!reduced()) this.portal.rotation.z += frame * .55;
    if (
      elapsed >= C.durationSec ||
      (sim.forwardDistance >= this.portalDistance - .8 && Math.abs(sim.lateralPosition) <= 3.1)
    ) {
      finish({
        chain: this.bestChain,
        relic: this.relicFound,
        rescue: this.rescue.size,
        race: this.raceGap,
        breaks: this.breaks.size,
        chase: this.chaseGap
      }, Math.min(elapsed, C.durationSec));
    }
  }

  dispose(): void {
    this.view.scene.remove(this.group);
    for (const geometry of [
      this.moteGeometry,
      this.ringGeometry,
      this.neriGeometry,
      this.miriGeometry,
      this.duskGeometry,
      this.relicGeometry,
      this.portalGeometry
    ]) geometry.dispose();
    this.glow.dispose();
    this.dark.dispose();
  }
}

const layers = new WeakMap<GameView, Layer>();
const originalRender = GameView.prototype.render;
const originalDispose = GameView.prototype.dispose;
GameView.prototype.render = function version41Render(
  sim: SimState,
  gates: readonly Gate[],
  light: number,
  elapsed: number,
  frame: number,
  ghost: SimState | null = null,
  events: readonly ActiveLivingWorldEvent[] = []
): void {
  const active = document.documentElement.dataset["glowfinMode"] === MODE &&
    element("moonwell-hub")?.dataset["active"] !== "true";
  let layer = layers.get(this);
  if (active) {
    if (!layer) {
      layer = new Layer(this);
      layers.set(this, layer);
    }
    layer.show(true);
    layer.update(sim, frame);
  } else {
    layer?.show(false);
  }
  originalRender.call(this, sim, gates, light, elapsed, frame, ghost, events);
};
GameView.prototype.dispose = function version41Dispose(): void {
  layers.get(this)?.dispose();
  layers.delete(this);
  originalDispose.call(this);
};

function renderAtlas(): void {
  progress = load();
  text(
    "v41-restoration",
    progress.moonWellRestored
      ? "Moonseed Fountain restored · its light welcomes future Expeditions."
      : "Complete The Missing Moonseed to awaken the first restoration."
  );
  const list = element("v41-atlas-list");
  if (list) {
    list.innerHTML = RELICS.map(([id, name, clue]) => {
      const found = progress.discoveredRelics.includes(id);
      return `<article class="v41-relic" data-found="${found}"><span><strong>${found ? name : "Undiscovered relic"}</strong><small>${clue}</small></span><b>${found ? "FOUND" : "LOCKED"}</b></article>`;
    }).join("");
  }
}

function install(): void {
  if (element("v41-entry")) return;
  const style = document.createElement("style");
  style.textContent = `#v41-entry{width:100%;margin-top:9px;padding:11px;display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;border:1px solid #ffd47899;border-radius:18px;background:#174866ee;color:#fff;text-align:left}#v41-entry i{font-size:24px;color:#ffd46e}#v41-entry strong,#v41-entry span{display:block}#v41-entry strong{color:#fff1bc;font-size:15px}#v41-entry span{color:#dff6ffcc;font-size:12px}#v41-entry b{font-size:10px;color:#ffe5a5}#v41-hud{position:fixed;left:50%;top:max(82px,calc(var(--glowfin-safe-top) + 70px));z-index:6;width:min(390px,calc(100vw - 28px));display:none;transform:translateX(-50%);pointer-events:none}#v41-hud[data-active=true]{display:block}.v41-card{padding:9px 11px;border:1px solid #ffda7d77;border-radius:15px;background:#07182deb}#v41-segment-title{color:#fff1ba;font-size:14px}#v41-timer,#v41-objective{color:#bfefff;font-size:12px}#v41-timer{float:right}#v41-objective{margin:4px 0}.v41-bar{height:4px;background:#ffffff22}.v41-bar div{height:100%;background:#68eaff}.v41-stats{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.v41-stats span{padding:3px 5px;border-radius:8px;background:#02121f;color:#dff8ff;font-size:10px}#v41-toast{position:fixed;left:50%;bottom:110px;z-index:8;display:none;transform:translateX(-50%);padding:8px 11px;border-radius:16px;background:#0b1c36ed;color:#fff0b7;font-size:12px;font-weight:800}#v41-toast[data-active=true]{display:block}#v41-complete{position:fixed;inset:0;z-index:30;display:none;place-items:center;padding:18px;background:#030713e8}#v41-complete[data-active=true]{display:grid}.v41-done{width:min(380px,100%);padding:18px;border:1px solid #ffdb8477;border-radius:22px;background:#17364f;text-align:center}.v41-done h2{color:#fff2bb}.v41-done p{color:#def7ff;font-size:13px}#v41-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:10px 0}#v41-result-grid div{padding:7px;border-radius:10px;background:#031426}#v41-result-grid strong,#v41-result-grid span{display:block}#v41-result-grid span{font-size:10px}.v41-actions{display:grid;gap:6px}.v41-actions button,.v41-back{min-height:44px;border:1px solid #91e7ff55;border-radius:13px;background:#071c31;color:#fff;font-weight:800}#v41-rematch{background:#146f9b}.v41-relic{display:flex;justify-content:space-between;padding:8px;margin:6px 0;border:1px solid #8fe5ff33;border-radius:12px}.v41-relic strong,.v41-relic small{display:block}.v41-relic small{font-size:10px}html[data-glowfin-high-contrast=true] .v41-card{border-width:2px;background:#000c19}`;
  document.head.append(style);
  document.body.insertAdjacentHTML("beforeend", `<aside id="v41-hud" data-active="false"><div class="v41-card"><strong id="v41-segment-title">The Missing Moonseed</strong><span id="v41-timer">3:00</span><p id="v41-objective">Follow the golden current.</p><div class="v41-bar"><div id="v41-progress-fill"></div></div><div class="v41-stats"><span id="v41-chain">Chain 0</span><span id="v41-relic">Relic not found</span><span id="v41-rescue">Miri 0/3</span><span id="v41-race">Neri nearby</span><span id="v41-chase">Current calm</span></div></div></aside><div id="v41-toast" role="status"></div><section id="v41-complete" data-active="false"><div class="v41-done"><h2>Moonseed restored</h2><p>Glowfin, Neri and Miri return together. The Moon Well carries a new living light.</p><div id="v41-result-grid"></div><div class="v41-actions"><button id="v41-rematch">Dive Again · Missing Moonseed</button><button id="v41-return">Return to the Moon Well</button></div></div></section>`);
  const entry = document.createElement("button");
  entry.id = "v41-entry";
  entry.type = "button";
  entry.innerHTML = `<i>✦</i><span><strong>The Missing Moonseed</strong><span>3-minute Expedition · collect · rescue · race · escape</span></span><b>NEW</b>`;
  element("moonwell-dive")?.insertAdjacentElement("afterend", entry);
  const nav = document.querySelector("#moonwell-home .moonwell-nav");
  const shell = document.querySelector("#moonwell-hub .moonwell-shell");
  nav?.insertAdjacentHTML("beforeend", `<button id="v41-atlas-open"><strong>Relic Atlas</strong><span>Six Moon-Garden discoveries</span></button>`);
  shell?.insertAdjacentHTML("beforeend", `<section id="v41-atlas" class="moonwell-view moonwell-panel" hidden><div class="moonwell-panel-heading"><button class="v41-back">Back</button><div><span>Moon-Garden discoveries</span><h2>Relic Atlas</h2></div></div><p id="v41-restoration"></p><div id="v41-atlas-list"></div></section>`);
  const atlas = element("v41-atlas");
  element("v41-atlas-open")?.addEventListener("click", () => {
    element("moonwell-home")?.setAttribute("hidden", "");
    document.querySelectorAll<HTMLElement>("#moonwell-hub .moonwell-panel").forEach((panel) => {
      panel.hidden = panel !== atlas;
    });
    if (atlas) atlas.hidden = false;
    renderAtlas();
  });
  atlas?.querySelector(".v41-back")?.addEventListener("click", () => {
    atlas.hidden = true;
    element("moonwell-home")?.removeAttribute("hidden");
  });
  renderAtlas();
  element("moonwell-hub")?.setAttribute("data-v41-restored", String(progress.moonWellRestored));

  const start = (): void => {
    playing = true;
    finished = false;
    document.documentElement.dataset["glowfinMode"] = MODE;
    element("v41-hud")?.setAttribute("data-active", "true");
    element("v41-complete")?.setAttribute("data-active", "false");
    document.documentElement.dataset["glowfinExpeditionRecoveries"] = "0";
    element("v41-hud")?.setAttribute("data-segment-history", "");
    track("tap_to_dive", {
      mode: "expedition",
      expedition: C.expeditionId,
      contentVersion: 41,
      planHash: PLAN_HASH
    });
    track("run_start", {
      mode: "expedition",
      expedition: C.expeditionId,
      contentVersion: 41,
      planHash: PLAN_HASH
    });
    (element("moonwell-dive") as HTMLButtonElement | null)?.click();
  };
  entry.addEventListener("click", (event) => {
    event.stopPropagation();
    start();
  });
  addEventListener("glowfin:v41-current-recovered", () => {
    toast("Moon guardian restores your Light");
  });
  element("v41-rematch")?.addEventListener("click", () => {
    sessionStorage.setItem(AUTO, "1");
    location.reload();
  });
  element("v41-return")?.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("expedition");
    url.searchParams.delete("v41qa");
    location.assign(url.toString());
  });
  addEventListener("pagehide", () => {
    if (playing && !finished) {
      track("run_end", {
        mode: "expedition",
        expedition: C.expeditionId,
        outcome: "abandoned"
      });
    }
    void telemetry.flush();
  });
  const queryStart = new URLSearchParams(location.search).get("expedition") === C.expeditionId;
  const rematch = sessionStorage.getItem(AUTO) === "1";
  if (rematch) sessionStorage.removeItem(AUTO);
  if (queryStart || rematch) {
  let attempts = 0;
  const autoStart = (): void => {
    const hub = element("moonwell-hub");
    if (
      document.documentElement.dataset["glowfinRuntime"] === "running" &&
      hub?.dataset["active"] === "true"
    ) {
      start();
      return;
    }
    attempts += 1;
    if (attempts < 200) setTimeout(autoStart, 50);
  };
  setTimeout(autoStart, 0);
}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
