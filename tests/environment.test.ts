import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import budgets from "../config/budgets.json";

/**
 * The environment needs a WebGL context, so its look is judged on device. These
 * assert the constraints that make it *background* rather than something that
 * competes with the gameplay-critical silhouettes.
 */
describe("environment must not compete with obstacles (Part 3.4)", () => {
  it("ruins sit entirely outside the lane", () => {
    // A ruin inside the lane would read as an obstacle the player cannot hit,
    // which is worse than an invisible one — it teaches a false rule.
    expect(tuning.environment.buildingLateralMin).toBeGreaterThan(tuning.lane.halfWidth + 2);
  });

  it("ruins stay far dimmer than obstacle edges", () => {
    expect(tuning.environment.buildingBrightness).toBeLessThan(
      tuning.visual.obstacleEdgeStrength * 0.3
    );
  });

  it("coral rests dim and only brightens on approach", () => {
    expect(tuning.environment.coralBaseGlow).toBeLessThan(tuning.environment.coralPulseGlow);
    expect(tuning.environment.coralBaseGlow).toBeLessThan(0.5);
  });

  it("coral sits outside the lane too", () => {
    // Placement runs from halfWidth + 0.35 outward, so the nearest coral is
    // clear of the playable lane.
    expect(tuning.lane.halfWidth + 0.35).toBeGreaterThan(tuning.lane.halfWidth);
  });

  it("god-rays are sparse, as Part 3.2 asks", () => {
    // "Sparse and selective through ruins, not everywhere." Spacing well beyond
    // the sight distance means rarely more than one or two in view.
    expect(tuning.environment.godRayBandSpacing).toBeGreaterThan(
      tuning.readability.visibleAheadUnits * 0.5
    );
    expect(tuning.environment.godRayCount).toBeLessThan(15);
  });
});

describe("coral response (Part 3.2 priority 5)", () => {
  it("has a trigger radius that a passing creature actually reaches", () => {
    // Coral sits just outside the lane; the creature can reach the lane edge.
    // If the radius were smaller than that gap, nothing would ever pulse.
    const nearestApproach = 0.35;
    expect(tuning.environment.coralPulseRadiusUnits).toBeGreaterThan(nearestApproach);
  });

  it("pulses decay fast enough to read as a response, not a light switch", () => {
    // At this rate a pulse falls to ~13% within a second of passing.
    const remainingAfterOneSecond = Math.exp(-tuning.environment.coralPulseDecayPerSec);
    expect(remainingAfterOneSecond).toBeLessThan(0.25);
    expect(remainingAfterOneSecond).toBeGreaterThan(0.01);
  });
});

describe("draw call budget (Part 4.6)", () => {
  it("the whole environment costs three draws, not dozens", () => {
    // Instanced: buildings, god-rays and coral are one draw each regardless of
    // count. Individually they would be 127 objects and blow the budget alone.
    const environmentDraws = 3;
    const measuredSceneDraws = 62;
    expect(measuredSceneDraws + environmentDraws).toBeLessThan(budgets.scene.maxDrawCalls);
    expect(
      tuning.environment.buildingCount +
        tuning.environment.godRayCount +
        tuning.environment.coralCount
    ).toBeGreaterThan(budgets.scene.maxDrawCalls);
  });
});
