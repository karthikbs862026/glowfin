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

export interface RewardedVideoCompletion {
  status: "completed" | "skipped" | "failed";
  receipt: string | null;
}

export interface RewardedVideoProvider {
  available(placement: RewardedPlacement): Promise<boolean>;
  show(placement: RewardedPlacement): Promise<RewardedVideoCompletion>;
}

export interface GlowfinRewardedVideoBridge {
  available(placement: RewardedPlacement): boolean | Promise<boolean>;
  show(placement: RewardedPlacement): Promise<
    "completed" | "skipped" | "failed" |
    { status: "completed" | "skipped" | "failed"; receipt?: string }
  >;
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

/**
 * Phase 4B live bridge policy. A host must inject a conforming provider before
 * boot; without one, no placement is offered and no advertising code runs.
 * Recovery remains disabled because reviving a competitive run would change
 * leaderboard truth. Completed-run Lumen doubling affects cosmetics only.
 */
export const LIVE_REWARDED_VIDEO_FLAGS: Readonly<RewardedVideoFlags> = Object.freeze({
  enabled: true,
  runRecovery: false,
  doubleLumenPearls: true
});

function isBridge(value: unknown): value is GlowfinRewardedVideoBridge {
  return Boolean(value) && typeof value === "object" &&
    typeof (value as Partial<GlowfinRewardedVideoBridge>).available === "function" &&
    typeof (value as Partial<GlowfinRewardedVideoBridge>).show === "function";
}

/** Provider adapter for an owner-controlled, consented host SDK integration. */
export class BrowserRewardedVideoProvider implements RewardedVideoProvider {
  constructor(private readonly bridge: GlowfinRewardedVideoBridge) {}

  static fromGlobal(root: typeof globalThis = globalThis): BrowserRewardedVideoProvider | null {
    const bridge = (root as typeof globalThis & {
      GlowfinRewardedVideo?: unknown;
    }).GlowfinRewardedVideo;
    return isBridge(bridge) ? new BrowserRewardedVideoProvider(bridge) : null;
  }

  async available(placement: RewardedPlacement): Promise<boolean> {
    try {
      return (await this.bridge.available(placement)) === true;
    } catch {
      return false;
    }
  }

  async show(placement: RewardedPlacement): Promise<RewardedVideoCompletion> {
    try {
      const result = await this.bridge.show(placement);
      const status = typeof result === "string" ? result : result.status;
      const receipt = typeof result === "string" ? null : result.receipt ?? null;
      if (status !== "completed" && status !== "skipped") {
        return { status: "failed", receipt: null };
      }
      return {
        status,
        receipt: status === "completed" && typeof receipt === "string"
          ? receipt.slice(0, 2048)
          : null
      };
    } catch {
      return { status: "failed", receipt: null };
    }
  }
}

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

  async show(offer: RewardedOffer): Promise<RewardedVideoCompletion> {
    if (!offer.eligible || !this.flags.enabled || !this.provider) {
      return { status: "failed", receipt: null };
    }
    return this.provider.show(offer.placement);
  }
}
