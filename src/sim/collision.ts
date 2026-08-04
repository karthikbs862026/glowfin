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
import {
  gateClearance,
  gateOpeningsAt,
  type GateOpeningRoute
} from "./gateGeometry";

export interface SweptSegment {
  /** Forward distance at the start of the step. */
  fromDistance: number;
  /** Forward distance at the end of the step. */
  toDistance: number;
  /** Lateral position at the start of the step. */
  fromLateral: number;
  /** Lateral position at the end of the step. */
  toLateral: number;
  /** Optional simulated time bounds; legacy fixtures default to time zero. */
  fromElapsedSec?: number;
  toElapsedSec?: number;
}

export interface GatePassResult {
  gate: Gate;
  collided: boolean;
  /**
   * Smallest distance between the creature's edge and a gap edge during the
   * crossing. Zero or negative means contact. Only meaningful when !collided.
   */
  clearance: number;
  /** Which authoritative opening was crossed. */
  route: GateOpeningRoute;
  /** Route-specific discrete reward multiplier. */
  scoreMultiplier: number;
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
  const elapsedAtGate = lerp(
    segment.fromElapsedSec ?? 0,
    segment.toElapsedSec ?? segment.fromElapsedSec ?? 0,
    t
  );
  const openings = gateOpeningsAt(gate, elapsedAtGate);
  let best: {
    clearance: number;
    route: GateOpeningRoute;
    scoreMultiplier: number;
  } | null = null;
  for (const opening of openings) {
    const { clearance } = gateClearance(
      lateralAtGate,
      cfg.lane.creatureRadius,
      {
        distance: gate.distance,
        gapLeft: opening.left,
        gapRight: opening.right
      }
    );
    if (!best || clearance > best.clearance) {
      best = {
        clearance,
        route: opening.route,
        scoreMultiplier: opening.scoreMultiplier
      };
    }
  }
  const resolved = best ?? {
    clearance: Number.NEGATIVE_INFINITY,
    route: "standard" as const,
    scoreMultiplier: 1
  };

  return {
    gate,
    collided: resolved.clearance < 0,
    clearance: resolved.clearance,
    route: resolved.route,
    scoreMultiplier: resolved.scoreMultiplier
  };
}

/**
 * Evaluate every gate crossed during one swept step, in order.
 *
 * `gates` must be sorted by distance ascending — the generator produces them
 * that way.
 *
 * `startIndex` lets the caller skip gates already behind the player. Without it
 * this scan is O(total gates generated) on every step, which grows without
 * bound over a run — fine for a 60-second session, wasteful for a soak test,
 * and exactly the kind of thing that shows up as a slow creep on a mid-range
 * phone rather than an obvious bug.
 */
export function evaluateStep(
  segment: SweptSegment,
  gates: readonly Gate[],
  cfg: TuningConfig,
  startIndex = 0
): GatePassResult[] {
  const results: GatePassResult[] = [];
  for (let i = Math.max(0, startIndex); i < gates.length; i++) {
    const gate = gates[i];
    if (!gate) continue;
    if (gate.distance >= segment.toDistance) break;
    if (gate.distance < segment.fromDistance) continue;
    const result = evaluateGate(segment, gate, cfg);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Index of the first gate at or beyond `distance`. Used to advance the scan
 * cursor as gates fall behind the player.
 */
export function firstGateAtOrBeyond(
  gates: readonly Gate[],
  distance: number,
  fromIndex = 0
): number {
  let i = Math.max(0, fromIndex);
  while (i < gates.length && (gates[i]?.distance ?? Infinity) < distance) i++;
  return i;
}

/** True if a clean pass was close enough to count as a near-miss (Part 2.3). */
export function isNearMiss(result: GatePassResult, cfg: TuningConfig): boolean {
  return !result.collided && result.clearance <= cfg.scoring.nearMissClearanceUnits;
}
