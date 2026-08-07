import { describe, expect, it } from "vitest";

import {
  CHAPTER_ONE_FIXED_SEED,
  CHAPTER_ONE_MISSION,
  reduceExpeditionUiState,
} from "../src/expedition/chapterOne";
import { tuning } from "../src/core/config";
import { Run } from "../src/sim/run";

describe("Version 41-R1 Chapter 1 contract", () => {
  it("uses one stable unsigned fixed seed", () => {
    expect(CHAPTER_ONE_FIXED_SEED).toBe(0x4d4f4f4e);
    expect(CHAPTER_ONE_MISSION.seed).toBe(CHAPTER_ONE_FIXED_SEED);
    expect(CHAPTER_ONE_FIXED_SEED).toBeGreaterThanOrEqual(0);
    expect(CHAPTER_ONE_FIXED_SEED).toBeLessThanOrEqual(0xffffffff);
  });

  it("requires mission card then briefing before the run can start", () => {
    expect(reduceExpeditionUiState("mission-card", "start")).toBe("mission-card");
    const briefing = reduceExpeditionUiState("mission-card", "open-briefing");
    expect(briefing).toBe("briefing");
    expect(reduceExpeditionUiState(briefing, "start")).toBe("running");
    expect(reduceExpeditionUiState("running", "finish")).toBe("mission-card");
  });

  it("creates identical playable currents for identical inputs", () => {
    const first = new Run(CHAPTER_ONE_FIXED_SEED, tuning);
    const second = new Run(CHAPTER_ONE_FIXED_SEED, tuning);
    for (let step = 0; step < 2_400; step += 1) {
      const steering = step < 800 ? -0.22 : step < 1_600 ? 0.31 : 0;
      first.step(1 / 120, steering);
      second.step(1 / 120, steering);
    }
    expect(first.sim.forwardDistance).toBeGreaterThan(150);
    expect(second.sim).toEqual(first.sim);
    expect(second.gates).toEqual(first.gates);
    expect(second.scoring.score).toBe(first.scoring.score);
  });
});
