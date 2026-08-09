import assert from "node:assert/strict";
import { describe, expect, test } from "vitest";

import {
  MAX_PROGRESS_BYTES,
  PROGRESS_PRIMARY_KEY,
  VERSION_3_PRIMARY_KEY,
  ProgressRepository,
  createDefaultProgress,
  mergeProgress,
} from "../src/persistence/progress";
import { ReplayRecorder } from "../src/replay/replay";
import {
  CleanTideSprintDirector,
  CLEAN_TIDE_SPRINT_PLAN_HASH,
  TIDE_SPRINT_DEFAULT_THROTTLE,
  tideSprintIdealControl,
} from "../src/tideSprint/director";
import {
  TideSprintGhostPlayback,
  TideSprintGhostRecorder,
} from "../src/tideSprint/ghost";
import {
  MAX_TIDE_SPRINT_GHOST_FRAMES,
  TIDE_SPRINT_OBJECTIVES,
  validateTideSprintGhost,
} from "../src/tideSprint/progress";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function createIdealGhost(selected: "glowfin" | "neri" | "coralyn" = "glowfin") {
  const director = new CleanTideSprintDirector();
  const recorder = new TideSprintGhostRecorder(selected);
  director.start(selected);
  for (let frame = 0; frame < 120 * 100; frame += 1) {
    const control = tideSprintIdealControl(director.snapshot().player.distance);
    recorder.record(control);
    const events = director.step(1 / 120, control);
    if (events.finished) break;
  }
  const result = director.result();
  assert.ok(result);
  const ghost = recorder.finish(result.elapsedSec);
  assert.ok(ghost);
  return { result, ghost };
}

describe("Version 42 shared Tide Sprint integration", () => {
  test("migrates the complete Version 41 schema without changing Classic progress", () => {
    const storage = new MemoryStorage();
    const current = createDefaultProgress(new Date("2026-08-09T00:00:00Z"));
    current.revision = 7;
    current.bestScore = 12_345;
    current.progression.lumenPearlsEarned = 80;
    current.progression.lumenPearls = 80;
    current.onboarding.tutorialCompleted = true;
    const withoutMode = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== "tideSprint"),
    );
    const legacy = { ...withoutMode, schemaVersion: 3 as const };
    storage.setItem(VERSION_3_PRIMARY_KEY, JSON.stringify({
      envelopeVersion: 3,
      payload: legacy,
      checksum: checksumText(JSON.stringify(legacy)),
    }));

    const loaded = new ProgressRepository(
      storage,
      () => new Date("2026-08-09T00:01:00Z"),
    ).load();
    expect(loaded.recoveredFrom).toBe("version-3");
    expect(loaded.progress.schemaVersion).toBe(4);
    expect(loaded.progress.bestScore).toBe(12_345);
    expect(loaded.progress.progression.lumenPearls).toBe(80);
    expect(loaded.progress.onboarding.tutorialCompleted).toBe(true);
    expect(loaded.progress.tideSprint.totals.runs).toBe(0);
    expect(storage.values.has(PROGRESS_PRIMARY_KEY)).toBe(true);
  });

  test("records rewards, objectives and best ghost atomically and idempotently", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(
      storage,
      () => new Date("2026-08-09T00:02:00Z"),
    );
    repository.load();
    const { result, ghost } = createIdealGhost();
    const record = {
      runId: "run_v42_atomic",
      selected: "glowfin" as const,
      placement: 1,
      elapsedSec: result.elapsedSec,
      boostsCollected: result.boostsCollected,
      collisions: result.collisions,
      ghost,
    };
    const first = repository.recordTideSprintRace(record);
    expect(first.duplicateRewardPrevented).toBe(false);
    expect(first.newBest).toBe(true);
    expect(first.ghostSaved).toBe(true);
    expect(first.award.pearls).toBeGreaterThan(0);
    expect(first.award.xp).toBeGreaterThan(0);
    expect(first.award.newlyCompletedObjectives.map((objective) => objective.id)).toEqual(
      TIDE_SPRINT_OBJECTIVES.map((objective) => objective.id),
    );
    expect(first.progress.tideSprint.totals).toMatchObject({ runs: 1, wins: 1 });
    expect(first.progress.tideSprint.bestGhost?.planHash).toBe(
      CLEAN_TIDE_SPRINT_PLAN_HASH,
    );
    expect(first.progress.bestScore).toBe(0);
    expect(first.progress.bestReplay).toBeNull();
    expect(first.progress.daily.dailyClaims).toEqual([]);
    expect(first.progress.onboarding.tutorialCompleted).toBe(false);

    const duplicate = repository.recordTideSprintRace(record);
    expect(duplicate.duplicateRewardPrevented).toBe(true);
    expect(duplicate.award).toMatchObject({ pearls: 0, xp: 0, bond: 0 });
    expect(duplicate.progress.tideSprint.totals.runs).toBe(1);
    expect(duplicate.progress.progression.lumenPearlsEarned).toBe(
      first.progress.progression.lumenPearlsEarned,
    );

    repository.selectTideSprintCrew("neri");
    storage.setItem(PROGRESS_PRIMARY_KEY, "{corrupt");
    const recovered = new ProgressRepository(storage).load();
    expect(recovered.recoveredFrom).toBe("backup");
    expect(recovered.progress.tideSprint.totals.runs).toBe(1);
    expect(recovered.progress.tideSprint.bestGhost?.checksum).toBe(ghost.checksum);
  });

  test("round-trips a deterministic Best Echo without changing race authority", () => {
    const { result, ghost } = createIdealGhost("coralyn");
    expect(validateTideSprintGhost(ghost)).toBe(true);
    const playback = new TideSprintGhostPlayback(ghost);
    const race = new CleanTideSprintDirector();
    race.start("neri", playback);
    for (let frame = 0; frame < 120 * 100; frame += 1) {
      const events = race.step(1 / 120, {
        targetLateral: 0,
        throttle: TIDE_SPRINT_DEFAULT_THROTTLE,
      });
      if (events.finished) break;
    }
    const savedEcho = race.snapshot().racers.find((racer) => racer.id === "verified-echo");
    assert.ok(savedEcho?.finishedAtSec);
    expect(Math.abs(savedEcho.finishedAtSec - result.elapsedSec)).toBeLessThan(0.12);
    expect(race.snapshot().racers).toHaveLength(4);
    expect(race.snapshot().racers.filter((racer) => racer.ghost)).toHaveLength(2);
  });

  test("merges cloud progress monotonically and retains the faster valid ghost", () => {
    const first = new ProgressRepository(new MemoryStorage());
    const second = new ProgressRepository(new MemoryStorage());
    first.load();
    second.load();
    const fast = createIdealGhost("glowfin");
    const slowRecorder = new TideSprintGhostRecorder("neri");
    for (let frame = 0; frame < 120 * 72; frame += 1) {
      slowRecorder.record({ targetLateral: 0, throttle: TIDE_SPRINT_DEFAULT_THROTTLE });
    }
    const slowGhost = slowRecorder.finish(72);
    assert.ok(slowGhost);
    const local = first.recordTideSprintRace({
      runId: "run_fast",
      selected: "glowfin",
      placement: 1,
      elapsedSec: fast.result.elapsedSec,
      boostsCollected: fast.result.boostsCollected,
      collisions: 0,
      ghost: fast.ghost,
    }).progress;
    const remote = second.recordTideSprintRace({
      runId: "run_slow",
      selected: "neri",
      placement: 2,
      elapsedSec: 72,
      boostsCollected: 4,
      collisions: 1,
      ghost: slowGhost,
    }).progress;
    const merged = mergeProgress(local, remote);
    expect(merged.tideSprint.bestFinishSec).toBeCloseTo(fast.result.elapsedSec, 5);
    expect(merged.tideSprint.bestGhost?.checksum).toBe(fast.ghost.checksum);
    expect(merged.tideSprint.completedObjectives).toEqual(expect.arrayContaining([
      "first-finish",
      "six-current-rings",
      "first-win",
    ]));
    expect(merged.progression.lumenPearlsEarned).toBeGreaterThanOrEqual(
      Math.max(local.progression.lumenPearlsEarned, remote.progression.lumenPearlsEarned),
    );
  });

  test("imports isolated crew progress once without overwriting integrated races", () => {
    const repository = new ProgressRepository(new MemoryStorage());
    repository.load();
    const imported = repository.importLegacyTideSprintCrew("neri", {
      glowfin: 2,
      neri: 7,
      coralyn: 1,
    });
    expect(imported.tideSprint.selected).toBe("neri");
    expect(imported.tideSprint.bonds).toEqual({ glowfin: 2, neri: 7, coralyn: 1 });

    repository.recordTideSprintRace({
      runId: "run_after_legacy_import",
      selected: "neri",
      placement: 2,
      elapsedSec: 72,
      boostsCollected: 4,
      collisions: 1,
      ghost: null,
    });
    const preserved = repository.importLegacyTideSprintCrew("coralyn", {
      glowfin: 999,
      neri: 999,
      coralyn: 999,
    });
    expect(preserved.tideSprint.selected).toBe("neri");
    expect(preserved.tideSprint.bonds.neri).toBe(9);
    expect(preserved.tideSprint.totals.runs).toBe(1);
  });

  test("stores a bounded Classic replay and maximum-length Tide ghost together", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(storage);
    repository.load();

    const classicRecorder = new ReplayRecorder(0x42, 1);
    for (let frame = 0; frame < 8_000; frame += 1) {
      classicRecorder.record(frame % 2 === 0 ? -0.123456 : 0.123456);
    }
    const classicSummary = {
      score: 9_000,
      elapsedSec: 8_000 / 120,
      forwardDistance: 2_400,
      nearMisses: 12,
      collisions: 1,
    };
    const classicReplay = classicRecorder.finish(classicSummary);
    assert.ok(classicReplay);
    repository.recordRun(classicSummary, classicReplay, {
      runId: "run_large_classic_replay",
    });

    const ghostRecorder = new TideSprintGhostRecorder("glowfin");
    for (let frame = 0; frame < MAX_TIDE_SPRINT_GHOST_FRAMES; frame += 1) {
      ghostRecorder.record({
        targetLateral: frame % 2 === 0 ? -4.4 : 4.4,
        throttle: frame % 3 === 0 ? 1 : 0.18,
      });
    }
    const ghost = ghostRecorder.finish(180);
    assert.ok(ghost);
    repository.recordTideSprintRace({
      runId: "run_maximum_tide_ghost",
      selected: "glowfin",
      placement: 4,
      elapsedSec: 180,
      boostsCollected: 0,
      collisions: 4,
      ghost,
    });

    const encoded = storage.getItem(PROGRESS_PRIMARY_KEY);
    assert.ok(encoded);
    expect(encoded.length).toBeLessThanOrEqual(MAX_PROGRESS_BYTES);
    const reloaded = new ProgressRepository(storage).load();
    expect(reloaded.progress.bestReplay?.checksum).toBe(classicReplay.checksum);
    expect(reloaded.progress.tideSprint.bestGhost?.checksum).toBe(ghost.checksum);
  });

  test("survives an exact deterministic 5,400-frame race soak", () => {
    const first = new CleanTideSprintDirector();
    const second = new CleanTideSprintDirector();
    first.start("glowfin");
    second.start("glowfin");
    for (let frame = 0; frame < 5_400; frame += 1) {
      const control = tideSprintIdealControl(first.snapshot().player.distance);
      expect(second.step(1 / 120, control)).toEqual(first.step(1 / 120, control));
    }
    expect(second.snapshot()).toEqual(first.snapshot());
    expect(first.snapshot().racers).toHaveLength(4);
    for (const racer of first.snapshot().racers) {
      expect(Number.isFinite(racer.distance)).toBe(true);
      expect(Number.isFinite(racer.lateral)).toBe(true);
      expect(Number.isFinite(racer.speed)).toBe(true);
    }
  });
});
