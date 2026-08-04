/**
 * Run orchestration — the complete core loop (Part 2.2-2.5).
 *
 * Owns the simulation, course, scoring, and the light resource, and wires
 * collision results into all of them. Everything here is deterministic given
 * (seed, input sequence, frame timings), which is what replay and ghosts
 * depend on later.
 */
import type { TuningConfig } from "../core/config";
import {
  type SimState,
  createSimState,
  cloneSimState,
  stepSim,
  applyCollision
} from "./state";
import { CourseGenerator, type Gate } from "./course";
import { evaluateStep, isNearMiss, firstGateAtOrBeyond } from "./collision";
import {
  type ScoringState,
  createScoringState,
  cloneScoringState,
  registerNearMiss,
  stepScoring
} from "./scoring";

export type RunEndReason = "light-depleted";

export interface RunSnapshot {
  sim: SimState;
  scoring: ScoringState;
  light: number;
  collisionCount: number;
  ended: boolean;
  endReason: RunEndReason | null;
}

/** What happened during one step — hooks for audio and VFX in later phases. */
export interface StepEvents {
  nearMisses: number;
  collisions: number;
  /** Sparse, bounded gate outcomes for replay-safe telemetry. */
  encounters: readonly RunEncounter[];
  /** True on the step the run ended, not on subsequent steps. */
  justEnded: boolean;
}

export interface RunEncounter {
  kind: "near-miss" | "collision";
  clearance: number;
  distance: number;
  tier: number;
  templateId: string;
}

const NO_EVENTS: StepEvents = {
  nearMisses: 0,
  collisions: 0,
  encounters: [],
  justEnded: false
};

/**
 * How far behind the player gates are kept before disposal. Generous enough
 * that anything still on screen survives — the camera sits behind the creature,
 * so "passed" is not the same as "not visible".
 */
const GATE_KEEP_BEHIND_UNITS = 40;

export class Run {
  readonly sim: SimState;
  readonly scoring: ScoringState;
  private readonly course: CourseGenerator;

  light: number;
  collisionCount = 0;
  ended = false;
  endReason: RunEndReason | null = null;

  private secondsSinceCollision = Number.POSITIVE_INFINITY;
  private slowMoRemainingSec = 0;
  /** Scan cursor: gates before this index are behind the player. */
  private gateCursor = 0;

  constructor(
    readonly seed: number,
    private readonly cfg: TuningConfig
  ) {
    this.sim = createSimState();
    this.scoring = createScoringState(cfg);
    this.course = new CourseGenerator(seed, cfg);
    this.light = cfg.light.max;
    this.course.ensureGeneratedTo(cfg.readability.visibleAheadUnits * 3);
  }

  /** Gates generated so far. The renderer draws from this. */
  get gates(): readonly Gate[] {
    return this.course.gates;
  }

  /**
   * Time scale to apply to wall-clock frame time before feeding the fixed-step
   * accumulator. Drives the near-miss slow-mo beat (Part 2.3).
   *
   * Deliberately *not* applied inside the sim step: the simulation always runs
   * at a fixed dt. Slow-mo just means fewer steps are earned per real second,
   * which keeps determinism intact.
   */
  get timeScale(): number {
    return this.slowMoRemainingSec > 0 ? this.cfg.scoring.nearMissSlowMoTimeScale : 1;
  }

  get isInSlowMo(): boolean {
    return this.slowMoRemainingSec > 0;
  }

  /** Advance one fixed simulation step. */
  step(dtSec: number, steeringTarget: number): StepEvents {
    if (this.ended) return NO_EVENTS;

    const cfg = this.cfg;
    const previousDistance = this.sim.forwardDistance;
    const previousLateral = this.sim.lateralPosition;

    stepSim(this.sim, steeringTarget, dtSec, cfg);

    const distanceTravelled = this.sim.forwardDistance - previousDistance;

    // Keep the course generated comfortably beyond what the player can see.
    this.course.ensureGeneratedTo(
      this.sim.forwardDistance + cfg.readability.visibleAheadUnits * 3
    );

    // --- resolve gates crossed this step ---
    let nearMisses = 0;
    let collisions = 0;
    const encounters: RunEncounter[] = [];

    const passes = evaluateStep(
      {
        fromDistance: previousDistance,
        toDistance: this.sim.forwardDistance,
        fromLateral: previousLateral,
        toLateral: this.sim.lateralPosition
      },
      this.course.gates,
      cfg,
      this.gateCursor
    );

    for (const pass of passes) {
      if (pass.collided) {
        // applyCollision returns false during i-frames, in which case no light
        // is lost either — otherwise a dense cluster would drain the run
        // through a grace period that is supposed to be protecting the player.
        if (applyCollision(this.sim, cfg)) {
          this.light -= cfg.light.costPerCollision;
          this.secondsSinceCollision = 0;
          this.collisionCount++;
          collisions++;
          encounters.push({
            kind: "collision",
            clearance: pass.clearance,
            distance: pass.gate.distance,
            tier: pass.gate.tier,
            templateId: pass.gate.templateId
          });
          // A collision cancels any in-flight celebration beat.
          this.slowMoRemainingSec = 0;
        }
      } else if (isNearMiss(pass, cfg) && registerNearMiss(this.scoring, cfg)) {
        nearMisses++;
        encounters.push({
          kind: "near-miss",
          clearance: pass.clearance,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId
        });
        this.slowMoRemainingSec = cfg.scoring.nearMissSlowMoDurationSec;
      }
    }

    // Advance the cursor past everything now behind us, then drop what is far
    // enough back to be both unreachable and off-screen. Pruning shifts every
    // index in the gate array, so the cursor is corrected by the same amount.
    this.gateCursor = firstGateAtOrBeyond(
      this.course.gates,
      previousDistance,
      this.gateCursor
    );
    const pruned = this.course.prune(this.sim.forwardDistance - GATE_KEEP_BEHIND_UNITS);
    if (pruned > 0) this.gateCursor = Math.max(0, this.gateCursor - pruned);

    // --- scoring ---
    stepScoring(this.scoring, distanceTravelled, dtSec, cfg);

    // --- light regen and run end (Part 2.4) ---
    this.secondsSinceCollision += dtSec;
    if (this.secondsSinceCollision > cfg.light.regenDelayAfterCollisionSec) {
      this.light = Math.min(cfg.light.max, this.light + cfg.light.regenPerSec * dtSec);
    }

    this.slowMoRemainingSec = Math.max(0, this.slowMoRemainingSec - dtSec);

    let justEnded = false;
    if (this.light <= 0) {
      this.light = 0;
      this.ended = true;
      this.endReason = "light-depleted";
      justEnded = true;
    }

    return { nearMisses, collisions, encounters, justEnded };
  }

  snapshot(): RunSnapshot {
    return {
      sim: cloneSimState(this.sim),
      scoring: cloneScoringState(this.scoring),
      light: this.light,
      collisionCount: this.collisionCount,
      ended: this.ended,
      endReason: this.endReason
    };
  }
}
