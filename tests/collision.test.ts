import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import { evaluateGate, evaluateStep, isNearMiss, type SweptSegment } from "../src/sim/collision";
import type { Gate } from "../src/sim/course";

const gate = (distance: number, gapLeft: number, gapRight: number): Gate => ({
  distance,
  gapLeft,
  gapRight,
  templateId: "test",
  tier: 0
});

const seg = (
  fromDistance: number,
  toDistance: number,
  fromLateral: number,
  toLateral = fromLateral
): SweptSegment => ({ fromDistance, toDistance, fromLateral, toLateral });

const r = tuning.lane.creatureRadius;

describe("swept gate collision", () => {
  it("passing centred through a wide gap does not collide", () => {
    const result = evaluateGate(seg(90, 110, 0), gate(100, -3, 3), tuning);
    expect(result?.collided).toBe(false);
  });

  it("striking the left wall collides", () => {
    const result = evaluateGate(seg(90, 110, -3.4), gate(100, -3, 3), tuning);
    expect(result?.collided).toBe(true);
  });

  it("striking the right wall collides", () => {
    const result = evaluateGate(seg(90, 110, 3.4), gate(100, -3, 3), tuning);
    expect(result?.collided).toBe(true);
  });

  it("returns null when the step does not reach the gate", () => {
    expect(evaluateGate(seg(0, 50, 0), gate(100, -3, 3), tuning)).toBeNull();
  });

  it("returns null when the gate is already behind", () => {
    expect(evaluateGate(seg(200, 250, 0), gate(100, -3, 3), tuning)).toBeNull();
  });

  it("uses the interpolated position at the gate, not the step endpoints", () => {
    // Starts far left (would hit), ends far right (would hit), but is centred
    // exactly when it crosses the gate — so it must pass cleanly.
    const result = evaluateGate(seg(90, 110, -5, 5), gate(100, -1.5, 1.5), tuning);
    expect(result?.collided).toBe(false);
  });

  it("cannot tunnel through a gate even at implausible step length", () => {
    // A single step spanning 500 units still detects the gate it crossed.
    const result = evaluateGate(seg(0, 500, -6, -6), gate(100, -1, 1), tuning);
    expect(result).not.toBeNull();
    expect(result?.collided).toBe(true);
  });

  it("detects every gate crossed within one step, in order", () => {
    const gates = [gate(10, -3, 3), gate(20, -3, 3), gate(30, -3, 3)];
    const results = evaluateStep(seg(5, 35, 0), gates, tuning);
    expect(results.map((x) => x.gate.distance)).toEqual([10, 20, 30]);
  });

  it("ignores gates outside the step span", () => {
    const gates = [gate(1, -3, 3), gate(15, -3, 3), gate(90, -3, 3)];
    const results = evaluateStep(seg(10, 20, 0), gates, tuning);
    expect(results).toHaveLength(1);
    expect(results[0]?.gate.distance).toBe(15);
  });
});

describe("collision fairness harness (Part 6.4)", () => {
  // The requirement is a *sharp* boundary: inputs that should clear do clear,
  // inputs that should not, do not, with no ambiguous middle band where the
  // outcome depends on luck.
  it("the collision boundary is exact, with no ambiguous band", () => {
    const g = gate(100, -3, 3);
    const boundary = g.gapRight - r; // rightmost lateral position that clears

    const clearlyInside = evaluateGate(seg(90, 110, boundary - 1e-6), g, tuning);
    const clearlyOutside = evaluateGate(seg(90, 110, boundary + 1e-6), g, tuning);

    expect(clearlyInside?.collided).toBe(false);
    expect(clearlyOutside?.collided).toBe(true);
  });

  it("outcome is monotonic across a lateral sweep — one transition, not many", () => {
    const g = gate(100, -3, 3);
    let transitions = 0;
    let previous: boolean | null = null;

    for (let x = -6; x <= 6; x += 0.001) {
      const collided = evaluateGate(seg(90, 110, x), g, tuning)?.collided ?? false;
      if (previous !== null && collided !== previous) transitions++;
      previous = collided;
    }
    // collide -> clear -> collide is exactly two transitions.
    expect(transitions).toBe(2);
  });

  it("identical input produces an identical result every time", () => {
    const g = gate(100, -3, 3);
    const first = evaluateGate(seg(90, 110, 2.4, 2.6), g, tuning);
    for (let i = 0; i < 500; i++) {
      expect(evaluateGate(seg(90, 110, 2.4, 2.6), g, tuning)).toEqual(first);
    }
  });
});

describe("near-miss detection (Part 2.3)", () => {
  it("a tight clean pass counts as a near-miss", () => {
    const g = gate(100, -3, 3);
    const justInside = g.gapRight - r - tuning.scoring.nearMissClearanceUnits * 0.5;
    const result = evaluateGate(seg(90, 110, justInside), g, tuning);
    expect(result?.collided).toBe(false);
    expect(result && isNearMiss(result, tuning)).toBe(true);
  });

  it("a comfortable centred pass does not", () => {
    const result = evaluateGate(seg(90, 110, 0), gate(100, -6, 6), tuning);
    expect(result && isNearMiss(result, tuning)).toBe(false);
  });

  it("a collision is never also a near-miss", () => {
    const result = evaluateGate(seg(90, 110, 3.5), gate(100, -3, 3), tuning);
    expect(result?.collided).toBe(true);
    expect(result && isNearMiss(result, tuning)).toBe(false);
  });

  it("clearance is measured to the nearer edge", () => {
    const g = gate(100, -5, 5);
    const result = evaluateGate(seg(90, 110, 3), g, tuning);
    // Right edge: 5 - (3 + r). Left edge is much further away.
    expect(result?.clearance).toBeCloseTo(5 - (3 + r), 9);
  });
});
