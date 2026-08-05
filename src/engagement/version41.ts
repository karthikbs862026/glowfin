import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AccessPreferenceRepository } from "../competitive/assists";
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
  type Version41BudgetEvidence,
  type Version41Plan,
  type Version41Progress,
  type Version41Segment,
  type Version41SegmentKind,
  type Version41Storage
} from "./version41Plan";

const VERSION41_MODE = "expedition-v41";
const VERSION41_EVENT = "glowfin:v41";
const VERSION41_AUTO_START_KEY = "glowfin.version41.auto-start";
const VERSION41_EXPEDITION_QUERY = "missing-moonseed";
const INVISIBLE_SCALE = 0.0001;

interface Version41Result {
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

type Version41RuntimeEvent =
  | {
    type: "ready";
    planHash: string;
    budgets: Version41BudgetEvidence;
  }
  | {
    type: "segment";
    segment: Version41Segment;
    elapsedSec: number;
    planHash: string;
  }
  | {
    type: "mote";
    moteCount: number;
    chain: number;
    bestChain: number;
  }
  | {
    type: "relic";
    relicFound: boolean;
  }
  | {
    type: "rescue";
    rescueLights: number;
    miriRescued: boolean;
  }
  | {
    type: "race";
    gapUnits: number;
    won: boolean;
    complete: boolean;
  }
  | {
    type: "chase";
    currentBreaks: number;
    gapUnits: number;
    succeeded: boolean;
    complete: boolean;
  }
  | {
    type: "complete";
    elapsedSec: number;
    result: Version41Result;
    planHash: string;
  }
  | {
    type: "reset";
    planHash: string;
  };

interface LayerGeometrySet {
  mote: THREE.BufferGeometry;
  rescue: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
  rival: THREE.BufferGeometry;
  manta: THREE.BufferGeometry;
  duskmaw: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  relic: THREE.BufferGeometry;
  portal: THREE.BufferGeometry;
  wave: THREE.BufferGeometry;
}

interface LayerObjects {
  motes: THREE.InstancedMesh;
  rescueLights: THREE.InstancedMesh;
  currentBreaks: THREE.InstancedMesh;
  shadowWaves: THREE.InstancedMesh;
  rival: THREE.Mesh;
  manta: THREE.Mesh;
  duskmaw: THREE.Mesh;
  duskmawEyes: THREE.Mesh;
  relic: THREE.Mesh;
  portal: THREE.Mesh;
}

function dispatchVersion41(detail: Version41RuntimeEvent): void {
  window.dispatchEvent(new CustomEvent<Version41RuntimeEvent>(VERSION41_EVENT, { detail }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeStorage(): Version41Storage & Storage {
  try {
    const probe = "glowfin.version41.storage-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      get length() { return memory.size; },
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      key: (index: number) => [...memory.keys()][index] ?? null,
      removeItem: (key: string) => { memory.delete(key); },
      setItem: (key: string, value: string) => { memory.set(key, value); }
    };
  }
}

function paintGeometry(
  geometry: THREE.BufferGeometry,
  colour: THREE.ColorRepresentation
): THREE.BufferGeometry {
  const painted = geometry;
  const position = painted.getAttribute("position");
  const color = new THREE.Color(colour);
  const values = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const offset = index * 3;
    values[offset] = color.r;
    values[offset + 1] = color.g;
    values[offset + 2] = color.b;
  }
  painted.setAttribute("color", new THREE.BufferAttribute(values, 3));
  return painted;
}

function transformed(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4
): THREE.BufferGeometry {
  const clone = geometry.clone();
  clone.applyMatrix4(matrix);
  return clone;
}

function mergeOrThrow(geometries: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) throw new Error(`Version 41 could not merge ${label} geometry.`);
  return merged;
}

function createRivalGeometry(): THREE.BufferGeometry {
  const body = transformed(
    new THREE.SphereGeometry(0.66, 12, 8),
    new THREE.Matrix4().makeScale(0.86, 0.62, 1.72)
  );
  const leftFin = transformed(
    new THREE.ConeGeometry(0.58, 1.18, 3),
    new THREE.Matrix4()
      .makeRotationZ(Math.PI * 0.5)
      .premultiply(new THREE.Matrix4().makeTranslation(-0.88, -0.03, 0.12))
  );
  const rightFin = transformed(
    new THREE.ConeGeometry(0.58, 1.18, 3),
    new THREE.Matrix4()
      .makeRotationZ(-Math.PI * 0.5)
      .premultiply(new THREE.Matrix4().makeTranslation(0.88, -0.03, 0.12))
  );
  const tail = transformed(
    new THREE.ConeGeometry(0.5, 1.15, 4),
    new THREE.Matrix4()
      .makeRotationX(Math.PI * 0.5)
      .premultiply(new THREE.Matrix4().makeTranslation(0, 0, 1.45))
  );
  return paintGeometry(
    mergeOrThrow([body, leftFin, rightFin, tail], "Neri"),
    0xa274ff
  );
}

function createMantaGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.12, -1.15,
    -1.72, 0, 0.08,
    0, -0.08, 0.58,
    1.72, 0, 0.08,
    0, 0.12, -1.15,
    0, -0.08, 0.58,
    -0.42, -0.03, 0.45,
    0, -0.04, 1.65,
    0.42, -0.03, 0.45
  ], 3));
  geometry.setIndex([
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    1, 6, 2,
    2, 6, 7,
    2, 7, 8,
    2, 8, 3
  ]);
  geometry.computeVertexNormals();
  return paintGeometry(geometry, 0x73f4da);
}

function createDuskmawGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -2.8),
    new THREE.Vector3(-0.26, 0.16, -1.5),
    new THREE.Vector3(0.34, -0.08, -0.2),
    new THREE.Vector3(-0.18, 0.1, 1.35),
    new THREE.Vector3(0.08, 0, 3.2)
  ]);
  return new THREE.TubeGeometry(curve, 24, 0.68, 8, false);
}

function createEyeGeometry(): THREE.BufferGeometry {
  const left = transformed(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.Matrix4().makeTranslation(-0.28, 0.22, -2.82)
  );
  const right = transformed(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.Matrix4().makeTranslation(0.28, 0.22, -2.82)
  );
  return paintGeometry(mergeOrThrow([left, right], "Duskmaw eyes"), 0xff72d5);
}

function createGeometrySet(): LayerGeometrySet {
  return {
    mote: new THREE.OctahedronGeometry(0.22, 0),
    rescue: new THREE.OctahedronGeometry(0.48, 1),
    ring: new THREE.TorusGeometry(
      VERSION41_CONFIG.presentation.ringRadius,
      0.075,
      4,
      20
    ),
    rival: createRivalGeometry(),
    manta: createMantaGeometry(),
    duskmaw: createDuskmawGeometry(),
    eyes: createEyeGeometry(),
    relic: paintGeometry(new THREE.IcosahedronGeometry(0.68, 1), 0xffcf67),
    portal: paintGeometry(new THREE.TorusGeometry(3.1, 0.18, 6, 32), 0x8df5ff),
    wave: new THREE.BoxGeometry(5.7, 4.2, 0.3)
  };
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return index ? index.count / 3 : geometry.getAttribute("position").count / 3;
}

function markPresentationOnly(object: THREE.Object3D): void {
  object.userData["hideInArtMask"] = true;
  object.userData["version41Presentation"] = true;
  object.traverse((child) => {
    child.userData["hideInArtMask"] = true;
    child.userData["version41Presentation"] = true;
  });
}

class Version41Layer {
  readonly plan: Version41Plan;
  readonly budgetEvidence: Version41BudgetEvidence;
  private readonly group = new THREE.Group();
  private readonly luminousMaterial: THREE.MeshBasicMaterial;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly geometries: LayerGeometrySet;
  private readonly objects: LayerObjects;
  private readonly matrix = new THREE.Matrix4();
  private readonly colour = new THREE.Color();
  private readonly resolvedMotes = new Set<number>();
  private readonly collectedMotes = new Set<number>();
  private readonly rescueCollected = new Set<number>();
  private readonly currentBreaksCollected = new Set<number>();
  private readonly segmentOrigins = new Map<Version41SegmentKind, number>();
  private activeSegment: Version41SegmentKind | null = null;
  private elapsedSec = 0;
  private previousElapsedSec = -1;
  private nextMoteToResolve = 0;
  private moteOriginDistance = 16;
  private moteChain = 0;
  private bestMoteChain = 0;
  private relicFound = false;
  private relicResolved = false;
  private miriRescued = false;
  private raceResolved = false;
  private raceGapUnits = 0;
  private raceCollisions = 0;
  private chaseResolved = false;
  private chaseGapUnits = VERSION41_CONFIG.chase.initialGapUnits;
  private completionDispatched = false;
  private portalDistance: number | null = null;
  private lastStunRemaining = 0;

  constructor(private readonly view: GameView) {
    this.plan = createVersion41Plan();
    const planIssues = validateVersion41Plan(this.plan);
    if (planIssues.length > 0) {
      throw new Error(`Version 41 plan rejected: ${planIssues.join("; ")}`);
    }

    this.luminousMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x160924,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.geometries = createGeometrySet();

    const motes = new THREE.InstancedMesh(
      this.geometries.mote,
      this.luminousMaterial,
      VERSION41_CONFIG.collectibles.motePool
    );
    const rescueLights = new THREE.InstancedMesh(
      this.geometries.rescue,
      this.luminousMaterial,
      3
    );
    const currentBreaks = new THREE.InstancedMesh(
      this.geometries.ring,
      this.luminousMaterial,
      3
    );
    const shadowWaves = new THREE.InstancedMesh(
      this.geometries.wave,
      this.shadowMaterial,
      3
    );
    for (const mesh of [motes, rescueLights, currentBreaks, shadowWaves]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }

    this.objects = {
      motes,
      rescueLights,
      currentBreaks,
      shadowWaves,
      rival: new THREE.Mesh(this.geometries.rival, this.luminousMaterial),
      manta: new THREE.Mesh(this.geometries.manta, this.luminousMaterial),
      duskmaw: new THREE.Mesh(this.geometries.duskmaw, this.shadowMaterial),
      duskmawEyes: new THREE.Mesh(this.geometries.eyes, this.luminousMaterial),
      relic: new THREE.Mesh(this.geometries.relic, this.luminousMaterial),
      portal: new THREE.Mesh(this.geometries.portal, this.luminousMaterial)
    };

    this.group.name = "Version41LivingCurrent";
    this.group.add(
      motes,
      rescueLights,
      currentBreaks,
      shadowWaves,
      this.objects.rival,
      this.objects.manta,
      this.objects.duskmaw,
      this.objects.duskmawEyes,
      this.objects.relic,
      this.objects.portal
    );
    markPresentationOnly(this.group);
    this.view.scene.add(this.group);

    this.objects.rival.visible = false;
    this.objects.manta.visible = false;
    this.objects.duskmaw.visible = false;
    this.objects.duskmawEyes.visible = false;
    this.objects.relic.visible = false;
    this.objects.portal.visible = false;
    rescueLights.count = 0;
    currentBreaks.count = 0;
    shadowWaves.count = 0;

    const triangles =
      triangleCount(this.geometries.mote) * VERSION41_CONFIG.collectibles.motePool +
      triangleCount(this.geometries.rescue) * 3 +
      triangleCount(this.geometries.ring) * 3 +
      triangleCount(this.geometries.wave) * 3 +
      triangleCount(this.geometries.rival) +
      triangleCount(this.geometries.manta) +
      triangleCount(this.geometries.duskmaw) +
      triangleCount(this.geometries.eyes) +
      triangleCount(this.geometries.relic) +
      triangleCount(this.geometries.portal);
    this.budgetEvidence = {
      additionalDrawCalls: 10,
      additionalTriangles: Math.ceil(triangles),
      additionalMaterials: 2
    };
    const budgetIssues = auditVersion41Budgets(this.budgetEvidence);
    if (budgetIssues.length > 0) {
      throw new Error(`Version 41 budget rejected: ${budgetIssues.join("; ")}`);
    }

    dispatchVersion41({
      type: "ready",
      planHash: this.plan.planHash,
      budgets: this.budgetEvidence
    });
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(sim: SimState, frameSec: number): void {
    const qaScale = version41QaTimeScale(window.location);
    const effectiveElapsed = sim.elapsedSec * qaScale;
    if (
      this.previousElapsedSec >= 0 &&
      (effectiveElapsed + 0.1 < this.previousElapsedSec || sim.forwardDistance < 1)
    ) {
      this.reset(sim);
    }
    this.previousElapsedSec = effectiveElapsed;
    this.elapsedSec = effectiveElapsed;

    const segment = segmentAtTime(this.plan, effectiveElapsed);
    if (segment.kind !== this.activeSegment) {
      this.activeSegment = segment.kind;
      this.segmentOrigins.set(segment.kind, sim.forwardDistance);
      if (segment.kind === "race-neri") this.raceCollisions = 0;
      dispatchVersion41({
        type: "segment",
        segment,
        elapsedSec: Math.min(effectiveElapsed, this.plan.durationSec),
        planHash: this.plan.planHash
      });
    }

    if (sim.stunRemainingSec > this.lastStunRemaining + 0.2 && segment.kind === "race-neri") {
      this.raceCollisions += 1;
    }
    this.lastStunRemaining = sim.stunRemainingSec;

    this.updateMotes(sim, effectiveElapsed, frameSec);
    this.updateRelic(sim, segment, effectiveElapsed, frameSec);
    this.updateRescue(sim, segment, effectiveElapsed, frameSec);
    this.updateRace(sim, segment, effectiveElapsed, frameSec);
    this.updateChase(sim, segment, effectiveElapsed, frameSec);
    this.updateReturn(sim, segment, effectiveElapsed, frameSec);
  }

  private reset(sim: SimState): void {
    this.resolvedMotes.clear();
    this.collectedMotes.clear();
    this.rescueCollected.clear();
    this.currentBreaksCollected.clear();
    this.segmentOrigins.clear();
    this.activeSegment = null;
    this.elapsedSec = 0;
    this.previousElapsedSec = -1;
    this.nextMoteToResolve = 0;
    this.moteOriginDistance = sim.forwardDistance + 16;
    this.moteChain = 0;
    this.bestMoteChain = 0;
    this.relicFound = false;
    this.relicResolved = false;
    this.miriRescued = false;
    this.raceResolved = false;
    this.raceGapUnits = 0;
    this.raceCollisions = 0;
    this.chaseResolved = false;
    this.chaseGapUnits = VERSION41_CONFIG.chase.initialGapUnits;
    this.completionDispatched = false;
    this.portalDistance = null;
    this.lastStunRemaining = 0;
    this.objects.rival.visible = false;
    this.objects.manta.visible = false;
    this.objects.duskmaw.visible = false;
    this.objects.duskmawEyes.visible = false;
    this.objects.relic.visible = false;
    this.objects.portal.visible = false;
    this.objects.rescueLights.count = 0;
    this.objects.currentBreaks.count = 0;
    this.objects.shadowWaves.count = 0;
    dispatchVersion41({ type: "reset", planHash: this.plan.planHash });
  }

  private updateMotes(sim: SimState, elapsedSec: number, frameSec: number): void {
    const cfg = VERSION41_CONFIG.collectibles;
    const firstVisible = Math.max(
      0,
      Math.floor((sim.forwardDistance - this.moteOriginDistance) / cfg.moteSpacingUnits) - 2
    );
    const pulseTime = this.reducedMotion() ? 0 : elapsedSec;

    for (let slot = 0; slot < cfg.motePool; slot++) {
      const sequence = firstVisible + slot;
      const distance = this.moteOriginDistance + sequence * cfg.moteSpacingUnits;
      const lateral = moteLateralPosition(sequence);
      const visible =
        !this.resolvedMotes.has(sequence) &&
        distance >= sim.forwardDistance - VERSION41_CONFIG.presentation.maxVisibleBehindUnits &&
        distance <= sim.forwardDistance + VERSION41_CONFIG.presentation.maxVisibleAheadUnits;
      const scale = visible
        ? VERSION41_CONFIG.presentation.moteScale *
          (1 + Math.sin(pulseTime * 3.2 + sequence * 0.7) * 0.16)
        : INVISIBLE_SCALE;
      this.matrix.compose(
        new THREE.Vector3(lateral, 0.22 + Math.sin(sequence * 0.41) * 0.34, -distance),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      this.objects.motes.setMatrixAt(slot, this.matrix);
      this.colour.setHSL(0.12 + (sequence % 5) * 0.012, 0.92, 0.66);
      this.objects.motes.setColorAt(slot, this.colour);
    }
    this.objects.motes.instanceMatrix.needsUpdate = true;
    if (this.objects.motes.instanceColor) this.objects.motes.instanceColor.needsUpdate = true;

    const nearSequence = Math.max(
      0,
      Math.round((sim.forwardDistance - this.moteOriginDistance) / cfg.moteSpacingUnits)
    );
    for (let sequence = Math.max(0, nearSequence - 2); sequence <= nearSequence + 2; sequence++) {
      if (this.resolvedMotes.has(sequence)) continue;
      const distance = this.moteOriginDistance + sequence * cfg.moteSpacingUnits;
      const lateral = moteLateralPosition(sequence);
      if (collectibleHit(
        sim.forwardDistance,
        sim.lateralPosition,
        distance,
        lateral,
        cfg.moteCollectRadius
      )) {
        this.resolvedMotes.add(sequence);
        this.collectedMotes.add(sequence);
        this.moteChain += 1;
        this.bestMoteChain = Math.max(this.bestMoteChain, this.moteChain);
        dispatchVersion41({
          type: "mote",
          moteCount: this.collectedMotes.size,
          chain: this.moteChain,
          bestChain: this.bestMoteChain
        });
      }
    }

    while (
      this.moteOriginDistance + this.nextMoteToResolve * cfg.moteSpacingUnits <
      sim.forwardDistance - cfg.moteMissDistanceUnits
    ) {
      if (!this.resolvedMotes.has(this.nextMoteToResolve)) {
        this.resolvedMotes.add(this.nextMoteToResolve);
        if (this.moteChain > 0) {
          this.moteChain = 0;
          dispatchVersion41({
            type: "mote",
            moteCount: this.collectedMotes.size,
            chain: 0,
            bestChain: this.bestMoteChain
          });
        }
      }
      this.nextMoteToResolve += 1;
    }

    if (frameSec <= 0) this.objects.motes.visible = true;
  }

  private updateRelic(
    sim: SimState,
    segment: Version41Segment,
    elapsedSec: number,
    frameSec: number
  ): void {
    const origin = this.segmentOrigins.get("relic-fork");
    const active = segment.kind === "relic-fork" && origin !== undefined && !this.relicResolved;
    this.objects.relic.visible = active;
    if (!active || origin === undefined) return;
    const distance = origin + VERSION41_CONFIG.collectibles.relicAheadUnits;
    const lateral = 4.15;
    const pulse = this.reducedMotion() ? 1 : 1 + Math.sin(elapsedSec * 4.4) * 0.12;
    this.objects.relic.position.set(lateral, 0.7, -distance);
    this.objects.relic.rotation.y += this.reducedMotion() ? 0 : frameSec * 1.7;
    this.objects.relic.scale.setScalar(pulse);
    if (collectibleHit(
      sim.forwardDistance,
      sim.lateralPosition,
      distance,
      lateral,
      VERSION41_CONFIG.collectibles.relicCollectRadius
    )) {
      this.relicResolved = true;
      this.relicFound = true;
      this.objects.relic.visible = false;
      dispatchVersion41({ type: "relic", relicFound: true });
    } else if (sim.forwardDistance > distance + 4) {
      this.relicResolved = true;
      this.objects.relic.visible = false;
      dispatchVersion41({ type: "relic", relicFound: false });
    }
  }

  private updateRescue(
    sim: SimState,
    segment: Version41Segment,
    elapsedSec: number,
    frameSec: number
  ): void {
    const origin = this.segmentOrigins.get("rescue-miri");
    const active = segment.kind === "rescue-miri" && origin !== undefined;
    const laterals = [-3.25, 3.25, 0];
    this.objects.rescueLights.count = active ? 3 : 0;
    if (active && origin !== undefined) {
      VERSION41_CONFIG.collectibles.rescueAheadUnits.forEach((ahead, index) => {
        const distance = origin + ahead;
        const lateral = laterals[index] ?? 0;
        const visible = !this.rescueCollected.has(index);
        const pulse = this.reducedMotion()
          ? 1
          : 1 + Math.sin(elapsedSec * 4 + index * 1.8) * 0.18;
        const scale = visible
          ? VERSION41_CONFIG.presentation.rescueScale * pulse
          : INVISIBLE_SCALE;
        this.matrix.compose(
          new THREE.Vector3(lateral, 0.38, -distance),
          new THREE.Quaternion(),
          new THREE.Vector3(scale, scale, scale)
        );
        this.objects.rescueLights.setMatrixAt(index, this.matrix);
        this.objects.rescueLights.setColorAt(index, this.colour.set(0x74f6d9));
        if (
          visible &&
          collectibleHit(
            sim.forwardDistance,
            sim.lateralPosition,
            distance,
            lateral,
            VERSION41_CONFIG.collectibles.rescueCollectRadius
          )
        ) {
          this.rescueCollected.add(index);
          dispatchVersion41({
            type: "rescue",
            rescueLights: this.rescueCollected.size,
            miriRescued: false
          });
        }
      });
      this.objects.rescueLights.instanceMatrix.needsUpdate = true;
      if (this.objects.rescueLights.instanceColor) {
        this.objects.rescueLights.instanceColor.needsUpdate = true;
      }
    }

    if (!this.miriRescued && this.rescueCollected.size === 3) {
      this.miriRescued = true;
      dispatchVersion41({
        type: "rescue",
        rescueLights: 3,
        miriRescued: true
      });
    }

    this.objects.manta.visible = active || this.miriRescued;
    if (this.objects.manta.visible) {
      const trappedDistance = origin === undefined
        ? sim.forwardDistance + 9
        : origin + (VERSION41_CONFIG.collectibles.rescueAheadUnits[2] ?? 226) + 9;
      const distance = this.miriRescued
        ? sim.forwardDistance - 2.4
        : trappedDistance;
      const reduced = this.reducedMotion();
      this.objects.manta.position.set(
        VERSION41_CONFIG.presentation.miriLateralOffset,
        0.18 + (reduced ? 0 : Math.sin(elapsedSec * 2.2) * 0.18),
        -distance
      );
      this.objects.manta.rotation.z = reduced ? 0 : Math.sin(elapsedSec * 2.2) * 0.12;
      this.objects.manta.scale.setScalar(this.miriRescued ? 0.82 : 0.64);
      if (!reduced) this.objects.manta.rotation.y += frameSec * 0.08;
    }
  }

  private updateRace(
    sim: SimState,
    segment: Version41Segment,
    elapsedSec: number,
    frameSec: number
  ): void {
    const origin = this.segmentOrigins.get("race-neri");
    const raceSegment = this.plan.segments.find((entry) => entry.kind === "race-neri");
    const cameo = segment.kind === "follow-light" && elapsedSec >= 12;
    const active = segment.kind === "race-neri" && origin !== undefined && raceSegment;
    this.objects.rival.visible = Boolean(cameo || active || segment.kind === "return-moonwell");
    if (!this.objects.rival.visible) return;

    let distance = sim.forwardDistance + 7;
    let gap = 0;
    if (active && origin !== undefined && raceSegment) {
      const raceElapsed = clamp(elapsedSec - raceSegment.startSec, 0, raceSegment.endSec - raceSegment.startSec);
      const targetDistance = origin + VERSION41_CONFIG.race.targetSpeedUnitsPerSec * raceElapsed;
      gap = sim.forwardDistance - targetDistance -
        this.raceCollisions * VERSION41_CONFIG.race.collisionPenaltyUnits +
        (this.raceCollisions === 0 ? VERSION41_CONFIG.race.cleanFinishBonusUnits : 0);
      this.raceGapUnits = gap;
      distance = sim.forwardDistance - clamp(
        gap,
        -VERSION41_CONFIG.race.visualGapLimitUnits,
        VERSION41_CONFIG.race.visualGapLimitUnits
      );
      dispatchVersion41({
        type: "race",
        gapUnits: gap,
        won: gap >= 0,
        complete: false
      });
    } else if (segment.kind === "return-moonwell") {
      distance = sim.forwardDistance - 4;
    }

    const reduced = this.reducedMotion();
    this.objects.rival.position.set(
      VERSION41_CONFIG.presentation.rivalLateralOffset +
        (reduced ? 0 : Math.sin(elapsedSec * 1.7) * 0.36),
      0.2 + (reduced ? 0 : Math.sin(elapsedSec * 3.4) * 0.12),
      -distance
    );
    this.objects.rival.rotation.y = Math.PI;
    this.objects.rival.rotation.z = reduced ? 0 : Math.sin(elapsedSec * 2.1) * 0.08;
    this.objects.rival.scale.setScalar(cameo ? 0.82 : 0.94);
    if (!reduced) this.objects.rival.rotation.x = Math.sin(elapsedSec * 2) * 0.02;
    if (frameSec <= 0) this.objects.rival.rotation.x = 0;

    if (
      !this.raceResolved &&
      raceSegment &&
      elapsedSec >= raceSegment.endSec
    ) {
      this.raceResolved = true;
      dispatchVersion41({
        type: "race",
        gapUnits: this.raceGapUnits,
        won: this.raceGapUnits >= 0,
        complete: true
      });
    }
  }

  private updateChase(
    sim: SimState,
    segment: Version41Segment,
    elapsedSec: number,
    frameSec: number
  ): void {
    const origin = this.segmentOrigins.get("duskmaw-chase");
    const chaseSegment = this.plan.segments.find((entry) => entry.kind === "duskmaw-chase");
    const active = segment.kind === "duskmaw-chase" && origin !== undefined && chaseSegment;
    this.objects.duskmaw.visible = Boolean(active);
    this.objects.duskmawEyes.visible = Boolean(active);
    this.objects.currentBreaks.count = active ? 3 : 0;
    this.objects.shadowWaves.count = active ? 3 : 0;
    if (!active || origin === undefined || !chaseSegment) return;

    VERSION41_CONFIG.collectibles.currentBreakAheadUnits.forEach((ahead, index) => {
      const distance = origin + ahead;
      const lateral = [-3.1, 3.1, index % 2 === 0 ? 2.6 : -2.6][index] ?? 0;
      const visible = !this.currentBreaksCollected.has(index);
      const scale = visible ? 1 : INVISIBLE_SCALE;
      this.matrix.compose(
        new THREE.Vector3(lateral, 0.38, -distance),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.5, 0, 0)),
        new THREE.Vector3(scale, scale, scale)
      );
      this.objects.currentBreaks.setMatrixAt(index, this.matrix);
      this.objects.currentBreaks.setColorAt(index, this.colour.set(0x75f5ff));
      if (
        visible &&
        collectibleHit(
          sim.forwardDistance,
          sim.lateralPosition,
          distance,
          lateral,
          VERSION41_CONFIG.collectibles.currentBreakCollectRadius
        )
      ) {
        this.currentBreaksCollected.add(index);
      }
    });
    this.objects.currentBreaks.instanceMatrix.needsUpdate = true;
    if (this.objects.currentBreaks.instanceColor) {
      this.objects.currentBreaks.instanceColor.needsUpdate = true;
    }

    const chaseElapsed = clamp(
      elapsedSec - chaseSegment.startSec,
      0,
      chaseSegment.endSec - chaseSegment.startSec
    );
    this.chaseGapUnits = clamp(
      VERSION41_CONFIG.chase.initialGapUnits +
        this.currentBreaksCollected.size * VERSION41_CONFIG.chase.breakGainUnits -
        chaseElapsed * VERSION41_CONFIG.chase.closingUnitsPerSec,
      VERSION41_CONFIG.chase.minimumGapUnits,
      VERSION41_CONFIG.chase.maximumGapUnits
    );
    const duskmawDistance = sim.forwardDistance - this.chaseGapUnits;
    const reduced = this.reducedMotion();
    const sway = reduced ? 0 : Math.sin(elapsedSec * 2.4) * 0.46;
    this.objects.duskmaw.position.set(
      sim.lateralPosition * 0.34 + sway,
      VERSION41_CONFIG.presentation.duskmawHeight,
      -duskmawDistance
    );
    this.objects.duskmawEyes.position.copy(this.objects.duskmaw.position);
    this.objects.duskmaw.rotation.y = Math.PI;
    this.objects.duskmawEyes.rotation.y = Math.PI;
    this.objects.duskmaw.scale.set(1.15, 1.15, 1.15);
    this.objects.duskmawEyes.scale.setScalar(1.15);
    if (!reduced) {
      this.objects.duskmaw.rotation.z = Math.sin(elapsedSec * 2.1) * 0.08;
      this.objects.duskmawEyes.rotation.z = this.objects.duskmaw.rotation.z;
    }

    for (let index = 0; index < 3; index++) {
      const attackStart = 4 + index * 8;
      const attackPhase = clamp((chaseElapsed - attackStart) / 4, 0, 1);
      const activeWave = chaseElapsed >= attackStart && chaseElapsed <= attackStart + 4;
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (3.6 - attackPhase * 1.15);
      const z = -(sim.forwardDistance + 35 + index * 5);
      const scale = activeWave ? 1 : INVISIBLE_SCALE;
      this.matrix.compose(
        new THREE.Vector3(x, 1.25, z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      this.objects.shadowWaves.setMatrixAt(index, this.matrix);
    }
    this.objects.shadowWaves.instanceMatrix.needsUpdate = true;

    dispatchVersion41({
      type: "chase",
      currentBreaks: this.currentBreaksCollected.size,
      gapUnits: this.chaseGapUnits,
      succeeded: this.chaseGapUnits >= VERSION41_CONFIG.chase.successGapUnits,
      complete: false
    });

    if (!this.chaseResolved && elapsedSec >= chaseSegment.endSec) {
      this.chaseResolved = true;
      dispatchVersion41({
        type: "chase",
        currentBreaks: this.currentBreaksCollected.size,
        gapUnits: this.chaseGapUnits,
        succeeded: this.chaseGapUnits >= VERSION41_CONFIG.chase.successGapUnits,
        complete: true
      });
    }
    if (frameSec <= 0) this.objects.duskmaw.rotation.z = 0;
  }

  private updateReturn(
    sim: SimState,
    segment: Version41Segment,
    elapsedSec: number,
    frameSec: number
  ): void {
    const active = segment.kind === "return-moonwell";
    if (!active) {
      this.objects.portal.visible = false;
      return;
    }
    const returnSegment = this.plan.segments.find((entry) => entry.kind === "return-moonwell");
    if (!returnSegment) return;
    const revealAt = returnSegment.endSec - 7;
    if (elapsedSec >= revealAt && this.portalDistance === null) {
      this.portalDistance = sim.forwardDistance + VERSION41_CONFIG.presentation.finishAheadUnits;
    }
    this.objects.portal.visible = this.portalDistance !== null;
    if (this.portalDistance !== null) {
      this.objects.portal.position.set(0, 1.3, -this.portalDistance);
      this.objects.portal.rotation.x = Math.PI * 0.5;
      if (!this.reducedMotion()) this.objects.portal.rotation.z += frameSec * 0.55;
      const pulse = this.reducedMotion() ? 1 : 1 + Math.sin(elapsedSec * 3.8) * 0.05;
      this.objects.portal.scale.setScalar(pulse);
    }

    const passedPortal = this.portalDistance !== null &&
      sim.forwardDistance >= this.portalDistance - 0.8 &&
      Math.abs(sim.lateralPosition) <= 3.1;
    const timedFinish = elapsedSec >= this.plan.durationSec;
    const fallbackFinish = elapsedSec >= VERSION41_CONFIG.presentation.finishFallbackSec;
    if (!this.completionDispatched && (passedPortal || timedFinish || fallbackFinish)) {
      this.completionDispatched = true;
      dispatchVersion41({
        type: "complete",
        elapsedSec: Math.min(elapsedSec, VERSION41_CONFIG.presentation.finishFallbackSec),
        planHash: this.plan.planHash,
        result: this.result()
      });
    }
  }

  private result(): Version41Result {
    return {
      moteCount: this.collectedMotes.size,
      bestChain: this.bestMoteChain,
      relicFound: this.relicFound,
      rescueLights: this.rescueCollected.size,
      miriRescued: this.miriRescued,
      raceGapUnits: Math.max(0, this.raceGapUnits),
      raceWon: this.raceGapUnits >= 0,
      currentBreaks: this.currentBreaksCollected.size,
      chaseGapUnits: this.chaseGapUnits,
      chaseSucceeded: this.chaseGapUnits >= VERSION41_CONFIG.chase.successGapUnits
    };
  }

  private reducedMotion(): boolean {
    try {
      return new AccessPreferenceRepository(window.localStorage).load().reducedMotion;
    } catch {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    }
  }

  dispose(): void {
    this.view.scene.remove(this.group);
    const uniqueGeometries = new Set<THREE.BufferGeometry>(Object.values(this.geometries));
    for (const geometry of uniqueGeometries) geometry.dispose();
    this.luminousMaterial.dispose();
    this.shadowMaterial.dispose();
  }
}

const layers = new WeakMap<GameView, Version41Layer>();
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
  const expeditionActive =
    document.documentElement.dataset["glowfinMode"] === VERSION41_MODE &&
    document.getElementById("moonwell-hub")?.dataset["active"] !== "true";
  let layer = layers.get(this);
  if (expeditionActive) {
    if (!layer) {
      layer = new Version41Layer(this);
      layers.set(this, layer);
    }
    layer.setVisible(true);
    layer.update(sim, frameSec);
  } else {
    layer?.setVisible(false);
  }
  originalRender.call(
    this,
    sim,
    gates,
    lightFraction,
    elapsedSec,
    frameSec,
    ghostSim,
    activeLivingEvents
  );
};

GameView.prototype.dispose = function version41Dispose(): void {
  const layer = layers.get(this);
  layer?.dispose();
  layers.delete(this);
  originalDispose.call(this);
};

class Version41Telemetry {
  private readonly storage = safeStorage();
  private readonly baseProgress = new ProgressRepository(this.storage);
  private readonly client = new TelemetryClient(
    this.baseProgress.load().progress.telemetryConsent,
    new HostedTelemetryTransport()
  );
  readonly runId = createRunId();

  track(name: TelemetryEventName, payload: TelemetryPayload): void {
    this.client.setConsent(this.baseProgress.load().progress.telemetryConsent);
    this.client.track(name, payload, this.runId);
  }

  flush(): void {
    void this.client.flush();
  }
}

function injectVersion41Styles(): void {
  if (document.getElementById("version41-styles")) return;
  const style = document.createElement("style");
  style.id = "version41-styles";
  style.textContent = `
    .v41-expedition-card {
      width: 100%; min-height: 78px; margin-top: 10px; padding: 12px 15px;
      display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 12px;
      border: 1px solid rgba(255, 210, 110, .64); border-radius: 20px;
      background: linear-gradient(135deg, rgba(79, 54, 119, .94), rgba(7, 105, 124, .92));
      color: #f5fcff; text-align: left; box-shadow: 0 0 28px rgba(95, 226, 255, .12);
    }
    .v41-expedition-card .v41-mark { width: 46px; height: 46px; display: grid; place-items: center;
      border-radius: 50%; background: radial-gradient(circle, #fff6b8 0 8%, #ffcf67 28%, #8b6cff 67%, rgba(43,28,91,.1) 72%);
      box-shadow: 0 0 22px rgba(255, 218, 112, .55); font-size: 19px; }
    .v41-expedition-card strong { display: block; color: #fff4c6; font-size: 15px; }
    .v41-expedition-card span { display: block; margin-top: 3px; color: rgba(222,247,255,.78); font-size: 12px; line-height: 1.3; }
    .v41-expedition-card b { padding: 5px 8px; border-radius: 999px; background: rgba(255,220,133,.16); color: #ffe7a8; font-size: 10px; }
    #v41-hud { position: fixed; left: 50%; top: max(82px, calc(var(--glowfin-safe-top) + 70px)); z-index: 6;
      width: min(390px, calc(100vw - 28px)); display: none; transform: translateX(-50%); pointer-events: none; }
    #v41-hud[data-active="true"] { display: block; }
    .v41-hud-card { padding: 11px 13px; border: 1px solid rgba(255,215,127,.42); border-radius: 18px;
      background: linear-gradient(150deg, rgba(4,23,42,.86), rgba(37,20,70,.82)); backdrop-filter: blur(7px);
      box-shadow: 0 12px 38px rgba(0,0,0,.3); }
    .v41-hud-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    #v41-segment-title { color: #fff2bd; font-size: 14px; font-weight: 850; }
    #v41-timer { color: #a9efff; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
    #v41-objective { margin: 4px 0 8px; color: rgba(223,247,255,.82); font-size: 12px; line-height: 1.35; }
    .v41-progress { height: 4px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.1); }
    #v41-progress-fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg,#ffd46e,#63e8ff,#ae72ff); }
    .v41-stats { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
    .v41-stats span { padding: 4px 7px; border-radius: 999px; background: rgba(4,21,38,.64); color: #d8f6ff; font-size: 10px; font-weight: 760; }
    #v41-toast { position: fixed; left: 50%; bottom: max(112px, calc(var(--glowfin-safe-bottom) + 98px)); z-index: 8;
      max-width: min(360px, calc(100vw - 36px)); display: none; transform: translateX(-50%); padding: 9px 13px;
      border: 1px solid rgba(255,219,131,.48); border-radius: 999px; background: rgba(12,25,51,.9); color: #fff2bd;
      font-size: 12px; font-weight: 800; text-align: center; pointer-events: none; backdrop-filter: blur(6px); }
    #v41-toast[data-active="true"] { display: block; }
    #v41-complete { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center;
      padding: max(18px,var(--glowfin-safe-top)) max(16px,var(--glowfin-safe-right)) max(18px,var(--glowfin-safe-bottom)) max(16px,var(--glowfin-safe-left));
      box-sizing: border-box; background: radial-gradient(circle at 50% 26%, rgba(58,123,162,.5), rgba(3,7,19,.9) 68%); backdrop-filter: blur(8px); }
    #v41-complete[data-active="true"] { display: flex; }
    .v41-complete-card { width: min(390px,100%); max-height: calc(100dvh - 36px); overflow: auto; padding: 22px 18px 18px;
      border: 1px solid rgba(255,219,132,.55); border-radius: 26px; background: linear-gradient(160deg,rgba(9,47,67,.98),rgba(40,23,78,.98));
      box-shadow: 0 24px 80px rgba(0,0,0,.52), 0 0 42px rgba(100,229,255,.14); box-sizing: border-box; text-align: center; }
    .v41-restoration-orb { width: 92px; height: 92px; margin: 0 auto 12px; border-radius: 50%;
      background: radial-gradient(circle,#fffbd1 0 8%,#ffd268 18%,#65eaff 46%,#7655c9 70%,rgba(24,17,64,.1) 74%);
      box-shadow: 0 0 42px rgba(103,234,255,.58); }
    .v41-complete-card h2 { margin: 0; color: #fff3bd; font-size: 28px; }
    .v41-complete-card > p { margin: 7px 0 13px; color: rgba(222,247,255,.78); font-size: 13px; line-height: 1.45; }
    #v41-result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin: 12px 0; }
    #v41-result-grid div { padding: 9px; border-radius: 14px; background: rgba(3,20,38,.58); }
    #v41-result-grid strong { display: block; color: #a9f3ff; font-size: 15px; }
    #v41-result-grid span { display: block; margin-top: 2px; color: rgba(213,239,248,.68); font-size: 10px; }
    .v41-complete-actions { display: grid; gap: 8px; }
    .v41-complete-actions button, .v41-atlas-back { min-height: 48px; border: 1px solid rgba(145,231,255,.38); border-radius: 16px;
      color: #f2fcff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; touch-action: manipulation; }
    #v41-rematch { background: linear-gradient(135deg,rgba(15,163,187,.96),rgba(83,72,184,.96)); }
    #v41-return { background: rgba(4,24,43,.76); }
    .v41-atlas-entry { width: 100%; min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 13px; border: 1px solid rgba(143,229,255,.18); border-radius: 16px; background: rgba(3,20,38,.56); box-sizing: border-box; }
    .v41-atlas-entry[data-found="true"] { border-color: rgba(255,218,125,.58); background: rgba(77,55,31,.35); }
    .v41-atlas-entry strong { display: block; color: #edfaff; font-size: 13px; }
    .v41-atlas-entry span { display: block; margin-top: 2px; color: rgba(204,235,246,.66); font-size: 11px; line-height: 1.3; }
    .v41-atlas-entry b { color: #ffe5a5; font-size: 11px; white-space: nowrap; }
    #v41-atlas-list { display: grid; gap: 8px; }
    #v41-atlas-restoration { margin: 0 0 12px; padding: 11px 12px; border-radius: 15px; background: rgba(57,84,69,.36); color: #baffdc; font-size: 12px; line-height: 1.35; }
    #moonwell-hub[data-v41-restored="true"] .moonwell-header h1 { text-shadow: 0 0 28px rgba(255,218,112,.42), 0 0 52px rgba(95,231,255,.28); }
    html[data-glowfin-high-contrast="true"] .v41-hud-card, html[data-glowfin-high-contrast="true"] .v41-expedition-card { border-width: 2px; background-color: rgba(0,12,25,.96); }
    @media (prefers-reduced-motion: reduce) { .v41-restoration-orb, .v41-expedition-card { animation: none !important; } }
  `;
  document.head.append(style);
}

function createVersion41Hud(): HTMLElement {
  const hud = document.createElement("aside");
  hud.id = "v41-hud";
  hud.dataset.active = "false";
  hud.dataset.state = "idle";
  hud.setAttribute("aria-live", "polite");
  hud.innerHTML = `
    <div class="v41-hud-card">
      <div class="v41-hud-top"><strong id="v41-segment-title">The Missing Moonseed</strong><span id="v41-timer">3:00</span></div>
      <p id="v41-objective">Follow the golden current.</p>
      <div class="v41-progress"><div id="v41-progress-fill"></div></div>
      <div class="v41-stats">
        <span id="v41-chain">Chain 0</span><span id="v41-relic">Relic not found</span><span id="v41-rescue">Miri 0/3</span><span id="v41-race">Neri nearby</span><span id="v41-chase">Current calm</span>
      </div>
    </div>`;
  document.body.append(hud);
  return hud;
}

function createToast(): HTMLElement {
  const toast = document.createElement("div");
  toast.id = "v41-toast";
  toast.dataset.active = "false";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.append(toast);
  return toast;
}

function createCompletion(): HTMLElement {
  const completion = document.createElement("section");
  completion.id = "v41-complete";
  completion.dataset.active = "false";
  completion.setAttribute("aria-label", "Expedition complete");
  completion.innerHTML = `
    <div class="v41-complete-card">
      <div class="v41-restoration-orb" aria-hidden="true"></div>
      <h2>Moonseed restored</h2>
      <p>Glowfin, Neri and Miri return together. The Moon Well carries a new living light.</p>
      <div id="v41-result-grid"></div>
      <div class="v41-complete-actions">
        <button id="v41-rematch" type="button">Dive Again · Missing Moonseed</button>
        <button id="v41-return" type="button">Return to the Moon Well</button>
      </div>
    </div>`;
  document.body.append(completion);
  return completion;
}

function createExpeditionEntry(): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = "v41-expedition-start";
  button.type = "button";
  button.className = "v41-expedition-card";
  button.dataset.hudAction = "";
  button.innerHTML = `
    <span class="v41-mark" aria-hidden="true">✦</span>
    <span><strong>The Missing Moonseed</strong><span>3-minute Expedition · collect · rescue · race · escape</span></span>
    <b>NEW</b>`;
  const dive = document.getElementById("moonwell-dive");
  dive?.insertAdjacentElement("afterend", button);
  return button;
}

function createAtlasPanel(progress: Version41Progress): void {
  const shell = document.querySelector<HTMLElement>("#moonwell-hub .moonwell-shell");
  const nav = document.querySelector<HTMLElement>("#moonwell-home .moonwell-nav");
  if (!shell || !nav || document.getElementById("moonwell-panel-v41-atlas")) return;

  const atlasButton = document.createElement("button");
  atlasButton.type = "button";
  atlasButton.id = "v41-atlas-open";
  atlasButton.dataset.hudAction = "";
  atlasButton.innerHTML = "<strong>Relic Atlas</strong><span>Six Moon-Garden discoveries</span>";
  nav.append(atlasButton);

  const panel = document.createElement("section");
  panel.id = "moonwell-panel-v41-atlas";
  panel.className = "moonwell-view moonwell-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="moonwell-panel-heading"><button class="v41-atlas-back" type="button">Back</button><div><span>Moon-Garden discoveries</span><h2>Relic Atlas</h2></div></div>
    <p id="v41-atlas-restoration"></p><div id="v41-atlas-list"></div>`;
  shell.append(panel);

  const render = (): void => {
    const current = new Version41ProgressRepository(safeStorage()).load().progress;
    const restoration = panel.querySelector<HTMLElement>("#v41-atlas-restoration");
    if (restoration) {
      restoration.textContent = current.moonWellRestored
        ? "Moonseed Fountain restored · its light now welcomes every future Expedition."
        : "Complete The Missing Moonseed to awaken the first Moon Well restoration.";
    }
    const list = panel.querySelector<HTMLElement>("#v41-atlas-list");
    if (!list) return;
    list.replaceChildren(...VERSION41_RELICS.map((relic) => {
      const found = current.discoveredRelics.includes(relic.id);
      const row = document.createElement("article");
      row.className = "v41-atlas-entry";
      row.dataset.found = String(found);
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = found ? relic.name : "Undiscovered relic";
      const clue = document.createElement("span");
      clue.textContent = relic.clue;
      copy.append(title, clue);
      const state = document.createElement("b");
      state.textContent = found ? "FOUND" : "LOCKED";
      row.append(copy, state);
      return row;
    }));
  };

  const open = (): void => {
    document.getElementById("moonwell-home")?.setAttribute("hidden", "");
    document.querySelectorAll<HTMLElement>("#moonwell-hub .moonwell-panel").forEach((entry) => {
      entry.hidden = entry !== panel;
    });
    panel.hidden = false;
    document.getElementById("moonwell-hub")?.setAttribute("data-panel", "v41-atlas");
    render();
  };
  const close = (): void => {
    panel.hidden = true;
    document.getElementById("moonwell-home")?.removeAttribute("hidden");
    document.getElementById("moonwell-hub")?.setAttribute("data-panel", "home");
  };
  atlasButton.addEventListener("click", (event) => {
    event.stopPropagation();
    open();
  });
  panel.querySelector<HTMLButtonElement>(".v41-atlas-back")?.addEventListener("click", close);
  render();
  document.getElementById("moonwell-hub")?.setAttribute(
    "data-v41-restored",
    String(progress.moonWellRestored)
  );
}

function formatTimer(elapsedSec: number): string {
  const remaining = Math.max(0, VERSION41_CONFIG.durationSec - elapsedSec);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function installVersion41Ui(): void {
  if (document.getElementById("v41-expedition-start")) return;
  injectVersion41Styles();
  const storage = safeStorage();
  const progressRepository = new Version41ProgressRepository(storage);
  let v41Progress = progressRepository.load().progress;
  const telemetry = new Version41Telemetry();
  const hud = createVersion41Hud();
  const toast = createToast();
  const completion = createCompletion();
  const expeditionButton = createExpeditionEntry();
  createAtlasPanel(v41Progress);
  const plan = createVersion41Plan();
  const runState = {
    active: false,
    complete: false,
    result: null as Version41Result | null,
    toastTimer: 0
  };

  const showToast = (message: string): void => {
    toast.textContent = message;
    toast.dataset.active = "true";
    window.clearTimeout(runState.toastTimer);
    runState.toastTimer = window.setTimeout(() => {
      toast.dataset.active = "false";
    }, 2200);
  };

  const setText = (id: string, text: string): void => {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  };

  const startExpedition = (): void => {
    runState.active = true;
    runState.complete = false;
    runState.result = null;
    document.documentElement.dataset["glowfinMode"] = VERSION41_MODE;
    hud.dataset.active = "true";
    hud.dataset.state = "active";
    completion.dataset.active = "false";
    telemetry.track("tap_to_dive", {
      mode: "expedition",
      expedition: VERSION41_CONFIG.expeditionId,
      contentVersion: VERSION41_CONFIG.contentVersion,
      planHash: plan.planHash
    });
    document.getElementById("moonwell-dive")?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  };

  expeditionButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  expeditionButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startExpedition();
  });

  const eventListener = (event: Event): void => {
    const detail = (event as CustomEvent<Version41RuntimeEvent>).detail;
    if (!detail || !runState.active) return;
    if (detail.type === "ready") {
      hud.dataset.planHash = detail.planHash;
      hud.dataset.additionalDrawCalls = String(detail.budgets.additionalDrawCalls);
      hud.dataset.additionalTriangles = String(detail.budgets.additionalTriangles);
      hud.dataset.additionalMaterials = String(detail.budgets.additionalMaterials);
      return;
    }
    if (detail.type === "reset") {
      runState.complete = false;
      completion.dataset.active = "false";
      return;
    }
    if (detail.type === "segment") {
      hud.dataset.segment = detail.segment.kind;
      setText("v41-segment-title", detail.segment.title);
      setText("v41-objective", detail.segment.objective);
      setText("v41-timer", formatTimer(detail.elapsedSec));
      const fill = document.getElementById("v41-progress-fill");
      if (fill) fill.style.width = `${Math.min(100, detail.elapsedSec / VERSION41_CONFIG.durationSec * 100)}%`;
      telemetry.track("signature_obstacle", {
        content: "version41",
        encounter: detail.segment.kind,
        phase: "start",
        planHash: detail.planHash
      });
      showToast(detail.segment.title);
      return;
    }
    if (detail.type === "mote") {
      setText("v41-chain", `Chain ${detail.chain} · Best ${detail.bestChain}`);
      if (detail.chain > 0 && detail.chain % 8 === 0) {
        showToast(`${detail.chain} Lumen Chain`);
        telemetry.track("signature_obstacle", {
          content: "version41",
          encounter: "lumen-chain",
          chain: detail.chain,
          total: detail.moteCount
        });
      }
      return;
    }
    if (detail.type === "relic") {
      setText("v41-relic", detail.relicFound ? "Moonseed Fragment found" : "Relic route missed");
      showToast(detail.relicFound ? "Moonseed Fragment discovered" : "The relic current closed");
      if (detail.relicFound) {
        telemetry.track("reward_granted", {
          reward: "relic",
          relic: VERSION41_RELICS[0]?.id ?? "moonseed-fragment",
          source: VERSION41_CONFIG.expeditionId
        });
      }
      return;
    }
    if (detail.type === "rescue") {
      setText("v41-rescue", detail.miriRescued ? "Miri rescued" : `Miri ${detail.rescueLights}/3`);
      if (detail.miriRescued) {
        showToast("Miri is free—and swimming beside you");
        telemetry.track("living_world_event", {
          content: "version41",
          event: "miri-rescue",
          outcome: "success"
        });
      }
      return;
    }
    if (detail.type === "race") {
      const gap = Math.abs(detail.gapUnits).toFixed(1);
      setText("v41-race", detail.gapUnits >= 0 ? `Ahead of Neri ${gap}` : `Neri ahead ${gap}`);
      if (detail.complete) {
        showToast(detail.won ? "You edged ahead of Neri" : "Neri wins this current—rematch ready");
        telemetry.track("living_world_event", {
          content: "version41",
          event: "neri-race",
          outcome: detail.won ? "win" : "close-loss",
          gapBand: Math.min(20, Math.round(Math.abs(detail.gapUnits)))
        });
      }
      return;
    }
    if (detail.type === "chase") {
      setText("v41-chase", `Duskmaw gap ${detail.gapUnits.toFixed(1)} · ${detail.currentBreaks}/3`);
      if (detail.complete) {
        showToast(detail.succeeded ? "Duskmaw falls into the dark current" : "Glowfin recovers as the guardian intervenes");
        telemetry.track("living_world_event", {
          content: "version41",
          event: "duskmaw-chase",
          outcome: detail.succeeded ? "escaped" : "recovered",
          currentBreaks: detail.currentBreaks,
          gapBand: Math.round(detail.gapUnits)
        });
      }
      return;
    }
    if (detail.type === "complete" && !runState.complete) {
      runState.complete = true;
      runState.result = detail.result;
      hud.dataset.state = "complete";
      v41Progress = progressRepository.recordExpedition(v41Progress, {
        relicFound: detail.result.relicFound,
        moteChain: detail.result.bestChain,
        raceGapUnits: detail.result.raceGapUnits,
        chaseGapUnits: detail.result.chaseGapUnits,
        miriRescued: detail.result.miriRescued
      });
      document.getElementById("moonwell-hub")?.setAttribute("data-v41-restored", "true");
      const resultGrid = document.getElementById("v41-result-grid");
      if (resultGrid) {
        resultGrid.innerHTML = `
          <div><strong>${detail.result.bestChain}</strong><span>Best Lumen Chain</span></div>
          <div><strong>${detail.result.relicFound ? "Found" : "Missed"}</strong><span>Moonseed Fragment</span></div>
          <div><strong>${detail.result.miriRescued ? "Rescued" : `${detail.result.rescueLights}/3`}</strong><span>Miri</span></div>
          <div><strong>${detail.result.raceWon ? "Won" : "Close"}</strong><span>Race with Neri</span></div>
          <div><strong>${detail.result.currentBreaks}/3</strong><span>Current Breaks</span></div>
          <div><strong>${detail.result.chaseSucceeded ? "Escaped" : "Recovered"}</strong><span>Duskmaw</span></div>`;
      }
      completion.dataset.active = "true";
      telemetry.track("reward_granted", {
        reward: "moonwell-restoration",
        expedition: VERSION41_CONFIG.expeditionId,
        firstRestoration: v41Progress.expeditionCompletions === 1
      });
      telemetry.track("run_end", {
        mode: "expedition",
        expedition: VERSION41_CONFIG.expeditionId,
        outcome: "complete",
        seconds: Math.round(detail.elapsedSec),
        bestChain: detail.result.bestChain,
        relic: detail.result.relicFound,
        rescued: detail.result.miriRescued,
        raceWon: detail.result.raceWon,
        chase: detail.result.chaseSucceeded ? "escaped" : "recovered",
        planHash: detail.planHash
      });
      telemetry.flush();
    }
  };
  window.addEventListener(VERSION41_EVENT, eventListener);

  document.getElementById("v41-rematch")?.addEventListener("click", () => {
    telemetry.track("replay_start", {
      mode: "expedition-rematch",
      expedition: VERSION41_CONFIG.expeditionId,
      planHash: plan.planHash
    });
    telemetry.flush();
    try {
      window.sessionStorage.setItem(VERSION41_AUTO_START_KEY, "1");
    } catch {
      // Reload still returns to the hub when session storage is unavailable.
    }
    window.location.reload();
  });
  document.getElementById("v41-return")?.addEventListener("click", () => {
    try {
      window.sessionStorage.removeItem(VERSION41_AUTO_START_KEY);
    } catch {
      // Navigation remains safe without session storage.
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("expedition");
    url.searchParams.delete("v41qa");
    window.location.assign(url.toString());
  });

  window.addEventListener("pagehide", () => {
    if (runState.active && !runState.complete) {
      telemetry.track("run_end", {
        mode: "expedition",
        expedition: VERSION41_CONFIG.expeditionId,
        outcome: "abandoned"
      });
    }
    telemetry.flush();
  });

  let autoStart = false;
  try {
    autoStart = window.sessionStorage.getItem(VERSION41_AUTO_START_KEY) === "1";
    if (autoStart) window.sessionStorage.removeItem(VERSION41_AUTO_START_KEY);
  } catch {
    autoStart = false;
  }
  const query = new URLSearchParams(window.location.search);
  if (query.get("expedition") === VERSION41_EXPEDITION_QUERY) autoStart = true;
  if (autoStart) window.setTimeout(startExpedition, 0);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installVersion41Ui, { once: true });
} else {
  installVersion41Ui();
}
