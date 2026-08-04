import type { Gate } from "./course";

export const SIGNATURE_OBSTACLE_VERBS = [
  "moonflash-choice",
  "ceremonial-shutter",
  "current-lane"
] as const;

export type SignatureObstacleVerb = typeof SIGNATURE_OBSTACLE_VERBS[number];

export const OBSTACLE_VARIETY_CONTRACT = Object.freeze({
  targetTemplateMinimum: 20,
  targetTemplateMaximum: 24,
  minimumTelegraphLeadUnits: 30,
  livingEventFrequencyDivisor: 7,
  riskRouteScoreMultiplier: 1.35,
  choiceRouteBaseScoreUnits: 32
});

export interface ObstacleSource {
  seed: number;
  gate: Pick<Gate, "distance" | "gapLeft" | "gapRight" | "templateId" | "tier">;
}

export interface RouteOpening {
  left: number;
  right: number;
  route: "safe" | "moonflash";
  scoreMultiplier: number;
}

export interface MoonflashChoicePlan {
  verb: "moonflash-choice";
  telegraphFromDistance: number;
  openings: readonly [RouteOpening, RouteOpening];
  dividerWidth: number;
}

export interface CeremonialShutterPlan {
  verb: "ceremonial-shutter";
  telegraphFromDistance: number;
  center: number;
  minimumWidth: number;
  maximumWidth: number;
  periodSec: number;
  phase: number;
}

export interface CurrentLanePlan {
  verb: "current-lane";
  telegraphFromDistance: number;
  startDistance: number;
  endDistance: number;
  laneLeft: number;
  laneRight: number;
  /** Signed lateral drift in world units per second at the envelope peak. */
  lateralDriftPerSec: number;
}

export type SignatureObstaclePlan =
  | MoonflashChoicePlan
  | CeremonialShutterPlan
  | CurrentLanePlan;

export type LivingWorldEventKind =
  | "ray-procession"
  | "guardian-salute"
  | "moon-bloom-pulse";

export interface LivingWorldEventPlan {
  kind: LivingWorldEventKind;
  seed: number;
  anchorDistance: number;
  triggerDistance: number;
  durationSec: number;
}

export interface ActiveLivingWorldEvent {
  plan: LivingWorldEventPlan;
  startedAtSec: number;
}

function hashText(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function sourceHash(source: ObstacleSource, salt: string): number {
  const gate = source.gate;
  return hashText(
    `${salt}:${gate.templateId}:${gate.distance.toFixed(4)}:${gate.tier}`,
    source.seed
  );
}

function unit(hash: number): number {
  return (hash >>> 0) / 0x1_0000_0000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function telegraphFrom(gateDistance: number, extraLead = 0): number {
  return gateDistance - OBSTACLE_VARIETY_CONTRACT.minimumTelegraphLeadUnits - extraLead;
}

export function planMoonflashChoice(
  source: ObstacleSource,
  laneHalfWidth: number,
  creatureRadius: number
): MoonflashChoicePlan {
  const laneWidth = laneHalfWidth * 2;
  const authoredWidth = source.gate.gapRight - source.gate.gapLeft;
  const dividerWidth = clamp(laneWidth * 0.065, 0.62, 0.9);
  // The authored gap remains the guaranteed safe route. This is important:
  // the existing course generator has already proved that interval reachable,
  // so the optional high-reward branch may never invalidate it.
  const minimumMoonflashWidth = creatureRadius * 2 + 0.42;
  const desiredMoonflashWidth = clamp(
    authoredWidth * 0.5,
    minimumMoonflashWidth,
    laneWidth * 0.25
  );
  const safe: RouteOpening = {
    left: source.gate.gapLeft,
    right: source.gate.gapRight,
    route: "safe",
    scoreMultiplier: 1
  };
  const preferredRight = (sourceHash(source, "choice-side") & 1) === 0;
  const rightCapacity = laneHalfWidth - safe.right - dividerWidth;
  const leftCapacity = safe.left + laneHalfWidth - dividerWidth;
  const fitsRight = rightCapacity >= minimumMoonflashWidth;
  const fitsLeft = leftCapacity >= minimumMoonflashWidth;
  const placeRight = preferredRight
    ? fitsRight || !fitsLeft
    : !fitsLeft && fitsRight;
  const moonflashWidth = Math.min(
    desiredMoonflashWidth,
    Math.max(minimumMoonflashWidth, placeRight ? rightCapacity : leftCapacity)
  );
  const moonflash: RouteOpening = placeRight
    ? {
        left: safe.right + dividerWidth,
        right: safe.right + dividerWidth + moonflashWidth,
        route: "moonflash",
        scoreMultiplier: OBSTACLE_VARIETY_CONTRACT.riskRouteScoreMultiplier
      }
    : {
        left: safe.left - dividerWidth - moonflashWidth,
        right: safe.left - dividerWidth,
        route: "moonflash",
        scoreMultiplier: OBSTACLE_VARIETY_CONTRACT.riskRouteScoreMultiplier
      };

  return {
    verb: "moonflash-choice",
    telegraphFromDistance: telegraphFrom(source.gate.distance, 4),
    openings: [safe, moonflash],
    dividerWidth
  };
}

export function planCeremonialShutter(
  source: ObstacleSource,
  laneHalfWidth: number,
  creatureRadius: number
): CeremonialShutterPlan {
  const authoredWidth = source.gate.gapRight - source.gate.gapLeft;
  const center = clamp(
    (source.gate.gapLeft + source.gate.gapRight) * 0.5,
    -laneHalfWidth + authoredWidth * 0.5,
    laneHalfWidth - authoredWidth * 0.5
  );
  const minimumWidth = Math.min(
    authoredWidth,
    Math.max(creatureRadius * 2 + 1.05, authoredWidth * 0.68)
  );
  const hash = sourceHash(source, "shutter-motion");
  return {
    verb: "ceremonial-shutter",
    telegraphFromDistance: telegraphFrom(source.gate.distance, 7),
    center,
    minimumWidth,
    maximumWidth: authoredWidth,
    periodSec: 2.8 + unit(hash) * 1.4,
    phase: unit(sourceHash(source, "shutter-phase"))
  };
}

export function shutterOpeningAt(
  plan: CeremonialShutterPlan,
  elapsedSec: number
): { left: number; right: number; width: number } {
  const cycle = ((elapsedSec / plan.periodSec + plan.phase) % 1 + 1) % 1;
  const openAmount = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
  const width = plan.minimumWidth +
    (plan.maximumWidth - plan.minimumWidth) * openAmount;
  return {
    left: plan.center - width * 0.5,
    right: plan.center + width * 0.5,
    width
  };
}

export function planCurrentLane(
  source: ObstacleSource,
  laneHalfWidth: number
): CurrentLanePlan {
  const hash = sourceHash(source, "current-lane");
  const direction = (hash & 1) === 0 ? -1 : 1;
  const laneWidth = laneHalfWidth * (0.72 + unit(hash >>> 1) * 0.16);
  const center = direction * laneHalfWidth * 0.2;
  const startDistance = source.gate.distance - 35;
  return {
    verb: "current-lane",
    telegraphFromDistance: telegraphFrom(source.gate.distance, 10),
    startDistance,
    endDistance: source.gate.distance - 4,
    laneLeft: clamp(center - laneWidth * 0.5, -laneHalfWidth, laneHalfWidth),
    laneRight: clamp(center + laneWidth * 0.5, -laneHalfWidth, laneHalfWidth),
    lateralDriftPerSec: direction * (2.15 + unit(sourceHash(source, "current-force")) * 0.85)
  };
}

export function currentLaneForce(
  plan: CurrentLanePlan,
  forwardDistance: number,
  lateralPosition: number
): number {
  if (
    forwardDistance < plan.startDistance ||
    forwardDistance > plan.endDistance ||
    lateralPosition < plan.laneLeft ||
    lateralPosition > plan.laneRight
  ) return 0;
  const span = Math.max(0.001, plan.endDistance - plan.startDistance);
  const progress = (forwardDistance - plan.startDistance) / span;
  const longitudinalEnvelope = Math.sin(Math.PI * clamp(progress, 0, 1));
  return plan.lateralDriftPerSec * longitudinalEnvelope;
}

/**
 * Closed-form upper bound for a complete current-lane traversal. The sine
 * envelope integrates to 2/pi over its span, so the course proof can reserve
 * this much lateral authority before accepting a transition.
 */
export function maximumCurrentLaneDisplacement(
  plan: CurrentLanePlan,
  forwardSpeedPerSec: number
): number {
  const durationSec = Math.max(0, plan.endDistance - plan.startDistance) /
    Math.max(0.001, forwardSpeedPerSec);
  return Math.abs(plan.lateralDriftPerSec) * durationSec * (2 / Math.PI);
}

export function planSignatureObstacle(
  verb: SignatureObstacleVerb,
  source: ObstacleSource,
  laneHalfWidth: number,
  creatureRadius: number
): SignatureObstaclePlan {
  if (verb === "moonflash-choice") {
    return planMoonflashChoice(source, laneHalfWidth, creatureRadius);
  }
  if (verb === "ceremonial-shutter") {
    return planCeremonialShutter(source, laneHalfWidth, creatureRadius);
  }
  return planCurrentLane(source, laneHalfWidth);
}

export function planLivingWorldEvent(
  source: ObstacleSource
): LivingWorldEventPlan | null {
  const hash = sourceHash(source, "living-event");
  if (hash % OBSTACLE_VARIETY_CONTRACT.livingEventFrequencyDivisor !== 0) {
    return null;
  }
  const kinds: readonly LivingWorldEventKind[] = [
    "ray-procession",
    "guardian-salute",
    "moon-bloom-pulse"
  ];
  const kind = kinds[(hash >>> 8) % kinds.length] ?? "moon-bloom-pulse";
  const triggerLead = kind === "guardian-salute"
    ? 52
    : kind === "ray-procession"
      ? 46
      : 38;
  return {
    kind,
    seed: hash,
    anchorDistance: source.gate.distance,
    triggerDistance: source.gate.distance - triggerLead,
    durationSec: 3.2 + unit(sourceHash(source, "living-duration")) * 1.8
  };
}
