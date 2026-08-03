import { describe, expect, it } from "vitest";
import {
  fullEffectStates,
  mergeNearbyMaskComponents
} from "../src/render/artGateCapture";

describe("full browser art matrix", () => {
  it("contains every low/mid/max × bloom × caustics × quality state once", () => {
    const states = fullEffectStates();
    const keys = states.map((state) => JSON.stringify(state));

    expect(states).toHaveLength(36);
    expect(new Set(keys).size).toBe(36);
    expect(new Set(states.map((state) => state.momentum))).toEqual(
      new Set(["low", "mid", "max"])
    );
    expect(new Set(states.map((state) => state.quality))).toEqual(
      new Set(["high", "medium", "low"])
    );
    expect(new Set(states.map((state) => state.bloom))).toEqual(
      new Set([true, false])
    );
    expect(new Set(states.map((state) => state.caustics))).toEqual(
      new Set([true, false])
    );
  });

  it("groups nearby authored body parts without merging separate figures", () => {
    const components = mergeNearbyMaskComponents([
      {
        width: 10,
        height: 8,
        pixels: 54,
        edgeClearance: 20,
        centreX: 20,
        centreY: 30
      },
      {
        width: 8,
        height: 6,
        pixels: 29,
        edgeClearance: 16,
        centreX: 31,
        centreY: 31
      },
      {
        width: 12,
        height: 7,
        pixels: 61,
        edgeClearance: 18,
        centreX: 160,
        centreY: 28
      }
    ]);

    expect(components).toHaveLength(2);
    expect(components[0]?.pixels).toBe(83);
    expect(components[0]?.width).toBe(20);
    expect(components[1]?.centreX).toBe(160);
  });
});
