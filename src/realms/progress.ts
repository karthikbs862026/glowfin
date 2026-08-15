import type { RealmGameplayVerb } from "./definition";
import {
  createDefaultLivingTideSeason,
  mergeLivingTideSeasonProgress,
  validateLivingTideSeasonProgress,
  type LivingTideSeasonProgressV1,
} from "../season/livingTide";
import {
  createDefaultEclipseCourtProgress,
  mergeEclipseCourtProgress,
  validateEclipseCourtProgress,
  type EclipseCourtProgressV1,
} from "../content/eclipseCourt";

export const REALM_PROGRESS_SCHEMA_VERSION = 1 as const;
export const REALM_PROGRESS_PRIMARY_KEY = "glowfin.realms.v1.primary";
export const REALM_PROGRESS_BACKUP_KEY = "glowfin.realms.v1.backup";
const MAX_REALM_CLAIMS = 64;

export interface KelpCathedralProgressV1 {
  runs: number;
  rescues: number;
  bestRescueSec: number | null;
  relicPages: Array<"kelp-cathedral-page-1">;
  masteredVerbs: RealmGameplayVerb[];
  recentClaims: string[];
}

export interface CrystalTrenchProgressV1 {
  runs: number;
  completions: number;
  bestTimeSec: number | null;
  cleanCompletions: number;
  masteredVerbs: RealmGameplayVerb[];
  recentClaims: string[];
}

export interface LeviathanGraveyardProgressV1 {
  runs: number;
  victories: number;
  bestVictorySec: number | null;
  cleanVictories: number;
  mooncrestCovenant: boolean;
  masteredVerbs: RealmGameplayVerb[];
  recentClaims: string[];
}

export interface RealmProgressV1 {
  schemaVersion: typeof REALM_PROGRESS_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  kelpCathedral: KelpCathedralProgressV1;
  crystalTrench: CrystalTrenchProgressV1;
  /** Optional only so Version 43/44 schema-5 cloud saves remain additive. */
  leviathanGraveyard?: LeviathanGraveyardProgressV1;
  /** Optional so every V45/V46 save remains valid and backfills on first V47 action. */
  livingTideSeason?: LivingTideSeasonProgressV1;
  /** Optional so V43–V47 schema-5 saves remain valid until V48 is entered. */
  eclipseCourtPack?: EclipseCourtProgressV1;
}

interface RealmProgressEnvelopeV1 {
  envelopeVersion: 1;
  payload: RealmProgressV1;
  checksum: string;
}

export interface RealmProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface KelpCathedralRunRecord {
  runId: string;
  elapsedSec: number;
  rescuedManta: boolean;
  relicPageFound: boolean;
  masteredVerbs: readonly RealmGameplayVerb[];
}

export interface CrystalTrenchRunRecord {
  runId: string;
  elapsedSec: number;
  completed: boolean;
  cleanPerformance: boolean;
  masteredVerbs: readonly RealmGameplayVerb[];
}

export interface LeviathanGraveyardRunRecord {
  runId: string;
  elapsedSec: number;
  completed: boolean;
  cleanPerformance: boolean;
  masteredVerbs: readonly RealmGameplayVerb[];
}

export type RealmObjectiveId =
  | "realm-kelp-rescue"
  | "realm-kelp-relic"
  | "realm-crystal-clear"
  | "realm-crystal-clean"
  | "realm-heartlight-war"
  | "realm-heartlight-clean";

export interface RealmObjectiveDefinition {
  id: RealmObjectiveId;
  label: string;
  rewardPearls: number;
  rewardXp: number;
}

export interface RealmObjectivePresentation extends RealmObjectiveDefinition {
  progress: number;
  target: 1;
  completed: boolean;
}

export interface RealmModeAward {
  pearls: number;
  xp: number;
  newlyCompletedObjectives: RealmObjectiveId[];
}

export interface RealmRunUpdate {
  progress: RealmProgressV1;
  claimId: string;
  duplicatePrevented: boolean;
  crystalTrenchUnlocked: boolean;
  crystalTrenchNewlyUnlocked: boolean;
  leviathanGraveyardUnlocked: boolean;
  leviathanGraveyardNewlyUnlocked: boolean;
  mooncrestCovenantNewlyAwarded: boolean;
  award: RealmModeAward;
}

export const REALM_OBJECTIVES: readonly RealmObjectiveDefinition[] = [
  {
    id: "realm-kelp-rescue",
    label: "Realm 1 · Rescue the baby manta",
    rewardPearls: 60,
    rewardXp: 45,
  },
  {
    id: "realm-kelp-relic",
    label: "Realm 1 · Recover the hidden Relic Page",
    rewardPearls: 35,
    rewardXp: 30,
  },
  {
    id: "realm-crystal-clear",
    label: "Realm 2 · Win Neri's Mirror Current race",
    rewardPearls: 75,
    rewardXp: 55,
  },
  {
    id: "realm-crystal-clean",
    label: "Realm 2 · Earn the clean Trench mark",
    rewardPearls: 45,
    rewardXp: 35,
  },
  {
    id: "realm-heartlight-war",
    label: "Realm 3 · Free Auralis and defeat Duskmaw",
    rewardPearls: 140,
    rewardXp: 100,
  },
  {
    id: "realm-heartlight-clean",
    label: "Realm 3 · Earn the clean Heartlight mark",
    rewardPearls: 60,
    rewardXp: 45,
  },
] as const;

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function clone(progress: RealmProgressV1): RealmProgressV1 {
  return JSON.parse(JSON.stringify(progress)) as RealmProgressV1;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeClaim(value: string): string {
  return value.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 104) || "unknown";
}

function createDefaultLeviathanProgress(): LeviathanGraveyardProgressV1 {
  return {
    runs: 0,
    victories: 0,
    bestVictorySec: null,
    cleanVictories: 0,
    mooncrestCovenant: false,
    masteredVerbs: [],
    recentClaims: [],
  };
}

export function leviathanGraveyardProgress(
  progress: RealmProgressV1,
): LeviathanGraveyardProgressV1 {
  return progress.leviathanGraveyard
    ? JSON.parse(JSON.stringify(progress.leviathanGraveyard)) as LeviathanGraveyardProgressV1
    : createDefaultLeviathanProgress();
}

export function livingTideSeasonProgress(
  progress: RealmProgressV1,
): LivingTideSeasonProgressV1 {
  return progress.livingTideSeason
    ? JSON.parse(JSON.stringify(progress.livingTideSeason)) as LivingTideSeasonProgressV1
    : createDefaultLivingTideSeason(new Date(progress.updatedAt));
}

export function eclipseCourtProgress(
  progress: RealmProgressV1,
): EclipseCourtProgressV1 {
  return progress.eclipseCourtPack
    ? JSON.parse(JSON.stringify(progress.eclipseCourtPack)) as EclipseCourtProgressV1
    : createDefaultEclipseCourtProgress(new Date(progress.updatedAt));
}

export function createDefaultRealmProgress(now = new Date()): RealmProgressV1 {
  return {
    schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now.toISOString(),
    kelpCathedral: {
      runs: 0,
      rescues: 0,
      bestRescueSec: null,
      relicPages: [],
      masteredVerbs: [],
      recentClaims: [],
    },
    crystalTrench: {
      runs: 0,
      completions: 0,
      bestTimeSec: null,
      cleanCompletions: 0,
      masteredVerbs: [],
      recentClaims: [],
    },
    leviathanGraveyard: createDefaultLeviathanProgress(),
    livingTideSeason: createDefaultLivingTideSeason(now),
    eclipseCourtPack: createDefaultEclipseCourtProgress(now),
  };
}

export function isCrystalTrenchUnlocked(progress: RealmProgressV1): boolean {
  return progress.kelpCathedral.rescues > 0;
}

export function isLeviathanGraveyardUnlocked(progress: RealmProgressV1): boolean {
  return progress.crystalTrench.completions > 0;
}

function objectiveCompleted(
  progress: RealmProgressV1,
  objectiveId: RealmObjectiveId,
): boolean {
  switch (objectiveId) {
    case "realm-kelp-rescue":
      return progress.kelpCathedral.rescues > 0;
    case "realm-kelp-relic":
      return progress.kelpCathedral.relicPages.includes("kelp-cathedral-page-1");
    case "realm-crystal-clear":
      return progress.crystalTrench.completions > 0;
    case "realm-crystal-clean":
      return progress.crystalTrench.cleanCompletions > 0;
    case "realm-heartlight-war":
      return leviathanGraveyardProgress(progress).victories > 0;
    case "realm-heartlight-clean":
      return leviathanGraveyardProgress(progress).cleanVictories > 0;
  }
}

export function realmObjectivePresentations(
  progress: RealmProgressV1,
): RealmObjectivePresentation[] {
  return REALM_OBJECTIVES.map((objective) => {
    const completed = objectiveCompleted(progress, objective.id);
    return {
      ...objective,
      progress: completed ? 1 : 0,
      target: 1,
      completed,
    };
  });
}

function awardForObjectives(objectiveIds: readonly RealmObjectiveId[]): RealmModeAward {
  const definitions = new Map(REALM_OBJECTIVES.map((objective) => [
    objective.id,
    objective,
  ]));
  return objectiveIds.reduce<RealmModeAward>((award, objectiveId) => {
    const objective = definitions.get(objectiveId);
    if (!objective) return award;
    award.pearls += objective.rewardPearls;
    award.xp += objective.rewardXp;
    award.newlyCompletedObjectives.push(objectiveId);
    return award;
  }, { pearls: 0, xp: 0, newlyCompletedObjectives: [] });
}

export function applyKelpCathedralRun(
  current: RealmProgressV1,
  record: KelpCathedralRunRecord,
  now = new Date(),
): RealmRunUpdate {
  const claimId = `realm:kelp:${safeClaim(record.runId)}`;
  if (current.kelpCathedral.recentClaims.includes(claimId)) {
    return {
      progress: clone(current),
      claimId,
      duplicatePrevented: true,
      crystalTrenchUnlocked: isCrystalTrenchUnlocked(current),
      crystalTrenchNewlyUnlocked: false,
      leviathanGraveyardUnlocked: isLeviathanGraveyardUnlocked(current),
      leviathanGraveyardNewlyUnlocked: false,
      mooncrestCovenantNewlyAwarded: false,
      award: awardForObjectives([]),
    };
  }
  const rescueWasComplete = objectiveCompleted(current, "realm-kelp-rescue");
  const relicWasComplete = objectiveCompleted(current, "realm-kelp-relic");
  const crystalWasUnlocked = isCrystalTrenchUnlocked(current);
  const previous = current.kelpCathedral;
  const bestRescueSec = record.rescuedManta
    ? previous.bestRescueSec === null
      ? record.elapsedSec
      : Math.min(previous.bestRescueSec, record.elapsedSec)
    : previous.bestRescueSec;
  const progress: RealmProgressV1 = {
    schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    kelpCathedral: {
      runs: previous.runs + 1,
      rescues: previous.rescues + (record.rescuedManta ? 1 : 0),
      bestRescueSec,
      relicPages: record.relicPageFound
        ? ["kelp-cathedral-page-1"]
        : [...previous.relicPages],
      masteredVerbs: Array.from(new Set([
        ...previous.masteredVerbs,
        ...record.masteredVerbs,
      ])).sort(),
      recentClaims: [...previous.recentClaims, claimId].slice(-MAX_REALM_CLAIMS),
    },
    crystalTrench: clone(current).crystalTrench,
    leviathanGraveyard: leviathanGraveyardProgress(current),
    livingTideSeason: livingTideSeasonProgress(current),
    eclipseCourtPack: eclipseCourtProgress(current),
  };
  const newlyCompleted: RealmObjectiveId[] = [];
  if (!rescueWasComplete && objectiveCompleted(progress, "realm-kelp-rescue")) {
    newlyCompleted.push("realm-kelp-rescue");
  }
  if (!relicWasComplete && objectiveCompleted(progress, "realm-kelp-relic")) {
    newlyCompleted.push("realm-kelp-relic");
  }
  return {
    progress,
    claimId,
    duplicatePrevented: false,
    crystalTrenchUnlocked: isCrystalTrenchUnlocked(progress),
    crystalTrenchNewlyUnlocked:
      !crystalWasUnlocked && isCrystalTrenchUnlocked(progress),
    leviathanGraveyardUnlocked: isLeviathanGraveyardUnlocked(progress),
    leviathanGraveyardNewlyUnlocked: false,
    mooncrestCovenantNewlyAwarded: false,
    award: awardForObjectives(newlyCompleted),
  };
}

export function applyCrystalTrenchRun(
  current: RealmProgressV1,
  record: CrystalTrenchRunRecord,
  now = new Date(),
): RealmRunUpdate {
  const claimId = `realm:crystal:${safeClaim(record.runId)}`;
  if (current.crystalTrench.recentClaims.includes(claimId)) {
    return {
      progress: clone(current),
      claimId,
      duplicatePrevented: true,
      crystalTrenchUnlocked: isCrystalTrenchUnlocked(current),
      crystalTrenchNewlyUnlocked: false,
      leviathanGraveyardUnlocked: isLeviathanGraveyardUnlocked(current),
      leviathanGraveyardNewlyUnlocked: false,
      mooncrestCovenantNewlyAwarded: false,
      award: awardForObjectives([]),
    };
  }
  if (!isCrystalTrenchUnlocked(current)) {
    return {
      progress: clone(current),
      claimId,
      duplicatePrevented: true,
      crystalTrenchUnlocked: false,
      crystalTrenchNewlyUnlocked: false,
      leviathanGraveyardUnlocked: false,
      leviathanGraveyardNewlyUnlocked: false,
      mooncrestCovenantNewlyAwarded: false,
      award: awardForObjectives([]),
    };
  }
  const clearWasComplete = objectiveCompleted(current, "realm-crystal-clear");
  const cleanWasComplete = objectiveCompleted(current, "realm-crystal-clean");
  const leviathanWasUnlocked = isLeviathanGraveyardUnlocked(current);
  const previous = current.crystalTrench;
  const bestTimeSec = record.completed
    ? previous.bestTimeSec === null
      ? record.elapsedSec
      : Math.min(previous.bestTimeSec, record.elapsedSec)
    : previous.bestTimeSec;
  const progress: RealmProgressV1 = {
    schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    kelpCathedral: clone(current).kelpCathedral,
    crystalTrench: {
      runs: previous.runs + 1,
      completions: previous.completions + (record.completed ? 1 : 0),
      bestTimeSec,
      cleanCompletions: previous.cleanCompletions +
        (record.completed && record.cleanPerformance ? 1 : 0),
      masteredVerbs: Array.from(new Set([
        ...previous.masteredVerbs,
        ...record.masteredVerbs,
      ])).sort(),
      recentClaims: [...previous.recentClaims, claimId].slice(-MAX_REALM_CLAIMS),
    },
    leviathanGraveyard: leviathanGraveyardProgress(current),
    livingTideSeason: livingTideSeasonProgress(current),
    eclipseCourtPack: eclipseCourtProgress(current),
  };
  const newlyCompleted: RealmObjectiveId[] = [];
  if (!clearWasComplete && objectiveCompleted(progress, "realm-crystal-clear")) {
    newlyCompleted.push("realm-crystal-clear");
  }
  if (!cleanWasComplete && objectiveCompleted(progress, "realm-crystal-clean")) {
    newlyCompleted.push("realm-crystal-clean");
  }
  return {
    progress,
    claimId,
    duplicatePrevented: false,
    crystalTrenchUnlocked: true,
    crystalTrenchNewlyUnlocked: false,
    leviathanGraveyardUnlocked: isLeviathanGraveyardUnlocked(progress),
    leviathanGraveyardNewlyUnlocked:
      !leviathanWasUnlocked && isLeviathanGraveyardUnlocked(progress),
    mooncrestCovenantNewlyAwarded: false,
    award: awardForObjectives(newlyCompleted),
  };
}

export function applyLeviathanGraveyardRun(
  current: RealmProgressV1,
  record: LeviathanGraveyardRunRecord,
  now = new Date(),
): RealmRunUpdate {
  const claimId = `realm:leviathan:${safeClaim(record.runId)}`;
  const previous = leviathanGraveyardProgress(current);
  if (previous.recentClaims.includes(claimId) || !isLeviathanGraveyardUnlocked(current)) {
    return {
      progress: clone(current),
      claimId,
      duplicatePrevented: true,
      crystalTrenchUnlocked: isCrystalTrenchUnlocked(current),
      crystalTrenchNewlyUnlocked: false,
      leviathanGraveyardUnlocked: isLeviathanGraveyardUnlocked(current),
      leviathanGraveyardNewlyUnlocked: false,
      mooncrestCovenantNewlyAwarded: false,
      award: awardForObjectives([]),
    };
  }
  const victoryWasComplete = objectiveCompleted(current, "realm-heartlight-war");
  const cleanWasComplete = objectiveCompleted(current, "realm-heartlight-clean");
  const bestVictorySec = record.completed
    ? previous.bestVictorySec === null
      ? record.elapsedSec
      : Math.min(previous.bestVictorySec, record.elapsedSec)
    : previous.bestVictorySec;
  const progress: RealmProgressV1 = {
    schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    kelpCathedral: clone(current).kelpCathedral,
    crystalTrench: clone(current).crystalTrench,
    leviathanGraveyard: {
      runs: previous.runs + 1,
      victories: previous.victories + (record.completed ? 1 : 0),
      bestVictorySec,
      cleanVictories: previous.cleanVictories +
        (record.completed && record.cleanPerformance ? 1 : 0),
      mooncrestCovenant: previous.mooncrestCovenant || record.completed,
      masteredVerbs: Array.from(new Set([
        ...previous.masteredVerbs,
        ...record.masteredVerbs,
      ])).sort(),
      recentClaims: [...previous.recentClaims, claimId].slice(-MAX_REALM_CLAIMS),
    },
    livingTideSeason: livingTideSeasonProgress(current),
    eclipseCourtPack: eclipseCourtProgress(current),
  };
  const newlyCompleted: RealmObjectiveId[] = [];
  if (!victoryWasComplete && objectiveCompleted(progress, "realm-heartlight-war")) {
    newlyCompleted.push("realm-heartlight-war");
  }
  if (!cleanWasComplete && objectiveCompleted(progress, "realm-heartlight-clean")) {
    newlyCompleted.push("realm-heartlight-clean");
  }
  return {
    progress,
    claimId,
    duplicatePrevented: false,
    crystalTrenchUnlocked: true,
    crystalTrenchNewlyUnlocked: false,
    leviathanGraveyardUnlocked: true,
    leviathanGraveyardNewlyUnlocked: false,
    mooncrestCovenantNewlyAwarded:
      !previous.mooncrestCovenant && progress.leviathanGraveyard!.mooncrestCovenant,
    award: awardForObjectives(newlyCompleted),
  };
}

function validKelpProgress(kelp: Partial<KelpCathedralProgressV1> | undefined): boolean {
  if (!kelp) return false;
  const allowedVerbs: readonly RealmGameplayVerb[] = [
    "swaying-frond-window",
    "reversing-current-tunnel",
    "manta-rescue",
    "relic-current",
  ];
  return Number.isInteger(kelp.runs) && Number(kelp.runs) >= 0 &&
    Number.isInteger(kelp.rescues) && Number(kelp.rescues) >= 0 &&
    Number(kelp.rescues) <= Number(kelp.runs) &&
    (kelp.bestRescueSec === null || (
      typeof kelp.bestRescueSec === "number" &&
      Number.isFinite(kelp.bestRescueSec) &&
      kelp.bestRescueSec > 0
    )) &&
    Array.isArray(kelp.relicPages) &&
    kelp.relicPages.every((page) => page === "kelp-cathedral-page-1") &&
    new Set(kelp.relicPages).size === kelp.relicPages.length &&
    Array.isArray(kelp.masteredVerbs) &&
    kelp.masteredVerbs.every((verb) => allowedVerbs.includes(verb)) &&
    new Set(kelp.masteredVerbs).size === kelp.masteredVerbs.length &&
    Array.isArray(kelp.recentClaims) &&
    kelp.recentClaims.length <= MAX_REALM_CLAIMS &&
    kelp.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) &&
    new Set(kelp.recentClaims).size === kelp.recentClaims.length;
}

function validCrystalProgress(
  crystal: Partial<CrystalTrenchProgressV1> | undefined,
): boolean {
  if (!crystal) return false;
  const allowedVerbs: readonly RealmGameplayVerb[] = [
    "prism-pulse",
    "trench-threshold",
    "sliding-crystal-plates",
    "mirror-current-race",
  ];
  return Number.isInteger(crystal.runs) && Number(crystal.runs) >= 0 &&
    Number.isInteger(crystal.completions) && Number(crystal.completions) >= 0 &&
    Number(crystal.completions) <= Number(crystal.runs) &&
    Number.isInteger(crystal.cleanCompletions) && Number(crystal.cleanCompletions) >= 0 &&
    Number(crystal.cleanCompletions) <= Number(crystal.completions) &&
    (crystal.bestTimeSec === null || (
      typeof crystal.bestTimeSec === "number" &&
      Number.isFinite(crystal.bestTimeSec) &&
      crystal.bestTimeSec > 0
    )) &&
    Array.isArray(crystal.masteredVerbs) &&
    crystal.masteredVerbs.every((verb) => allowedVerbs.includes(verb)) &&
    new Set(crystal.masteredVerbs).size === crystal.masteredVerbs.length &&
    Array.isArray(crystal.recentClaims) &&
    crystal.recentClaims.length <= MAX_REALM_CLAIMS &&
    crystal.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) &&
    new Set(crystal.recentClaims).size === crystal.recentClaims.length;
}

function validLeviathanProgress(
  leviathan: Partial<LeviathanGraveyardProgressV1> | undefined,
): boolean {
  if (!leviathan) return false;
  const allowedVerbs: readonly RealmGameplayVerb[] = [
    "guided-rescue-current",
    "minion-assault",
    "lumen-bloom",
    "shadow-sweep",
    "vacuum-wake",
    "ruins-collapse",
    "current-break",
    "moonbone-vault",
    "moon-seal",
  ];
  return Number.isInteger(leviathan.runs) && Number(leviathan.runs) >= 0 &&
    Number.isInteger(leviathan.victories) && Number(leviathan.victories) >= 0 &&
    Number(leviathan.victories) <= Number(leviathan.runs) &&
    Number.isInteger(leviathan.cleanVictories) && Number(leviathan.cleanVictories) >= 0 &&
    Number(leviathan.cleanVictories) <= Number(leviathan.victories) &&
    (leviathan.bestVictorySec === null || (
      typeof leviathan.bestVictorySec === "number" &&
      Number.isFinite(leviathan.bestVictorySec) &&
      leviathan.bestVictorySec > 0
    )) &&
    typeof leviathan.mooncrestCovenant === "boolean" &&
    (!leviathan.mooncrestCovenant || Number(leviathan.victories) > 0) &&
    Array.isArray(leviathan.masteredVerbs) &&
    leviathan.masteredVerbs.every((verb) => allowedVerbs.includes(verb)) &&
    new Set(leviathan.masteredVerbs).size === leviathan.masteredVerbs.length &&
    Array.isArray(leviathan.recentClaims) &&
    leviathan.recentClaims.length <= MAX_REALM_CLAIMS &&
    leviathan.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) &&
    new Set(leviathan.recentClaims).size === leviathan.recentClaims.length;
}

export function validateRealmProgress(value: unknown): value is RealmProgressV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RealmProgressV1>;
  const kelp = candidate.kelpCathedral as Partial<KelpCathedralProgressV1> | undefined;
  const crystal = candidate.crystalTrench as Partial<CrystalTrenchProgressV1> | undefined;
  const leviathan = candidate.leviathanGraveyard as
    Partial<LeviathanGraveyardProgressV1> | undefined;
  const season = candidate.livingTideSeason;
  const eclipseCourt = candidate.eclipseCourtPack;
  return candidate.schemaVersion === REALM_PROGRESS_SCHEMA_VERSION &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    validDate(candidate.updatedAt) &&
    validKelpProgress(kelp) &&
    validCrystalProgress(crystal) &&
    (leviathan === undefined || validLeviathanProgress(leviathan)) &&
    (season === undefined || validateLivingTideSeasonProgress(season)) &&
    (eclipseCourt === undefined || validateEclipseCourtProgress(eclipseCourt));
}

export function mergeRealmProgress(
  local: RealmProgressV1,
  remote: RealmProgressV1,
  now = new Date(),
): RealmProgressV1 {
  const localBest = local.kelpCathedral.bestRescueSec;
  const remoteBest = remote.kelpCathedral.bestRescueSec;
  const bestRescueSec = localBest === null
    ? remoteBest
    : remoteBest === null
      ? localBest
      : Math.min(localBest, remoteBest);
  const localCrystalBest = local.crystalTrench.bestTimeSec;
  const remoteCrystalBest = remote.crystalTrench.bestTimeSec;
  const bestCrystalTimeSec = localCrystalBest === null
    ? remoteCrystalBest
    : remoteCrystalBest === null
      ? localCrystalBest
      : Math.min(localCrystalBest, remoteCrystalBest);
  const localLeviathan = leviathanGraveyardProgress(local);
  const remoteLeviathan = leviathanGraveyardProgress(remote);
  const bestLeviathanTimeSec = localLeviathan.bestVictorySec === null
    ? remoteLeviathan.bestVictorySec
    : remoteLeviathan.bestVictorySec === null
      ? localLeviathan.bestVictorySec
      : Math.min(localLeviathan.bestVictorySec, remoteLeviathan.bestVictorySec);
  return {
    schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    kelpCathedral: {
      runs: Math.max(local.kelpCathedral.runs, remote.kelpCathedral.runs),
      rescues: Math.max(local.kelpCathedral.rescues, remote.kelpCathedral.rescues),
      bestRescueSec,
      relicPages: Array.from(new Set([
        ...local.kelpCathedral.relicPages,
        ...remote.kelpCathedral.relicPages,
      ])).sort() as Array<"kelp-cathedral-page-1">,
      masteredVerbs: Array.from(new Set([
        ...local.kelpCathedral.masteredVerbs,
        ...remote.kelpCathedral.masteredVerbs,
      ])).sort() as RealmGameplayVerb[],
      recentClaims: Array.from(new Set([
        ...local.kelpCathedral.recentClaims,
        ...remote.kelpCathedral.recentClaims,
      ])).sort().slice(-MAX_REALM_CLAIMS),
    },
    crystalTrench: {
      runs: Math.max(local.crystalTrench.runs, remote.crystalTrench.runs),
      completions: Math.max(
        local.crystalTrench.completions,
        remote.crystalTrench.completions,
      ),
      bestTimeSec: bestCrystalTimeSec,
      cleanCompletions: Math.max(
        local.crystalTrench.cleanCompletions,
        remote.crystalTrench.cleanCompletions,
      ),
      masteredVerbs: Array.from(new Set([
        ...local.crystalTrench.masteredVerbs,
        ...remote.crystalTrench.masteredVerbs,
      ])).sort() as RealmGameplayVerb[],
      recentClaims: Array.from(new Set([
        ...local.crystalTrench.recentClaims,
        ...remote.crystalTrench.recentClaims,
      ])).sort().slice(-MAX_REALM_CLAIMS),
    },
    leviathanGraveyard: {
      runs: Math.max(localLeviathan.runs, remoteLeviathan.runs),
      victories: Math.max(localLeviathan.victories, remoteLeviathan.victories),
      bestVictorySec: bestLeviathanTimeSec,
      cleanVictories: Math.max(
        localLeviathan.cleanVictories,
        remoteLeviathan.cleanVictories,
      ),
      mooncrestCovenant:
        localLeviathan.mooncrestCovenant || remoteLeviathan.mooncrestCovenant,
      masteredVerbs: Array.from(new Set([
        ...localLeviathan.masteredVerbs,
        ...remoteLeviathan.masteredVerbs,
      ])).sort() as RealmGameplayVerb[],
      recentClaims: Array.from(new Set([
        ...localLeviathan.recentClaims,
        ...remoteLeviathan.recentClaims,
      ])).sort().slice(-MAX_REALM_CLAIMS),
    },
    livingTideSeason: mergeLivingTideSeasonProgress(
      livingTideSeasonProgress(local),
      livingTideSeasonProgress(remote),
      now,
    ),
    eclipseCourtPack: mergeEclipseCourtProgress(
      eclipseCourtProgress(local),
      eclipseCourtProgress(remote),
      now,
    ),
  };
}

function encode(progress: RealmProgressV1): string {
  const payload = JSON.stringify(progress);
  const envelope: RealmProgressEnvelopeV1 = {
    envelopeVersion: 1,
    payload: progress,
    checksum: checksum(payload),
  };
  return JSON.stringify(envelope);
}

function decode(encoded: string | null): RealmProgressV1 | null {
  if (!encoded || encoded.length > 64 * 1024) return null;
  try {
    const envelope = JSON.parse(encoded) as Partial<RealmProgressEnvelopeV1>;
    if (
      envelope.envelopeVersion !== 1 ||
      typeof envelope.checksum !== "string" ||
      !envelope.payload ||
      typeof envelope.payload !== "object" ||
      checksum(JSON.stringify(envelope.payload)) !== envelope.checksum
    ) return null;
    if (validateRealmProgress(envelope.payload)) return clone(envelope.payload);
    const legacy = envelope.payload as Partial<RealmProgressV1>;
    if (
      legacy.schemaVersion !== REALM_PROGRESS_SCHEMA_VERSION ||
      !Number.isInteger(legacy.revision) ||
      Number(legacy.revision) < 0 ||
      !validDate(legacy.updatedAt) ||
      !validKelpProgress(legacy.kelpCathedral)
    ) return null;
    return {
      schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
      revision: Number(legacy.revision),
      updatedAt: legacy.updatedAt!,
      kelpCathedral: clone({
        schemaVersion: REALM_PROGRESS_SCHEMA_VERSION,
        revision: Number(legacy.revision),
        updatedAt: legacy.updatedAt!,
        kelpCathedral: legacy.kelpCathedral!,
        crystalTrench: createDefaultRealmProgress().crystalTrench,
      }).kelpCathedral,
      crystalTrench: createDefaultRealmProgress().crystalTrench,
    };
  } catch {
    return null;
  }
}

export function readLegacyRealmProgress(
  storage: Pick<RealmProgressStorage, "getItem">,
): RealmProgressV1 | null {
  try {
    return decode(storage.getItem(REALM_PROGRESS_PRIMARY_KEY)) ??
      decode(storage.getItem(REALM_PROGRESS_BACKUP_KEY));
  } catch {
    return null;
  }
}

export class RealmProgressRepository {
  private current: RealmProgressV1;

  constructor(
    private readonly storage: RealmProgressStorage,
    private readonly now: () => Date = () => new Date(),
  ) {
    const primary = decode(storage.getItem(REALM_PROGRESS_PRIMARY_KEY));
    const backup = decode(storage.getItem(REALM_PROGRESS_BACKUP_KEY));
    this.current = primary ?? backup ?? createDefaultRealmProgress(this.now());
    this.persist();
  }

  snapshot(): RealmProgressV1 {
    return clone(this.current);
  }

  recordKelpRun(record: KelpCathedralRunRecord): RealmProgressV1 {
    this.current = applyKelpCathedralRun(this.current, record, this.now()).progress;
    this.persist();
    return this.snapshot();
  }

  recordCrystalRun(record: CrystalTrenchRunRecord): RealmProgressV1 {
    this.current = applyCrystalTrenchRun(this.current, record, this.now()).progress;
    this.persist();
    return this.snapshot();
  }

  recordLeviathanRun(record: LeviathanGraveyardRunRecord): RealmProgressV1 {
    this.current = applyLeviathanGraveyardRun(this.current, record, this.now()).progress;
    this.persist();
    return this.snapshot();
  }

  replaceWithMerged(remote: RealmProgressV1): RealmProgressV1 {
    this.current = mergeRealmProgress(this.current, remote, this.now());
    this.persist();
    return this.snapshot();
  }

  private persist(): void {
    const encoded = encode(this.current);
    this.storage.setItem(REALM_PROGRESS_BACKUP_KEY, encoded);
    this.storage.setItem(REALM_PROGRESS_PRIMARY_KEY, encoded);
  }
}
