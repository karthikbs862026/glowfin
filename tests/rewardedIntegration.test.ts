import { describe, expect, it } from "vitest";
import {
  BrowserRewardedVideoProvider,
  LIVE_REWARDED_VIDEO_FLAGS,
  RewardedVideoHooks
} from "../src/monetization/rewarded";
import {
  ProgressRepository,
  type ProgressStorage
} from "../src/persistence/progress";

class MemoryStorage implements ProgressStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("Version 34 rewarded-video provider bridge", () => {
  it("stays absent when the host did not inject an approved provider", () => {
    expect(BrowserRewardedVideoProvider.fromGlobal({} as typeof globalThis)).toBeNull();
    expect(LIVE_REWARDED_VIDEO_FLAGS).toEqual({
      enabled: true,
      runRecovery: false,
      doubleLumenPearls: true
    });
  });

  it("adapts a host completion without exposing a recovery placement", async () => {
    const calls: string[] = [];
    const root = {
      GlowfinRewardedVideo: {
        available(placement: string) {
          calls.push(`available:${placement}`);
          return true;
        },
        async show(placement: string) {
          calls.push(`show:${placement}`);
          return { status: "completed" as const, receipt: "host-private" };
        }
      }
    } as unknown as typeof globalThis;
    const provider = BrowserRewardedVideoProvider.fromGlobal(root)!;
    const hooks = new RewardedVideoHooks(provider, LIVE_REWARDED_VIDEO_FLAGS);
    expect((await hooks.offer("run-recovery", {
      runEnded: true,
      collisionCount: 3,
      earnedPearls: 20
    })).reason).toBe("placement-disabled");
    const offer = await hooks.offer("double-lumen-pearls", {
      runEnded: true,
      collisionCount: 3,
      earnedPearls: 20
    });
    expect(offer.eligible).toBe(true);
    expect(await hooks.show(offer)).toBe("completed");
    expect(calls).toEqual([
      "available:double-lumen-pearls",
      "show:double-lumen-pearls"
    ]);
  });

  it("grants cosmetic-only Lumen once without changing Tide XP or run truth", () => {
    const repository = new ProgressRepository(new MemoryStorage());
    const before = repository.load().progress;
    const first = repository.grantRewardedPearls("run_rewarded-34", 30);
    const duplicate = repository.grantRewardedPearls("run_rewarded-34", 30);
    expect(first).toMatchObject({ granted: true, pearls: 30 });
    expect(first.progress.progression.lumenPearls).toBe(30);
    expect(first.progress.progression.tideXp).toBe(before.progression.tideXp);
    expect(first.progress.bestScore).toBe(before.bestScore);
    expect(first.progress.totals).toEqual(before.totals);
    expect(duplicate).toMatchObject({ granted: false, pearls: 0 });
    expect(duplicate.progress.progression.lumenPearls).toBe(30);
  });
});
