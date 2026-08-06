import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  VERSION41_BREAK_LANES,
  VERSION41_CHAPTERS,
  VERSION41_CHASE_PATTERNS,
  VERSION41_EXPERIENCE_REVISION,
  VERSION41_FIXED_SEED,
  VERSION41_PERFORMANCE_BUDGETS,
  VERSION41_RESCUE_LANES,
  VERSION41_SEGMENT_ORDER,
  auditVersion41ExperiencePlan,
  completionMarks,
  shouldAdvanceChapter
} from "../src/engagement/version41Plan";

describe("Version 41.2 enhancement-plan compliance", () => {
  it("encodes the complete three-minute encounter arc", () => {
    expect(VERSION41_EXPERIENCE_REVISION).toBe("v41.2-plan-compliance-rebuild");
    expect(VERSION41_FIXED_SEED).toBe(1196577101);
    expect(VERSION41_SEGMENT_ORDER).toEqual([
      "follow-light",
      "relic-fork",
      "rescue-miri",
      "race-neri",
      "duskmaw-chase",
      "return-moonwell"
    ]);
    expect(VERSION41_CHAPTERS.reduce((sum, chapter) => sum + chapter.targetSeconds, 0)).toBe(180);
    expect(VERSION41_RESCUE_LANES).toEqual([-3.15, 3.15, 0]);
    expect(VERSION41_BREAK_LANES).toEqual([-3.05, 3.05, 3.35]);
    expect(VERSION41_CHASE_PATTERNS).toEqual(["Shadow Sweep", "Vacuum Wake", "Ruins Collapse"]);
    expect(auditVersion41ExperiencePlan()).toEqual([]);
  });

  it("never advances because elapsed time alone passed", () => {
    for (const kind of VERSION41_SEGMENT_ORDER) {
      expect(shouldAdvanceChapter(kind, { stageSeconds: 999 })).toBe(false);
    }
    expect(shouldAdvanceChapter("follow-light", { stageSeconds: 20, bestChain: 6 })).toBe(true);
    expect(shouldAdvanceChapter("relic-fork", { stageSeconds: 22, relicResolved: true })).toBe(true);
    expect(shouldAdvanceChapter("rescue-miri", { stageSeconds: 25, rescueLights: 3 })).toBe(true);
    expect(shouldAdvanceChapter("race-neri", { stageSeconds: 28, raceGates: 3, raceGap: 0 })).toBe(true);
    expect(shouldAdvanceChapter("duskmaw-chase", { stageSeconds: 22, currentBreaks: 3 })).toBe(true);
    expect(shouldAdvanceChapter("return-moonwell", { stageSeconds: 20, portalReached: true })).toBe(true);
    expect(shouldAdvanceChapter("race-neri", { stageSeconds: 60, raceGates: 3, raceGap: -0.1 })).toBe(false);
  });

  it("awards primary, hidden-relic and clean-current marks from real outcomes", () => {
    const marks = completionMarks({
      portalReached: true,
      rescueLights: 3,
      raceGates: 3,
      raceGap: 2,
      currentBreaks: 3,
      relicFound: true,
      bestChain: 12,
      recoveries: 0,
      assists: 0
    });
    expect(marks.map((mark) => mark.id)).toEqual(["mission-complete", "hidden-relic", "clean-current"]);
    expect(marks.every((mark) => mark.earned)).toBe(true);
  });

  it("locks the mobile render, reaction and frame-rate budgets", () => {
    expect(VERSION41_PERFORMANCE_BUDGETS).toEqual({
      totalDrawCalls: 90,
      totalTriangles: 150000,
      textureMemoryMB: 48,
      totalMaterials: 12,
      reactionLatencyMs: 700,
      frameRateFloor: 30
    });
  });

  it("keeps timer shortcuts out of the implementation", async () => {
    const runtime = await readFile(new URL("../src/engagement/version41Micro.ts", import.meta.url), "utf8");
    const finishBody = runtime.split("private updateFinish")[1]?.split("dispose(): void")[0] ?? "";
    expect(runtime).toContain("data-encounter-director=\"objective-gated-v2\"");
    expect(runtime).toContain("Moon Shield caught the shadow");
    expect(runtime).toContain("sim.forwardDistance + 16");
    expect(finishBody).not.toContain("elapsed >= C.durationSec");
    expect(finishBody).not.toContain("finishFallbackSec");
  });
});
