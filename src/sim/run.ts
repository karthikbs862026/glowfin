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
  registerChoiceRoute,
  registerNearMiss,
  stepScoring
} from "./scoring";
import {
  currentLaneForce,
  type ActiveLivingWorldEvent,
  type LivingWorldEventKind,
  type SignatureObstacleVerb
} from "./obstacleVariety";
import type { RealmId, RealmGameplayVerb } from "../realms/definition";
import {
  CRYSTAL_COMPLETE_COAST_DISTANCE,
  CRYSTAL_MIRROR_RACE_DISTANCE,
  CRYSTAL_NERI_SPEED_PER_SEC,
  CRYSTAL_NERI_START_LEAD,
  CRYSTAL_PLATES_TO_RACE,
  CRYSTAL_RACE_RETRY_DISTANCE,
  currentTunnelDirection,
  currentTunnelForce,
  type RealmEventKind,
} from "../realms/mechanics";

export type RunEndReason =
  | "light-depleted"
  | "expedition-complete"
  | "realm-complete";

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
  /** Sparse semantic Version 38 events for UI, audio and consented telemetry. */
  signatureEvents: readonly SignatureRunEvent[];
  /** Sparse Version 43 realm events sourced from the same collision truth. */
  realmEvents: readonly RealmRunEvent[];
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

export interface SignatureRunEvent {
  kind:
    | "safe-route"
    | "moonflash-route"
    | "shutter-pass"
    | "current-lane-enter"
    | "living-world";
  distance: number;
  tier: number;
  templateId: string;
  verb: SignatureObstacleVerb | null;
  rewardScore?: number;
  direction?: -1 | 1;
  livingKind?: LivingWorldEventKind;
}

export interface RealmRunEvent {
  kind: RealmEventKind;
  verb: RealmGameplayVerb;
  distance: number;
  tier: number;
  templateId: string;
  success: boolean;
  direction?: -1 | 1;
  relicPageId?: "kelp-cathedral-page-1";
}

export interface KelpCathedralRunStatus {
  rescuedManta: boolean;
  relicPageFound: boolean;
  frondWindowsCleared: number;
  currentTunnelsEntered: number;
  masteredVerbs: readonly RealmGameplayVerb[];
}

export interface CrystalTrenchRunStatus {
  thresholdCrossed: boolean;
  prismPulsesCleared: number;
  platesCleared: number;
  plateRetries: number;
  thresholdRetries: number;
  raceActive: boolean;
  raceWon: boolean;
  raceAttempts: number;
  raceLosses: number;
  raceProgress: number;
  raceGap: number | null;
  finishMarginSec: number | null;
  neriDistance: number | null;
  raceFinishDistance: number | null;
  cleanPerformance: boolean;
  masteredVerbs: readonly RealmGameplayVerb[];
}

const NO_EVENTS: StepEvents = {
  nearMisses: 0,
  collisions: 0,
  encounters: [],
  signatureEvents: [],
  realmEvents: [],
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
  private pendingEndReason: RunEndReason | null = null;

  private secondsSinceCollision = Number.POSITIVE_INFINITY;
  private slowMoRemainingSec = 0;
  private readonly activeLivingEvents: ActiveLivingWorldEvent[] = [];
  private realmRescuedManta = false;
  private realmRelicPageFound = false;
  private realmRescueDistance: number | null = null;
  private realmFrondWindowsCleared = 0;
  private realmCurrentTunnelsEntered = 0;
  private realmTrenchThresholdCrossed = false;
  private realmPrismPulsesCleared = 0;
  private realmCrystalPlatesCleared = 0;
  private realmCrystalPlateRetries = 0;
  private realmTrenchThresholdRetries = 0;
  private realmMirrorRaceActive = false;
  private realmMirrorRaceWon = false;
  private realmMirrorRaceAttempts = 0;
  private realmMirrorRaceLosses = 0;
  private realmMirrorRaceStartDistance: number | null = null;
  private realmMirrorRaceStartElapsedSec: number | null = null;
  private realmMirrorRaceFinishDistance: number | null = null;
  private realmMirrorRaceRetryDistance: number | null = null;
  private realmCompletionDistance: number | null = null;
  private realmMirrorRaceFinishMarginSec: number | null = null;
  private readonly realmMasteredVerbs = new Set<RealmGameplayVerb>();
  /** Scan cursor: gates before this index are behind the player. */
  private gateCursor = 0;

  constructor(
    readonly seed: number,
    private readonly cfg: TuningConfig,
    options: { realmId?: RealmId } = {},
  ) {
    this.realmId = options.realmId ?? "moon-garden";
    this.sim = createSimState();
    this.scoring = createScoringState(cfg);
    this.course = new CourseGenerator(seed, cfg, { realmId: this.realmId });
    this.light = cfg.light.max;
    this.course.ensureGeneratedTo(cfg.readability.visibleAheadUnits * 3);
  }

  readonly realmId: RealmId;

  /** Gates generated so far. The renderer draws from this. */
  get gates(): readonly Gate[] {
    return this.course.gates;
  }

  get activeLivingWorldEvents(): readonly ActiveLivingWorldEvent[] {
    return this.activeLivingEvents;
  }

  get kelpCathedralStatus(): Readonly<KelpCathedralRunStatus> {
    return {
      rescuedManta: this.realmRescuedManta,
      relicPageFound: this.realmRelicPageFound,
      frondWindowsCleared: this.realmFrondWindowsCleared,
      currentTunnelsEntered: this.realmCurrentTunnelsEntered,
      masteredVerbs: Array.from(this.realmMasteredVerbs).sort(),
    };
  }

  get crystalTrenchStatus(): Readonly<CrystalTrenchRunStatus> {
    const neriDistance = this.realmMirrorRaceStartDistance === null ||
        this.realmMirrorRaceStartElapsedSec === null ||
        this.realmMirrorRaceFinishDistance === null
      ? null
      : Math.min(
        this.realmMirrorRaceFinishDistance,
        this.realmMirrorRaceStartDistance + CRYSTAL_NERI_START_LEAD +
          Math.max(0, this.sim.elapsedSec - this.realmMirrorRaceStartElapsedSec) *
            CRYSTAL_NERI_SPEED_PER_SEC,
      );
    const raceProgress = this.realmMirrorRaceStartDistance === null ||
        this.realmMirrorRaceFinishDistance === null
      ? 0
      : Math.max(0, Math.min(
        1,
        (this.sim.forwardDistance - this.realmMirrorRaceStartDistance) /
          Math.max(1, this.realmMirrorRaceFinishDistance - this.realmMirrorRaceStartDistance),
      ));
    return {
      thresholdCrossed: this.realmTrenchThresholdCrossed,
      prismPulsesCleared: this.realmPrismPulsesCleared,
      platesCleared: this.realmCrystalPlatesCleared,
      plateRetries: this.realmCrystalPlateRetries,
      thresholdRetries: this.realmTrenchThresholdRetries,
      raceActive: this.realmMirrorRaceActive,
      raceWon: this.realmMirrorRaceWon,
      raceAttempts: this.realmMirrorRaceAttempts,
      raceLosses: this.realmMirrorRaceLosses,
      raceProgress,
      raceGap: neriDistance === null ? null : this.sim.forwardDistance - neriDistance,
      finishMarginSec: this.realmMirrorRaceFinishMarginSec,
      neriDistance,
      raceFinishDistance: this.realmMirrorRaceFinishDistance,
      cleanPerformance: this.collisionCount === 0 &&
        this.realmCrystalPlateRetries === 0 &&
        this.realmTrenchThresholdRetries === 0 &&
        this.realmMirrorRaceLosses === 0,
      masteredVerbs: Array.from(this.realmMasteredVerbs).sort(),
    };
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

  private neriDistanceAt(elapsedSec: number): number | null {
    if (
      this.realmMirrorRaceStartDistance === null ||
      this.realmMirrorRaceStartElapsedSec === null ||
      this.realmMirrorRaceFinishDistance === null
    ) return null;
    return Math.min(
      this.realmMirrorRaceFinishDistance,
      this.realmMirrorRaceStartDistance + CRYSTAL_NERI_START_LEAD +
        Math.max(0, elapsedSec - this.realmMirrorRaceStartElapsedSec) *
          CRYSTAL_NERI_SPEED_PER_SEC,
    );
  }

  private beginMirrorRace(events: RealmRunEvent[]): void {
    this.realmMirrorRaceAttempts += 1;
    this.realmMirrorRaceActive = true;
    this.realmMirrorRaceStartDistance = this.sim.forwardDistance;
    this.realmMirrorRaceStartElapsedSec = this.sim.elapsedSec;
    this.realmMirrorRaceFinishDistance =
      this.sim.forwardDistance + CRYSTAL_MIRROR_RACE_DISTANCE;
    this.realmMirrorRaceRetryDistance = null;
    this.realmMirrorRaceFinishMarginSec = null;
    events.push({
      kind: "mirror-race-start",
      verb: "mirror-current-race",
      distance: this.sim.forwardDistance,
      tier: 0,
      templateId: `neri-mirror-current-${this.realmMirrorRaceAttempts}`,
      success: true,
    });
  }

  /** End at the next fixed step so replay and lifecycle boundaries stay exact. */
  requestEnd(reason: RunEndReason): boolean {
    if (this.ended || this.pendingEndReason !== null) return false;
    this.pendingEndReason = reason;
    return true;
  }

  /** Advance one fixed simulation step. */
  step(dtSec: number, steeringTarget: number): StepEvents {
    if (this.ended) return NO_EVENTS;
    if (this.pendingEndReason !== null) {
      this.ended = true;
      this.endReason = this.pendingEndReason;
      this.pendingEndReason = null;
      return {
        nearMisses: 0,
        collisions: 0,
        encounters: [],
        signatureEvents: [],
        realmEvents: [],
        justEnded: true,
      };
    }

    const cfg = this.cfg;
    const previousDistance = this.sim.forwardDistance;
    const previousLateral = this.sim.lateralPosition;
    const previousElapsedSec = this.sim.elapsedSec;

    // Only the nearest active current owns the player. Authored zones may
    // overlap spatially at high tiers, but stacking two forces would exceed
    // the closed-form reserve used by the solvability proof.
    const currentGate = this.course.gates.find((gate) => {
      const plan = gate.obstaclePlan;
      return plan?.verb === "current-lane" &&
        previousDistance >= plan.startDistance &&
        previousDistance <= plan.endDistance;
    });
    const currentPlan = currentGate?.obstaclePlan;
    const realmCurrentGate = this.course.gates.find((gate) => {
      const plan = gate.realmPlan;
      return plan?.verb === "reversing-current-tunnel" &&
        previousDistance >= plan.startDistance &&
        previousDistance <= plan.endDistance;
    });
    const realmCurrentPlan = realmCurrentGate?.realmPlan;
    const lateralDrift = realmCurrentPlan?.verb === "reversing-current-tunnel"
      ? currentTunnelForce(realmCurrentPlan, previousDistance, previousLateral)
      : currentPlan?.verb === "current-lane"
        ? currentLaneForce(currentPlan, previousDistance, previousLateral)
        : 0;
    const realmTunnelBounds = realmCurrentPlan?.verb === "reversing-current-tunnel"
      ? { left: realmCurrentPlan.laneLeft, right: realmCurrentPlan.laneRight }
      : undefined;

    stepSim(
      this.sim,
      steeringTarget,
      dtSec,
      cfg,
      lateralDrift,
      realmTunnelBounds,
    );

    const distanceTravelled = this.sim.forwardDistance - previousDistance;

    // Keep the course generated comfortably beyond what the player can see.
    this.course.ensureGeneratedTo(
      this.sim.forwardDistance + cfg.readability.visibleAheadUnits * 3
    );

    // --- resolve gates crossed this step ---
    let nearMisses = 0;
    let collisions = 0;
    const encounters: RunEncounter[] = [];
    const signatureEvents: SignatureRunEvent[] = [];
    const realmEvents: RealmRunEvent[] = [];

    for (const gate of this.course.gates) {
      const plan = gate.obstaclePlan;
      if (
        plan?.verb === "current-lane" &&
        plan.startDistance >= previousDistance &&
        plan.startDistance < this.sim.forwardDistance
      ) {
        signatureEvents.push({
          kind: "current-lane-enter",
          distance: plan.startDistance,
          tier: gate.tier,
          templateId: gate.templateId,
          verb: plan.verb,
          direction: plan.lateralDriftPerSec < 0 ? -1 : 1
        });
      }
      const living = gate.livingEvent;
      if (
        living &&
        living.triggerDistance >= previousDistance &&
        living.triggerDistance < this.sim.forwardDistance
      ) {
        this.activeLivingEvents.push({
          plan: living,
          startedAtSec: this.sim.elapsedSec
        });
        signatureEvents.push({
          kind: "living-world",
          distance: living.triggerDistance,
          tier: gate.tier,
          templateId: gate.templateId,
          verb: plan?.verb ?? null,
          livingKind: living.kind
        });
      }
      const realmPlan = gate.realmPlan;
      if (realmPlan?.verb === "reversing-current-tunnel") {
        if (
          realmPlan.startDistance >= previousDistance &&
          realmPlan.startDistance < this.sim.forwardDistance
        ) {
          const direction = currentTunnelDirection(
            realmPlan,
            realmPlan.startDistance + 0.01,
          );
          this.realmCurrentTunnelsEntered += 1;
          this.realmMasteredVerbs.add("reversing-current-tunnel");
          realmEvents.push({
            kind: "current-tunnel-enter",
            verb: realmPlan.verb,
            distance: realmPlan.startDistance,
            tier: gate.tier,
            templateId: gate.templateId,
            success: true,
            direction: direction === 0
              ? (realmPlan.lateralDriftPerSec < 0 ? -1 : 1)
              : direction,
          });
        }
        const reverseDistance = (realmPlan.startDistance + realmPlan.endDistance) * 0.5;
        if (
          reverseDistance >= previousDistance &&
          reverseDistance < this.sim.forwardDistance
        ) {
          realmEvents.push({
            kind: "current-tunnel-reverse",
            verb: realmPlan.verb,
            distance: reverseDistance,
            tier: gate.tier,
            templateId: gate.templateId,
            success: true,
            direction: realmPlan.lateralDriftPerSec < 0 ? 1 : -1,
          });
        }
      }
      if (gate.distance > this.sim.forwardDistance + cfg.readability.visibleAheadUnits) {
        break;
      }
    }
    for (let index = this.activeLivingEvents.length - 1; index >= 0; index--) {
      const active = this.activeLivingEvents[index];
      if (
        !active ||
        this.sim.elapsedSec - active.startedAtSec > active.plan.durationSec
      ) {
        this.activeLivingEvents.splice(index, 1);
      }
    }

    const passes = evaluateStep(
      {
        fromDistance: previousDistance,
        toDistance: this.sim.forwardDistance,
        fromLateral: previousLateral,
        toLateral: this.sim.lateralPosition,
        fromElapsedSec: previousElapsedSec,
        toElapsedSec: this.sim.elapsedSec
      },
      this.course.gates,
      cfg,
      this.gateCursor
    );

    for (const pass of passes) {
      const realmPlan = pass.gate.realmPlan;
      if (realmPlan?.verb === "swaying-frond-window") {
        if (!pass.collided) {
          this.realmFrondWindowsCleared += 1;
          this.realmMasteredVerbs.add("swaying-frond-window");
        }
        realmEvents.push({
          kind: "frond-window",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: !pass.collided,
        });
      } else if (realmPlan?.verb === "manta-rescue") {
        const rescued = !pass.collided && pass.route === "rescue";
        if (rescued && !this.realmRescuedManta) {
          this.realmRescuedManta = true;
          this.realmRescueDistance = pass.gate.distance;
          this.realmMasteredVerbs.add("manta-rescue");
        }
        realmEvents.push({
          kind: rescued ? "manta-rescue" : "manta-rescue-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: rescued,
        });
      } else if (
        realmPlan?.verb === "relic-current" &&
        !pass.collided &&
        pass.route === "relic"
      ) {
        this.realmRelicPageFound = true;
        this.realmMasteredVerbs.add("relic-current");
        realmEvents.push({
          kind: "relic-page",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: true,
          relicPageId: realmPlan.relicPageId,
        });
      } else if (realmPlan?.verb === "prism-pulse") {
        if (!pass.collided) {
          this.realmPrismPulsesCleared += 1;
          this.realmMasteredVerbs.add("prism-pulse");
        }
        realmEvents.push({
          kind: "prism-route",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: !pass.collided,
        });
      } else if (realmPlan?.verb === "sliding-crystal-plates") {
        const cleared = !pass.collided;
        if (cleared && this.realmTrenchThresholdCrossed) {
          this.realmCrystalPlatesCleared += 1;
          this.realmMasteredVerbs.add("sliding-crystal-plates");
        }
        if (!cleared) {
          this.realmCrystalPlateRetries += 1;
          this.course.scheduleCrystalPlateRetry(
            realmPlan,
            pass.gate.distance + 148,
          );
        }
        realmEvents.push({
          kind: cleared ? "crystal-plate" : "crystal-plate-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: `${pass.gate.templateId}:${realmPlan.sequenceId}`,
          success: cleared,
        });
      } else if (realmPlan?.verb === "trench-threshold") {
        const crossed = !pass.collided;
        if (crossed && !this.realmTrenchThresholdCrossed) {
          this.realmTrenchThresholdCrossed = true;
          this.realmMasteredVerbs.add("trench-threshold");
        } else if (!crossed) {
          this.realmTrenchThresholdRetries += 1;
          this.course.scheduleCrystalThresholdRetry(
            pass.gate.distance + 148,
          );
        }
        realmEvents.push({
          kind: crossed ? "trench-threshold" : "trench-threshold-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: crossed,
        });
      }
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
      } else {
        const plan = pass.gate.obstaclePlan;
        if (
          plan?.verb === "moonflash-choice" &&
          (pass.route === "safe" || pass.route === "moonflash")
        ) {
          const rewardScore = registerChoiceRoute(this.scoring, pass.route);
          signatureEvents.push({
            kind: pass.route === "moonflash" ? "moonflash-route" : "safe-route",
            distance: pass.gate.distance,
            tier: pass.gate.tier,
            templateId: pass.gate.templateId,
            verb: plan.verb,
            rewardScore
          });
        } else if (plan?.verb === "ceremonial-shutter") {
          signatureEvents.push({
            kind: "shutter-pass",
            distance: pass.gate.distance,
            tier: pass.gate.tier,
            templateId: pass.gate.templateId,
            verb: plan.verb
          });
        }
        if (isNearMiss(pass, cfg) && registerNearMiss(this.scoring, cfg)) {
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
    }

    if (this.realmId === "crystal-trench" && !this.realmMirrorRaceWon) {
      const retryReady = this.realmMirrorRaceAttempts === 0 || (
        this.realmMirrorRaceRetryDistance !== null &&
        this.sim.forwardDistance >= this.realmMirrorRaceRetryDistance
      );
      if (
        !this.realmMirrorRaceActive &&
        this.realmTrenchThresholdCrossed &&
        this.realmCrystalPlatesCleared >= CRYSTAL_PLATES_TO_RACE &&
        retryReady
      ) {
        this.beginMirrorRace(realmEvents);
      } else if (
        this.realmMirrorRaceActive &&
        this.realmMirrorRaceFinishDistance !== null
      ) {
        const finish = this.realmMirrorRaceFinishDistance;
        const previousNeriDistance = this.neriDistanceAt(previousElapsedSec) ??
          Number.NEGATIVE_INFINITY;
        const currentNeriDistance = this.neriDistanceAt(this.sim.elapsedSec) ??
          Number.NEGATIVE_INFINITY;
        const crossingFraction = (
          from: number,
          to: number,
        ): number => {
          if (from >= finish) return 0;
          if (to < finish || to <= from) return Number.POSITIVE_INFINITY;
          return (finish - from) / (to - from);
        };
        const playerCrossing = crossingFraction(
          previousDistance,
          this.sim.forwardDistance,
        );
        const neriCrossing = crossingFraction(
          previousNeriDistance,
          currentNeriDistance,
        );
        if (
          Number.isFinite(playerCrossing) ||
          Number.isFinite(neriCrossing)
        ) {
          const playerWon = playerCrossing <= neriCrossing;
          const playerFinishElapsedSec = Number.isFinite(playerCrossing)
            ? previousElapsedSec + playerCrossing * dtSec
            : Number.POSITIVE_INFINITY;
          const neriFinishElapsedSec = this.realmMirrorRaceStartElapsedSec === null
            ? Number.POSITIVE_INFINITY
            : this.realmMirrorRaceStartElapsedSec +
              (CRYSTAL_MIRROR_RACE_DISTANCE - CRYSTAL_NERI_START_LEAD) /
                CRYSTAL_NERI_SPEED_PER_SEC;
          this.realmMirrorRaceFinishMarginSec = Number.isFinite(playerFinishElapsedSec)
            ? neriFinishElapsedSec - playerFinishElapsedSec
            : -Math.max(0, this.sim.elapsedSec - neriFinishElapsedSec);
          this.realmMirrorRaceActive = false;
          if (playerWon) {
            this.realmMirrorRaceWon = true;
            this.realmCompletionDistance = finish;
            this.realmMasteredVerbs.add("mirror-current-race");
          } else {
            this.realmMirrorRaceLosses += 1;
            this.realmMirrorRaceRetryDistance =
              this.sim.forwardDistance + CRYSTAL_RACE_RETRY_DISTANCE;
          }
          realmEvents.push({
            kind: playerWon ? "mirror-race-win" : "mirror-race-loss",
            verb: "mirror-current-race",
            distance: finish,
            tier: 0,
            templateId: `neri-mirror-current-${this.realmMirrorRaceAttempts}`,
            success: playerWon,
          });
        }
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
    if (
      this.realmId === "kelp-cathedral" &&
      this.realmRescuedManta &&
      this.realmRescueDistance !== null &&
      this.sim.forwardDistance >= this.realmRescueDistance + 24
    ) {
      this.ended = true;
      this.endReason = "realm-complete";
      justEnded = true;
    } else if (
      this.realmId === "crystal-trench" &&
      this.realmMirrorRaceWon &&
      this.realmCompletionDistance !== null &&
      this.sim.forwardDistance >=
        this.realmCompletionDistance + CRYSTAL_COMPLETE_COAST_DISTANCE
    ) {
      this.ended = true;
      this.endReason = "realm-complete";
      justEnded = true;
    } else if (this.light <= 0) {
      this.light = 0;
      this.ended = true;
      this.endReason = "light-depleted";
      justEnded = true;
    }

    return {
      nearMisses,
      collisions,
      encounters,
      signatureEvents,
      realmEvents,
      justEnded
    };
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
