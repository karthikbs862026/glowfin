/**
 * Procedural course generation (Part 2.5).
 *
 * Courses are built from authored chunk templates (config/chunks.json),
 * selected by a seeded RNG so any run reproduces exactly from its seed.
 *
 * The important property: gates are **solvable by construction**. Rather than
 * generating freely and rejecting bad output, each gate's centre is clamped
 * into the range reachable from the previous gate at the momentum the player
 * will actually have there. The Part 6.6 sweep then independently proves this
 * held — belt and braces, because "the generator is careful" is not the same
 * claim as "no unsolvable segment exists".
 */
import type { TuningConfig } from "../core/config";
import { SeededRandom } from "../core/rng";
import chunkData from "../../config/chunks.json";

export interface Gate {
  /** Forward distance at which this gate sits. */
  distance: number;
  /** Left edge of the opening, in lane coordinates. */
  gapLeft: number;
  /** Right edge of the opening. */
  gapRight: number;
  /** Template this gate came from, for debugging and telemetry. */
  templateId: string;
  /** Difficulty tier at spawn time. */
  tier: number;
}

interface GateTemplate {
  centerFraction: number;
  widthFraction: number;
}

interface ChunkTemplate {
  id: string;
  minTier: number;
  weight: number;
  gates: GateTemplate[];
}

interface DifficultySettings {
  distancePerTier: number;
  maxTier: number;
  gapWidthMultiplierAtMaxTier: number;
  minGapWidthUnits: number;
  gateSpacingMinUnits: number;
  gateSpacingMaxUnits: number;
  /** Gates draw closer together at high tier, raising decision rate. */
  gateSpacingMultiplierAtMaxTier: number;
}

const difficulty = chunkData.difficulty as DifficultySettings;
const templates = chunkData.templates as ChunkTemplate[];

/** Difficulty tier at a given forward distance. */
export function tierAtDistance(distance: number): number {
  const raw = Math.floor(distance / difficulty.distancePerTier);
  return Math.max(0, Math.min(difficulty.maxTier, raw));
}

/**
 * Momentum the player has after travelling `distance`, assuming a clean run.
 *
 * A clean run is the *worst case* for solvability: collisions reduce momentum,
 * which reduces speed, which gives more time to cross to the next gate. So
 * checking against the clean-run momentum checks the hardest case.
 *
 * Built as a lookup table once, then interpolated — this gets called a lot by
 * the solvability sweep.
 */
export class MomentumProfile {
  private readonly distances: number[] = [];
  private readonly momenta: number[] = [];

  constructor(cfg: TuningConfig, maxDistance: number, stepSec = 1 / 120) {
    let momentum = 0;
    let distance = 0;
    this.distances.push(0);
    this.momenta.push(0);

    const { ceiling, gainRate } = cfg.momentum;
    const { forwardAtZeroMomentum: f0, forwardAtMaxMomentum: f1 } = cfg.speed;

    let guard = 0;
    while (distance < maxDistance && guard < 10_000_000) {
      momentum += (ceiling - momentum) * gainRate * stepSec;
      if (momentum > ceiling) momentum = ceiling;
      const t = ceiling === 0 ? 0 : momentum / ceiling;
      distance += (f0 + (f1 - f0) * t) * stepSec;
      this.distances.push(distance);
      this.momenta.push(momentum);
      guard++;
    }
  }

  at(distance: number): number {
    const last = this.momenta[this.momenta.length - 1] ?? 0;
    if (distance <= 0) return this.momenta[0] ?? 0;
    const lastDistance = this.distances[this.distances.length - 1] ?? 0;
    if (distance >= lastDistance) return last;

    // Binary search the sampled profile.
    let lo = 0;
    let hi = this.distances.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const midDistance = this.distances[mid] ?? 0;
      if (midDistance <= distance) lo = mid;
      else hi = mid;
    }
    const d0 = this.distances[lo] ?? 0;
    const d1 = this.distances[hi] ?? d0;
    const m0 = this.momenta[lo] ?? 0;
    const m1 = this.momenta[hi] ?? m0;
    if (d1 === d0) return m0;
    return m0 + ((m1 - m0) * (distance - d0)) / (d1 - d0);
  }
}

export function forwardSpeedAt(momentum: number, cfg: TuningConfig): number {
  const t = cfg.momentum.ceiling === 0 ? 0 : momentum / cfg.momentum.ceiling;
  return cfg.speed.forwardAtZeroMomentum +
    (cfg.speed.forwardAtMaxMomentum - cfg.speed.forwardAtZeroMomentum) * t;
}

export function lateralSpeedAt(momentum: number, cfg: TuningConfig): number {
  const t = cfg.momentum.ceiling === 0 ? 0 : momentum / cfg.momentum.ceiling;
  return cfg.speed.lateralAtZeroMomentum +
    (cfg.speed.lateralAtMaxMomentum - cfg.speed.lateralAtZeroMomentum) * t;
}

/**
 * Raw lateral distance physically coverable between two gates — no safety
 * margin applied. This is the hard limit of what the player *could* do with
 * perfect input; `lateralBudget` is what generation is actually allowed to use.
 */
export function rawLateralCapability(
  fromDistance: number,
  toDistance: number,
  profile: MomentumProfile,
  cfg: TuningConfig
): number {
  const spacing = toDistance - fromDistance;
  if (spacing <= 0) return 0;
  const momentum = profile.at(toDistance);
  const timeAvailable = spacing / forwardSpeedAt(momentum, cfg);
  return lateralSpeedAt(momentum, cfg) * timeAvailable;
}

/**
 * Maximum lateral distance generation may demand between two gates.
 *
 * Two limits apply and the tighter wins:
 *   - the raw capability reduced by the required safety margin, and
 *   - an absolute cap on how much of the lane a single transition may demand
 *     (`maxLaneTraversalFraction`), which keeps worst-case difficulty bounded
 *     regardless of how generous the spacing happens to be.
 */
export function lateralBudget(
  fromDistance: number,
  toDistance: number,
  profile: MomentumProfile,
  cfg: TuningConfig
): number {
  // Momentum at the *end* of the transition: the fastest the player travels
  // over this stretch, so the least time available. Worst case.
  const raw = rawLateralCapability(fromDistance, toDistance, profile, cfg);
  if (raw <= 0) return 0;

  const withMargin = raw / (1 + cfg.readability.minSolvabilityMarginFraction);
  const traversalCap =
    cfg.lane.halfWidth * 2 * cfg.readability.maxLaneTraversalFraction;
  return Math.min(withMargin, traversalCap);
}

/**
 * Worst-case lateral travel required to get from anywhere inside `from` to
 * somewhere inside `to`. Closed form — no simulation.
 */
export function requiredTravel(from: Gate, to: Gate, cfg: TuningConfig): number {
  const r = cfg.lane.creatureRadius;
  const fromLo = from.gapLeft + r;
  const fromHi = from.gapRight - r;
  const toLo = to.gapLeft + r;
  const toHi = to.gapRight - r;

  const distanceToInterval = (x: number) => Math.max(0, toLo - x, x - toHi);
  return Math.max(distanceToInterval(fromLo), distanceToInterval(fromHi));
}

export class CourseGenerator {
  private readonly rng: SeededRandom;
  private readonly profile: MomentumProfile;
  private readonly generated: Gate[] = [];
  private nextDistance: number;

  constructor(
    readonly seed: number,
    private readonly cfg: TuningConfig,
    options: { firstGateDistance?: number; profileDistance?: number } = {}
  ) {
    this.rng = new SeededRandom(seed);
    this.profile = new MomentumProfile(cfg, options.profileDistance ?? 12000);
    // Give the player a clear runway before the first obstacle.
    this.nextDistance = options.firstGateDistance ?? cfg.readability.visibleAheadUnits;
  }

  get gates(): readonly Gate[] {
    return this.generated;
  }

  /**
   * Drop gates that are far enough behind the player to be unreachable and
   * off-screen. Part 4.3 requires disposal rather than unbounded growth: an
   * endless runner is a long continuous scene, which is the worst case for the
   * iOS Safari heap ceiling.
   *
   * Returns how many were removed, so callers holding indices into `gates` can
   * correct them.
   */
  prune(behindDistance: number): number {
    let count = 0;
    while (
      count < this.generated.length &&
      (this.generated[count]?.distance ?? Infinity) < behindDistance
    ) {
      count++;
    }
    if (count > 0) this.generated.splice(0, count);
    return count;
  }

  /** Generate until at least one gate exists beyond `distance`. */
  ensureGeneratedTo(distance: number): void {
    let guard = 0;
    while (this.nextDistance <= distance && guard < 100000) {
      this.appendChunk();
      guard++;
    }
  }

  private appendChunk(): void {
    const tier = tierAtDistance(this.nextDistance);
    const eligible = templates.filter((t) => t.minTier <= tier);
    const template = this.pickWeighted(eligible);
    const tierFraction = difficulty.maxTier === 0 ? 0 : tier / difficulty.maxTier;
    const spacingScale =
      1 + (difficulty.gateSpacingMultiplierAtMaxTier - 1) * tierFraction;

    for (const gateTemplate of template.gates) {
      const spacing =
        this.rng.range(difficulty.gateSpacingMinUnits, difficulty.gateSpacingMaxUnits) *
        spacingScale;
      const distance = this.nextDistance;
      this.generated.push(this.buildGate(gateTemplate, distance, tier, template.id));
      this.nextDistance = distance + spacing;
    }
  }

  private pickWeighted(candidates: readonly ChunkTemplate[]): ChunkTemplate {
    const fallback = templates[0];
    if (candidates.length === 0) {
      if (!fallback) throw new Error("CourseGenerator: no chunk templates defined");
      return fallback;
    }
    let total = 0;
    for (const c of candidates) total += Math.max(0, c.weight);
    if (total <= 0) return candidates[0] ?? fallback ?? candidates[0]!;

    let roll = this.rng.next() * total;
    for (const c of candidates) {
      roll -= Math.max(0, c.weight);
      if (roll <= 0) return c;
    }
    return candidates[candidates.length - 1] ?? candidates[0]!;
  }

  private buildGate(
    template: GateTemplate,
    distance: number,
    tier: number,
    templateId: string
  ): Gate {
    const cfg = this.cfg;
    const halfWidth = cfg.lane.halfWidth;
    const laneWidth = halfWidth * 2;
    const r = cfg.lane.creatureRadius;

    // --- gap width, scaled by tier ---
    const tierFraction = difficulty.maxTier === 0 ? 0 : tier / difficulty.maxTier;
    const widthScale =
      1 + (difficulty.gapWidthMultiplierAtMaxTier - 1) * tierFraction;
    const widthUnits = Math.max(
      difficulty.minGapWidthUnits,
      laneWidth * template.widthFraction * widthScale
    );
    const halfGap = widthUnits / 2;

    // --- centre, clamped so the gate stays inside the lane ---
    let center = template.centerFraction * halfWidth;
    const laneLo = -halfWidth + halfGap;
    const laneHi = halfWidth - halfGap;
    center = Math.max(laneLo, Math.min(laneHi, center));

    // --- centre, clamped so the gate is reachable from the previous one ---
    const previous = this.generated[this.generated.length - 1];
    if (previous) {
      const budget = lateralBudget(previous.distance, distance, this.profile, cfg);
      const prevLo = previous.gapLeft + r;
      const prevHi = previous.gapRight - r;

      // Derivation: requiring dist(prevLo, [c-halfGap+r, c+halfGap-r]) <= budget
      // and the same for prevHi, solved for c.
      const cMin = prevHi - halfGap + r - budget;
      const cMax = prevLo + halfGap - r + budget;

      const lo = Math.max(laneLo, cMin);
      const hi = Math.min(laneHi, cMax);
      // If the window inverted, the spacing cannot support any offset at all —
      // fall back to matching the previous gate's centre, which needs no travel.
      center = lo <= hi
        ? Math.max(lo, Math.min(hi, center))
        : (previous.gapLeft + previous.gapRight) / 2;
    }

    return {
      distance,
      gapLeft: center - halfGap,
      gapRight: center + halfGap,
      templateId,
      tier
    };
  }
}
