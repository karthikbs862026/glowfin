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
  DEFAULT_COSMETIC_IDS,
  DEFAULT_COSMETIC_LOADOUT,
  calculateRunPearlReward,
  cosmeticDefinition,
  grandfatheredCosmeticsForXp,
  loadoutWithCosmetic,
  newlyUnlockedCosmetics,
  purchasedCosmeticCost,
  sanitizeCosmeticLoadout,
  sanitizeOwnedCosmetics,
  tideLevelForXp,
  type CosmeticCategory,
  type CosmeticDefinition,
  type CosmeticLoadout,
  type RunPearlReward
} from "../meta/progression";
import {
  applyTideSprintRace,
  createDefaultTideSprintProgress,
  mergeTideSprintProgress,
  selectTideSprintCrew as selectTideSprintCrewProgress,
  tideSprintRunClaimId,
  validateTideSprintProgress,
  type TideSprintModeAward,
  type TideSprintProgressV1,
  type TideSprintRaceRecord
} from "../tideSprint/progress";
import {
  TIDE_SPRINT_CREW_IDS,
  type TideSprintCrewId
} from "../tideSprint/crew";
import {
  applyCrystalTrenchRun,
  applyKelpCathedralRun,
  createDefaultRealmProgress,
  mergeRealmProgress,
  readLegacyRealmProgress,
  realmObjectivePresentations,
  validateRealmProgress,
  type CrystalTrenchRunRecord,
  type KelpCathedralRunRecord,
  type RealmModeAward,
  type RealmObjectivePresentation,
  type RealmProgressV1,
  type RealmRunUpdate,
} from "../realms/progress";
import type { RealmId } from "../realms/definition";

export const PROGRESS_SCHEMA_VERSION = 5 as const;
export const PROGRESS_PRIMARY_KEY = "glowfin.progress.v5.primary";
export const PROGRESS_BACKUP_KEY = "glowfin.progress.v5.backup";
export const VERSION_4_PRIMARY_KEY = "glowfin.progress.v4.primary";
export const VERSION_4_BACKUP_KEY = "glowfin.progress.v4.backup";
export const VERSION_3_PRIMARY_KEY = "glowfin.progress.v3.primary";
export const VERSION_3_BACKUP_KEY = "glowfin.progress.v3.backup";
export const VERSION_2_PRIMARY_KEY = "glowfin.progress.v2.primary";
export const VERSION_2_BACKUP_KEY = "glowfin.progress.v2.backup";
export const VERSION_1_PRIMARY_KEY = "glowfin.progress.v1.primary";
export const VERSION_1_BACKUP_KEY = "glowfin.progress.v1.backup";
export const LEGACY_BEST_SCORE_KEY = "glowfin.best-score";
export const MAX_PROGRESS_BYTES = 256 * 1024;
export const MAX_RECENT_REWARD_CLAIMS = 128;

export type TelemetryConsent = "unset" | "granted" | "denied";

export interface GlowfinProgressionV2 {
  lumenPearls: number;
  lumenPearlsEarned: number;
  tideXp: number;
  ownedCosmetics: string[];
  purchasedCosmetics: string[];
  equippedCosmetics: CosmeticLoadout;
  recentRewardClaims: string[];
}

export interface GlowfinOnboardingV1 {
  tutorialCompleted: boolean;
  firstRunCompleted: boolean;
  firstRewardSeen: boolean;
  firstPurchaseCompleted: boolean;
  firstEquipCompleted: boolean;
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
  onboarding: GlowfinOnboardingV1;
  tideSprint: TideSprintProgressV1;
  realms: RealmProgressV1;
}

type GlowfinProgressV4Legacy = Omit<
  GlowfinProgressV2,
  "schemaVersion" | "realms"
> & {
  schemaVersion: 4;
};

interface GlowfinProgressV3Legacy {
  schemaVersion: 3;
  revision: number;
  updatedAt: string;
  bestScore: number;
  bestReplay: GlowfinReplayV1 | null;
  totals: GlowfinProgressV2["totals"];
  telemetryConsent: TelemetryConsent;
  ghostEnabled: boolean;
  progression: GlowfinProgressionV2;
  daily: DailyRetentionState;
  onboarding: GlowfinOnboardingV1;
}

interface GlowfinProgressV2Legacy {
  schemaVersion: 2;
  revision: number;
  updatedAt: string;
  bestScore: number;
  bestReplay: GlowfinReplayV1 | null;
  totals: GlowfinProgressV2["totals"];
  telemetryConsent: TelemetryConsent;
  ghostEnabled: boolean;
  progression: {
    lumenPearls: number;
    tideXp: number;
    equippedCosmetics: CosmeticLoadout;
    recentRewardClaims: string[];
  };
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

interface ProgressEnvelopeV5 {
  envelopeVersion: 5;
  payload: GlowfinProgressV2;
  checksum: string;
}

interface LegacyProgressEnvelopeV4 {
  envelopeVersion: 4;
  payload: GlowfinProgressV4Legacy;
  checksum: string;
}

interface LegacyProgressEnvelopeV3 {
  envelopeVersion: 3;
  payload: GlowfinProgressV3Legacy;
  checksum: string;
}

interface LegacyProgressEnvelopeV2 {
  envelopeVersion: 2;
  payload: GlowfinProgressV2Legacy;
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
  recoveredFrom: "primary" | "backup" | "version-4" | "version-3" | "version-2" | "version-1" | "legacy" | "default";
  recoveryReason: string | null;
}

export interface ProgressRunContext {
  runId?: string;
  mode?: GlowfinRunMode;
  dayId?: string;
  calendarRewardsAllowed?: boolean;
  competitiveRecordsAllowed?: boolean;
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

export interface RewardedPearlGrantResult {
  progress: GlowfinProgressV2;
  granted: boolean;
  pearls: number;
}

export interface TideSprintRecordResult {
  progress: GlowfinProgressV2;
  award: TideSprintModeAward;
  duplicateRewardPrevented: boolean;
  newBest: boolean;
  ghostSaved: boolean;
  tideLevelBefore: number;
  tideLevelAfter: number;
  unlockedCosmetics: CosmeticDefinition[];
}

export interface RealmRunContext {
  collisions?: number;
}

export interface RealmRecordResult {
  progress: GlowfinProgressV2;
  realm: RealmId;
  award: RealmModeAward;
  duplicateRewardPrevented: boolean;
  crystalTrenchUnlocked: boolean;
  crystalTrenchNewlyUnlocked: boolean;
  tideLevelBefore: number;
  tideLevelAfter: number;
  unlockedCosmetics: CosmeticDefinition[];
}

export type CosmeticPurchaseStatus =
  | "purchased"
  | "owned"
  | "locked"
  | "insufficient-pearls"
  | "unknown";

export interface CosmeticPurchaseResult {
  progress: GlowfinProgressV2;
  status: CosmeticPurchaseStatus;
  cosmetic: CosmeticDefinition | null;
  spentPearls: number;
}

export interface CosmeticEquipResult {
  progress: GlowfinProgressV2;
  equipped: boolean;
  cosmetic: CosmeticDefinition | null;
  firstEquip: boolean;
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

function version2ProgressChecksum(progress: GlowfinProgressV2Legacy): string {
  return checksumText(JSON.stringify(progress));
}

function version3ProgressChecksum(progress: GlowfinProgressV3Legacy): string {
  return checksumText(JSON.stringify(progress));
}

function version4ProgressChecksum(progress: GlowfinProgressV4Legacy): string {
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
    !Number.isInteger(progression.lumenPearlsEarned) || Number(progression.lumenPearlsEarned) < 0 ||
    Number(progression.lumenPearls) > Number(progression.lumenPearlsEarned) ||
    !Number.isInteger(progression.tideXp) || Number(progression.tideXp) < 0 ||
    !Array.isArray(progression.ownedCosmetics) ||
    !Array.isArray(progression.purchasedCosmetics) ||
    !Array.isArray(progression.recentRewardClaims) ||
    progression.recentRewardClaims.length > MAX_RECENT_REWARD_CLAIMS ||
    !progression.recentRewardClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) ||
    new Set(progression.recentRewardClaims).size !== progression.recentRewardClaims.length
  ) {
    return false;
  }
  const owned = sanitizeOwnedCosmetics(progression.ownedCosmetics);
  const purchased = sanitizeOwnedCosmetics(progression.purchasedCosmetics)
    .filter((id) => !DEFAULT_COSMETIC_IDS.includes(id));
  if (
    JSON.stringify(owned) !== JSON.stringify(progression.ownedCosmetics) ||
    JSON.stringify(purchased) !== JSON.stringify(progression.purchasedCosmetics) ||
    !purchased.every((id) => owned.includes(id)) ||
    Number(progression.lumenPearls) !== Math.max(
      0,
      Number(progression.lumenPearlsEarned) - purchasedCosmeticCost(purchased)
    )
  ) return false;
  const sanitized = sanitizeCosmeticLoadout(
    progression.equippedCosmetics,
    owned
  );
  return JSON.stringify(sanitized) === JSON.stringify(progression.equippedCosmetics);
}

function onboardingValid(value: unknown): value is GlowfinOnboardingV1 {
  if (!value || typeof value !== "object") return false;
  const onboarding = value as Partial<GlowfinOnboardingV1>;
  return [
    onboarding.tutorialCompleted,
    onboarding.firstRunCompleted,
    onboarding.firstRewardSeen,
    onboarding.firstPurchaseCompleted,
    onboarding.firstEquipCompleted
  ].every((entry) => typeof entry === "boolean");
}

function version2ProgressionValid(
  value: unknown
): value is GlowfinProgressV2Legacy["progression"] {
  if (!value || typeof value !== "object") return false;
  const progression = value as Partial<GlowfinProgressV2Legacy["progression"]>;
  if (
    !Number.isInteger(progression.lumenPearls) || Number(progression.lumenPearls) < 0 ||
    !Number.isInteger(progression.tideXp) || Number(progression.tideXp) < 0 ||
    !Array.isArray(progression.recentRewardClaims) ||
    progression.recentRewardClaims.length > MAX_RECENT_REWARD_CLAIMS ||
    !progression.recentRewardClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) ||
    new Set(progression.recentRewardClaims).size !== progression.recentRewardClaims.length
  ) return false;
  const sanitized = sanitizeCosmeticLoadout(
    progression.equippedCosmetics,
    Number(progression.tideXp)
  );
  return JSON.stringify(sanitized) === JSON.stringify(progression.equippedCosmetics);
}

function validateVersion2Progress(value: unknown): value is GlowfinProgressV2Legacy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinProgressV2Legacy>;
  const replayValid = candidate.bestReplay === null || validateReplay(candidate.bestReplay).valid;
  return (
    candidate.schemaVersion === 2 &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    safeIsoDate(candidate.updatedAt ?? "") &&
    typeof candidate.bestScore === "number" && Number.isFinite(candidate.bestScore) && candidate.bestScore >= 0 &&
    replayValid &&
    totalsValid(candidate.totals) &&
    consentValid(candidate.telemetryConsent) &&
    typeof candidate.ghostEnabled === "boolean" &&
    version2ProgressionValid(candidate.progression) &&
    dailyValid(candidate.daily) &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
}

function validateVersion3Progress(value: unknown): value is GlowfinProgressV3Legacy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinProgressV3Legacy>;
  const replayValid = candidate.bestReplay === null || validateReplay(candidate.bestReplay).valid;
  return (
    candidate.schemaVersion === 3 &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    safeIsoDate(candidate.updatedAt ?? "") &&
    typeof candidate.bestScore === "number" && Number.isFinite(candidate.bestScore) && candidate.bestScore >= 0 &&
    replayValid &&
    totalsValid(candidate.totals) &&
    consentValid(candidate.telemetryConsent) &&
    typeof candidate.ghostEnabled === "boolean" &&
    progressionValid(candidate.progression) &&
    dailyValid(candidate.daily) &&
    onboardingValid(candidate.onboarding) &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
}

function validateVersion4Progress(value: unknown): value is GlowfinProgressV4Legacy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinProgressV4Legacy>;
  const replayValid = candidate.bestReplay === null || validateReplay(candidate.bestReplay).valid;
  return (
    candidate.schemaVersion === 4 &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    safeIsoDate(candidate.updatedAt ?? "") &&
    typeof candidate.bestScore === "number" && Number.isFinite(candidate.bestScore) && candidate.bestScore >= 0 &&
    replayValid &&
    totalsValid(candidate.totals) &&
    consentValid(candidate.telemetryConsent) &&
    typeof candidate.ghostEnabled === "boolean" &&
    progressionValid(candidate.progression) &&
    dailyValid(candidate.daily) &&
    onboardingValid(candidate.onboarding) &&
    validateTideSprintProgress(candidate.tideSprint) &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
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
      lumenPearlsEarned: 0,
      tideXp: 0,
      ownedCosmetics: [...DEFAULT_COSMETIC_IDS].sort(),
      purchasedCosmetics: [],
      equippedCosmetics: { ...DEFAULT_COSMETIC_LOADOUT },
      recentRewardClaims: []
    },
    daily: createDefaultDailyRetention(),
    onboarding: {
      tutorialCompleted: false,
      firstRunCompleted: false,
      firstRewardSeen: false,
      firstPurchaseCompleted: false,
      firstEquipCompleted: false
    },
    tideSprint: createDefaultTideSprintProgress(now),
    realms: createDefaultRealmProgress(now)
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
      lumenPearlsEarned: 0,
      tideXp: 0,
      ownedCosmetics: [...DEFAULT_COSMETIC_IDS].sort(),
      purchasedCosmetics: [],
      equippedCosmetics: { ...DEFAULT_COSMETIC_LOADOUT },
      recentRewardClaims: []
    },
    daily: createDefaultDailyRetention(),
    onboarding: {
      tutorialCompleted: false,
      firstRunCompleted: false,
      firstRewardSeen: false,
      firstPurchaseCompleted: false,
      firstEquipCompleted: false
    },
    tideSprint: createDefaultTideSprintProgress(now),
    realms: createDefaultRealmProgress(now)
  };
}

export function migrateVersion2Progress(
  legacy: GlowfinProgressV2Legacy,
  now = new Date()
): GlowfinProgressV2 {
  const ownedCosmetics = grandfatheredCosmeticsForXp(legacy.progression.tideXp);
  const returningPlayer = legacy.totals.runs > 0;
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
      lumenPearls: legacy.progression.lumenPearls,
      lumenPearlsEarned: legacy.progression.lumenPearls,
      tideXp: legacy.progression.tideXp,
      ownedCosmetics,
      purchasedCosmetics: [],
      equippedCosmetics: sanitizeCosmeticLoadout(
        legacy.progression.equippedCosmetics,
        ownedCosmetics
      ),
      recentRewardClaims: [...legacy.progression.recentRewardClaims]
    },
    daily: JSON.parse(JSON.stringify(legacy.daily)) as DailyRetentionState,
    onboarding: {
      tutorialCompleted: returningPlayer,
      firstRunCompleted: returningPlayer,
      firstRewardSeen: legacy.progression.lumenPearls > 0,
      firstPurchaseCompleted: false,
      firstEquipCompleted: returningPlayer
    },
    tideSprint: createDefaultTideSprintProgress(now),
    realms: createDefaultRealmProgress(now)
  };
}

export function migrateVersion3Progress(
  legacy: GlowfinProgressV3Legacy,
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
    progression: JSON.parse(JSON.stringify(legacy.progression)) as GlowfinProgressionV2,
    daily: JSON.parse(JSON.stringify(legacy.daily)) as DailyRetentionState,
    onboarding: { ...legacy.onboarding },
    tideSprint: createDefaultTideSprintProgress(now),
    realms: createDefaultRealmProgress(now)
  };
}

export function migrateVersion4Progress(
  legacy: GlowfinProgressV4Legacy,
  now = new Date(),
): GlowfinProgressV2 {
  return {
    ...JSON.parse(JSON.stringify(legacy)) as GlowfinProgressV4Legacy,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    revision: legacy.revision + 1,
    updatedAt: now.toISOString(),
    realms: createDefaultRealmProgress(now),
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
    onboardingValid(candidate.onboarding) &&
    validateTideSprintProgress(candidate.tideSprint) &&
    validateRealmProgress(candidate.realms) &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
}

export function migrateProgressValue(
  value: unknown,
  now = new Date()
): GlowfinProgressV2 | null {
  if (validateProgress(value)) return cloneProgress(value);
  if (validateVersion4Progress(value)) return migrateVersion4Progress(value, now);
  if (validateVersion3Progress(value)) return migrateVersion3Progress(value, now);
  if (validateVersion2Progress(value)) return migrateVersion2Progress(value, now);
  if (validateLegacyProgress(value)) return migrateLegacyProgress(value, now);
  return null;
}

function encodeEnvelope(progress: GlowfinProgressV2): string {
  const envelope: ProgressEnvelopeV5 = {
    envelopeVersion: 5,
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
    const value = JSON.parse(encoded) as Partial<ProgressEnvelopeV5>;
    if (
      value.envelopeVersion !== 5 ||
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

function decodeVersion4Envelope(encoded: string, now: Date): GlowfinProgressV2 | null {
  if (encoded.length < 2 || encoded.length > MAX_PROGRESS_BYTES) return null;
  try {
    const value = JSON.parse(encoded) as Partial<LegacyProgressEnvelopeV4>;
    if (
      value.envelopeVersion !== 4 ||
      typeof value.checksum !== "string" ||
      !validateVersion4Progress(value.payload) ||
      version4ProgressChecksum(value.payload) !== value.checksum
    ) return null;
    return migrateVersion4Progress(value.payload, now);
  } catch {
    return null;
  }
}

function decodeVersion3Envelope(encoded: string, now: Date): GlowfinProgressV2 | null {
  if (encoded.length < 2 || encoded.length > MAX_PROGRESS_BYTES) return null;
  try {
    const value = JSON.parse(encoded) as Partial<LegacyProgressEnvelopeV3>;
    if (
      value.envelopeVersion !== 3 ||
      typeof value.checksum !== "string" ||
      !validateVersion3Progress(value.payload) ||
      version3ProgressChecksum(value.payload) !== value.checksum
    ) return null;
    return migrateVersion3Progress(value.payload, now);
  } catch {
    return null;
  }
}

function decodeVersion2Envelope(encoded: string, now: Date): GlowfinProgressV2 | null {
  if (encoded.length < 2 || encoded.length > MAX_PROGRESS_BYTES) return null;
  try {
    const value = JSON.parse(encoded) as Partial<LegacyProgressEnvelopeV2>;
    if (
      value.envelopeVersion !== 2 ||
      typeof value.checksum !== "string" ||
      !validateVersion2Progress(value.payload) ||
      version2ProgressChecksum(value.payload) !== value.checksum
    ) return null;
    return migrateVersion2Progress(value.payload, now);
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
  const ownedCosmetics = sanitizeOwnedCosmetics([
    ...local.progression.ownedCosmetics,
    ...remote.progression.ownedCosmetics
  ]);
  const purchasedCosmetics = Array.from(new Set([
    ...local.progression.purchasedCosmetics,
    ...remote.progression.purchasedCosmetics
  ])).sort();
  const lumenPearlsEarned = Math.max(
    local.progression.lumenPearlsEarned,
    remote.progression.lumenPearlsEarned
  );
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
      lumenPearls: Math.max(0, lumenPearlsEarned - purchasedCosmeticCost(purchasedCosmetics)),
      lumenPearlsEarned,
      tideXp,
      ownedCosmetics,
      purchasedCosmetics,
      equippedCosmetics: sanitizeCosmeticLoadout(preferredLoadout, ownedCosmetics),
      recentRewardClaims: mergeRewardClaims(
        local.progression.recentRewardClaims,
        remote.progression.recentRewardClaims
      )
    },
    daily: mergeDailyRetention(local.daily, remote.daily),
    onboarding: {
      tutorialCompleted: local.onboarding.tutorialCompleted || remote.onboarding.tutorialCompleted,
      firstRunCompleted: local.onboarding.firstRunCompleted || remote.onboarding.firstRunCompleted,
      firstRewardSeen: local.onboarding.firstRewardSeen || remote.onboarding.firstRewardSeen,
      firstPurchaseCompleted: local.onboarding.firstPurchaseCompleted || remote.onboarding.firstPurchaseCompleted,
      firstEquipCompleted: local.onboarding.firstEquipCompleted || remote.onboarding.firstEquipCompleted
    },
    tideSprint: mergeTideSprintProgress(local.tideSprint, remote.tideSprint, now),
    realms: mergeRealmProgress(local.realms, remote.realms, now)
  };
}

function safeClaimId(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 108);
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

function realmHistoryPayload(progress: RealmProgressV1): string {
  return JSON.stringify({
    kelpCathedral: progress.kelpCathedral,
    crystalTrench: progress.crystalTrench,
  });
}

function importLegacyRealms(
  progress: GlowfinProgressV2,
  storage: Pick<ProgressStorage, "getItem">,
  now: Date,
): { progress: GlowfinProgressV2; imported: boolean } {
  const legacy = readLegacyRealmProgress(storage);
  if (!legacy) return { progress, imported: false };
  const merged = mergeRealmProgress(progress.realms, legacy, now);
  if (realmHistoryPayload(merged) === realmHistoryPayload(progress.realms)) {
    return { progress, imported: false };
  }
  return {
    imported: true,
    progress: {
      ...progress,
      revision: progress.revision + 1,
      updatedAt: now.toISOString(),
      realms: merged,
    },
  };
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
      const imported = importLegacyRealms(primary, this.storage, this.now());
      this.current = imported.progress;
      if (imported.imported) this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "primary",
        recoveryReason: imported.imported ? "migrated-realm-prototype" : null,
      };
    }

    const backup = backupRaw ? decodeEnvelope(backupRaw) : null;
    if (backup) {
      const imported = importLegacyRealms(backup, this.storage, this.now());
      this.current = imported.progress;
      try {
        this.storage.setItem(PROGRESS_PRIMARY_KEY, encodeEnvelope(this.current));
      } catch {
        // In-memory recovery remains valid when storage is temporarily denied.
      }
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "backup",
        recoveryReason: imported.imported
          ? "migrated-realm-prototype"
          : primaryRaw ? "primary-corrupt" : "primary-missing"
      };
    }

    const version4 = this.readVersion4();
    if (version4) {
      const imported = importLegacyRealms(version4, this.storage, this.now());
      this.current = imported.progress;
      this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "version-4",
        recoveryReason: imported.imported
          ? "migrated-version-4-and-realm-prototype"
          : "migrated-version-4"
      };
    }

    const version3 = this.readVersion3();
    if (version3) {
      this.current = version3;
      this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "version-3",
        recoveryReason: "migrated-version-3"
      };
    }

    const version2 = this.readVersion2();
    if (version2) {
      this.current = version2;
      this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "version-2",
        recoveryReason: "migrated-version-2"
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
    const competitiveRecordsAllowed = context.competitiveRecordsAllowed ?? true;
    const newBest = competitiveRecordsAllowed && summary.score > this.current.bestScore;
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
    const nextPearlsEarned = clampCount(
      this.current.progression.lumenPearlsEarned + totalPearls
    );
    const nextPearls = Math.max(
      0,
      nextPearlsEarned - purchasedCosmeticCost(this.current.progression.purchasedCosmetics)
    );
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
        lumenPearlsEarned: nextPearlsEarned,
        tideXp: nextXp,
        ownedCosmetics: [...this.current.progression.ownedCosmetics],
        purchasedCosmetics: [...this.current.progression.purchasedCosmetics],
        equippedCosmetics: sanitizeCosmeticLoadout(
          this.current.progression.equippedCosmetics,
          this.current.progression.ownedCosmetics
        ),
        recentRewardClaims: Array.from(claims).sort().slice(-MAX_RECENT_REWARD_CLAIMS)
      },
      daily,
      onboarding: {
        ...this.current.onboarding,
        firstRunCompleted: true,
        firstRewardSeen: this.current.onboarding.firstRewardSeen || totalPearls > 0
      }
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

  /**
   * Atomically records a Tide Sprint result, its cosmetic-only rewards,
   * objectives and best deterministic ghost. Classic/Daily score, replay,
   * calendar claims and tutorial state are deliberately untouched.
   */
  recordTideSprintRace(record: TideSprintRaceRecord): TideSprintRecordResult {
    const claimId = tideSprintRunClaimId(record.runId);
    const sharedClaims = new Set(this.current.progression.recentRewardClaims);
    const duplicate = sharedClaims.has(claimId) ||
      this.current.tideSprint.recentRunClaims.includes(claimId);
    const previousXp = this.current.progression.tideXp;
    if (duplicate) {
      return {
        progress: this.snapshot(),
        award: {
          pearls: 0,
          xp: 0,
          bond: 0,
          newlyCompletedObjectives: []
        },
        duplicateRewardPrevented: true,
        newBest: false,
        ghostSaved: false,
        tideLevelBefore: tideLevelForXp(previousXp),
        tideLevelAfter: tideLevelForXp(previousXp),
        unlockedCosmetics: []
      };
    }

    const modeResult = applyTideSprintRace(
      this.current.tideSprint,
      record,
      this.now()
    );
    sharedClaims.add(modeResult.claimId);
    const nextXp = clampCount(previousXp + modeResult.award.xp);
    const nextPearlsEarned = clampCount(
      this.current.progression.lumenPearlsEarned + modeResult.award.pearls
    );
    const purchasedCost = purchasedCosmeticCost(
      this.current.progression.purchasedCosmetics
    );
    const unlockedCosmetics = newlyUnlockedCosmetics(previousXp, nextXp);
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      totals: {
        ...this.current.totals,
        runs: clampCount(this.current.totals.runs + 1),
        playSeconds: Math.max(
          0,
          this.current.totals.playSeconds + Math.max(0, record.elapsedSec)
        ),
        collisions: clampCount(
          this.current.totals.collisions + Math.max(0, record.collisions)
        )
      },
      progression: {
        ...this.current.progression,
        lumenPearls: Math.max(0, nextPearlsEarned - purchasedCost),
        lumenPearlsEarned: nextPearlsEarned,
        tideXp: nextXp,
        recentRewardClaims: Array.from(sharedClaims)
          .sort()
          .slice(-MAX_RECENT_REWARD_CLAIMS)
      },
      onboarding: {
        ...this.current.onboarding,
        firstRewardSeen: this.current.onboarding.firstRewardSeen ||
          modeResult.award.pearls > 0
      },
      tideSprint: modeResult.progress
    };
    this.persist(this.current);
    return {
      progress: this.snapshot(),
      award: modeResult.award,
      duplicateRewardPrevented: modeResult.duplicatePrevented,
      newBest: modeResult.newBest,
      ghostSaved: modeResult.ghostSaved,
      tideLevelBefore: tideLevelForXp(previousXp),
      tideLevelAfter: tideLevelForXp(nextXp),
      unlockedCosmetics
    };
  }

  recordKelpCathedralRun(
    record: KelpCathedralRunRecord,
    context: RealmRunContext = {},
  ): RealmRecordResult {
    return this.recordRealmRun(
      "kelp-cathedral",
      record.elapsedSec,
      context,
      applyKelpCathedralRun(this.current.realms, record, this.now()),
    );
  }

  recordCrystalTrenchRun(
    record: CrystalTrenchRunRecord,
    context: RealmRunContext = {},
  ): RealmRecordResult {
    return this.recordRealmRun(
      "crystal-trench",
      record.elapsedSec,
      context,
      applyCrystalTrenchRun(this.current.realms, record, this.now()),
    );
  }

  activeRealmObjectives(): RealmObjectivePresentation[] {
    return realmObjectivePresentations(this.current.realms);
  }

  private recordRealmRun(
    realm: Exclude<RealmId, "moon-garden">,
    elapsedSec: number,
    context: RealmRunContext,
    update: RealmRunUpdate,
  ): RealmRecordResult {
    const previousXp = this.current.progression.tideXp;
    if (update.duplicatePrevented) {
      return {
        progress: this.snapshot(),
        realm,
        award: update.award,
        duplicateRewardPrevented: true,
        crystalTrenchUnlocked: update.crystalTrenchUnlocked,
        crystalTrenchNewlyUnlocked: false,
        tideLevelBefore: tideLevelForXp(previousXp),
        tideLevelAfter: tideLevelForXp(previousXp),
        unlockedCosmetics: [],
      };
    }

    const sharedClaims = new Set(this.current.progression.recentRewardClaims);
    sharedClaims.add(update.claimId);
    const nextXp = clampCount(previousXp + update.award.xp);
    const nextPearlsEarned = clampCount(
      this.current.progression.lumenPearlsEarned + update.award.pearls,
    );
    const purchasedCost = purchasedCosmeticCost(
      this.current.progression.purchasedCosmetics,
    );
    const unlockedCosmetics = newlyUnlockedCosmetics(previousXp, nextXp);
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      totals: {
        ...this.current.totals,
        runs: clampCount(this.current.totals.runs + 1),
        playSeconds: Math.max(0, this.current.totals.playSeconds + Math.max(0, elapsedSec)),
        collisions: clampCount(
          this.current.totals.collisions + Math.max(0, context.collisions ?? 0),
        ),
      },
      progression: {
        ...this.current.progression,
        lumenPearls: Math.max(0, nextPearlsEarned - purchasedCost),
        lumenPearlsEarned: nextPearlsEarned,
        tideXp: nextXp,
        recentRewardClaims: Array.from(sharedClaims)
          .sort()
          .slice(-MAX_RECENT_REWARD_CLAIMS),
      },
      onboarding: {
        ...this.current.onboarding,
        firstRewardSeen: this.current.onboarding.firstRewardSeen || update.award.pearls > 0,
      },
      realms: update.progress,
    };
    this.persist(this.current);
    return {
      progress: this.snapshot(),
      realm,
      award: update.award,
      duplicateRewardPrevented: false,
      crystalTrenchUnlocked: update.crystalTrenchUnlocked,
      crystalTrenchNewlyUnlocked: update.crystalTrenchNewlyUnlocked,
      tideLevelBefore: tideLevelForXp(previousXp),
      tideLevelAfter: tideLevelForXp(nextXp),
      unlockedCosmetics,
    };
  }

  selectTideSprintCrew(selected: TideSprintCrewId): GlowfinProgressV2 {
    const next = selectTideSprintCrewProgress(
      this.current.tideSprint,
      selected,
      this.now()
    );
    if (next.revision === this.current.tideSprint.revision) return this.snapshot();
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      tideSprint: next
    };
    this.persist(this.current);
    return this.snapshot();
  }

  importLegacyTideSprintCrew(
    selected: TideSprintCrewId,
    bonds: Readonly<Record<TideSprintCrewId, number>>
  ): GlowfinProgressV2 {
    if (
      this.current.tideSprint.revision > 0 ||
      this.current.tideSprint.totals.runs > 0
    ) return this.snapshot();
    const migratedBonds = Object.fromEntries(TIDE_SPRINT_CREW_IDS.map((id) => [
      id,
      Math.max(0, Math.min(999, Math.floor(Number(bonds[id]) || 0)))
    ])) as Record<TideSprintCrewId, number>;
    const hasLegacyProgress = selected !== "glowfin" ||
      TIDE_SPRINT_CREW_IDS.some((id) => migratedBonds[id] > 0);
    if (!hasLegacyProgress) return this.snapshot();
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      tideSprint: {
        ...this.current.tideSprint,
        revision: this.current.tideSprint.revision + 1,
        updatedAt: this.now().toISOString(),
        selected,
        bonds: migratedBonds
      }
    };
    this.persist(this.current);
    return this.snapshot();
  }

  /**
   * Idempotent cosmetic-economy reward. It cannot alter score, replay,
   * collisions, Tide XP, unlock level or leaderboard classification.
   */
  grantRewardedPearls(runId: string, pearls: number): RewardedPearlGrantResult {
    const amount = Math.max(0, Math.min(220, Math.floor(pearls)));
    const claimId = `rewarded:${safeClaimId(runId)}`;
    const claims = new Set(this.current.progression.recentRewardClaims);
    if (amount < 1 || claims.has(claimId)) {
      return { progress: this.snapshot(), granted: false, pearls: 0 };
    }
    claims.add(claimId);
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      progression: {
        ...this.current.progression,
        lumenPearls: clampCount(this.current.progression.lumenPearls + amount),
        lumenPearlsEarned: clampCount(this.current.progression.lumenPearlsEarned + amount),
        recentRewardClaims: Array.from(claims).sort().slice(-MAX_RECENT_REWARD_CLAIMS)
      },
      onboarding: {
        ...this.current.onboarding,
        firstRewardSeen: true
      }
    };
    this.persist(this.current);
    return { progress: this.snapshot(), granted: true, pearls: amount };
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
    const owned = this.current.progression.ownedCosmetics;
    const candidates = owned
      .map((id) => cosmeticDefinition(id))
      .filter((item): item is CosmeticDefinition => item?.category === category);
    const currentId = this.current.progression.equippedCosmetics[category];
    const currentIndex = candidates.findIndex((item) => item.id === currentId);
    const next = candidates[(currentIndex + 1 + candidates.length) % candidates.length];
    if (!next) return this.snapshot();
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      progression: {
        ...this.current.progression,
        equippedCosmetics: loadoutWithCosmetic(
          this.current.progression.equippedCosmetics,
          next.id,
          owned
        )
      }
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  purchaseCosmetic(cosmeticId: string): CosmeticPurchaseResult {
    const cosmetic = cosmeticDefinition(cosmeticId);
    if (!cosmetic) {
      return { progress: this.snapshot(), status: "unknown", cosmetic: null, spentPearls: 0 };
    }
    if (this.current.progression.ownedCosmetics.includes(cosmetic.id)) {
      return { progress: this.snapshot(), status: "owned", cosmetic, spentPearls: 0 };
    }
    if (tideLevelForXp(this.current.progression.tideXp) < cosmetic.unlockLevel) {
      return { progress: this.snapshot(), status: "locked", cosmetic, spentPearls: 0 };
    }
    if (this.current.progression.lumenPearls < cosmetic.pricePearls) {
      return {
        progress: this.snapshot(),
        status: "insufficient-pearls",
        cosmetic,
        spentPearls: 0
      };
    }
    const purchasedCosmetics = Array.from(new Set([
      ...this.current.progression.purchasedCosmetics,
      cosmetic.id
    ])).sort();
    const ownedCosmetics = sanitizeOwnedCosmetics([
      ...this.current.progression.ownedCosmetics,
      cosmetic.id
    ]);
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      progression: {
        ...this.current.progression,
        lumenPearls: Math.max(
          0,
          this.current.progression.lumenPearlsEarned - purchasedCosmeticCost(purchasedCosmetics)
        ),
        ownedCosmetics,
        purchasedCosmetics
      },
      onboarding: {
        ...this.current.onboarding,
        firstPurchaseCompleted: true
      }
    };
    this.persist(this.current);
    return {
      progress: this.snapshot(),
      status: "purchased",
      cosmetic,
      spentPearls: cosmetic.pricePearls
    };
  }

  equipCosmetic(cosmeticId: string): CosmeticEquipResult {
    const cosmetic = cosmeticDefinition(cosmeticId);
    if (!cosmetic || !this.current.progression.ownedCosmetics.includes(cosmetic.id)) {
      return {
        progress: this.snapshot(),
        equipped: false,
        cosmetic,
        firstEquip: false
      };
    }
    const firstEquip = !this.current.onboarding.firstEquipCompleted;
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      progression: {
        ...this.current.progression,
        equippedCosmetics: loadoutWithCosmetic(
          this.current.progression.equippedCosmetics,
          cosmetic.id,
          this.current.progression.ownedCosmetics
        )
      },
      onboarding: {
        ...this.current.onboarding,
        firstEquipCompleted: true
      }
    };
    this.persist(this.current);
    return { progress: this.snapshot(), equipped: true, cosmetic, firstEquip };
  }

  completeTutorial(): GlowfinProgressV2 {
    if (this.current.onboarding.tutorialCompleted) return this.snapshot();
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      onboarding: {
        ...this.current.onboarding,
        tutorialCompleted: true
      }
    };
    this.persist(this.current);
    return this.snapshot();
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

  private readVersion2(): GlowfinProgressV2 | null {
    try {
      const primary = this.storage.getItem(VERSION_2_PRIMARY_KEY);
      const backup = this.storage.getItem(VERSION_2_BACKUP_KEY);
      return (
        (primary ? decodeVersion2Envelope(primary, this.now()) : null) ??
        (backup ? decodeVersion2Envelope(backup, this.now()) : null)
      );
    } catch {
      return null;
    }
  }

  private readVersion4(): GlowfinProgressV2 | null {
    try {
      const primary = this.storage.getItem(VERSION_4_PRIMARY_KEY);
      const backup = this.storage.getItem(VERSION_4_BACKUP_KEY);
      return (
        (primary ? decodeVersion4Envelope(primary, this.now()) : null) ??
        (backup ? decodeVersion4Envelope(backup, this.now()) : null)
      );
    } catch {
      return null;
    }
  }

  private readVersion3(): GlowfinProgressV2 | null {
    try {
      const primary = this.storage.getItem(VERSION_3_PRIMARY_KEY);
      const backup = this.storage.getItem(VERSION_3_BACKUP_KEY);
      return (
        (primary ? decodeVersion3Envelope(primary, this.now()) : null) ??
        (backup ? decodeVersion3Envelope(backup, this.now()) : null)
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
