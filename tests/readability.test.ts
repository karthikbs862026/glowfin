import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";

/**
 * Guardrails for readability constraints that are easy to violate by adjusting
 * one number in isolation. Each of these encodes a bug that actually happened.
 */
describe("fog must not eat the reaction window (Part 4.5)", () => {
  it("fog begins beyond the furthest obstacle the player must read", () => {
    // The bug: fog started at visibleAhead * 1.15 = 103.5 camera depth, and an
    // obstacle at the edge of the 90-unit reaction window sits at
    // 90 + camera distance = 103.5. Exactly equal, so obstacles were being
    // faded out at precisely the distance they had to remain readable.
    const furthestRequired =
      tuning.readability.visibleAheadUnits + tuning.camera.distanceBehindAtMaxMomentum;
    const fogStart = tuning.readability.visibleAheadUnits * tuning.visual.fogNearMultiplier;
    expect(fogStart).toBeGreaterThan(furthestRequired);
  });

  it("leaves real margin, not a rounding error", () => {
    const furthestRequired =
      tuning.readability.visibleAheadUnits + tuning.camera.distanceBehindAtMaxMomentum;
    const fogStart = tuning.readability.visibleAheadUnits * tuning.visual.fogNearMultiplier;
    expect(fogStart / furthestRequired).toBeGreaterThan(1.2);
  });

  it("fog ends after it begins", () => {
    expect(tuning.visual.fogFarMultiplier).toBeGreaterThan(tuning.visual.fogNearMultiplier);
  });
});

describe("bloom must not wash out its own surroundings", () => {
  it("the obstacle edge does not saturate hard enough to bleed badly", () => {
    // Measured failure mode: a saturated edge (luminance 1.000) lifted the
    // background 3px away to 0.36-0.43 through bloom, dragging contrast to
    // ~2.3:1. Raising edge strength made this worse, not better.
    const edgeColourLuminance = 0.827; // 0xbdf4ff
    expect(tuning.visual.obstacleEdgeStrength * edgeColourLuminance).toBeLessThan(1.15);
  });

  it("bloom radius stays tight enough to not reach the sampling offset", () => {
    expect(tuning.visual.bloomRadius).toBeLessThanOrEqual(0.4);
  });
});
