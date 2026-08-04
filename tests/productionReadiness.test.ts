import { describe, expect, it } from "vitest";
import {
  DATA_RETENTION_DAYS,
  FUNNEL_STEPS,
  RATE_LIMIT_POLICIES,
  evaluateProductionHealth,
  isSealedReleaseManifest,
  planRollback,
  shouldUseHostedServices,
  type HealthSignalCounts,
  type SealedReleaseManifest
} from "../src/operations/productionReadiness";

function manifest(
  version: number,
  sourceCommit: string,
  baselineCommit: string,
  artifactDigest: string
): SealedReleaseManifest {
  return {
    schemaVersion: 1,
    version,
    phase: version === 36 ? "phase-5b" : "phase-5a",
    certification: "production-readiness-candidate",
    environment: "staging",
    sourceCommit,
    baselineVersion: version - 1,
    baselineCommit,
    artBuild: "phase3c-v30-glowfin-production",
    productionPolicyVersion: 1,
    sealSchemaVersion: 1,
    artifactDigest,
    artifactFileCount: 18
  };
}

const healthy: HealthSignalCounts = {
  sessions: 1_000,
  startupFailures: 1,
  contextLosses: 20,
  contextRecoveryFailures: 0,
  saveRecoveries: 2,
  cloudSyncAttempts: 500,
  cloudSyncConflicts: 2,
  cloudSyncFailures: 1,
  leaderboardSubmissions: 200,
  leaderboardRejections: 4,
  serviceRequests: 2_000,
  serviceErrors: 3
};

describe("Version 36 production-readiness policy", () => {
  it("runs hosted manifest checks off loopback without polluting browser gates", () => {
    expect(shouldUseHostedServices("staging", "glowfin.example")).toBe(true);
    expect(shouldUseHostedServices("production", "glowfin.example")).toBe(true);
    expect(shouldUseHostedServices("staging", "127.0.0.1")).toBe(false);
    expect(shouldUseHostedServices("staging", "localhost")).toBe(false);
    expect(shouldUseHostedServices("local", "glowfin.example")).toBe(false);
  });

  it("keeps retention, rate limits and funnel fields explicit and bounded", () => {
    expect(DATA_RETENTION_DAYS).toEqual({
      telemetry: 90,
      dailyLeaderboard: 90,
      globalLeaderboard: 365,
      sharedClip: 30,
      rewardedClaim: 90,
      rateLimit: 1
    });
    expect(FUNNEL_STEPS).toEqual([
      "session_start",
      "hub_view",
      "tap_to_dive",
      "tutorial_complete",
      "run_end",
      "reward_granted",
      "cosmetic_unlock",
      "cosmetic_purchase",
      "cosmetic_equip",
      "daily_entry",
      "daily_trial_complete",
      "retention_return"
    ]);
    for (const policy of Object.values(RATE_LIMIT_POLICIES)) {
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowMs).toBeGreaterThanOrEqual(60_000);
      expect(policy.windowMs).toBeLessThanOrEqual(60 * 60_000);
    }
  });

  it("stays quiet for a healthy window and raises deterministic threshold alerts", () => {
    expect(evaluateProductionHealth(healthy)).toEqual([]);
    const alerts = evaluateProductionHealth({
      ...healthy,
      startupFailures: 40,
      contextRecoveryFailures: 2,
      cloudSyncFailures: 30,
      serviceErrors: 100
    });
    expect(alerts.map((alert) => alert.signal)).toEqual([
      "startup_failure",
      "webgl_context_recovery_failed",
      "cloud_sync_failure",
      "service_error"
    ]);
  });

  it("accepts only sealed, source-pinned manifests and a matching rollback target", () => {
    const previousCommit = "2fca087dbec1b24b48c8398c7c24f0abea5c0454";
    const currentCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const previous = manifest(
      35,
      previousCommit,
      "76667c42e4a7a36d0b051a31b1bddb3caaacd9cb",
      "b".repeat(64)
    );
    const current = manifest(36, currentCommit, previousCommit, "a".repeat(64));
    expect(isSealedReleaseManifest(current)).toBe(true);
    expect(planRollback(current, previous)).toEqual({
      allowed: true,
      reason: "previous-known-good",
      targetCommit: previousCommit
    });
    expect(planRollback(current, {
      ...previous,
      sourceCommit: "cccccccccccccccccccccccccccccccccccccccc"
    })).toMatchObject({ allowed: false, reason: "baseline-mismatch" });
  });

  it("rejects every one-field manifest corruption in a deterministic fuzz matrix", () => {
    const valid = manifest(
      36,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "2fca087dbec1b24b48c8398c7c24f0abea5c0454",
      "b".repeat(64)
    );
    const corruptions: Array<[keyof SealedReleaseManifest, unknown]> = [
      ["version", 34],
      ["phase", "../phase"],
      ["environment", "preview"],
      ["sourceCommit", "latest"],
      ["baselineVersion", 32],
      ["baselineCommit", "deadbeef"],
      ["productionPolicyVersion", 2],
      ["sealSchemaVersion", 2],
      ["artifactDigest", "0".repeat(63)],
      ["artifactFileCount", 0]
    ];
    for (const [key, value] of corruptions) {
      expect(isSealedReleaseManifest({ ...valid, [key]: value }), key).toBe(false);
    }
  });
});
