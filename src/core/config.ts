/**
 * Tuning config loading and validation.
 *
 * Part 2 requires all tuning live as versioned data, editable without a code
 * change. Part 5.1 requires a non-programmer be able to edit it. That makes
 * validation load-bearing: a typo in tuning.json must fail loudly at startup
 * with a message naming the key and its allowed range — never silently
 * produce unfair gameplay, which would be a Core Design Principle violation
 * arriving through the back door.
 */
import rawTuning from "../../config/tuning.json";

export interface TuningConfig {
  version: number;
  momentum: {
    gainRate: number;
    ceiling: number;
    collisionRetainFraction: number;
    collisionFloor: number;
    stunDurationSec: number;
    invulnerabilityDurationSec: number;
  };
  speed: {
    forwardAtZeroMomentum: number;
    forwardAtMaxMomentum: number;
    lateralAtZeroMomentum: number;
    lateralAtMaxMomentum: number;
  };
  lane: { halfWidth: number; creatureRadius: number };
  readability: {
    visibleAheadUnits: number;
    minReactionWindowMs: number;
    minSolvabilityMarginFraction: number;
    maxLaneTraversalFraction: number;
    inputLatencyBudgetMs: number;
  };
  scoring: {
    nearMissClearanceUnits: number;
    nearMissCooldownSec: number;
    multiplierStart: number;
    multiplierGainPerNearMiss: number;
    multiplierCap: number;
    multiplierDecayPerSec: number;
    multiplierDecayGraceSec: number;
  };
  light: {
    max: number;
    costPerCollision: number;
    regenPerSec: number;
    regenDelayAfterCollisionSec: number;
  };
  input: {
    sensitivity: number;
    smoothingHalfLifeSec: number;
    deadZone: number;
    dragRangeFraction: number;
  };
}

interface Rule {
  min: number;
  max: number;
  note: string;
}

/**
 * Allowed range for every numeric tunable, keyed by dotted path.
 * Ranges are "will not break the game", not "is well tuned" — they exist to
 * catch typos and unit mistakes, not to enforce good design taste.
 */
const RULES: Record<string, Rule> = {
  "momentum.gainRate": { min: 0.01, max: 2, note: "asymptotic approach rate per second" },
  "momentum.ceiling": { min: 0.1, max: 1, note: "max momentum; speeds are lerped against this" },
  "momentum.collisionRetainFraction": { min: 0, max: 0.95, note: "fraction of momentum kept on collision" },
  "momentum.collisionFloor": { min: 0, max: 0.9, note: "momentum never drops below this (Part 2.4: never zeroes)" },
  "momentum.stunDurationSec": { min: 0, max: 5, note: "seconds after collision with no momentum gain" },
  "momentum.invulnerabilityDurationSec": { min: 0, max: 5, note: "i-frames preventing collision cascade" },

  "speed.forwardAtZeroMomentum": { min: 1, max: 200, note: "world units/sec at momentum 0" },
  "speed.forwardAtMaxMomentum": { min: 1, max: 200, note: "world units/sec at ceiling" },
  "speed.lateralAtZeroMomentum": { min: 1, max: 200, note: "steering speed at momentum 0" },
  "speed.lateralAtMaxMomentum": { min: 1, max: 200, note: "steering speed at ceiling" },

  "lane.halfWidth": { min: 1, max: 50, note: "playable lateral range is +/- this" },
  "lane.creatureRadius": { min: 0.05, max: 5, note: "collision radius" },

  "readability.visibleAheadUnits": { min: 5, max: 500, note: "how far ahead obstacles are visible" },
  "readability.minReactionWindowMs": { min: 100, max: 5000, note: "Core Design Principle: minimum reaction time" },
  "readability.minSolvabilityMarginFraction": { min: 0, max: 0.9, note: "required slack in solvability check" },
  "readability.maxLaneTraversalFraction": { min: 0.1, max: 1, note: "max lane fraction a gate transition may demand" },
  "readability.inputLatencyBudgetMs": { min: 10, max: 500, note: "Part 4.6: input-to-visible-response budget" },

  "scoring.nearMissClearanceUnits": { min: 0.01, max: 20, note: "clearance under which a pass counts as a near-miss" },
  "scoring.nearMissCooldownSec": { min: 0, max: 10, note: "prevents one cluster farming multiplier stacks" },
  "scoring.multiplierStart": { min: 1, max: 10, note: "multiplier at run start" },
  "scoring.multiplierGainPerNearMiss": { min: 0, max: 5, note: "flat gain per near-miss" },
  "scoring.multiplierCap": { min: 1, max: 100, note: "ceiling on multiplier" },
  "scoring.multiplierDecayPerSec": { min: 0, max: 5, note: "decay once grace elapses" },
  "scoring.multiplierDecayGraceSec": { min: 0, max: 30, note: "seconds before decay begins" },

  "light.max": { min: 1, max: 1000, note: "starting/maximum light (the run-end resource)" },
  "light.costPerCollision": { min: 0.1, max: 1000, note: "light lost per collision" },
  "light.regenPerSec": { min: 0, max: 100, note: "light regained per second while clean" },
  "light.regenDelayAfterCollisionSec": { min: 0, max: 30, note: "pause before regen resumes" },

  "input.sensitivity": { min: 0.05, max: 10, note: "steering responsiveness multiplier" },
  "input.smoothingHalfLifeSec": { min: 0, max: 0.5, note: "smoothing; higher adds latency (Part 2.1 warns against)" },
  "input.deadZone": { min: 0, max: 0.5, note: "ignore steering magnitudes below this" },
  "input.dragRangeFraction": { min: 0.05, max: 1, note: "fraction of screen width dragged for full deflection" }
};

function valueAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Validate a raw config object. Collects *all* problems before throwing, so a
 * designer fixing tuning.json sees every mistake at once rather than
 * discovering them one reload at a time.
 */
export function validateTuning(raw: unknown): TuningConfig {
  const problems: string[] = [];

  for (const [path, rule] of Object.entries(RULES)) {
    const value = valueAt(raw, path);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      problems.push(`${path}: missing or not a finite number (${rule.note})`);
      continue;
    }
    if (value < rule.min || value > rule.max) {
      problems.push(
        `${path}: ${value} is outside allowed range ${rule.min}..${rule.max} (${rule.note})`
      );
    }
  }

  // Cross-field invariants — individually valid values that are nonsense together.
  const speedMin = valueAt(raw, "speed.forwardAtZeroMomentum");
  const speedMax = valueAt(raw, "speed.forwardAtMaxMomentum");
  if (typeof speedMin === "number" && typeof speedMax === "number" && speedMin > speedMax) {
    problems.push("speed.forwardAtZeroMomentum must not exceed speed.forwardAtMaxMomentum");
  }

  const floor = valueAt(raw, "momentum.collisionFloor");
  const ceiling = valueAt(raw, "momentum.ceiling");
  if (typeof floor === "number" && typeof ceiling === "number" && floor >= ceiling) {
    problems.push("momentum.collisionFloor must be below momentum.ceiling");
  }

  const radius = valueAt(raw, "lane.creatureRadius");
  const halfWidth = valueAt(raw, "lane.halfWidth");
  if (typeof radius === "number" && typeof halfWidth === "number" && radius >= halfWidth) {
    problems.push("lane.creatureRadius must be smaller than lane.halfWidth");
  }

  const multStart = valueAt(raw, "scoring.multiplierStart");
  const multCap = valueAt(raw, "scoring.multiplierCap");
  if (typeof multStart === "number" && typeof multCap === "number" && multStart > multCap) {
    problems.push("scoring.multiplierStart must not exceed scoring.multiplierCap");
  }

  const lightCost = valueAt(raw, "light.costPerCollision");
  const lightMax = valueAt(raw, "light.max");
  if (typeof lightCost === "number" && typeof lightMax === "number" && lightCost > lightMax) {
    problems.push("light.costPerCollision must not exceed light.max (one hit would end the run)");
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid tuning config (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n  - ` +
        problems.join("\n  - ")
    );
  }

  return raw as TuningConfig;
}

/** The validated, active tuning config. Throws at import time if invalid. */
export const tuning: TuningConfig = validateTuning(rawTuning);
