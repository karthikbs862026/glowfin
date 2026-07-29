import { describe, it, expect } from "vitest";
import { QualityController, tierSettings, type QualityTier } from "../src/perf/quality";
import { checkBudgets, type PerfSample } from "../src/perf/metrics";
import budgets from "../config/budgets.json";

const WINDOW = budgets.quality.sampleWindowFrames;
const BUDGET_MS = budgets.frameRate.frameBudgetMsMidRange;

/** Feed n windows of frames at a given frame time; collect any tier changes. */
function feed(controller: QualityController, frameTimeMs: number, windows: number) {
  const changes = [];
  for (let w = 0; w < windows; w++) {
    for (let f = 0; f < WINDOW; f++) {
      const change = controller.recordFrame(frameTimeMs);
      if (change) changes.push(change);
    }
  }
  return changes;
}

describe("quality tiers", () => {
  it("every tier defines the settings the renderer consumes", () => {
    for (const tier of ["high", "medium", "low"] as QualityTier[]) {
      const settings = tierSettings(tier);
      expect(settings.pixelRatioCap).toBeGreaterThan(0);
      expect(settings.causticOctaves).toBeGreaterThanOrEqual(1);
      expect(typeof settings.causticsEnabled).toBe("boolean");
    }
  });

  it("lower tiers are strictly cheaper", () => {
    const high = tierSettings("high");
    const medium = tierSettings("medium");
    const low = tierSettings("low");
    expect(medium.pixelRatioCap).toBeLessThan(high.pixelRatioCap);
    expect(low.pixelRatioCap).toBeLessThan(medium.pixelRatioCap);
    expect(medium.causticOctaves).toBeLessThanOrEqual(high.causticOctaves);
    expect(low.causticOctaves).toBeLessThanOrEqual(medium.causticOctaves);
  });
});

describe("dynamic quality scaling (Part 4.6)", () => {
  it("holds tier while frames are within budget", () => {
    const controller = new QualityController("high", BUDGET_MS);
    expect(feed(controller, BUDGET_MS * 0.5, 20)).toHaveLength(0);
    expect(controller.current).toBe("high");
  });

  it("steps down on sustained overrun", () => {
    const controller = new QualityController("high", BUDGET_MS);
    const changes = feed(controller, BUDGET_MS * 2, budgets.quality.downgradeAfterBadWindows);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.from).toBe("high");
    expect(changes[0]?.to).toBe("medium");
    expect(changes[0]?.reason).toBe("overrun");
  });

  it("does not step down on a single bad window", () => {
    const controller = new QualityController("high", BUDGET_MS);
    expect(feed(controller, BUDGET_MS * 2, 1)).toHaveLength(0);
    expect(controller.current).toBe("high");
  });

  it("never falls below the lowest tier", () => {
    const controller = new QualityController("low", BUDGET_MS);
    feed(controller, BUDGET_MS * 5, 40);
    expect(controller.current).toBe("low");
  });

  it("never rises above the highest tier", () => {
    const controller = new QualityController("high", BUDGET_MS);
    feed(controller, 1, 60);
    expect(controller.current).toBe("high");
  });

  it("recovers upward after a sustained good streak", () => {
    const controller = new QualityController("low", BUDGET_MS);
    feed(controller, BUDGET_MS * 0.3, budgets.quality.upgradeAfterGoodWindows + 30);
    expect(controller.current).not.toBe("low");
  });

  it("requires a longer streak to upgrade than to downgrade", () => {
    // Recovering as eagerly as it degrades just walks back into the overrun.
    expect(budgets.quality.upgradeAfterGoodWindows).toBeGreaterThan(
      budgets.quality.downgradeAfterBadWindows
    );
  });

  it("does not oscillate when frame time hovers at the budget edge", () => {
    // The nastiest real case: a device sitting right on the threshold. Visible
    // tier flapping mid-run is worse than simply running at the lower tier.
    const controller = new QualityController("high", BUDGET_MS);
    let changes = 0;
    for (let i = 0; i < WINDOW * 60; i++) {
      const jitter = Math.sin(i * 0.37) * 0.12;
      if (controller.recordFrame(BUDGET_MS * (1 + jitter))) changes++;
    }
    expect(changes).toBeLessThanOrEqual(2);
  });

  it("ignores nonsense frame times instead of reacting to them", () => {
    const controller = new QualityController("high", BUDGET_MS);
    for (let i = 0; i < WINDOW * 5; i++) {
      expect(controller.recordFrame(Number.NaN)).toBeNull();
      expect(controller.recordFrame(-5)).toBeNull();
    }
    expect(controller.current).toBe("high");
  });

  it("a single frame spike does not drag the tier down", () => {
    // Median, not mean: one GC pause should not cost the player their visuals.
    const controller = new QualityController("high", BUDGET_MS);
    for (let w = 0; w < 10; w++) {
      for (let f = 0; f < WINDOW; f++) {
        controller.recordFrame(f === 0 ? 400 : BUDGET_MS * 0.4);
      }
    }
    expect(controller.current).toBe("high");
  });

  it("forceTier overrides and holds through the cooldown", () => {
    const controller = new QualityController("high", BUDGET_MS);
    controller.forceTier("low");
    expect(controller.current).toBe("low");
    feed(controller, BUDGET_MS * 0.2, 1);
    expect(controller.current).toBe("low");
  });
});

describe("budget checking (Part 6.8)", () => {
  const clean: PerfSample = {
    fps: 60,
    frameTimeMsMedian: 16,
    frameTimeMsWorst: 22,
    drawCalls: 20,
    triangles: 40000,
    heapMb: 90,
    gpu: "test"
  };

  it("passes a sample inside every budget", () => {
    expect(checkBudgets(clean)).toHaveLength(0);
  });

  it("flags frame time overrun", () => {
    const violations = checkBudgets({ ...clean, frameTimeMsMedian: BUDGET_MS + 10 });
    expect(violations.some((v) => v.metric === "frameTimeMs")).toBe(true);
  });

  it("flags draw call overrun", () => {
    const violations = checkBudgets({ ...clean, drawCalls: budgets.scene.maxDrawCalls + 1 });
    expect(violations.some((v) => v.metric === "drawCalls")).toBe(true);
  });

  it("flags triangle overrun", () => {
    const violations = checkBudgets({ ...clean, triangles: budgets.scene.maxTriangles + 1 });
    expect(violations.some((v) => v.metric === "triangles")).toBe(true);
  });

  it("flags heap overrun", () => {
    const violations = checkBudgets({ ...clean, heapMb: budgets.memory.steadyStateHeapMb + 1 });
    expect(violations.some((v) => v.metric === "heapMb")).toBe(true);
  });

  it("does not invent a heap violation where the browser hides the heap", () => {
    // Safari does not expose performance.memory. Absent must not read as zero,
    // and must not read as a violation either.
    expect(checkBudgets({ ...clean, heapMb: null }).some((v) => v.metric === "heapMb")).toBe(false);
  });

  it("reports every violation at once, not just the first", () => {
    const violations = checkBudgets({
      ...clean,
      frameTimeMsMedian: 99,
      drawCalls: 9999,
      triangles: 9_000_000
    });
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe("pool caps match the budget (Part 4.6)", () => {
  it("declares caps for every pooled resource", () => {
    expect(budgets.pools.maxGates).toBeGreaterThan(0);
    expect(budgets.pools.maxStripes).toBeGreaterThan(0);
    expect(budgets.pools.maxTrailSegments).toBeGreaterThan(0);
    expect(budgets.pools.maxParticles).toBeGreaterThan(0);
  });
});
