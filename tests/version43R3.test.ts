import assert from "node:assert/strict";
import { test } from "vitest";
import tuning from "../config/tuning.json" with { type: "json" };
import {
  CRYSTAL_PLATES_TO_RACE,
  slidingCrystalPlateOpeningAt,
} from "../src/realms/mechanics.ts";
import {
  CRYSTAL_TRENCH_REALM,
  KELP_CATHEDRAL_REALM,
  realmDefinitionIssues,
} from "../src/realms/definition.ts";
import {
  RealmProgressRepository,
  createDefaultRealmProgress,
  mergeRealmProgress,
} from "../src/realms/progress.ts";
import {
  CourseGenerator,
  MomentumProfile,
} from "../src/sim/course.ts";
import { gateOpeningsAt } from "../src/sim/gateGeometry.ts";
import { Run } from "../src/sim/run.ts";
import { checkSolvability } from "../src/sim/solvability.ts";
import { forwardSpeed } from "../src/sim/state.ts";

const STEP_SEC = 1 / 120;

function autopilot(run: Run): number {
  const gate = run.gates.find((candidate) => (
    candidate.distance > run.sim.forwardDistance + 1
  ));
  if (!gate) return 0;
  const timeToGate = (gate.distance - run.sim.forwardDistance) /
    Math.max(1, forwardSpeed(run.sim, tuning));
  const opening = gateOpeningsAt(
    gate,
    run.sim.elapsedSec + timeToGate,
  )[0];
  if (!opening) return 0;
  const center = (opening.left + opening.right) * 0.5;
  return Math.max(-1, Math.min(1, (center - run.sim.lateralPosition) * 0.9));
}

function runUntilEnd(
  seed: number,
  command: (run: Run) => number = autopilot,
  maximumSec = 110,
): Run {
  const run = new Run(seed, tuning, { realmId: "crystal-trench" });
  for (
    let step = 0;
    step < maximumSec / STEP_SEC && !run.ended;
    step += 1
  ) {
    run.step(STEP_SEC, command(run));
  }
  return run;
}

test("Crystal Trench R3 exposes the two required verbs and Neri hero encounter", () => {
  assert.deepEqual(realmDefinitionIssues(CRYSTAL_TRENCH_REALM), []);
  assert.match(CRYSTAL_TRENCH_REALM.title, /Mirror Current/);
  assert.ok(CRYSTAL_TRENCH_REALM.gameplayVerbs.includes("prism-pulse"));
  assert.ok(CRYSTAL_TRENCH_REALM.gameplayVerbs.includes("sliding-crystal-plates"));
  assert.ok(CRYSTAL_TRENCH_REALM.gameplayVerbs.includes("mirror-current-race"));
  assert.match(CRYSTAL_TRENCH_REALM.heroEncounter, /Neri/);
});

test("Sliding Crystal Plates share deterministic collision, render and proof truth", () => {
  const first = new CourseGenerator(0x43c0ffee, tuning, {
    realmId: "crystal-trench",
  });
  const second = new CourseGenerator(0x43c0ffee, tuning, {
    realmId: "crystal-trench",
  });
  first.ensureGeneratedTo(3200);
  second.ensureGeneratedTo(3200);
  assert.deepEqual(first.gates, second.gates);

  const plates = first.gates.filter((gate) => (
    gate.realmPlan?.verb === "sliding-crystal-plates"
  ));
  assert.ok(plates.length >= CRYSTAL_PLATES_TO_RACE * 2);
  for (const gate of plates.slice(0, 12)) {
    const plan = gate.realmPlan;
    assert.equal(plan?.verb, "sliding-crystal-plates");
    if (plan?.verb !== "sliding-crystal-plates") continue;
    for (const elapsedSec of [0, 0.5, 1.25, 2.8, 5.2]) {
      const direct = slidingCrystalPlateOpeningAt(plan, elapsedSec);
      const shared = gateOpeningsAt(gate, elapsedSec)[0];
      assert.ok(shared);
      assert.equal(shared?.left, direct.left);
      assert.equal(shared?.right, direct.right);
      assert.ok(direct.right - direct.left > tuning.lane.creatureRadius * 2);
    }
  }

  const report = checkSolvability(
    first.gates,
    tuning,
    new MomentumProfile(tuning, 4000),
  );
  assert.equal(report.solvable, true, JSON.stringify(report.violations.slice(0, 3)));
});

test("clean Crystal Trench runs last about a minute and finish close but winnable", () => {
  for (const seed of [1, 42, 0x43c0ffee, 987654321]) {
    const run = runUntilEnd(seed);
    const status = run.crystalTrenchStatus;
    assert.equal(run.endReason, "realm-complete", `seed ${seed}`);
    assert.equal(run.collisionCount, 0, `seed ${seed}`);
    assert.ok(run.sim.elapsedSec >= 58 && run.sim.elapsedSec <= 70, `seed ${seed}: ${run.sim.elapsedSec}`);
    assert.equal(status.thresholdCrossed, true);
    assert.ok(status.platesCleared >= CRYSTAL_PLATES_TO_RACE);
    assert.equal(status.raceWon, true);
    assert.equal(status.raceAttempts, 1);
    assert.equal(status.cleanPerformance, true);
    assert.ok(
      status.finishMarginSec !== null &&
      status.finishMarginSec > 0 &&
      status.finishMarginSec < 0.5,
      `seed ${seed}: ${status.finishMarginSec}`,
    );
  }
});

test("a missed Trench Gate reforms ahead without restarting the run", () => {
  let forcedMiss = false;
  const run = new Run(314159, tuning, { realmId: "crystal-trench" });
  for (let step = 0; step < 120 / STEP_SEC && !run.ended; step += 1) {
    const nextThreshold = run.gates.find((gate) => (
      gate.distance > run.sim.forwardDistance + 1 &&
      gate.realmPlan?.verb === "trench-threshold"
    ));
    const shouldForce = !forcedMiss && nextThreshold &&
      nextThreshold.distance - run.sim.forwardDistance < 95;
    const command = shouldForce
      ? ((nextThreshold.realmPlan?.verb === "trench-threshold" &&
          nextThreshold.realmPlan.center <= 0) ? 1 : -1)
      : autopilot(run);
    const events = run.step(STEP_SEC, command);
    if (events.realmEvents.some((event) => event.kind === "trench-threshold-missed")) {
      forcedMiss = true;
    }
  }
  assert.equal(forcedMiss, true);
  assert.equal(run.crystalTrenchStatus.thresholdCrossed, true);
  assert.ok(run.crystalTrenchStatus.thresholdRetries >= 1);
  assert.equal(run.endReason, "realm-complete");
});

test("a missed plate cadence repeats with the same sequence until read clean", () => {
  let forcedMiss = false;
  let missedSequence: string | null = null;
  let repeatedClean = false;
  const run = new Run(271828, tuning, { realmId: "crystal-trench" });
  for (let step = 0; step < 120 / STEP_SEC && !run.ended; step += 1) {
    const nextPlate = run.gates.find((gate) => (
      gate.distance > run.sim.forwardDistance + 1 &&
      gate.realmPlan?.verb === "sliding-crystal-plates"
    ));
    const shouldForce = !forcedMiss && run.crystalTrenchStatus.thresholdCrossed &&
      nextPlate && nextPlate.distance - run.sim.forwardDistance < 90;
    const command = shouldForce
      ? ((nextPlate.realmPlan?.verb === "sliding-crystal-plates" &&
          nextPlate.realmPlan.centers[1] <= 0) ? 1 : -1)
      : autopilot(run);
    const events = run.step(STEP_SEC, command);
    for (const event of events.realmEvents) {
      if (event.kind === "crystal-plate-missed" && !forcedMiss) {
        forcedMiss = true;
        const parts = event.templateId.split(":");
        missedSequence = parts[parts.length - 1] ?? null;
      } else if (
        event.kind === "crystal-plate" &&
        missedSequence !== null &&
        event.templateId.endsWith(`:${missedSequence}`)
      ) {
        repeatedClean = true;
      }
    }
  }
  assert.equal(forcedMiss, true);
  assert.equal(repeatedClean, true);
  assert.ok(run.crystalTrenchStatus.plateRetries >= 1);
  assert.equal(run.endReason, "realm-complete");
});

test("Crystal Trench completion saves are idempotent and merge conservatively", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const repository = new RealmProgressRepository(storage, () => new Date("2026-08-10T00:00:00Z"));
  repository.recordKelpRun({
    runId: "r1-rescue-unlock",
    elapsedSec: 42.5,
    rescuedManta: true,
    relicPageFound: true,
    masteredVerbs: KELP_CATHEDRAL_REALM.gameplayVerbs,
  });
  const record = {
    runId: "r3-clean-1",
    elapsedSec: 60.6,
    completed: true,
    cleanPerformance: true,
    masteredVerbs: CRYSTAL_TRENCH_REALM.gameplayVerbs,
  } as const;
  repository.recordCrystalRun(record);
  repository.recordCrystalRun(record);
  const saved = repository.snapshot().crystalTrench;
  assert.equal(saved.runs, 1);
  assert.equal(saved.completions, 1);
  assert.equal(saved.cleanCompletions, 1);
  assert.equal(saved.bestTimeSec, 60.6);
  assert.equal(saved.masteredVerbs.length, 4);

  const remote = createDefaultRealmProgress(new Date("2026-08-11T00:00:00Z"));
  remote.crystalTrench.runs = 3;
  remote.crystalTrench.completions = 2;
  remote.crystalTrench.cleanCompletions = 0;
  remote.crystalTrench.bestTimeSec = 61.2;
  const merged = mergeRealmProgress(repository.snapshot(), remote);
  assert.equal(merged.crystalTrench.runs, 3);
  assert.equal(merged.crystalTrench.completions, 2);
  assert.equal(merged.crystalTrench.cleanCompletions, 1);
  assert.equal(merged.crystalTrench.bestTimeSec, 60.6);
});

test("Crystal Trench stays deterministic through the 5,400-frame soak", () => {
  const first = new Run(0x5a0c, tuning, { realmId: "crystal-trench" });
  const second = new Run(0x5a0c, tuning, { realmId: "crystal-trench" });
  for (let frame = 0; frame < 5400; frame += 1) {
    const command = Math.sin(frame * 0.013) * 0.72;
    first.step(STEP_SEC, command);
    second.step(STEP_SEC, command);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.deepEqual(first.crystalTrenchStatus, second.crystalTrenchStatus);
  assert.deepEqual(first.gates, second.gates);
});
