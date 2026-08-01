import { describe, it, expect } from "vitest";
import { tuning } from "../src/core/config";
import {
  CourseGenerator,
  MomentumProfile,
  tierAtDistance,
  requiredTravel,
  type Gate
} from "../src/sim/course";
import { checkSolvability, formatReport } from "../src/sim/solvability";

/**
 * Part 6.6 — headless solvability. Part 2.5 calls an unsolvable segment "the
 * single most direct violation of the Core Design Principle possible", so this
 * suite is build-blocking by design.
 *
 * Sweep width is controlled by GLOWFIN_SWEEP_SEEDS so the same code path serves
 * both tiers of Part 6.2: a modest sweep on every PR, and a wide one nightly
 * via `npm run sweep`. Deliberately the same test rather than a parallel
 * script, which would drift from the real generator over time.
 */

/**
 * Read a numeric env var without depending on @types/node.
 *
 * Deliberately not installing @types/node: it would make Node globals appear
 * valid inside src/ too, where they would typecheck cleanly and then fail in
 * the browser. Reading through globalThis keeps that surface out of game code,
 * and validates the parse rather than trusting Number() on arbitrary input.
 */
function envNumber(key: string, fallback: number): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const raw = env?.[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const COURSE_DISTANCE = envNumber("GLOWFIN_SWEEP_DISTANCE", 4000);
const SWEEP_SEEDS = envNumber("GLOWFIN_SWEEP_SEEDS", 150);

function generate(seed: number): { gates: readonly Gate[]; profile: MomentumProfile } {
  const generator = new CourseGenerator(seed, tuning, { profileDistance: COURSE_DISTANCE + 2000 });
  generator.ensureGeneratedTo(COURSE_DISTANCE);
  return {
    gates: generator.gates,
    profile: new MomentumProfile(tuning, COURSE_DISTANCE + 2000)
  };
}

describe("course generation", () => {
  it("is reproducible from a seed", () => {
    const a = generate(4242).gates;
    const b = generate(4242).gates;
    expect(b).toEqual(a);
  });

  it("different seeds produce different courses", () => {
    expect(generate(1).gates).not.toEqual(generate(2).gates);
  });

  it("produces gates in ascending distance order", () => {
    const { gates } = generate(99);
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]?.distance ?? 0).toBeGreaterThan(gates[i - 1]?.distance ?? 0);
    }
  });

  it("cycles obstacle art without adjacent repeats", () => {
    const { gates } = generate(99);
    for (let index = 1; index < gates.length; index++) {
      expect(gates[index]?.artVariant).not.toBe(gates[index - 1]?.artVariant);
    }
    expect(new Set(gates.slice(0, 12).map((gate) => gate.artVariant))).toEqual(
      new Set([0, 1, 2, 3, 4])
    );
  });

  it("leaves a clear runway before the first gate", () => {
    const { gates } = generate(7);
    expect(gates[0]?.distance ?? 0).toBeGreaterThanOrEqual(
      tuning.readability.visibleAheadUnits
    );
  });

  it("difficulty tier rises with distance and then plateaus", () => {
    expect(tierAtDistance(0)).toBe(0);
    expect(tierAtDistance(1200)).toBeGreaterThan(tierAtDistance(200));
    expect(tierAtDistance(1_000_000)).toBe(tierAtDistance(500_000));
  });

  it("gaps narrow at higher tiers but never below the physical minimum", () => {
    const { gates } = generate(31);
    const widthOf = (g: Gate) => g.gapRight - g.gapLeft;
    for (const g of gates) {
      expect(widthOf(g)).toBeGreaterThan(tuning.lane.creatureRadius * 2);
    }
    const early = gates.filter((g) => g.tier === 0).map(widthOf);
    const late = gates.filter((g) => g.tier >= 4).map(widthOf);
    if (early.length > 0 && late.length > 0) {
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(mean(late)).toBeLessThan(mean(early));
    }
  });
});

describe("solvability (Part 2.5 / 6.6)", () => {
  it("every gate of a generated course is provably passable", () => {
    const { gates, profile } = generate(1234);
    const report = checkSolvability(gates, tuning, profile);
    expect(report.solvable, formatReport(1234, report)).toBe(true);
  });

  it(`holds across a sweep of ${SWEEP_SEEDS} seeds`, () => {
    const failures: string[] = [];
    let gatesChecked = 0;
    let worstHeadroom = 1;

    for (let seed = 1; seed <= SWEEP_SEEDS; seed++) {
      const { gates, profile } = generate(seed);
      const report = checkSolvability(gates, tuning, profile);
      gatesChecked += report.gatesChecked;
      worstHeadroom = Math.min(worstHeadroom, report.worstRawMarginFraction);
      if (!report.solvable) failures.push(formatReport(seed, report));
    }

    expect(gatesChecked).toBeGreaterThan(SWEEP_SEEDS * 30);
    expect(failures, failures.join("\n")).toHaveLength(0);
    // Every transition must leave real physical headroom, not just scrape by.
    expect(worstHeadroom).toBeGreaterThan(0.2);
  });

  it("gates always sit inside the lane", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const g of generate(seed).gates) {
        expect(g.gapLeft).toBeGreaterThanOrEqual(-tuning.lane.halfWidth - 1e-9);
        expect(g.gapRight).toBeLessThanOrEqual(tuning.lane.halfWidth + 1e-9);
      }
    }
  });

  it("no transition demands more than the configured lane-traversal cap", () => {
    const cap = tuning.lane.halfWidth * 2 * tuning.readability.maxLaneTraversalFraction;
    for (let seed = 1; seed <= 40; seed++) {
      const { gates } = generate(seed);
      for (let i = 1; i < gates.length; i++) {
        const from = gates[i - 1];
        const to = gates[i];
        if (!from || !to) continue;
        expect(requiredTravel(from, to, tuning)).toBeLessThanOrEqual(cap + 1e-9);
      }
    }
  });
});

describe("the checker actually catches violations", () => {
  // A checker that never fails proves nothing. These assert it detects each
  // violation class on deliberately broken input.
  const profile = new MomentumProfile(tuning, 3000);
  const g = (distance: number, gapLeft: number, gapRight: number): Gate => ({
    distance,
    gapLeft,
    gapRight,
    templateId: "broken",
    tier: 0
  });

  it("catches a gap too narrow for the creature", () => {
    const report = checkSolvability([g(200, -0.1, 0.1)], tuning, profile);
    expect(report.solvable).toBe(false);
    expect(report.violations[0]?.kind).toBe("gap-too-narrow");
  });

  it("catches a gap outside the lane", () => {
    const hw = tuning.lane.halfWidth;
    const report = checkSolvability([g(200, hw + 1, hw + 5)], tuning, profile);
    expect(report.solvable).toBe(false);
    expect(report.violations.some((v) => v.kind === "outside-lane")).toBe(true);
  });

  it("catches an unreachable transition", () => {
    const hw = tuning.lane.halfWidth;
    // Two gates on opposite edges, one metre apart. Physically impossible.
    const report = checkSolvability(
      [g(200, -hw, -hw + 2), g(201, hw - 2, hw)],
      tuning,
      profile
    );
    expect(report.solvable).toBe(false);
    expect(report.violations.some((v) => v.kind === "unreachable")).toBe(true);
  });

  it("reports the numbers behind an unreachable transition", () => {
    const hw = tuning.lane.halfWidth;
    const report = checkSolvability(
      [g(200, -hw, -hw + 2), g(201, hw - 2, hw)],
      tuning,
      profile
    );
    const violation = report.violations.find((v) => v.kind === "unreachable");
    expect(violation?.required).toBeGreaterThan(violation?.available ?? Infinity);
  });

  it("formats a readable failure message", () => {
    const report = checkSolvability([g(200, -0.1, 0.1)], tuning, profile);
    expect(formatReport(7, report)).toMatch(/UNSOLVABLE/);
  });
});
