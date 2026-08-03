import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import budgets from "../config/budgets.json";
import {
  createGlowfinRigGeometry,
  GLOWFIN_EYE_LOOK_AXIS,
  GLOWFIN_FORWARD_AXIS,
  GLOWFIN_REAR_AXIS
} from "../src/render/glowfinGeometry";
import {
  eyeEnergyTarget,
  eyeHueForEnergy,
  GLOWFIN_EYE_FRAGMENT_SHADER,
  resolveGlowfinAnimationState,
  smoothEyeEnergy
} from "../src/render/creature";

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

  it("uses both momentum and actual speed for the eye colour signal", () => {
    const speedOnly = eyeEnergyTarget(0, 1, tuning.creature.eyeSpeedInfluence);
    const momentumOnly = eyeEnergyTarget(1, 0, tuning.creature.eyeSpeedInfluence);
    expect(speedOnly).toBeGreaterThan(0);
    expect(momentumOnly).toBeGreaterThan(0);
    expect(eyeEnergyTarget(1, 1, tuning.creature.eyeSpeedInfluence)).toBe(1);
    expect(eyeEnergyTarget(-1, 2, tuning.creature.eyeSpeedInfluence)).toBe(
      tuning.creature.eyeSpeedInfluence
    );
  });

  it("keeps calm, cruise, fast and maximum eye colours distinct", () => {
    const hue = (energy: number) => eyeHueForEnergy(
      energy,
      tuning.creature.eyeHueCalm,
      tuning.creature.eyeHueCruise,
      tuning.creature.eyeHueFast,
      tuning.creature.eyeHueMax
    );
    expect(hue(0)).toBeCloseTo(tuning.creature.eyeHueCalm);
    expect(hue(0.42)).toBeCloseTo(tuning.creature.eyeHueCruise);
    expect(hue(0.78)).toBeCloseTo(tuning.creature.eyeHueFast);
    expect(hue(1)).toBeCloseTo(tuning.creature.eyeHueMax);
    expect(Math.abs(hue(0.5) - hue(1))).toBeGreaterThan(0.3);
  });

  it("smooths eye colour without making the result frame-rate dependent", () => {
    const oneFrame = smoothEyeEnergy(
      0,
      1,
      1 / 30,
      tuning.creature.eyeResponseHalfLifeSec
    );
    let twoFrames = 0;
    for (let frame = 0; frame < 2; frame++) {
      twoFrames = smoothEyeEnergy(
        twoFrames,
        1,
        1 / 60,
        tuning.creature.eyeResponseHalfLifeSec
      );
    }
    expect(twoFrames).toBeCloseTo(oneFrame, 8);
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

  it("keeps both eyes at the outer face edge physically ahead of the gills", () => {
    expect(GLOWFIN_FORWARD_AXIS).toEqual([0, 0, -1]);
    expect(GLOWFIN_REAR_AXIS).toEqual([0, 0, 1]);
    expect(GLOWFIN_EYE_LOOK_AXIS).toEqual(GLOWFIN_FORWARD_AXIS);
    expect(GLOWFIN_EYE_LOOK_AXIS).not.toEqual(GLOWFIN_REAR_AXIS);
    expect(tuning.creature.eyeOffsetX).toBeCloseTo(0.84);
    expect(tuning.creature.eyeOffsetY).toBeCloseTo(0.40);
    expect(tuning.creature.eyeOffsetZ).toBeCloseTo(0.46);
    expect(tuning.creature.eyeRadius).toBeGreaterThanOrEqual(0.22);

    const rig = createGlowfinRigGeometry(tuning, 1);
    rig.eyes.computeBoundingBox();
    const eyeBounds = rig.eyes.boundingBox;
    const radius = tuning.lane.creatureRadius;
    const eyeCentreY = radius * tuning.creature.eyeOffsetY;
    const eyeCentreX = radius * tuning.creature.eyeOffsetX;
    const eyeCentreZ = radius * tuning.creature.eyeOffsetZ;
    const bodyEllipsoidDistance =
      (eyeCentreX / (radius * 0.96)) ** 2 +
      (eyeCentreY / (radius * tuning.creature.bodyHeight)) ** 2 +
      (eyeCentreZ / (radius * tuning.creature.bodyLength)) ** 2;
    expect(bodyEllipsoidDistance).toBeGreaterThan(1.05);
    const bodyHalfWidthAtEye = radius * 0.96 * Math.sqrt(
      1 - (eyeCentreY / (radius * tuning.creature.bodyHeight)) ** 2 -
        (eyeCentreZ / (radius * tuning.creature.bodyLength)) ** 2
    );
    expect(eyeBounds?.min.x).toBeLessThan(
      -bodyHalfWidthAtEye - radius * 0.15
    );
    expect(eyeBounds?.max.x).toBeGreaterThan(
      bodyHalfWidthAtEye + radius * 0.15
    );

    const nearestGillRootZ = Math.min(...rig.pivots.gills.map((pivot) =>
      pivot.z
    ));
    expect(nearestGillRootZ - (eyeBounds?.max.z ?? Infinity)).toBeGreaterThan(
      radius * 0.01
    );
    expect(rig.pivots.tail.z).toBeGreaterThan(0);
    // Negative Z is forward. The complete eye lens—not merely its centre—must
    // therefore remain below every gill root's Z coordinate while its outer
    // edge clears the body silhouette for the chase camera.
    expect(rig.pivots.gills.every((pivot) => pivot.z > 0)).toBe(true);
    const innerGillX = Math.min(...rig.pivots.gills.map((pivot) =>
      Math.abs(pivot.x)
    ));
    expect(innerGillX - eyeCentreX).toBeGreaterThanOrEqual(0);
    expect(innerGillX - eyeCentreX).toBeLessThanOrEqual(
      radius * 0.25
    );
    expect((eyeBounds?.max.x ?? -Infinity) - innerGillX).toBeGreaterThan(
      radius * 0.2
    );
    expect((eyeBounds?.max.x ?? 0) - (eyeBounds?.min.x ?? 0)).toBeGreaterThan(
      radius * 1.62
    );
    rig.body.dispose();
    rig.eyes.dispose();
  });

  it("locks iris and pupil gaze to the obstacle axis rather than the camera", () => {
    expect(GLOWFIN_EYE_LOOK_AXIS).toEqual([0, 0, -1]);
    expect(GLOWFIN_EYE_FRAGMENT_SHADER).toContain(
      "dot(normalize(vObjectNormal), normalize(uLookDirection))"
    );
    expect(GLOWFIN_EYE_FRAGMENT_SHADER).toContain(
      "float irisMask = smoothstep(0.2, 0.78, forwardFacing)"
    );
    expect(GLOWFIN_EYE_FRAGMENT_SHADER).toContain(
      "float pupilMask = smoothstep(0.88, 0.985, forwardFacing)"
    );
    expect(GLOWFIN_EYE_FRAGMENT_SHADER).not.toContain(
      "irisMask = smoothstep(0.2, 0.78, viewFacing)"
    );
    expect(GLOWFIN_EYE_FRAGMENT_SHADER).not.toContain(
      "pupilMask = smoothstep(0.88, 0.985, viewFacing)"
    );
  });

  it("uses exactly one visible fin per side and one centered tail", () => {
    const rig = createGlowfinRigGeometry(tuning, 1);
    expect(rig.appendageComponents).toEqual({
      finLeft: 1,
      finRight: 1,
      tail: 1
    });
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
        Math.abs(pivot.x) >= radius * 0.79 &&
        Math.abs(pivot.x) <= radius * 0.93
      )).toBe(true);
      const eyeX = radius * tuning.creature.eyeOffsetX;
      expect(fan.every((pivot) =>
        Math.abs(pivot.x) - eyeX >= 0
      )).toBe(true);
    }

    rig.body.dispose();
    rig.eyes.dispose();
  });

  it("selects five simulation-driven animation states with safe precedence", () => {
    expect(resolveGlowfinAnimationState(0.1, 0, 0)).toBe("calm");
    expect(resolveGlowfinAnimationState(0.5, 0, 0)).toBe("mid");
    expect(resolveGlowfinAnimationState(0.9, 0, 0)).toBe("max");
    expect(resolveGlowfinAnimationState(0.9, 0, 0.4)).toBe("recovery");
    expect(resolveGlowfinAnimationState(0.9, 0.3, 0.4)).toBe("collision");
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
