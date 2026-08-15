import type { RealmId } from "../realms/definition";
import { livingTideWeekId } from "../season/livingTide";

export const ECLIPSE_COURT_PACK_ID = "eclipse-court-pack-one" as const;
export const ECLIPSE_COURT_SCHEMA_VERSION = 1 as const;
export const ECLIPSE_COURT_DESIGN_REVISION = 3 as const;
export const MAX_ECLIPSE_COURT_CLAIMS = 96;

export const ECLIPSE_COURT_STAGE_DEFINITIONS = [
  {
    id: "shadow-bloom",
    realmId: "eclipse-court",
    title: "Halo Procession",
    shortTitle: "HALO",
    objective: "Ride eight petal tides and wake the Halo Nectaries",
    perfectObjective: "Hold every luminous crest",
    sigil: "✺",
    colour: "#f6d786",
    rewardCosmeticId: "glow.eclipse-nacre",
  },
  {
    id: "broken-prism",
    realmId: "eclipse-court",
    title: "Constellation Weave",
    shortTitle: "WEAVE",
    objective: "Guide six star-manta witnesses into constellation",
    perfectObjective: "Bring every witness home cleanly",
    sigil: "⌁",
    colour: "#8fe9ff",
    rewardCosmeticId: "fin.eclipse-crest",
  },
  {
    id: "crown-of-depths",
    realmId: "eclipse-court",
    title: "Crown Verdict",
    shortTitle: "VERDICT",
    objective: "Focus five living iris plates and free Vaelune",
    perfectObjective: "Heal the Eclipse Wound without breaking focus",
    sigil: "◉",
    colour: "#e7a8ff",
    rewardCosmeticId: "trail.eclipse-wake",
  },
] as const;

export const ECLIPSE_COURT_FINAL_REWARD_ID = "aura.court-orbit" as const;
export const ECLIPSE_COURT_COLLECTION_IDS = [
  ...ECLIPSE_COURT_STAGE_DEFINITIONS.map((stage) => stage.rewardCosmeticId),
  ECLIPSE_COURT_FINAL_REWARD_ID,
] as const;

export type EclipseCourtStageDefinition =
  typeof ECLIPSE_COURT_STAGE_DEFINITIONS[number];
export type EclipseCourtStageId = EclipseCourtStageDefinition["id"];
export type EclipseCourtRealmId = Extract<
  RealmId,
  EclipseCourtStageDefinition["realmId"]
>;
export type EclipseCourtCosmeticId =
  typeof ECLIPSE_COURT_COLLECTION_IDS[number];

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Revision 3 intentionally preserves the sealed progression identity. Stage
// IDs, order, rewards and claim semantics did not change, so existing V48
// progress remains valid while the presentation and gameplay are replaced.
export const ECLIPSE_COURT_MANIFEST_HASH = "275389d7" as const;

export interface EclipseCourtRunV1 {
  runId: string;
  weekId: string;
  runNumber: number;
  currentStageIndex: number;
  completedStages: EclipseCourtStageId[];
  perfectStages: EclipseCourtStageId[];
  elapsedSec: number;
  attempts: number;
  startedAt: string;
  completedAt: string | null;
}

export interface EclipseCourtProgressV1 {
  schemaVersion: typeof ECLIPSE_COURT_SCHEMA_VERSION;
  packId: typeof ECLIPSE_COURT_PACK_ID;
  manifestHash: typeof ECLIPSE_COURT_MANIFEST_HASH;
  revision: number;
  updatedAt: string;
  runsStarted: number;
  runsCompleted: number;
  perfectRuns: number;
  bestRunSec: number | null;
  collectionIds: EclipseCourtCosmeticId[];
  activeRun: EclipseCourtRunV1 | null;
  recentClaims: string[];
}

export interface EclipseCourtStageRecord {
  claimId: string;
  weekId: string;
  /** Optional for V48-R1 save compatibility; production always supplies it. */
  stageId?: EclipseCourtStageId;
  realmId: EclipseCourtRealmId;
  elapsedSec: number;
  success: boolean;
  perfect: boolean;
}

export interface EclipseCourtStageUpdate {
  progress: EclipseCourtProgressV1;
  claimId: string;
  accepted: boolean;
  duplicatePrevented: boolean;
  success: boolean;
  perfectStage: boolean;
  stage: EclipseCourtStageDefinition | null;
  nextStage: EclipseCourtStageDefinition | null;
  packComplete: boolean;
  perfectPack: boolean;
  rewardPearls: number;
  rewardXp: number;
  unlockedCosmeticIds: EclipseCourtCosmeticId[];
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
  return Array.from(new Set(values)).sort().slice(-MAX_ECLIPSE_COURT_CLAIMS);
}

function sortedCollection(
  values: readonly EclipseCourtCosmeticId[],
): EclipseCourtCosmeticId[] {
  const order = new Map(
    ECLIPSE_COURT_COLLECTION_IDS.map((id, index) => [id, index]),
  );
  return Array.from(new Set(values)).sort(
    (left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99),
  );
}

export function eclipseCourtWeekId(dayId: string): string {
  return livingTideWeekId(dayId);
}

export function eclipseCourtStageSeed(
  weekId: string,
  runNumber: number,
  stageId: EclipseCourtStageId,
): number {
  return hashText(
    `${ECLIPSE_COURT_PACK_ID}:${ECLIPSE_COURT_MANIFEST_HASH}:${weekId}:${runNumber}:${stageId}`,
  );
}

export function createDefaultEclipseCourtProgress(
  now = new Date(),
): EclipseCourtProgressV1 {
  return {
    schemaVersion: ECLIPSE_COURT_SCHEMA_VERSION,
    packId: ECLIPSE_COURT_PACK_ID,
    manifestHash: ECLIPSE_COURT_MANIFEST_HASH,
    revision: 0,
    updatedAt: now.toISOString(),
    runsStarted: 0,
    runsCompleted: 0,
    perfectRuns: 0,
    bestRunSec: null,
    collectionIds: [],
    activeRun: null,
    recentClaims: [],
  };
}

export function activeEclipseCourtStage(
  progress: Readonly<EclipseCourtProgressV1>,
): EclipseCourtStageDefinition | null {
  const index = progress.activeRun?.currentStageIndex ?? 0;
  return ECLIPSE_COURT_STAGE_DEFINITIONS[index] ?? null;
}

export function beginEclipseCourtRun(
  current: Readonly<EclipseCourtProgressV1>,
  weekId: string,
  now = new Date(),
): EclipseCourtProgressV1 {
  if (current.activeRun && current.activeRun.completedAt === null) {
    return clone(current);
  }
  const runNumber = current.runsStarted + 1;
  return {
    ...clone(current),
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    runsStarted: runNumber,
    activeRun: {
      runId: `${weekId}-r${runNumber}`,
      weekId,
      runNumber,
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
  current: Readonly<EclipseCourtProgressV1>,
  claimId: string,
  options: Partial<EclipseCourtStageUpdate> = {},
): EclipseCourtStageUpdate {
  return {
    progress: clone(current),
    claimId,
    accepted: false,
    duplicatePrevented: false,
    success: false,
    perfectStage: false,
    stage: activeEclipseCourtStage(current),
    nextStage: activeEclipseCourtStage(current),
    packComplete: Boolean(current.activeRun?.completedAt),
    perfectPack: false,
    rewardPearls: 0,
    rewardXp: 0,
    unlockedCosmeticIds: [],
    ...options,
  };
}

export function applyEclipseCourtStage(
  current: Readonly<EclipseCourtProgressV1>,
  record: Readonly<EclipseCourtStageRecord>,
  now = new Date(),
): EclipseCourtStageUpdate {
  const activeRun = current.activeRun;
  const stage = activeEclipseCourtStage(current);
  const safeRecordClaim = safeClaim(record.claimId);
  const claimId = activeRun && stage
    ? `pack:${activeRun.runId}:${stage.id}:${safeRecordClaim}`
    : `pack:inactive:${safeRecordClaim}`;
  if (
    current.recentClaims.includes(claimId) ||
    current.recentClaims.some((claim) => claim.endsWith(`:${safeRecordClaim}`))
  ) {
    return emptyUpdate(current, claimId, { duplicatePrevented: true });
  }
  if (
    !activeRun || activeRun.completedAt !== null || !stage ||
    record.weekId !== activeRun.weekId || record.realmId !== stage.realmId ||
    (record.stageId !== undefined && record.stageId !== stage.id) ||
    !Number.isFinite(record.elapsedSec) || record.elapsedSec <= 0
  ) {
    return emptyUpdate(current, claimId);
  }

  const elapsedSec = activeRun.elapsedSec + record.elapsedSec;
  const attempts = activeRun.attempts + 1;
  const recentClaims = boundedClaims([...current.recentClaims, claimId]);
  if (!record.success) {
    const progress: EclipseCourtProgressV1 = {
      ...clone(current),
      revision: current.revision + 1,
      updatedAt: now.toISOString(),
      recentClaims,
      activeRun: {
        ...clone(activeRun),
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

  const completedStages = [...activeRun.completedStages, stage.id];
  const perfectStages = record.perfect
    ? [...activeRun.perfectStages, stage.id]
    : [...activeRun.perfectStages];
  const currentStageIndex = activeRun.currentStageIndex + 1;
  const packComplete = currentStageIndex >= ECLIPSE_COURT_STAGE_DEFINITIONS.length;
  const perfectPack = packComplete &&
    perfectStages.length === ECLIPSE_COURT_STAGE_DEFINITIONS.length;
  const newlyUnlocked: EclipseCourtCosmeticId[] = [stage.rewardCosmeticId];
  if (packComplete) newlyUnlocked.push(ECLIPSE_COURT_FINAL_REWARD_ID);
  const unlockedCosmeticIds = newlyUnlocked.filter(
    (id) => !current.collectionIds.includes(id),
  );
  const collectionIds = sortedCollection([
    ...current.collectionIds,
    ...newlyUnlocked,
  ]);
  const rewardPearls = 35 + (record.perfect ? 25 : 0) + (packComplete ? 85 : 0);
  const rewardXp = 28 + (record.perfect ? 18 : 0) + (packComplete ? 60 : 0);
  const completedAt = packComplete ? now.toISOString() : null;
  const bestRunSec = packComplete
    ? current.bestRunSec === null
      ? elapsedSec
      : Math.min(current.bestRunSec, elapsedSec)
    : current.bestRunSec;
  const progress: EclipseCourtProgressV1 = {
    ...clone(current),
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    runsCompleted: current.runsCompleted + (packComplete ? 1 : 0),
    perfectRuns: current.perfectRuns + (perfectPack ? 1 : 0),
    bestRunSec,
    collectionIds,
    recentClaims,
    activeRun: {
      ...clone(activeRun),
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
    nextStage: ECLIPSE_COURT_STAGE_DEFINITIONS[currentStageIndex] ?? null,
    packComplete,
    perfectPack,
    rewardPearls,
    rewardXp,
    unlockedCosmeticIds,
  };
}

function validStageIds(value: unknown): value is EclipseCourtStageId[] {
  const ids = new Set<EclipseCourtStageId>(
    ECLIPSE_COURT_STAGE_DEFINITIONS.map((stage) => stage.id),
  );
  return Array.isArray(value) && value.length <= ids.size &&
    value.every((id) => typeof id === "string" && ids.has(id as EclipseCourtStageId)) &&
    new Set(value).size === value.length;
}

function validRun(value: unknown): value is EclipseCourtRunV1 {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<EclipseCourtRunV1>;
  if (
    typeof run.runId !== "string" || !/^[0-9-]{10}-r[1-9][0-9]*$/.test(run.runId) ||
    typeof run.weekId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(run.weekId) ||
    !safeCount(run.runNumber) || run.runNumber < 1 ||
    !safeCount(run.currentStageIndex) ||
    run.currentStageIndex > ECLIPSE_COURT_STAGE_DEFINITIONS.length ||
    !validStageIds(run.completedStages) || !validStageIds(run.perfectStages) ||
    typeof run.elapsedSec !== "number" || !Number.isFinite(run.elapsedSec) || run.elapsedSec < 0 ||
    !safeCount(run.attempts) || !safeDate(run.startedAt) ||
    !(run.completedAt === null || safeDate(run.completedAt))
  ) return false;
  const expectedPrefix = ECLIPSE_COURT_STAGE_DEFINITIONS
    .slice(0, run.currentStageIndex)
    .map((stage) => stage.id);
  return JSON.stringify(run.completedStages) === JSON.stringify(expectedPrefix) &&
    run.perfectStages.every((id) => run.completedStages!.includes(id)) &&
    (run.completedAt === null
      ? run.currentStageIndex < ECLIPSE_COURT_STAGE_DEFINITIONS.length
      : run.currentStageIndex === ECLIPSE_COURT_STAGE_DEFINITIONS.length);
}

function validCollection(value: unknown): value is EclipseCourtCosmeticId[] {
  const allowed = new Set<string>(ECLIPSE_COURT_COLLECTION_IDS);
  if (!Array.isArray(value) || value.length > allowed.size ||
      !value.every((id) => typeof id === "string" && allowed.has(id)) ||
      new Set(value).size !== value.length) return false;
  return JSON.stringify(value) === JSON.stringify(sortedCollection(
    value as EclipseCourtCosmeticId[],
  ));
}

export function validateEclipseCourtProgress(
  value: unknown,
): value is EclipseCourtProgressV1 {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<EclipseCourtProgressV1>;
  if (!(progress.schemaVersion === ECLIPSE_COURT_SCHEMA_VERSION &&
    progress.packId === ECLIPSE_COURT_PACK_ID &&
    progress.manifestHash === ECLIPSE_COURT_MANIFEST_HASH &&
    safeCount(progress.revision) && safeDate(progress.updatedAt) &&
    safeCount(progress.runsStarted) && safeCount(progress.runsCompleted) &&
    progress.runsCompleted <= progress.runsStarted &&
    safeCount(progress.perfectRuns) && progress.perfectRuns <= progress.runsCompleted &&
    (progress.bestRunSec === null || (
      typeof progress.bestRunSec === "number" &&
      Number.isFinite(progress.bestRunSec) && progress.bestRunSec > 0
    )) && validCollection(progress.collectionIds) &&
    (progress.activeRun === null || validRun(progress.activeRun)) &&
    Array.isArray(progress.recentClaims) &&
    progress.recentClaims.length <= MAX_ECLIPSE_COURT_CLAIMS &&
    progress.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) && new Set(progress.recentClaims).size === progress.recentClaims.length
  )) return false;

  const earnedStageCount = progress.runsCompleted > 0
    ? ECLIPSE_COURT_STAGE_DEFINITIONS.length
    : progress.activeRun?.currentStageIndex ?? 0;
  const required: EclipseCourtCosmeticId[] = ECLIPSE_COURT_STAGE_DEFINITIONS
    .slice(0, earnedStageCount)
    .map((stage) => stage.rewardCosmeticId);
  if (progress.runsCompleted > 0) required.push(ECLIPSE_COURT_FINAL_REWARD_ID);
  return required.every((id) => progress.collectionIds!.includes(id));
}

function preferredRun(
  left: EclipseCourtRunV1 | null,
  right: EclipseCourtRunV1 | null,
): EclipseCourtRunV1 | null {
  if (!left) return right ? clone(right) : null;
  if (!right) return clone(left);
  if (left.runId === right.runId) {
    const advanced = left.currentStageIndex >= right.currentStageIndex ? left : right;
    const other = advanced === left ? right : left;
    return {
      ...clone(advanced),
      perfectStages: Array.from(new Set([
        ...advanced.perfectStages,
        ...other.perfectStages.filter((id) => advanced.completedStages.includes(id)),
      ])) as EclipseCourtStageId[],
      elapsedSec: Math.max(left.elapsedSec, right.elapsedSec),
      attempts: Math.max(left.attempts, right.attempts),
    };
  }
  if (left.runNumber !== right.runNumber) {
    return clone(left.runNumber > right.runNumber ? left : right);
  }
  return clone(left.weekId >= right.weekId ? left : right);
}

export function mergeEclipseCourtProgress(
  local: Readonly<EclipseCourtProgressV1>,
  remote: Readonly<EclipseCourtProgressV1>,
  now = new Date(),
): EclipseCourtProgressV1 {
  const bestRunSec = local.bestRunSec === null
    ? remote.bestRunSec
    : remote.bestRunSec === null
      ? local.bestRunSec
      : Math.min(local.bestRunSec, remote.bestRunSec);
  return {
    schemaVersion: ECLIPSE_COURT_SCHEMA_VERSION,
    packId: ECLIPSE_COURT_PACK_ID,
    manifestHash: ECLIPSE_COURT_MANIFEST_HASH,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    runsStarted: Math.max(local.runsStarted, remote.runsStarted),
    runsCompleted: Math.max(local.runsCompleted, remote.runsCompleted),
    perfectRuns: Math.max(local.perfectRuns, remote.perfectRuns),
    bestRunSec,
    collectionIds: sortedCollection([
      ...local.collectionIds,
      ...remote.collectionIds,
    ]),
    activeRun: preferredRun(local.activeRun, remote.activeRun),
    recentClaims: boundedClaims([...local.recentClaims, ...remote.recentClaims]),
  };
}
