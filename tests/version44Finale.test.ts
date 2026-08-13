import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three";
import tuning from "../config/tuning.json" with { type: "json" };
import {
  DUSKMAW_BOSS_MAX_HEALTH,
  DUSKMAW_COMPLETE_COAST_DISTANCE,
  DUSKMAW_CURRENT_BREAK_TARGET,
  DUSKMAW_MIN_COMPLETION_SEC,
  DUSKMAW_MOONLINK_STRIKES,
  DUSKMAW_MOON_SEAL_FIRST_GATE_INDEX,
  DUSKMAW_PRE_VAULT_STRIKES,
} from "../src/realms/mechanics.ts";
import {
  LeviathanGraveyardField,
  moonlinkDuskmawMotion,
} from "../src/render/leviathanGraveyardField.ts";
import { CourseGenerator } from "../src/sim/course.ts";
import { gateOpeningsAt } from "../src/sim/gateGeometry.ts";
import { Run } from "../src/sim/run.ts";
import { forwardSpeed } from "../src/sim/state.ts";

const STEP_SEC = 1 / 120;

function autopilot(run: Run): number {
  const status = run.duskmawStatus;
  if (
    status.attackTargetLateral !== null &&
    status.attackGateDistance !== null &&
    status.attackGateDistance - run.sim.forwardDistance < 118
  ) {
    const dodgeDirection = status.attackTargetLateral <= 0 ? 1 : -1;
    const dodge = Math.max(
      -tuning.lane.halfWidth + 0.9,
      Math.min(
        tuning.lane.halfWidth - 0.9,
        status.attackTargetLateral + dodgeDirection * 2.15,
      ),
    );
    return Math.max(-1, Math.min(1, (dodge - run.sim.lateralPosition) * 0.95));
  }
  const gate = run.gates.find((candidate) => (
    candidate.distance > run.sim.forwardDistance + 1
  ));
  if (!gate) return 0;
  const timeToGate = (gate.distance - run.sim.forwardDistance) /
    Math.max(1, forwardSpeed(run.sim, tuning));
  const opening = gateOpeningsAt(gate, run.sim.elapsedSec + timeToGate)[0];
  if (!opening) return 0;
  const center = (opening.left + opening.right) * 0.5;
  return Math.max(-1, Math.min(1, (center - run.sim.lateralPosition) * 0.95));
}

test("V44 finale is a four-strike Guardian assault with a long cinematic coast", () => {
  assert.equal(DUSKMAW_CURRENT_BREAK_TARGET, 8);
  assert.equal(DUSKMAW_PRE_VAULT_STRIKES, 4);
  assert.equal(DUSKMAW_MOONLINK_STRIKES, 4);
  assert.equal(DUSKMAW_BOSS_MAX_HEALTH, 22);
  assert.ok(DUSKMAW_MIN_COMPLETION_SEC >= 205);
  assert.ok(DUSKMAW_COMPLETE_COAST_DISTANCE >= 390);

  const course = new CourseGenerator(0x44f1a1e, tuning, {
    realmId: "leviathan-graveyard",
  });
  course.ensureGeneratedTo(12000);
  const strikes = course.gates.flatMap((gate) => (
    gate.realmPlan?.verb === "current-break" ? [gate.realmPlan.sequence] : []
  ));
  assert.deepEqual(strikes.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
  const seal = course.gates.find((gate) => gate.realmPlan?.verb === "moon-seal");
  assert.ok(seal);
  assert.ok(seal && course.gates.indexOf(seal) >= DUSKMAW_MOON_SEAL_FIRST_GATE_INDEX - 1);
});

test("Duskmaw's Moonlink route and heading remain continuous and never snap backwards", () => {
  let previous = moonlinkDuskmawMotion(0, 0);
  for (let step = 1; step <= 120 * 90; step += 1) {
    const time = step / 120;
    const current = moonlinkDuskmawMotion(time, Math.min(3, Math.floor(time / 20)));
    assert.ok(Math.abs(current.lateral) <= 6.01);
    assert.ok(current.lead >= 27 && current.lead <= 44.1);
    assert.ok(Math.abs(THREE.MathUtils.radToDeg(current.yawOffsetRad)) <= 54.01);
    assert.ok(Math.abs(current.lateral - previous.lateral) < 0.08);
    assert.ok(Math.abs(current.lead - previous.lead) < 0.08);
    assert.ok(Math.abs(current.yawOffsetRad - previous.yawOffsetRad) < 0.035);
    previous = current;
  }
});

test("the modeled Mooncrest and finale remain inside the mobile render budget", () => {
  const pixels = new Uint8Array([112, 138, 142, 255]);
  const texture = new THREE.DataTexture(pixels, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  const field = new LeviathanGraveyardField(tuning, {
    fossilBone: texture,
    ruinStone: texture,
    seabed: texture,
  });
  const names: string[] = [];
  field.group.traverse((object) => names.push(object.name));
  assert.ok(names.includes("auralis-mooncrest-premium-three-dimensional-lunar-crown-and-heartlight-core"));
  assert.match(String(field.group.userData["finaleContract"]), /never-retreats-backwards/);
  assert.match(String(field.group.userData["finaleContract"]), /four-joined-strikes/);
  assert.ok(field.additionalDrawCalls() <= 90, `draw calls ${field.additionalDrawCalls()}`);
  assert.ok(field.triangleBudget() <= 150_000, `triangles ${field.triangleBudget()}`);
  assert.ok(field.additionalMaterials() <= 12);
  field.dispose();
  texture.dispose();
});

test("V44 stays deterministic through the 5,400-frame finale certification soak", () => {
  const first = new Run(0x44f1a1e, tuning, { realmId: "leviathan-graveyard" });
  const second = new Run(0x44f1a1e, tuning, { realmId: "leviathan-graveyard" });
  for (let frame = 0; frame < 5400; frame += 1) {
    const command = Math.sin(frame * 0.011) * 0.76;
    first.step(STEP_SEC, command);
    second.step(STEP_SEC, command);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.deepEqual(first.duskmawStatus, second.duskmawStatus);
  assert.deepEqual(first.gates, second.gates);
});

test("a clean skilled run reaches the cinematic finale after the competitive battle", () => {
  const run = new Run(0x44f1a1e, tuning, { realmId: "leviathan-graveyard" });
  const failures: string[] = [];
  for (let step = 0; step < 270 / STEP_SEC && !run.ended; step += 1) {
    const events = run.step(STEP_SEC, autopilot(run));
    failures.push(...events.realmEvents
      .filter((event) => !event.success)
      .map((event) => `${event.kind}@${event.distance.toFixed(0)}`));
  }
  assert.equal(
    run.endReason,
    "realm-complete",
    JSON.stringify({
      elapsed: run.sim.elapsedSec,
      collisions: run.collisionCount,
      light: run.light,
      failures,
      status: run.duskmawStatus,
    }),
  );
  assert.equal(run.duskmawStatus.currentBreaks, DUSKMAW_CURRENT_BREAK_TARGET);
  assert.equal(run.duskmawStatus.joinedStrikes, DUSKMAW_MOONLINK_STRIKES);
  assert.equal(run.duskmawStatus.bossHealth, 0);
  assert.equal(run.duskmawStatus.auralisFreed, true);
  assert.equal(run.duskmawStatus.completed, true);
  assert.ok(run.sim.elapsedSec >= DUSKMAW_MIN_COMPLETION_SEC);
  assert.ok(run.sim.elapsedSec <= 250, `completion ${run.sim.elapsedSec.toFixed(2)}s`);
});
