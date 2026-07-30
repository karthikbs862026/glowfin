import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import budgets from "../config/budgets.json";

/**
 * The creature needs a WebGL context, so its rendering is judged on device.
 * What is asserted here are the properties that carry fairness or design
 * meaning, and would break silently if a number drifted.
 */
describe("creature configuration (Part 3.1)", () => {
  it("fins beat faster with momentum", () => {
    // The creature visibly working harder is how effort reads at speed.
    expect(tuning.creature.finFlutterHzAtMaxMomentum).toBeGreaterThan(
      tuning.creature.finFlutterHzAtZeroMomentum
    );
  });

  it("eye hue actually travels between calm and hot", () => {
    // Part 3.1 makes eye hue the diegetic momentum indicator. If these ever
    // converge, the only momentum readout in the game silently disappears.
    expect(Math.abs(tuning.creature.eyeHueMax - tuning.creature.eyeHueCalm)).toBeGreaterThan(0.2);
  });

  it("body dims as light depletes, because dimming is the danger signal", () => {
    // ADR-0006: light drives body glow, momentum drives hue. If this inverts,
    // running out of light would make the creature brighter.
    expect(tuning.creature.bodyGlowAtFullLight).toBeGreaterThan(
      tuning.creature.bodyGlowAtZeroLight
    );
  });

  it("keeps some glow at zero light so the creature never vanishes", () => {
    expect(tuning.creature.bodyGlowAtZeroLight).toBeGreaterThan(0);
  });

  it("bank smoothing stays short enough not to read as input latency", () => {
    // The simulation responds immediately, but if the creature visibly lags the
    // steering the player just gave, it *feels* like lag — which is a Core
    // Design Principle problem arriving through animation rather than code.
    expect(tuning.creature.bankSmoothingHalfLifeSec).toBeLessThanOrEqual(0.12);
  });

  it("banks enough to be visible, not so much it obscures the silhouette", () => {
    expect(tuning.creature.bankAngleMaxRadians).toBeGreaterThan(0.15);
    expect(tuning.creature.bankAngleMaxRadians).toBeLessThan(0.9);
  });

  it("has a rim term, which is what sells glowing from within", () => {
    expect(tuning.creature.rimStrength).toBeGreaterThan(0);
  });

  it("the creature's draw calls fit the budget alongside the scene", () => {
    // body + 2 eyes + 2 fins + tail + 6 gills = 12 meshes, and the scene was
    // measured at 48 draws with the old single-sphere creature.
    const creatureMeshes = 12;
    const measuredSceneDraws = 48;
    expect(measuredSceneDraws - 1 + creatureMeshes).toBeLessThan(budgets.scene.maxDrawCalls);
  });
});
