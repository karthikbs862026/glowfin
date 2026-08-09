import {
  TIDE_SPRINT_CREW_IDS,
  type TideSprintCrewId,
} from "./crew";

export const TIDE_SPRINT_PROGRESS_SCHEMA_VERSION = 1 as const;
export const MAX_TIDE_SPRINT_RECENT_RUNS = 96;
export const MAX_TIDE_SPRINT_GHOST_FRAMES = 120 * 180;

export type TideSprintObjectiveId =
  | "first-finish"
  | "six-current-rings"
  | "first-win";

export interface TideSprintObjectiveDefinition {
  id: TideSprintObjectiveId;
  label: string;
  rewardPearls: number;
  rewardXp: number;
}

export const TIDE_SPRINT_OBJECTIVES: readonly TideSprintObjectiveDefinition[] =
  Object.freeze([
    Object.freeze({
      id: "first-finish",
      label: "Finish a Tide Sprint",
      rewardPearls: 12,
      rewardXp: 8,
    }),
    Object.freeze({
      id: "six-current-rings",
      label: "Capture 6 Current Rings in one race",
      rewardPearls: 18,
      rewardXp: 12,
    }),
    Object.freeze({
      id: "first-win",
      label: "Win a Tide Sprint",
      rewardPearls: 28,
      rewardXp: 18,
    }),
  ]);

export interface TideSprintGhostReplayV1 {
  schemaVersion: 1;
  planHash: string;
  selected: TideSprintCrewId;
  finishSec: number;
  frameCount: number;
  encodedControls: string;
  checksum: string;
}

export interface TideSprintProgressV1 {
  schemaVersion: typeof TIDE_SPRINT_PROGRESS_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  selected: TideSprintCrewId;
  bonds: Record<TideSprintCrewId, number>;
  totals: {
    runs: number;
    wins: number;
    finishSeconds: number;
    currentRings: number;
    collisions: number;
  };
  bestFinishSec: number | null;
  bestGhost: TideSprintGhostReplayV1 | null;
  completedObjectives: TideSprintObjectiveId[];
  recentRunClaims: string[];
}

export interface TideSprintRaceRecord {
  runId: string;
  selected: TideSprintCrewId;
  placement: number;
  elapsedSec: number;
  boostsCollected: number;
  collisions: number;
  ghost: TideSprintGhostReplayV1 | null;
}

export interface TideSprintModeAward {
  pearls: number;
  xp: number;
  bond: number;
  newlyCompletedObjectives: TideSprintObjectiveDefinition[];
}

export interface TideSprintModeRecordResult {
  progress: TideSprintProgressV1;
  award: TideSprintModeAward;
  claimId: string;
  duplicatePrevented: boolean;
  newBest: boolean;
  ghostSaved: boolean;
}

const OBJECTIVE_IDS = new Set<TideSprintObjectiveId>(
  TIDE_SPRINT_OBJECTIVES.map((objective) => objective.id),
);

function clampCount(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(maximum, Math.floor(numeric)));
}

function safeIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function ghostChecksumPayload(
  ghost: Omit<TideSprintGhostReplayV1, "checksum">,
): string {
  return JSON.stringify({
    schemaVersion: ghost.schemaVersion,
    planHash: ghost.planHash,
    selected: ghost.selected,
    finishSec: ghost.finishSec,
    frameCount: ghost.frameCount,
    encodedControls: ghost.encodedControls,
  });
}

export function tideSprintGhostChecksum(
  ghost: Omit<TideSprintGhostReplayV1, "checksum">,
): string {
  return checksumText(ghostChecksumPayload(ghost));
}

export function validateTideSprintGhost(
  value: unknown,
): value is TideSprintGhostReplayV1 {
  if (!value || typeof value !== "object") return false;
  const ghost = value as Partial<TideSprintGhostReplayV1>;
  const expectedBytes = Number(ghost.frameCount) * 2;
  const expectedEncodedLength = Math.ceil(expectedBytes / 3) * 4;
  return (
    ghost.schemaVersion === 1 &&
    typeof ghost.planHash === "string" && /^[0-9a-f]{8}$/.test(ghost.planHash) &&
    TIDE_SPRINT_CREW_IDS.includes(ghost.selected as TideSprintCrewId) &&
    typeof ghost.finishSec === "number" && Number.isFinite(ghost.finishSec) &&
    ghost.finishSec >= 20 && ghost.finishSec <= 180 &&
    Number.isInteger(ghost.frameCount) && Number(ghost.frameCount) > 0 &&
    Number(ghost.frameCount) <= MAX_TIDE_SPRINT_GHOST_FRAMES &&
    typeof ghost.encodedControls === "string" &&
    ghost.encodedControls.length === expectedEncodedLength &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(ghost.encodedControls) &&
    typeof ghost.checksum === "string" &&
    ghost.checksum === tideSprintGhostChecksum({
      schemaVersion: 1,
      planHash: ghost.planHash,
      selected: ghost.selected as TideSprintCrewId,
      finishSec: ghost.finishSec,
      frameCount: Number(ghost.frameCount),
      encodedControls: ghost.encodedControls,
    })
  );
}

export function createDefaultTideSprintProgress(
  now = new Date(),
): TideSprintProgressV1 {
  return {
    schemaVersion: TIDE_SPRINT_PROGRESS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now.toISOString(),
    selected: "glowfin",
    bonds: { glowfin: 0, neri: 0, coralyn: 0 },
    totals: {
      runs: 0,
      wins: 0,
      finishSeconds: 0,
      currentRings: 0,
      collisions: 0,
    },
    bestFinishSec: null,
    bestGhost: null,
    completedObjectives: [],
    recentRunClaims: [],
  };
}

export function validateTideSprintProgress(
  value: unknown,
): value is TideSprintProgressV1 {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<TideSprintProgressV1>;
  const totals = progress.totals as Partial<TideSprintProgressV1["totals"]> | undefined;
  const objectives = progress.completedObjectives;
  const claims = progress.recentRunClaims;
  const validCount = (count: unknown) => (
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0
  );
  return (
    progress.schemaVersion === TIDE_SPRINT_PROGRESS_SCHEMA_VERSION &&
    validCount(progress.revision) &&
    safeIsoDate(progress.updatedAt) &&
    TIDE_SPRINT_CREW_IDS.includes(progress.selected as TideSprintCrewId) &&
    Boolean(progress.bonds) &&
    TIDE_SPRINT_CREW_IDS.every((id) => validCount(progress.bonds?.[id])) &&
    Boolean(totals) &&
    validCount(totals?.runs) &&
    validCount(totals?.wins) && Number(totals?.wins) <= Number(totals?.runs) &&
    typeof totals?.finishSeconds === "number" &&
    Number.isFinite(totals.finishSeconds) && totals.finishSeconds >= 0 &&
    validCount(totals?.currentRings) &&
    validCount(totals?.collisions) &&
    (progress.bestFinishSec === null || (
      typeof progress.bestFinishSec === "number" &&
      Number.isFinite(progress.bestFinishSec) &&
      progress.bestFinishSec >= 20 && progress.bestFinishSec <= 180
    )) &&
    (progress.bestGhost === null || validateTideSprintGhost(progress.bestGhost)) &&
    Array.isArray(objectives) &&
    objectives.length <= TIDE_SPRINT_OBJECTIVES.length &&
    new Set(objectives).size === objectives.length &&
    objectives.every((id) => OBJECTIVE_IDS.has(id)) &&
    Array.isArray(claims) && claims.length <= MAX_TIDE_SPRINT_RECENT_RUNS &&
    claims.every((claim) => (
      typeof claim === "string" && /^tide-sprint:[a-zA-Z0-9:._-]{1,108}$/.test(claim)
    ))
  );
}

function clone(progress: TideSprintProgressV1): TideSprintProgressV1 {
  return JSON.parse(JSON.stringify(progress)) as TideSprintProgressV1;
}

function bestTime(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function preferredGhost(
  left: TideSprintGhostReplayV1 | null,
  right: TideSprintGhostReplayV1 | null,
): TideSprintGhostReplayV1 | null {
  const candidates = [left, right]
    .filter((ghost): ghost is TideSprintGhostReplayV1 => validateTideSprintGhost(ghost))
    .sort((a, b) => a.finishSec - b.finishSec || a.checksum.localeCompare(b.checksum));
  return candidates[0] ? { ...candidates[0] } : null;
}

export function mergeTideSprintProgress(
  local: TideSprintProgressV1,
  remote: TideSprintProgressV1,
  now = new Date(),
): TideSprintProgressV1 {
  const preferred = local.revision >= remote.revision ? local : remote;
  return {
    schemaVersion: TIDE_SPRINT_PROGRESS_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    selected: preferred.selected,
    bonds: Object.fromEntries(TIDE_SPRINT_CREW_IDS.map((id) => [
      id,
      Math.max(local.bonds[id], remote.bonds[id]),
    ])) as Record<TideSprintCrewId, number>,
    totals: {
      runs: Math.max(local.totals.runs, remote.totals.runs),
      wins: Math.max(local.totals.wins, remote.totals.wins),
      finishSeconds: Math.max(local.totals.finishSeconds, remote.totals.finishSeconds),
      currentRings: Math.max(local.totals.currentRings, remote.totals.currentRings),
      collisions: Math.max(local.totals.collisions, remote.totals.collisions),
    },
    bestFinishSec: bestTime(local.bestFinishSec, remote.bestFinishSec),
    bestGhost: preferredGhost(local.bestGhost, remote.bestGhost),
    completedObjectives: Array.from(new Set([
      ...local.completedObjectives,
      ...remote.completedObjectives,
    ])).sort() as TideSprintObjectiveId[],
    recentRunClaims: Array.from(new Set([
      ...local.recentRunClaims,
      ...remote.recentRunClaims,
    ])).sort().slice(-MAX_TIDE_SPRINT_RECENT_RUNS),
  };
}

export function tideSprintRunClaimId(runId: string): string {
  const safe = runId.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 108);
  return `tide-sprint:${safe || "unknown"}`;
}

function objectiveCompleted(
  objective: TideSprintObjectiveDefinition,
  record: TideSprintRaceRecord,
): boolean {
  if (objective.id === "first-finish") return true;
  if (objective.id === "six-current-rings") return record.boostsCollected >= 6;
  return record.placement === 1;
}

export function applyTideSprintRace(
  current: TideSprintProgressV1,
  record: TideSprintRaceRecord,
  now = new Date(),
): TideSprintModeRecordResult {
  const claimId = tideSprintRunClaimId(record.runId);
  if (current.recentRunClaims.includes(claimId)) {
    return {
      progress: clone(current),
      award: {
        pearls: 0,
        xp: 0,
        bond: 0,
        newlyCompletedObjectives: [],
      },
      claimId,
      duplicatePrevented: true,
      newBest: false,
      ghostSaved: false,
    };
  }

  const placement = Math.max(1, Math.min(4, Math.floor(record.placement)));
  const elapsedSec = Math.max(20, Math.min(180, record.elapsedSec));
  const boostsCollected = clampCount(record.boostsCollected, 12);
  const collisions = clampCount(record.collisions, 128);
  const basePearls = [22, 16, 12, 9][placement - 1]!;
  const baseXp = [16, 12, 9, 7][placement - 1]!;
  const bond = [3, 2, 1, 1][placement - 1]!;
  const completed = new Set(current.completedObjectives);
  const newlyCompletedObjectives = TIDE_SPRINT_OBJECTIVES.filter((objective) => (
    !completed.has(objective.id) && objectiveCompleted(objective, record)
  ));
  for (const objective of newlyCompletedObjectives) completed.add(objective.id);
  const objectivePearls = newlyCompletedObjectives.reduce(
    (total, objective) => total + objective.rewardPearls,
    0,
  );
  const objectiveXp = newlyCompletedObjectives.reduce(
    (total, objective) => total + objective.rewardXp,
    0,
  );
  const newBest = current.bestFinishSec === null || elapsedSec < current.bestFinishSec;
  const validGhost = validateTideSprintGhost(record.ghost) &&
    Math.abs(record.ghost.finishSec - elapsedSec) <= 0.02;
  const ghostSaved = newBest && validGhost;
  const next: TideSprintProgressV1 = {
    ...clone(current),
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    selected: record.selected,
    bonds: {
      ...current.bonds,
      [record.selected]: clampCount(current.bonds[record.selected] + bond, 999),
    },
    totals: {
      runs: clampCount(current.totals.runs + 1),
      wins: clampCount(current.totals.wins + (placement === 1 ? 1 : 0)),
      finishSeconds: Math.max(0, current.totals.finishSeconds + elapsedSec),
      currentRings: clampCount(current.totals.currentRings + boostsCollected),
      collisions: clampCount(current.totals.collisions + collisions),
    },
    bestFinishSec: newBest ? elapsedSec : current.bestFinishSec,
    bestGhost: ghostSaved ? { ...record.ghost! } : current.bestGhost,
    completedObjectives: Array.from(completed).sort() as TideSprintObjectiveId[],
    recentRunClaims: [...current.recentRunClaims, claimId]
      .sort()
      .slice(-MAX_TIDE_SPRINT_RECENT_RUNS),
  };
  return {
    progress: next,
    award: {
      pearls: basePearls + boostsCollected + objectivePearls,
      xp: baseXp + Math.floor(boostsCollected / 2) + objectiveXp,
      bond,
      newlyCompletedObjectives,
    },
    claimId,
    duplicatePrevented: false,
    newBest,
    ghostSaved,
  };
}

export function selectTideSprintCrew(
  current: TideSprintProgressV1,
  selected: TideSprintCrewId,
  now = new Date(),
): TideSprintProgressV1 {
  if (current.selected === selected) return clone(current);
  return {
    ...clone(current),
    revision: current.revision + 1,
    updatedAt: now.toISOString(),
    selected,
  };
}
