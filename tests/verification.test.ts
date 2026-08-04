import { describe, expect, it } from "vitest";
import { classifyRunAccess, defaultAccessPreferences } from "../src/competitive/assists";
import {
  LEADERBOARD_VALIDATION_VERSION,
  verifyLeaderboardSubmission
} from "../src/competitive/verification";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC } from "../src/core/timestep";
import {
  ReplayRecorder,
  replayChecksum,
  unsignedReplay,
  type GlowfinReplayV1
} from "../src/replay/replay";
import { Run } from "../src/sim/run";

function completedReplay(seed = 0x34c0ffee): GlowfinReplayV1 {
  const run = new Run(seed, tuning);
  const recorder = new ReplayRecorder(seed, tuning.version);
  for (let step = 0; step < 100_000 && !run.ended; step++) {
    const command = Math.sin(step * 0.013) * 0.18;
    recorder.record(command);
    run.step(FIXED_DT_SEC, command);
  }
  expect(run.ended).toBe(true);
  const replay = recorder.finish({
    score: run.scoring.score,
    elapsedSec: run.sim.elapsedSec,
    forwardDistance: run.sim.forwardDistance,
    nearMisses: run.scoring.nearMissCount,
    collisions: run.collisionCount
  });
  expect(replay).not.toBeNull();
  return replay!;
}

function submission(replay = completedReplay()) {
  return {
    schemaVersion: 1 as const,
    runId: "run_verification-34",
    mode: "fresh" as const,
    dayId: null,
    replay,
    classification: classifyRunAccess(defaultAccessPreferences(false))
  };
}

function resign(replay: GlowfinReplayV1): GlowfinReplayV1 {
  replay.checksum = replayChecksum(unsignedReplay(replay));
  return replay;
}

describe("Version 34 deterministic leaderboard authority", () => {
  it("re-simulates a complete run and returns a stable verification digest", () => {
    const result = verifyLeaderboardSubmission(submission());
    expect(result).toMatchObject({
      valid: true,
      reason: null
    });
    expect(result.verificationDigest).toMatch(/^[0-9a-f]{8}$/);
    expect(LEADERBOARD_VALIDATION_VERSION).toBe("phase4b-v1");
  });

  it("rejects a re-signed score claim that disagrees with simulation", () => {
    const replay = JSON.parse(JSON.stringify(completedReplay())) as GlowfinReplayV1;
    replay.summary.score += 100;
    resign(replay);
    expect(verifyLeaderboardSubmission(submission(replay))).toMatchObject({
      valid: false,
      reason: "score-mismatch"
    });
  });

  it("rejects commands appended after the authoritative run end", () => {
    const replay = JSON.parse(JSON.stringify(completedReplay())) as GlowfinReplayV1;
    const last = replay.commands[replay.commands.length - 1]?.[0] ?? 0;
    replay.commands.push([last === 1 ? -1 : 1, 1]);
    replay.totalSteps += 1;
    replay.summary.elapsedSec += FIXED_DT_SEC;
    resign(replay);
    expect(verifyLeaderboardSubmission(submission(replay))).toMatchObject({
      valid: false,
      reason: "commands-continue-after-run-end"
    });
  });

  it("rejects a Daily Tide label whose shared seed does not match", () => {
    const value = {
      ...submission(),
      mode: "daily" as const,
      dayId: "2026-08-04"
    };
    expect(verifyLeaderboardSubmission(value)).toMatchObject({
      valid: false,
      reason: "daily-seed-mismatch"
    });
  });
});
