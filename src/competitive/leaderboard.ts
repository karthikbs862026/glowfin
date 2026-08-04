import type { GlowfinRunMode } from "../meta/daily";
import type { GlowfinReplayV1 } from "../replay/replay";
import {
  isRunAccessClassification,
  type LeaderboardDivision,
  type RunAccessClassificationV1
} from "./assists";

export const LEADERBOARD_CONTRACT_VERSION = 1 as const;
export const MAX_LEADERBOARD_ENTRIES = 25;

export type LeaderboardScope = "global" | "daily";

export interface LeaderboardSubmissionV1 {
  schemaVersion: typeof LEADERBOARD_CONTRACT_VERSION;
  runId: string;
  mode: GlowfinRunMode;
  dayId: string | null;
  replay: GlowfinReplayV1;
  classification: RunAccessClassificationV1;
}

export interface LeaderboardEntryV1 {
  entryId: string;
  rank: number;
  alias: string;
  score: number;
  nearMisses: number;
  elapsedSec: number;
  division: LeaderboardDivision;
  submittedAt: string;
}

export interface LeaderboardSnapshotV1 {
  schemaVersion: typeof LEADERBOARD_CONTRACT_VERSION;
  scope: LeaderboardScope;
  dayId: string | null;
  division: LeaderboardDivision;
  entries: LeaderboardEntryV1[];
  playerRank: number | null;
  validationVersion: string;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDayId(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isRunMode(value: unknown): value is GlowfinRunMode {
  return value === "fresh" || value === "ghost" || value === "daily" || value === "daily-ghost";
}

export function isLeaderboardSubmission(value: unknown): value is LeaderboardSubmissionV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeaderboardSubmissionV1>;
  const dailyMode = candidate.mode === "daily" || candidate.mode === "daily-ghost";
  return (
    candidate.schemaVersion === LEADERBOARD_CONTRACT_VERSION &&
    typeof candidate.runId === "string" &&
    /^run_[a-zA-Z0-9-]{8,80}$/.test(candidate.runId) &&
    isRunMode(candidate.mode) &&
    (candidate.dayId === null || isDayId(candidate.dayId)) &&
    dailyMode === isDayId(candidate.dayId) &&
    Boolean(candidate.replay) &&
    isRunAccessClassification(candidate.classification)
  );
}

function isEntry(value: unknown): value is LeaderboardEntryV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeaderboardEntryV1>;
  return (
    typeof candidate.entryId === "string" && /^ent_[a-zA-Z0-9-]{8,80}$/.test(candidate.entryId) &&
    Number.isInteger(candidate.rank) && Number(candidate.rank) >= 1 &&
    typeof candidate.alias === "string" && candidate.alias.length >= 3 && candidate.alias.length <= 32 &&
    typeof candidate.score === "number" && Number.isFinite(candidate.score) && candidate.score >= 0 &&
    Number.isInteger(candidate.nearMisses) && Number(candidate.nearMisses) >= 0 &&
    typeof candidate.elapsedSec === "number" && Number.isFinite(candidate.elapsedSec) && candidate.elapsedSec >= 0 &&
    (candidate.division === "standard" || candidate.division === "assisted") &&
    typeof candidate.submittedAt === "string" && Number.isFinite(Date.parse(candidate.submittedAt))
  );
}

export function isLeaderboardSnapshot(value: unknown): value is LeaderboardSnapshotV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeaderboardSnapshotV1>;
  return (
    candidate.schemaVersion === LEADERBOARD_CONTRACT_VERSION &&
    (candidate.scope === "global" || candidate.scope === "daily") &&
    (candidate.dayId === null || isDayId(candidate.dayId)) &&
    (candidate.scope === "daily") === isDayId(candidate.dayId) &&
    (candidate.division === "standard" || candidate.division === "assisted") &&
    Array.isArray(candidate.entries) &&
    candidate.entries.length <= MAX_LEADERBOARD_ENTRIES &&
    candidate.entries.every(isEntry) &&
    (candidate.playerRank === null || (
      Number.isInteger(candidate.playerRank) && Number(candidate.playerRank) >= 1
    )) &&
    typeof candidate.validationVersion === "string" &&
    /^[a-z0-9._-]{1,40}$/.test(candidate.validationVersion)
  );
}

async function readJson(response: Response, maxBytes = 256 * 1024): Promise<unknown> {
  const text = await response.text();
  if (text.length < 2 || text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export class HostedLeaderboardClient {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly endpoint = "/api/glowfin/leaderboard"
  ) {}

  async list(
    scope: LeaderboardScope,
    division: LeaderboardDivision,
    dayId: string | null = null,
    limit = 5,
    signal?: AbortSignal
  ): Promise<LeaderboardSnapshotV1> {
    const query = new URLSearchParams({
      scope,
      division,
      limit: String(Math.max(1, Math.min(MAX_LEADERBOARD_ENTRIES, Math.floor(limit))))
    });
    if (scope === "daily") {
      if (!isDayId(dayId)) throw new Error("Daily leaderboard requires a valid UTC day.");
      query.set("day", dayId);
    }
    const response = await this.fetcher(`${this.endpoint}?${query}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal
    });
    if (!response.ok) throw new Error(`Leaderboard load failed (${response.status}).`);
    const value = await readJson(response);
    if (!isLeaderboardSnapshot(value)) throw new Error("Leaderboard response is invalid.");
    return value;
  }

  async submit(
    submission: LeaderboardSubmissionV1,
    signal?: AbortSignal
  ): Promise<LeaderboardSnapshotV1> {
    if (!isLeaderboardSubmission(submission)) {
      throw new Error("Refusing to submit an invalid leaderboard run.");
    }
    const body = JSON.stringify(submission);
    if (body.length > 160 * 1024) throw new Error("Leaderboard replay is too large.");
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body,
      signal
    });
    const value = await readJson(response);
    if (!response.ok) {
      const reason = value && typeof value === "object"
        ? String((value as Record<string, unknown>)["error"] ?? "rejected")
        : "rejected";
      throw new Error(`Leaderboard submission ${reason} (${response.status}).`);
    }
    if (!isLeaderboardSnapshot(value)) throw new Error("Leaderboard response is invalid.");
    return value;
  }
}
