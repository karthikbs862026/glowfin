import { describe, expect, it } from "vitest";
import {
  gateClearance,
  gateWallGeometry,
  PROCEDURAL_GATE_VISUAL
} from "../src/sim/gateGeometry";
import { gateFacadeVariant } from "../src/render/gateArt";

const gate = { distance: 100, gapLeft: -2.25, gapRight: 2.75 };

describe("authoritative gate geometry", () => {
  it("derives renderer wall edges from the collision opening", () => {
    const [left, right] = gateWallGeometry(gate, 6);

    expect(left.colliderPlane).toBe(gate.gapLeft);
    expect(left.gapDirection).toBe(1);
    expect(left.centreX + left.width / 2).toBe(gate.gapLeft);

    expect(right.colliderPlane).toBe(gate.gapRight);
    expect(right.gapDirection).toBe(-1);
    expect(right.centreX - right.width / 2).toBe(gate.gapRight);
  });

  it("uses stable runtime obstacle identifiers for art-gate evidence", () => {
    const [left, right] = gateWallGeometry(gate, 6);
    expect(left.runtimeObstacleId).toBe("procedural-gate-left");
    expect(right.runtimeObstacleId).toBe("procedural-gate-right");
  });

  it("computes the same sharp clearance boundary as collision", () => {
    const radius = 0.5;
    expect(gateClearance(gate.gapRight - radius, radius, gate).clearance).toBe(0);
    expect(
      gateClearance(gate.gapRight - radius + 0.000001, radius, gate).clearance
    ).toBeLessThan(0);
  });

  it("keeps renderer dimensions explicit for manifest generation", () => {
    expect(PROCEDURAL_GATE_VISUAL.wallHeight).toBeGreaterThan(0);
    expect(PROCEDURAL_GATE_VISUAL.wallDepth).toBeGreaterThan(0);
  });

  it("selects a stable facade without changing collision geometry", () => {
    for (const artVariant of [0, 1, 2, 3, 4] as const) {
      const variantGate = {
        ...gate,
        templateId: "visual-test",
        tier: 0,
        artVariant
      };
      expect(gateFacadeVariant(variantGate)).toBe(artVariant);
      expect(gateWallGeometry(variantGate, 6)).toEqual(gateWallGeometry(gate, 6));
    }
  });
});
