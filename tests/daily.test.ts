import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import {
  DAILY_TRIAL_REWARD_PEARLS,
  HostedDailyClockClient,
  applyObjectiveRun,
  completeDailyTrial,
  createDefaultDailyRetention,
  dailySeed,
  dayIdFromDate,
  dayIdFromNumber,
  dayNumber,
  isDayId,
  mergeDailyRetention,
  proveDailyCourseSolvable,
  recordDailyReplay,
  resolveDailyDay,
  rotatingObjectives,
  summarizeStreak
} from "../src/meta/daily";
import { ReplayRecorder } from "../src/replay/replay";

const summary = {
  score: 100_000,
  elapsedSec: 30,
  forwardDistance: 100_000,
  nearMisses: 100,
  collisions: 0
};

function replay(dayId: string, score: number) {
  const recorder = new ReplayRecorder(dailySeed(dayId), tuning.version);
  recorder.record(0.25);
  return recorder.finish({ ...summary, score })!;
}

describe("Version 33 deterministic Daily Tide Trial", () => {
  it("accepts only real UTC calendar identifiers and round-trips day numbers", () => {
    expect(isDayId("2026-08-04")).toBe(true);
    expect(isDayId("2026-02-29")).toBe(false);
    expect(isDayId("2026-8-4")).toBe(false);
    expect(dayIdFromDate(new Date("2026-08-04T23:59:59Z"))).toBe("2026-08-04");
    expect(dayIdFromNumber(dayNumber("2026-08-04"))).toBe("2026-08-04");
  });

  it("derives stable day-specific seeds", () => {
    expect(dailySeed("2026-08-04")).toBe(dailySeed("2026-08-04"));
    expect(dailySeed("2026-08-04")).not.toBe(dailySeed("2026-08-05"));
    expect(() => dailySeed("2026-02-29")).toThrow("Invalid Glowfin daily day");
  });

  it("prefers the hosted UTC day and detects local clock rollback", () => {
    expect(resolveDailyDay(
      new Date("2026-08-04T10:00:00Z"),
      "2026-08-05",
      "2026-08-06"
    )).toEqual({ dayId: "2026-08-06", status: "trusted", source: "server" });
    expect(resolveDailyDay(
      new Date("2026-08-04T10:00:00Z"),
      "2026-08-05"
    )).toEqual({ dayId: "2026-08-05", status: "clock-rollback", source: "saved" });
  });

  it("rotates exactly two daily and one weekly objective deterministically", () => {
    const first = rotatingObjectives("2026-08-04");
    expect(first).toHaveLength(3);
    expect(first.map((item) => item.cadence)).toEqual(["daily", "daily", "weekly"]);
    expect(new Set(first.map((item) => item.id)).size).toBe(3);
    expect(rotatingObjectives("2026-08-04")).toEqual(first);
    expect(rotatingObjectives("invalid")).toEqual([]);
  });

  it("awards each objective once and withholds all calendar progress when denied", () => {
    let state = createDefaultDailyRetention();
    let reward = 0;
    for (let run = 0; run < 7; run++) {
      const update = applyObjectiveRun(state, "2026-08-04", summary, "daily", true);
      state = update.state;
      reward += update.rewardPearls;
    }
    expect(state.objectiveClaims).toHaveLength(3);
    expect(reward).toBe(24 + 28 + 72);
    expect(applyObjectiveRun(state, "2026-08-04", summary, "daily", true).rewardPearls).toBe(0);
    const denied = applyObjectiveRun(
      createDefaultDailyRetention(),
      "2026-08-04",
      summary,
      "daily",
      false
    );
    expect(denied.state.objectiveProgress).toEqual({});
    expect(denied.rewardPearls).toBe(0);
  });

  it("uses one grace day per active streak and resets after a second gap", () => {
    expect(summarizeStreak([
      "2026-08-01",
      "2026-08-02",
      "2026-08-04",
      "2026-08-05"
    ])).toMatchObject({
      current: 4,
      best: 4,
      graceAvailable: false,
      graceUsedForDay: "2026-08-03"
    });
    expect(summarizeStreak([
      "2026-08-01",
      "2026-08-02",
      "2026-08-04",
      "2026-08-06"
    ])).toMatchObject({ current: 1, best: 3, graceAvailable: true });
  });

  it("grants the daily completion reward once and rejects rollback rewards", () => {
    const first = completeDailyTrial(
      createDefaultDailyRetention(),
      "2026-08-04"
    );
    expect(first.awarded).toBe(true);
    expect(first.rewardPearls).toBe(DAILY_TRIAL_REWARD_PEARLS);
    const duplicate = completeDailyTrial(first.state, "2026-08-04");
    expect(duplicate.awarded).toBe(false);
    expect(duplicate.rewardPearls).toBe(0);
    const rollbackState = { ...first.state, trustedDay: "2026-08-05" };
    const rollback = completeDailyTrial(rollbackState, "2026-08-04");
    expect(rollback.rejectedForClockRollback).toBe(true);
    expect(rollback.rewardPearls).toBe(0);
  });

  it("stores only the best same-seed replay for a Daily Tide day", () => {
    const dayId = "2026-08-04";
    let state = recordDailyReplay(createDefaultDailyRetention(), dayId, replay(dayId, 100));
    expect(state.bestDailyReplay?.score).toBe(100);
    state = recordDailyReplay(state, dayId, replay(dayId, 80));
    expect(state.bestDailyReplay?.score).toBe(100);
    state = recordDailyReplay(state, dayId, replay("2026-08-05", 200));
    expect(state.bestDailyReplay?.score).toBe(100);
  });

  it("merges calendar state idempotently using maxima and newest trusted data", () => {
    const local = createDefaultDailyRetention();
    local.trustedDay = "2026-08-04";
    local.lastSessionDay = "2026-08-04";
    local.dailyClaims = ["2026-08-04"];
    local.objectiveProgress = { shared: 2 };
    local.bestDailyReplay = { dayId: "2026-08-04", score: 100, replay: replay("2026-08-04", 100) };
    const remote = createDefaultDailyRetention();
    remote.trustedDay = "2026-08-05";
    remote.lastSessionDay = "2026-08-05";
    remote.dailyClaims = ["2026-08-04", "2026-08-05"];
    remote.objectiveProgress = { shared: 5 };
    remote.bestDailyReplay = { dayId: "2026-08-05", score: 80, replay: replay("2026-08-05", 80) };
    const merged = mergeDailyRetention(local, remote);
    expect(merged.trustedDay).toBe("2026-08-05");
    expect(merged.dailyClaims).toEqual(["2026-08-04", "2026-08-05"]);
    expect(merged.objectiveProgress.shared).toBe(5);
    expect(merged.bestDailyReplay?.dayId).toBe("2026-08-05");
    expect(mergeDailyRetention(merged, remote)).toEqual(merged);
  });

  it("proves the seeded Daily Tide course solvable with the production solver", () => {
    expect(proveDailyCourseSolvable("2026-08-04", tuning, 1_500)).toBe(true);
  });

  it("accepts only a no-cache hosted day whose seed matches the shared algorithm", async () => {
    const calls: RequestInit[] = [];
    const client = new HostedDailyClockClient(async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        dayId: "2026-08-04",
        seed: dailySeed("2026-08-04")
      }));
    });
    expect(await client.load()).toEqual({
      dayId: "2026-08-04",
      seed: dailySeed("2026-08-04")
    });
    expect(calls[0]).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin" });

    const invalid = new HostedDailyClockClient(async () => new Response(JSON.stringify({
      dayId: "2026-08-04",
      seed: 1
    })));
    expect(await invalid.load()).toBeNull();
  });
});
