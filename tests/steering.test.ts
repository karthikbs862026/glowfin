import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import { SteeringSource, type AbstractPointerEvent } from "../src/input/steering";

/** Part 6.4 — edge-case input suite. Synthetic events, no DOM required. */

function makeSource(): SteeringSource {
  return new SteeringSource({
    dragRangeFraction: tuning.input.dragRangeFraction,
    sensitivity: tuning.input.sensitivity,
    deadZone: tuning.input.deadZone
  });
}

const ev = (
  kind: AbstractPointerEvent["kind"],
  pointerId: number,
  normalizedX: number
): AbstractPointerEvent => ({ kind, pointerId, normalizedX });

describe("SteeringSource", () => {
  it("reports neutral before any input", () => {
    expect(makeSource().getTarget()).toBe(0);
    expect(makeSource().isEngaged()).toBe(false);
  });

  it("stays neutral on touch-down with no movement", () => {
    const s = makeSource();
    s.handle(ev("down", 1, 0.5));
    expect(s.getTarget()).toBe(0);
    expect(s.isEngaged()).toBe(true);
  });

  it("steers proportionally to drag distance from the anchor", () => {
    const s = makeSource();
    s.handle(ev("down", 1, 0.5));
    s.handle(ev("move", 1, 0.5 + tuning.input.dragRangeFraction / 2));
    const half = s.getTarget();
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });

  it("clamps to -1..1 beyond full deflection", () => {
    const s = makeSource();
    s.handle(ev("down", 1, 0.5));
    s.handle(ev("move", 1, 1.0));
    expect(s.getTarget()).toBe(1);
    s.handle(ev("move", 1, 0.0));
    expect(s.getTarget()).toBe(-1);
  });

  it("anchors wherever the finger lands, not at screen centre", () => {
    const s = makeSource();
    s.handle(ev("down", 1, 0.1));
    expect(s.getTarget()).toBe(0);
    s.handle(ev("move", 1, 0.1 + tuning.input.dragRangeFraction));
    expect(s.getTarget()).toBeCloseTo(1, 5);
  });

  it("applies a dead zone to tiny jitter", () => {
    const s = makeSource();
    s.handle(ev("down", 1, 0.5));
    const tiny = tuning.input.dragRangeFraction * tuning.input.deadZone * 0.5;
    s.handle(ev("move", 1, 0.5 + tiny));
    expect(s.getTarget()).toBe(0);
  });

  describe("multi-touch (Part 2.1)", () => {
    it("ignores a second finger entirely", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.5 + tuning.input.dragRangeFraction));
      const before = s.getTarget();

      s.handle(ev("down", 2, 0.1));
      s.handle(ev("move", 2, 0.9));
      expect(s.getTarget()).toBe(before);
    });

    it("a second finger lifting does not disturb steering", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.5 + tuning.input.dragRangeFraction));
      const before = s.getTarget();

      s.handle(ev("down", 2, 0.2));
      s.handle(ev("up", 2, 0.2));
      expect(s.getTarget()).toBe(before);
      expect(s.isEngaged()).toBe(true);
    });

    it("does not jitter when many fingers arrive at once", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.6));
      const before = s.getTarget();
      for (let id = 2; id <= 10; id++) {
        s.handle(ev("down", id, Math.random()));
        s.handle(ev("move", id, Math.random()));
      }
      expect(s.getTarget()).toBe(before);
    });
  });

  describe("gesture interruption", () => {
    it("returns to neutral when the finger lifts", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.9));
      s.handle(ev("up", 1, 0.9));
      expect(s.getTarget()).toBe(0);
      expect(s.isEngaged()).toBe(false);
    });

    it("returns to neutral on pointer cancel", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.9));
      s.handle(ev("cancel", 1, 0.9));
      expect(s.getTarget()).toBe(0);
    });

    it("accepts a fresh gesture after release, re-anchoring", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.9));
      s.handle(ev("up", 1, 0.9));

      s.handle(ev("down", 2, 0.2));
      expect(s.getTarget()).toBe(0);
      s.handle(ev("move", 2, 0.2 + tuning.input.dragRangeFraction));
      expect(s.getTarget()).toBeCloseTo(1, 5);
    });

    it("ignores move events with no finger down", () => {
      const s = makeSource();
      s.handle(ev("move", 1, 0.9));
      expect(s.getTarget()).toBe(0);
    });

    it("ignores an up event for a finger that was never down", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.8));
      const before = s.getTarget();
      s.handle(ev("up", 99, 0.1));
      expect(s.getTarget()).toBe(before);
      expect(s.isEngaged()).toBe(true);
    });
  });

  describe("backgrounding (Part 2.1)", () => {
    it("reset clears steering and the stale anchor", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.handle(ev("move", 1, 0.9));
      s.reset();
      expect(s.getTarget()).toBe(0);
      expect(s.isEngaged()).toBe(false);
    });

    it("after reset, a stale move event cannot steer", () => {
      const s = makeSource();
      s.handle(ev("down", 1, 0.5));
      s.reset();
      s.handle(ev("move", 1, 0.95));
      expect(s.getTarget()).toBe(0);
    });
  });

  it("never emits a value outside -1..1 under fuzzed input", () => {
    const s = makeSource();
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const kinds: AbstractPointerEvent["kind"][] = ["down", "move", "up", "cancel"];
    for (let i = 0; i < 20000; i++) {
      const kind = kinds[Math.floor(rand() * kinds.length)] ?? "move";
      s.handle(ev(kind, Math.floor(rand() * 4), rand() * 3 - 1));
      const t = s.getTarget();
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(-1);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});
