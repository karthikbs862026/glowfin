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
  DUSKMAW_CHASE_DURATION_SEC,
  DUSKMAW_CHASE_START_SEC,
  DUSKMAW_AURALIS_CATCHUP_SEC,
  DUSKMAW_BOSS_MOUTHFIRE_RADIUS,
  DUSKMAW_BOSS_MAX_HEALTH,
  DUSKMAW_MOONLINK_STRIKE_DAMAGE,
  DUSKMAW_PRE_VAULT_STRIKE_DAMAGE,
  DUSKMAW_COLLISION_LIGHT_COST,
  DUSKMAW_COMPLETE_COAST_DISTANCE,
  DUSKMAW_CURRENT_BREAK_TARGET,
  DUSKMAW_MINION_BLUEPRINTS,
  DUSKMAW_PRE_VAULT_STRIKES,
  DUSKMAW_VAULT_HOLD_SEC,
  DUSKMAW_LIGHT_REGEN_MULTIPLIER,
  DUSKMAW_MIN_COMPLETION_SEC,
  DUSKMAW_MOMENTUM_CAP_FRACTION,
  ECLIPSE_COURT_ALIGNMENT_TARGETS,
  ECLIPSE_COURT_COMPLETE_COAST_DISTANCE,
  ECLIPSE_COURT_FINALE_COAST_DISTANCE,
  eclipseCourtActIndex,
  currentTunnelDirection,
  currentTunnelForce,
  duskmawMinionMouthfireRadius,
  vacuumWakeForce,
  type DuskmawMinionId,
  type DuskmawMinionTier,
  type EclipseCourtActIndex,
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

export type DuskmawPursuitPhase =
  | "approach"
  | "minion-wave-1"
  | "minion-wave-2"
  | "minion-wave-3"
  | "duskmaw-assault"
  | "shadow-sweep"
  | "vacuum-wake"
  | "ruins-collapse"
  | "heartlight-run"
  | "vault-rescue"
  | "auralis-catchup"
  | "moonlink-battle"
  | "complete";

export interface DuskmawRunStatus {
  phase: DuskmawPursuitPhase;
  phaseElapsedSec: number;
  pursuitActive: boolean;
  currentBreaks: number;
  currentBreakTarget: number;
  preVaultStrikes: number;
  bossHealth: number;
  bossMaxHealth: number;
  bossRegenerations: number;
  joinedStrikes: number;
  activeMinionId: DuskmawMinionId | null;
  activeMinionTier: DuskmawMinionTier | null;
  activeMinionHits: number;
  activeMinionRequiredHits: number;
  minionsDefeated: number;
  minionTarget: number;
  recoveryItemsCollected: number;
  heartlightRecovered: boolean;
  vaultWorldDistance: number | null;
  vaultHoldActive: boolean;
  auralisFreed: boolean;
  attackTargetLateral: number | null;
  attackGateDistance: number | null;
  lastPlayerHitSec: number;
  lastEnemyHitSec: number;
  lastMinionDefeatSec: number;
  lastRecoverySec: number;
  lastRegenerationSec: number;
  captures: number;
  recoveredFirstCapture: boolean;
  moonSealReached: boolean;
  completed: boolean;
  cleanPerformance: boolean;
  masteredVerbs: readonly RealmGameplayVerb[];
}

export type EclipseCourtPhase =
  | "procession"
  | "weave"
  | "conjunction"
  | "verdict";

export interface EclipseCourtRunStatus {
  stageIndex: number;
  phase: EclipseCourtPhase;
  actIndex: EclipseCourtActIndex;
  alignments: number;
  alignmentTarget: number;
  missedAlignments: number;
  completionFraction: number;
  completed: boolean;
  cleanPerformance: boolean;
  lastAlignmentSec: number;
  lastMissSec: number;
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
  private realmDuskmawCurrentBreaks = 0;
  private realmDuskmawCaptures = 0;
  private realmDuskmawPhase: DuskmawPursuitPhase = "approach";
  private realmDuskmawPhaseStartedSec = 0;
  private readonly realmDuskmawMinionHits = new Map<DuskmawMinionId, number>();
  private readonly realmDuskmawDefeatedMinions = new Set<DuskmawMinionId>();
  private readonly realmDuskmawStrikeSequences = new Set<number>();
  private readonly realmDuskmawRecoveryIds = new Set<number>();
  private realmDuskmawBossHealth = DUSKMAW_BOSS_MAX_HEALTH;
  private realmDuskmawRegenerations = 0;
  private realmDuskmawJoinedStrikes = 0;
  private realmDuskmawVaultDistance: number | null = null;
  private realmDuskmawAuralisFreed = false;
  private realmDuskmawLastPlayerHitSec = Number.NEGATIVE_INFINITY;
  private realmDuskmawLastEnemyHitSec = Number.NEGATIVE_INFINITY;
  private realmDuskmawLastMinionDefeatSec = Number.NEGATIVE_INFINITY;
  private realmDuskmawLastDefeatedMinionId: DuskmawMinionId | null = null;
  private realmDuskmawLastRecoverySec = Number.NEGATIVE_INFINITY;
  private realmDuskmawLastRegenerationSec = Number.NEGATIVE_INFINITY;
  private readonly shotLocks = new Map<number, number>();
  private realmDuskmawMoonSealReached = false;
  private realmDuskmawCompletionDistance: number | null = null;
  private realmEclipseAlignments = 0;
  private realmEclipseMisses = 0;
  private realmEclipseCompleted = false;
  private realmEclipseCompletionDistance: number | null = null;
  private realmEclipseLastAlignmentSec = Number.NEGATIVE_INFINITY;
  private realmEclipseLastMissSec = Number.NEGATIVE_INFINITY;
  private readonly realmMasteredVerbs = new Set<RealmGameplayVerb>();
  /** Scan cursor: gates before this index are behind the player. */
  private gateCursor = 0;

  constructor(
    readonly seed: number,
    private readonly cfg: TuningConfig,
    options: { realmId?: RealmId; realmStageIndex?: number } = {},
  ) {
    this.realmId = options.realmId ?? "moon-garden";
    this.realmStageIndex = Math.max(0, Math.min(
      ECLIPSE_COURT_ALIGNMENT_TARGETS.length - 1,
      Math.floor(options.realmStageIndex ?? 0),
    ));
    this.sim = createSimState();
    this.scoring = createScoringState(cfg);
    this.course = new CourseGenerator(seed, cfg, {
      realmId: this.realmId,
      realmStageIndex: this.realmStageIndex,
    });
    this.light = cfg.light.max;
    this.course.ensureGeneratedTo(cfg.readability.visibleAheadUnits * 3);
  }

  readonly realmId: RealmId;
  readonly realmStageIndex: number;

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

  get duskmawStatus(): Readonly<DuskmawRunStatus> {
    const elapsed = this.sim.elapsedSec;
    const phase = this.realmDuskmawPhase;
    const waveTier: DuskmawMinionTier | null = phase === "minion-wave-1"
      ? 1
      : phase === "minion-wave-2"
        ? 2
        : phase === "minion-wave-3"
          ? 3
          : null;
    const undefeatedMinion = waveTier === null
      ? null
      : DUSKMAW_MINION_BLUEPRINTS.find((minion) => (
          minion.tier === waveTier && !this.realmDuskmawDefeatedMinions.has(minion.id)
        )) ?? null;
    const defeatedMinion = waveTier !== null &&
      elapsed - this.realmDuskmawLastMinionDefeatSec < 1.25
      ? DUSKMAW_MINION_BLUEPRINTS.find((minion) => (
          minion.id === this.realmDuskmawLastDefeatedMinionId && minion.tier === waveTier
        )) ?? null
      : null;
    const activeMinion = undefeatedMinion ?? defeatedMinion;
    const predictedVault = this.course.gates.find((gate) => (
      gate.realmPlan?.verb === "moonbone-vault"
    ));
    const vaultWorldDistance = this.realmDuskmawVaultDistance ??
      (predictedVault ? predictedVault.distance + 24 : null);
    const lock = this.shotLocks.entries().next().value as
      [number, number] | undefined;
    return {
      phase,
      phaseElapsedSec: Math.max(0, elapsed - this.realmDuskmawPhaseStartedSec),
      pursuitActive: phase !== "approach" && phase !== "vault-rescue" && phase !== "complete",
      currentBreaks: this.realmDuskmawCurrentBreaks,
      currentBreakTarget: DUSKMAW_CURRENT_BREAK_TARGET,
      preVaultStrikes: Math.min(DUSKMAW_PRE_VAULT_STRIKES, this.realmDuskmawCurrentBreaks),
      bossHealth: this.realmDuskmawBossHealth,
      bossMaxHealth: DUSKMAW_BOSS_MAX_HEALTH,
      bossRegenerations: this.realmDuskmawRegenerations,
      joinedStrikes: this.realmDuskmawJoinedStrikes,
      activeMinionId: activeMinion?.id ?? null,
      activeMinionTier: activeMinion?.tier ?? null,
      activeMinionHits: activeMinion
        ? this.realmDuskmawMinionHits.get(activeMinion.id) ?? 0
        : 0,
      activeMinionRequiredHits: activeMinion?.requiredHits ?? 0,
      minionsDefeated: this.realmDuskmawDefeatedMinions.size,
      minionTarget: DUSKMAW_MINION_BLUEPRINTS.length,
      recoveryItemsCollected: this.realmDuskmawRecoveryIds.size,
      heartlightRecovered: this.realmDuskmawCurrentBreaks >= DUSKMAW_PRE_VAULT_STRIKES,
      vaultWorldDistance,
      vaultHoldActive: phase === "vault-rescue",
      auralisFreed: this.realmDuskmawAuralisFreed,
      attackTargetLateral: lock?.[1] ?? null,
      attackGateDistance: lock?.[0] ?? null,
      lastPlayerHitSec: this.realmDuskmawLastPlayerHitSec,
      lastEnemyHitSec: this.realmDuskmawLastEnemyHitSec,
      lastMinionDefeatSec: this.realmDuskmawLastMinionDefeatSec,
      lastRecoverySec: this.realmDuskmawLastRecoverySec,
      lastRegenerationSec: this.realmDuskmawLastRegenerationSec,
      captures: this.realmDuskmawCaptures,
      recoveredFirstCapture: this.realmDuskmawCaptures > 0 &&
        this.realmDuskmawRecoveryIds.size > 0 && this.light > 0,
      moonSealReached: this.realmDuskmawMoonSealReached,
      completed: this.realmDuskmawMoonSealReached,
      cleanPerformance: this.realmDuskmawCaptures === 0 && this.collisionCount === 0,
      masteredVerbs: Array.from(this.realmMasteredVerbs).sort(),
    };
  }

  get eclipseCourtStatus(): Readonly<EclipseCourtRunStatus> {
    const target = ECLIPSE_COURT_ALIGNMENT_TARGETS[this.realmStageIndex] ??
      ECLIPSE_COURT_ALIGNMENT_TARGETS[0];
    const fraction = Math.max(0, Math.min(1, this.realmEclipseAlignments / target));
    const actIndex = eclipseCourtActIndex(fraction);
    const phase: EclipseCourtPhase = [
      "procession",
      "weave",
      "conjunction",
      "verdict",
    ][actIndex] as EclipseCourtPhase;
    return {
      stageIndex: this.realmStageIndex,
      phase,
      actIndex,
      alignments: this.realmEclipseAlignments,
      alignmentTarget: target,
      missedAlignments: this.realmEclipseMisses,
      completionFraction: fraction,
      completed: this.realmEclipseCompleted,
      cleanPerformance: this.realmEclipseMisses === 0 && this.collisionCount === 0,
      lastAlignmentSec: this.realmEclipseLastAlignmentSec,
      lastMissSec: this.realmEclipseLastMissSec,
      masteredVerbs: Array.from(this.realmMasteredVerbs).sort(),
    };
  }

  private isShotGate(gate: Gate): boolean {
    const verb = gate.realmPlan?.verb;
    return verb === "minion-assault" || verb === "shadow-sweep" ||
      verb === "vacuum-wake";
  }

  private updateShotLocks(
    distance: number,
    lateral: number,
  ): void {
    if (this.realmId !== "leviathan-graveyard") return;
    for (const d of this.shotLocks.keys()) {
      if (d < distance - 4) this.shotLocks.delete(d);
    }
    for (const gate of this.course.gates) {
      if (gate.distance < distance) continue;
      if (gate.distance > distance + 138) break;
      if (!this.isShotGate(gate)) continue;
      const plan = gate.realmPlan;
      if (!plan || distance < plan.telegraphFromDistance) continue;
      if (!this.shotLocks.has(gate.distance)) {
        this.shotLocks.set(
          gate.distance,
          Math.max(
            -this.cfg.lane.halfWidth + 0.9,
            Math.min(this.cfg.lane.halfWidth - 0.9, lateral),
          ),
        );
      }
    }
  }

  private shotClearance(
    gate: Gate,
    fromD: number,
    toD: number,
    fromX: number,
    toX: number,
  ): number | null {
    const plan = gate.realmPlan;
    if (
      plan?.verb !== "minion-assault" &&
      plan?.verb !== "shadow-sweep" &&
      plan?.verb !== "vacuum-wake"
    ) return null;
    const target = this.shotLocks.get(gate.distance);
    if (target === undefined) return null;
    const t = Math.max(0, Math.min(
      1,
      (gate.distance - fromD) / Math.max(1e-9, toD - fromD),
    ));
    const x = fromX + (toX - fromX) * t;
    const radius = plan.verb === "minion-assault"
      ? duskmawMinionMouthfireRadius(plan.minionTier)
      : DUSKMAW_BOSS_MOUTHFIRE_RADIUS;
    return Math.abs(x - target) - radius - this.cfg.lane.creatureRadius;
  }

  private setDuskmawPhase(phase: DuskmawPursuitPhase): void {
    if (this.realmDuskmawPhase === phase) return;
    this.realmDuskmawPhase = phase;
    this.realmDuskmawPhaseStartedSec = this.sim.elapsedSec;
  }

  private advanceDuskmawPhase(): void {
    if (this.realmId !== "leviathan-graveyard" || this.realmDuskmawMoonSealReached) return;
    const phaseElapsed = this.sim.elapsedSec - this.realmDuskmawPhaseStartedSec;
    switch (this.realmDuskmawPhase) {
      case "approach":
        if (this.sim.elapsedSec >= DUSKMAW_CHASE_START_SEC) {
          this.setDuskmawPhase("minion-wave-1");
        }
        return;
      case "minion-wave-1":
        if (DUSKMAW_MINION_BLUEPRINTS
          .filter((minion) => minion.tier === 1)
          .every((minion) => this.realmDuskmawDefeatedMinions.has(minion.id)) &&
          phaseElapsed >= 1.25 &&
          this.sim.elapsedSec - this.realmDuskmawLastMinionDefeatSec >= 1.25) {
          this.setDuskmawPhase("minion-wave-2");
        }
        return;
      case "minion-wave-2":
        if (DUSKMAW_MINION_BLUEPRINTS
          .filter((minion) => minion.tier === 2)
          .every((minion) => this.realmDuskmawDefeatedMinions.has(minion.id)) &&
          this.sim.elapsedSec - this.realmDuskmawLastMinionDefeatSec >= 1.25) {
          this.setDuskmawPhase("minion-wave-3");
        }
        return;
      case "minion-wave-3":
        if (DUSKMAW_MINION_BLUEPRINTS
          .filter((minion) => minion.tier === 3)
          .every((minion) => this.realmDuskmawDefeatedMinions.has(minion.id)) &&
          this.sim.elapsedSec - this.realmDuskmawLastMinionDefeatSec >= 1.25) {
          this.setDuskmawPhase("duskmaw-assault");
        }
        return;
      case "duskmaw-assault":
      case "shadow-sweep":
      case "vacuum-wake":
      case "ruins-collapse":
        if (this.realmDuskmawCurrentBreaks >= DUSKMAW_PRE_VAULT_STRIKES) {
          this.setDuskmawPhase("heartlight-run");
        }
        return;
      case "vault-rescue":
        if (phaseElapsed >= DUSKMAW_VAULT_HOLD_SEC) {
          this.realmDuskmawAuralisFreed = true;
          this.setDuskmawPhase("auralis-catchup");
        }
        return;
      case "auralis-catchup":
        if (phaseElapsed >= DUSKMAW_AURALIS_CATCHUP_SEC) {
          this.setDuskmawPhase("moonlink-battle");
        }
        return;
      case "heartlight-run":
      case "moonlink-battle":
      case "complete":
        return;
    }
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
    this.advanceDuskmawPhase();
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
    this.updateShotLocks(previousDistance, previousLateral);
    const vaultHold = this.realmId === "leviathan-graveyard" &&
      this.realmDuskmawPhase === "vault-rescue";

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
      return (
        plan?.verb === "reversing-current-tunnel" ||
        plan?.verb === "vacuum-wake"
      ) &&
        previousDistance >= plan.startDistance &&
        previousDistance <= plan.endDistance;
    });
    const realmCurrentPlan = realmCurrentGate?.realmPlan;
    const lateralDrift = realmCurrentPlan?.verb === "reversing-current-tunnel"
      ? currentTunnelForce(realmCurrentPlan, previousDistance, previousLateral)
      : realmCurrentPlan?.verb === "vacuum-wake"
        ? vacuumWakeForce(realmCurrentPlan, previousDistance, previousLateral)
      : currentPlan?.verb === "current-lane"
        ? currentLaneForce(currentPlan, previousDistance, previousLateral)
        : 0;
    const realmTunnelBounds = (
      realmCurrentPlan?.verb === "reversing-current-tunnel" ||
      realmCurrentPlan?.verb === "vacuum-wake"
    )
      ? { left: realmCurrentPlan.laneLeft, right: realmCurrentPlan.laneRight }
      : undefined;

    if (this.realmId === "leviathan-graveyard") {
      this.sim.momentum = Math.min(
        this.sim.momentum,
        cfg.momentum.ceiling * DUSKMAW_MOMENTUM_CAP_FRACTION,
      );
    }
    stepSim(
      this.sim,
      steeringTarget,
      dtSec,
      cfg,
      lateralDrift,
      realmTunnelBounds,
    );
    if (vaultHold) {
      // The Moonbone Vault is a world landmark, not an endless-runner prop.
      // Time and steering continue for the rescue animation, but forward
      // travel pauses so the cell remains fixed in space until Auralis exits.
      this.sim.forwardDistance = previousDistance;
      this.sim.momentum = 0;
    }
    if (this.realmId === "leviathan-graveyard") {
      this.sim.momentum = Math.min(
        this.sim.momentum,
        cfg.momentum.ceiling * DUSKMAW_MOMENTUM_CAP_FRACTION,
      );
    }

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
      } else if (realmPlan?.verb === "vacuum-wake") {
        if (
          realmPlan.startDistance >= previousDistance &&
          realmPlan.startDistance < this.sim.forwardDistance
        ) {
          this.realmMasteredVerbs.add("vacuum-wake");
          realmEvents.push({
            kind: "vacuum-wake-enter",
            verb: realmPlan.verb,
            distance: realmPlan.startDistance,
            tier: gate.tier,
            templateId: gate.templateId,
            success: true,
            direction: realmPlan.lateralDriftPerSec < 0 ? -1 : 1,
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
      const shotClearance = this.shotClearance(
        pass.gate,
        previousDistance,
        this.sim.forwardDistance,
        previousLateral,
        this.sim.lateralPosition,
      );
      if (shotClearance !== null) {
        // V44 attack truth is the visible mouthfire lane locked at telegraph,
        // never the unrelated procedural gate opening behind the custom realm.
        pass.collided = shotClearance < 0;
        pass.clearance = shotClearance;
      }
      if (
        realmPlan?.verb === "orbital-thread" ||
        realmPlan?.verb === "umbra-shift" ||
        realmPlan?.verb === "eclipse-verdict"
      ) {
        const aligned = !pass.collided;
        const target = ECLIPSE_COURT_ALIGNMENT_TARGETS[this.realmStageIndex] ??
          ECLIPSE_COURT_ALIGNMENT_TARGETS[0];
        const progressionVerb = this.realmStageIndex === 0
          ? "orbital-thread"
          : this.realmStageIndex === 1
            ? "umbra-shift"
            : "eclipse-verdict";
        if (aligned && !this.realmEclipseCompleted) {
          if (realmPlan.verb === progressionVerb) {
            this.realmEclipseAlignments = Math.min(
              target,
              this.realmEclipseAlignments + 1,
            );
          }
          this.realmEclipseLastAlignmentSec = this.sim.elapsedSec;
          this.realmMasteredVerbs.add(realmPlan.verb);
          if (this.realmEclipseAlignments >= target) {
            this.realmEclipseCompleted = true;
            this.realmEclipseCompletionDistance = pass.gate.distance;
          }
        } else if (!aligned) {
          this.realmEclipseMisses += 1;
          this.realmEclipseLastMissSec = this.sim.elapsedSec;
        }
        const kind = realmPlan.verb === "orbital-thread"
          ? aligned ? "orbital-thread" : "orbital-thread-missed"
          : realmPlan.verb === "umbra-shift"
            ? aligned ? "umbra-shift" : "umbra-shift-missed"
            : aligned ? "eclipse-verdict" : "eclipse-verdict-missed";
        realmEvents.push({
          kind,
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: `${pass.gate.templateId}:${realmPlan.sequence}`,
          success: aligned,
        });
      } else if (realmPlan?.verb === "swaying-frond-window") {
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
      } else if (realmPlan?.verb === "minion-assault") {
        const previousHits = this.realmDuskmawMinionHits.get(realmPlan.minionId) ?? 0;
        const alreadyDefeated = this.realmDuskmawDefeatedMinions.has(realmPlan.minionId);
        const strikeReady = !alreadyDefeated && realmPlan.hitIndex <= previousHits + 1;
        const landed = !pass.collided && strikeReady;
        let defeated = alreadyDefeated;
        if (landed) {
          const hits = Math.min(realmPlan.requiredHits, previousHits + 1);
          this.realmDuskmawMinionHits.set(realmPlan.minionId, hits);
          this.realmDuskmawLastEnemyHitSec = this.sim.elapsedSec;
          defeated = hits >= realmPlan.requiredHits;
          if (defeated) {
            this.realmDuskmawDefeatedMinions.add(realmPlan.minionId);
            this.realmDuskmawLastDefeatedMinionId = realmPlan.minionId;
            this.realmDuskmawLastMinionDefeatSec = this.sim.elapsedSec;
          }
          this.realmMasteredVerbs.add("minion-assault");
        } else if (!alreadyDefeated) {
          this.course.scheduleDuskmawMinionRetry(
            { ...realmPlan, hitIndex: previousHits + 1 },
            pass.gate.distance + 78,
          );
        }
        realmEvents.push({
          kind: landed
            ? defeated ? "minion-defeated" : "minion-hit"
            : alreadyDefeated ? "minion-defeated" : "minion-shot-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: `${pass.gate.templateId}:${realmPlan.minionId}:${realmPlan.hitIndex}`,
          success: landed || alreadyDefeated,
        });
      } else if (realmPlan?.verb === "lumen-bloom") {
        const collected = !pass.collided;
        if (collected && !this.realmDuskmawRecoveryIds.has(realmPlan.recoveryId)) {
          this.realmDuskmawRecoveryIds.add(realmPlan.recoveryId);
          this.light = Math.min(cfg.light.max, this.light + realmPlan.healAmount);
          this.realmDuskmawLastRecoverySec = this.sim.elapsedSec;
          this.realmMasteredVerbs.add("lumen-bloom");
        }
        realmEvents.push({
          kind: collected ? "lumen-bloom" : "lumen-bloom-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: `${pass.gate.templateId}:recovery-${realmPlan.recoveryId}`,
          success: collected,
        });
      } else if (realmPlan?.verb === "shadow-sweep") {
        if (!pass.collided) this.realmMasteredVerbs.add("shadow-sweep");
        realmEvents.push({
          kind: "shadow-sweep",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: !pass.collided,
          direction: realmPlan.sweepSide,
        });
      } else if (realmPlan?.verb === "ruins-collapse") {
        if (!pass.collided) this.realmMasteredVerbs.add("ruins-collapse");
        realmEvents.push({
          kind: "ruins-collapse",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: !pass.collided,
          direction: realmPlan.collapseSide,
        });
      } else if (realmPlan?.verb === "current-break") {
        const preVault = realmPlan.sequence <= DUSKMAW_PRE_VAULT_STRIKES;
        const eligible = preVault
          ? this.realmDuskmawDefeatedMinions.size >= DUSKMAW_MINION_BLUEPRINTS.length
          : this.realmDuskmawAuralisFreed && this.realmDuskmawPhase === "moonlink-battle";
        const collected = !pass.collided && eligible;
        if (collected) {
          if (!this.realmDuskmawStrikeSequences.has(realmPlan.sequence)) {
            this.realmDuskmawStrikeSequences.add(realmPlan.sequence);
            this.realmDuskmawCurrentBreaks = Math.min(
              DUSKMAW_CURRENT_BREAK_TARGET,
              this.realmDuskmawStrikeSequences.size,
            );
            const damage = preVault
              ? DUSKMAW_PRE_VAULT_STRIKE_DAMAGE
              : DUSKMAW_MOONLINK_STRIKE_DAMAGE;
            this.realmDuskmawBossHealth = Math.max(
              0,
              this.realmDuskmawBossHealth - damage,
            );
            this.realmDuskmawLastEnemyHitSec = this.sim.elapsedSec;
            if (!preVault) this.realmDuskmawJoinedStrikes += 1;
            if (preVault && (realmPlan.sequence === 2 || realmPlan.sequence === 4)) {
              this.realmDuskmawBossHealth = Math.min(
                DUSKMAW_BOSS_MAX_HEALTH,
                this.realmDuskmawBossHealth + 2,
              );
              this.realmDuskmawRegenerations += 1;
              this.realmDuskmawLastRegenerationSec = this.sim.elapsedSec;
            }
          }
          this.realmMasteredVerbs.add("current-break");
        } else {
          this.course.scheduleDuskmawCurrentBreakRetry(
            realmPlan,
            pass.gate.distance + 96,
          );
        }
        realmEvents.push({
          kind: collected ? "current-break" : "current-break-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: `${pass.gate.templateId}:${realmPlan.sequence}`,
          success: collected,
        });
      } else if (realmPlan?.verb === "moonbone-vault") {
        const unlocked = !pass.collided &&
          this.realmDuskmawCurrentBreaks >= DUSKMAW_PRE_VAULT_STRIKES &&
          this.realmDuskmawDefeatedMinions.size >= DUSKMAW_MINION_BLUEPRINTS.length;
        if (unlocked && this.realmDuskmawPhase === "heartlight-run") {
          this.realmDuskmawVaultDistance = pass.gate.distance + 24;
          this.setDuskmawPhase("vault-rescue");
          this.realmMasteredVerbs.add("moonbone-vault");
        }
        realmEvents.push({
          kind: unlocked ? "moonbone-vault" : "moonbone-vault-locked",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: pass.gate.templateId,
          success: unlocked,
        });
      } else if (realmPlan?.verb === "moon-seal") {
        const reached = !pass.collided &&
          this.sim.elapsedSec >= DUSKMAW_MIN_COMPLETION_SEC &&
          this.realmDuskmawCurrentBreaks >= DUSKMAW_CURRENT_BREAK_TARGET &&
          this.realmDuskmawBossHealth <= 0 &&
          this.realmDuskmawAuralisFreed;
        if (reached && !this.realmDuskmawMoonSealReached) {
          this.realmDuskmawMoonSealReached = true;
          this.realmDuskmawCompletionDistance = pass.gate.distance;
          this.setDuskmawPhase("complete");
          this.realmMasteredVerbs.add("moon-seal");
        }
        realmEvents.push({
          kind: reached ? "moon-seal" : "moon-seal-missed",
          verb: realmPlan.verb,
          distance: pass.gate.distance,
          tier: pass.gate.tier,
          templateId: `${pass.gate.templateId}:${realmPlan.sequence}`,
          success: reached,
        });
      }
      if (pass.collided) {
        // applyCollision returns false during i-frames, in which case no light
        // is lost either — otherwise a dense cluster would drain the run
        // through a grace period that is supposed to be protecting the player.
        if (applyCollision(this.sim, cfg)) {
          this.light -= this.realmId === "leviathan-graveyard"
            ? DUSKMAW_COLLISION_LIGHT_COST
            : cfg.light.costPerCollision;
          this.secondsSinceCollision = 0;
          this.collisionCount++;
          if (
            this.realmId === "leviathan-graveyard" &&
            previousElapsedSec >= DUSKMAW_CHASE_START_SEC &&
            previousElapsedSec <
              DUSKMAW_CHASE_START_SEC + DUSKMAW_CHASE_DURATION_SEC
          ) {
            this.realmDuskmawCaptures += 1;
            this.realmDuskmawLastPlayerHitSec = this.sim.elapsedSec;
          }
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
      const regenMultiplier = this.realmId === "leviathan-graveyard"
        ? DUSKMAW_LIGHT_REGEN_MULTIPLIER
        : 1;
      this.light = Math.min(
        cfg.light.max,
        this.light + cfg.light.regenPerSec * regenMultiplier * dtSec,
      );
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
    } else if (
      this.realmId === "leviathan-graveyard" &&
      this.realmDuskmawMoonSealReached &&
      this.realmDuskmawCompletionDistance !== null &&
      this.sim.forwardDistance >=
        this.realmDuskmawCompletionDistance + DUSKMAW_COMPLETE_COAST_DISTANCE
    ) {
      this.ended = true;
      this.endReason = "realm-complete";
      justEnded = true;
    } else if (
      this.realmId === "eclipse-court" &&
      this.realmEclipseCompleted &&
      this.realmEclipseCompletionDistance !== null &&
      this.sim.forwardDistance >= this.realmEclipseCompletionDistance +
        (this.realmStageIndex === 2
          ? ECLIPSE_COURT_FINALE_COAST_DISTANCE
          : ECLIPSE_COURT_COMPLETE_COAST_DISTANCE)
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
