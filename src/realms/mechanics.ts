import type { RealmId } from "./definition";

export const KELP_CATHEDRAL_MECHANICS_REVISION = 1 as const;
export const KELP_RESCUE_FIRST_GATE_INDEX = 18;
export const KELP_RESCUE_REPEAT_GATES = 8;
export const KELP_RELIC_FIRST_GATE_INDEX = 10;
export const KELP_RELIC_REPEAT_GATES = 12;
export const CRYSTAL_THRESHOLD_FIRST_GATE_INDEX = 18;
export const CRYSTAL_PLATES_FIRST_GATE_INDEX = CRYSTAL_THRESHOLD_FIRST_GATE_INDEX + 1;
export const CRYSTAL_PLATES_TO_RACE = 8;
export const CRYSTAL_MIRROR_RACE_DISTANCE = 1450;
export const CRYSTAL_NERI_SPEED_PER_SEC = 44;
export const CRYSTAL_NERI_START_LEAD = 10;
export const CRYSTAL_RACE_RETRY_DISTANCE = 120;
export const CRYSTAL_COMPLETE_COAST_DISTANCE = 34;

interface RealmGateSource {
  distance: number;
  gapLeft: number;
  gapRight: number;
  templateId: string;
  tier: number;
}

interface RealmPlanSource {
  seed: number;
  gate: RealmGateSource;
  gateIndex: number;
}

export interface SwayingFrondWindowPlan {
  verb: "swaying-frond-window";
  telegraphFromDistance: number;
  center: number;
  minimumWidth: number;
  maximumWidth: number;
  centerAmplitude: number;
  periodSec: number;
  phase: number;
}

export interface ReversingCurrentTunnelPlan {
  verb: "reversing-current-tunnel";
  telegraphFromDistance: number;
  startDistance: number;
  endDistance: number;
  laneLeft: number;
  laneRight: number;
  lateralDriftPerSec: number;
}

export interface MantaRescuePlan {
  verb: "manta-rescue";
  telegraphFromDistance: number;
  center: number;
  minimumWidth: number;
  maximumWidth: number;
  periodSec: number;
  phase: number;
}

export interface RelicCurrentPlan {
  verb: "relic-current";
  telegraphFromDistance: number;
  safe: {
    left: number;
    right: number;
  };
  relic: {
    left: number;
    right: number;
  };
  dividerWidth: number;
  relicPageId: "kelp-cathedral-page-1";
}

export interface PrismPulsePlan {
  verb: "prism-pulse";
  telegraphFromDistance: number;
  trueRoute: {
    left: number;
    right: number;
  };
  falseRouteCenters: readonly [number, number];
  falseRouteWidth: number;
  periodSec: number;
  phase: number;
  revealFraction: number;
}

export interface TrenchThresholdPlan {
  verb: "trench-threshold";
  telegraphFromDistance: number;
  center: number;
  openingWidth: number;
}

export interface SlidingCrystalPlatePlan {
  verb: "sliding-crystal-plates";
  telegraphFromDistance: number;
  centers: readonly [number, number, number];
  openingWidth: number;
  segmentSec: number;
  transitionFraction: number;
  phase: number;
  sequenceId: number;
}

export type KelpCathedralGatePlan =
  | SwayingFrondWindowPlan
  | ReversingCurrentTunnelPlan
  | MantaRescuePlan
  | RelicCurrentPlan;

export type CrystalTrenchGatePlan =
  | PrismPulsePlan
  | TrenchThresholdPlan
  | SlidingCrystalPlatePlan;

export type RealmGatePlan = KelpCathedralGatePlan | CrystalTrenchGatePlan;

export type RealmEventKind =
  | "frond-window"
  | "current-tunnel-enter"
  | "current-tunnel-reverse"
  | "relic-page"
  | "manta-rescue"
  | "manta-rescue-missed"
  | "prism-route"
  | "crystal-plate"
  | "crystal-plate-missed"
  | "trench-threshold"
  | "trench-threshold-missed"
  | "mirror-race-start"
  | "mirror-race-win"
  | "mirror-race-loss";

export type KelpRealmEventKind = Extract<
  RealmEventKind,
  | "frond-window"
  | "current-tunnel-enter"
  | "current-tunnel-reverse"
  | "relic-page"
  | "manta-rescue"
  | "manta-rescue-missed"
>;

export interface KelpRealmOpening {
  left: number;
  right: number;
  route: "standard" | "relic" | "rescue";
  scoreMultiplier: number;
}

function hashText(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function sourceHash(source: RealmPlanSource, salt: string): number {
  return hashText(
    `${salt}:${source.gateIndex}:${source.gate.templateId}:${source.gate.distance.toFixed(4)}`,
    source.seed,
  );
}

function unit(value: number): number {
  return (value >>> 0) / 0x1_0000_0000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function rhythmicOpening(
  plan: Pick<
    SwayingFrondWindowPlan,
    "center" | "minimumWidth" | "maximumWidth" | "centerAmplitude" | "periodSec" | "phase"
  >,
  elapsedSec: number,
): { left: number; right: number; width: number } {
  const cycle = positiveUnit(elapsedSec / plan.periodSec + plan.phase);
  const sway = Math.sin(cycle * Math.PI * 2);
  const openAmount = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
  const width = plan.minimumWidth +
    (plan.maximumWidth - plan.minimumWidth) * openAmount;
  // Sway peaks while the fronds are most closed and eases to the authored
  // centre at full aperture, so the moving window never leaves the lane.
  const center = plan.center + sway * plan.centerAmplitude * (1 - openAmount);
  return {
    left: center - width * 0.5,
    right: center + width * 0.5,
    width,
  };
}

function planFrondWindow(
  source: RealmPlanSource,
  creatureRadius: number,
): SwayingFrondWindowPlan {
  const authoredWidth = source.gate.gapRight - source.gate.gapLeft;
  const minimumWidth = Math.min(
    authoredWidth,
    Math.max(creatureRadius * 2 + 1.15, authoredWidth * 0.72),
  );
  const center = (source.gate.gapLeft + source.gate.gapRight) * 0.5;
  return {
    verb: "swaying-frond-window",
    telegraphFromDistance: source.gate.distance - 42,
    center,
    minimumWidth,
    maximumWidth: authoredWidth,
    centerAmplitude: Math.min(0.32, Math.max(0, (authoredWidth - minimumWidth) * 0.18)),
    periodSec: 3.15 + unit(sourceHash(source, "frond-period")) * 0.95,
    phase: unit(sourceHash(source, "frond-phase")),
  };
}

function planCurrentTunnel(
  source: RealmPlanSource,
  laneHalfWidth: number,
  creatureRadius: number,
): ReversingCurrentTunnelPlan {
  const hash = sourceHash(source, "current-tunnel");
  const direction = (hash & 1) === 0 ? -1 : 1;
  const gateCenter = (source.gate.gapLeft + source.gate.gapRight) * 0.5;
  const authoredWidth = source.gate.gapRight - source.gate.gapLeft;
  const tunnelWidth = clamp(
    Math.max(authoredWidth + creatureRadius * 2 + 0.8, laneHalfWidth * 1.25),
    creatureRadius * 2 + 1.6,
    laneHalfWidth * 1.55,
  );
  const center = clamp(
    gateCenter,
    -laneHalfWidth + tunnelWidth * 0.5,
    laneHalfWidth - tunnelWidth * 0.5,
  );
  return {
    verb: "reversing-current-tunnel",
    telegraphFromDistance: source.gate.distance - 48,
    startDistance: source.gate.distance - 38,
    endDistance: source.gate.distance - 5,
    laneLeft: center - tunnelWidth * 0.5,
    laneRight: center + tunnelWidth * 0.5,
    lateralDriftPerSec: direction * (1.9 + unit(sourceHash(source, "current-force")) * 0.65),
  };
}

function planMantaRescue(
  source: RealmPlanSource,
  creatureRadius: number,
): MantaRescuePlan {
  const authoredWidth = source.gate.gapRight - source.gate.gapLeft;
  const minimumWidth = Math.min(
    authoredWidth,
    Math.max(creatureRadius * 2 + 1.25, authoredWidth * 0.7),
  );
  return {
    verb: "manta-rescue",
    telegraphFromDistance: source.gate.distance - 56,
    center: (source.gate.gapLeft + source.gate.gapRight) * 0.5,
    minimumWidth,
    maximumWidth: authoredWidth,
    periodSec: 3.8,
    phase: unit(sourceHash(source, "rescue-phase")),
  };
}

function planRelicCurrent(
  source: RealmPlanSource,
  laneHalfWidth: number,
  creatureRadius: number,
): RelicCurrentPlan | SwayingFrondWindowPlan {
  const safe = {
    left: source.gate.gapLeft,
    right: source.gate.gapRight,
  };
  const dividerWidth = 0.72;
  const minimumRelicWidth = creatureRadius * 2 + 0.48;
  const preferRight = (sourceHash(source, "relic-side") & 1) === 0;
  const rightCapacity = laneHalfWidth - safe.right - dividerWidth;
  const leftCapacity = safe.left + laneHalfWidth - dividerWidth;
  const canRight = rightCapacity >= minimumRelicWidth;
  const canLeft = leftCapacity >= minimumRelicWidth;
  if (!canRight && !canLeft) return planFrondWindow(source, creatureRadius);
  const placeRight = preferRight ? canRight || !canLeft : !canLeft && canRight;
  const width = Math.min(
    Math.max(minimumRelicWidth, (safe.right - safe.left) * 0.5),
    placeRight ? rightCapacity : leftCapacity,
  );
  const relic = placeRight
    ? { left: safe.right + dividerWidth, right: safe.right + dividerWidth + width }
    : { left: safe.left - dividerWidth - width, right: safe.left - dividerWidth };
  return {
    verb: "relic-current",
    telegraphFromDistance: source.gate.distance - 52,
    safe,
    relic,
    dividerWidth,
    relicPageId: "kelp-cathedral-page-1",
  };
}

function planPrismPulse(
  source: RealmPlanSource,
  laneHalfWidth: number,
  creatureRadius: number,
): PrismPulsePlan {
  const trueRoute = {
    left: source.gate.gapLeft,
    right: source.gate.gapRight,
  };
  const trueCenter = (trueRoute.left + trueRoute.right) * 0.5;
  const candidates = [
    -laneHalfWidth * 0.62,
    0,
    laneHalfWidth * 0.62,
  ].sort((left, right) => (
    Math.abs(right - trueCenter) - Math.abs(left - trueCenter)
  ));
  const falseRouteWidth = Math.min(
    laneHalfWidth * 0.82,
    Math.max(
      creatureRadius * 2 + 0.52,
      (trueRoute.right - trueRoute.left) * 0.72,
    ),
  );
  return {
    verb: "prism-pulse",
    telegraphFromDistance: source.gate.distance - 54,
    trueRoute,
    falseRouteCenters: [candidates[0] ?? -laneHalfWidth * 0.55, candidates[1] ?? 0],
    falseRouteWidth,
    periodSec: 2.9 + unit(sourceHash(source, "prism-period")) * 0.72,
    phase: unit(sourceHash(source, "prism-phase")),
    revealFraction: 0.3,
  };
}

function planTrenchThreshold(source: RealmPlanSource): TrenchThresholdPlan {
  return {
    verb: "trench-threshold",
    telegraphFromDistance: source.gate.distance - 68,
    center: (source.gate.gapLeft + source.gate.gapRight) * 0.5,
    openingWidth: source.gate.gapRight - source.gate.gapLeft,
  };
}

function planSlidingCrystalPlate(
  source: RealmPlanSource,
  laneHalfWidth: number,
  creatureRadius: number,
): SlidingCrystalPlatePlan {
  const authoredWidth = source.gate.gapRight - source.gate.gapLeft;
  const baseCenter = (source.gate.gapLeft + source.gate.gapRight) * 0.5;
  const minimumIntersection = creatureRadius * 2 + 0.78;
  const openingWidth = authoredWidth;
  const laneLeft = -laneHalfWidth + openingWidth * 0.5;
  const laneRight = laneHalfWidth - openingWidth * 0.5;
  const leftCapacity = Math.max(0, baseCenter - laneLeft);
  const rightCapacity = Math.max(0, laneRight - baseCenter);
  const symmetricAmplitude = Math.max(
    0,
    Math.min(
      1.12,
      (openingWidth - minimumIntersection) * 0.5,
      leftCapacity,
      rightCapacity,
    ),
  );
  const hashedDirection = (sourceHash(source, "plate-direction") & 1) === 0 ? -1 : 1;
  const amplitudeScale = 0.72 + unit(sourceHash(source, "plate-span")) * 0.28;
  const centers: readonly [number, number, number] = symmetricAmplitude >= 0.42
    ? [
        baseCenter + hashedDirection * symmetricAmplitude * amplitudeScale,
        baseCenter,
        baseCenter - hashedDirection * symmetricAmplitude * amplitudeScale,
      ]
    : (() => {
        const direction = rightCapacity > leftCapacity
          ? 1
          : leftCapacity > rightCapacity
            ? -1
            : hashedDirection;
        const amplitude = Math.min(
          1.12,
          openingWidth - minimumIntersection,
          direction > 0 ? rightCapacity : leftCapacity,
        ) * amplitudeScale;
        return [
          baseCenter,
          clamp(baseCenter + direction * amplitude * 0.55, laneLeft, laneRight),
          clamp(baseCenter + direction * amplitude, laneLeft, laneRight),
        ] as const;
      })();
  return {
    verb: "sliding-crystal-plates",
    telegraphFromDistance: source.gate.distance - 62,
    centers,
    openingWidth,
    segmentSec: 1.48 + unit(sourceHash(source, "plate-tempo")) * 0.34,
    transitionFraction: 0.42,
    phase: unit(sourceHash(source, "plate-phase")),
    sequenceId: sourceHash(source, "plate-sequence") & 0xffff,
  };
}

export function slidingCrystalPlateOpeningAt(
  plan: SlidingCrystalPlatePlan,
  elapsedSec: number,
): { left: number; right: number; center: number; sequenceStep: 0 | 1 | 2 } {
  const sequencePosition = positiveUnit(elapsedSec / (plan.segmentSec * 3) + plan.phase) * 3;
  const sequenceStep = Math.floor(sequencePosition) as 0 | 1 | 2;
  const nextStep = ((sequenceStep + 1) % 3) as 0 | 1 | 2;
  const local = sequencePosition - sequenceStep;
  const transitionStart = 1 - plan.transitionFraction;
  const rawBlend = clamp(
    (local - transitionStart) / Math.max(0.001, plan.transitionFraction),
    0,
    1,
  );
  const blend = rawBlend * rawBlend * (3 - 2 * rawBlend);
  const center = plan.centers[sequenceStep] +
    (plan.centers[nextStep] - plan.centers[sequenceStep]) * blend;
  return {
    left: center - plan.openingWidth * 0.5,
    right: center + plan.openingWidth * 0.5,
    center,
    sequenceStep,
  };
}

export function trenchThresholdRetryPlan(
  gate: RealmGateSource,
): TrenchThresholdPlan {
  return {
    verb: "trench-threshold",
    telegraphFromDistance: gate.distance - 68,
    center: (gate.gapLeft + gate.gapRight) * 0.5,
    openingWidth: gate.gapRight - gate.gapLeft,
  };
}

export function slidingCrystalPlateRetryPlan(
  failedPlan: SlidingCrystalPlatePlan,
  targetPlan: SlidingCrystalPlatePlan,
  distance: number,
): SlidingCrystalPlatePlan {
  return {
    ...targetPlan,
    telegraphFromDistance: distance - 62,
    segmentSec: failedPlan.segmentSec,
    transitionFraction: failedPlan.transitionFraction,
    phase: failedPlan.phase,
    sequenceId: failedPlan.sequenceId,
  };
}

export function prismPulseState(
  plan: PrismPulsePlan,
  elapsedSec: number,
): {
  revealStrength: number;
  trueRouteBrightness: number;
  falseRouteBrightness: number;
} {
  const cycle = positiveUnit(elapsedSec / plan.periodSec + plan.phase);
  const distanceToPulse = Math.min(cycle, 1 - cycle);
  const halfReveal = Math.max(0.01, plan.revealFraction * 0.5);
  const revealStrength = 1 - clamp(distanceToPulse / halfReveal, 0, 1);
  return {
    revealStrength,
    trueRouteBrightness: 0.38 + revealStrength * 0.62,
    falseRouteBrightness: 0.72 - revealStrength * 0.64,
  };
}

export function planRealmGate(
  realmId: RealmId,
  source: RealmPlanSource,
  laneHalfWidth: number,
  creatureRadius: number,
): RealmGatePlan | undefined {
  if (realmId === "kelp-cathedral") {
    const rescueIndex = source.gateIndex - KELP_RESCUE_FIRST_GATE_INDEX;
    if (rescueIndex >= 0 && rescueIndex % KELP_RESCUE_REPEAT_GATES === 0) {
      return planMantaRescue(source, creatureRadius);
    }
    const relicIndex = source.gateIndex - KELP_RELIC_FIRST_GATE_INDEX;
    if (relicIndex >= 0 && relicIndex % KELP_RELIC_REPEAT_GATES === 0) {
      return planRelicCurrent(source, laneHalfWidth, creatureRadius);
    }
    return source.gateIndex % 2 === 0
      ? planFrondWindow(source, creatureRadius)
      : planCurrentTunnel(source, laneHalfWidth, creatureRadius);
  }
  if (realmId === "crystal-trench") {
    if (source.gateIndex === CRYSTAL_THRESHOLD_FIRST_GATE_INDEX) {
      return planTrenchThreshold(source);
    }
    if (source.gateIndex >= CRYSTAL_PLATES_FIRST_GATE_INDEX) {
      const plateIndex = source.gateIndex - CRYSTAL_PLATES_FIRST_GATE_INDEX;
      return plateIndex % 3 === 2
        ? planPrismPulse(source, laneHalfWidth, creatureRadius)
        : planSlidingCrystalPlate(source, laneHalfWidth, creatureRadius);
    }
    return planPrismPulse(source, laneHalfWidth, creatureRadius);
  }
  return undefined;
}

export function kelpRealmOpeningsAt(
  plan: KelpCathedralGatePlan,
  fallback: { left: number; right: number },
  elapsedSec: number,
): readonly KelpRealmOpening[] {
  if (plan.verb === "swaying-frond-window") {
    const opening = rhythmicOpening(plan, elapsedSec);
    return [{ ...opening, route: "standard", scoreMultiplier: 1 }];
  }
  if (plan.verb === "manta-rescue") {
    const opening = rhythmicOpening({ ...plan, centerAmplitude: 0 }, elapsedSec);
    return [{ ...opening, route: "rescue", scoreMultiplier: 1 }];
  }
  if (plan.verb === "relic-current") {
    return [
      { ...plan.safe, route: "standard", scoreMultiplier: 1 },
      { ...plan.relic, route: "relic", scoreMultiplier: 1.1 },
    ].sort((left, right) => left.left - right.left) as KelpRealmOpening[];
  }
  return [{ ...fallback, route: "standard", scoreMultiplier: 1 }];
}

export function realmOpeningsAt(
  plan: RealmGatePlan,
  fallback: { left: number; right: number },
  elapsedSec: number,
): readonly KelpRealmOpening[] {
  if (plan.verb === "sliding-crystal-plates") {
    const opening = slidingCrystalPlateOpeningAt(plan, elapsedSec);
    return [{
      left: opening.left,
      right: opening.right,
      route: "standard",
      scoreMultiplier: 1,
    }];
  }
  if (plan.verb === "prism-pulse" || plan.verb === "trench-threshold") {
    return [{ ...fallback, route: "standard", scoreMultiplier: 1 }];
  }
  return kelpRealmOpeningsAt(plan, fallback, elapsedSec);
}

export function kelpRealmProofOpening(
  plan: KelpCathedralGatePlan,
  fallback: { left: number; right: number },
): { left: number; right: number } {
  if (plan.verb === "swaying-frond-window" || plan.verb === "manta-rescue") {
    const swayReserve = plan.verb === "swaying-frond-window"
      ? plan.centerAmplitude
      : 0;
    return {
      left: plan.center - plan.minimumWidth * 0.5 + swayReserve,
      right: plan.center + plan.minimumWidth * 0.5 - swayReserve,
    };
  }
  if (plan.verb === "relic-current") return { ...plan.safe };
  return { ...fallback };
}

export function realmProofOpening(
  plan: RealmGatePlan,
  fallback: { left: number; right: number },
): { left: number; right: number } {
  if (plan.verb === "sliding-crystal-plates") {
    const left = Math.max(...plan.centers.map((center) => (
      center - plan.openingWidth * 0.5
    )));
    const right = Math.min(...plan.centers.map((center) => (
      center + plan.openingWidth * 0.5
    )));
    return { left, right };
  }
  if (plan.verb === "prism-pulse" || plan.verb === "trench-threshold") {
    return { ...fallback };
  }
  return kelpRealmProofOpening(plan, fallback);
}

export function currentTunnelForce(
  plan: ReversingCurrentTunnelPlan,
  forwardDistance: number,
  lateralPosition: number,
): number {
  if (
    forwardDistance < plan.startDistance ||
    forwardDistance > plan.endDistance ||
    lateralPosition < plan.laneLeft ||
    lateralPosition > plan.laneRight
  ) return 0;
  const progress = clamp(
    (forwardDistance - plan.startDistance) /
      Math.max(0.001, plan.endDistance - plan.startDistance),
    0,
    1,
  );
  return plan.lateralDriftPerSec * Math.sin(progress * Math.PI * 2);
}

export function maximumCurrentTunnelDisplacement(
  plan: ReversingCurrentTunnelPlan,
  forwardSpeedPerSec: number,
): number {
  const durationSec = Math.max(0, plan.endDistance - plan.startDistance) /
    Math.max(0.001, forwardSpeedPerSec);
  return Math.abs(plan.lateralDriftPerSec) * durationSec * (2 / Math.PI);
}

export function currentTunnelDirection(
  plan: ReversingCurrentTunnelPlan,
  forwardDistance: number,
): -1 | 0 | 1 {
  const force = currentTunnelForce(
    plan,
    forwardDistance,
    (plan.laneLeft + plan.laneRight) * 0.5,
  );
  return force < -1e-6 ? -1 : force > 1e-6 ? 1 : 0;
}
