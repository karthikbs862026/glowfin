import assert from "node:assert/strict";
import { test } from "vitest";

import { tuning } from "../src/core/config";
import {
  EXPEDITION_PROGRESS_PRIMARY_KEY,
  ExpeditionProgressRepository,
  createDefaultExpeditionProgress,
  mergeExpeditionProgress,
} from "../src/expedition/progress";
import {
  R5_BEAT_ORDER,
  R5_CURRENT_BREAK_TARGET,
  R5_PLAN_HASH,
  R5CompletionDirector,
  type R5CompletionSnapshot,
  type R5MotionSample,
} from "../src/expedition/r5Completion";
import { Run } from "../src/sim/run";
import { gateSolvabilityOpening } from "../src/sim/course";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function motion(
  fromDistance: number,
  toDistance: number,
  fromLateral: number,
  toLateral: number,
  elapsedSec: number,
): R5MotionSample {
  return {
    fromDistance,
    toDistance,
    fromLateral,
    toLateral,
    elapsedSec,
    collisionCount: 0,
    gates: [],
    laneHalfWidth: tuning.lane.halfWidth,
    creatureRadius: tuning.lane.creatureRadius,
  };
}

function completeR5(): R5CompletionSnapshot {
  const director = new R5CompletionDirector({ durationScale: 8 });
  let elapsedSec = 100;
  let distance = 0;
  let lateral = 0;
  director.startAfterR3(motion(0, 0, 0, 0, elapsedSec));

  for (let index = 0; index < R5_CURRENT_BREAK_TARGET; index += 1) {
    const target = director.snapshot();
    assert.notEqual(target.targetDistance, null);
    assert.notEqual(target.targetLateral, null);
    const targetDistance = target.targetDistance!;
    const targetLateral = target.targetLateral!;
    elapsedSec += 1;
    director.step(motion(
      distance,
      targetDistance,
      lateral,
      targetLateral,
      elapsedSec,
    ));
    distance = targetDistance;
    lateral = targetLateral;
  }

  assert.equal(director.snapshot().beat, "return-moonwell");
  const finish = director.snapshot();
  const finishDistance = finish.targetDistance!;
  const finishLateral = finish.targetLateral!;
  elapsedSec += 1;
  director.step(motion(
    distance,
    finishDistance,
    lateral,
    finishLateral,
    elapsedSec,
  ));
  distance = finishDistance;
  lateral = finishLateral;
  elapsedSec += 4;
  director.step(motion(distance, distance, lateral, lateral, elapsedSec));
  return { ...director.snapshot() };
}

test("Version 41-R5 plan is deterministic and completes only after three real Current Breaks", () => {
  assert.deepEqual(R5_BEAT_ORDER, [
    "await-r3",
    "duskmaw",
    "return-moonwell",
    "r5-complete",
  ]);
  assert.match(R5_PLAN_HASH, /^[a-f0-9]{8}$/);
  const first = completeR5();
  const second = completeR5();
  assert.deepEqual(first, second);
  assert.equal(first.currentBreaks, 3);
  assert.equal(first.currentBreakMisses, 0);
  assert.equal(first.cleanChase, true);
  assert.equal(first.finishReached, true);
  assert.equal(first.moonWellRestored, true);
  assert.equal(first.r5Complete, true);
});

test("missed Current Breaks return ahead and prevent a clean-chase mark", () => {
  const director = new R5CompletionDirector({ durationScale: 8 });
  director.startAfterR3(motion(0, 0, 0, 0, 10));
  const target = director.snapshot();
  const targetDistance = target.targetDistance!;
  const targetLateral = target.targetLateral!;
  const events = director.step(motion(
    0,
    targetDistance + 5,
    0,
    -targetLateral,
    11,
  ));
  assert.equal(events.currentBreakReturned, true);
  assert.equal(director.snapshot().currentBreakMisses, 1);
  assert.equal(director.snapshot().cleanChase, false);
  assert.ok(director.snapshot().targetDistance! > targetDistance);
});

test("Expedition completion claims are idempotent and recover from a corrupt primary copy", () => {
  const storage = new MemoryStorage();
  const repository = new ExpeditionProgressRepository(
    storage,
    () => new Date("2026-08-09T00:00:00.000Z"),
  );
  repository.load();
  const input = {
    claimId: "run_alpha",
    planHash: R5_PLAN_HASH,
    primaryObjective: true,
    relicFound: true,
    bestLumenChain: 8,
    miriRescued: true,
    neriFinishGap: 2.5,
    currentBreaks: 3,
    cleanChase: true,
    moonWellRestored: true,
  } as const;
  const first = repository.recordCompletion(input);
  assert.equal(first.claimed, true);
  assert.equal(first.progress.moonWellRestored, true);
  assert.deepEqual(first.newlyDiscoveredRelics, ["moonseed-fragment"]);
  const duplicate = repository.recordCompletion(input);
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.duplicatePrevented, true);
  assert.equal(duplicate.progress.cleanChaseCompletions, 1);

  repository.recordCompletion({ ...input, claimId: "run_beta" });
  storage.setItem(EXPEDITION_PROGRESS_PRIMARY_KEY, "{corrupt");
  const recovered = new ExpeditionProgressRepository(storage).load();
  assert.equal(recovered.recoveredFrom, "backup");
  assert.equal(recovered.recoveryReason, "primary-corrupt");
  assert.equal(recovered.progress.moonWellRestored, true);
  assert.equal(recovered.progress.cleanChaseCompletions, 1);
});

test("Expedition progress merge is monotonic across marks, relics, and best results", () => {
  const local = createDefaultExpeditionProgress(
    new Date("2026-08-09T00:00:00.000Z"),
  );
  local.revision = 3;
  local.discoveredRelics = ["moonseed-fragment"];
  local.completionMarks.hiddenRelic = true;
  local.bestLumenChain = 8;
  const remote = createDefaultExpeditionProgress(
    new Date("2026-08-09T00:00:01.000Z"),
  );
  remote.revision = 5;
  remote.completionMarks.primaryObjective = true;
  remote.moonWellRestored = true;
  remote.bestCurrentBreaks = 3;
  const merged = mergeExpeditionProgress(local, remote);
  assert.equal(merged.revision, 6);
  assert.deepEqual(merged.discoveredRelics, ["moonseed-fragment"]);
  assert.equal(merged.completionMarks.hiddenRelic, true);
  assert.equal(merged.completionMarks.primaryObjective, true);
  assert.equal(merged.bestLumenChain, 8);
  assert.equal(merged.bestCurrentBreaks, 3);
  assert.equal(merged.moonWellRestored, true);
});

test("ceremonial completion ends Run on an exact fixed-step boundary", () => {
  const run = new Run(41, tuning);
  assert.equal(run.requestEnd("expedition-complete"), true);
  assert.equal(run.requestEnd("expedition-complete"), false);
  const events = run.step(1 / 60, 0);
  assert.equal(events.justEnded, true);
  assert.equal(run.ended, true);
  assert.equal(run.endReason, "expedition-complete");
  assert.equal(run.sim.elapsedSec, 0);
  assert.equal(run.step(1 / 60, 0).justEnded, false);
});

test("Version 41 survives a deterministic 5,400-frame clean-current soak", () => {
  const first = new Run(0x4d4f4f4e, tuning);
  const second = new Run(0x4d4f4f4e, tuning);
  for (let frame = 0; frame < 5_400; frame += 1) {
    const gate = first.gates.find((candidate) => (
      candidate.distance > first.sim.forwardDistance + 0.01
    ));
    const opening = gate ? gateSolvabilityOpening(gate) : null;
    const targetLateral = opening
      ? (opening.gapLeft + opening.gapRight) * 0.5
      : 0;
    const steering = Math.max(-1, Math.min(
      1,
      (targetLateral - first.sim.lateralPosition) * 1.5,
    ));
    const firstEvents = first.step(1 / 60, steering);
    const secondEvents = second.step(1 / 60, steering);
    assert.deepEqual(secondEvents, firstEvents, `frame ${frame}`);
  }
  assert.deepEqual(second.snapshot(), first.snapshot());
  assert.equal(first.ended, false);
  assert.equal(first.collisionCount, 0);
  assert.ok(first.sim.forwardDistance > 3_800);
  assert.ok(first.gates.length <= 16, "course gate pool stays bounded");
});
