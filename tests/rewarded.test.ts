import { describe, expect, it } from "vitest";
import {
  REWARDED_VIDEO_FLAGS,
  RewardedVideoHooks,
  type RewardedPlacement,
  type RewardedVideoProvider
} from "../src/monetization/rewarded";

class Provider implements RewardedVideoProvider {
  availableCalls: RewardedPlacement[] = [];
  showCalls: RewardedPlacement[] = [];
  availableResult = true;
  showResult: "completed" | "skipped" | "failed" = "completed";
  async available(placement: RewardedPlacement): Promise<boolean> {
    this.availableCalls.push(placement);
    return this.availableResult;
  }
  async show(placement: RewardedPlacement) {
    this.showCalls.push(placement);
    return {
      status: this.showResult,
      receipt: this.showResult === "completed" ? "receipt_abcdefghijklmnopqrstuvwxyz" : null
    };
  }
}

const context = { runEnded: true, collisionCount: 1, earnedPearls: 20 };

describe("Version 33 rewarded-video architecture hooks", () => {
  it("ships every advertising placement disabled with no live SDK call", async () => {
    const provider = new Provider();
    expect(REWARDED_VIDEO_FLAGS).toEqual({
      enabled: false,
      runRecovery: false,
      doubleLumenPearls: false
    });
    expect(await new RewardedVideoHooks(provider).offer("run-recovery", context)).toEqual({
      placement: "run-recovery",
      eligible: false,
      reason: "feature-disabled"
    });
    expect(provider.availableCalls).toEqual([]);
  });

  it("enforces placement, completed-run, recovery and provider eligibility", async () => {
    const provider = new Provider();
    const hooks = new RewardedVideoHooks(provider, {
      enabled: true,
      runRecovery: true,
      doubleLumenPearls: false
    });
    expect((await hooks.offer("double-lumen-pearls", context)).reason).toBe("placement-disabled");
    expect((await hooks.offer("run-recovery", { ...context, runEnded: false })).reason).toBe("run-active");
    expect((await hooks.offer("run-recovery", { ...context, collisionCount: 0 })).reason).toBe("no-recovery-needed");
    provider.availableResult = false;
    expect((await hooks.offer("run-recovery", context)).reason).toBe("provider-unavailable");
  });

  it("shows only an eligible offer through the injected provider", async () => {
    const provider = new Provider();
    const hooks = new RewardedVideoHooks(provider, {
      enabled: true,
      runRecovery: true,
      doubleLumenPearls: true
    });
    const offer = await hooks.offer("double-lumen-pearls", context);
    expect(offer).toMatchObject({ eligible: true, reason: "eligible" });
    expect(await hooks.show(offer)).toEqual({
      status: "completed",
      receipt: "receipt_abcdefghijklmnopqrstuvwxyz"
    });
    expect(provider.showCalls).toEqual(["double-lumen-pearls"]);
    expect(await hooks.show({ ...offer, eligible: false })).toEqual({
      status: "failed",
      receipt: null
    });
  });
});
