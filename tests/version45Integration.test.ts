import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applyCrystalTrenchRun,
  applyKelpCathedralRun,
  applyLeviathanGraveyardRun,
  createDefaultRealmProgress,
  isLeviathanGraveyardUnlocked,
  leviathanGraveyardProgress,
  mergeRealmProgress,
  realmObjectivePresentations,
  validateRealmProgress,
} from "../src/realms/progress.ts";
import { LEVIATHAN_GRAVEYARD_ENCOUNTER } from "../src/realms/definition.ts";

function unlockRealmThree() {
  const initial = createDefaultRealmProgress(new Date("2026-08-12T00:00:00Z"));
  const kelp = applyKelpCathedralRun(initial, {
    runId: "v45-kelp",
    elapsedSec: 61,
    rescuedManta: true,
    relicPageFound: true,
    masteredVerbs: [],
  }).progress;
  return applyCrystalTrenchRun(kelp, {
    runId: "v45-crystal",
    elapsedSec: 62,
    completed: true,
    cleanPerformance: true,
    masteredVerbs: [],
  });
}

test("V45 unlocks Heartlight War only after a Crystal Trench victory", () => {
  const locked = createDefaultRealmProgress();
  assert.equal(isLeviathanGraveyardUnlocked(locked), false);
  const crystal = unlockRealmThree();
  assert.equal(crystal.leviathanGraveyardNewlyUnlocked, true);
  assert.equal(isLeviathanGraveyardUnlocked(crystal.progress), true);
});

test("Realm 3 victory grants one covenant and idempotent objective rewards", () => {
  const unlocked = unlockRealmThree().progress;
  const record = {
    runId: "v45-heartlight-clean",
    elapsedSec: 168.4,
    completed: true,
    cleanPerformance: true,
    masteredVerbs: LEVIATHAN_GRAVEYARD_ENCOUNTER.gameplayVerbs,
  } as const;
  const first = applyLeviathanGraveyardRun(unlocked, record);
  assert.equal(first.duplicatePrevented, false);
  assert.equal(first.mooncrestCovenantNewlyAwarded, true);
  assert.deepEqual(first.award.newlyCompletedObjectives, [
    "realm-heartlight-war",
    "realm-heartlight-clean",
  ]);
  assert.equal(first.award.pearls, 200);
  assert.equal(first.award.xp, 145);
  assert.equal(leviathanGraveyardProgress(first.progress).mooncrestCovenant, true);

  const duplicate = applyLeviathanGraveyardRun(first.progress, record);
  assert.equal(duplicate.duplicatePrevented, true);
  assert.equal(duplicate.award.pearls, 0);
  assert.equal(leviathanGraveyardProgress(duplicate.progress).victories, 1);
});

test("V45 Realm 3 history validates and cloud merge remains monotonic", () => {
  const local = applyLeviathanGraveyardRun(unlockRealmThree().progress, {
    runId: "v45-local",
    elapsedSec: 172,
    completed: true,
    cleanPerformance: false,
    masteredVerbs: ["minion-assault", "moon-seal"],
  }).progress;
  const remote = applyLeviathanGraveyardRun(unlockRealmThree().progress, {
    runId: "v45-remote",
    elapsedSec: 165,
    completed: true,
    cleanPerformance: true,
    masteredVerbs: ["current-break", "moonbone-vault"],
  }).progress;
  const merged = mergeRealmProgress(local, remote);
  const realm = leviathanGraveyardProgress(merged);
  assert.equal(validateRealmProgress(merged), true);
  assert.equal(realm.victories, 1);
  assert.equal(realm.cleanVictories, 1);
  assert.equal(realm.bestVictorySec, 165);
  assert.equal(realm.mooncrestCovenant, true);
  assert.deepEqual(realm.masteredVerbs, [
    "current-break",
    "minion-assault",
    "moon-seal",
    "moonbone-vault",
  ]);
});

test("pre-V45 schema-5 realm history remains valid and receives defaults", () => {
  const legacy = createDefaultRealmProgress();
  delete legacy.leviathanGraveyard;
  assert.equal(validateRealmProgress(legacy), true);
  assert.deepEqual(leviathanGraveyardProgress(legacy), {
    runs: 0,
    victories: 0,
    bestVictorySec: null,
    cleanVictories: 0,
    mooncrestCovenant: false,
    masteredVerbs: [],
    recentClaims: [],
  });
  const objectives = realmObjectivePresentations(legacy);
  assert.equal(objectives.length, 6);
  assert.equal(objectives.find((item) => item.id === "realm-heartlight-war")?.completed, false);
});
