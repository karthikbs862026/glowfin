import { describe, expect, it } from "vitest";
import { classifyRunAccess, defaultAccessPreferences } from "../src/competitive/assists";
import { tuning } from "../src/core/config";
import { ReplayRecorder } from "../src/replay/replay";
import { MoonflashRecorder } from "../src/sharing/clips";
import { MOONFLASH_MEDIA_DURATION_SEC, moonflashMediaPlan } from "../src/sharing/media";

describe("Version 39 rendered Moonflash media", () => {
  it("plans one deterministic six-second portrait clip around the verified moment", () => {
    const replay = new ReplayRecorder(42, tuning.version);
    for (let step = 0; step < 900; step++) replay.record(step < 450 ? 0.2 : -0.2);
    const finished = replay.finish({
      score: 2400,
      elapsedSec: 7.5,
      forwardDistance: 1200,
      nearMisses: 1,
      collisions: 0
    })!;
    const recorder = new MoonflashRecorder();
    recorder.record(600, 1600, 4.2, [{
      kind: "near-miss",
      clearance: 0.08,
      distance: 800,
      tier: 5,
      templateId: "choice-eclipse-pinch"
    }]);
    const clip = recorder.finish(finished, classifyRunAccess(defaultAccessPreferences(false)))!;
    const first = moonflashMediaPlan(clip);
    const second = moonflashMediaPlan(clip);
    expect(first).toEqual(second);
    expect(first.durationSec).toBe(MOONFLASH_MEDIA_DURATION_SEC);
    expect(first.momentFraction).toBeGreaterThan(0);
    expect(first.momentFraction).toBeLessThan(1);
    expect(first.caption.length).toBeLessThanOrEqual(96);
  });
});
