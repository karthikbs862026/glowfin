import { describe, expect, it } from "vitest";
import releaseConfig from "../config/release.json";
import tuning from "../config/tuning.json";
import {
  VERSION41_CONFIG,
  VERSION41_PROGRESS_BACKUP_KEY,
  VERSION41_PROGRESS_PRIMARY_KEY,
  VERSION41_RELICS,
  Version41ProgressRepository,
  auditVersion41Budgets,
  collectibleHit,
  createVersion41Plan,
  mergeVersion41Progress,
  moteLateralPosition,
  segmentAtTime,
  validateVersion41Plan,
  version41QaTimeScale,
  type Version41Progress,
  type Version41Storage
} from "../src/engagement/version41Plan";

class MemoryStorage implements Version41Storage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  corrupt(key: string): void { this.values.set(key, "{broken"); }
}

function locationLike(hostname: string, search: string): Pick<Location, "hostname" | "search"> {
  return { hostname, search };
}

describe("Version 41 deterministic Living Current plan", () => {
  it("creates one replay-safe plan with an immutable content hash", () => {
    const first = createVersion41Plan();
    const second = createVersion41Plan();
    expect(first).toEqual(second);
    expect(first.planHash).toMatch(/^[0-9a-f]{8}$/);
    expect(validateVersion41Plan(first)).toEqual([]);
    expect(first.durationSec).toBe(180);
    expect(first.segments.map((segment) => segment.kind)).toEqual([
      "follow-light",
      "relic-fork",
      "rescue-miri",
      "race-neri",
      "duskmaw-chase",
      "return-moonwell"
    ]);
  });

  it("keeps a purposeful beat inside every 25-second interval and follows pressure with recovery", () => {
    const plan = createVersion41Plan();
    for (let index = 1; index < plan.purposeBeatTimesSec.length; index++) {
      const before = plan.purposeBeatTimesSec[index - 1];
      const after = plan.purposeBeatTimesSec[index];
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(Number(after) - Number(before)).toBeLessThanOrEqual(
        VERSION41_CONFIG.budgets.maxPurposeGapSec
      );
    }
    expect(segmentAtTime(plan, 0).kind).toBe("follow-light");
    expect(segmentAtTime(plan, 119).kind).toBe("duskmaw-chase");
    expect(segmentAtTime(plan, 160).kind).toBe("return-moonwell");
  });

  it("never places the flowing Lumen ribbon outside the safe lane reserve", () => {
    for (let index = 0; index < 500; index++) {
      expect(Math.abs(moteLateralPosition(index))).toBeLessThan(
        tuning.lane.halfWidth - tuning.lane.creatureRadius
      );
    }
  });

  it("uses deterministic circular pickup truth without touching the authoritative gate collider", () => {
    expect(collectibleHit(10, 1, 10.5, 1.2, 1)).toBe(true);
    expect(collectibleHit(10, 1, 12, 1, 1)).toBe(false);
    expect(collectibleHit(10, 1, 10, 1, 0)).toBe(false);
    expect(collectibleHit(Number.NaN, 1, 10, 1, 1)).toBe(false);
  });
});

describe("Version 41 performance, fairness and Version 40 audit guardrails", () => {
  it("stays inside the approved additive rendering budgets", () => {
    const evidence = {
      additionalDrawCalls: VERSION41_CONFIG.budgets.maxAdditionalDrawCalls,
      additionalTriangles: VERSION41_CONFIG.budgets.maxAdditionalTriangles,
      additionalMaterials: VERSION41_CONFIG.budgets.maxAdditionalMaterials
    };
    expect(auditVersion41Budgets(evidence)).toEqual([]);
    expect(auditVersion41Budgets({ ...evidence, additionalDrawCalls: 11 })).toContain(
      "Version 41 draw-call budget exceeded"
    );
    expect(auditVersion41Budgets({ ...evidence, additionalTriangles: 8001 })).toContain(
      "Version 41 triangle budget exceeded"
    );
    expect(auditVersion41Budgets({ ...evidence, additionalMaterials: 3 })).toContain(
      "Version 41 material budget exceeded"
    );
  });

  it("preserves the established reaction, frame-rate and unranked fairness boundaries", () => {
    expect(VERSION41_CONFIG.budgets.minReactionWindowMs).toBeGreaterThanOrEqual(
      tuning.readability.minReactionWindowMs
    );
    expect(VERSION41_CONFIG.budgets.performanceFloorFps).toBeGreaterThanOrEqual(30);
    expect(VERSION41_CONFIG.budgets.maxAdditionalMaterials).toBeLessThanOrEqual(2);
    expect(VERSION41_CONFIG.collectibles.currentBreakAheadUnits).toHaveLength(3);
    expect(VERSION41_CONFIG.race.targetSpeedUnitsPerSec).toBeGreaterThan(0);
  });

  it("does not introduce a currency, purchasable power, live ad or competitive rule", () => {
    const storage = new MemoryStorage();
    const progress = new Version41ProgressRepository(storage).load().progress;
    const fields = Object.keys(progress).join(" ").toLowerCase();
    expect(fields).not.toContain("currency");
    expect(fields).not.toContain("pearl");
    expect(fields).not.toContain("purchase");
    expect(fields).not.toContain("speedboost");
    expect(VERSION41_CONFIG.expeditionId).toBe("missing-moonseed");
    expect(releaseConfig.version).toBe(41);
    expect(releaseConfig.baselineVersion).toBe(39);
  });

  it("keeps accelerated QA timing strictly on loopback hosts", () => {
    expect(version41QaTimeScale(locationLike("127.0.0.1", "?v41qa=1"))).toBe(
      VERSION41_CONFIG.qaTimeScale
    );
    expect(version41QaTimeScale(locationLike("localhost", "?v41qa=1"))).toBe(
      VERSION41_CONFIG.qaTimeScale
    );
    expect(version41QaTimeScale(locationLike("glowfin.example", "?v41qa=1"))).toBe(1);
    expect(version41QaTimeScale(locationLike("127.0.0.1", ""))).toBe(1);
  });
});

describe("Version 41 corruption-safe relic and restoration progress", () => {
  it("records the six-item Atlas without duplicate relic or restoration claims", () => {
    const storage = new MemoryStorage();
    const repository = new Version41ProgressRepository(storage, () => "2026-08-05T00:00:00.000Z");
    let progress = repository.load().progress;
    progress = repository.recordExpedition(progress, {
      relicFound: true,
      moteChain: 16,
      raceGapUnits: 4.2,
      chaseGapUnits: 21,
      miriRescued: true
    });
    progress = repository.recordExpedition(progress, {
      relicFound: true,
      moteChain: 12,
      raceGapUnits: 2,
      chaseGapUnits: 18,
      miriRescued: true
    });

    expect(VERSION41_RELICS).toHaveLength(6);
    expect(progress.discoveredRelics).toEqual(["moonseed-fragment"]);
    expect(progress.recentClaims.filter((claim) => claim.startsWith("relic:"))).toHaveLength(1);
    expect(progress.recentClaims.filter((claim) => claim.startsWith("restoration:"))).toHaveLength(1);
    expect(progress.expeditionCompletions).toBe(2);
    expect(progress.bestMoteChain).toBe(16);
    expect(progress.miriRescued).toBe(true);
    expect(progress.moonWellRestored).toBe(true);
  });

  it("recovers from a corrupt primary copy using the bounded backup", () => {
    const storage = new MemoryStorage();
    const repository = new Version41ProgressRepository(storage, () => "2026-08-05T00:00:00.000Z");
    const saved = repository.recordExpedition(repository.load().progress, {
      relicFound: true,
      moteChain: 8,
      raceGapUnits: 1,
      chaseGapUnits: 17,
      miriRescued: true
    });
    expect(storage.getItem(VERSION41_PROGRESS_PRIMARY_KEY)).not.toBeNull();
    expect(storage.getItem(VERSION41_PROGRESS_BACKUP_KEY)).not.toBeNull();
    storage.corrupt(VERSION41_PROGRESS_PRIMARY_KEY);

    const recovered = repository.load();
    expect(recovered.recoveredFrom).toBe("backup");
    expect(recovered.recoveryReason).toBe("primary-invalid");
    expect(recovered.progress).toEqual(saved);
  });

  it("merges conflicts by set union and maxima without restoring a spendable balance", () => {
    const base: Version41Progress = {
      schemaVersion: 1,
      revision: 2,
      updatedAt: "2026-08-05T00:00:00.000Z",
      discoveredRelics: ["moonseed-fragment"],
      expeditionCompletions: 1,
      bestMoteChain: 8,
      bestRaceGapUnits: 1,
      bestChaseGapUnits: 17,
      miriRescued: true,
      moonWellRestored: true,
      recentClaims: ["relic:moonseed-fragment"]
    };
    const remote: Version41Progress = {
      ...base,
      revision: 4,
      discoveredRelics: ["tidekeeper-crest"],
      expeditionCompletions: 3,
      bestMoteChain: 14,
      bestRaceGapUnits: 5,
      recentClaims: ["restoration:missing-moonseed"]
    };
    const merged = mergeVersion41Progress(base, remote, "2026-08-05T01:00:00.000Z");
    expect(merged.revision).toBe(5);
    expect(merged.discoveredRelics).toEqual([
      "moonseed-fragment",
      "tidekeeper-crest"
    ]);
    expect(merged.expeditionCompletions).toBe(3);
    expect(merged.bestMoteChain).toBe(14);
    expect(merged.bestRaceGapUnits).toBe(5);
    expect(merged.recentClaims).toHaveLength(2);
  });
});
