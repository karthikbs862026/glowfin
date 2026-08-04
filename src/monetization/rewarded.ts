export type RewardedPlacement = "run-recovery" | "double-lumen-pearls";

export interface RewardedContext {
  runEnded: boolean;
  collisionCount: number;
  earnedPearls: number;
}
export interface RewardedOffer {
  placement: RewardedPlacement;
  eligible: boolean;
  reason: string;
}

export interface RewardedVideoProvider {
  available(placement: RewardedPlacement): Promise<boolean>;
  show(placement: RewardedPlacement): Promise<"completed" | "skipped" | "failed">;
}

export interface RewardedVideoFlags {
  enabled: boolean;
  runRecovery: boolean;
  doubleLumenPearls: boolean;
}

/**
 * Architecture hooks only. Phase 4A deliberately ships with every placement
 * disabled and no advertising SDK. A future integration must opt in through
 * these flags and still cannot mutate collision, score or leaderboard truth.
 */
export const REWARDED_VIDEO_FLAGS: Readonly<RewardedVideoFlags> = Object.freeze({
  enabled: false,
  runRecovery: false,
  doubleLumenPearls: false
});

export class RewardedVideoHooks {
  constructor(
    private readonly provider: RewardedVideoProvider | null = null,
    private readonly flags: RewardedVideoFlags = REWARDED_VIDEO_FLAGS
  ) {}

  async offer(
    placement: RewardedPlacement,
    context: RewardedContext
  ): Promise<RewardedOffer> {
    if (!this.flags.enabled) {
      return { placement, eligible: false, reason: "feature-disabled" };
    }
    const placementEnabled = placement === "run-recovery"
      ? this.flags.runRecovery
      : this.flags.doubleLumenPearls;
    if (!placementEnabled) {
      return { placement, eligible: false, reason: "placement-disabled" };
    }
    if (!context.runEnded) {
      return { placement, eligible: false, reason: "run-active" };
    }
    if (placement === "run-recovery" && context.collisionCount < 1) {
      return { placement, eligible: false, reason: "no-recovery-needed" };
    }
    if (placement === "double-lumen-pearls" && context.earnedPearls < 1) {
      return { placement, eligible: false, reason: "no-reward" };
    }
    if (!this.provider || !(await this.provider.available(placement))) {
      return { placement, eligible: false, reason: "provider-unavailable" };
    }
    return { placement, eligible: true, reason: "eligible" };
  }

  async show(offer: RewardedOffer): Promise<"completed" | "skipped" | "failed"> {
    if (!offer.eligible || !this.flags.enabled || !this.provider) return "failed";
    return this.provider.show(offer.placement);
  }
}
