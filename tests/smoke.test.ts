import { describe, it, expect } from "vitest";

// Part 6.3 — minimum smoke test set. This is a placeholder proving the test
// runner and CI wiring work; real smoke tests (WebGL context init, core loop
// runs N frames without exception, synthetic input moves the creature) land
// in Phase 1 once there's an actual game loop to assert against, per the
// isolated input module described in Part 2.1 / 6.4.

describe("Phase 0 smoke", () => {
  it("test runner executes", () => {
    expect(1 + 1).toBe(2);
  });

  it("steering value stays within the normalized -1..1 contract", () => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    expect(clamp(5)).toBe(1);
    expect(clamp(-5)).toBe(-1);
    expect(clamp(0.3)).toBe(0.3);
  });
});
