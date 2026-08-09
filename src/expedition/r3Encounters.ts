import { gateSolvabilityOpening, type Gate } from "../sim/course";
import { CHAPTER_ONE_FIXED_SEED } from "./chapterOne";
import type { LumenMoteSnapshot } from "./lumenMotes";

export type R3EncounterBeat =
  | "follow-light"
  | "relic-fork"
  | "rescue-miri"
  | "race-neri"
  | "r3-complete";

export type R3Direction = "left" | "right" | "center" | "flow" | "complete";

export const R3_PLAN_REVISION = "v41-r3-objective-gated";
export const R3_BEAT_ORDER: readonly R3EncounterBeat[] = Object.freeze([
  "follow-light",
  "relic-fork",
  "rescue-miri",
  "race-neri",
  "r3-complete",
]);
export const R3_RELIC_MIN_SECONDS = 22;
export const R3_RESCUE_MIN_SECONDS = 25;
export const R3_RACE_MIN_SECONDS = 28;
export const R3_RESCUE_LIGHT_TARGET = 3;
export const R3_RACE_GATE_TARGET = 3;
export const R3_TARGET_COLLECT_RADIUS = 1.75;
export const R3_TARGET_RETURN_BEHIND_UNITS = 4;
export const R3_RIVAL_SPEED_UNITS_PER_SEC = 34;
export const R3_RIVAL_VISUAL_GAP_UNITS = 7;

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const R3_PLAN_HASH = checksumText(JSON.stringify({
  schemaVersion: 1,
  seed: CHAPTER_ONE_FIXED_SEED,
  revision: R3_PLAN_REVISION,
  beats: R3_BEAT_ORDER,
  minimumSeconds: {
    relic: R3_RELIC_MIN_SECONDS,
    rescue: R3_RESCUE_MIN_SECONDS,
    race: R3_RACE_MIN_SECONDS,
  },
  objectives: {
    rescueLights: R3_RESCUE_LIGHT_TARGET,
    raceGates: R3_RACE_GATE_TARGET,
  },
}));

const CYAN = 0x7defff;
const GOLD = 0xffcf58;
const MIRI = 0x65f3dc;
const CHARACTER_TINT = 0xffffff;
const HIDDEN_DISTANCE = -10_000;

export interface R3MotionSample {
  fromDistance: number;
  toDistance: number;
  fromLateral: number;
  toLateral: number;
  elapsedSec: number;
  collisionCount: number;
  gates: readonly Gate[];
  laneHalfWidth: number;
  creatureRadius: number;
  lumen: LumenMoteSnapshot;
}

export interface R3RingPresentation {
  visible: boolean;
  role: "safe" | "relic" | "rescue" | "race";
  distance: number;
  lateral: number;
  radius: number;
  colour: number;
}

export interface R3ActorPresentation {
  visible: boolean;
  distance: number;
  lateral: number;
  height: number;
  scale: number;
  colour: number;
}

export interface R3EncounterPresentation {
  active: boolean;
  beat: R3EncounterBeat;
  stageSeconds: number;
  rings: readonly [R3RingPresentation, R3RingPresentation];
  relic: R3ActorPresentation;
  miri: R3ActorPresentation;
  neri: R3ActorPresentation;
}

export interface R3EncounterSnapshot {
  active: boolean;
  beat: R3EncounterBeat;
  stageSeconds: number;
  relicResolved: boolean;
  relicFound: boolean;
  rescueLights: number;
  miriRescued: boolean;
  raceGates: number;
  raceGap: number;
  r3Complete: boolean;
  targetDistance: number | null;
  targetLateral: number | null;
  direction: R3Direction;
}

export interface R3StepEvents {
  beatChangedFrom: R3EncounterBeat | null;
  beatChangedTo: R3EncounterBeat | null;
  relicResolved: "found" | "safe-route" | null;
  rescueLightCollected: number;
  rescueLightReturned: boolean;
  miriRescued: boolean;
  raceGateCollected: number;
  raceGateReturned: boolean;
  raceCompleted: boolean;
}

interface RouteTarget {
  distance: number;
  lateral: number;
  collectRadius: number;
}

interface RelicTarget extends RouteTarget {
  safeLateral: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function openingCenter(
  gate: Gate,
  laneHalfWidth: number,
  creatureRadius: number,
): number {
  const opening = gateSolvabilityOpening(gate);
  const minimum = opening.gapLeft + creatureRadius;
  const maximum = opening.gapRight - creatureRadius;
  return clamp(
    (minimum + maximum) * 0.5,
    -laneHalfWidth + creatureRadius,
    laneHalfWidth - creatureRadius,
  );
}

function routeDirection(lateral: number): R3Direction {
  if (lateral < -0.75) return "left";
  if (lateral > 0.75) return "right";
  return "center";
}

function directionMatches(lateral: number, desired: R3Direction): boolean {
  if (desired === "left") return lateral <= -0.75;
  if (desired === "right") return lateral >= 0.75;
  if (desired === "center") return Math.abs(lateral) < 1.25;
  return true;
}

function futureGates(
  gates: readonly Gate[],
  afterDistance: number,
): readonly Gate[] {
  return gates.filter((gate) => gate.distance >= afterDistance);
}

function routeTargetFor(
  motion: R3MotionSample,
  desired: R3Direction,
  minimumAhead = 54,
): RouteTarget {
  const candidates = futureGates(
    motion.gates,
    motion.toDistance + minimumAhead,
  );
  const matching = candidates.find((gate) => directionMatches(
    openingCenter(gate, motion.laneHalfWidth, motion.creatureRadius),
    desired,
  ));
  const fallback = matching ?? candidates[0];
  if (fallback) {
    const opening = gateSolvabilityOpening(fallback);
    return {
      distance: fallback.distance,
      lateral: openingCenter(
        fallback,
        motion.laneHalfWidth,
        motion.creatureRadius,
      ),
      collectRadius: Math.max(
        0.18,
        Math.min(
          R3_TARGET_COLLECT_RADIUS,
          (opening.gapRight - opening.gapLeft) * 0.5 -
            motion.creatureRadius,
        ),
      ),
    };
  }
  return {
    distance: motion.toDistance + Math.max(72, minimumAhead),
    lateral: desired === "left" ? -2.8 : desired === "right" ? 2.8 : 0,
    collectRadius: R3_TARGET_COLLECT_RADIUS,
  };
}

function relicTargetFor(motion: R3MotionSample): RelicTarget {
  const candidates = futureGates(motion.gates, motion.toDistance + 62);
  const choice = candidates.find((gate) =>
    gate.obstaclePlan?.verb === "moonflash-choice"
  );
  if (choice?.obstaclePlan?.verb === "moonflash-choice") {
    const safe = choice.obstaclePlan.openings.find((opening) =>
      opening.route === "safe"
    );
    const risk = choice.obstaclePlan.openings.find((opening) =>
      opening.route === "moonflash"
    );
    if (safe && risk) {
      return {
        distance: choice.distance,
        lateral: (risk.left + risk.right) * 0.5,
        safeLateral: (safe.left + safe.right) * 0.5,
        collectRadius: Math.max(
          0.18,
          Math.min(
            R3_TARGET_COLLECT_RADIUS,
            (risk.right - risk.left) * 0.5 - motion.creatureRadius,
          ),
        ),
      };
    }
  }

  const safe = routeTargetFor(motion, "center", 72);
  const outerRight = motion.laneHalfWidth - motion.creatureRadius - 0.55;
  return {
    distance: safe.distance,
    lateral: clamp(outerRight, 2.8, 4.95),
    safeLateral: safe.lateral,
    collectRadius: R3_TARGET_COLLECT_RADIUS,
  };
}

/** Swept contact keeps mission pickups truthful at 30–120 Hz. */
export function r3TargetHit(
  motion: Pick<
    R3MotionSample,
    "fromDistance" | "toDistance" | "fromLateral" | "toLateral"
  >,
  targetDistance: number,
  targetLateral: number,
  radius = R3_TARGET_COLLECT_RADIUS,
): boolean {
  const distanceDelta = motion.toDistance - motion.fromDistance;
  const lateralDelta = motion.toLateral - motion.fromLateral;
  const lengthSquared = distanceDelta * distanceDelta + lateralDelta * lateralDelta;
  const progress = lengthSquared <= 1e-9
    ? 0
    : clamp(
      ((targetDistance - motion.fromDistance) * distanceDelta +
        (targetLateral - motion.fromLateral) * lateralDelta) / lengthSquared,
      0,
      1,
    );
  const closestDistance = motion.fromDistance + distanceDelta * progress;
  const closestLateral = motion.fromLateral + lateralDelta * progress;
  const forwardGap = targetDistance - closestDistance;
  const lateralGap = targetLateral - closestLateral;
  return forwardGap * forwardGap + lateralGap * lateralGap <= radius * radius;
}

function actor(colour: number): R3ActorPresentation {
  return {
    visible: false,
    distance: HIDDEN_DISTANCE,
    lateral: 0,
    height: 0,
    scale: 1,
    colour,
  };
}

function ring(role: R3RingPresentation["role"], colour: number): R3RingPresentation {
  return {
    visible: false,
    role,
    distance: HIDDEN_DISTANCE,
    lateral: 0,
    radius: 1,
    colour,
  };
}

function clearEvents(events: R3StepEvents): void {
  events.beatChangedFrom = null;
  events.beatChangedTo = null;
  events.relicResolved = null;
  events.rescueLightCollected = 0;
  events.rescueLightReturned = false;
  events.miriRescued = false;
  events.raceGateCollected = 0;
  events.raceGateReturned = false;
  events.raceCompleted = false;
}

export class R3EncounterDirector {
  private active = false;
  private beat: R3EncounterBeat = "follow-light";
  private beatStartedElapsedSec = 0;
  private relicTarget: RelicTarget | null = null;
  private relicResolved = false;
  private relicFound = false;
  private rescueTarget: RouteTarget | null = null;
  private rescueLights = 0;
  private miriRescued = false;
  private raceTarget: RouteTarget | null = null;
  private raceGates = 0;
  private raceGap = 0;
  private raceOriginDistance = 0;
  private r3Complete = false;
  private readonly durationScale: number;
  private readonly events: R3StepEvents = {
    beatChangedFrom: null,
    beatChangedTo: null,
    relicResolved: null,
    rescueLightCollected: 0,
    rescueLightReturned: false,
    miriRescued: false,
    raceGateCollected: 0,
    raceGateReturned: false,
    raceCompleted: false,
  };
  private readonly state: R3EncounterSnapshot = {
    active: false,
    beat: "follow-light",
    stageSeconds: 0,
    relicResolved: false,
    relicFound: false,
    rescueLights: 0,
    miriRescued: false,
    raceGates: 0,
    raceGap: 0,
    r3Complete: false,
    targetDistance: null,
    targetLateral: null,
    direction: "flow",
  };
  private readonly visual: R3EncounterPresentation = {
    active: false,
    beat: "follow-light",
    stageSeconds: 0,
    rings: [ring("safe", CYAN), ring("relic", GOLD)],
    relic: actor(GOLD),
    miri: actor(CHARACTER_TINT),
    neri: actor(CHARACTER_TINT),
  };

  constructor(options: { durationScale?: number } = {}) {
    this.durationScale = clamp(options.durationScale ?? 1, 1, 8);
  }

  start(startDistance = 0, elapsedSec = 0): void {
    this.active = true;
    this.beat = "follow-light";
    this.beatStartedElapsedSec = elapsedSec;
    this.relicTarget = null;
    this.relicResolved = false;
    this.relicFound = false;
    this.rescueTarget = null;
    this.rescueLights = 0;
    this.miriRescued = false;
    this.raceTarget = null;
    this.raceGates = 0;
    this.raceGap = 0;
    this.raceOriginDistance = 0;
    this.r3Complete = false;
    clearEvents(this.events);
    this.syncState(0);
    this.updatePresentation(startDistance, 0);
  }

  stop(): void {
    this.active = false;
    this.visual.active = false;
    this.state.active = false;
    this.hideVisuals();
  }

  step(motion: R3MotionSample): R3StepEvents {
    clearEvents(this.events);
    if (!this.active || motion.toDistance < motion.fromDistance) {
      return this.events;
    }

    if (this.beat === "follow-light") {
      if (motion.lumen.objectiveComplete) this.enterBeat("relic-fork", motion);
    } else if (this.beat === "relic-fork") {
      this.updateRelic(motion);
      if (this.relicResolved && this.stageSeconds(motion.elapsedSec) >= R3_RELIC_MIN_SECONDS) {
        this.enterBeat("rescue-miri", motion);
      }
    } else if (this.beat === "rescue-miri") {
      this.updateRescue(motion);
      if (
        this.miriRescued &&
        this.stageSeconds(motion.elapsedSec) >= R3_RESCUE_MIN_SECONDS
      ) {
        this.enterBeat("race-neri", motion);
      }
    } else if (this.beat === "race-neri") {
      this.updateRace(motion);
      if (
        this.raceGates >= R3_RACE_GATE_TARGET &&
        this.raceGap >= 0 &&
        this.stageSeconds(motion.elapsedSec) >= R3_RACE_MIN_SECONDS
      ) {
        this.r3Complete = true;
        this.events.raceCompleted = true;
        this.enterBeat("r3-complete", motion);
      }
    }

    const stageSeconds = this.stageSeconds(motion.elapsedSec);
    this.syncState(stageSeconds);
    this.updatePresentation(motion.toDistance, stageSeconds);
    return this.events;
  }

  snapshot(): Readonly<R3EncounterSnapshot> {
    return this.state;
  }

  presentation(): Readonly<R3EncounterPresentation> {
    return this.visual;
  }

  private stageSeconds(elapsedSec: number): number {
    return Math.max(0, elapsedSec - this.beatStartedElapsedSec) * this.durationScale;
  }

  private enterBeat(next: R3EncounterBeat, motion: R3MotionSample): void {
    const previous = this.beat;
    this.beat = next;
    this.beatStartedElapsedSec = motion.elapsedSec;
    this.events.beatChangedFrom = previous;
    this.events.beatChangedTo = next;
    if (next === "relic-fork") this.relicTarget = relicTargetFor(motion);
    if (next === "rescue-miri") {
      this.rescueTarget = routeTargetFor(motion, "left");
    }
    if (next === "race-neri") {
      this.raceOriginDistance = motion.toDistance;
      this.raceTarget = routeTargetFor(motion, "flow");
    }
  }

  private updateRelic(motion: R3MotionSample): void {
    if (!this.relicTarget) this.relicTarget = relicTargetFor(motion);
    const target = this.relicTarget;
    if (this.relicResolved) return;
    if (
      motion.toDistance >= target.distance &&
      r3TargetHit(
        motion,
        target.distance,
        target.lateral,
        target.collectRadius,
      )
    ) {
      this.relicResolved = true;
      this.relicFound = true;
      this.events.relicResolved = "found";
    } else if (motion.toDistance > target.distance + R3_TARGET_RETURN_BEHIND_UNITS) {
      this.relicResolved = true;
      this.events.relicResolved = "safe-route";
    }
  }

  private updateRescue(motion: R3MotionSample): void {
    if (this.rescueLights >= R3_RESCUE_LIGHT_TARGET) return;
    const desired: R3Direction = this.rescueLights === 0
      ? "left"
      : this.rescueLights === 1
        ? "right"
        : "center";
    if (!this.rescueTarget) this.rescueTarget = routeTargetFor(motion, desired);
    const target = this.rescueTarget;
    if (
      motion.toDistance >= target.distance &&
      r3TargetHit(
        motion,
        target.distance,
        target.lateral,
        target.collectRadius,
      )
    ) {
      this.rescueLights += 1;
      this.events.rescueLightCollected = this.rescueLights;
      if (this.rescueLights >= R3_RESCUE_LIGHT_TARGET) {
        this.rescueTarget = null;
        this.miriRescued = true;
        this.events.miriRescued = true;
      } else {
        const nextDesired: R3Direction = this.rescueLights === 1
          ? "right"
          : "center";
        this.rescueTarget = routeTargetFor(motion, nextDesired);
      }
    } else if (motion.toDistance > target.distance + R3_TARGET_RETURN_BEHIND_UNITS) {
      this.events.rescueLightReturned = true;
      this.rescueTarget = routeTargetFor(motion, desired, 44);
    }
  }

  private updateRace(motion: R3MotionSample): void {
    const stageSeconds = this.stageSeconds(motion.elapsedSec);
    this.raceGap = motion.toDistance -
      (this.raceOriginDistance + R3_RIVAL_SPEED_UNITS_PER_SEC * stageSeconds /
        this.durationScale);
    if (this.raceGates >= R3_RACE_GATE_TARGET) return;
    if (!this.raceTarget) this.raceTarget = routeTargetFor(motion, "flow");
    const target = this.raceTarget;
    if (
      motion.toDistance >= target.distance &&
      r3TargetHit(
        motion,
        target.distance,
        target.lateral,
        target.collectRadius,
      )
    ) {
      this.raceGates += 1;
      this.events.raceGateCollected = this.raceGates;
      this.raceTarget = this.raceGates >= R3_RACE_GATE_TARGET
        ? null
        : routeTargetFor(motion, "flow");
    } else if (motion.toDistance > target.distance + R3_TARGET_RETURN_BEHIND_UNITS) {
      this.events.raceGateReturned = true;
      this.raceTarget = routeTargetFor(motion, "flow", 44);
    }
  }

  private syncState(stageSeconds: number): void {
    const target = this.currentTarget();
    this.state.active = this.active;
    this.state.beat = this.beat;
    this.state.stageSeconds = stageSeconds;
    this.state.relicResolved = this.relicResolved;
    this.state.relicFound = this.relicFound;
    this.state.rescueLights = this.rescueLights;
    this.state.miriRescued = this.miriRescued;
    this.state.raceGates = this.raceGates;
    this.state.raceGap = this.raceGap;
    this.state.r3Complete = this.r3Complete;
    this.state.targetDistance = target?.distance ?? null;
    this.state.targetLateral = target?.lateral ?? null;
    this.state.direction = this.directionForTarget(target);
  }

  private currentTarget(): RouteTarget | null {
    if (this.beat === "relic-fork" && !this.relicResolved) return this.relicTarget;
    if (this.beat === "rescue-miri" && !this.miriRescued) return this.rescueTarget;
    if (this.beat === "race-neri" && this.raceGates < R3_RACE_GATE_TARGET) {
      return this.raceTarget;
    }
    return null;
  }

  private directionForTarget(target: RouteTarget | null): R3Direction {
    if (this.beat === "follow-light") return "flow";
    if (this.beat === "r3-complete") return "complete";
    if (this.beat === "relic-fork") {
      return target ? routeDirection(target.lateral) : "flow";
    }
    return target ? routeDirection(target.lateral) : "flow";
  }

  private hideVisuals(): void {
    for (const item of this.visual.rings) item.visible = false;
    this.visual.relic.visible = false;
    this.visual.miri.visible = false;
    this.visual.neri.visible = false;
  }

  private updatePresentation(playerDistance: number, stageSeconds: number): void {
    this.hideVisuals();
    this.visual.active = this.active;
    this.visual.beat = this.beat;
    this.visual.stageSeconds = stageSeconds;
    if (!this.active) return;

    if (this.beat === "follow-light") {
      this.placeActor(this.visual.neri, playerDistance + 11, -2.7, 0.28, 1.35);
      return;
    }

    if (this.beat === "relic-fork") {
      this.placeActor(this.visual.neri, playerDistance + 8, -2.8, 0.3, 1.35);
      if (!this.relicResolved && this.relicTarget) {
        const safe = this.visual.rings[0];
        safe.visible = true;
        safe.role = "safe";
        safe.distance = this.relicTarget.distance;
        safe.lateral = this.relicTarget.safeLateral;
        safe.radius = 1.85;
        safe.colour = CYAN;
        const risk = this.visual.rings[1];
        risk.visible = true;
        risk.role = "relic";
        risk.distance = this.relicTarget.distance;
        risk.lateral = this.relicTarget.lateral;
        risk.radius = 1.28;
        risk.colour = GOLD;
        this.placeActor(
          this.visual.relic,
          this.relicTarget.distance,
          this.relicTarget.lateral,
          0.62,
          1,
        );
      }
      return;
    }

    if (this.beat === "rescue-miri") {
      const rescueProgress = this.rescueLights / R3_RESCUE_LIGHT_TARGET;
      const targetLateral = this.rescueTarget?.lateral ?? -2.9;
      const miriDistance = this.miriRescued
        ? playerDistance - 2.6
        : playerDistance + 13 - rescueProgress * 2.4;
      this.placeActor(
        this.visual.miri,
        miriDistance,
        this.miriRescued ? 3.1 : targetLateral > 0 ? -3.2 : 3.2,
        this.miriRescued ? 0.32 : 0.82,
        this.miriRescued ? 1.25 : 1.34,
      );
      if (!this.miriRescued && this.rescueTarget) {
        const rescue = this.visual.rings[0];
        rescue.visible = true;
        rescue.role = "rescue";
        rescue.distance = this.rescueTarget.distance;
        rescue.lateral = this.rescueTarget.lateral;
        rescue.radius = 1.5;
        rescue.colour = MIRI;
      }
      return;
    }

    if (this.beat === "race-neri") {
      this.placeActor(this.visual.miri, playerDistance - 2.8, 3.25, 0.24, 1.2);
      const visualGap = clamp(
        this.raceGap,
        -R3_RIVAL_VISUAL_GAP_UNITS,
        R3_RIVAL_VISUAL_GAP_UNITS,
      );
      this.placeActor(
        this.visual.neri,
        playerDistance - visualGap,
        -2.75,
        0.28,
        1.45,
      );
      if (this.raceGates < R3_RACE_GATE_TARGET && this.raceTarget) {
        const race = this.visual.rings[0];
        race.visible = true;
        race.role = "race";
        race.distance = this.raceTarget.distance;
        race.lateral = this.raceTarget.lateral;
        race.radius = 1.65;
        race.colour = CYAN;
      }
      return;
    }

    this.placeActor(this.visual.miri, playerDistance - 2.5, 3.1, 0.3, 1.28);
    this.placeActor(this.visual.neri, playerDistance + 4, -2.7, 0.34, 1.42);
  }

  private placeActor(
    actorPresentation: R3ActorPresentation,
    distance: number,
    lateral: number,
    height: number,
    scale: number,
  ): void {
    actorPresentation.visible = true;
    actorPresentation.distance = distance;
    actorPresentation.lateral = lateral;
    actorPresentation.height = height;
    actorPresentation.scale = scale;
  }
}
