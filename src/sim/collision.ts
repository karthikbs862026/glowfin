/**
 * Swept gate collision and near-miss detection (ADR-0002, Part 2.3, 2.4).
 *
 * Exact and closed-form. Within one fixed sim step the creature moves linearly
 * in both axes, so the lateral extent over the portion of the step that crosses
 * a gate is just the interval between two interpolated endpoints. No sampling,
 * no tunnelling, no tolerance band — which is what Part 1.3 demands: the same
 * input at the same position produces the same result, every time.
 */
import type { TuningConfig } from "../core/config";
import type { Gate } from "./course";

export interface SweptSegment {
  /** Forward distance at the start of the step. */
  fromDistance: number;
  /** Forward distance at the end of the step. */
  toDistance: number;
  /** Lateral position at the start of the step. */
  fromLateral: number;
  /** Lateral position at the end of the step. */
  toLateral: number;
}

export interface GatePassResult {
  gate: Gate;
  collided: boolean;
  /**
   * Smallest distance between the creature's edge and a gap edge during the
   * crossing. Zero or negative means contact. Only meaningful when !collided.
   */
  clearance: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluate a single gate against one swept step.
 * Returns null if the step did not cross this gate.
 */
export function evaluateGate(
  segment: SweptSegment,
  gate: Gate,
  cfg: TuningConfig
): GatePassResult | null {
  const { fromDistance, toDistance, fromLateral, toLateral } = segment;
  const span = toDistance - fromDistance;

  // Gates are thin planes: the step crosses one if the gate's distance lies
  // within [fromDistance, toDistance).
  if (span <= 0) return null;
  if (gate.distance < fromDistance || gate.distance >= toDistance) return null;

  const t = (gate.distance - fromDistance) / span;
  const lateralAtGate = lerp(fromLateral, toLateral, t);

  const r = cfg.lane.creatureRadius;
  const creatureLeft = lateralAtGate - r;
  const creatureRight = lateralAtGate + r;

  const leftClearance = creatureLeft - gate.gapLeft;
  const rightClearance = gate.gapRight - creatureRight;
  const clearance = Math.min(leftClearance, rightClearance);

  return { gate, collided: clearance < 0, clearance };
}

/**
 * Evaluate every gate crossed during one swept step, in order.
 *
 * `gates` must be sorted by distance ascending — the generator produces them
 * that way.
 */
export function evaluateStep(
  segment: SweptSegment,
  gates: readonly Gate[],
  cfg: TuningConfig
): GatePassResult[] {
  const results: GatePassResult[] = [];
  for (const gate of gates) {
    if (gate.distance >= segment.toDistance) break;
    if (gate.distance < segment.fromDistance) continue;
    const result = evaluateGate(segment, gate, cfg);
    if (result) results.push(result);
  }
  return results;
}

/** True if a clean pass was close enough to count as a near-miss (Part 2.3). */
export function isNearMiss(result: GatePassResult, cfg: TuningConfig): boolean {
  return !result.collided && result.clearance <= cfg.scoring.nearMissClearanceUnits;
}
