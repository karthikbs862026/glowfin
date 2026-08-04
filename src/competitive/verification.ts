import { tuning } from "../core/config";
import { FIXED_DT_SEC } from "../core/timestep";
import { dailySeed, isDayId } from "../meta/daily";
import {
  ReplayPlayer,
  validateReplay,
  type ReplaySummary
} from "../replay/replay";
import { Run } from "../sim/run";
import {
  isLeaderboardSubmission,
  type LeaderboardSubmissionV1
} from "./leaderboard";

export const LEADERBOARD_VALIDATION_VERSION = "phase4b-v1";

export interface LeaderboardVerificationResult {
  valid: boolean;
  reason: string | null;
  verificationDigest: string | null;
  recomputed: ReplaySummary | null;
}

function digestText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function closeEnough(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) <= tolerance;
}

function rejected(reason: string): LeaderboardVerificationResult {
  return { valid: false, reason, verificationDigest: null, recomputed: null };
}

/**
 * Server-safe anti-cheat authority. This does not trust the client's score,
 * collision count, distance, duration, seed or Daily Tide claim. It validates
 * the compact replay and then executes the same fixed-step simulation until
 * the run ends, comparing every leaderboard-relevant result.
 */
export function verifyLeaderboardSubmission(
  value: unknown
): LeaderboardVerificationResult {
  if (!isLeaderboardSubmission(value)) return rejected("invalid-submission");
  const submission = value as LeaderboardSubmissionV1;
  const replayValidation = validateReplay(submission.replay);
  if (!replayValidation.valid) {
    return rejected(`invalid-replay:${replayValidation.reason ?? "unknown"}`);
  }
  if (submission.replay.tuningVersion !== tuning.version) {
    return rejected("unsupported-tuning-version");
  }
  if (Math.abs(submission.replay.fixedDtSec - FIXED_DT_SEC) > 1e-12) {
    return rejected("fixed-timestep-mismatch");
  }
  const dailyMode = submission.mode === "daily" || submission.mode === "daily-ghost";
  if (dailyMode) {
    if (!isDayId(submission.dayId)) return rejected("daily-day-required");
    if (submission.replay.seed !== dailySeed(submission.dayId)) {
      return rejected("daily-seed-mismatch");
    }
  } else if (submission.dayId !== null) {
    return rejected("unexpected-daily-day");
  }

  const run = new Run(submission.replay.seed, tuning);
  const player = new ReplayPlayer(submission.replay);
  let endedAtStep: number | null = null;
  for (let step = 1; step <= submission.replay.totalSteps; step++) {
    const command = player.next();
    if (command === null) return rejected("replay-ended-early");
    const events = run.step(FIXED_DT_SEC, command);
    if (events.justEnded) endedAtStep = step;
  }
  if (!player.complete) return rejected("replay-not-consumed");
  if (!run.ended || run.endReason !== "light-depleted") {
    return rejected("run-did-not-reach-authoritative-end");
  }
  if (endedAtStep !== submission.replay.totalSteps) {
    return rejected("commands-continue-after-run-end");
  }

  const recomputed: ReplaySummary = {
    score: run.scoring.score,
    elapsedSec: run.sim.elapsedSec,
    forwardDistance: run.sim.forwardDistance,
    nearMisses: run.scoring.nearMissCount,
    collisions: run.collisionCount
  };
  const claimed = submission.replay.summary;
  if (!closeEnough(recomputed.score, claimed.score, 1e-5)) {
    return rejected("score-mismatch");
  }
  if (!closeEnough(recomputed.elapsedSec, claimed.elapsedSec, FIXED_DT_SEC * 1.5)) {
    return rejected("duration-mismatch");
  }
  if (!closeEnough(recomputed.forwardDistance, claimed.forwardDistance, 1e-5)) {
    return rejected("distance-mismatch");
  }
  if (recomputed.nearMisses !== claimed.nearMisses) return rejected("near-miss-mismatch");
  if (recomputed.collisions !== claimed.collisions) return rejected("collision-mismatch");

  const verificationDigest = digestText(JSON.stringify({
    version: LEADERBOARD_VALIDATION_VERSION,
    replayChecksum: submission.replay.checksum,
    division: submission.classification.division,
    mode: submission.mode,
    dayId: submission.dayId,
    summary: recomputed
  }));
  return {
    valid: true,
    reason: null,
    verificationDigest,
    recomputed
  };
}
