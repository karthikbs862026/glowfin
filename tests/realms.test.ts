import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import {
  CRYSTAL_TRENCH_REALM,
  KELP_CATHEDRAL_REALM,
  REALM_BUDGET,
  REALM_DEFINITIONS,
  type RealmId,
  realmDefinitionIssues,
} from "../src/realms/definition";
import {
  CRYSTAL_THRESHOLD_FIRST_GATE_INDEX,
  currentTunnelForce,
  prismPulseState,
  realmOpeningsAt,
  realmProofOpening,
  type ReversingCurrentTunnelPlan,
} from "../src/realms/mechanics";
import {
  RealmProgressRepository,
  createDefaultRealmProgress,
  mergeRealmProgress,
  validateRealmProgress,
} from "../src/realms/progress";
import {
  CourseGenerator,
  gateSolvabilityOpening,
} from "../src/sim/course";
import { Run } from "../src/sim/run";
import { stepSim, createSimState } from "../src/sim/state";
import { KelpCathedralField } from "../src/render/kelpCathedralField";
import { CrystalTrenchField } from "../src/render/crystalTrenchField";
import * as THREE from "three";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function generatedCourse(realmId: RealmId) {
  const course = new CourseGenerator(0x4b454c50, tuning, { realmId });
  course.ensureGeneratedTo(1_400);
  return course.gates.map((gate) => JSON.parse(JSON.stringify(gate)) as typeof gate);
}

describe("Version 43-R4 integrated realm framework", () => {
  it("registers Kelp Cathedral as data with the hard mobile budget", () => {
    expect(Object.keys(REALM_DEFINITIONS)).toEqual([
      "moon-garden",
      "kelp-cathedral",
      "crystal-trench",
    ]);
    expect(realmDefinitionIssues(KELP_CATHEDRAL_REALM)).toEqual([]);
    expect(KELP_CATHEDRAL_REALM.gameplayVerbs).toEqual([
      "swaying-frond-window",
      "reversing-current-tunnel",
      "manta-rescue",
      "relic-current",
    ]);
    expect(KELP_CATHEDRAL_REALM.heroEncounter).toMatch(/baby manta/i);
    expect(KELP_CATHEDRAL_REALM.relicPageId).toBe("kelp-cathedral-page-1");
    expect(KELP_CATHEDRAL_REALM.budget).toEqual(REALM_BUDGET);
    expect(REALM_BUDGET).toMatchObject({
      maxDrawCalls: 90,
      maxTriangles: 150_000,
      maxTextureMemoryMB: 48,
      maxActiveMaterials: 12,
      minReactionWindowMs: 700,
      minimumFrameRate: 30,
    });
  });

  it("registers the final R3 Crystal Trench as a bounded realm slice", () => {
    expect(realmDefinitionIssues(CRYSTAL_TRENCH_REALM)).toEqual([]);
    expect(CRYSTAL_TRENCH_REALM.gameplayVerbs).toEqual([
      "prism-pulse",
      "trench-threshold",
      "sliding-crystal-plates",
      "mirror-current-race",
    ]);
    expect(CRYSTAL_TRENCH_REALM.heroEncounter).toMatch(/Trench Gate/i);
    expect(CRYSTAL_TRENCH_REALM.relicPageId).toBe("crystal-trench-page-1");
    expect(CRYSTAL_TRENCH_REALM.budget).toEqual(REALM_BUDGET);
  });

  it("leaves the default Moon Garden course bit-for-bit unchanged", () => {
    const implicit = new CourseGenerator(0x1234abcd, tuning);
    const explicit = new CourseGenerator(0x1234abcd, tuning, {
      realmId: "moon-garden",
    });
    implicit.ensureGeneratedTo(2_000);
    explicit.ensureGeneratedTo(2_000);
    expect(explicit.gates).toEqual(implicit.gates);
    expect(explicit.gates.every((gate) => gate.realmPlan === undefined)).toBe(true);
  });

  it("generates deterministic, mechanically distinct Kelp Cathedral gates", () => {
    const first = generatedCourse("kelp-cathedral");
    const second = generatedCourse("kelp-cathedral");
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(20);
    const verbs = new Set(first.map((gate) => gate.realmPlan?.verb));
    expect(verbs).toEqual(new Set([
      "swaying-frond-window",
      "reversing-current-tunnel",
      "manta-rescue",
      "relic-current",
    ]));
    expect(first.every((gate) => gate.obstaclePlan === undefined)).toBe(true);
  });

  it("generates deterministic Prism Pulses and a repeatable Trench Gate", () => {
    const first = generatedCourse("crystal-trench");
    const second = generatedCourse("crystal-trench");
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(20);
    expect(first.every((gate) => gate.obstaclePlan === undefined)).toBe(true);
    const threshold = first[CRYSTAL_THRESHOLD_FIRST_GATE_INDEX]?.realmPlan;
    expect(threshold?.verb).toBe("trench-threshold");
    expect(new Set(first.map((gate) => gate.realmPlan?.verb))).toEqual(
      new Set([
        "prism-pulse",
        "trench-threshold",
        "sliding-crystal-plates",
      ]),
    );

    const prism = first.find((gate) => gate.realmPlan?.verb === "prism-pulse")
      ?.realmPlan;
    expect(prism?.verb).toBe("prism-pulse");
    if (prism?.verb !== "prism-pulse") return;
    const revealed = prismPulseState(
      prism,
      (1 - prism.phase) * prism.periodSec,
    );
    const hidden = prismPulseState(
      prism,
      (1 - prism.phase + 0.5) * prism.periodSec,
    );
    expect(revealed.trueRouteBrightness).toBeGreaterThan(
      hidden.trueRouteBrightness,
    );
    expect(revealed.falseRouteBrightness).toBeLessThan(
      hidden.falseRouteBrightness,
    );
    expect(prism.telegraphFromDistance).toBeLessThan(
      first.find((gate) => gate.realmPlan === prism)?.distance ?? 0,
    );
  });

  it("keeps every rhythmic frond and rescue aperture inside the proved safe reserve", () => {
    const gates = generatedCourse("kelp-cathedral");
    for (const gate of gates) {
      const plan = gate.realmPlan;
      if (!plan) continue;
      const proof = realmProofOpening(
        plan,
        { left: gate.gapLeft, right: gate.gapRight },
      );
      const proofWidth = proof.right - proof.left;
      expect(proofWidth).toBeGreaterThan(tuning.lane.creatureRadius * 2);
      for (let sample = 0; sample < 32; sample += 1) {
        const openings = realmOpeningsAt(
          plan,
          { left: gate.gapLeft, right: gate.gapRight },
          sample * 0.19,
        );
        for (const opening of openings) {
          expect(opening.left).toBeGreaterThanOrEqual(-tuning.lane.halfWidth - 1e-6);
          expect(opening.right).toBeLessThanOrEqual(tuning.lane.halfWidth + 1e-6);
          expect(opening.right - opening.left).toBeGreaterThan(
            tuning.lane.creatureRadius * 2,
          );
        }
      }
      const courseProof = gateSolvabilityOpening(gate);
      expect(courseProof.gapLeft).toBeCloseTo(proof.left, 8);
      expect(courseProof.gapRight).toBeCloseTo(proof.right, 8);
    }
  });

  it("narrows Current Tunnels and reverses their lateral drift halfway", () => {
    const plan: ReversingCurrentTunnelPlan = {
      verb: "reversing-current-tunnel",
      telegraphFromDistance: 60,
      startDistance: 100,
      endDistance: 140,
      laneLeft: -2.8,
      laneRight: 2.8,
      lateralDriftPerSec: 2.4,
    };
    expect(currentTunnelForce(plan, 110, 0)).toBeGreaterThan(0);
    expect(currentTunnelForce(plan, 130, 0)).toBeLessThan(0);
    expect(currentTunnelForce(plan, 110, 4)).toBe(0);

    const state = createSimState();
    state.lateralPosition = 4.5;
    stepSim(state, 1, 1 / 120, tuning, 0, {
      left: plan.laneLeft,
      right: plan.laneRight,
    });
    expect(state.lateralPosition).toBeLessThanOrEqual(
      plan.laneRight - tuning.lane.creatureRadius,
    );
  });

  it("completes a deterministic baby-manta rescue through a 5,400-frame soak", () => {
    const simulate = () => {
      const run = new Run(0x4b454c50, tuning, { realmId: "kelp-cathedral" });
      for (let step = 0; step < 5_400; step += 1) {
        const next = run.gates.find((gate) => gate.distance > run.sim.forwardDistance + 1);
        const opening = next ? gateSolvabilityOpening(next) : null;
        const target = opening ? (opening.gapLeft + opening.gapRight) * 0.5 : 0;
        const difference = target - run.sim.lateralPosition;
        run.step(1 / 120, Math.max(-1, Math.min(1, difference * 0.9)));
      }
      return {
        snapshot: run.snapshot(),
        status: run.kelpCathedralStatus,
      };
    };
    const first = simulate();
    const second = simulate();
    expect(second).toEqual(first);
    expect(first.snapshot.ended).toBe(true);
    expect(first.snapshot.endReason).toBe("realm-complete");
    expect(first.status.rescuedManta).toBe(true);
    expect(first.status.frondWindowsCleared).toBeGreaterThan(0);
    expect(first.status.currentTunnelsEntered).toBeGreaterThan(0);
  });

  it("keeps the final Crystal Trench deterministic through a 5,400-frame soak", () => {
    const simulate = () => {
      const run = new Run(0x43525953, tuning, { realmId: "crystal-trench" });
      for (let step = 0; step < 5_400; step += 1) {
        const next = run.gates.find((gate) => (
          gate.distance > run.sim.forwardDistance + 1
        ));
        const opening = next ? gateSolvabilityOpening(next) : null;
        const target = opening
          ? (opening.gapLeft + opening.gapRight) * 0.5
          : 0;
        const difference = target - run.sim.lateralPosition;
        run.step(1 / 120, Math.max(-1, Math.min(1, difference * 0.9)));
      }
      return {
        snapshot: run.snapshot(),
        status: run.crystalTrenchStatus,
      };
    };
    const first = simulate();
    const second = simulate();
    expect(second).toEqual(first);
    expect(first.status.thresholdCrossed).toBe(true);
    expect(first.status.prismPulsesCleared).toBeGreaterThan(0);
    expect(first.status.masteredVerbs).toContain("prism-pulse");
    expect(first.status.masteredVerbs).toContain("trench-threshold");
  });

  it("builds a dense living cathedral inside the fixed mobile realm budget", () => {
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
    );
    texture.needsUpdate = true;
    const field = new KelpCathedralField(tuning, {
      blade: texture,
      stipe: texture,
      seabed: texture,
    });
    expect(field.additionalDrawCalls()).toBe(15);
    expect(field.additionalMaterials()).toBe(8);
    expect(field.triangleBudget()).toBeLessThan(100_000);
    expect(field.additionalDrawCalls()).toBeLessThan(REALM_BUDGET.maxDrawCalls);
    expect(field.triangleBudget()).toBeLessThan(REALM_BUDGET.maxTriangles);
    expect(field.additionalMaterials()).toBeLessThanOrEqual(
      REALM_BUDGET.maxActiveMaterials,
    );
    field.dispose();
    texture.dispose();
  });

  it("builds the Crystal threshold inside the fixed mobile realm budget", () => {
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
    );
    texture.needsUpdate = true;
    const field = new CrystalTrenchField(tuning, {
      crystal: texture,
      ruinStone: texture,
      seabed: texture,
    });
    expect(field.additionalDrawCalls()).toBe(22);
    expect(field.additionalMaterials()).toBe(10);
    expect(field.triangleBudget()).toBeLessThan(REALM_BUDGET.maxTriangles);
    expect(field.additionalDrawCalls()).toBeLessThan(REALM_BUDGET.maxDrawCalls);
    expect(field.additionalMaterials()).toBeLessThanOrEqual(
      REALM_BUDGET.maxActiveMaterials,
    );
    field.dispose();
    texture.dispose();
  });
});

describe("Kelp Cathedral durable progress", () => {
  it("persists rescue mastery and the single Relic Page idempotently", () => {
    const storage = new MemoryStorage();
    const now = new Date("2026-08-09T12:00:00.000Z");
    const repository = new RealmProgressRepository(storage, () => now);
    const record = {
      runId: "run_realm_001",
      elapsedSec: 31.25,
      rescuedManta: true,
      relicPageFound: true,
      masteredVerbs: [
        "swaying-frond-window",
        "reversing-current-tunnel",
        "manta-rescue",
        "relic-current",
      ] as const,
    };
    const saved = repository.recordKelpRun(record);
    const duplicate = repository.recordKelpRun(record);
    expect(duplicate).toEqual(saved);
    expect(saved.kelpCathedral.runs).toBe(1);
    expect(saved.kelpCathedral.rescues).toBe(1);
    expect(saved.kelpCathedral.bestRescueSec).toBe(31.25);
    expect(saved.kelpCathedral.relicPages).toEqual(["kelp-cathedral-page-1"]);
    expect(validateRealmProgress(saved)).toBe(true);

    const reloaded = new RealmProgressRepository(storage, () => now).snapshot();
    expect(reloaded).toEqual(saved);
  });

  it("merges realm progress monotonically without duplicating claims", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const local = createDefaultRealmProgress(now);
    local.revision = 3;
    local.kelpCathedral.runs = 2;
    local.kelpCathedral.rescues = 1;
    local.kelpCathedral.bestRescueSec = 34;
    local.kelpCathedral.recentClaims = ["kelp:run_a"];
    const remote = createDefaultRealmProgress(now);
    remote.revision = 4;
    remote.kelpCathedral.runs = 3;
    remote.kelpCathedral.rescues = 2;
    remote.kelpCathedral.bestRescueSec = 29;
    remote.kelpCathedral.relicPages = ["kelp-cathedral-page-1"];
    remote.kelpCathedral.recentClaims = ["kelp:run_a", "kelp:run_b"];
    const merged = mergeRealmProgress(local, remote, now);
    expect(merged.kelpCathedral.runs).toBe(3);
    expect(merged.kelpCathedral.rescues).toBe(2);
    expect(merged.kelpCathedral.bestRescueSec).toBe(29);
    expect(merged.kelpCathedral.relicPages).toEqual(["kelp-cathedral-page-1"]);
    expect(merged.kelpCathedral.recentClaims).toEqual(["kelp:run_a", "kelp:run_b"]);
    expect(validateRealmProgress(merged)).toBe(true);
  });
});
