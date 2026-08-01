import { describe, expect, it } from "vitest";
import {
  MERFOLK_CHOREOGRAPHY_CONTRACT,
  merfolkLaneClearance,
  sampleMerfolkChoreography
} from "../src/art/merfolkChoreography";

const base = {
  laneHalfWidth: 6,
  anchor: 38,
  heroSide: 1 as const,
  momentumFraction: 0.5,
  density: 1
};

function distance(
  left: { position: { x: number; y: number; z: number } },
  right: { position: { x: number; y: number; z: number } }
): number {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
    left.position.z - right.position.z
  );
}

describe("Moon-Garden merfolk choreography", () => {
  it("is deterministic while giving each swimmer a distinct lane and tempo", () => {
    const poses = sampleMerfolkChoreography({ ...base, timeSec: 7.25 });
    expect(sampleMerfolkChoreography({ ...base, timeSec: 7.25 })).toEqual(poses);
    const swimmers = poses.filter((pose) => pose.role === "current-swimmer");
    expect(swimmers).toHaveLength(MERFOLK_CHOREOGRAPHY_CONTRACT.movingSwimmers);
    expect(new Set(swimmers.map((pose) => pose.motionSeed)).size).toBe(2);
    expect(Math.abs(swimmers[0]!.speed - swimmers[1]!.speed)).toBeGreaterThanOrEqual(
      MERFOLK_CHOREOGRAPHY_CONTRACT.minimumSpeedDifference
    );
    expect(Math.sign(swimmers[0]!.position.x)).not.toBe(
      Math.sign(swimmers[1]!.position.x)
    );
    expect(distance(swimmers[0]!, swimmers[1]!)).toBeGreaterThanOrEqual(
      MERFOLK_CHOREOGRAPHY_CONTRACT.minimumSwimmerWorldSeparationUnits
    );
  });

  it("keeps residents upright and swimmers visibly moving rather than stacked", () => {
    const start = sampleMerfolkChoreography({ ...base, timeSec: 1.2 });
    const end = sampleMerfolkChoreography({ ...base, timeSec: 4.7 });
    const upright = start.filter((pose) =>
      pose.movementMode !== "lane-safe-swim-loop"
    );
    expect(upright.length).toBeGreaterThanOrEqual(
      MERFOLK_CHOREOGRAPHY_CONTRACT.minimumUprightResidents
    );
    for (const pose of upright) {
      expect(Math.abs(pose.rotation.z)).toBeLessThan(0.08);
      expect(pose.scale.y).toBeGreaterThan(0);
    }

    for (let index = 0; index < 2; index++) {
      const swimmerStart = start.find((pose) =>
        pose.id === `current-swimmer-${index}`
      );
      const swimmerEnd = end.find((pose) =>
        pose.id === `current-swimmer-${index}`
      );
      expect(swimmerStart).toBeDefined();
      expect(swimmerEnd).toBeDefined();
      expect(distance(swimmerStart!, swimmerEnd!)).toBeGreaterThanOrEqual(
        MERFOLK_CHOREOGRAPHY_CONTRACT.minimumSwimmerTravelUnits
      );
    }
  });

  it("keeps both swim loops moving at visibly different distances", () => {
    for (const anchor of [24, 38, 62]) {
      for (const heroSide of [-1, 1] as const) {
        for (const momentumFraction of [0, 0.5, 1]) {
          for (let sample = 0; sample <= 24; sample++) {
            const timeSec = sample * 0.5;
            const start = sampleMerfolkChoreography({
              ...base,
              anchor,
              heroSide,
              momentumFraction,
              timeSec
            });
            const end = sampleMerfolkChoreography({
              ...base,
              anchor,
              heroSide,
              momentumFraction,
              timeSec: timeSec + 3.25
            });
            const travel = [0, 1].map((index) => {
              const first = start.find((pose) =>
                pose.id === `current-swimmer-${index}`
              );
              const later = end.find((pose) =>
                pose.id === `current-swimmer-${index}`
              );
              expect(first).toBeDefined();
              expect(later).toBeDefined();
              return distance(first!, later!);
            });
            expect(Math.min(...travel)).toBeGreaterThanOrEqual(
              MERFOLK_CHOREOGRAPHY_CONTRACT.minimumSwimmerTravelUnits
            );
            expect(
              Math.abs((travel[0] ?? 0) - (travel[1] ?? 0))
            ).toBeGreaterThanOrEqual(
              MERFOLK_CHOREOGRAPHY_CONTRACT.minimumSwimmerTravelDifferenceUnits
            );
          }
        }
      }
    }
  });

  it("keeps every randomized pose outside the gameplay route", () => {
    for (const heroSide of [-1, 1] as const) {
      for (let frame = 0; frame <= 80; frame++) {
        const poses = sampleMerfolkChoreography({
          ...base,
          anchor: 38 + frame * 0.37,
          heroSide,
          timeSec: frame * 0.19
        });
        for (const pose of poses) {
          expect(merfolkLaneClearance(pose, base.laneHalfWidth)).toBeGreaterThanOrEqual(
            MERFOLK_CHOREOGRAPHY_CONTRACT.minimumLaneClearanceUnits
          );
        }
      }
    }
  });

  it("limits anchored drift while retaining independent idle life", () => {
    const start = sampleMerfolkChoreography({ ...base, timeSec: 0 });
    const end = sampleMerfolkChoreography({ ...base, timeSec: 5.2 });
    const anchored = start.filter((pose) =>
      pose.movementMode !== "lane-safe-swim-loop"
    );
    for (const pose of anchored) {
      const later = end.find((candidate) => candidate.id === pose.id);
      expect(later).toBeDefined();
      expect(distance(pose, later!)).toBeLessThanOrEqual(
        MERFOLK_CHOREOGRAPHY_CONTRACT.maximumAnchoredDriftUnits
      );
    }
  });
});
