import { describe, it, expect } from "vitest";
import { SeededRandom, generateSeed } from "../src/core/rng";

describe("SeededRandom", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const rng = new SeededRandom(999);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range() stays within bounds", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it("int() is inclusive of both bounds and never exceeds them", () => {
    const rng = new SeededRandom(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(0, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  it("pick() throws on an empty array rather than returning undefined", () => {
    const rng = new SeededRandom(1);
    expect(() => rng.pick([])).toThrow(/empty array/);
  });

  it("state can be snapshotted and restored, reproducing the same continuation", () => {
    const rng = new SeededRandom(2024);
    for (let i = 0; i < 10; i++) rng.next();

    const snapshot = rng.getState();
    const after = Array.from({ length: 20 }, () => rng.next());

    rng.setState(snapshot);
    const replayed = Array.from({ length: 20 }, () => rng.next());

    expect(replayed).toEqual(after);
  });

  it("rejects a non-finite seed", () => {
    expect(() => new SeededRandom(NaN)).toThrow(/finite number/);
    expect(() => new SeededRandom(Infinity)).toThrow(/finite number/);
  });

  it("generateSeed produces a valid uint32 usable as a seed", () => {
    for (let i = 0; i < 100; i++) {
      const seed = generateSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      expect(() => new SeededRandom(seed)).not.toThrow();
    }
  });
});
