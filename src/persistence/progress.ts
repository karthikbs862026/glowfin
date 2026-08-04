import {
  type GlowfinReplayV1,
  type ReplaySummary,
  validateReplay
} from "../replay/replay";
import {
  applyObjectiveRun,
  completeDailyTrial,
  createDefaultDailyRetention,
  dailySeed,
  dayNumber,
  isDayId,
  mergeDailyRetention,
  recordDailyReplay,
  resolveDailyDay,
  rotatingObjectives,
  summarizeStreak,
  type DailyObjectiveDefinition,
  type DailyRetentionState,
  type GlowfinRunMode,
  type StreakSummary
} from "../meta/daily";
import {
  DEFAULT_COSMETIC_LOADOUT,
  calculateRunPearlReward,
  cosmeticDefinition,
  newlyUnlockedCosmetics,
  nextCosmeticInCategory,
  sanitizeCosmeticLoadout,
  tideLevelForXp,
  type CosmeticCategory,
  type CosmeticDefinition,
  type CosmeticLoadout,
  type RunPearlReward
} from "../meta/progression";

export const PROGRESS_SCHEMA_VERSION = 2 as const;
export const PROGRESS_PRIMARY_KEY = "glowfin.progress.v2.primary";
export const PROGRESS_BACKUP_KEY = "glowfin.progress.v2.backup";
export const VERSION_1_PRIMARY_KEY = "glowfin.progress.v1.primary";
export const VERSION_1_BACKUP_KEY = "glowfin.progress.v1.backup";
export const LEGACY_BEST_SCORE_KEY = "glowfin.best-score";
export const MAX_PROGRESS_BYTES = 160 * 1024;
export const MAX_RECENT_REWARD_CLAIMS = 128;

export type TelemetryConsent = "unset" | "granted" | "denied";

export interface GlowfinProgressionV2 {
  lumenPearls: number;
  tideXp: number;
  equippedCosmetics: CosmeticLoadout;
  recentRewardClaims: string[];
}

export interface GlowfinProgressV2 {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  bestScore: number;
  bestReplay: GlowfinReplayV1 | null;
  totals: {
    runs: number;
    playSeconds: number;
    nearMisses: number;
    collisions: number;
  };
  telemetryConsent: TelemetryConsent;
  ghostEnabled: boolean;
  progression: GlowfinProgressionV2;
  daily: DailyRetentionState;
}

interface GlowfinProgressV1Legacy {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  bestScore: number;
  bestReplay: GlowfinReplayV1 | null;
  totals: GlowfinProgressV2["totals"];
  telemetryConsent: TelemetryConsent;
  ghostEnabled: boolean;
}

interface ProgressEnvelopeV2 {
  envelopeVersion: 2;
  payload: GlowfinProgressV2;
  checksum: string;
}

interface LegacyProgressEnvelopeV1 {
  envelopeVersion: 1;
  payload: GlowfinProgressV1Legacy;
  checksum: string;
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface ProgressLoadResult {
  progress: GlowfinProgressV2;
  recoveredFrom: "primary" | "backup" | "version-1" | "legacy" | "default";
  recoveryReason: string | null;
}

export interface ProgressRunContext {
  runId?: string;
  mode?: GlowfinRunMode;
  dayId?: string;
  calendarRewardsAllowed?: boolean;
}

export interface ObjectiveRunPresentation extends DailyObjectiveDefinition {
  progress: number;
  completed: boolean;
}

export interface RetentionRunResult {
  runReward: RunPearlReward;
  runRewardClaimed: boolean;
  duplicateRewardPrevented: boolean;
  objectiveRewardPearls: number;
  dailyRewardPearls: number;
  totalPearls: number;
  tideLevelBefore: number;
  tideLevelAfter: number;
  unlockedCosmetics: CosmeticDefinition[];
  objectives: ObjectiveRunPresentation[];
  completedObjectives: DailyObjectiveDefinition[];
  dailyAwarded: boolean;
  calendarRewardRejected: boolean;
  streak: StreakSummary;
}

export interface RunRecordResult {
  progress: GlowfinProgressV2;
  newBest: boolean;
  replaySaved: boolean;
  retention: RetentionRunResult;
}

export interface SessionObservation {
  progress: GlowfinProgressV2;
  dayId: string;
  daysSincePrevious: number | null;
  nextDayReturn: boolean;
  clockRollback: boolean;
}

function clampCount(value: number): number {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function safeIsoDate(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function progressChecksum(progress: GlowfinProgressV2): string {
  return checksumText(JSON.stringify(progress));
}

function legacyProgressChecksum(progress: GlowfinProgressV1Legacy): string {
  return checksumText(JSON.stringify(progress));
}

function cloneProgress(progress: GlowfinProgressV2): GlowfinProgressV2 {
  return JSON.parse(JSON.stringify(progress)) as GlowfinProgressV2;
}

function cloneReplay(replay: GlowfinReplayV1 | null): GlowfinReplayV1 | null {
  return replay ? JSON.parse(JSON.stringify(replay)) as GlowfinReplayV1 : null;
}

function consentValid(value: unknown): value is TelemetryConsent {
  return value === "unset" || value === "granted" || value === "denied";
}

function totalsValid(value: unknown): value is GlowfinProgressV2["totals"] {
  if (!value || typeof value !== "object") return false;
  const totals = value as Partial<GlowfinProgressV2["totals"]>;
  return (
    Number.isInteger(totals.runs) && Number(totals.runs) >= 0 &&
    typeof totals.playSeconds === "number" && Number.isFinite(totals.playSeconds) && totals.playSeconds >= 0 &&
    Number.isInteger(totals.nearMisses) && Number(totals.nearMisses) >= 0 &&
    Number.isInteger(totals.collisions) && Number(totals.collisions) >= 0
  );
}

function dailyValid(value: unknown): value is DailyRetentionState {
  if (!value || typeof value !== "object") return false;
  const daily = value as Partial<DailyRetentionState>;
  const dayOrNull = (day: unknown) => day === null || isDayId(day);
  if (
    !dayOrNull(daily.trustedDay) ||
    !dayOrNull(daily.lastSessionDay) ||
    !Array.isArray(daily.dailyClaims) || daily.dailyClaims.length > 400 ||
    !daily.dailyClaims.every(isDayId) ||
    new Set(daily.dailyClaims).size !== daily.dailyClaims.length ||
    !Array.isArray(daily.objectiveClaims) || daily.objectiveClaims.length > 512 ||
    !daily.objectiveClaims.every((id) => typeof id === "string" && id.length <= 120) ||
    !daily.objectiveProgress || typeof daily.objectiveProgress !== "object" ||
    Array.isArray(daily.objectiveProgress) ||
    Object.keys(daily.objectiveProgress).length > 64 ||
    !Object.entries(daily.objectiveProgress).every(([id, progress]) => (
      id.length <= 120 && typeof progress === "number" && Number.isFinite(progress) && progress >= 0
    )) ||
    !Number.isInteger(daily.bestStreak) || Number(daily.bestStreak) < 0
  ) {
    return false;
  }
  if (daily.bestDailyReplay !== null) {
    const record = daily.bestDailyReplay;
    if (
      !record || typeof record !== "object" || !isDayId(record.dayId) ||
      typeof record.score !== "number" || !Number.isFinite(record.score) || record.score < 0 ||
      !validateReplay(record.replay).valid ||
      record.replay.seed !== dailySeed(record.dayId) ||
      Math.abs(record.score - record.replay.summary.score) > 1e-6
    ) {
      return false;
    }
  }
  return true;
}

function progressionValid(value: unknown): value is GlowfinProgressionV2 {
  if (!value || typeof value !== "object") return false;
  const progression = value as Partial<GlowfinProgressionV2>;
  if (
    !Number.isInteger(progression.lumenPearls) || Number(progression.lumenPearls) < 0 ||
    !Number.isInteger(progression.tideXp) || Number(progression.tideXp) < 0 ||
    !Array.isArray(progression.recentRewardClaims) ||
    progression.recentRewardClaims.length > MAX_RECENT_REWARD_CLAIMS ||
    !progression.recentRewardClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) ||
    new Set(progression.recentRewardClaims).size !== progression.recentRewardClaims.length
  ) {
    return false;
  }
  const sanitized = sanitizeCosmeticLoadout(
    progression.equippedCosmetics,
    Number(progression.tideXp)
  );
  return JSON.stringify(sanitized) === JSON.stringify(progression.equippedCosmetics);
}

function validateLegacyProgress(value: unknown): value is GlowfinProgressV1Legacy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinProgressV1Legacy>;
  const replayValid = candidate.bestReplay === null || validateReplay(candidate.bestReplay).valid;
  return (
    candidate.schemaVersion === 1 &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    safeIsoDate(candidate.updatedAt ?? "") &&
    typeof candidate.bestScore === "number" && Number.isFinite(candidate.bestScore) && candidate.bestScore >= 0 &&
    replayValid &&
    totalsValid(candidate.totals) &&
    consentValid(candidate.telemetryConsent) &&
    typeof candidate.ghostEnabled === "boolean" &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
}

export function createDefaultProgress(now = new Date()): GlowfinProgressV2 {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now.toISOString(),
    bestScore: 0,
    bestReplay: null,
    totals: {
      runs: 0,
      playSeconds: 0,
      nearMisses: 0,
      collisions: 0
    },
    telemetryConsent: "unset",
    ghostEnabled: true,
    progression: {
      lumenPearls: 0,
      tideXp: 0,
      equippedCosmetics: { ...DEFAULT_COSMETIC_LOADOUT },
      recentRewardClaims: []
    },
    daily: createDefaultDailyRetention()
  };
}

export function migrateLegacyProgress(
  legacy: GlowfinProgressV1Legacy,
  now = new Date()
): GlowfinProgressV2 {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    revision: legacy.revision + 1,
    updatedAt: now.toISOString(),
    bestScore: legacy.bestScore,
    bestReplay: cloneReplay(legacy.bestReplay),
    totals: { ...legacy.totals },
    telemetryConsent: legacy.telemetryConsent,
    ghostEnabled: legacy.ghostEnabled,
    progression: {
      lumenPearls: 0,
      tideXp: 0,
      equippedCosmetics: { ...DEFAULT_COSMETIC_LOADOUT },
      recentRewardClaims: []
    },
    daily: createDefaultDailyRetention()
  };
}

export function validateProgress(value: unknown): value is GlowfinProgressV2 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinProgressV2>;
  const replayValid = candidate.bestReplay === null || validateReplay(candidate.bestReplay).valid;
  return (
    candidate.schemaVersion === PROGRESS_SCHEMA_VERSION &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    safeIsoDate(candidate.updatedAt ?? "") &&
    typeof candidate.bestScore === "number" && Number.isFinite(candidate.bestScore) && candidate.bestScore >= 0 &&
    replayValid &&
    totalsValid(candidate.totals) &&
    consentValid(candidate.telemetryConsent) &&
    typeof candidate.ghostEnabled === "boolean" &&
    progressionValid(candidate.progression) &&
    dailyValid(candidate.daily) &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
}

export function migrateProgressValue(
  value: unknown,
  now = new Date()
): GlowfinProgressV2 | null {
  if (validateProgress(value)) return cloneProgress(value);
  if (validateLegacyProgress(value)) return migrateLegacyProgress(value, now);
  return null;
}

function encodeEnvelope(progress: GlowfinProgressV2): string {
  const envelope: ProgressEnvelopeV2 = {
    envelopeVersion: 2,
    payload: progress,
    checksum: progressChecksum(progress)
  };
  const encoded = JSON.stringify(envelope);
  if (encoded.length > MAX_PROGRESS_BYTES) {
    throw new Error(`Glowfin progress exceeds ${MAX_PROGRESS_BYTES} bytes.`);
  }
  return encoded;
}

function decodeEnvelope(encoded: string): GlowfinProgressV2 | null {
  if (encoded.length < 2 || encoded.length > MAX_PROGRESS_BYTES) return null;
  try {
    const value = JSON.parse(encoded) as Partial<ProgressEnvelopeV2>;
    if (
      value.envelopeVersion !== 2 ||
      typeof value.checksum !== "string" ||
      !validateProgress(value.payload) ||
      progressChecksum(value.payload) !== value.checksum
    ) {
      return null;
    }
    return value.payload;
  } catch {
    return null;
  }
}

function decodeLegacyEnvelope(encoded: string, now: Date): GlowfinProgressV2 | null {
  if (encoded.length < 2 || encoded.length > MAX_PROGRESS_BYTES) return null;
  try {
    const value = JSON.parse(encoded) as Partial<LegacyProgressEnvelopeV1>;
    if (
      value.envelopeVersion !== 1 ||
      typeof value.checksum !== "string" ||
      !validateLegacyProgress(value.payload) ||
      legacyProgressChecksum(value.payload) !== value.checksum
    ) {
      return null;
    }
    return migrateLegacyProgress(value.payload, now);
  } catch {
    return null;
  }
}

function mergeRewardClaims(local: readonly string[], remote: readonly string[]): string[] {
  return Array.from(new Set([...local, ...remote])).sort().slice(-MAX_RECENT_REWARD_CLAIMS);
}

export function mergeProgress(
  local: GlowfinProgressV2,
  remote: GlowfinProgressV2,
  now = new Date()
): GlowfinProgressV2 {
  const bestReplay = [local.bestReplay, remote.bestReplay]
    .filter((replay): replay is GlowfinReplayV1 => replay !== null)
    .sort((a, b) => b.summary.score - a.summary.score)[0] ?? null;
  const consent = local.telemetryConsent !== "unset"
    ? local.telemetryConsent
    : remote.telemetryConsent;
  const tideXp = Math.max(local.progression.tideXp, remote.progression.tideXp);
  const preferredLoadout = local.revision >= remote.revision
    ? local.progression.equippedCosmetics
    : remote.progression.equippedCosmetics;
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    bestScore: Math.max(local.bestScore, remote.bestScore),
    bestReplay: cloneReplay(bestReplay),
    totals: {
      // Max is deliberately idempotent. It cannot double-count when the same
      // cloud snapshot is merged repeatedly after an interrupted save.
      runs: Math.max(local.totals.runs, remote.totals.runs),
      playSeconds: Math.max(local.totals.playSeconds, remote.totals.playSeconds),
      nearMisses: Math.max(local.totals.nearMisses, remote.totals.nearMisses),
      collisions: Math.max(local.totals.collisions, remote.totals.collisions)
    },
    telemetryConsent: consent,
    ghostEnabled: local.ghostEnabled,
    progression: {
      lumenPearls: Math.max(
        local.progression.lumenPearls,
        remote.progression.lumenPearls
      ),
      tideXp,
      equippedCosmetics: sanitizeCosmeticLoadout(preferredLoadout, tideXp),
      recentRewardClaims: mergeRewardClaims(
        local.progression.recentRewardClaims,
        remote.progression.recentRewardClaims
      )
    },
    daily: mergeDailyRetention(local.daily, remote.daily)
  };
}

function safeClaimId(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 112);
  return clean || "unknown";
}

function runRewardClaimId(
  context: ProgressRunContext,
  replay: GlowfinReplayV1 | null,
  summary: ReplaySummary
): string {
  if (context.runId) return `run:${safeClaimId(context.runId)}`;
  if (replay) return `replay:${replay.seed.toString(16)}:${replay.checksum}`;
  return `summary:${Math.floor(summary.score)}:${Math.floor(summary.forwardDistance)}:${Math.floor(summary.elapsedSec)}`;
}

export class ProgressRepository {
  private current = createDefaultProgress();

  constructor(
    private readonly storage: ProgressStorage,
    private readonly now: () => Date = () => new Date()
  ) {}

  load(): ProgressLoadResult {
    let primaryRaw: string | null = null;
    let backupRaw: string | null = null;
    try {
      primaryRaw = this.storage.getItem(PROGRESS_PRIMARY_KEY);
      backupRaw = this.storage.getItem(PROGRESS_BACKUP_KEY);
    } catch {
      this.current = createDefaultProgress(this.now());
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "default",
        recoveryReason: "storage-unavailable"
      };
    }

    const primary = primaryRaw ? decodeEnvelope(primaryRaw) : null;
    if (primary) {
      this.current = primary;
      return { progress: cloneProgress(primary), recoveredFrom: "primary", recoveryReason: null };
    }

    const backup = backupRaw ? decodeEnvelope(backupRaw) : null;
    if (backup) {
      this.current = backup;
      try {
        this.storage.setItem(PROGRESS_PRIMARY_KEY, encodeEnvelope(backup));
      } catch {
        // In-memory recovery remains valid when storage is temporarily denied.
      }
      return {
        progress: cloneProgress(backup),
        recoveredFrom: "backup",
        recoveryReason: primaryRaw ? "primary-corrupt" : "primary-missing"
      };
    }

    const version1 = this.readVersion1();
    if (version1) {
      this.current = version1;
      this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "version-1",
        recoveryReason: "migrated-version-1"
      };
    }

    const legacy = this.readLegacyBestScore();
    this.current = createDefaultProgress(this.now());
    if (legacy !== null) {
      this.current.bestScore = legacy;
      this.current.revision = 1;
      this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "legacy",
        recoveryReason: "migrated-best-score"
      };
    }

    this.persist(this.current);
    return {
      progress: cloneProgress(this.current),
      recoveredFrom: "default",
      recoveryReason: primaryRaw || backupRaw ? "all-copies-invalid" : null
    };
  }

  snapshot(): GlowfinProgressV2 {
    return cloneProgress(this.current);
  }

  recordRun(
    summary: ReplaySummary,
    replay: GlowfinReplayV1 | null,
    context: ProgressRunContext = {}
  ): RunRecordResult {
    const validReplay = replay && validateReplay(replay).valid ? replay : null;
    const newBest = summary.score > this.current.bestScore;
    const mode = context.mode ?? "fresh";
    const resolvedDay = resolveDailyDay(
      this.now(),
      this.current.daily.trustedDay
    );
    const dayId = isDayId(context.dayId) ? context.dayId : resolvedDay.dayId;
    const monotonicCalendar = (
      resolvedDay.status !== "clock-rollback" &&
      (!isDayId(this.current.daily.trustedDay) || dayNumber(dayId) >= dayNumber(this.current.daily.trustedDay))
    );
    const calendarRewardsAllowed = (context.calendarRewardsAllowed ?? true) && monotonicCalendar;
    const claimId = runRewardClaimId(context, validReplay, summary);
    const claims = new Set(this.current.progression.recentRewardClaims);
    const runRewardClaimed = !claims.has(claimId);
    if (runRewardClaimed) claims.add(claimId);
    const runReward = calculateRunPearlReward(summary);

    let daily = this.current.daily;
    let dailyRewardPearls = 0;
    let dailyRewardXp = 0;
    let dailyAwarded = false;
    let calendarRewardRejected = !calendarRewardsAllowed;
    let streak = summarizeStreak(daily.dailyClaims, daily.bestStreak);
    if (mode === "daily" || mode === "daily-ghost") {
      const completion = completeDailyTrial(daily, dayId, calendarRewardsAllowed);
      daily = completion.state;
      dailyRewardPearls = completion.rewardPearls;
      dailyRewardXp = completion.rewardXp;
      dailyAwarded = completion.awarded;
      calendarRewardRejected = completion.rejectedForClockRollback;
      streak = completion.streak;
      daily = recordDailyReplay(daily, dayId, validReplay);
    }

    const objectiveUpdate = applyObjectiveRun(
      daily,
      dayId,
      summary,
      mode,
      calendarRewardsAllowed
    );
    daily = objectiveUpdate.state;
    const awardedRunPearls = runRewardClaimed ? runReward.pearls : 0;
    const awardedRunXp = runRewardClaimed ? runReward.xp : 0;
    const totalPearls = awardedRunPearls + objectiveUpdate.rewardPearls + dailyRewardPearls;
    const totalXp = awardedRunXp + objectiveUpdate.rewardXp + dailyRewardXp;
    const previousXp = this.current.progression.tideXp;
    const nextXp = clampCount(previousXp + totalXp);
    const nextPearls = clampCount(this.current.progression.lumenPearls + totalPearls);
    const unlockedCosmetics = newlyUnlockedCosmetics(previousXp, nextXp);

    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      bestScore: newBest ? summary.score : this.current.bestScore,
      bestReplay: newBest && validReplay ? validReplay : this.current.bestReplay,
      totals: {
        runs: clampCount(this.current.totals.runs + 1),
        playSeconds: Math.max(0, this.current.totals.playSeconds + summary.elapsedSec),
        nearMisses: clampCount(this.current.totals.nearMisses + summary.nearMisses),
        collisions: clampCount(this.current.totals.collisions + summary.collisions)
      },
      progression: {
        lumenPearls: nextPearls,
        tideXp: nextXp,
        equippedCosmetics: sanitizeCosmeticLoadout(
          this.current.progression.equippedCosmetics,
          nextXp
        ),
        recentRewardClaims: Array.from(claims).sort().slice(-MAX_RECENT_REWARD_CLAIMS)
      },
      daily
    };
    this.persist(this.current);
    return {
      progress: cloneProgress(this.current),
      newBest,
      replaySaved: newBest && Boolean(validReplay),
      retention: {
        runReward,
        runRewardClaimed,
        duplicateRewardPrevented: !runRewardClaimed,
        objectiveRewardPearls: objectiveUpdate.rewardPearls,
        dailyRewardPearls,
        totalPearls,
        tideLevelBefore: tideLevelForXp(previousXp),
        tideLevelAfter: tideLevelForXp(nextXp),
        unlockedCosmetics,
        objectives: objectiveUpdate.objectives,
        completedObjectives: objectiveUpdate.newlyCompleted,
        dailyAwarded,
        calendarRewardRejected,
        streak
      }
    };
  }

  observeSession(dayId: string): SessionObservation {
    const previous = this.current.daily.lastSessionDay;
    const trusted = this.current.daily.trustedDay;
    const rollback = !isDayId(dayId) || (
      isDayId(trusted) && dayNumber(dayId) < dayNumber(trusted)
    );
    const daysSincePrevious = isDayId(previous) && isDayId(dayId)
      ? dayNumber(dayId) - dayNumber(previous)
      : null;
    if (!rollback && isDayId(dayId)) {
      this.current = {
        ...this.current,
        revision: this.current.revision + 1,
        updatedAt: this.now().toISOString(),
        daily: {
          ...this.current.daily,
          trustedDay: !isDayId(trusted) || dayNumber(dayId) > dayNumber(trusted) ? dayId : trusted,
          lastSessionDay: !isDayId(previous) || dayNumber(dayId) >= dayNumber(previous) ? dayId : previous
        }
      };
      this.persist(this.current);
    }
    return {
      progress: cloneProgress(this.current),
      dayId: isDayId(dayId) ? dayId : resolveDailyDay(this.now(), trusted).dayId,
      daysSincePrevious,
      nextDayReturn: daysSincePrevious === 1,
      clockRollback: rollback
    };
  }

  trustCalendarDay(dayId: string, authoritative = false): GlowfinProgressV2 {
    if (!isDayId(dayId)) return this.snapshot();
    const trusted = this.current.daily.trustedDay;
    if (
      !authoritative &&
      isDayId(trusted) &&
      dayNumber(dayId) < dayNumber(trusted)
    ) return this.snapshot();
    const lastSessionDay = this.current.daily.lastSessionDay;
    const correctedSessionDay = authoritative && isDayId(lastSessionDay) &&
      dayNumber(lastSessionDay) > dayNumber(dayId)
      ? dayId
      : lastSessionDay;
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      daily: {
        ...this.current.daily,
        trustedDay: dayId,
        lastSessionDay: correctedSessionDay
      }
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  cycleCosmetic(category: CosmeticCategory): GlowfinProgressV2 {
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      progression: {
        ...this.current.progression,
        equippedCosmetics: nextCosmeticInCategory(
          this.current.progression.equippedCosmetics,
          category,
          this.current.progression.tideXp
        )
      }
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  activeObjectives(dayId: string): ObjectiveRunPresentation[] {
    const claimed = new Set(this.current.daily.objectiveClaims);
    return rotatingObjectives(dayId).map((objective) => ({
      ...objective,
      progress: Math.min(objective.target, this.current.daily.objectiveProgress[objective.id] ?? 0),
      completed: claimed.has(objective.id)
    }));
  }

  setTelemetryConsent(consent: TelemetryConsent): GlowfinProgressV2 {
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      telemetryConsent: consent
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  setGhostEnabled(enabled: boolean): GlowfinProgressV2 {
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      ghostEnabled: enabled
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  replaceWithMerged(remote: GlowfinProgressV2): GlowfinProgressV2 {
    if (!validateProgress(remote)) return this.snapshot();
    this.current = mergeProgress(this.current, remote, this.now());
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  private persist(progress: GlowfinProgressV2): void {
    try {
      const encoded = encodeEnvelope(progress);
      const existing = this.storage.getItem(PROGRESS_PRIMARY_KEY);
      if (existing) this.storage.setItem(PROGRESS_BACKUP_KEY, existing);
      this.storage.setItem(PROGRESS_PRIMARY_KEY, encoded);
    } catch {
      // Storage can be denied or exhausted on mobile private modes. Gameplay
      // remains available in-memory; a later successful write can recover.
    }
  }

  private readVersion1(): GlowfinProgressV2 | null {
    try {
      const primary = this.storage.getItem(VERSION_1_PRIMARY_KEY);
      const backup = this.storage.getItem(VERSION_1_BACKUP_KEY);
      return (
        (primary ? decodeLegacyEnvelope(primary, this.now()) : null) ??
        (backup ? decodeLegacyEnvelope(backup, this.now()) : null)
      );
    } catch {
      return null;
    }
  }

  private readLegacyBestScore(): number | null {
    try {
      const raw = this.storage.getItem(LEGACY_BEST_SCORE_KEY);
      if (raw === null) return null;
      const score = Number(raw);
      return Number.isFinite(score) && score >= 0 ? score : null;
    } catch {
      return null;
    }
  }
}

export function equippedCosmeticNames(progress: GlowfinProgressV2): Record<CosmeticCategory, string> {
  const loadout = progress.progression.equippedCosmetics;
  return {
    glow: cosmeticDefinition(loadout.glow)?.name ?? "Moon Cyan",
    fin: cosmeticDefinition(loadout.fin)?.name ?? "Tideglass",
    trail: cosmeticDefinition(loadout.trail)?.name ?? "Moonwake",
    aura: cosmeticDefinition(loadout.aura)?.name ?? "Quiet Current"
  };
}
