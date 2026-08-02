import { describe, it, expect } from "vitest";
import { tuning, validateTuning, type TuningConfig } from "../src/core/config";

/**
 * A tuning object whose sections are freely mutable, so tests can inject
 * deliberately invalid values.
 *
 * Keyed by `keyof TuningConfig` rather than `string` on purpose: with
 * `noUncheckedIndexedAccess` enabled, a `string` index signature would make
 * every section possibly-undefined and `bad.momentum.gainRate = 99` would not
 * compile. A mapped type over known literal keys gives real properties
 * instead. Sections stay `Record<string, unknown>` so wrong-typed and
 * out-of-range values can be assigned — which is the whole point here.
 *
 * Not `any`: CI runs eslint with --max-warnings=0 and no-explicit-any would
 * fail the build.
 */
type MutableTuning = Record<keyof TuningConfig, Record<string, unknown>>;

/** Deep clone so each test can mutate freely without leaking into the next. */
function cloneTuning(): MutableTuning {
  return JSON.parse(JSON.stringify(tuning)) as MutableTuning;
}

describe("tuning config", () => {
  it("the shipped config passes validation", () => {
    expect(() => validateTuning(tuning)).not.toThrow();
  });

  it("exposes the values the sim depends on", () => {
    expect(tuning.momentum.gainRate).toBeGreaterThan(0);
    expect(tuning.speed.forwardAtMaxMomentum).toBeGreaterThan(
      tuning.speed.forwardAtZeroMomentum
    );
    expect(tuning.lane.halfWidth).toBeGreaterThan(tuning.lane.creatureRadius);
  });

  it("rejects an out-of-range value and names the offending key", () => {
    const bad = cloneTuning();
    bad.momentum.gainRate = 99;
    expect(() => validateTuning(bad)).toThrow(/momentum\.gainRate/);
  });

  it("rejects a missing value", () => {
    const bad = cloneTuning();
    // Reflect.deleteProperty rather than `delete`: the delete operator has
    // its own TS restrictions on non-optional properties, and this sidesteps them.
    Reflect.deleteProperty(bad.scoring, "multiplierCap");
    expect(() => validateTuning(bad)).toThrow(/scoring\.multiplierCap/);
  });

  it("rejects a non-numeric value", () => {
    const bad = cloneTuning();
    bad.lane.halfWidth = "6.0";
    expect(() => validateTuning(bad)).toThrow(/lane\.halfWidth/);
  });

  it("reports every problem at once, not just the first", () => {
    const bad = cloneTuning();
    bad.momentum.gainRate = 99;
    bad.lane.halfWidth = -1;
    bad.scoring.multiplierCap = 0;
    let message = "";
    try {
      validateTuning(bad);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/momentum\.gainRate/);
    expect(message).toMatch(/lane\.halfWidth/);
    expect(message).toMatch(/scoring\.multiplierCap/);
  });

  describe("cross-field invariants", () => {
    it("rejects collisionFloor at or above ceiling", () => {
      const bad = cloneTuning();
      bad.momentum.collisionFloor = 0.9;
      bad.momentum.ceiling = 0.9;
      expect(() => validateTuning(bad)).toThrow(/collisionFloor must be below/);
    });

    it("rejects creatureRadius larger than the lane", () => {
      const bad = cloneTuning();
      bad.lane.creatureRadius = 4.9;
      bad.lane.halfWidth = 4.5;
      expect(() => validateTuning(bad)).toThrow(/creatureRadius must be smaller/);
    });

    it("rejects a collision cost that would end the run in one hit", () => {
      const bad = cloneTuning();
      bad.light.costPerCollision = 150;
      bad.light.max = 100;
      expect(() => validateTuning(bad)).toThrow(/costPerCollision must not exceed/);
    });

    it("rejects inverted forward speeds", () => {
      const bad = cloneTuning();
      bad.speed.forwardAtZeroMomentum = 50;
      bad.speed.forwardAtMaxMomentum = 20;
      expect(() => validateTuning(bad)).toThrow(/must not exceed/);
    });

    it("rejects audio layers that enter in the wrong order", () => {
      const bad = cloneTuning();
      bad.audio.currentLayerStartMomentum = 0.7;
      bad.audio.shimmerLayerStartMomentum = 0.6;
      expect(() => validateTuning(bad)).toThrow(
        /currentLayerStartMomentum must be below/
      );
    });

    it("rejects a fractional transient voice cap", () => {
      const bad = cloneTuning();
      bad.audio.maxVoices = 10.5;
      expect(() => validateTuning(bad)).toThrow(/maxVoices must be a whole number/);
    });

    it("rejects a mix that falls below the phone-speaker audibility floors", () => {
      const quietAmbient = cloneTuning();
      quietAmbient.audio.masterGain = 0.2;
      quietAmbient.audio.ambientGain = 0.2;
      expect(() => validateTuning(quietAmbient)).toThrow(/calm-bed floor/);

      const quietCues = cloneTuning();
      quietCues.audio.masterGain = 0.2;
      quietCues.audio.cueGain = 0.2;
      expect(() => validateTuning(quietCues)).toThrow(/cue floor/);
    });
  });

  describe("Core Design Principle guardrails (Part 1.3 / 4.5)", () => {
    it("visible-ahead distance covers the reaction window at max momentum", () => {
      const maxSpeed = tuning.speed.forwardAtMaxMomentum;
      const windowSec = tuning.readability.minReactionWindowMs / 1000;
      const requiredSight = maxSpeed * windowSec;
      expect(tuning.readability.visibleAheadUnits).toBeGreaterThanOrEqual(requiredSight);
    });

    it("worst-case lane traversal fits inside the sight distance with margin", () => {
      const { visibleAheadUnits, maxLaneTraversalFraction, minSolvabilityMarginFraction } =
        tuning.readability;
      const laneWidth = tuning.lane.halfWidth * 2;
      const worstTravel = laneWidth * maxLaneTraversalFraction;
      const forwardUnitsNeeded =
        tuning.speed.forwardAtMaxMomentum * (worstTravel / tuning.speed.lateralAtMaxMomentum);
      const margin = (visibleAheadUnits - forwardUnitsNeeded) / visibleAheadUnits;
      expect(margin).toBeGreaterThanOrEqual(minSolvabilityMarginFraction);
    });

    it("momentum never zeroes on collision (Part 2.4)", () => {
      expect(tuning.momentum.collisionFloor).toBeGreaterThan(0);
    });

    it("input smoothing stays low enough to avoid perceptible latency (Part 2.1)", () => {
      // Half-life above ~60ms starts being felt as float on a precision game.
      expect(tuning.input.smoothingHalfLifeSec).toBeLessThanOrEqual(0.06);
    });
  });
});
