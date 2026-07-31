import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import budgets from "../config/budgets.json";
import {
  createGlowfinRigGeometry,
  GLOWFIN_FORWARD_AXIS,
  GLOWFIN_REAR_AXIS
} from "../src/render/glowfinGeometry";

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

  it("swims into the obstacle corridor while preserving the approved side-eye read", () => {
    expect(GLOWFIN_FORWARD_AXIS).toEqual([0, 0, -1]);
    expect(GLOWFIN_REAR_AXIS).toEqual([0, 0, 1]);
    expect(tuning.creature.eyeOffsetX).toBeCloseTo(0.7);
    expect(tuning.creature.eyeOffsetY).toBeCloseTo(0.44);
    expect(tuning.creature.eyeOffsetZ).toBeCloseTo(0.2);
    expect(tuning.creature.eyeRadius).toBeCloseTo(0.12);

    const rig = createGlowfinRigGeometry(tuning, 1);
    rig.eyes.computeBoundingBox();
    const eyeBounds = rig.eyes.boundingBox;
    expect(eyeBounds?.min.x).toBeLessThan(
      -tuning.lane.creatureRadius * 0.58
    );
    expect(eyeBounds?.max.x).toBeGreaterThan(
      tuning.lane.creatureRadius * 0.58
    );
    expect(eyeBounds?.min.y).toBeGreaterThan(0);
    expect(eyeBounds?.min.z).toBeGreaterThan(0);
    expect(rig.pivots.tail.z).toBeGreaterThan(0);
    // The eyes and gills sit high and lateral so they peek around the body
    // crown. Travel direction still comes from the explicit negative-Z axis,
    // centered tail and obstacle corridor—not from hiding the approved eyes.
    expect(rig.pivots.gills.every((pivot) => pivot.z > 0)).toBe(true);
    rig.body.dispose();
    rig.eyes.dispose();
  });

  it("buries fin and tail pivots while keeping three external gills per side", () => {
    const rig = createGlowfinRigGeometry(tuning, 1);
    const radius = tuning.lane.creatureRadius;
    const axes = {
      x: radius * 0.96,
      y: radius * tuning.creature.bodyHeight,
      z: radius * tuning.creature.bodyLength
    };
    const insideBody = (point: { x: number; y: number; z: number }) =>
      point.x ** 2 / axes.x ** 2 +
        point.y ** 2 / axes.y ** 2 +
        point.z ** 2 / axes.z ** 2 <
      1;

    expect(insideBody(rig.pivots.finLeft)).toBe(true);
    expect(insideBody(rig.pivots.finRight)).toBe(true);
    expect(insideBody(rig.pivots.tail)).toBe(true);
    expect(rig.pivots.gills).toHaveLength(6);
    for (const side of [-1, 1]) {
      const fan = rig.pivots.gills.filter((pivot) =>
        Math.sign(pivot.x) === side
      );
      expect(fan).toHaveLength(3);
      expect(fan.every((pivot) =>
        Math.abs(pivot.x) >= radius * 0.71 &&
        Math.abs(pivot.x) <= radius * 0.82
      )).toBe(true);
    }

    rig.body.dispose();
    rig.eyes.dispose();
  });

  it("the creature's draw calls fit the budget alongside the scene", () => {
    // One skinned body mesh plus one combined emissive-eye mesh.
    const creatureDraws = 2;
    const conservativeSceneWithoutCreature = 72;
    expect(conservativeSceneWithoutCreature + creatureDraws).toBeLessThan(
      budgets.scene.maxDrawCalls
    );
  });
});
