import { describe, expect, it } from "vitest";
import {
  PROGRESS_PRIMARY_KEY,
  VERSION_4_PRIMARY_KEY,
  ProgressRepository,
  createDefaultProgress,
  mergeProgress,
} from "../src/persistence/progress";
import { KELP_CATHEDRAL_REALM, CRYSTAL_TRENCH_REALM } from "../src/realms/definition";
import {
  REALM_PROGRESS_PRIMARY_KEY,
  createDefaultRealmProgress,
} from "../src/realms/progress";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

describe("Version 43-R4 shared realm progression", () => {
  it("migrates the complete V42 schema and imports accepted prototype realm history", () => {
    const now = new Date("2026-08-11T08:00:00.000Z");
    const storage = new MemoryStorage();
    const current = createDefaultProgress(now);
    current.revision = 42;
    current.bestScore = 14_497;
    current.onboarding.tutorialCompleted = true;
    current.tideSprint.totals.runs = 5;
    current.tideSprint.totals.wins = 2;
    const v4: Record<string, unknown> = { ...current, schemaVersion: 4 };
    delete v4.realms;
    const v4Payload = JSON.stringify(v4);
    storage.setItem(VERSION_4_PRIMARY_KEY, JSON.stringify({
      envelopeVersion: 4,
      payload: v4,
      checksum: checksum(v4Payload),
    }));

    const legacyRealms = createDefaultRealmProgress(now);
    legacyRealms.revision = 3;
    legacyRealms.kelpCathedral.runs = 2;
    legacyRealms.kelpCathedral.rescues = 1;
    legacyRealms.kelpCathedral.bestRescueSec = 39.4;
    legacyRealms.kelpCathedral.relicPages = ["kelp-cathedral-page-1"];
    legacyRealms.kelpCathedral.masteredVerbs = [...KELP_CATHEDRAL_REALM.gameplayVerbs];
    const realmPayload = JSON.stringify(legacyRealms);
    storage.setItem(REALM_PROGRESS_PRIMARY_KEY, JSON.stringify({
      envelopeVersion: 1,
      payload: legacyRealms,
      checksum: checksum(realmPayload),
    }));

    const loaded = new ProgressRepository(storage, () => now).load();
    expect(loaded.recoveredFrom).toBe("version-4");
    expect(loaded.recoveryReason).toBe("migrated-version-4-and-realm-prototype");
    expect(loaded.progress.schemaVersion).toBe(5);
    expect(loaded.progress.bestScore).toBe(14_497);
    expect(loaded.progress.onboarding.tutorialCompleted).toBe(true);
    expect(loaded.progress.tideSprint.totals).toMatchObject({ runs: 5, wins: 2 });
    expect(loaded.progress.realms.kelpCathedral).toMatchObject({
      runs: 2,
      rescues: 1,
      bestRescueSec: 39.4,
    });
    expect(loaded.progress.progression.lumenPearlsEarned).toBe(0);
    expect(storage.values.has(PROGRESS_PRIMARY_KEY)).toBe(true);
  });

  it("enforces Realm 1 → Realm 2 and awards each shared objective exactly once", () => {
    const storage = new MemoryStorage();
    const repository = new ProgressRepository(
      storage,
      () => new Date("2026-08-11T09:00:00.000Z"),
    );
    repository.load();

    const locked = repository.recordCrystalTrenchRun({
      runId: "crystal-before-rescue",
      elapsedSec: 61,
      completed: true,
      cleanPerformance: true,
      masteredVerbs: CRYSTAL_TRENCH_REALM.gameplayVerbs,
    });
    expect(locked.duplicateRewardPrevented).toBe(true);
    expect(locked.crystalTrenchUnlocked).toBe(false);
    expect(locked.progress.realms.crystalTrench.runs).toBe(0);

    const rescue = repository.recordKelpCathedralRun({
      runId: "kelp-r4-rescue",
      elapsedSec: 41.2,
      rescuedManta: true,
      relicPageFound: true,
      masteredVerbs: KELP_CATHEDRAL_REALM.gameplayVerbs,
    }, { collisions: 1 });
    expect(rescue.crystalTrenchNewlyUnlocked).toBe(true);
    expect(rescue.award).toEqual({
      pearls: 95,
      xp: 75,
      newlyCompletedObjectives: ["realm-kelp-rescue", "realm-kelp-relic"],
    });
    expect(rescue.progress.totals).toMatchObject({ runs: 1, collisions: 1 });
    expect(rescue.progress.bestScore).toBe(0);
    expect(rescue.progress.bestReplay).toBeNull();
    expect(rescue.progress.daily.dailyClaims).toEqual([]);
    expect(rescue.progress.tideSprint.totals.runs).toBe(0);

    const duplicateRescue = repository.recordKelpCathedralRun({
      runId: "kelp-r4-rescue",
      elapsedSec: 41.2,
      rescuedManta: true,
      relicPageFound: true,
      masteredVerbs: KELP_CATHEDRAL_REALM.gameplayVerbs,
    });
    expect(duplicateRescue.duplicateRewardPrevented).toBe(true);
    expect(duplicateRescue.progress.totals.runs).toBe(1);

    const crystal = repository.recordCrystalTrenchRun({
      runId: "crystal-r3-clean",
      elapsedSec: 60.6,
      completed: true,
      cleanPerformance: true,
      masteredVerbs: CRYSTAL_TRENCH_REALM.gameplayVerbs,
    });
    expect(crystal.award).toEqual({
      pearls: 120,
      xp: 90,
      newlyCompletedObjectives: ["realm-crystal-clear", "realm-crystal-clean"],
    });
    expect(crystal.progress.progression).toMatchObject({
      lumenPearls: 215,
      lumenPearlsEarned: 215,
      tideXp: 165,
    });
    expect(crystal.progress.realms.crystalTrench).toMatchObject({
      runs: 1,
      completions: 1,
      cleanCompletions: 1,
      bestTimeSec: 60.6,
    });
    expect(crystal.leviathanGraveyardNewlyUnlocked).toBe(true);
    const objectives = repository.activeRealmObjectives();
    expect(
      objectives
        .filter((objective) => objective.id.startsWith("realm-kelp-") || objective.id.startsWith("realm-crystal-"))
        .every((objective) => objective.completed),
    ).toBe(true);
    expect(
      objectives
        .filter((objective) => objective.id.startsWith("realm-heartlight-"))
        .every((objective) => !objective.completed),
    ).toBe(true);
  });

  it("merges V42 mode progress and realm history monotonically", () => {
    const now = new Date("2026-08-11T10:00:00.000Z");
    const local = createDefaultProgress(now);
    const remote = createDefaultProgress(now);
    local.tideSprint.totals.runs = 8;
    local.tideSprint.totals.wins = 3;
    local.realms.kelpCathedral.runs = 2;
    local.realms.kelpCathedral.rescues = 1;
    local.realms.kelpCathedral.bestRescueSec = 40;
    remote.bestScore = 14_497;
    remote.onboarding.tutorialCompleted = true;
    remote.tideSprint.totals.runs = 6;
    remote.tideSprint.totals.wins = 5;
    remote.realms.kelpCathedral.runs = 4;
    remote.realms.kelpCathedral.rescues = 2;
    remote.realms.kelpCathedral.bestRescueSec = 36;
    remote.realms.crystalTrench.runs = 3;
    remote.realms.crystalTrench.completions = 2;
    remote.realms.crystalTrench.cleanCompletions = 1;
    remote.realms.crystalTrench.bestTimeSec = 60.4;

    const merged = mergeProgress(local, remote, now);
    expect(merged.bestScore).toBe(14_497);
    expect(merged.onboarding.tutorialCompleted).toBe(true);
    expect(merged.tideSprint.totals).toMatchObject({ runs: 8, wins: 5 });
    expect(merged.realms.kelpCathedral).toMatchObject({
      runs: 4,
      rescues: 2,
      bestRescueSec: 36,
    });
    expect(merged.realms.crystalTrench).toMatchObject({
      runs: 3,
      completions: 2,
      cleanCompletions: 1,
      bestTimeSec: 60.4,
    });
  });
});
