import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC } from "../src/core/timestep";
import {
  LEGACY_BEST_SCORE_KEY,
  PROGRESS_PRIMARY_KEY,
  ProgressRepository,
  createDefaultProgress,
  mergeProgress,
  type ProgressStorage
} from "../src/persistence/progress";
import { ReplayRecorder, type ReplaySummary } from "../src/replay/replay";

class MemoryStorage implements ProgressStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function runSummary(score: number): ReplaySummary {
  return {
    score,
    elapsedSec: 2 * FIXED_DT_SEC,
    forwardDistance: 4,
    nearMisses: 1,
    collisions: 0
  };
}

function replay(score: number) {
  const recorder = new ReplayRecorder(score >>> 0, tuning.version);
  recorder.record(0.25);
  recorder.record(-0.25);
  return recorder.finish(runSummary(score))!;
}

describe("versioned corruption-recoverable progress", () => {
  it("records only a validated best run and replay", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(storage, () => new Date("2026-08-04T00:00:00Z"));
    expect(repository.load().recoveredFrom).toBe("default");
    const first = repository.recordRun(runSummary(120), replay(120));
    expect(first.newBest).toBe(true);
    expect(first.replaySaved).toBe(true);
    const second = repository.recordRun(runSummary(80), replay(80));
    expect(second.progress.bestScore).toBe(120);
    expect(second.progress.bestReplay?.summary.score).toBe(120);
    expect(second.progress.totals.runs).toBe(2);
  });

  it("can award shared progression without replacing the competitive best", () => {
    const repository = new ProgressRepository(
      new MemoryStorage(),
      () => new Date("2026-08-04T00:00:00Z")
    );
    repository.load();
    repository.recordRun(runSummary(120), replay(120));

    const realmRun = repository.recordRun(runSummary(900), null, {
      runId: "kelp-cathedral-run",
      competitiveRecordsAllowed: false
    });

    expect(realmRun.newBest).toBe(false);
    expect(realmRun.replaySaved).toBe(false);
    expect(realmRun.progress.bestScore).toBe(120);
    expect(realmRun.progress.bestReplay?.summary.score).toBe(120);
    expect(realmRun.progress.totals.runs).toBe(2);
    expect(realmRun.retention.runRewardClaimed).toBe(true);
  });

  it("recovers a known-good backup when the primary copy is corrupt", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(storage);
    repository.load();
    repository.recordRun(runSummary(120), replay(120));
    repository.recordRun(runSummary(80), replay(80));
    storage.setItem(PROGRESS_PRIMARY_KEY, "{broken");

    const recovered = new ProgressRepository(storage).load();
    expect(recovered.recoveredFrom).toBe("backup");
    expect(recovered.recoveryReason).toBe("primary-corrupt");
    expect(recovered.progress.bestScore).toBe(120);
  });

  it("migrates the legacy best-score key", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_BEST_SCORE_KEY, "345.5");
    const loaded = new ProgressRepository(storage).load();
    expect(loaded.recoveredFrom).toBe("legacy");
    expect(loaded.recoveryReason).toBe("migrated-best-score");
    expect(loaded.progress.bestScore).toBe(345.5);
  });

  it("merges cloud conflicts idempotently without double-counting totals", () => {
    const local = createDefaultProgress(new Date("2026-08-04T00:00:00Z"));
    local.revision = 4;
    local.bestScore = 120;
    local.bestReplay = replay(120);
    local.totals = { runs: 8, playSeconds: 90, nearMisses: 7, collisions: 2 };
    local.telemetryConsent = "granted";
    const remote = createDefaultProgress(new Date("2026-08-04T00:01:00Z"));
    remote.revision = 9;
    remote.bestScore = 160;
    remote.bestReplay = replay(160);
    remote.totals = { runs: 6, playSeconds: 120, nearMisses: 9, collisions: 1 };

    const merged = mergeProgress(local, remote, new Date("2026-08-04T00:02:00Z"));
    expect(merged.bestScore).toBe(160);
    expect(merged.bestReplay?.summary.score).toBe(160);
    expect(merged.totals).toEqual({ runs: 8, playSeconds: 120, nearMisses: 9, collisions: 2 });
    expect(merged.telemetryConsent).toBe("granted");
    expect(mergeProgress(merged, remote).totals).toEqual(merged.totals);
  });

  it("persists explicit telemetry and ghost preferences", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(storage);
    repository.load();
    repository.setTelemetryConsent("denied");
    repository.setGhostEnabled(false);
    const loaded = new ProgressRepository(storage).load().progress;
    expect(loaded.telemetryConsent).toBe("denied");
    expect(loaded.ghostEnabled).toBe(false);
  });
});
