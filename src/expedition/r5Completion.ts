import { gateSolvabilityOpening, type Gate } from "../sim/course";
import { CHAPTER_ONE_FIXED_SEED } from "./chapterOne";
import { r3TargetHit } from "./r3Encounters";

export type R5CompletionBeat =
  | "await-r3"
  | "duskmaw"
  | "return-moonwell"
  | "r5-complete";

export type R5Direction = "left" | "right" | "center" | "flow" | "complete";

export const R5_PLAN_REVISION = "v41-r5-clean-completion";
export const R5_BEAT_ORDER: readonly R5CompletionBeat[] = Object.freeze([
  "await-r3",
  "duskmaw",
  "return-moonwell",
  "r5-complete",
]);
export const R5_CURRENT_BREAK_TARGET = 3;
export const R5_DUSKMAW_MIN_SECONDS = 22;
export const R5_RETURN_MIN_SECONDS = 28;
export const R5_TARGET_COLLECT_RADIUS = 1.75;
export const R5_TARGET_RETURN_BEHIND_UNITS = 4;

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const R5_PLAN_HASH = checksumText(JSON.stringify({
  schemaVersion: 1,
  seed: CHAPTER_ONE_FIXED_SEED,
  revision: R5_PLAN_REVISION,
  beats: R5_BEAT_ORDER,
  minimumSeconds: {
    duskmaw: R5_DUSKMAW_MIN_SECONDS,
    returnMoonWell: R5_RETURN_MIN_SECONDS,
  },
  objectives: {
    currentBreaks: R5_CURRENT_BREAK_TARGET,
    ceremonialFinish: 1,
    moonWellRestoration: 1,
  },
}));

const CYAN = 0x74efff;
const GOLD = 0xffd56a;
const MOONSEED = 0xb98cff;
const DUSKMAW = 0x34205f;
const HIDDEN_DISTANCE = -10_000;

export interface R5MotionSample {
  fromDistance: number;
  toDistance: number;
  fromLateral: number;
  toLateral: number;
  elapsedSec: number;
  collisionCount: number;
  gates: readonly Gate[];
  laneHalfWidth: number;
  creatureRadius: number;
}

interface RouteTarget {
  distance: number;
  lateral: number;
  collectRadius: number;
}

export interface R5TargetPresentation {
  visible: boolean;
  role: "current-break" | "finish" | "restoration";
  distance: number;
  lateral: number;
  radius: number;
  colour: number;
}

export interface R5ActorPresentation {
  visible: boolean;
  distance: number;
  lateral: number;
  height: number;
  scale: number;
  colour: number;
}

export interface R5CompletionPresentation {
  active: boolean;
  beat: R5CompletionBeat;
  stageSeconds: number;
  targets: readonly [R5TargetPresentation, R5TargetPresentation];
  duskmaw: R5ActorPresentation;
  moonseed: R5ActorPresentation;
}

export interface R5CompletionSnapshot {
  active: boolean;
  beat: R5CompletionBeat;
  stageSeconds: number;
  currentBreaks: number;
  currentBreakMisses: number;
  chaseComplete: boolean;
  cleanChase: boolean;
  finishReached: boolean;
  moonWellRestored: boolean;
  r5Complete: boolean;
  targetDistance: number | null;
  targetLateral: number | null;
  direction: R5Direction;
}

export interface R5StepEvents {
  beatChangedFrom: R5CompletionBeat | null;
  beatChangedTo: R5CompletionBeat | null;
  currentBreakCollected: number;
  currentBreakReturned: boolean;
  chaseCompleted: boolean;
  finishReturned: boolean;
  finishReached: boolean;
  restorationCompleted: boolean;
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

function routeDirection(lateral: number): R5Direction {
  if (lateral < -0.75) return "left";
  if (lateral > 0.75) return "right";
  return "center";
}

function directionMatches(lateral: number, desired: R5Direction): boolean {
  if (desired === "left") return lateral <= -0.75;
  if (desired === "right") return lateral >= 0.75;
  if (desired === "center") return Math.abs(lateral) < 1.25;
  return true;
}

function routeTargetFor(
  motion: R5MotionSample,
  desired: R5Direction,
  minimumAhead = 48,
): RouteTarget {
  const candidates = motion.gates.filter(
    (gate) => gate.distance >= motion.toDistance + minimumAhead,
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
          R5_TARGET_COLLECT_RADIUS,
          (opening.gapRight - opening.gapLeft) * 0.5 - motion.creatureRadius,
        ),
      ),
    };
  }
  return {
    distance: motion.toDistance + Math.max(68, minimumAhead),
    lateral: desired === "left" ? -2.7 : desired === "right" ? 2.7 : 0,
    collectRadius: R5_TARGET_COLLECT_RADIUS,
  };
}

function target(
  role: R5TargetPresentation["role"],
  colour: number,
): R5TargetPresentation {
  return {
    visible: false,
    role,
    distance: HIDDEN_DISTANCE,
    lateral: 0,
    radius: 1,
    colour,
  };
}

function actor(colour: number): R5ActorPresentation {
  return {
    visible: false,
    distance: HIDDEN_DISTANCE,
    lateral: 0,
    height: 0,
    scale: 1,
    colour,
  };
}

function clearEvents(events: R5StepEvents): void {
  events.beatChangedFrom = null;
  events.beatChangedTo = null;
  events.currentBreakCollected = 0;
  events.currentBreakReturned = false;
  events.chaseCompleted = false;
  events.finishReturned = false;
  events.finishReached = false;
  events.restorationCompleted = false;
}

export class R5CompletionDirector {
  private active = false;
  private beat: R5CompletionBeat = "await-r3";
  private beatStartedElapsedSec = 0;
  private currentBreakTarget: RouteTarget | null = null;
  private currentBreaks = 0;
  private currentBreakMisses = 0;
  private chaseComplete = false;
  private finishTarget: RouteTarget | null = null;
  private finishReached = false;
  private moonWellRestored = false;
  private r5Complete = false;
  private readonly durationScale: number;
  private readonly events: R5StepEvents = {
    beatChangedFrom: null,
    beatChangedTo: null,
    currentBreakCollected: 0,
    currentBreakReturned: false,
    chaseCompleted: false,
    finishReturned: false,
    finishReached: false,
    restorationCompleted: false,
  };
  private readonly state: R5CompletionSnapshot = {
    active: false,
    beat: "await-r3",
    stageSeconds: 0,
    currentBreaks: 0,
    currentBreakMisses: 0,
    chaseComplete: false,
    cleanChase: true,
    finishReached: false,
    moonWellRestored: false,
    r5Complete: false,
    targetDistance: null,
    targetLateral: null,
    direction: "flow",
  };
  private readonly visual: R5CompletionPresentation = {
    active: false,
    beat: "await-r3",
    stageSeconds: 0,
    targets: [target("current-break", CYAN), target("finish", GOLD)],
    duskmaw: actor(DUSKMAW),
    moonseed: actor(MOONSEED),
  };

  constructor(options: { durationScale?: number } = {}) {
    this.durationScale = clamp(options.durationScale ?? 1, 1, 8);
  }

  reset(): void {
    this.active = false;
    this.beat = "await-r3";
    this.beatStartedElapsedSec = 0;
    this.currentBreakTarget = null;
    this.currentBreaks = 0;
    this.currentBreakMisses = 0;
    this.chaseComplete = false;
    this.finishTarget = null;
    this.finishReached = false;
    this.moonWellRestored = false;
    this.r5Complete = false;
    clearEvents(this.events);
    this.syncState(0);
    this.hideVisuals();
  }

  startAfterR3(motion: R5MotionSample): void {
    this.reset();
    this.active = true;
    this.beat = "duskmaw";
    this.beatStartedElapsedSec = motion.elapsedSec;
    this.currentBreakTarget = routeTargetFor(motion, "left", 42);
    this.syncState(0);
    this.updatePresentation(motion.toDistance, 0);
  }

  stop(): void {
    this.active = false;
    this.state.active = false;
    this.visual.active = false;
    this.hideVisuals();
  }

  step(motion: R5MotionSample): R5StepEvents {
    clearEvents(this.events);
    if (!this.active || motion.toDistance < motion.fromDistance) {
      return this.events;
    }

    if (this.beat === "duskmaw") {
      this.updateDuskmaw(motion);
      if (
        this.currentBreaks >= R5_CURRENT_BREAK_TARGET &&
        this.stageSeconds(motion.elapsedSec) >= R5_DUSKMAW_MIN_SECONDS
      ) {
        this.chaseComplete = true;
        this.events.chaseCompleted = true;
        this.enterBeat("return-moonwell", motion);
      }
    } else if (this.beat === "return-moonwell") {
      this.updateFinish(motion);
      if (
        this.finishReached &&
        this.stageSeconds(motion.elapsedSec) >= R5_RETURN_MIN_SECONDS
      ) {
        this.moonWellRestored = true;
        this.r5Complete = true;
        this.events.restorationCompleted = true;
        this.enterBeat("r5-complete", motion);
      }
    }

    const stageSeconds = this.stageSeconds(motion.elapsedSec);
    this.syncState(stageSeconds);
    this.updatePresentation(motion.toDistance, stageSeconds);
    return this.events;
  }

  snapshot(): Readonly<R5CompletionSnapshot> {
    return this.state;
  }

  presentation(): Readonly<R5CompletionPresentation> {
    return this.visual;
  }

  private stageSeconds(elapsedSec: number): number {
    return Math.max(0, elapsedSec - this.beatStartedElapsedSec) * this.durationScale;
  }

  private enterBeat(next: R5CompletionBeat, motion: R5MotionSample): void {
    const previous = this.beat;
    this.beat = next;
    this.beatStartedElapsedSec = motion.elapsedSec;
    this.events.beatChangedFrom = previous;
    this.events.beatChangedTo = next;
    if (next === "return-moonwell") {
      this.currentBreakTarget = null;
      this.finishTarget = routeTargetFor(motion, "center", 58);
    }
    if (next === "r5-complete") this.finishTarget = null;
  }

  private updateDuskmaw(motion: R5MotionSample): void {
    if (this.currentBreaks >= R5_CURRENT_BREAK_TARGET) return;
    const desired: R5Direction = this.currentBreaks === 0
      ? "left"
      : this.currentBreaks === 1
        ? "right"
        : "center";
    if (!this.currentBreakTarget) {
      this.currentBreakTarget = routeTargetFor(motion, desired, 42);
    }
    const current = this.currentBreakTarget;
    if (
      motion.toDistance >= current.distance &&
      r3TargetHit(
        motion,
        current.distance,
        current.lateral,
        current.collectRadius,
      )
    ) {
      this.currentBreaks += 1;
      this.events.currentBreakCollected = this.currentBreaks;
      if (this.currentBreaks >= R5_CURRENT_BREAK_TARGET) {
        this.currentBreakTarget = null;
      } else {
        const nextDirection: R5Direction = this.currentBreaks === 1
          ? "right"
          : "center";
        this.currentBreakTarget = routeTargetFor(motion, nextDirection, 42);
      }
    } else if (
      motion.toDistance > current.distance + R5_TARGET_RETURN_BEHIND_UNITS
    ) {
      this.currentBreakMisses += 1;
      this.events.currentBreakReturned = true;
      this.currentBreakTarget = routeTargetFor(motion, desired, 38);
    }
  }

  private updateFinish(motion: R5MotionSample): void {
    if (this.finishReached) return;
    if (!this.finishTarget) {
      this.finishTarget = routeTargetFor(motion, "center", 58);
    }
    const current = this.finishTarget;
    if (
      motion.toDistance >= current.distance &&
      r3TargetHit(
        motion,
        current.distance,
        current.lateral,
        current.collectRadius,
      )
    ) {
      this.finishReached = true;
      this.events.finishReached = true;
    } else if (
      motion.toDistance > current.distance + R5_TARGET_RETURN_BEHIND_UNITS
    ) {
      this.events.finishReturned = true;
      this.finishTarget = routeTargetFor(motion, "center", 46);
    }
  }

  private currentTarget(): RouteTarget | null {
    if (this.beat === "duskmaw") return this.currentBreakTarget;
    if (this.beat === "return-moonwell" && !this.finishReached) {
      return this.finishTarget;
    }
    return null;
  }

  private syncState(stageSeconds: number): void {
    const current = this.currentTarget();
    this.state.active = this.active;
    this.state.beat = this.beat;
    this.state.stageSeconds = stageSeconds;
    this.state.currentBreaks = this.currentBreaks;
    this.state.currentBreakMisses = this.currentBreakMisses;
    this.state.chaseComplete = this.chaseComplete;
    this.state.cleanChase = this.currentBreakMisses === 0;
    this.state.finishReached = this.finishReached;
    this.state.moonWellRestored = this.moonWellRestored;
    this.state.r5Complete = this.r5Complete;
    this.state.targetDistance = current?.distance ?? null;
    this.state.targetLateral = current?.lateral ?? null;
    this.state.direction = this.beat === "r5-complete"
      ? "complete"
      : current
        ? routeDirection(current.lateral)
        : "flow";
  }

  private hideVisuals(): void {
    for (const item of this.visual.targets) item.visible = false;
    this.visual.duskmaw.visible = false;
    this.visual.moonseed.visible = false;
  }

  private updatePresentation(playerDistance: number, stageSeconds: number): void {
    this.hideVisuals();
    this.visual.active = this.active;
    this.visual.beat = this.beat;
    this.visual.stageSeconds = stageSeconds;
    if (!this.active) return;

    if (this.beat === "duskmaw") {
      this.placeActor(
        this.visual.duskmaw,
        playerDistance - clamp(8 + this.currentBreaks * 2.5, 8, 14),
        Math.sin(stageSeconds * 0.42) * 2.8,
        0.8,
        1.8,
      );
      if (this.currentBreakTarget) {
        const currentBreak = this.visual.targets[0];
        currentBreak.visible = true;
        currentBreak.role = "current-break";
        currentBreak.distance = this.currentBreakTarget.distance;
        currentBreak.lateral = this.currentBreakTarget.lateral;
        currentBreak.radius = 1.7;
        currentBreak.colour = CYAN;
      }
      return;
    }

    if (this.beat === "return-moonwell") {
      this.placeActor(
        this.visual.duskmaw,
        playerDistance - 22 - Math.min(18, stageSeconds * 0.7),
        2.7,
        0.2,
        1.3,
      );
      if (this.finishTarget) {
        const finish = this.visual.targets[1];
        finish.visible = true;
        finish.role = this.finishReached ? "restoration" : "finish";
        finish.distance = this.finishTarget.distance;
        finish.lateral = this.finishTarget.lateral;
        finish.radius = this.finishReached ? 2.55 : 2.15;
        finish.colour = this.finishReached ? MOONSEED : GOLD;
        this.placeActor(
          this.visual.moonseed,
          this.finishTarget.distance,
          this.finishTarget.lateral,
          0.55,
          this.finishReached ? 1.4 : 1,
        );
      }
      return;
    }

    if (this.beat === "r5-complete") {
      this.placeActor(this.visual.moonseed, playerDistance + 5, 0, 1.2, 1.6);
    }
  }

  private placeActor(
    presentation: R5ActorPresentation,
    distance: number,
    lateral: number,
    height: number,
    scale: number,
  ): void {
    presentation.visible = true;
    presentation.distance = distance;
    presentation.lateral = lateral;
    presentation.height = height;
    presentation.scale = scale;
  }
}
