import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three";

import {
  CLEAN_TIDE_SPRINT_FINISH_UNITS,
  CLEAN_TIDE_SPRINT_PLAN_HASH,
  CleanTideSprintDirector,
  tideSprintCurrentOnlyControl,
  tideSprintDragDeltaToTarget,
  tideSprintThrottleMode,
  tideSprintVerticalDragToThrottle,
  tideSprintSteeringAuthority,
  tideSprintIdealControl,
  TIDE_SPRINT_DEFAULT_THROTTLE,
  TIDE_SPRINT_SPEED_PROFILES,
  type CleanTideSprintSnapshot,
  type TideSprintControlFrame,
} from "../src/tideSprint/director";
import {
  TIDE_SPRINT_CHARACTER_ANATOMY,
  TIDE_SPRINT_FORWARD_AXIS,
  createTideSprintCharacterRig,
} from "../src/tideSprint/characters";
import {
  TIDE_SPRINT_CHARACTER_IDS,
  TIDE_SPRINT_CREW_IDS,
  TideSprintCrewStore,
} from "../src/tideSprint/crew";
import {
  TIDE_SPRINT_CURRENT_RINGS,
  TIDE_SPRINT_OBSTACLES,
  tideSprintCurrentCenter,
  tideSprintCurrentRadius,
} from "../src/tideSprint/course";
import {
  TIDE_SPRINT_GUIDE_GAPS,
  TIDE_SPRINT_START_SLOTS,
} from "../src/tideSprint/view";

type Strategy = (snapshot: CleanTideSprintSnapshot) => TideSprintControlFrame;

function completeRace(
  character: typeof TIDE_SPRINT_CREW_IDS[number],
  strategy: Strategy,
) {
  const director = new CleanTideSprintDirector();
  director.start(character);
  const dtSec = 1 / 120;
  for (let step = 0; step < 120 * 100; step += 1) {
    const snapshot = director.snapshot();
    const events = director.step(dtSec, strategy(snapshot));
    if (events.finished) break;
  }
  return { snapshot: director.snapshot(), result: director.result() };
}

const noInput: Strategy = () => ({
  targetLateral: 0,
  throttle: TIDE_SPRINT_DEFAULT_THROTTLE,
});
const idealInput: Strategy = (snapshot) => tideSprintIdealControl(
  snapshot.player.distance,
);
const currentOnlyInput: Strategy = (snapshot) => tideSprintCurrentOnlyControl(
  snapshot.player.distance,
);

test("Tide Sprint requires steering agency and character choice cannot auto-win", () => {
  const unattended = TIDE_SPRINT_CREW_IDS.map((character) =>
    completeRace(character, noInput)
  );
  const controlled = TIDE_SPRINT_CREW_IDS.map((character) =>
    completeRace(character, idealInput)
  );

  for (const { snapshot, result } of unattended) {
    assert.equal(snapshot.finished, true);
    assert.ok(result);
    assert.equal(result.placement, 4);
    assert.ok(result.elapsedSec >= 60 && result.elapsedSec <= 90);
  }
  for (const { snapshot, result } of controlled) {
    assert.equal(snapshot.finished, true);
    assert.ok(result);
    assert.equal(result.placement, 1);
    assert.ok(result.elapsedSec >= 60 && result.elapsedSec <= 90);
  }

  assert.equal(new Set(unattended.map(({ result }) => result?.elapsedSec)).size, 1);
  assert.equal(new Set(controlled.map(({ result }) => result?.elapsedSec)).size, 1);
  assert.notEqual(unattended[0]?.result?.elapsedSec, controlled[0]?.result?.elapsedSec);
});

test("live rank is derived from the same real distances shown by the race", () => {
  const director = new CleanTideSprintDirector();
  director.start("coralyn");
  for (let step = 0; step < 120 * 24; step += 1) {
    director.step(1 / 120, {
      targetLateral: 0,
      throttle: TIDE_SPRINT_DEFAULT_THROTTLE,
    });
  }
  const snapshot = director.snapshot();
  const distancesAhead = snapshot.racers.filter((racer) =>
    !racer.player && racer.distance > snapshot.player.distance
  ).length;
  assert.equal(snapshot.rank, distancesAhead + 1);
  assert.ok(snapshot.rank > 1);
});

test("every race has four visually distinct characters and no selected-character clone", () => {
  for (const selected of TIDE_SPRINT_CREW_IDS) {
    const director = new CleanTideSprintDirector();
    director.start(selected);
    const snapshot = director.snapshot();
    assert.equal(snapshot.racers.length, 4);
    assert.deepEqual(
      new Set(snapshot.racers.map((racer) => racer.character)),
      new Set(TIDE_SPRINT_CHARACTER_IDS),
    );
    assert.equal(
      snapshot.racers.filter((racer) => racer.character === selected).length,
      1,
    );
    assert.equal(snapshot.racers.filter((racer) => racer.player).length, 1);
    assert.equal(snapshot.racers.filter((racer) => racer.ghost).length, 2);
  }
});

test("right drag maps right and left drag maps left", () => {
  assert.ok(tideSprintDragDeltaToTarget(0, 120, 400) > 0);
  assert.ok(tideSprintDragDeltaToTarget(0, -120, 400) < 0);
  assert.ok(tideSprintDragDeltaToTarget(1.2, 90, 400) > 1.2);
  assert.ok(tideSprintDragDeltaToTarget(-1.2, -90, 400) < -1.2);
});

test("vertical touch motion is a spring-loaded throttle with visible speed bands", () => {
  const viewportHeight = 800;
  const surged = tideSprintVerticalDragToThrottle(-180, viewportHeight);
  const braked = tideSprintVerticalDragToThrottle(180, viewportHeight);
  assert.equal(tideSprintVerticalDragToThrottle(0, viewportHeight), TIDE_SPRINT_DEFAULT_THROTTLE);
  assert.equal(surged, TIDE_SPRINT_SPEED_PROFILES.sprint.throttle);
  assert.equal(braked, TIDE_SPRINT_SPEED_PROFILES.slow.throttle);
  assert.equal(tideSprintThrottleMode(surged), "sprint");
  assert.equal(tideSprintThrottleMode(TIDE_SPRINT_DEFAULT_THROTTLE), "cruise");
  assert.equal(tideSprintThrottleMode(braked), "slow");
  assert.ok(TIDE_SPRINT_SPEED_PROFILES.slow.throttle < TIDE_SPRINT_SPEED_PROFILES.cruise.throttle);
  assert.ok(TIDE_SPRINT_SPEED_PROFILES.cruise.throttle < TIDE_SPRINT_SPEED_PROFILES.sprint.throttle);
  assert.ok(
    tideSprintSteeringAuthority(TIDE_SPRINT_SPEED_PROFILES.slow.throttle) >
      tideSprintSteeringAuthority(TIDE_SPRINT_SPEED_PROFILES.sprint.throttle),
  );

  const slow = new CleanTideSprintDirector();
  const fast = new CleanTideSprintDirector();
  slow.start("glowfin");
  fast.start("glowfin");
  for (let step = 0; step < 120 * 8; step += 1) {
    slow.step(1 / 120, {
      targetLateral: 0,
      throttle: TIDE_SPRINT_SPEED_PROFILES.slow.throttle,
    });
    fast.step(1 / 120, {
      targetLateral: 0,
      throttle: TIDE_SPRINT_SPEED_PROFILES.sprint.throttle,
    });
  }
  assert.ok(fast.snapshot().player.speed > slow.snapshot().player.speed + 10);
  assert.ok(fast.snapshot().player.distance > slow.snapshot().player.distance + 60);

  const beforeSlowdown = fast.snapshot().player.speed;
  for (let step = 0; step < 120 * 2; step += 1) {
    fast.step(1 / 120, {
      targetLateral: 0,
      throttle: TIDE_SPRINT_SPEED_PROFILES.slow.throttle,
    });
  }
  assert.ok(fast.snapshot().player.speed < beforeSlowdown - 7);

  const slowTurn = new CleanTideSprintDirector();
  const sprintTurn = new CleanTideSprintDirector();
  slowTurn.start("glowfin");
  sprintTurn.start("glowfin");
  for (let step = 0; step < 120; step += 1) {
    slowTurn.step(1 / 120, {
      targetLateral: 4.4,
      throttle: TIDE_SPRINT_SPEED_PROFILES.slow.throttle,
    });
    sprintTurn.step(1 / 120, {
      targetLateral: 4.4,
      throttle: TIDE_SPRINT_SPEED_PROFILES.sprint.throttle,
    });
  }
  assert.ok(slowTurn.snapshot().player.lateral > sprintTurn.snapshot().player.lateral + 0.12);
});

test("the countdown grid separates all four wide character rigs", () => {
  const slots = Object.values(TIDE_SPRINT_START_SLOTS);
  assert.equal(slots.length, 4);
  for (let left = 0; left < slots.length; left += 1) {
    for (let right = left + 1; right < slots.length; right += 1) {
      const a = slots[left]!;
      const b = slots[right]!;
      assert.ok(
        Math.hypot(a.x - b.x, a.z - b.z) >= 4.5,
        `start slots ${left} and ${right} overlap`,
      );
    }
  }
});

test("near-field current hoops reach the player before distant scenery", () => {
  assert.ok(TIDE_SPRINT_GUIDE_GAPS[0] <= 6);
  assert.ok(TIDE_SPRINT_GUIDE_GAPS[1] <= 12);
  assert.ok(TIDE_SPRINT_GUIDE_GAPS[2] <= 20);
  assert.ok(TIDE_SPRINT_GUIDE_GAPS[3] <= 30);
  for (let index = 1; index < TIDE_SPRINT_GUIDE_GAPS.length; index += 1) {
    assert.ok(TIDE_SPRINT_GUIDE_GAPS[index]! > TIDE_SPRINT_GUIDE_GAPS[index - 1]!);
  }
});

test("clean current mastery earns a narrow win while a tiny execution loss stays second", () => {
  assert.equal(TIDE_SPRINT_CURRENT_RINGS.length, 12);
  for (const ring of TIDE_SPRINT_CURRENT_RINGS) {
    assert.ok(
      Math.abs(ring.lateral - tideSprintCurrentCenter(ring.distance)) <
        tideSprintCurrentRadius(ring.distance),
      `${ring.id} is outside the authored current`,
    );
    assert.ok(
      TIDE_SPRINT_OBSTACLES.every((obstacle) =>
        Math.abs(obstacle.distance - ring.distance) >= 70
      ),
      `${ring.id} has no fair reaction window`,
    );
  }

  for (const character of TIDE_SPRINT_CREW_IDS) {
    const currentOnly = completeRace(character, currentOnlyInput);
    const ringMaster = completeRace(character, idealInput);
    const cruiseRingLine = completeRace(character, (snapshot) => ({
      ...tideSprintIdealControl(snapshot.player.distance),
      throttle: TIDE_SPRINT_DEFAULT_THROTTLE,
    }));
    const nearlyClean = completeRace(character, (snapshot) => ({
      ...tideSprintCurrentOnlyControl(snapshot.player.distance),
      throttle: 0.98,
    }));
    assert.equal(currentOnly.result?.placement, 1);
    assert.equal(ringMaster.result?.placement, 1);
    assert.equal(nearlyClean.result?.placement, 2);
    assert.equal(ringMaster.snapshot.player.boosts, TIDE_SPRINT_CURRENT_RINGS.length);
    assert.ok(currentOnly.snapshot.player.boosts < ringMaster.snapshot.player.boosts);
    assert.equal(cruiseRingLine.result?.placement, 4);

    const currentRunnerUp = currentOnly.result?.standings[1];
    const currentWinMargin = (currentRunnerUp?.finishSec ?? 0) -
      (currentOnly.result?.elapsedSec ?? 0);
    assert.ok(currentWinMargin >= 0.05 && currentWinMargin <= 0.3);

    const nearlyCleanWinner = nearlyClean.result?.standings[0];
    const nearlyCleanGap = (nearlyClean.result?.elapsedSec ?? 0) -
      (nearlyCleanWinner?.finishSec ?? 0);
    assert.ok(nearlyCleanGap >= 0.15 && nearlyCleanGap <= 0.6);
  }
});

test("race plans are deterministic, fair, and complete with real standings", () => {
  const first = completeRace("glowfin", idealInput);
  const second = completeRace("glowfin", idealInput);
  assert.deepEqual(first, second);
  assert.match(CLEAN_TIDE_SPRINT_PLAN_HASH, /^[0-9a-f]{8}$/);
  assert.equal(first.snapshot.planHash, CLEAN_TIDE_SPRINT_PLAN_HASH);
  assert.equal(first.snapshot.progress, 1);
  assert.equal(first.result?.standings.length, 4);
  assert.equal(first.result?.standings.filter((standing) => standing.player).length, 1);
  assert.equal(first.result?.standings.filter((standing) => standing.ghost).length, 2);
  assert.equal(CLEAN_TIDE_SPRINT_FINISH_UNITS, 2700);
});

test("all dedicated race rigs share one explicit forward axis with faces ahead of tails", () => {
  assert.deepEqual(TIDE_SPRINT_FORWARD_AXIS, [0, 0, -1]);
  assert.equal(
    new Set(Object.values(TIDE_SPRINT_CHARACTER_ANATOMY).map((entry) => entry.silhouette)).size,
    4,
  );
  const surface = new THREE.MeshStandardMaterial({ vertexColors: true });
  const face = new THREE.MeshBasicMaterial({ vertexColors: true });
  const dimensionSignatures = new Set<string>();
  let totalMeshes = 0;
  let totalTriangles = 0;
  for (const character of TIDE_SPRINT_CHARACTER_IDS) {
    const anatomy = TIDE_SPRINT_CHARACTER_ANATOMY[character];
    assert.ok(anatomy.faceZ < anatomy.tailZ, character);
    const rig = createTideSprintCharacterRig(character, { surface, face });
    assert.equal(rig.group.userData["forwardAxis"], "-z");
    assert.equal(rig.group.userData["faceZ"], anatomy.faceZ);
    assert.equal(rig.group.userData["tailZ"], anatomy.tailZ);
    assert.notEqual(rig.group.rotation.y, Math.PI);
    rig.group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(rig.group).getSize(new THREE.Vector3());
    assert.ok(size.x > 1 && size.y > 0.2 && size.z > 1.5, character);
    dimensionSignatures.add(`${size.x.toFixed(1)}:${size.y.toFixed(1)}:${size.z.toFixed(1)}`);
    rig.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      totalMeshes += 1;
      const geometry = object.geometry;
      totalTriangles += (geometry.getIndex()?.count ??
        geometry.getAttribute("position").count) / 3;
    });
    rig.dispose();
  }
  assert.equal(dimensionSignatures.size, 4);
  assert.ok(totalMeshes <= 40, `race rigs use ${totalMeshes} meshes`);
  assert.ok(totalTriangles < 40_000, `race rigs use ${totalTriangles} triangles`);
  surface.dispose();
  face.dispose();
});

test("the chase camera projects positive world X to screen-right", () => {
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 190);
  camera.position.set(0, 3.75, 9.25);
  camera.lookAt(0, 0.15, -12);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3(1, 0, 0).project(camera);
  const left = new THREE.Vector3(-1, 0, 0).project(camera);
  assert.ok(right.x > 0, `right projected to ${right.x}`);
  assert.ok(left.x < 0, `left projected to ${left.x}`);
});

test("Bonds persist as cosmetic-only integer progress", () => {
  const values = new Map<string, string>();
  const store = new TideSprintCrewStore({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  });
  const progress = store.load();
  const selectedProgress = store.select(progress, "neri");
  store.addBond(selectedProgress, "neri", 3);
  const loaded = store.load();
  assert.equal(loaded.selected, "neri");
  assert.equal(loaded.bonds.neri, 3);
  assert.deepEqual(Object.keys(loaded.bonds).sort(), [...TIDE_SPRINT_CREW_IDS].sort());
});
