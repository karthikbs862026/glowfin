import { describe, expect, it } from "vitest";
import { classifyRunAccess, defaultAccessPreferences } from "../src/competitive/assists";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC } from "../src/core/timestep";
import { ReplayRecorder } from "../src/replay/replay";
import {
  HostedMoonflashClient,
  MoonflashRecorder,
  validateMoonflashClip
} from "../src/sharing/clips";

function replay(steps = 900) {
  const recorder = new ReplayRecorder(42, tuning.version);
  for (let step = 0; step < steps; step++) recorder.record(step < 450 ? 0.2 : -0.2);
  return recorder.finish({
    score: 2400,
    elapsedSec: steps * FIXED_DT_SEC,
    forwardDistance: 1200,
    nearMisses: 2,
    collisions: 3
  })!;
}

describe("Version 34 controlled Moonflash clips", () => {
  it("selects the strongest bounded semantic near-miss without pointer coordinates", () => {
    const recorder = new MoonflashRecorder();
    recorder.record(360, 800, 2, [{
      kind: "near-miss",
      clearance: 0.3,
      distance: 400,
      tier: 2,
      templateId: "straight"
    }]);
    recorder.record(600, 1600, 4.2, [{
      kind: "near-miss",
      clearance: 0.08,
      distance: 800,
      tier: 5,
      templateId: "double-pinch"
    }]);
    const clip = recorder.finish(
      replay(),
      classifyRunAccess(defaultAccessPreferences(false))
    );
    expect(clip).not.toBeNull();
    expect(clip?.momentStep).toBe(600);
    expect((clip?.endStep ?? 0) - (clip?.startStep ?? 0)).toBeLessThanOrEqual(1200);
    expect(validateMoonflashClip(clip)).toBe(true);
    expect(JSON.stringify(clip)).not.toMatch(/clientX|normalizedX|pointerId/);
  });

  it("rejects clip-bound and checksum tampering", () => {
    const recorder = new MoonflashRecorder();
    recorder.record(400, 100, 2, [{
      kind: "near-miss",
      clearance: 0.1,
      distance: 300,
      tier: 1,
      templateId: "straight"
    }]);
    const clip = recorder.finish(replay(), classifyRunAccess(defaultAccessPreferences(false)))!;
    expect(validateMoonflashClip({ ...clip, momentStep: 401 })).toBe(false);
    expect(validateMoonflashClip({ ...clip, checksum: "00000000" })).toBe(false);
  });

  it("publishes only after the explicit client call and validates the share URL", async () => {
    const recorder = new MoonflashRecorder();
    recorder.record(400, 100, 2, [{
      kind: "near-miss",
      clearance: 0.1,
      distance: 300,
      tier: 1,
      templateId: "straight"
    }]);
    const clip = recorder.finish(replay(), classifyRunAccess(defaultAccessPreferences(false)))!;
    let requests = 0;
    const client = new HostedMoonflashClient(async (_input, init) => {
      requests += 1;
      expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin" });
      return Response.json({
        schemaVersion: 1,
        token: "moonflash_12345678",
        shareUrl: "https://glowfin.example/share/moonflash_12345678",
        expiresAt: "2026-09-03T00:00:00.000Z"
      });
    });
    expect(requests).toBe(0);
    expect((await client.publish(clip)).token).toBe("moonflash_12345678");
    expect(requests).toBe(1);
  });
});
