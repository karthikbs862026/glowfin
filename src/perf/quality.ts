/**
 * Dynamic quality scaling (Part 4.6).
 *
 * The brief requires "defined behavior when the floor is missed". This is that
 * behaviour: sustained frame-time overrun steps quality down, sustained
 * recovery steps it back up, and hysteresis plus a cooldown keep it from
 * oscillating visibly mid-run — which would be worse than simply running at the
 * lower tier.
 *
 * Deliberately a pure state machine with no rendering or timing dependencies,
 * so the Part 6.8 tests can drive it with synthetic frame times rather than
 * needing a real GPU under load.
 */
import budgets from "../../config/budgets.json";

export type QualityTier = "high" | "medium" | "low";

export interface TierSettings {
  pixelRatioCap: number;
  causticOctaves: number;
  causticsEnabled: boolean;
  /** Bloom is the most expensive effect here — first thing dropped under load. */
  bloomEnabled: boolean;
  bloomResolutionScale: number;
}

const TIER_ORDER: QualityTier[] = ["low", "medium", "high"];

export function tierSettings(tier: QualityTier): TierSettings {
  return budgets.quality.tiers[tier];
}

export interface QualityChange {
  from: QualityTier;
  to: QualityTier;
  reason: "overrun" | "recovered";
}

export class QualityController {
  private tier: QualityTier;
  private frameTimesMs: number[] = [];
  private badWindows = 0;
  private goodWindows = 0;
  private cooldownRemainingMs = 0;

  constructor(
    startTier: QualityTier = "high",
    private readonly frameBudgetMs = budgets.frameRate.frameBudgetMsMidRange
  ) {
    this.tier = startTier;
  }

  get current(): QualityTier {
    return this.tier;
  }

  get settings(): TierSettings {
    return tierSettings(this.tier);
  }

  /** Most recent window's median frame time, or null before the first window. */
  private medianOf(samples: readonly number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted[mid] ?? 0;
  }

  /**
   * Feed one frame. Returns a change if the tier moved, otherwise null.
   *
   * Median rather than mean: a single GC pause or a scheduler hiccup should not
   * drag quality down, and the mean is far too sensitive to those. What matters
   * is whether the *typical* frame is missing budget.
   */
  recordFrame(frameTimeMs: number): QualityChange | null {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return null;

    this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - frameTimeMs);
    this.frameTimesMs.push(frameTimeMs);
    if (this.frameTimesMs.length < budgets.quality.sampleWindowFrames) return null;

    const median = this.medianOf(this.frameTimesMs);
    this.frameTimesMs = [];

    if (median > this.frameBudgetMs) {
      this.badWindows++;
      this.goodWindows = 0;
    } else {
      this.goodWindows++;
      this.badWindows = 0;
    }

    if (this.cooldownRemainingMs > 0) return null;

    if (this.badWindows >= budgets.quality.downgradeAfterBadWindows) {
      const next = this.step(-1);
      if (next) return this.applyChange(next, "overrun");
    }

    // Upgrading requires a longer clean streak than downgrading requires a bad
    // one. Recovering too eagerly just walks straight back into the overrun
    // that caused the downgrade.
    if (this.goodWindows >= budgets.quality.upgradeAfterGoodWindows) {
      const next = this.step(1);
      if (next) return this.applyChange(next, "recovered");
    }

    return null;
  }

  private step(direction: -1 | 1): QualityTier | null {
    const index = TIER_ORDER.indexOf(this.tier);
    const target = index + direction;
    if (target < 0 || target >= TIER_ORDER.length) return null;
    return TIER_ORDER[target] ?? null;
  }

  private applyChange(to: QualityTier, reason: QualityChange["reason"]): QualityChange {
    const from = this.tier;
    this.tier = to;
    this.badWindows = 0;
    this.goodWindows = 0;
    this.cooldownRemainingMs = budgets.quality.cooldownMs;
    return { from, to, reason };
  }

  /** Force a tier, e.g. from a user setting or a debug tool. Resets counters. */
  forceTier(tier: QualityTier): void {
    this.tier = tier;
    this.frameTimesMs = [];
    this.badWindows = 0;
    this.goodWindows = 0;
    this.cooldownRemainingMs = budgets.quality.cooldownMs;
  }
}
