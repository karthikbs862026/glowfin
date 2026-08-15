import type { RealmId } from "../realms/definition";

export const LIVING_TIDE_SEASON_ID = "living-tide-season-one" as const;
export const LIVING_TIDE_SEASON_SCHEMA_VERSION = 1 as const;
export const MAX_LIVING_TIDE_CLAIMS = 96;

export const LIVING_TIDE_STAGE_DEFINITIONS = [
  {
    id: "miri-bloom",
    realmId: "kelp-cathedral",
    title: "Miri's Bloom",
    shortTitle: "BLOOM",
    objective: "Rescue Miri",
    perfectObjective: "Recover the Hymn Page",
    sigil: "✦",
    colour: "#69f4c4",
  },
  {
    id: "prism-oath",
    realmId: "crystal-trench",
    title: "Prism Oath",
    shortTitle: "PRISM",
    objective: "Win the Mirror Current",
    perfectObjective: "Keep the clean crest",
    sigil: "◇",
    colour: "#80dfff",
  },
  {
    id: "heartlight-crown",
    realmId: "leviathan-graveyard",
    title: "Heartlight Crown",
    shortTitle: "CROWN",
    objective: "Free Auralis",
    perfectObjective: "Seal Duskmaw cleanly",
    sigil: "☾",
    colour: "#ffe39a",
  },
] as const;

export type LivingTideStageDefinition = typeof LIVING_TIDE_STAGE_DEFINITIONS[number];
export type LivingTideStageId = LivingTideStageDefinition["id"];
export type LivingTideRealmId = Extract<
  RealmId,
  LivingTideStageDefinition["realmId"]
>;

export interface LivingTideVoyageV1 {
  voyageId: string;
  weekId: string;
  voyageNumber: number;
  currentStageIndex: number;
  completedStages: LivingTideStageId[];
  perfectStages: LivingTideStageId[];
  elapsedSec: number;
  attempts: number;
  startedAt: string;
  completedAt: string | null;
}

export interface LivingTideSeasonProgressV1 {
  schemaVersion: typeof LIVING_TIDE_SEASON_SCHEMA_VERSION;
  seasonId: typeof LIVING_TIDE_SEASON_ID;
  revision: number;
  updatedAt: string;
  tideblooms: number;
  voyagesStarted: number;
  voyagesCompleted: number;
  perfectVoyages: number;
  bestVoyageSec: number | null;
  activeVoyage: LivingTideVoyageV1 | null;
  recentClaims: string[];
}

export interface LivingTideStageRecord {
  claimId: string;
  weekId: string;
  realmId: LivingTideRealmId;
  elapsedSec: number;
  success: boolean;
  perfect: boolean;
}

export interface LivingTideStageUpdate {
  progress: LivingTideSeasonProgressV1;
  claimId: string;
  accepted: boolean;
  duplicatePrevented: boolean;
  success: boolean;
  perfectStage: boolean;
  stage: LivingTideStageDefinition | null;
  nextStage: LivingTideStageDefinition | null;
  voyageComplete: boolean;
  perfectVoyage: boolean;
  tidebloomsEarned: number;
  rewardPearls: number;
  rewardXp: number;
  crownTier: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safeClaim(value: string): string {
  return value.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 64) || "unknown";
}

function boundedClaims(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort().slice(-MAX_LIVING_TIDE_CLAIMS);
}

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function livingTideWeekId(dayId: string): string {
  const timestamp = Date.parse(`${dayId}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid Living Tide day: ${dayId}`);
  const date = new Date(timestamp);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function livingTideStageSeed(
  weekId: string,
  voyageNumber: number,
  stageId: LivingTideStageId,
): number {
  return hashText(`${LIVING_TIDE_SEASON_ID}:${weekId}:${voyageNumber}:${stageId}`);
}

export function crownTierForTideblooms(tideblooms: number): number {
  const thresholds = [0, 3, 7, 12, 18, 25] as const;
  let tier = 0;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (tideblooms >= thresholds[index]!) tier = index;
  }
  return tier;
}

export function createDefaultLivingTideSeason(
  now = new Date(),
): LivingTideSeasonProgressV1 {
  return {
    schemaVersion: LIVING_TIDE_SEASON_SCHEMA_VERSION,
    seasonId: LIVING_TIDE_SEASON_ID,
    revision: 0,
    updatedAt: now.toISOString(),
    tideblooms: 0,
    voyagesStarted: 0,
    voyagesCompleted: 0,
    perfectVoyages: 0,
    bestVoyageSec: null,
    activeVoyage: null,
    recentClaims: [],
  };
}

export function activeLivingTideStage(
  progress: Readonly<LivingTideSeasonProgressV1>,
): LivingTideStageDefinition | null {
  const index = progress.activeVoyage?.currentStageIndex ?? 0;
  return LIVING_TIDE_STAGE_DEFINITIONS[index] ?? null;
}

export function beginLivingTideVoyage(
  current: Readonly<LivingTideSeasonProgressV1>,
  weekId: string,
  now = new Date(),
): LivingTideSeasonProgressV1 {
  if (current.activeVoyage && current.activeVoyage.completedAt === null) {
    return clone(current);
  }
  const voyageNumber = current.voyagesStarted + 1;
  return {
    ...clone(current),
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    voyagesStarted: voyageNumber,
    activeVoyage: {
      voyageId: `${weekId}-v${voyageNumber}`,
      weekId,
      voyageNumber,
      currentStageIndex: 0,
      completedStages: [],
      perfectStages: [],
      elapsedSec: 0,
      attempts: 0,
      startedAt: now.toISOString(),
      completedAt: null,
    },
  };
}

function emptyUpdate(
  current: Readonly<LivingTideSeasonProgressV1>,
  claimId: string,
  options: Partial<LivingTideStageUpdate> = {},
): LivingTideStageUpdate {
  return {
    progress: clone(current),
    claimId,
    accepted: false,
    duplicatePrevented: false,
    success: false,
    perfectStage: false,
    stage: activeLivingTideStage(current),
    nextStage: activeLivingTideStage(current),
    voyageComplete: Boolean(current.activeVoyage?.completedAt),
    perfectVoyage: false,
    tidebloomsEarned: 0,
    rewardPearls: 0,
    rewardXp: 0,
    crownTier: crownTierForTideblooms(current.tideblooms),
    ...options,
  };
}

export function applyLivingTideStage(
  current: Readonly<LivingTideSeasonProgressV1>,
  record: Readonly<LivingTideStageRecord>,
  now = new Date(),
): LivingTideStageUpdate {
  const voyage = current.activeVoyage;
  const stage = activeLivingTideStage(current);
  const safeRecordClaim = safeClaim(record.claimId);
  const claimId = voyage && stage
    ? `season:${voyage.voyageId}:${stage.id}:${safeRecordClaim}`
    : `season:inactive:${safeRecordClaim}`;
  if (
    current.recentClaims.includes(claimId) ||
    current.recentClaims.some((claim) => claim.endsWith(`:${safeRecordClaim}`))
  ) {
    return emptyUpdate(current, claimId, { duplicatePrevented: true });
  }
  if (
    !voyage || voyage.completedAt !== null || !stage ||
    record.weekId !== voyage.weekId || record.realmId !== stage.realmId ||
    !Number.isFinite(record.elapsedSec) || record.elapsedSec <= 0
  ) {
    return emptyUpdate(current, claimId);
  }

  const elapsedSec = voyage.elapsedSec + record.elapsedSec;
  const attempts = voyage.attempts + 1;
  const recentClaims = boundedClaims([...current.recentClaims, claimId]);
  if (!record.success) {
    const progress: LivingTideSeasonProgressV1 = {
      ...clone(current),
      revision: current.revision + 1,
      updatedAt: now.toISOString(),
      recentClaims,
      activeVoyage: {
        ...clone(voyage),
        elapsedSec,
        attempts,
      },
    };
    return emptyUpdate(progress, claimId, {
      accepted: true,
      stage,
      nextStage: stage,
    });
  }

  const completedStages = [...voyage.completedStages, stage.id];
  const perfectStages = record.perfect
    ? [...voyage.perfectStages, stage.id]
    : [...voyage.perfectStages];
  const currentStageIndex = voyage.currentStageIndex + 1;
  const voyageComplete = currentStageIndex >= LIVING_TIDE_STAGE_DEFINITIONS.length;
  const perfectVoyage = voyageComplete &&
    perfectStages.length === LIVING_TIDE_STAGE_DEFINITIONS.length;
  const tidebloomsEarned = 1 + (record.perfect ? 1 : 0) + (voyageComplete ? 2 : 0);
  const tideblooms = current.tideblooms + tidebloomsEarned;
  const rewardPearls = 30 + (record.perfect ? 20 : 0) + (voyageComplete ? 70 : 0);
  const rewardXp = 24 + (record.perfect ? 16 : 0) + (voyageComplete ? 50 : 0);
  const completedAt = voyageComplete ? now.toISOString() : null;
  const bestVoyageSec = voyageComplete
    ? current.bestVoyageSec === null
      ? elapsedSec
      : Math.min(current.bestVoyageSec, elapsedSec)
    : current.bestVoyageSec;
  const progress: LivingTideSeasonProgressV1 = {
    ...clone(current),
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    tideblooms,
    voyagesCompleted: current.voyagesCompleted + (voyageComplete ? 1 : 0),
    perfectVoyages: current.perfectVoyages + (perfectVoyage ? 1 : 0),
    bestVoyageSec,
    recentClaims,
    activeVoyage: {
      ...clone(voyage),
      currentStageIndex,
      completedStages,
      perfectStages,
      elapsedSec,
      attempts,
      completedAt,
    },
  };
  return {
    progress,
    claimId,
    accepted: true,
    duplicatePrevented: false,
    success: true,
    perfectStage: record.perfect,
    stage,
    nextStage: LIVING_TIDE_STAGE_DEFINITIONS[currentStageIndex] ?? null,
    voyageComplete,
    perfectVoyage,
    tidebloomsEarned,
    rewardPearls,
    rewardXp,
    crownTier: crownTierForTideblooms(tideblooms),
  };
}

function validStageIds(value: unknown): value is LivingTideStageId[] {
  const ids = new Set<LivingTideStageId>(
    LIVING_TIDE_STAGE_DEFINITIONS.map((stage) => stage.id),
  );
  return Array.isArray(value) && value.length <= ids.size &&
    value.every((id) => typeof id === "string" && ids.has(id as LivingTideStageId)) &&
    new Set(value).size === value.length;
}

function validVoyage(value: unknown): value is LivingTideVoyageV1 {
  if (!value || typeof value !== "object") return false;
  const voyage = value as Partial<LivingTideVoyageV1>;
  if (
    typeof voyage.voyageId !== "string" || !/^[0-9-]{10}-v[1-9][0-9]*$/.test(voyage.voyageId) ||
    typeof voyage.weekId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(voyage.weekId) ||
    !safeCount(voyage.voyageNumber) || voyage.voyageNumber < 1 ||
    !safeCount(voyage.currentStageIndex) ||
    voyage.currentStageIndex > LIVING_TIDE_STAGE_DEFINITIONS.length ||
    !validStageIds(voyage.completedStages) ||
    !validStageIds(voyage.perfectStages) ||
    typeof voyage.elapsedSec !== "number" || !Number.isFinite(voyage.elapsedSec) || voyage.elapsedSec < 0 ||
    !safeCount(voyage.attempts) || !safeDate(voyage.startedAt) ||
    !(voyage.completedAt === null || safeDate(voyage.completedAt))
  ) return false;
  const expectedPrefix = LIVING_TIDE_STAGE_DEFINITIONS
    .slice(0, voyage.currentStageIndex)
    .map((stage) => stage.id);
  return JSON.stringify(voyage.completedStages) === JSON.stringify(expectedPrefix) &&
    voyage.perfectStages.every((id) => voyage.completedStages!.includes(id)) &&
    (voyage.completedAt === null
      ? voyage.currentStageIndex < LIVING_TIDE_STAGE_DEFINITIONS.length
      : voyage.currentStageIndex === LIVING_TIDE_STAGE_DEFINITIONS.length);
}

export function validateLivingTideSeasonProgress(
  value: unknown,
): value is LivingTideSeasonProgressV1 {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<LivingTideSeasonProgressV1>;
  return progress.schemaVersion === LIVING_TIDE_SEASON_SCHEMA_VERSION &&
    progress.seasonId === LIVING_TIDE_SEASON_ID &&
    safeCount(progress.revision) && safeDate(progress.updatedAt) &&
    safeCount(progress.tideblooms) && safeCount(progress.voyagesStarted) &&
    safeCount(progress.voyagesCompleted) &&
    progress.voyagesCompleted <= progress.voyagesStarted &&
    safeCount(progress.perfectVoyages) &&
    progress.perfectVoyages <= progress.voyagesCompleted &&
    (progress.bestVoyageSec === null || (
      typeof progress.bestVoyageSec === "number" &&
      Number.isFinite(progress.bestVoyageSec) && progress.bestVoyageSec > 0
    )) &&
    (progress.activeVoyage === null || validVoyage(progress.activeVoyage)) &&
    Array.isArray(progress.recentClaims) &&
    progress.recentClaims.length <= MAX_LIVING_TIDE_CLAIMS &&
    progress.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) && new Set(progress.recentClaims).size === progress.recentClaims.length;
}

function preferredVoyage(
  left: LivingTideVoyageV1 | null,
  right: LivingTideVoyageV1 | null,
): LivingTideVoyageV1 | null {
  if (!left) return right ? clone(right) : null;
  if (!right) return clone(left);
  if (left.voyageId === right.voyageId) {
    const advanced = left.currentStageIndex >= right.currentStageIndex ? left : right;
    const other = advanced === left ? right : left;
    return {
      ...clone(advanced),
      perfectStages: Array.from(new Set([
        ...advanced.perfectStages,
        ...other.perfectStages.filter((id) => advanced.completedStages.includes(id)),
      ])) as LivingTideStageId[],
      elapsedSec: Math.max(left.elapsedSec, right.elapsedSec),
      attempts: Math.max(left.attempts, right.attempts),
    };
  }
  if (left.voyageNumber !== right.voyageNumber) {
    return clone(left.voyageNumber > right.voyageNumber ? left : right);
  }
  return clone(left.weekId >= right.weekId ? left : right);
}

export function mergeLivingTideSeasonProgress(
  local: Readonly<LivingTideSeasonProgressV1>,
  remote: Readonly<LivingTideSeasonProgressV1>,
  now = new Date(),
): LivingTideSeasonProgressV1 {
  const bestVoyageSec = local.bestVoyageSec === null
    ? remote.bestVoyageSec
    : remote.bestVoyageSec === null
      ? local.bestVoyageSec
      : Math.min(local.bestVoyageSec, remote.bestVoyageSec);
  return {
    schemaVersion: LIVING_TIDE_SEASON_SCHEMA_VERSION,
    seasonId: LIVING_TIDE_SEASON_ID,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    tideblooms: Math.max(local.tideblooms, remote.tideblooms),
    voyagesStarted: Math.max(local.voyagesStarted, remote.voyagesStarted),
    voyagesCompleted: Math.max(local.voyagesCompleted, remote.voyagesCompleted),
    perfectVoyages: Math.max(local.perfectVoyages, remote.perfectVoyages),
    bestVoyageSec,
    activeVoyage: preferredVoyage(local.activeVoyage, remote.activeVoyage),
    recentClaims: boundedClaims([...local.recentClaims, ...remote.recentClaims]),
  };
}
