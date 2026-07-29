import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC, FixedTimestepRunner } from "../src/core/timestep";
import { Run } from "../src/sim/run";
import type { Gate } from "../src/sim/course";

/**
 * Part 6.1 integration tests: input -> steering -> movement -> collision ->
 * scoring, end to end with synthetic input.
 *
 * Assertions are structural (invariants, ordering, bounds) rather than exact
 * numbers. Tuning is expected to move once real telemetry arrives in Phase 6;
 * a test asserting "runs last 54 seconds" would just be a tripwire on config.
 */

/**
 * Synthetic pilot.
 *
 * `bias` picks where across the gap to aim: 0 is dead centre, +/-1 is hard
 * against an edge. `wobble` is a deterministic correlated drift standing in for
 * hand imprecision.
 *
 * The wobble matters. An earlier version of this pilot had none and converged
 * on dead centre, so it never collided, never near-missed, and never ended a
 * run — which made every assertion below pass vacuously or fail confusingly.
 * A synthetic player with superhuman precision tests nothing.
 */
function makePilot(bias: number, wobble: number) {
  return (run: Run): number => {
    const r = tuning.lane.creatureRadius;
    const t = run.sim.elapsedSec;
    const drift = wobble * (Math.sin(1.7 * t) * 0.6 + Math.sin(2.9 * t + 1.1) * 0.4);

    // Scans from the front rather than caching an index: Run now prunes passed
    // gates (Part 4.3), which shifts every index, and pruning keeps the live
    // list short enough that a linear scan costs nothing.
    let gate: Gate | undefined;
    for (const candidate of run.gates) {
      if (candidate.distance >= run.sim.forwardDistance) {
        gate = candidate;
        break;
      }
    }
    if (!gate) return 0;

    const lo = gate.gapLeft + r;
    const hi = gate.gapRight - r;
    const centre = (lo + hi) / 2;
    const target = centre + (hi - centre) * bias + drift;
    return Math.max(-1, Math.min(1, (target - run.sim.lateralPosition) * 2.5));
  };
}

/** Default pilot: imperfect enough that runs actually end. */
const NORMAL = { bias: 0.4, wobble: 1.0 };

function playOut(seed: number, bias = NORMAL.bias, wobble = NORMAL.wobble, maxSeconds = 200) {
  const run = new Run(seed, tuning);
  const pilot = makePilot(bias, wobble);
  const steps = Math.round(maxSeconds / FIXED_DT_SEC);
  let nearMisses = 0;
  let collisions = 0;

  for (let i = 0; i < steps && !run.ended; i++) {
    const events = run.step(FIXED_DT_SEC, pilot(run));
    nearMisses += events.nearMisses;
    collisions += events.collisions;
  }
  return { run, nearMisses, collisions, elapsedSec: run.sim.elapsedSec };
}

describe("full run integration", () => {
  it("a run starts, plays, and ends", () => {
    const { run } = playOut(11);
    expect(run.sim.forwardDistance).toBeGreaterThan(0);
    expect(run.ended).toBe(true);
    expect(run.endReason).toBe("light-depleted");
  });

  it("is fully deterministic from the seed", () => {
    expect(playOut(2024).run.snapshot()).toEqual(playOut(2024).run.snapshot());
  });

  it("different seeds produce different runs", () => {
    expect(playOut(1).run.snapshot()).not.toEqual(playOut(2).run.snapshot());
  });

  it("holds every invariant across a spread of seeds", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { run } = playOut(seed);
      expect(run.light).toBeGreaterThanOrEqual(0);
      expect(run.light).toBeLessThanOrEqual(tuning.light.max);
      expect(run.scoring.multiplier).toBeGreaterThanOrEqual(tuning.scoring.multiplierStart);
      expect(run.scoring.multiplier).toBeLessThanOrEqual(tuning.scoring.multiplierCap);
      expect(run.scoring.score).toBeGreaterThan(0);
      expect(Number.isFinite(run.sim.forwardDistance)).toBe(true);
      expect(Math.abs(run.sim.lateralPosition)).toBeLessThanOrEqual(
        tuning.lane.halfWidth - tuning.lane.creatureRadius + 1e-9
      );
    }
  });

  it("stops simulating once ended", () => {
    const { run } = playOut(5);
    const afterEnd = run.snapshot();
    for (let i = 0; i < 100; i++) run.step(FIXED_DT_SEC, 1);
    expect(run.snapshot()).toEqual(afterEnd);
  });

  it("runs are frame-rate independent end to end", () => {
    const play = (frameSec: number) => {
      const run = new Run(777, tuning);
      const pilot = makePilot(NORMAL.bias, NORMAL.wobble);
      const runner = new FixedTimestepRunner(FIXED_DT_SEC);
      for (let i = 0; i < Math.round(20 / frameSec) && !run.ended; i++) {
        runner.advance(frameSec, (dt) => run.step(dt, pilot(run)));
      }
      return run.snapshot();
    };
    expect(play(1 / 60)).toEqual(play(1 / 120));
    expect(play(1 / 30)).toEqual(play(1 / 120));
  });
});

describe("collision, recovery and run end (Part 2.4)", () => {
  it("a collision costs light and cuts momentum without zeroing it", () => {
    const run = new Run(3, tuning);
    let sawCollision = false;
    for (let i = 0; i < 120 * 60 && !run.ended; i++) {
      if (run.step(FIXED_DT_SEC, 1).collisions > 0) {
        sawCollision = true;
        expect(run.light).toBeLessThan(tuning.light.max);
        expect(run.sim.momentum).toBeGreaterThanOrEqual(tuning.momentum.collisionFloor);
        break;
      }
    }
    expect(sawCollision).toBe(true);
  });

  it("i-frames stop a cluster draining light through the grace period", () => {
    const run = new Run(3, tuning);
    let collisions = 0;
    const start = run.light;
    const window = Math.round(tuning.momentum.invulnerabilityDurationSec / FIXED_DT_SEC);
    for (let i = 0; i < window * 3 && !run.ended; i++) {
      collisions += run.step(FIXED_DT_SEC, 1).collisions;
    }
    expect(start - run.light).toBeLessThanOrEqual(
      collisions * tuning.light.costPerCollision + 1e-9
    );
  });

  it("light regenerates during clean play", () => {
    const run = new Run(3, tuning);
    for (let i = 0; i < 120 * 60 && run.collisionCount === 0; i++) run.step(FIXED_DT_SEC, 1);
    const afterHit = run.light;
    expect(afterHit).toBeLessThan(tuning.light.max);

    const centred = makePilot(0, 0);
    for (let i = 0; i < 120 * 5 && !run.ended; i++) run.step(FIXED_DT_SEC, centred(run));
    expect(run.light).toBeGreaterThan(afterHit);
  });

  it("the run ends when light is depleted, after more than one collision", () => {
    const { run } = playOut(9);
    expect(run.light).toBe(0);
    expect(run.collisionCount).toBeGreaterThan(1);
  });
});

describe("near-miss beat (Part 2.3)", () => {
  it("greedy lines produce a higher near-miss RATE than cautious ones", () => {
    // Rate, not total: a greedy pilot dies sooner, so it accumulates fewer
    // near-misses overall while earning them far faster. Comparing totals
    // measures survival time, not risk appetite.
    const rate = (bias: number) => {
      let nearMisses = 0;
      let seconds = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const result = playOut(seed, bias, 0.7, 45);
        nearMisses += result.nearMisses;
        seconds += result.elapsedSec;
      }
      return nearMisses / seconds;
    };
    expect(rate(0.9)).toBeGreaterThan(rate(0));
  });

  it("slow-mo engages on a near-miss and expires", () => {
    const run = new Run(4, tuning);
    const greedy = makePilot(0.9, 0.7);
    let sawSlowMo = false;
    for (let i = 0; i < 120 * 60 && !run.ended; i++) {
      if (run.step(FIXED_DT_SEC, greedy(run)).nearMisses > 0) {
        expect(run.isInSlowMo).toBe(true);
        expect(run.timeScale).toBeLessThan(1);
        sawSlowMo = true;
        break;
      }
    }
    expect(sawSlowMo).toBe(true);

    const expire = Math.round(tuning.scoring.nearMissSlowMoDurationSec / FIXED_DT_SEC) + 2;
    for (let i = 0; i < expire && !run.ended; i++) run.step(FIXED_DT_SEC, greedy(run));
    expect(run.timeScale).toBe(1);
  });

  it("time scale is exactly 1 when not celebrating", () => {
    expect(new Run(6, tuning).timeScale).toBe(1);
  });
});

describe("memory discipline (Part 4.3)", () => {
  it("prunes passed gates instead of growing the list without bound", () => {
    const run = new Run(31, tuning);
    const pilot = makePilot(NORMAL.bias, NORMAL.wobble);
    let peak = 0;
    for (let i = 0; i < 120 * 120 && !run.ended; i++) {
      run.step(FIXED_DT_SEC, pilot(run));
      if (run.gates.length > peak) peak = run.gates.length;
    }
    // Bounded by sight distance over minimum spacing, plus what is kept behind.
    expect(peak).toBeLessThan(40);
    expect(run.sim.forwardDistance).toBeGreaterThan(1000);
  });

  it("pruning does not cause a gate to be missed", () => {
    // The scan cursor is an index into an array that pruning mutates. If the
    // correction were wrong, gates would be silently skipped and the player
    // would pass through walls.
    const a = new Run(88, tuning);
    const pilotA = makePilot(0.85, 0.9);
    let collisions = 0;
    for (let i = 0; i < 120 * 90 && !a.ended; i++) {
      collisions += a.step(FIXED_DT_SEC, pilotA(a)).collisions;
    }
    expect(collisions).toBeGreaterThan(0);
    expect(a.collisionCount).toBe(collisions);
  });
});
