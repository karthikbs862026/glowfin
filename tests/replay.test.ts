import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC } from "../src/core/timestep";
import { Run } from "../src/sim/run";
import {
  ReplayPlayer,
  ReplayRecorder,
  validateReplay,
  type ReplaySummary
} from "../src/replay/replay";

function summary(steps: number, score = 12): ReplaySummary {
  return {
    score,
    elapsedSec: steps * FIXED_DT_SEC,
    forwardDistance: 18,
    nearMisses: 1,
    collisions: 0
  };
}

describe("deterministic Version 32 replay", () => {
  it("normalizes, compacts and plays fixed-step steering", () => {
    const recorder = new ReplayRecorder(123, tuning.version);
    for (const command of [-2, -2, 0.25, 0.25, Number.POSITIVE_INFINITY]) {
      recorder.record(command);
    }
    const replay = recorder.finish(summary(5));
    expect(replay).not.toBeNull();
    expect(replay?.commands).toEqual([[-1, 2], [0.25, 2], [0, 1]]);
    expect(validateReplay(replay)).toEqual({ valid: true, reason: null });

    const player = new ReplayPlayer(replay!);
    expect(Array.from({ length: 6 }, () => player.next())).toEqual([
      -1, -1, 0.25, 0.25, 0, null
    ]);
    expect(player.complete).toBe(true);
  });

  it("rejects checksum corruption", () => {
    const recorder = new ReplayRecorder(456, tuning.version);
    recorder.record(0.5);
    recorder.record(-0.5);
    const replay = recorder.finish(summary(2))!;
    const corrupt = JSON.parse(JSON.stringify(replay));
    corrupt.commands[0][0] = 0.75;
    expect(validateReplay(corrupt)).toEqual({
      valid: false,
      reason: "replay checksum mismatch"
    });
  });

  it("rejects a summary that disagrees with fixed-step duration", () => {
    const recorder = new ReplayRecorder(789, tuning.version);
    recorder.record(0);
    recorder.record(0);
    const replay = recorder.finish({ ...summary(2), elapsedSec: 99 })!;
    expect(validateReplay(replay)).toEqual({
      valid: false,
      reason: "replay duration does not match fixed steps"
    });
  });

  it("reproduces the same simulation state for the same seed and commands", () => {
    const seed = 0x32c0ffee;
    const original = new Run(seed, tuning);
    const recorder = new ReplayRecorder(seed, tuning.version);
    for (let step = 0; step < 600; step++) {
      const command = Math.sin(step * 0.071) * 0.82;
      recorder.record(command);
      original.step(FIXED_DT_SEC, command);
    }
    const replay = recorder.finish({
      score: original.scoring.score,
      elapsedSec: 600 * FIXED_DT_SEC,
      forwardDistance: original.sim.forwardDistance,
      nearMisses: original.scoring.nearMissCount,
      collisions: original.collisionCount
    })!;
    expect(validateReplay(replay).valid).toBe(true);

    const playback = new Run(seed, tuning);
    const player = new ReplayPlayer(replay);
    for (let step = 0; step < replay.totalSteps; step++) {
      playback.step(FIXED_DT_SEC, player.next()!);
    }
    expect(playback.snapshot()).toEqual(original.snapshot());
  });
});
