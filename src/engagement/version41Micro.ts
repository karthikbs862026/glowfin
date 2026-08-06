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
import {
  VERSION41_BREAK_LANES,
  VERSION41_CHASE_PATTERNS,
  VERSION41_EXPERIENCE_REVISION,
  VERSION41_PLAN_HASH,
  VERSION41_RESCUE_LANES,
  VERSION41_SEGMENT_ORDER,
  completionMarks,
  shouldAdvanceChapter,
  type Version41SegmentKind
} from "./version41Plan";
import { VERSION41_CHARACTER_PORTRAITS } from "./version41Characters";

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

type Kind = Version41SegmentKind;
type Result = {
  chain: number;
  relic: boolean;
  rescue: number;
  raceGates: number;
  race: number;
  breaks: number;
  chase: number;
  portal: boolean;
  recoveries: number;
  assists: number;
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
  completionMarks: string[];
  cleanCompletions: number;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const CHARACTER_ASSETS = VERSION41_CHARACTER_PORTRAITS;
const GUIDANCE: Record<Kind, {
  character: keyof typeof CHARACTER_ASSETS;
  characterLabel: string;
  action: string;
  direction: string;
}> = {
  "follow-light": { character: "neri", characterLabel: "Neri · Rival guide", action: "FOLLOW THE GOLD", direction: "◆" },
  "relic-fork": { character: "neri", characterLabel: "Neri · Rival guide", action: "FRAGMENT · RIGHT", direction: "RIGHT →" },
  "rescue-miri": { character: "miri", characterLabel: "Miri · Rescue target", action: "RESCUE LIGHT 1/3", direction: "← LEFT" },
  "race-neri": { character: "neri", characterLabel: "Neri · Rival racer", action: "HIT THREE RACE GATES", direction: "FLOW ↑" },
  "duskmaw-chase": { character: "duskmaw", characterLabel: "Duskmaw · Shadow leviathan", action: "CURRENT BREAK 1/3", direction: "← LEFT" },
  "return-moonwell": { character: "miri", characterLabel: "Miri · Safe at last", action: "ENTER THE PORTAL", direction: "CENTER ◆" }
};

function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

const PLAN_HASH = VERSION41_PLAN_HASH;

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
  recentClaims: [],
  completionMarks: [],
  cleanCompletions: 0
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
    const valid = envelope.envelopeVersion === 1 &&
      payload?.schemaVersion === 1 &&
      Number.isInteger(payload.revision) &&
      Array.isArray(payload.discoveredRelics) &&
      Array.isArray(payload.recentClaims) &&
      envelope.checksum === hash(JSON.stringify(payload));
    return valid && payload
      ? {
        ...fresh(),
        ...payload,
        completionMarks: Array.isArray(payload.completionMarks) ? payload.completionMarks : [],
        cleanCompletions: Number.isInteger(payload.cleanCompletions) ? payload.cleanCompletions : 0
      }
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
  const earnedMarks = completionMarks({
    portalReached: result.portal,
    rescueLights: result.rescue,
    raceGates: result.raceGates,
    raceGap: result.race,
    currentBreaks: result.breaks,
    relicFound: result.relic,
    bestChain: result.chain,
    recoveries: result.recoveries,
    assists: result.assists
  }).filter((mark) => mark.earned).map((mark) => mark.id);
  const storedMarks = new Set([...current.completionMarks, ...earnedMarks]);
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
    recentClaims: [...claims].slice(-64),
    completionMarks: [...storedMarks],
    cleanCompletions: current.cleanCompletions + (earnedMarks.includes("clean-current") ? 1 : 0)
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
let focusTimer = 0;

function track(name: TelemetryEventName, payload: TelemetryPayload): void {
  telemetry.setConsent(baseProgress.load().progress.telemetryConsent);
  telemetry.track(name, payload, runId);
}
function element(id: string): HTMLElement | null { return document.getElementById(id); }
function text(id: string, value: string): void {
  const node = element(id);
  if (node) node.textContent = value;
}
function action(title: string, direction: string): void {
  text("v41-action", title);
  text("v41-direction", direction);
}
function reduced(): boolean {
  return document.documentElement.dataset["glowfinReducedMotion"] === "true" ||
    matchMedia("(prefers-reduced-motion:reduce)").matches;
}
function qaScale(): number {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return local && new URLSearchParams(location.search).get("v41qa") === "1" ? C.qaTimeScale : 1;
}
function qaHeld(): boolean {
  return qaScale() !== 1 &&
    document.documentElement.dataset["glowfinV41QaHold"] === "true";
}
function hit(distance: number, lateral: number, targetDistance: number, targetLateral: number, radius: number): boolean {
  const forward = distance - targetDistance;
  const side = lateral - targetLateral;
  return forward * forward + side * side <= radius * radius;
}
function moteX(index: number): number {
  return Math.sin(index * 0.58) * 2.65 + Math.sin(index * 0.21 + 0.8) * 0.82;
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
  const guidance = GUIDANCE[kind] ?? GUIDANCE["follow-light"];
  action(guidance.action, guidance.direction);
  text("v41-character-name", guidance.characterLabel);
  const portrait = element("v41-character-portrait") as HTMLImageElement | null;
  if (portrait) {
    portrait.src = CHARACTER_ASSETS[guidance.character];
    portrait.alt = guidance.characterLabel.split(" · ")[0] ?? guidance.character;
  }
  const focus = element("v41-character-focus");
  if (focus) {
    focus.dataset.active = "true";
    focus.dataset.character = guidance.character;
  }
  text("v41-focus-name", guidance.character.toUpperCase());
  const focusPortrait = element("v41-focus-portrait") as HTMLImageElement | null;
  if (focusPortrait) {
    focusPortrait.src = CHARACTER_ASSETS[guidance.character];
    focusPortrait.alt = portrait?.alt ?? guidance.character;
  }
  clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => focus?.setAttribute("data-active", "false"), 2600);
  document.documentElement.dataset["glowfinV41Segment"] = kind;
  const remaining = Math.max(0, C.durationSec - elapsed);
  text("v41-timer", `${Math.floor(remaining / 60)}:${Math.floor(remaining % 60).toString().padStart(2, "0")}`);
  const fill = element("v41-progress-fill");
  if (fill) fill.style.width = `${Math.min(100, elapsed / C.durationSec * 100)}%`;
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
  const marks = completionMarks({
    portalReached: result.portal,
    rescueLights: result.rescue,
    raceGates: result.raceGates,
    raceGap: result.race,
    currentBreaks: result.breaks,
    relicFound: result.relic,
    bestChain: result.chain,
    recoveries: result.recoveries,
    assists: result.assists
  });
  if (!marks.find((mark) => mark.id === "mission-complete")?.earned) return;
  finished = true;
  playing = false;
  progress = save(result);
  element("moonwell-hub")?.setAttribute("data-v41-restored", "true");
  element("v41-hud")?.setAttribute("data-state", "complete");
  const grid = element("v41-result-grid");
  if (grid) {
    grid.innerHTML = marks.map((mark) => (
      `<div data-earned="${mark.earned}"><strong>${mark.earned ? "✓" : "◇"}</strong><span>${mark.label}</span></div>`
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
  window.dispatchEvent(new CustomEvent("glowfin:v41-complete", {
    detail: { result, marks, revision: VERSION41_EXPERIENCE_REVISION }
  }));
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
  private readonly moteGeometry = new THREE.OctahedronGeometry(.34, 0);
  private readonly ringGeometry = new THREE.TorusGeometry(2.25, .16, 6, 24);
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
  private readonly raceGates = new Set<number>();
  private kind: Kind | null = null;
  private chapterIndex = 0;
  private stageStartedAt = 0;
  private expeditionElapsed = 0;
  private lastDistance = 0;
  private moteOrigin = 16;
  private nextMiss = 0;
  private chain = 0;
  private bestChain = 0;
  private relicFound = false;
  private relicDone = false;
  private raceGap = 0;
  private chaseGap = C.chase.initialGapUnits;
  private rescueTargetDistance: number | null = null;
  private breakTargetDistance: number | null = null;
  private raceTargetDistances: number[] = [];
  private chaseMisses = 0;
  private guardianShields = 1;
  private recoveries = 0;
  private assists = 0;
  private portalDistance: number | null = null;
  private portalReached = false;

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

  private stageSeconds(): number {
    return Math.max(0, this.expeditionElapsed - this.stageStartedAt);
  }

  private enterChapter(index: number, sim: SimState): void {
    const kind = VERSION41_SEGMENT_ORDER[index] as Kind | undefined;
    if (!kind) throw new Error("Version 41 encounter plan ended unexpectedly.");
    const automated = qaScale() !== 1;
    this.chapterIndex = index;
    this.kind = kind;
    this.stageStartedAt = this.expeditionElapsed;
    this.origins.set(kind, sim.forwardDistance);
    if (kind === "rescue-miri") this.rescueTargetDistance = sim.forwardDistance + (automated ? 20 : 92);
    if (kind === "race-neri") {
      this.raceTargetDistances = (automated ? [20, 40, 60] : [240, 480, 720])
        .map((offset) => sim.forwardDistance + offset);
    }
    if (kind === "duskmaw-chase") {
      this.breakTargetDistance = sim.forwardDistance + (automated ? 24 : 165);
      this.chaseGap = 8;
    }
    if (kind === "return-moonwell") {
      this.portalDistance = sim.forwardDistance + (automated ? 22 : C.presentation.finishAheadUnits);
    }
    showSegment(kind, this.expeditionElapsed);
  }

  private repositionAfterRunReset(sim: SimState): void {
    if (!this.kind) return;
    this.origins.set(this.kind, sim.forwardDistance);
    this.moteOrigin = sim.forwardDistance + 16;
    this.nextMiss = 0;
    this.resolved.clear();
    this.chain = 0;
    if (this.kind === "rescue-miri") this.rescueTargetDistance = sim.forwardDistance + 82;
    if (this.kind === "race-neri") {
      this.raceTargetDistances = [90, 180, 270].map((offset) => sim.forwardDistance + offset);
    }
    if (this.kind === "duskmaw-chase") this.breakTargetDistance = sim.forwardDistance + 112;
    if (this.kind === "return-moonwell") this.portalDistance = sim.forwardDistance + C.presentation.finishAheadUnits;
    text("v41-chain", `Chain 0 · Best ${this.bestChain}`);
  }

  update(sim: SimState, frame: number): void {
    // Loopback evidence may briefly hold the Adventure layer after an encounter
    // boundary so a slow software renderer captures that exact beat. This is
    // unreachable in production and never alters the underlying core lifecycle.
    if (qaHeld()) return;
    // Advance from active render time rather than rendered-frame count. The core
    // lifecycle resets frame delta after backgrounding/context recovery, so a
    // slow but active device must not turn this three-minute Expedition into a
    // much longer session. A bounded 1.25-second step still rejects extreme
    // debugger/OS stalls while allowing the 30 fps floor and software-rendered
    // CI to measure real elapsed play time correctly.
    this.expeditionElapsed += Math.max(0, Math.min(frame, 1.25)) * qaScale();
    const elapsed = this.expeditionElapsed;
    if (!this.kind) this.enterChapter(0, sim);
    if (sim.forwardDistance + 1 < this.lastDistance) {
      this.repositionAfterRunReset(sim);
    }
    this.lastDistance = sim.forwardDistance;
    this.applyQaRouteAssist(sim);
    this.updateMotes(sim, elapsed);
    this.updateActors(sim, elapsed);
    this.updateRelic(sim, elapsed, frame);
    if (this.kind === "return-moonwell") this.updateFinish(sim, frame);

    const activeKind = this.kind;
    if (!activeKind || !shouldAdvanceChapter(activeKind, {
      stageSeconds: this.stageSeconds(),
      bestChain: this.bestChain,
      relicResolved: this.relicDone,
      rescueLights: this.rescue.size,
      raceGates: this.raceGates.size,
      raceGap: this.raceGap,
      currentBreaks: this.breaks.size,
      portalReached: this.portalReached
    })) return;

    track("signature_obstacle", {
      content: "version41-plan-compliance",
      encounter: activeKind,
      phase: "complete",
      planHash: PLAN_HASH
    });
    if (this.chapterIndex >= VERSION41_SEGMENT_ORDER.length - 1) {
      finish({
        chain: this.bestChain,
        relic: this.relicFound,
        rescue: this.rescue.size,
        raceGates: this.raceGates.size,
        race: this.raceGap,
        breaks: this.breaks.size,
        chase: this.chaseGap,
        portal: this.portalReached,
        recoveries: this.recoveries,
        assists: this.assists
      }, elapsed);
      return;
    }
    this.enterChapter(this.chapterIndex + 1, sim);
  }

  private applyQaRouteAssist(sim: SimState): void {
    if (qaScale() === 1 || !this.kind) return;
    if (this.kind === "follow-light") {
      const sequence = Math.max(
        0,
        Math.round((sim.forwardDistance - this.moteOrigin) / C.collectibles.moteSpacingUnits)
      );
      sim.lateralPosition = moteX(sequence);
      return;
    }
    if (this.kind === "relic-fork") sim.lateralPosition = 4.15;
    if (this.kind === "rescue-miri") {
      sim.lateralPosition = VERSION41_RESCUE_LANES[this.rescue.size] ?? 0;
    }
    if (this.kind === "race-neri") sim.lateralPosition = Math.sin(this.raceGates.size * 1.8) * 2.2;
    if (this.kind === "duskmaw-chase") {
      const lane = VERSION41_BREAK_LANES[this.breaks.size] ?? 0;
      // The automated journey deliberately proves the one-shot Moon Shield
      // recovery before following the returning Current Break.
      sim.lateralPosition = this.recoveries === 0 ? -lane : lane;
    }
    if (this.kind === "return-moonwell") sim.lateralPosition = 0;
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
          qaScale() !== 1 ? spacing : C.collectibles.moteCollectRadius
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
    const distance = origin + (qaScale() !== 1 ? 22 : C.collectibles.relicAheadUnits);
    this.rings.count = 2;
    this.ring(0, distance, -2.55, true, 0x7defff);
    this.ring(1, distance, 4.15, true, 0xffd15f);
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.relic.position.set(4.15, .7, -distance);
    if (!reduced()) this.relic.rotation.y += frame * 1.7;
    this.relic.scale.setScalar(reduced() ? 1 : 1 + Math.sin(elapsed * 4) * .1);
    if (hit(
      sim.forwardDistance,
      sim.lateralPosition,
      distance,
      4.15,
      qaScale() !== 1 ? 24 : C.collectibles.relicCollectRadius
    )) {
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
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale)
    );
    this.rings.setMatrixAt(index, this.matrix);
    this.rings.setColorAt(index, this.colour.set(value));
  }

  private updateActors(sim: SimState, elapsed: number): void {
    const rescueActive = this.kind === "rescue-miri";
    const raceActive = this.kind === "race-neri";
    const chaseActive = this.kind === "duskmaw-chase";
    this.rings.count = 0;

    if (rescueActive && this.rescue.size < 3) {
      const index = this.rescue.size;
      const lateral = VERSION41_RESCUE_LANES[index] ?? 0;
      const distance = this.rescueTargetDistance ?? sim.forwardDistance + 92;
      this.rescueTargetDistance = distance;
      this.rings.count = 1;
      this.ring(0, distance, lateral, true, 0x72f4d8);
      if (hit(sim.forwardDistance, sim.lateralPosition, distance, lateral, qaScale() !== 1 ? 24 : 2)) {
        this.rescue.add(index);
        this.rescueTargetDistance = sim.forwardDistance + (qaScale() !== 1 ? 22 : 105);
        text("v41-rescue", this.rescue.size === 3 ? "Miri rescued ✓" : `Rescue Lights ${this.rescue.size}/3`);
        toast(this.rescue.size === 3 ? "Miri is free" : `Rescue Light ${this.rescue.size}/3`);
        const nextLane = VERSION41_RESCUE_LANES[this.rescue.size] ?? 0;
        action(
          this.rescue.size === 3 ? "MIRI IS FREE" : `RESCUE LIGHT ${this.rescue.size + 1}/3`,
          this.rescue.size === 3 ? "✓" : nextLane < 0 ? "← LEFT" : nextLane > 0 ? "RIGHT →" : "CENTER ◆"
        );
      } else if (sim.forwardDistance > distance + 5) {
        this.rescueTargetDistance = sim.forwardDistance + 82;
        toast(`${lateral < 0 ? "LEFT" : lateral > 0 ? "RIGHT" : "CENTER"} Rescue Light returns`);
      }
    }

    if (raceActive) {
      const origin = this.origins.get("race-neri") ?? sim.forwardDistance;
      this.raceGap = qaScale() !== 1
        ? 1 + this.raceGates.size
        : sim.forwardDistance - (origin + C.race.targetSpeedUnitsPerSec * this.stageSeconds());
      const index = this.raceGates.size;
      const distance = this.raceTargetDistances[index];
      const lateral = Math.sin(index * 1.8) * 2.2;
      if (index < 3 && distance !== undefined) {
        this.rings.count = 1;
        this.ring(0, distance, lateral, true, 0x83efff);
        if (hit(sim.forwardDistance, sim.lateralPosition, distance, lateral, qaScale() !== 1 ? 24 : 2.2)) {
          this.raceGates.add(index);
          text("v41-race", `${this.raceGates.size}/3 gates · ${this.raceGap >= 0 ? "Glowfin ahead" : "Neri ahead"}`);
          toast(`Race gate ${this.raceGates.size}/3`);
          action(this.raceGates.size === 3 ? "FINISH AHEAD OF NERI" : `RACE GATE ${this.raceGates.size + 1}/3`, "FLOW ↑");
        } else if (sim.forwardDistance > distance + 5) {
          this.raceTargetDistances[index] = sim.forwardDistance + 112;
          toast(`Race gate ${index + 1} returns ahead`);
        }
      }
    }

    if (chaseActive && this.breaks.size < 3) {
      const index = this.breaks.size;
      const lateral = VERSION41_BREAK_LANES[index] ?? 0;
      const distance = this.breakTargetDistance ?? sim.forwardDistance + 165;
      this.breakTargetDistance = distance;
      this.rings.count = 1;
      this.ring(0, distance, lateral, true, 0x75f5ff);
      const provingShield = qaScale() !== 1 && this.recoveries === 0;
      if (
        !provingShield &&
        hit(sim.forwardDistance, sim.lateralPosition, distance, lateral, qaScale() !== 1 ? 24 : 2.15)
      ) {
        this.breaks.add(index);
        this.breakTargetDistance = sim.forwardDistance + (qaScale() !== 1 ? 26 : 175);
        toast(this.breaks.size === 3 ? "Duskmaw loses the current" : `Current Break ${this.breaks.size}/3`);
        const nextLane = VERSION41_BREAK_LANES[this.breaks.size] ?? 0;
        action(
          this.breaks.size === 3 ? "DUSKMAW FALLS BACK" : `CURRENT BREAK ${this.breaks.size + 1}/3`,
          this.breaks.size === 3 ? "✓ ESCAPE" : nextLane < 0 ? "← LEFT" : "RIGHT →"
        );
      } else if (provingShield ? sim.forwardDistance >= distance : sim.forwardDistance > distance + 5) {
        this.chaseMisses += 1;
        this.breakTargetDistance = sim.forwardDistance + (qaScale() !== 1 ? 26 : 112);
        if (this.chaseMisses === 1 && this.guardianShields > 0) {
          this.guardianShields -= 1;
          this.recoveries += 1;
          document.documentElement.dataset["glowfinV41ShieldRecoveries"] = String(this.recoveries);
          dispatchEvent(new CustomEvent("glowfin:v41-guardian-recovery", {
            detail: { pattern: VERSION41_CHASE_PATTERNS[index] }
          }));
          toast("Moon Shield caught the shadow · keep swimming");
        } else {
          toast(`${VERSION41_CHASE_PATTERNS[index]} missed · Current Break returns`);
        }
      }
      this.chaseGap = Math.max(2.5, Math.min(24, 8 + this.breaks.size * 4.8 - this.stageSeconds() * .11));
    }

    this.dusk.visible = chaseActive;
    if (chaseActive) {
      const unsafeSide = (VERSION41_BREAK_LANES[this.breaks.size] ?? 0) >= 0 ? -1 : 1;
      this.dusk.position.set(unsafeSide * 2.85, 1.75, -(sim.forwardDistance - 4.3));
      this.dusk.rotation.y = Math.PI;
      this.dusk.scale.setScalar(1.45);
      text("v41-chase", `Current Breaks ${this.breaks.size}/3 · ${VERSION41_CHASE_PATTERNS[this.breaks.size] ?? "Escape"} · Gap ${this.chaseGap.toFixed(0)}m`);
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
        -(this.rescue.size === 3 ? sim.forwardDistance - 2.5 : sim.forwardDistance + 16)
      );
      this.miri.rotation.y = Math.PI;
      this.miri.scale.set(1.55, 1.25, 1.4);
    }

    this.neri.visible = this.kind === "follow-light" || raceActive || this.kind === "return-moonwell";
    if (this.neri.visible) {
      if (raceActive) {
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
      this.neri.scale.set(1.45, 1.25, 1.5);
    }
  }

  private updateFinish(sim: SimState, frame: number): void {
    if (this.portalDistance === null) this.portalDistance = sim.forwardDistance + C.presentation.finishAheadUnits;
    this.portal.visible = true;
    this.portal.position.set(0, 1.3, -this.portalDistance);
    if (!reduced()) this.portal.rotation.z += frame * .55;
    if (hit(
      sim.forwardDistance,
      sim.lateralPosition,
      this.portalDistance,
      0,
      qaScale() !== 1 ? 24 : 3.25
    )) {
      this.portalReached = true;
      toast("The Moon Well remembers its light");
      action("MOONSEED RESTORED", "✓");
    } else if (sim.forwardDistance > this.portalDistance + 6) {
      this.portalDistance = sim.forwardDistance + 155;
      this.assists += 1;
      toast("CENTER portal returns ahead");
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
  document.documentElement.dataset["glowfinV41ExperienceRevision"] = VERSION41_EXPERIENCE_REVISION;
  document.documentElement.dataset["glowfinV41PlanHash"] = PLAN_HASH;
  const style = document.createElement("style");
  style.textContent = `#v41-entry{width:100%;margin-top:9px;padding:11px;display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;border:1px solid #ffd47899;border-radius:18px;background:#174866ee;color:#fff;text-align:left}#v41-entry i{font-size:24px;color:#ffd46e}#v41-entry strong,#v41-entry span{display:block}#v41-entry strong{color:#fff1bc;font-size:15px}#v41-entry span{color:#dff6ffcc;font-size:12px}#v41-entry b{font-size:10px;color:#ffe5a5}#v41-hud{position:fixed;left:50%;top:max(82px,calc(var(--glowfin-safe-top) + 70px));z-index:6;width:min(390px,calc(100vw - 28px));display:none;transform:translateX(-50%);pointer-events:none}#v41-hud[data-active=true]{display:block}.v41-card{padding:9px 11px;border:1px solid #ffda7d77;border-radius:15px;background:#07182deb}#v41-segment-title{color:#fff1ba;font-size:14px}#v41-timer,#v41-objective{color:#bfefff;font-size:12px}#v41-timer{float:right}#v41-objective{margin:4px 0}.v41-bar{height:4px;background:#ffffff22}.v41-bar div{height:100%;background:#68eaff}.v41-stats{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.v41-stats span{padding:3px 5px;border-radius:8px;background:#02121f;color:#dff8ff;font-size:10px}#v41-toast{position:fixed;left:50%;bottom:110px;z-index:8;display:none;transform:translateX(-50%);padding:8px 11px;border-radius:16px;background:#0b1c36ed;color:#fff0b7;font-size:12px;font-weight:800}#v41-toast[data-active=true]{display:block}#v41-complete{position:fixed;inset:0;z-index:30;display:none;place-items:center;padding:18px;background:#030713e8}#v41-complete[data-active=true]{display:grid}.v41-done{width:min(380px,100%);padding:18px;border:1px solid #ffdb8477;border-radius:22px;background:#17364f;text-align:center}.v41-done h2{color:#fff2bb}.v41-done p{color:#def7ff;font-size:13px}#v41-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:10px 0}#v41-result-grid div{padding:7px;border-radius:10px;background:#031426}#v41-result-grid strong,#v41-result-grid span{display:block}#v41-result-grid span{font-size:10px}.v41-actions{display:grid;gap:6px}.v41-actions button,.v41-back{min-height:44px;border:1px solid #91e7ff55;border-radius:13px;background:#071c31;color:#fff;font-weight:800}#v41-rematch{background:#146f9b}.v41-relic{display:flex;justify-content:space-between;padding:8px;margin:6px 0;border:1px solid #8fe5ff33;border-radius:12px}.v41-relic strong,.v41-relic small{display:block}.v41-relic small{font-size:10px}html[data-glowfin-high-contrast=true] .v41-card{border-width:2px;background:#000c19}`;
  document.head.append(style);
  const clarityStyle = document.createElement("style");
  clarityStyle.textContent = `
    #v41-entry{min-height:205px!important;margin:0 0 10px!important;padding:14px!important;grid-template-columns:105px 1fr!important;border:2px solid #ffdc84c9!important;border-radius:24px!important;background:radial-gradient(circle at 10% 20%,#45dff04d,transparent 38%),linear-gradient(145deg,#0a5067fa,#362268fa)!important;box-shadow:0 18px 42px #0007,0 0 30px #ffd66c24!important}
    #v41-entry i{font-size:58px;text-align:center}#v41-entry strong{font-size:22px!important}#v41-entry b{grid-column:2;width:fit-content;margin-top:8px;padding:7px 10px;border-radius:999px;background:#ffd76c;color:#14233b;font-size:10px}
    #moonwell-dive{min-height:48px!important;opacity:.72}#moonwell-dive span{font-size:14px!important}
    #v41-briefing{position:fixed;inset:0;z-index:80;display:none;place-items:center;padding:18px;background:#020713f2}#v41-briefing[data-active=true]{display:grid}.v41-briefing-card{width:min(430px,100%);max-height:100%;overflow:auto;padding:20px;border:2px solid #ffdc84a8;border-radius:26px;background:linear-gradient(160deg,#0a4259,#30205e);box-shadow:0 25px 80px #0009}.v41-briefing-card h2{margin:4px 0;color:#fff0ae;font-size:29px}.v41-briefing-card p{color:#dcf7ff;line-height:1.45}.v41-control{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:center;padding:12px;border:1px solid #85ecff77;border-radius:16px;background:#031a30}.v41-control b{font-size:30px;color:#8ef3ff}.v41-route{display:grid;gap:7px;margin:12px 0}.v41-route span{padding:8px;border-radius:11px;background:#03152d;color:#e7f9ff;font-size:12px}.v41-briefing-actions{display:grid;grid-template-columns:1fr 2fr;gap:7px}.v41-briefing-actions button{min-height:49px;border:1px solid #8cecff66;border-radius:14px;background:#071b34;color:#fff;font-weight:900}#v41-briefing-start{background:linear-gradient(135deg,#168a9d,#6853b8)}
    #v41-hud{top:max(12px,var(--glowfin-safe-top));z-index:14}.v41-card{border:2px solid #ffdc8499;background:#031328f2;box-shadow:0 13px 36px #0007}.v41-command{display:grid;grid-template-columns:50px 1fr auto;gap:8px;align-items:center}.v41-command img{width:50px;height:50px;object-fit:contain;border-radius:50%;background:#123452}.v41-command small,.v41-command strong{display:block}.v41-command small{color:#91ecff;font-size:9px}.v41-command strong{font-size:17px!important}.v41-action{margin:7px 0;padding:8px;border:2px solid #ffdb78a8;border-radius:12px;background:#3d2b1266;text-align:center}.v41-action strong,.v41-action b{display:block}.v41-action strong{color:#fff0ae;font-size:16px}.v41-action b{margin-top:2px;color:#fff;font-size:12px}
    #v41-character-focus{position:fixed;left:50%;top:47%;z-index:18;width:min(290px,calc(100vw - 44px));display:none;grid-template-columns:125px 1fr;align-items:center;transform:translate(-50%,-50%);padding:8px;border:2px solid #8cecffc7;border-radius:24px;background:#061c37f5;box-shadow:0 20px 60px #0009,0 0 35px #55dfff44;pointer-events:none}#v41-character-focus[data-active=true]{display:grid}#v41-focus-portrait{width:125px;height:125px;object-fit:contain}#v41-focus-name{color:#fff0ad;font-size:29px;font-weight:950}#v41-character-focus[data-character=duskmaw]{border-color:#ff71bd;background:#31062ff7}
    #v41-character-comms{position:fixed;left:max(12px,var(--glowfin-safe-left));bottom:max(15px,var(--glowfin-safe-bottom));z-index:14;display:none;grid-template-columns:80px 1fr;gap:8px;align-items:center;width:min(340px,calc(100vw - 68px));padding:8px;border:1px solid #81eaff77;border-radius:18px;background:#03152dea;pointer-events:none}html[data-glowfin-mode=expedition-v41] #v41-character-comms{display:grid}#v41-character-comms img{width:80px;height:80px;object-fit:contain}#v41-character-name{color:#9cf1ff;font-size:11px;font-weight:950}#v41-character-line{color:#eefbff;font-size:12px}
    html[data-glowfin-mode=expedition-v41] #hud-top,html[data-glowfin-mode=expedition-v41] #hud-best,html[data-glowfin-mode=expedition-v41] #hud-meta,html[data-glowfin-mode=expedition-v41] #hud-ghost-gap,html[data-glowfin-mode=expedition-v41] #hud-build,html[data-glowfin-mode=expedition-v41] #hud-signature-cue,html[data-glowfin-mode=expedition-v41] #hud-momentum,html[data-glowfin-mode=expedition-v41] #hud-light{display:none!important}
    html[data-glowfin-v41-segment=duskmaw-chase]::after{content:"";position:fixed;inset:0;z-index:11;border:14px solid #ff3e9b55;box-shadow:inset 0 0 80px #66003f77;pointer-events:none}
    #v41-result-grid{grid-template-columns:1fr!important}#v41-result-grid div{display:grid;grid-template-columns:32px 1fr;align-items:center;text-align:left;border:1px solid #87eaff33}#v41-result-grid div[data-earned=true]{border-color:#ffdd7c99;background:#473617}
    #moonwell-hub[data-v41-restored=true] .moonwell-header::after{content:"MOONSEED FOUNTAIN RESTORED";display:block;width:fit-content;margin:6px auto;padding:5px 8px;border:1px solid #ffdc7c88;border-radius:999px;color:#ffecad;font-size:8px;font-weight:950}
    @media(max-height:700px){#v41-character-comms{display:none!important}.v41-stats{display:none}.v41-briefing-card{padding:14px}}
    @media(prefers-reduced-motion:reduce){#v41-character-focus{animation:none}}
  `;
  document.head.append(clarityStyle);
  document.body.insertAdjacentHTML("beforeend", `
    <section id="v41-briefing" data-active="false" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="v41-briefing-title"><div class="v41-briefing-card"><span>NEW STORY EXPEDITION · ABOUT 3 MINUTES</span><h2 id="v41-briefing-title">The Missing Moonseed</h2><p>Find the Fragment, rescue Miri, race Neri, escape Duskmaw, and restore the Moon Well.</p><div class="v41-control"><b>↔</b><span><strong>Your only control: drag left or right</strong><br>Glowfin swims forward. Large directions always show the next target.</span></div><div class="v41-route"><span><b>1 · FOLLOW GOLD</b> — take the Fragment on the RIGHT</span><span><b>2 · RESCUE MIRI</b> — LEFT, RIGHT, CENTER</span><span><b>3 · ESCAPE DUSKMAW</b> — hit three Current Breaks</span></div><div class="v41-briefing-actions"><button id="v41-briefing-back">Back</button><button id="v41-briefing-start">Begin the Expedition</button></div></div></section>
    <aside id="v41-hud" data-active="false" data-encounter-director="objective-gated-v2"><div class="v41-card"><div class="v41-command"><img id="v41-character-portrait" src="${CHARACTER_ASSETS.neri}" alt="Neri"><span><small id="v41-character-name">Neri · Rival guide</small><strong id="v41-segment-title">The Missing Moonseed</strong></span><span id="v41-timer">3:00</span></div><p id="v41-objective">Follow the golden current.</p><div class="v41-action"><strong id="v41-action">FOLLOW THE GOLD</strong><b id="v41-direction">◆</b></div><div class="v41-bar"><div id="v41-progress-fill"></div></div><div class="v41-stats"><span id="v41-chain">Chain 0</span><span id="v41-relic">Relic not found</span><span id="v41-rescue">Miri 0/3</span><span id="v41-race">Neri nearby</span><span id="v41-chase">Current calm</span></div></div></aside>
    <aside id="v41-character-focus" data-active="false" data-character="neri"><img id="v41-focus-portrait" src="${CHARACTER_ASSETS.neri}" alt="Neri"><strong id="v41-focus-name">NERI</strong></aside>
    <aside id="v41-character-comms"><img src="${CHARACTER_ASSETS.miri}" alt="Miri"><span><strong>MISSION ROUTE</strong><br><span id="v41-character-line">Follow the named target and large direction.</span></span></aside>
    <div id="v41-toast" role="status"></div><section id="v41-complete" data-active="false"><div class="v41-done"><span>The Missing Moonseed · Expedition complete</span><h2>Moonseed restored</h2><p>Glowfin, Neri and Miri return together. The Moon Well carries a new living light.</p><div id="v41-result-grid"></div><div class="v41-actions"><button id="v41-rematch">Dive Again · Missing Moonseed</button><button id="v41-return">Return to the Moon Well</button></div></div></section>`);
  const entry = document.createElement("button");
  entry.id = "v41-entry";
  entry.type = "button";
  entry.innerHTML = `<i>✦</i><span><strong>The Missing Moonseed</strong><span>Rescue Miri · race Neri · escape Duskmaw · restore the Moon Well</span></span><b>SEE MISSION · BEGIN</b>`;
  element("moonwell-dive")?.insertAdjacentElement("beforebegin", entry);
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
    document.documentElement.dataset["glowfinV41ShieldRecoveries"] = "0";
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
    event.preventDefault();
    event.stopPropagation();
    element("v41-briefing")?.setAttribute("data-active", "true");
    element("v41-briefing")?.setAttribute("aria-hidden", "false");
  });
  element("v41-briefing-start")?.addEventListener("click", () => {
    element("v41-briefing")?.setAttribute("data-active", "false");
    element("v41-briefing")?.setAttribute("aria-hidden", "true");
    start();
  });
  element("v41-briefing-back")?.addEventListener("click", () => {
    element("v41-briefing")?.setAttribute("data-active", "false");
    element("v41-briefing")?.setAttribute("aria-hidden", "true");
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
  document.documentElement.dataset["glowfinV41AutoStart"] = "waiting";
  const autoStart = (): void => {
    const hub = element("moonwell-hub");
    if (
      document.documentElement.dataset["glowfinRuntime"] === "running" &&
      hub?.dataset["active"] === "true"
    ) {
      document.documentElement.dataset["glowfinV41AutoStart"] = "started";
      start();
      return;
    }
    attempts += 1;
    if (attempts < 600) {
      setTimeout(autoStart, 50);
    } else {
      document.documentElement.dataset["glowfinV41AutoStart"] = "timed-out";
    }
  };
  setTimeout(autoStart, 0);
}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
