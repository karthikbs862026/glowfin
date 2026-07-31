import { describe, expect, it } from "vitest";
import { fullEffectStates } from "../src/render/artGateCapture";

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
});
