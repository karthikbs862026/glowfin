/**
 * Solvability checking (Part 2.5 hard requirement, Part 6.6).
 *
 * "Every generated segment must be provably passable at the momentum level at
 * which it can appear." This module is the proof. It is closed-form: for each
 * consecutive pair of gates it compares the worst-case lateral travel required
 * against the travel budget available at that momentum. No simulation, no
 * statistical sampling — an unsolvable segment is detected as a fact, not as a
 * failure rate.
 *
 * ADR-0002 chose the deterministic movement model specifically so this could be
 * a proof rather than an estimate.
 */
import type { TuningConfig } from "../core/config";
import {
  type Gate,
  MomentumProfile,
  lateralBudget,
  rawLateralCapability,
  requiredTravel,
  forwardSpeedAt
} from "./course";

export interface SolvabilityViolation {
  kind: "unreachable" | "gap-too-narrow" | "outside-lane" | "insufficient-lead-time";
  gateIndex: number;
  gate: Gate;
  detail: string;
  /** Required vs available, where meaningful. */
  required?: number;
  available?: number;
}

export interface SolvabilityReport {
  solvable: boolean;
  gatesChecked: number;
  violations: SolvabilityViolation[];
  /**
   * Tightest observed headroom against what the player can *physically* do,
   * as a fraction. 0.36 means the hardest transition in this course demands
   * 64% of the achievable lateral travel.
   *
   * Deliberately measured against raw capability rather than the generation
   * budget: the budget already has the safety margin subtracted, so margin
   * against it would read 0% on any transition the generator maxed out, which
   * sounds alarming while actually being fine.
   */
  worstRawMarginFraction: number;
}

/**
 * Prove (or disprove) that a gate sequence is passable.
 *
 * The first gate is checked against the worst possible starting position,
 * which is either lane edge — the player may be anywhere when the course
 * begins or when resuming after a collision.
 */
export function checkSolvability(
  gates: readonly Gate[],
  cfg: TuningConfig,
  profile: MomentumProfile
): SolvabilityReport {
  const violations: SolvabilityViolation[] = [];
  let worstRawMarginFraction = 1;

  const r = cfg.lane.creatureRadius;
  const halfWidth = cfg.lane.halfWidth;

  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i];
    if (!gate) continue;

    // --- the gap must physically admit the creature ---
    const gapWidth = gate.gapRight - gate.gapLeft;
    if (gapWidth <= r * 2) {
      violations.push({
        kind: "gap-too-narrow",
        gateIndex: i,
        gate,
        detail: `gap ${gapWidth.toFixed(3)} cannot admit a creature of diameter ${(r * 2).toFixed(3)}`,
        required: r * 2,
        available: gapWidth
      });
      continue;
    }

    // --- the gap must lie inside the lane ---
    if (gate.gapLeft < -halfWidth - 1e-6 || gate.gapRight > halfWidth + 1e-6) {
      violations.push({
        kind: "outside-lane",
        gateIndex: i,
        gate,
        detail: `gap [${gate.gapLeft.toFixed(2)}, ${gate.gapRight.toFixed(2)}] falls outside lane +/-${halfWidth}`
      });
    }

    // --- the player must be able to see it in time (Part 4.5) ---
    const momentum = profile.at(gate.distance);
    const leadTimeMs =
      (cfg.readability.visibleAheadUnits / forwardSpeedAt(momentum, cfg)) * 1000;
    if (leadTimeMs < cfg.readability.minReactionWindowMs) {
      violations.push({
        kind: "insufficient-lead-time",
        gateIndex: i,
        gate,
        detail: `only ${leadTimeMs.toFixed(0)}ms of lead time at momentum ${momentum.toFixed(3)}`,
        required: cfg.readability.minReactionWindowMs,
        available: leadTimeMs
      });
    }

    // --- the player must be able to reach it from wherever they were ---
    const previous = i === 0 ? null : gates[i - 1];
    const fromGate: Gate = previous ?? {
      // Worst case at course start: anywhere across the full lane.
      distance: 0,
      gapLeft: -halfWidth,
      gapRight: halfWidth,
      templateId: "__start__",
      tier: 0
    };

    const needed = requiredTravel(fromGate, gate, cfg);
    const budget = lateralBudget(fromGate.distance, gate.distance, profile, cfg);

    if (needed > budget + 1e-9) {
      violations.push({
        kind: "unreachable",
        gateIndex: i,
        gate,
        detail:
          `needs ${needed.toFixed(3)} units of lateral travel but only ` +
          `${budget.toFixed(3)} are available at momentum ${momentum.toFixed(3)}`,
        required: needed,
        available: budget
      });
    }

    const rawCapability = rawLateralCapability(
      fromGate.distance,
      gate.distance,
      profile,
      cfg
    );
    if (rawCapability > 0) {
      const margin = 1 - needed / rawCapability;
      if (margin < worstRawMarginFraction) worstRawMarginFraction = margin;
    }
  }

  return {
    solvable: violations.length === 0,
    gatesChecked: gates.length,
    violations,
    worstRawMarginFraction
  };
}

/** Human-readable summary, used by the sweep script and CI output. */
export function formatReport(seed: number, report: SolvabilityReport): string {
  if (report.solvable) {
    return (
      `seed ${seed}: OK (${report.gatesChecked} gates, ` +
      `worst headroom ${(report.worstRawMarginFraction * 100).toFixed(1)}%)`
    );
  }
  const lines = report.violations
    .slice(0, 5)
    .map((v) => `    [${v.kind}] gate ${v.gateIndex} @ ${v.gate.distance.toFixed(1)}: ${v.detail}`);
  const more = report.violations.length > 5 ? `\n    ...and ${report.violations.length - 5} more` : "";
  return `seed ${seed}: UNSOLVABLE (${report.violations.length} violations)\n${lines.join("\n")}${more}`;
}
