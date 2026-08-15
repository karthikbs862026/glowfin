import { describe, expect, it } from "vitest";
import {
  canonicalizeExpeditionProgress,
  createDefaultExpeditionProgress,
} from "../src/expedition/progress";
import {
  deriveRelicAtlasState,
  deriveRelicAtlasUnlocks,
} from "../src/meta/relicAtlas";
import {
  ProgressRepository,
  type ProgressStorage,
} from "../src/persistence/progress";
import {
  applyCrystalTrenchRun,
  applyKelpCathedralRun,
  applyLeviathanGraveyardRun,
  createDefaultRealmProgress,
  grantKelpCathedralStoryAccess,
  mergeRealmProgress,
  realmStoryAccess,
} from "../src/realms/progress";

class MemoryStorage implements ProgressStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("integrated Glowfin story journey", () => {
  it("repairs historical Chapter 1 completion into Moonseed and Moon Well truth", () => {
    const legacy = createDefaultExpeditionProgress(new Date("2026-01-01T00:00:00Z"));
    legacy.completionMarks.primaryObjective = true;
    const repaired = canonicalizeExpeditionProgress(
      legacy,
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(repaired.moonWellRestored).toBe(true);
    expect(repaired.completionMarks.hiddenRelic).toBe(true);
    expect(repaired.discoveredRelics).toContain("moonseed-fragment");
    expect(deriveRelicAtlasUnlocks(repaired, createDefaultRealmProgress()).kelpCathedral)
      .toBe(true);
  });

  it("cloud-merges Chapter 1 access monotonically", () => {
    const local = grantKelpCathedralStoryAccess(createDefaultRealmProgress());
    const remote = createDefaultRealmProgress();
    const merged = mergeRealmProgress(local, remote);
    expect(realmStoryAccess(merged).kelpCathedral).toBe(true);

    const repository = new ProgressRepository(new MemoryStorage());
    repository.load();
    const granted = repository.grantKelpCathedralStoryAccess();
    expect(realmStoryAccess(granted.realms).kelpCathedral).toBe(true);
    expect(repository.grantKelpCathedralStoryAccess().revision).toBe(granted.revision);
  });

  it("never relocks a realm already proven by downstream history", () => {
    const expedition = createDefaultExpeditionProgress();
    const realms = createDefaultRealmProgress();
    realms.crystalTrench.runs = 1;
    expect(deriveRelicAtlasUnlocks(expedition, realms)).toMatchObject({
      kelpCathedral: true,
      crystalTrench: true,
    });
    realms.leviathanGraveyard!.runs = 1;
    expect(deriveRelicAtlasUnlocks(expedition, realms).leviathanGraveyard).toBe(true);
  });

  it("uses one story contract across results, persistence and the Living Atlas", () => {
    const chapterOne = canonicalizeExpeditionProgress({
      ...createDefaultExpeditionProgress(),
      completionMarks: {
        primaryObjective: true,
        hiddenRelic: true,
        cleanPerformance: true,
      },
    });
    let realms = grantKelpCathedralStoryAccess(createDefaultRealmProgress());
    realms = applyKelpCathedralRun(realms, {
      runId: "qa-rescue-without-page",
      elapsedSec: 90,
      rescuedManta: true,
      relicPageFound: false,
      masteredVerbs: [],
    }).progress;
    expect(deriveRelicAtlasUnlocks(chapterOne, realms).crystalTrench).toBe(false);

    realms = applyKelpCathedralRun(realms, {
      runId: "qa-page",
      elapsedSec: 88,
      rescuedManta: true,
      relicPageFound: true,
      masteredVerbs: [],
    }).progress;
    expect(deriveRelicAtlasUnlocks(chapterOne, realms).crystalTrench).toBe(true);

    realms = applyCrystalTrenchRun(realms, {
      runId: "qa-victory-not-clean",
      elapsedSec: 100,
      completed: true,
      cleanPerformance: false,
      masteredVerbs: [],
    }).progress;
    expect(deriveRelicAtlasUnlocks(chapterOne, realms).leviathanGraveyard).toBe(false);
  });

  it("completes the authoritative Moonseed-to-Eclipse Court chain", () => {
    const expedition = createDefaultExpeditionProgress();
    expedition.completionMarks.primaryObjective = true;
    const chapterOne = canonicalizeExpeditionProgress(expedition);
    let realms = grantKelpCathedralStoryAccess(createDefaultRealmProgress());

    expect(deriveRelicAtlasUnlocks(chapterOne, realms).kelpCathedral).toBe(true);
    realms = applyKelpCathedralRun(realms, {
      runId: "qa-kelp",
      elapsedSec: 90,
      rescuedManta: true,
      relicPageFound: true,
      masteredVerbs: [],
    }).progress;
    expect(deriveRelicAtlasUnlocks(chapterOne, realms).crystalTrench).toBe(true);

    realms = applyCrystalTrenchRun(realms, {
      runId: "qa-crystal",
      elapsedSec: 100,
      completed: true,
      cleanPerformance: true,
      masteredVerbs: [],
    }).progress;
    expect(deriveRelicAtlasUnlocks(chapterOne, realms).leviathanGraveyard).toBe(true);

    realms = applyLeviathanGraveyardRun(realms, {
      runId: "qa-leviathan",
      elapsedSec: 120,
      completed: true,
      cleanPerformance: true,
      masteredVerbs: [],
    }).progress;
    const atlas = deriveRelicAtlasState(chapterOne, realms);
    expect(atlas.recoveredCount).toBe(6);
    expect(atlas.restoredDistrictCount).toBe(4);
    expect(atlas.gameComplete).toBe(true);
  });
});
