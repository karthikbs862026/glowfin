import type { TuningConfig } from "../core/config";
import type { GlowfinReplayV1, ReplaySummary } from "../replay/replay";
import { CourseGenerator, MomentumProfile } from "../sim/course";
import { checkSolvability } from "../sim/solvability";

export type GlowfinRunMode = "fresh" | "ghost" | "daily" | "daily-ghost";
export type DailyClockStatus = "trusted" | "local" | "clock-rollback";
export type ObjectiveKind = "near-misses" | "distance" | "score" | "clean-runs" | "runs" | "daily-trials";

export interface DailyObjectiveDefinition {
  id: string;
  cadence: "daily" | "weekly";
  kind: ObjectiveKind;
  label: string;
  target: number;
  rewardPearls: number;
  rewardXp: number;
}
export interface DailyReplayRecord {
  dayId: string;
  score: number;
  replay: GlowfinReplayV1;
}

export interface DailyRetentionState {
  trustedDay: string | null;
  lastSessionDay: string | null;
  dailyClaims: string[];
  objectiveProgress: Record<string, number>;
  objectiveClaims: string[];
  bestDailyReplay: DailyReplayRecord | null;
  bestStreak: number;
}

export interface ResolvedDailyDay {
  dayId: string;
  status: DailyClockStatus;
  source: "server" | "local" | "saved";
}

export interface StreakSummary {
  current: number;
  best: number;
  graceAvailable: boolean;
  graceUsedForDay: string | null;
}

export interface ObjectiveUpdate {
  state: DailyRetentionState;
  objectives: Array<DailyObjectiveDefinition & { progress: number; completed: boolean }>;
  newlyCompleted: DailyObjectiveDefinition[];
  rewardPearls: number;
  rewardXp: number;
}

export interface DailyCompletion {
  state: DailyRetentionState;
  awarded: boolean;
  rejectedForClockRollback: boolean;
  usedGrace: boolean;
  rewardPearls: number;
  rewardXp: number;
  streak: StreakSummary;
}

export const DAILY_TRIAL_REWARD_PEARLS = 36;
export const DAILY_TRIAL_REWARD_XP = 36;
export const MAX_DAILY_CLAIMS = 400;
export const MAX_OBJECTIVE_CLAIMS = 512;
export const MAX_OBJECTIVE_PROGRESS_KEYS = 64;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function cloneDaily(state: DailyRetentionState): DailyRetentionState {
  return JSON.parse(JSON.stringify(state)) as DailyRetentionState;
}

function uniqueBounded(values: readonly string[], max: number): string[] {
  return Array.from(new Set(values)).sort().slice(-max);
}

export function isDayId(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function dayIdFromDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dayNumber(dayId: string): number {
  if (!isDayId(dayId)) return Number.NaN;
  return Math.floor(Date.parse(`${dayId}T00:00:00.000Z`) / DAY_MS);
}

export function dayIdFromNumber(value: number): string {
  return new Date(Math.floor(value) * DAY_MS).toISOString().slice(0, 10);
}

export function dailySeed(dayId: string): number {
  if (!isDayId(dayId)) throw new Error(`Invalid Glowfin daily day: ${dayId}`);
  return hashText(`glowfin-moonwake-daily-v1:${dayId}`);
}

function weekAnchor(dayId: string): string {
  const value = dayNumber(dayId);
  const utcDay = new Date(value * DAY_MS).getUTCDay();
  const mondayOffset = (utcDay + 6) % 7;
  return dayIdFromNumber(value - mondayOffset);
}

export function createDefaultDailyRetention(): DailyRetentionState {
  return {
    trustedDay: null,
    lastSessionDay: null,
    dailyClaims: [],
    objectiveProgress: {},
    objectiveClaims: [],
    bestDailyReplay: null,
    bestStreak: 0
  };
}

export function resolveDailyDay(
  now = new Date(),
  savedTrustedDay: string | null = null,
  serverDay: string | null = null
): ResolvedDailyDay {
  if (isDayId(serverDay)) {
    return { dayId: serverDay, status: "trusted", source: "server" };
  }
  const localDay = dayIdFromDate(now);
  if (isDayId(savedTrustedDay) && dayNumber(localDay) < dayNumber(savedTrustedDay)) {
    return { dayId: savedTrustedDay, status: "clock-rollback", source: "saved" };
  }
  return { dayId: localDay, status: "local", source: "local" };
}

export function rotatingObjectives(dayId: string): DailyObjectiveDefinition[] {
  if (!isDayId(dayId)) return [];
  const rotation = dailySeed(dayId);
  const dailyA = [
    { kind: "near-misses" as const, label: "Thread 4 luminous near-misses", target: 4 },
    { kind: "distance" as const, label: "Ride 900m of moon-current", target: 900 },
    { kind: "score" as const, label: "Gather 1,800 current score", target: 1800 }
  ][rotation % 3]!;
  const dailyB = [
    { kind: "clean-runs" as const, label: "Finish 1 current without a hit", target: 1 },
    { kind: "daily-trials" as const, label: "Complete today’s Tide Trial", target: 1 },
    { kind: "runs" as const, label: "Complete 2 Moonwake runs", target: 2 }
  ][Math.floor(rotation / 3) % 3]!;
  const weekly = [
    { kind: "runs" as const, label: "Complete 7 runs this tide-week", target: 7 },
    { kind: "near-misses" as const, label: "Thread 18 near-misses this tide-week", target: 18 },
    { kind: "distance" as const, label: "Ride 4,500m this tide-week", target: 4500 }
  ][Math.floor(rotation / 9) % 3]!;
  const week = weekAnchor(dayId);
  return [
    {
      id: `daily:${dayId}:${dailyA.kind}:${dailyA.target}`,
      cadence: "daily",
      ...dailyA,
      rewardPearls: 24,
      rewardXp: 24
    },
    {
      id: `daily:${dayId}:${dailyB.kind}:${dailyB.target}`,
      cadence: "daily",
      ...dailyB,
      rewardPearls: 28,
      rewardXp: 28
    },
    {
      id: `weekly:${week}:${weekly.kind}:${weekly.target}`,
      cadence: "weekly",
      ...weekly,
      rewardPearls: 72,
      rewardXp: 72
    }
  ];
}

function objectiveIncrement(
  objective: DailyObjectiveDefinition,
  summary: ReplaySummary,
  mode: GlowfinRunMode
): number {
  switch (objective.kind) {
    case "near-misses": return Math.max(0, Math.floor(summary.nearMisses));
    case "distance": return Math.max(0, summary.forwardDistance);
    case "score": return Math.max(0, summary.score);
    case "clean-runs": return summary.collisions === 0 && summary.elapsedSec >= 20 ? 1 : 0;
    case "runs": return 1;
    case "daily-trials": return mode === "daily" || mode === "daily-ghost" ? 1 : 0;
  }
}

export function applyObjectiveRun(
  state: DailyRetentionState,
  dayId: string,
  summary: ReplaySummary,
  mode: GlowfinRunMode,
  allowCalendarRewards = true
): ObjectiveUpdate {
  const next = cloneDaily(state);
  const definitions = rotatingObjectives(dayId);
  const claimed = new Set(next.objectiveClaims);
  const newlyCompleted: DailyObjectiveDefinition[] = [];
  if (allowCalendarRewards) {
    for (const objective of definitions) {
      const previous = Number(next.objectiveProgress[objective.id] ?? 0);
      const value = Math.min(
        objective.target,
        Math.max(0, previous + objectiveIncrement(objective, summary, mode))
      );
      next.objectiveProgress[objective.id] = value;
      if (value >= objective.target && !claimed.has(objective.id)) {
        claimed.add(objective.id);
        newlyCompleted.push(objective);
      }
    }
  }
  next.objectiveClaims = uniqueBounded([...claimed], MAX_OBJECTIVE_CLAIMS);
  const activeIds = new Set(definitions.map((entry) => entry.id));
  const retainedProgress = Object.entries(next.objectiveProgress)
    .filter(([id]) => activeIds.has(id) || claimed.has(id))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-MAX_OBJECTIVE_PROGRESS_KEYS);
  next.objectiveProgress = Object.fromEntries(retainedProgress);
  const rewardPearls = newlyCompleted.reduce((sum, item) => sum + item.rewardPearls, 0);
  const rewardXp = newlyCompleted.reduce((sum, item) => sum + item.rewardXp, 0);
  return {
    state: next,
    objectives: definitions.map((objective) => ({
      ...objective,
      progress: Math.min(objective.target, next.objectiveProgress[objective.id] ?? 0),
      completed: claimed.has(objective.id)
    })),
    newlyCompleted,
    rewardPearls,
    rewardXp
  };
}

export function summarizeStreak(
  dailyClaims: readonly string[],
  historicalBest = 0
): StreakSummary {
  const days = uniqueBounded(dailyClaims.filter(isDayId), MAX_DAILY_CLAIMS)
    .map(dayNumber)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (days.length < 1) {
    return { current: 0, best: Math.max(0, historicalBest), graceAvailable: true, graceUsedForDay: null };
  }
  let segmentLength = 1;
  let segmentUsedGrace = false;
  let segmentGraceDay: number | null = null;
  let best = Math.max(1, historicalBest);
  for (let index = 1; index < days.length; index++) {
    const previous = days[index - 1]!;
    const current = days[index]!;
    const gap = current - previous;
    if (gap === 1) {
      segmentLength += 1;
    } else if (gap === 2 && !segmentUsedGrace) {
      segmentLength += 1;
      segmentUsedGrace = true;
      segmentGraceDay = previous + 1;
    } else if (gap > 0) {
      best = Math.max(best, segmentLength);
      segmentLength = 1;
      segmentUsedGrace = false;
      segmentGraceDay = null;
    }
  }
  best = Math.max(best, segmentLength);
  return {
    current: segmentLength,
    best,
    graceAvailable: !segmentUsedGrace,
    graceUsedForDay: segmentGraceDay === null ? null : dayIdFromNumber(segmentGraceDay)
  };
}

export function completeDailyTrial(
  state: DailyRetentionState,
  dayId: string,
  allowCalendarRewards = true
): DailyCompletion {
  const next = cloneDaily(state);
  const rollback = isDayId(next.trustedDay) && dayNumber(dayId) < dayNumber(next.trustedDay);
  const canAward = allowCalendarRewards && isDayId(dayId) && !rollback;
  const existing = new Set(next.dailyClaims);
  const before = summarizeStreak([...existing], next.bestStreak);
  const awarded = canAward && !existing.has(dayId);
  if (awarded) existing.add(dayId);
  next.dailyClaims = uniqueBounded([...existing], MAX_DAILY_CLAIMS);
  if (isDayId(dayId) && (!isDayId(next.trustedDay) || dayNumber(dayId) > dayNumber(next.trustedDay))) {
    next.trustedDay = dayId;
  }
  const streak = summarizeStreak(next.dailyClaims, next.bestStreak);
  next.bestStreak = streak.best;
  return {
    state: next,
    awarded,
    rejectedForClockRollback: rollback || !allowCalendarRewards,
    usedGrace: awarded && before.graceAvailable && !streak.graceAvailable,
    rewardPearls: awarded ? DAILY_TRIAL_REWARD_PEARLS : 0,
    rewardXp: awarded ? DAILY_TRIAL_REWARD_XP : 0,
    streak
  };
}

export function recordDailyReplay(
  state: DailyRetentionState,
  dayId: string,
  replay: GlowfinReplayV1 | null
): DailyRetentionState {
  if (!replay || !isDayId(dayId) || replay.seed !== dailySeed(dayId)) return cloneDaily(state);
  const next = cloneDaily(state);
  const existing = next.bestDailyReplay;
  if (!existing || existing.dayId !== dayId || replay.summary.score > existing.score) {
    next.bestDailyReplay = { dayId, score: replay.summary.score, replay };
  }
  return next;
}

export function mergeDailyRetention(
  local: DailyRetentionState,
  remote: DailyRetentionState
): DailyRetentionState {
  const dailyClaims = uniqueBounded(
    [...local.dailyClaims, ...remote.dailyClaims].filter(isDayId),
    MAX_DAILY_CLAIMS
  );
  const objectiveClaims = uniqueBounded(
    [...local.objectiveClaims, ...remote.objectiveClaims],
    MAX_OBJECTIVE_CLAIMS
  );
  const progress: Record<string, number> = {};
  for (const [id, value] of [
    ...Object.entries(local.objectiveProgress),
    ...Object.entries(remote.objectiveProgress)
  ]) {
    if (!Number.isFinite(value) || value < 0) continue;
    progress[id] = Math.max(progress[id] ?? 0, value);
  }
  const replayCandidates = [local.bestDailyReplay, remote.bestDailyReplay]
    .filter((entry): entry is DailyReplayRecord => Boolean(entry))
    .sort((a, b) => (
      dayNumber(b.dayId) - dayNumber(a.dayId) || b.score - a.score
    ));
  const trustedCandidates = [local.trustedDay, remote.trustedDay]
    .filter(isDayId)
    .sort((a, b) => dayNumber(b) - dayNumber(a));
  const sessionCandidates = [local.lastSessionDay, remote.lastSessionDay]
    .filter(isDayId)
    .sort((a, b) => dayNumber(b) - dayNumber(a));
  const streak = summarizeStreak(
    dailyClaims,
    Math.max(local.bestStreak, remote.bestStreak)
  );
  return {
    trustedDay: trustedCandidates[0] ?? null,
    lastSessionDay: sessionCandidates[0] ?? null,
    dailyClaims,
    objectiveProgress: Object.fromEntries(
      Object.entries(progress).sort(([a], [b]) => a.localeCompare(b)).slice(-MAX_OBJECTIVE_PROGRESS_KEYS)
    ),
    objectiveClaims,
    bestDailyReplay: replayCandidates[0] ?? null,
    bestStreak: streak.best
  };
}

export function proveDailyCourseSolvable(
  dayId: string,
  cfg: TuningConfig,
  distance = 4_000
): boolean {
  const seed = dailySeed(dayId);
  const generator = new CourseGenerator(seed, cfg, { profileDistance: distance + 2_000 });
  generator.ensureGeneratedTo(distance);
  return checkSolvability(
    generator.gates,
    cfg,
    new MomentumProfile(cfg, distance + 2_000)
  ).solvable;
}

export interface HostedDailyClockResponse {
  dayId: string;
  seed: number;
}

export class HostedDailyClockClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly endpoint = "/api/glowfin/daily"
  ) {}

  async load(signal?: AbortSignal): Promise<HostedDailyClockResponse | null> {
    const response = await this.fetcher(this.endpoint, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal
    });
    if (!response.ok) return null;
    const value = await response.json() as Partial<HostedDailyClockResponse>;
    if (!isDayId(value.dayId) || value.seed !== dailySeed(value.dayId)) return null;
    return { dayId: value.dayId, seed: value.seed };
  }
}
