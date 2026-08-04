import { describe, expect, it } from "vitest";
import {
  OBSTACLE_VARIETY_CONTRACT,
  SIGNATURE_OBSTACLE_VERBS,
  currentLaneForce,
  planLivingWorldEvent,
  planSignatureObstacle,
  shutterOpeningAt,
  type ObstacleSource
} from "../src/sim/obstacleVariety";

const source: ObstacleSource = {
  seed: 0x1234abcd,
  gate: {
    distance: 180,
    gapLeft: -2.8,
    gapRight: 2.8,
    templateId: "v38-signature",
    tier: 3
  }
};

describe("Version 38 signature-obstacle foundation", () => {
  it("defines exactly three new replay-safe obstacle verbs", () => {
    expect(SIGNATURE_OBSTACLE_VERBS).toEqual([
      "moonflash-choice",
      "ceremonial-shutter",
      "current-lane"
    ]);
    expect(OBSTACLE_VARIETY_CONTRACT.targetTemplateMinimum).toBe(20);
    expect(OBSTACLE_VARIETY_CONTRACT.targetTemplateMaximum).toBe(24);
  });

  it("plans a safe route and a narrower high-reward Moonflash route", () => {
    const plan = planSignatureObstacle("moonflash-choice", source, 7, 0.72);
    expect(plan.verb).toBe("moonflash-choice");
    if (plan.verb !== "moonflash-choice") throw new Error("wrong plan");
    const safe = plan.openings.find((opening) => opening.route === "safe");
    const moonflash = plan.openings.find((opening) => opening.route === "moonflash");
    expect(safe).toBeDefined();
    expect(moonflash).toBeDefined();
    expect((safe?.right ?? 0) - (safe?.left ?? 0))
      .toBeGreaterThan((moonflash?.right ?? 0) - (moonflash?.left ?? 0));
    expect(moonflash?.scoreMultiplier).toBeGreaterThan(1);
    for (const opening of plan.openings) {
      expect(opening.left).toBeGreaterThanOrEqual(-7);
      expect(opening.right).toBeLessThanOrEqual(7);
      expect(opening.right - opening.left).toBeGreaterThan(0.72 * 2);
    }
  });

  it("keeps ceremonial shutters predictable and passable throughout the cycle", () => {
    const plan = planSignatureObstacle("ceremonial-shutter", source, 7, 0.72);
    expect(plan.verb).toBe("ceremonial-shutter");
    if (plan.verb !== "ceremonial-shutter") throw new Error("wrong plan");
    const samples = Array.from({ length: 121 }, (_, index) =>
      shutterOpeningAt(plan, index * plan.periodSec / 120)
    );
    expect(Math.min(...samples.map((sample) => sample.width)))
      .toBeGreaterThanOrEqual(plan.minimumWidth - 1e-9);
    expect(Math.max(...samples.map((sample) => sample.width)))
      .toBeLessThanOrEqual(plan.maximumWidth + 1e-9);
    expect(plan.minimumWidth).toBeGreaterThan(0.72 * 2);
  });

  it("applies a signed, telegraphed current only inside its authored lane", () => {
    const plan = planSignatureObstacle("current-lane", source, 7, 0.72);
    expect(plan.verb).toBe("current-lane");
    if (plan.verb !== "current-lane") throw new Error("wrong plan");
    const middleDistance = (plan.startDistance + plan.endDistance) * 0.5;
    const middleLateral = (plan.laneLeft + plan.laneRight) * 0.5;
    expect(currentLaneForce(plan, middleDistance, middleLateral)).not.toBe(0);
    expect(currentLaneForce(plan, plan.startDistance - 0.01, middleLateral)).toBe(0);
    expect(currentLaneForce(plan, middleDistance, plan.laneRight + 0.01)).toBe(0);
  });

  it("is deterministic and keeps living-world events rare rather than constant", () => {
    for (const verb of SIGNATURE_OBSTACLE_VERBS) {
      expect(planSignatureObstacle(verb, source, 7, 0.72))
        .toEqual(planSignatureObstacle(verb, source, 7, 0.72));
    }
    const events = Array.from({ length: 210 }, (_, index) => planLivingWorldEvent({
      seed: source.seed,
      gate: {
        ...source.gate,
        distance: 180 + index * 31,
        templateId: `v38-${index}`
      }
    })).filter((event) => event !== null);
    expect(events.length).toBeGreaterThanOrEqual(15);
    expect(events.length).toBeLessThanOrEqual(50);
    expect(new Set(events.map((event) => event.kind)).size).toBe(3);
  });
});
