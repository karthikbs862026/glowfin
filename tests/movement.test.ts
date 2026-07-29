import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import { FixedTimestepRunner, FIXED_DT_SEC } from "../src/core/timestep";
import {
  createSimState,
  cloneSimState,
  stepSim,
  applyCollision,
  forwardSpeed,
  type SimState
} from "../src/sim/state";

/**
 * Part 6.4 — Movement & control testing. This is the Core Design Principle's
 * test surface: determinism, frame-rate independence, and latency. Failures
 * here are release blockers, not bugs to triage later.
 */

/** A scripted steering timeline, sampled by *simulation* time. */
type SteeringScript = (elapsedSec: number) => number;

/** Drive the real runner at a given frame-time sequence; returns final state. */
function runFrames(frameTimes: readonly number[], script: SteeringScript): SimState {
  const state = createSimState();
  const runner = new FixedTimestepRunner(FIXED_DT_SEC);
  for (const frameTime of frameTimes) {
    runner.advance(frameTime, (dt) => {
      stepSim(state, script(state.elapsedSec), dt, tuning);
    });
  }
  return state;
}

function frames(count: number, dt: number): number[] {
  return Array.from({ length: count }, () => dt);
}

/** A steering pattern with reversals, holds, and partial deflections. */
const wigglyScript: SteeringScript = (t) => {
  if (t < 0.2) return 0;
  if (t < 0.5) return 1;
  if (t < 0.8) return -1;
  if (t < 1.1) return 0.35;
  return -0.6;
};

describe("determinism (Part 6.4)", () => {
  it("replaying an identical input sequence produces an identical end state", () => {
    const a = runFrames(frames(120, 1 / 60), wigglyScript);
    const b = runFrames(frames(120, 1 / 60), wigglyScript);
    expect(b).toEqual(a);
  });

  it("is reproducible across many repeats, not just twice", () => {
    const reference = runFrames(frames(90, 1 / 60), wigglyScript);
    for (let i = 0; i < 20; i++) {
      expect(runFrames(frames(90, 1 / 60), wigglyScript)).toEqual(reference);
    }
  });

  it("a snapshot can be restored and continued to the same outcome", () => {
    const state = createSimState();
    for (let i = 0; i < 200; i++) stepSim(state, 0.7, FIXED_DT_SEC, tuning);

    const snapshot = cloneSimState(state);
    for (let i = 0; i < 200; i++) stepSim(state, -0.4, FIXED_DT_SEC, tuning);
    const continued = cloneSimState(state);

    const restored = cloneSimState(snapshot);
    for (let i = 0; i < 200; i++) stepSim(restored, -0.4, FIXED_DT_SEC, tuning);

    expect(restored).toEqual(continued);
  });
});

describe("frame-rate independence (Part 6.4)", () => {
  // 30/60/120fps are exact multiples of the 120Hz sim step, so these must
  // match bit-for-bit. This is the test that catches the entire class of
  // "works on my phone, unfair on theirs" bugs.
  it("30fps, 60fps and 120fps produce identical end states over equal wall time", () => {
    const at120 = runFrames(frames(240, 1 / 120), wigglyScript);
    const at60 = runFrames(frames(120, 1 / 60), wigglyScript);
    const at30 = runFrames(frames(60, 1 / 30), wigglyScript);

    expect(at60).toEqual(at120);
    expect(at30).toEqual(at120);
  });

  it("holds under a longer run with collisions interleaved", () => {
    const run = (frameTimes: readonly number[]): SimState => {
      const state = createSimState();
      const runner = new FixedTimestepRunner(FIXED_DT_SEC);
      let nextCollisionAt = 1.0;
      for (const frameTime of frameTimes) {
        runner.advance(frameTime, (dt) => {
          stepSim(state, wigglyScript(state.elapsedSec), dt, tuning);
          if (state.elapsedSec >= nextCollisionAt) {
            applyCollision(state, tuning);
            nextCollisionAt += 1.0;
          }
        });
      }
      return state;
    };

    expect(run(frames(180, 1 / 60))).toEqual(run(frames(360, 1 / 120)));
    expect(run(frames(90, 1 / 30))).toEqual(run(frames(360, 1 / 120)));
  });

  it("jittery frame timing stays within one sim step of steady timing", () => {
    // Arbitrary frame times leave a different accumulator remainder, so exact
    // equality is not guaranteed — but divergence must stay bounded by a
    // single step's worth of travel, not drift over time.
    const steady = runFrames(frames(120, 1 / 60), wigglyScript);

    const jittered: number[] = [];
    let remaining = 2.0;
    let seed = 7;
    while (remaining > 0) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const dt = Math.min(remaining, 0.004 + (seed / 2147483648) * 0.03);
      jittered.push(dt);
      remaining -= dt;
    }
    const jitter = runFrames(jittered, wigglyScript);

    const maxTravelPerStep = forwardSpeed(steady, tuning) * FIXED_DT_SEC;
    expect(Math.abs(jitter.forwardDistance - steady.forwardDistance)).toBeLessThan(
      maxTravelPerStep * 1.5
    );
    expect(Math.abs(jitter.elapsedSec - steady.elapsedSec)).toBeLessThanOrEqual(FIXED_DT_SEC);
  });

  it("a long stall does not trigger a catch-up spiral", () => {
    // Returning from backgrounding hands us a huge frame time. The runner must
    // clamp it rather than trying to simulate the missing minutes (Part 2.1).
    const state = createSimState();
    const runner = new FixedTimestepRunner(FIXED_DT_SEC, 0.25);
    const steps = runner.advance(30, (dt) => stepSim(state, 0, dt, tuning));
    expect(steps).toBeLessThanOrEqual(Math.ceil(0.25 / FIXED_DT_SEC));
  });
});

describe("input latency budget (Part 4.6 / 6.4)", () => {
  it("reaches half of a step input within the latency budget, including a render frame", () => {
    const state = createSimState();
    const renderFrameMs = 1000 / 60;
    let elapsedMs = 0;
    while (state.smoothedSteering < 0.5 && elapsedMs < 1000) {
      stepSim(state, 1, FIXED_DT_SEC, tuning);
      elapsedMs += FIXED_DT_SEC * 1000;
    }
    // One render frame is added because the player sees the result on the next
    // painted frame, not the instant the sim updates.
    expect(elapsedMs + renderFrameMs).toBeLessThanOrEqual(
      tuning.readability.inputLatencyBudgetMs
    );
  });

  it("responds measurably on the very first step, not after a delay", () => {
    const state = createSimState();
    stepSim(state, 1, FIXED_DT_SEC, tuning);
    expect(state.smoothedSteering).toBeGreaterThan(0);
  });
});

describe("momentum behaviour (Part 2.2 / 2.4)", () => {
  const stepFor = (state: SimState, seconds: number, steering = 0) => {
    const count = Math.round(seconds / FIXED_DT_SEC);
    for (let i = 0; i < count; i++) stepSim(state, steering, FIXED_DT_SEC, tuning);
  };

  it("approaches but never exceeds the ceiling", () => {
    const state = createSimState();
    stepFor(state, 120);
    expect(state.momentum).toBeLessThanOrEqual(tuning.momentum.ceiling);
    expect(state.momentum).toBeGreaterThan(tuning.momentum.ceiling * 0.98);
  });

  it("builds to a high but not maxed momentum across a typical run length", () => {
    const state = createSimState();
    stepFor(state, 45);
    expect(state.momentum).toBeGreaterThan(0.95);
    expect(state.momentum).toBeLessThan(tuning.momentum.ceiling);
  });

  it("collision cuts momentum sharply but never to zero", () => {
    const state = createSimState();
    stepFor(state, 30);
    const before = state.momentum;
    expect(applyCollision(state, tuning)).toBe(true);
    expect(state.momentum).toBeLessThan(before * 0.5);
    expect(state.momentum).toBeGreaterThanOrEqual(tuning.momentum.collisionFloor);
  });

  it("i-frames prevent an immediate second collision", () => {
    const state = createSimState();
    stepFor(state, 20);
    expect(applyCollision(state, tuning)).toBe(true);
    const afterFirst = state.momentum;
    expect(applyCollision(state, tuning)).toBe(false);
    expect(state.momentum).toBe(afterFirst);
  });

  it("i-frames expire, allowing a later collision", () => {
    const state = createSimState();
    stepFor(state, 20);
    applyCollision(state, tuning);
    stepFor(state, tuning.momentum.invulnerabilityDurationSec + 0.1);
    expect(applyCollision(state, tuning)).toBe(true);
  });

  it("momentum does not regain during the stun window, then recovers", () => {
    const state = createSimState();
    stepFor(state, 30);
    applyCollision(state, tuning);
    const stunned = state.momentum;

    stepFor(state, tuning.momentum.stunDurationSec * 0.5);
    expect(state.momentum).toBeCloseTo(stunned, 10);

    stepFor(state, 3);
    expect(state.momentum).toBeGreaterThan(stunned);
  });
});

describe("movement bounds (Part 2.1)", () => {
  it("the creature body never leaves the lane", () => {
    const state = createSimState();
    const limit = tuning.lane.halfWidth - tuning.lane.creatureRadius;
    for (let i = 0; i < 5000; i++) {
      stepSim(state, 1, FIXED_DT_SEC, tuning);
      expect(state.lateralPosition).toBeLessThanOrEqual(limit + 1e-9);
    }
    for (let i = 0; i < 10000; i++) {
      stepSim(state, -1, FIXED_DT_SEC, tuning);
      expect(state.lateralPosition).toBeGreaterThanOrEqual(-limit - 1e-9);
    }
  });

  it("forward distance is monotonic", () => {
    const state = createSimState();
    let last = -1;
    for (let i = 0; i < 2000; i++) {
      stepSim(state, Math.sin(i / 40), FIXED_DT_SEC, tuning);
      expect(state.forwardDistance).toBeGreaterThan(last);
      last = state.forwardDistance;
    }
  });

  it("rapid direction reversal does not produce a position discontinuity", () => {
    const state = createSimState();
    let previous = state.lateralPosition;
    const maxJump = tuning.speed.lateralAtMaxMomentum * FIXED_DT_SEC * 1.001;
    for (let i = 0; i < 3000; i++) {
      stepSim(state, i % 2 === 0 ? 1 : -1, FIXED_DT_SEC, tuning);
      expect(Math.abs(state.lateralPosition - previous)).toBeLessThanOrEqual(maxJump);
      previous = state.lateralPosition;
    }
  });
});
