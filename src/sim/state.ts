/**
 * Simulation state and its step function (Part 2.2, 2.4, 4.2).
 *
 * Per ADR-0002 this is a deterministic, hand-authored movement model — no
 * physics solver. Position comes from integrating steering directly, so
 * identical inputs produce bit-identical outputs across devices, which is
 * what the replay (Part 6.4) and ghost (Part 8.2) systems depend on.
 *
 * State is mutated in place rather than returned fresh each step. At 120Hz
 * an allocation per step is real GC pressure on the iOS Safari heap
 * (Part 4.3), and mutation costs nothing in determinism as long as the step
 * function is a pure function of (state, input, dt). Use `cloneSimState` to
 * snapshot.
 */
import type { TuningConfig } from "../core/config";

export interface SimState {
  /** 0..ceiling. Drives speed, and later trail/glow/camera/audio (Part 2.2). */
  momentum: number;
  /** Seconds remaining with no momentum gain, after a collision. */
  stunRemainingSec: number;
  /** Seconds remaining of collision immunity, preventing cascades (Part 2.4). */
  invulnerableRemainingSec: number;
  /** Smoothed steering actually applied, -1..1. */
  smoothedSteering: number;
  /** Lateral offset from lane centre. */
  lateralPosition: number;
  /** Distance travelled along the course. */
  forwardDistance: number;
  /** Simulated seconds elapsed. Not wall-clock time. */
  elapsedSec: number;
}

export function createSimState(): SimState {
  return {
    momentum: 0,
    stunRemainingSec: 0,
    invulnerableRemainingSec: 0,
    smoothedSteering: 0,
    lateralPosition: 0,
    forwardDistance: 0,
    elapsedSec: 0
  };
}

export function cloneSimState(state: SimState): SimState {
  return { ...state };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Forward speed in world units/sec at the given momentum. */
export function forwardSpeed(state: SimState, cfg: TuningConfig): number {
  const t = cfg.momentum.ceiling === 0 ? 0 : state.momentum / cfg.momentum.ceiling;
  return lerp(cfg.speed.forwardAtZeroMomentum, cfg.speed.forwardAtMaxMomentum, t);
}

/** Lateral steering speed in world units/sec at the given momentum. */
export function lateralSpeed(state: SimState, cfg: TuningConfig): number {
  const t = cfg.momentum.ceiling === 0 ? 0 : state.momentum / cfg.momentum.ceiling;
  return lerp(cfg.speed.lateralAtZeroMomentum, cfg.speed.lateralAtMaxMomentum, t);
}

/**
 * Advance the simulation one fixed step.
 *
 * @param steeringTarget unsmoothed -1..1 target from the input module
 */
export function stepSim(
  state: SimState,
  steeringTarget: number,
  dtSec: number,
  cfg: TuningConfig
): void {
  // --- timers ---
  state.stunRemainingSec = Math.max(0, state.stunRemainingSec - dtSec);
  state.invulnerableRemainingSec = Math.max(0, state.invulnerableRemainingSec - dtSec);

  // --- steering smoothing ---
  // Half-life form rather than a fixed lerp alpha: a fixed alpha would make
  // responsiveness depend on step size, so tuning would silently change if the
  // step rate ever changed. This form is step-size independent.
  const halfLife = cfg.input.smoothingHalfLifeSec;
  const alpha = halfLife <= 0 ? 1 : 1 - Math.pow(2, -dtSec / halfLife);
  const clampedTarget = Math.max(-1, Math.min(1, steeringTarget));
  state.smoothedSteering += (clampedTarget - state.smoothedSteering) * alpha;

  // --- momentum ---
  // Asymptotic approach to the ceiling. Plateaus rather than climbing forever,
  // so obstacle lead time can never fall below the reaction window (Part 4.5).
  if (state.stunRemainingSec <= 0) {
    const { ceiling, gainRate } = cfg.momentum;
    state.momentum += (ceiling - state.momentum) * gainRate * dtSec;
    if (state.momentum > ceiling) state.momentum = ceiling;
  }

  // --- movement ---
  const maxOffset = cfg.lane.halfWidth - cfg.lane.creatureRadius;
  state.lateralPosition += state.smoothedSteering * lateralSpeed(state, cfg) * dtSec;
  if (state.lateralPosition > maxOffset) state.lateralPosition = maxOffset;
  if (state.lateralPosition < -maxOffset) state.lateralPosition = -maxOffset;

  state.forwardDistance += forwardSpeed(state, cfg) * dtSec;
  state.elapsedSec += dtSec;
}

/**
 * Apply a collision (Part 2.4). Momentum drops sharply but never to zero, and
 * i-frames start so a dense cluster cannot chain-hit the player.
 *
 * Returns false if the creature was invulnerable and nothing was applied.
 */
export function applyCollision(state: SimState, cfg: TuningConfig): boolean {
  if (state.invulnerableRemainingSec > 0) return false;

  const { collisionRetainFraction, collisionFloor, stunDurationSec, invulnerabilityDurationSec } =
    cfg.momentum;

  state.momentum = Math.max(collisionFloor, state.momentum * collisionRetainFraction);
  state.stunRemainingSec = stunDurationSec;
  state.invulnerableRemainingSec = invulnerabilityDurationSec;
  return true;
}
