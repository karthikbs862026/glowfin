import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC } from "../src/core/timestep";
import { dailySeed } from "../src/meta/daily";
import {
  PROGRESS_PRIMARY_KEY,
  PROGRESS_SCHEMA_VERSION,
  VERSION_1_PRIMARY_KEY,
  ProgressRepository,
  createDefaultProgress,
  validateProgress,
  type ProgressStorage
} from "../src/persistence/progress";
import { ReplayRecorder, type ReplaySummary } from "../src/replay/replay";

class MemoryStorage implements ProgressStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function summary(score = 120): ReplaySummary {
  return {
    score,
    elapsedSec: 30,
    forwardDistance: 1_000,
    nearMisses: 4,
    collisions: 0
  };
}

function replay(seed: number, value = summary()) {
  const recorder = new ReplayRecorder(seed, tuning.version);
  recorder.record(0.25);
  return recorder.finish({ ...value, elapsedSec: FIXED_DT_SEC })!;
}

describe("Version 33 first-run-to-next-day retention journey", () => {
  it("starts with a valid schema-v2 save and unlocked default loadout", () => {
    const progress = createDefaultProgress(new Date("2026-08-04T00:00:00Z"));
    expect(progress.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(progress.progression).toMatchObject({
      lumenPearls: 0,
      tideXp: 0,
      equippedCosmetics: {
        glow: "glow.moon-cyan",
        fin: "fin.tideglass",
        trail: "trail.moonwake",
        aura: "aura.none"
      },
      recentRewardClaims: []
    });
    expect(validateProgress(progress)).toBe(true);
  });

  it("migrates an intact Version 32 envelope once without inventing rewards", () => {
    const storage = new MemoryStorage();
    const legacy = {
      schemaVersion: 1,
      revision: 7,
      updatedAt: "2026-08-03T00:00:00.000Z",
      bestScore: 345,
      bestReplay: null,
      totals: { runs: 8, playSeconds: 120, nearMisses: 6, collisions: 2 },
      telemetryConsent: "granted",
      ghostEnabled: true
    } as const;
    storage.setItem(VERSION_1_PRIMARY_KEY, JSON.stringify({
      envelopeVersion: 1,
      payload: legacy,
      checksum: checksumText(JSON.stringify(legacy))
    }));
    const first = new ProgressRepository(storage, () => new Date("2026-08-04T00:00:00Z")).load();
    expect(first.recoveredFrom).toBe("version-1");
    expect(first.progress).toMatchObject({
      schemaVersion: 2,
      revision: 8,
      bestScore: 345,
      progression: { lumenPearls: 0, tideXp: 0 }
    });
    expect(storage.values.has(PROGRESS_PRIMARY_KEY)).toBe(true);
    const second = new ProgressRepository(storage).load();
    expect(second.recoveredFrom).toBe("primary");
    expect(second.progress.progression.lumenPearls).toBe(0);
  });

  it("deduplicates a repeated run reward claim while preserving the run record", () => {
    const repository = new ProgressRepository(
      new MemoryStorage(),
      () => new Date("2026-08-04T00:00:00Z")
    );
    repository.load();
    const first = repository.recordRun(summary(), replay(42), { runId: "same-run" });
    const second = repository.recordRun(summary(), replay(42), { runId: "same-run" });
    expect(first.retention.runRewardClaimed).toBe(true);
    expect(second.retention.runRewardClaimed).toBe(false);
    expect(second.retention.duplicateRewardPrevented).toBe(true);
    expect(second.progress.progression.recentRewardClaims).toEqual(["run:same-run"]);
    expect(second.progress.totals.runs).toBe(2);
  });

  it("grants one same-seed daily reward and retains its raceable best ghost", () => {
    const dayId = "2026-08-04";
    const repository = new ProgressRepository(
      new MemoryStorage(),
      () => new Date("2026-08-04T00:00:00Z")
    );
    repository.load();
    const dailyReplay = replay(dailySeed(dayId), summary(500));
    const first = repository.recordRun(summary(500), dailyReplay, {
      runId: "daily-one",
      mode: "daily",
      dayId
    });
    const second = repository.recordRun(summary(400), replay(dailySeed(dayId), summary(400)), {
      runId: "daily-two",
      mode: "daily",
      dayId
    });
    expect(first.retention.dailyAwarded).toBe(true);
    expect(second.retention.dailyAwarded).toBe(false);
    expect(second.progress.daily.dailyClaims).toEqual([dayId]);
    expect(second.progress.daily.bestDailyReplay?.score).toBe(500);
  });

  it("withholds daily and objective rewards when the calendar rolls backward", () => {
    const repository = new ProgressRepository(
      new MemoryStorage(),
      () => new Date("2026-08-05T00:00:00Z")
    );
    repository.load();
    repository.trustCalendarDay("2026-08-05", true);
    const result = repository.recordRun(summary(), replay(dailySeed("2026-08-04")), {
      runId: "rollback-run",
      mode: "daily",
      dayId: "2026-08-04",
      calendarRewardsAllowed: false
    });
    expect(result.retention.calendarRewardRejected).toBe(true);
    expect(result.retention.dailyRewardPearls).toBe(0);
    expect(result.retention.objectiveRewardPearls).toBe(0);
    expect(result.progress.daily.dailyClaims).toEqual([]);
  });

  it("persists next-day return once and refuses to move the trusted day backward", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(
      storage,
      () => new Date("2026-08-01T00:00:00Z")
    );
    repository.load();
    expect(repository.observeSession("2026-08-01").nextDayReturn).toBe(false);
    const nextDay = repository.observeSession("2026-08-02");
    expect(nextDay).toMatchObject({ daysSincePrevious: 1, nextDayReturn: true, clockRollback: false });
    const rollback = repository.observeSession("2026-08-01");
    expect(rollback.clockRollback).toBe(true);
    expect(rollback.progress.daily.lastSessionDay).toBe("2026-08-02");
    expect(new ProgressRepository(storage).load().progress.daily.lastSessionDay).toBe("2026-08-02");
  });
});
