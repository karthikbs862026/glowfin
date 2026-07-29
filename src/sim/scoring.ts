/**
 * Scoring, multiplier, and the near-miss beat (Part 2.3).
 *
 * INTERPRETATION NOTE — Part 2.3 states `score = distance x multiplier`. Read
 * literally that means total distance times the multiplier held at the moment
 * the run ends, which would let a single late lapse erase an entire run's work
 * and would make the multiplier's decay curve almost meaningless mid-run.
 *
 * Implemented instead as the integral: each step banks
 * `distanceTravelled * currentMultiplier`. Distance still times multiplier, but
 * accumulated over the run. This makes "hold a high multiplier through this
 * stretch" the actual skill expression, which is what the safety-vs-spectacle
 * trade in Part 2.3 is describing. See ADR-0006.
 */
import type { TuningConfig } from "../core/config";

export interface ScoringState {
  multiplier: number;
  score: number;
  /** Time since the last near-miss, driving decay grace. */
  secondsSinceNearMiss: number;
  /** Blocks a single cluster from farming multiplier stacks (Part 2.3). */
  nearMissCooldownRemainingSec: number;
  nearMissCount: number;
}

export function createScoringState(cfg: TuningConfig): ScoringState {
  return {
    multiplier: cfg.scoring.multiplierStart,
    score: 0,
    secondsSinceNearMiss: 0,
    nearMissCooldownRemainingSec: 0,
    nearMissCount: 0
  };
}

export function cloneScoringState(state: ScoringState): ScoringState {
  return { ...state };
}

/** True if a near-miss may register right now (cooldown elapsed). */
export function canRegisterNearMiss(state: ScoringState): boolean {
  return state.nearMissCooldownRemainingSec <= 0;
}

/**
 * Register a near-miss. Returns false if the cooldown suppressed it, so the
 * caller knows whether to fire the slow-mo and audio beat.
 */
export function registerNearMiss(state: ScoringState, cfg: TuningConfig): boolean {
  if (!canRegisterNearMiss(state)) return false;

  state.multiplier = Math.min(
    cfg.scoring.multiplierCap,
    state.multiplier + cfg.scoring.multiplierGainPerNearMiss
  );
  state.secondsSinceNearMiss = 0;
  state.nearMissCooldownRemainingSec = cfg.scoring.nearMissCooldownSec;
  state.nearMissCount++;
  return true;
}

/**
 * Advance scoring one step.
 *
 * @param distanceTravelled forward distance covered this step
 */
export function stepScoring(
  state: ScoringState,
  distanceTravelled: number,
  dtSec: number,
  cfg: TuningConfig
): void {
  state.secondsSinceNearMiss += dtSec;
  state.nearMissCooldownRemainingSec = Math.max(
    0,
    state.nearMissCooldownRemainingSec - dtSec
  );

  // Decay only after the grace period, so the 4-8s target cadence from Part 2.3
  // stays net-positive while looser play bleeds the multiplier away.
  if (state.secondsSinceNearMiss > cfg.scoring.multiplierDecayGraceSec) {
    state.multiplier = Math.max(
      cfg.scoring.multiplierStart,
      state.multiplier - cfg.scoring.multiplierDecayPerSec * dtSec
    );
  }

  state.score += distanceTravelled * state.multiplier;
}
