import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import {
  createScoringState,
  registerNearMiss,
  canRegisterNearMiss,
  stepScoring
} from "../src/sim/scoring";

const DT = 1 / 120;
const advance = (state: ReturnType<typeof createScoringState>, seconds: number, distancePerSec = 0) => {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepScoring(state, distancePerSec * DT, DT, tuning);
};

describe("multiplier", () => {
  it("starts at the configured value", () => {
    expect(createScoringState(tuning).multiplier).toBe(tuning.scoring.multiplierStart);
  });

  it("rises by the configured gain on a near-miss", () => {
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    expect(s.multiplier).toBeCloseTo(
      tuning.scoring.multiplierStart + tuning.scoring.multiplierGainPerNearMiss,
      9
    );
  });

  it("never exceeds the cap", () => {
    const s = createScoringState(tuning);
    for (let i = 0; i < 200; i++) {
      s.nearMissCooldownRemainingSec = 0;
      registerNearMiss(s, tuning);
    }
    expect(s.multiplier).toBe(tuning.scoring.multiplierCap);
  });

  it("holds steady during the decay grace period", () => {
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    const afterGain = s.multiplier;
    advance(s, tuning.scoring.multiplierDecayGraceSec * 0.9);
    expect(s.multiplier).toBeCloseTo(afterGain, 9);
  });

  it("decays once the grace period elapses", () => {
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    const afterGain = s.multiplier;
    advance(s, tuning.scoring.multiplierDecayGraceSec + 2);
    expect(s.multiplier).toBeLessThan(afterGain);
  });

  it("never decays below the starting multiplier", () => {
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    advance(s, 600);
    expect(s.multiplier).toBe(tuning.scoring.multiplierStart);
  });

  it("tight cadence is net positive, loose cadence is net negative (Part 2.3)", () => {
    const runCadence = (gapSec: number, totalSec: number) => {
      const s = createScoringState(tuning);
      let elapsed = 0;
      while (elapsed < totalSec) {
        advance(s, gapSec);
        s.nearMissCooldownRemainingSec = 0;
        registerNearMiss(s, tuning);
        elapsed += gapSec;
      }
      return s.multiplier;
    };
    // The safety-vs-spectacle trade has to be numerically real, not cosmetic.
    expect(runCadence(4, 60)).toBeGreaterThan(runCadence(12, 60));
  });
});

describe("near-miss cooldown", () => {
  it("suppresses a second near-miss inside the cooldown", () => {
    const s = createScoringState(tuning);
    expect(registerNearMiss(s, tuning)).toBe(true);
    expect(registerNearMiss(s, tuning)).toBe(false);
  });

  it("does not award multiplier for a suppressed near-miss", () => {
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    const after = s.multiplier;
    registerNearMiss(s, tuning);
    expect(s.multiplier).toBe(after);
  });

  it("allows another once the cooldown expires", () => {
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    advance(s, tuning.scoring.nearMissCooldownSec + 0.05);
    expect(canRegisterNearMiss(s)).toBe(true);
    expect(registerNearMiss(s, tuning)).toBe(true);
  });

  it("a dense cluster cannot farm stacks", () => {
    const s = createScoringState(tuning);
    // Twenty gates crossed in half a second.
    for (let i = 0; i < 20; i++) {
      registerNearMiss(s, tuning);
      advance(s, 0.025);
    }
    expect(s.nearMissCount).toBe(1);
  });
});

describe("score accumulation", () => {
  it("banks distance times the multiplier held at the time (ADR-0006)", () => {
    const s = createScoringState(tuning);
    advance(s, 1, 100); // 100 units at multiplier 1
    const atBaseMultiplier = s.score;
    expect(atBaseMultiplier).toBeCloseTo(100 * tuning.scoring.multiplierStart, 4);

    registerNearMiss(s, tuning);
    advance(s, 1, 100); // another 100 units at the raised multiplier
    expect(s.score - atBaseMultiplier).toBeGreaterThan(atBaseMultiplier);
  });

  it("is monotonically non-decreasing", () => {
    const s = createScoringState(tuning);
    let previous = 0;
    for (let i = 0; i < 2000; i++) {
      stepScoring(s, 0.3, DT, tuning);
      expect(s.score).toBeGreaterThanOrEqual(previous);
      previous = s.score;
    }
  });

  it("a late multiplier collapse does not erase earned score", () => {
    // The literal reading of `score = distance x multiplier` would. This asserts
    // we implemented the integral instead.
    const s = createScoringState(tuning);
    registerNearMiss(s, tuning);
    advance(s, 5, 100);
    const banked = s.score;
    advance(s, 120); // long safe stretch: multiplier decays all the way down
    expect(s.multiplier).toBe(tuning.scoring.multiplierStart);
    expect(s.score).toBeGreaterThanOrEqual(banked);
  });
});
