export const PRODUCTION_POLICY_VERSION = 1 as const;

export const DATA_RETENTION_DAYS = Object.freeze({
  telemetry: 90,
  dailyLeaderboard: 90,
  globalLeaderboard: 365,
  sharedClip: 30,
  rewardedClaim: 90,
  rateLimit: 1
});

export const RATE_LIMIT_POLICIES = Object.freeze({
  telemetryWrite: { limit: 20, windowMs: 60_000 },
  saveWrite: { limit: 20, windowMs: 60_000 },
  leaderboardRead: { limit: 60, windowMs: 60_000 },
  leaderboardSubmit: { limit: 6, windowMs: 60_000 },
  sharePublish: { limit: 4, windowMs: 10 * 60_000 },
  rewardedClaim: { limit: 3, windowMs: 60 * 60_000 },
  operationsRead: { limit: 30, windowMs: 60_000 }
});

export const FUNNEL_STEPS = [
  "session_start",
  "run_end",
  "reward_granted",
  "cosmetic_unlock",
  "cosmetic_equip",
  "daily_trial_complete",
  "retention_return"
] as const;

export type FunnelStep = typeof FUNNEL_STEPS[number];

export const HEALTH_SIGNALS = [
  "startup_failure",
  "webgl_context_lost",
  "webgl_context_recovery_failed",
  "save_recovered",
  "cloud_sync_conflict",
  "cloud_sync_failure",
  "leaderboard_rejected",
  "service_error",
  "rate_limited"
] as const;

export type HealthSignal = typeof HEALTH_SIGNALS[number];

export interface HealthSignalCounts {
  sessions: number;
  startupFailures: number;
  contextLosses: number;
  contextRecoveryFailures: number;
  saveRecoveries: number;
  cloudSyncAttempts: number;
  cloudSyncConflicts: number;
  cloudSyncFailures: number;
  leaderboardSubmissions: number;
  leaderboardRejections: number;
  serviceRequests: number;
  serviceErrors: number;
}

export interface HealthAlert {
  signal: HealthSignal;
  severity: "warning" | "critical";
  observed: number;
  threshold: number;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.max(0, numerator) / denominator : 0;
}

/** Stable alert policy shared by the release tests and hosted dashboard. */
export function evaluateProductionHealth(value: HealthSignalCounts): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const checks: Array<{
    signal: HealthSignal;
    severity: HealthAlert["severity"];
    observed: number;
    threshold: number;
  }> = [
    {
      signal: "startup_failure",
      severity: "critical",
      observed: ratio(value.startupFailures, value.sessions),
      threshold: 0.03
    },
    {
      signal: "webgl_context_recovery_failed",
      severity: "critical",
      observed: ratio(value.contextRecoveryFailures, value.contextLosses),
      threshold: 0.01
    },
    {
      signal: "save_recovered",
      severity: "warning",
      observed: ratio(value.saveRecoveries, value.sessions),
      threshold: 0.02
    },
    {
      signal: "cloud_sync_conflict",
      severity: "warning",
      observed: ratio(value.cloudSyncConflicts, value.cloudSyncAttempts),
      threshold: 0.05
    },
    {
      signal: "cloud_sync_failure",
      severity: "critical",
      observed: ratio(value.cloudSyncFailures, value.cloudSyncAttempts),
      threshold: 0.05
    },
    {
      signal: "leaderboard_rejected",
      severity: "warning",
      observed: ratio(value.leaderboardRejections, value.leaderboardSubmissions),
      threshold: 0.1
    },
    {
      signal: "service_error",
      severity: "critical",
      observed: ratio(value.serviceErrors, value.serviceRequests),
      threshold: 0.03
    }
  ];
  for (const check of checks) {
    if (check.observed > check.threshold) alerts.push(check);
  }
  return alerts;
}

export interface SealedReleaseManifest {
  schemaVersion: number;
  version: number;
  phase: string;
  certification: string;
  environment: "local" | "staging" | "production";
  sourceCommit: string;
  baselineVersion: number;
  baselineCommit: string;
  artBuild: string;
  productionPolicyVersion: typeof PRODUCTION_POLICY_VERSION;
  sealSchemaVersion: 1;
  artifactDigest: string;
  artifactFileCount: number;
}

export function shouldVerifyHostedReleaseManifest(
  environment: SealedReleaseManifest["environment"],
  hostname: string
): boolean {
  if (environment === "local") return false;
  const normalized = hostname.trim().toLowerCase();
  return normalized !== "localhost" &&
    normalized !== "127.0.0.1" &&
    normalized !== "::1" &&
    normalized !== "[::1]";
}

export function isSealedReleaseManifest(value: unknown): value is SealedReleaseManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<SealedReleaseManifest>;
  return (
    Number.isInteger(manifest.schemaVersion) && Number(manifest.schemaVersion) >= 1 &&
    Number.isInteger(manifest.version) && Number(manifest.version) >= 35 &&
    typeof manifest.phase === "string" && /^phase-[0-9a-z-]{2,24}$/.test(manifest.phase) &&
    typeof manifest.certification === "string" && /^[a-z0-9-]{3,48}$/.test(manifest.certification) &&
    (manifest.environment === "local" || manifest.environment === "staging" || manifest.environment === "production") &&
    typeof manifest.sourceCommit === "string" &&
    (manifest.environment === "local"
      ? manifest.sourceCommit === "local" || /^[0-9a-f]{40}$/.test(manifest.sourceCommit)
      : /^[0-9a-f]{40}$/.test(manifest.sourceCommit)) &&
    Number.isInteger(manifest.baselineVersion) && Number(manifest.baselineVersion) === Number(manifest.version) - 1 &&
    typeof manifest.baselineCommit === "string" && /^[0-9a-f]{40}$/.test(manifest.baselineCommit) &&
    typeof manifest.artBuild === "string" && manifest.artBuild.length >= 8 && manifest.artBuild.length <= 80 &&
    manifest.productionPolicyVersion === PRODUCTION_POLICY_VERSION &&
    manifest.sealSchemaVersion === 1 &&
    typeof manifest.artifactDigest === "string" && /^[0-9a-f]{64}$/.test(manifest.artifactDigest) &&
    Number.isInteger(manifest.artifactFileCount) && Number(manifest.artifactFileCount) >= 1
  );
}

export interface RollbackDecision {
  allowed: boolean;
  reason: string;
  targetCommit: string | null;
}

export function planRollback(
  current: SealedReleaseManifest,
  previous: SealedReleaseManifest
): RollbackDecision {
  if (!isSealedReleaseManifest(current) || !isSealedReleaseManifest(previous)) {
    return { allowed: false, reason: "invalid-manifest", targetCommit: null };
  }
  if (
    current.baselineVersion !== previous.version ||
    current.baselineCommit !== previous.sourceCommit ||
    current.sourceCommit === previous.sourceCommit ||
    current.artifactDigest === previous.artifactDigest
  ) {
    return { allowed: false, reason: "baseline-mismatch", targetCommit: null };
  }
  return {
    allowed: true,
    reason: "previous-known-good",
    targetCommit: previous.sourceCommit
  };
}
