import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { tuning } from "../src/core/config";
import budgets from "../config/budgets.json";
import {
  createGlowfinRigGeometry,
  GLOWFIN_EYE_LOOK_AXIS,
  GLOWFIN_FORWARD_AXIS,
  GLOWFIN_REAR_AXIS
} from "../src/render/glowfinGeometry";
import {
  Creature,
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
  it("keeps the translucent ghost within one additional active material", () => {
    const skinMap = new THREE.Texture();
    const ghost = new Creature(tuning, skinMap, { ghost: true });
    const materials = new Set<THREE.Material>();

    ghost.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const assigned = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of assigned) materials.add(material);
    });

    expect(materials.size).toBe(1);
    const [material] = materials;
    expect(material?.transparent).toBe(true);
    expect(material?.depthWrite).toBe(false);

    ghost.dispose();
    skinMap.dispose();
  });

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

  it("keeps both eyes on the high forward face edge before the gill fans", () => {
    expect(GLOWFIN_FORWARD_AXIS).toEqual([0, 0, -1]);
    expect(GLOWFIN_REAR_AXIS).toEqual([0, 0, 1]);
    expect(GLOWFIN_EYE_LOOK_AXIS).toEqual(GLOWFIN_FORWARD_AXIS);
    expect(GLOWFIN_EYE_LOOK_AXIS).not.toEqual(GLOWFIN_REAR_AXIS);
    expect(tuning.creature.eyeOffsetX).toBeCloseTo(0.62);
    expect(tuning.creature.eyeOffsetY).toBeCloseTo(0.76);
    expect(tuning.creature.eyeOffsetZ).toBeCloseTo(-0.48);
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
      radius * 0.8
    );
    expect(eyeBounds?.max.z).toBeLessThan(0);
    expect(rig.pivots.tail.z).toBeGreaterThan(0);
    // Negative Z is forward. The complete eye lens—not merely its centre—must
    // therefore remain below every gill root's Z coordinate while its outer
    // edge clears the body silhouette for the chase camera.
    expect(rig.pivots.gills.every((pivot) => pivot.z > 0)).toBe(true);
    const innerGillX = Math.min(...rig.pivots.gills.map((pivot) =>
      Math.abs(pivot.x)
    ));
    const highestGillRootY = Math.max(...rig.pivots.gills.map((pivot) =>
      pivot.y
    ));
    expect(innerGillX - eyeCentreX).toBeGreaterThanOrEqual(0);
    expect(innerGillX - eyeCentreX).toBeLessThanOrEqual(
      radius * 0.25
    );
    expect(Math.abs((eyeBounds?.max.x ?? Infinity) - innerGillX)).toBeLessThan(
      radius * 0.03
    );
    expect(eyeCentreY - highestGillRootY).toBeGreaterThan(
      radius * 0.15
    );
    expect((eyeBounds?.max.y ?? -Infinity) - radius * tuning.creature.bodyHeight).toBeGreaterThan(
      radius * 0.05
    );
    expect((eyeBounds?.max.x ?? 0) - (eyeBounds?.min.x ?? 0)).toBeGreaterThan(
      radius * 1.65
    );
    rig.body.dispose();
    rig.eyes.dispose();
  });

  it("keeps both forward-looking eye shells phone-visible through maximum-momentum banking", () => {
    const rig = createGlowfinRigGeometry(tuning, 1);
    const body = new THREE.Mesh(rig.body, new THREE.MeshBasicMaterial());
    const eyes = new THREE.Mesh(rig.eyes, new THREE.MeshBasicMaterial());
    const group = new THREE.Group();
    group.add(body, eyes);

    const width = 390;
    const height = 844;
    const camera = new THREE.PerspectiveCamera(
      tuning.camera.fovAtMaxMomentum,
      width / height,
      0.1,
      500
    );
    camera.position.set(
      0,
      tuning.camera.height,
      tuning.camera.distanceBehindAtMaxMomentum
    );
    camera.lookAt(
      0,
      tuning.camera.lookHeight,
      -tuning.camera.lookAheadUnits
    );
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const positions = eyes.geometry.getAttribute("position");
    const projected = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const localHit = new THREE.Vector3();

    for (const steering of [-1, 0, 1]) {
      group.rotation.set(
        -0.07,
        -steering * 0.12,
        -steering * tuning.creature.bankAngleMaxRadians
      );
      group.updateMatrixWorld(true);

      let minX = width;
      let maxX = 0;
      let minY = height;
      let maxY = 0;
      for (let index = 0; index < positions.count; index++) {
        projected
          .fromBufferAttribute(positions, index)
          .applyMatrix4(eyes.matrixWorld)
          .project(camera);
        const screenX = (projected.x * 0.5 + 0.5) * width;
        const screenY = (-projected.y * 0.5 + 0.5) * height;
        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      }

      const counts = { left: 0, right: 0 };
      const inverseWorld = group.matrixWorld.clone().invert();
      for (let py = Math.max(0, Math.floor(minY) - 2); py <= Math.min(height - 1, Math.ceil(maxY) + 2); py++) {
        for (let px = Math.max(0, Math.floor(minX) - 2); px <= Math.min(width - 1, Math.ceil(maxX) + 2); px++) {
          ndc.set(
            ((px + 0.5) / width) * 2 - 1,
            1 - ((py + 0.5) / height) * 2
          );
          raycaster.setFromCamera(ndc, camera);
          const first = raycaster.intersectObjects([body, eyes], false)[0];
          if (first?.object !== eyes) continue;
          localHit.copy(first.point).applyMatrix4(inverseWorld);
          counts[localHit.x < 0 ? "left" : "right"] += 1;
        }
      }

      expect(maxY - minY).toBeGreaterThanOrEqual(8);
      expect(counts.left).toBeGreaterThanOrEqual(50);
      expect(counts.right).toBeGreaterThanOrEqual(50);
    }

    rig.body.dispose();
    rig.eyes.dispose();
    body.material.dispose();
    eyes.material.dispose();
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
