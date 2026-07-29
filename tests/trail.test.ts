import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import budgets from "../config/budgets.json";

/**
 * The ribbon itself needs a WebGL context, so it is exercised on-device rather
 * than here. What *can* be asserted headlessly are the constraints that would
 * silently break a budget or a fairness guarantee if they drifted.
 */
describe("trail configuration (Part 3.2 / 3.3 / 4.6)", () => {
  it("segment count stays within the pooled budget", () => {
    expect(tuning.trail.segmentCount).toBeLessThanOrEqual(budgets.pools.maxTrailSegments);
  });

  it("the ribbon widens with momentum", () => {
    expect(tuning.trail.widthAtMaxMomentum).toBeGreaterThan(tuning.trail.widthAtZeroMomentum);
  });

  it("the ribbon brightens with momentum", () => {
    // Part 1.2's promise: playing well makes the game visibly more beautiful,
    // not merely harder. If these ever invert, that promise is broken.
    expect(tuning.trail.brightnessAtMaxMomentum).toBeGreaterThan(
      tuning.trail.brightnessAtZeroMomentum
    );
  });

  it("samples often enough to look continuous rather than stepped", () => {
    // At maximum forward speed, the gap between samples must stay small
    // relative to the creature, or the ribbon reads as discrete blobs.
    const gapUnits = tuning.speed.forwardAtMaxMomentum * tuning.trail.sampleIntervalSec;
    expect(gapUnits).toBeLessThan(tuning.lane.creatureRadius * 4);
  });

  it("holds enough history to be visible at speed", () => {
    const spanUnits =
      tuning.trail.segmentCount *
      tuning.trail.sampleIntervalSec *
      tuning.speed.forwardAtMaxMomentum;
    expect(spanUnits).toBeGreaterThan(tuning.lane.creatureRadius * 20);
  });
});

describe("bloom configuration", () => {
  it("has a threshold below the brightest surfaces, or nothing would bloom", () => {
    expect(tuning.visual.bloomThreshold).toBeLessThan(1);
    expect(tuning.visual.bloomStrength).toBeGreaterThan(0);
  });

  it("is the first effect dropped as quality falls (Part 4.6)", () => {
    // Bloom is the most expensive thing in the frame, so the low tier must not
    // keep it. If this inverts, the low tier stops being a recovery path.
    expect(budgets.quality.tiers.high.bloomEnabled).toBe(true);
    expect(budgets.quality.tiers.low.bloomEnabled).toBe(false);
  });

  it("bloom resolution scales down with tier", () => {
    expect(budgets.quality.tiers.medium.bloomResolutionScale).toBeLessThan(
      budgets.quality.tiers.high.bloomResolutionScale
    );
  });

  it("never renders bloom at full resolution", () => {
    // Full-res bloom on a mid-range mobile GPU is several milliseconds of a
    // 33ms budget for an effect that is barely distinguishable from half-res.
    for (const tier of ["high", "medium", "low"] as const) {
      expect(budgets.quality.tiers[tier].bloomResolutionScale).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("palette range (Part 3.4)", () => {
  it("obstacle caustics shift toward magenta at high momentum", () => {
    // Part 3.4 asks for a cyan/teal/purple/magenta range. A single-hue scene
    // meets none of it.
    expect(tuning.visual.causticMagentaShiftAtMaxMomentum).toBeGreaterThan(0);
  });
});
