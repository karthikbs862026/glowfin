/**
 * Fixed-timestep accumulator.
 *
 * Part 4.2 makes this non-negotiable: simulation runs at a fixed step,
 * decoupled from render frame rate. A render frame does however many sim
 * steps the elapsed wall time earns — so a 30fps device and a 60fps device
 * run the *same* simulation, just sampled for display at different rates.
 *
 * This class is used by both the game loop and the Part 6.4 frame-rate
 * independence tests, deliberately. If tests used their own stepping logic
 * they would be testing a reimplementation rather than the real thing.
 */
export class FixedTimestepRunner {
  private accumulator = 0;

  /**
   * @param fixedDtSec   simulation step size
   * @param maxFrameSec  frame times longer than this are clamped. Without
   *                     this, returning from app backgrounding hands us a
   *                     multi-second frame time and the catch-up loop
   *                     freezes the tab (the "spiral of death"). Part 2.1
   *                     requires backgrounding be handled explicitly.
   */
  constructor(
    private readonly fixedDtSec: number,
    private readonly maxFrameSec = 0.25
  ) {
    if (!(fixedDtSec > 0)) {
      throw new Error(`FixedTimestepRunner: fixedDtSec must be > 0, got ${fixedDtSec}`);
    }
  }

  /** Advance by one render frame; invokes `step` zero or more times. Returns steps taken. */
  advance(frameSec: number, step: (dtSec: number) => void): number {
    this.accumulator += Math.min(Math.max(frameSec, 0), this.maxFrameSec);
    let steps = 0;
    while (this.accumulator >= this.fixedDtSec) {
      step(this.fixedDtSec);
      this.accumulator -= this.fixedDtSec;
      steps++;
    }
    return steps;
  }

  /** Leftover time not yet consumed by a step. Useful for render interpolation. */
  get pendingSec(): number {
    return this.accumulator;
  }

  /** Drop accumulated time — call on resume from background so we don't catch up. */
  reset(): void {
    this.accumulator = 0;
  }
}

/** Simulation step size. 120Hz gives collision headroom at max momentum. */
export const FIXED_DT_SEC = 1 / 120;
