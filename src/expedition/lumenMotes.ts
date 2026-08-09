import {
  gateSolvabilityOpening,
  type Gate,
} from "../sim/course";

export const LUMEN_MOTE_POOL_SIZE = 72;
export const LUMEN_MOTE_SPACING_UNITS = 7.6;
export const LUMEN_MOTE_START_AHEAD_UNITS = 18;
export const LUMEN_MOTE_COLLECT_RADIUS = 1.45;
export const LUMEN_MOTE_MISS_BEHIND_UNITS = 2.5;
export const LUMEN_MOTE_VISIBLE_AHEAD_UNITS = 112;
export const LUMEN_MOTE_VISIBLE_BEHIND_UNITS = 24;
export const LUMEN_GUIDE_LOOKAHEAD_UNITS = 24;
export const LUMEN_OBJECTIVE_CHAIN_TARGET = 6;
export const LUMEN_FULL_CHAIN_TARGET = 12;
export const LUMEN_OBJECTIVE_MIN_SECONDS = 20;
export const LUMEN_MOTE_BASE_SCORE = 25;

export interface LumenMotionSample {
  fromDistance: number;
  toDistance: number;
  fromLateral: number;
  toLateral: number;
  elapsedSec: number;
  gates: readonly Gate[];
  laneHalfWidth: number;
  creatureRadius: number;
}

export interface LumenMotePickup {
  sequence: number;
  distance: number;
  lateral: number;
  chain: number;
  bestChain: number;
  score: number;
  totalScore: number;
}

export interface LumenMoteStepEvents {
  collected: readonly LumenMotePickup[];
  brokenChain: number;
  objectiveCompleted: boolean;
  fullChainReached: boolean;
}

export interface LumenMoteSnapshot {
  active: boolean;
  currentChain: number;
  bestChain: number;
  collected: number;
  missed: number;
  score: number;
  objectiveTarget: number;
  objectiveProgress: number;
  objectiveComplete: boolean;
  fullChainReached: boolean;
}

export interface LumenMotePresentation {
  sequence: number;
  distance: number;
  lateral: number;
  height: number;
  visible: boolean;
}

export interface LumenMoteTarget {
  sequence: number;
  distance: number;
  lateral: number;
}

const NO_EVENTS: LumenMoteStepEvents = Object.freeze({
  collected: [],
  brokenChain: 0,
  objectiveCompleted: false,
  fullChainReached: false,
});
const NO_PRESENTATION: readonly LumenMotePresentation[] = Object.freeze([]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number): number {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
}

function safeOpeningCenter(
  gate: Gate,
  laneHalfWidth: number,
  creatureRadius: number,
): number {
  const opening = gateSolvabilityOpening(gate);
  const minimum = opening.gapLeft + creatureRadius;
  const maximum = opening.gapRight - creatureRadius;
  const center = (minimum + maximum) * 0.5;
  return clamp(
    center,
    -laneHalfWidth + creatureRadius,
    laneHalfWidth - creatureRadius,
  );
}

/**
 * Curves every Mote through the certified safe opening of the surrounding
 * gates. At a gate plane the result is exactly that gate's safe center; between
 * gates the smooth interpolation avoids a sharp steering reversal.
 */
export function lumenRouteLateralAt(
  distance: number,
  gates: readonly Gate[],
  laneHalfWidth: number,
  creatureRadius: number,
): number {
  let previousDistance = 0;
  let previousLateral = 0;
  let nextDistance = 0;
  let nextLateral = 0;
  let hasPrevious = false;
  let hasNext = false;

  for (const gate of gates) {
    const center = safeOpeningCenter(gate, laneHalfWidth, creatureRadius);
    if (gate.distance <= distance) {
      previousDistance = gate.distance;
      previousLateral = center;
      hasPrevious = true;
      continue;
    }
    nextDistance = gate.distance;
    nextLateral = center;
    hasNext = true;
    break;
  }

  if (!hasPrevious && !hasNext) return 0;
  if (!hasPrevious) {
    const progress = nextDistance <= 0 ? 1 : distance / nextDistance;
    return nextLateral * smoothstep(progress);
  }
  if (!hasNext || nextDistance <= previousDistance) return previousLateral;
  const progress = (distance - previousDistance) /
    (nextDistance - previousDistance);
  return previousLateral +
    (nextLateral - previousLateral) * smoothstep(progress);
}

export function lumenChainIntensity(chain: number): number {
  return clamp(chain / LUMEN_FULL_CHAIN_TARGET, 0, 1);
}

export function scoreForLumenMote(chain: number): number {
  const escalation = Math.min(
    LUMEN_FULL_CHAIN_TARGET - 1,
    Math.max(0, Math.floor(chain) - 1),
  );
  return LUMEN_MOTE_BASE_SCORE + escalation * 5;
}

export function isLumenObjectiveComplete(
  elapsedSec: number,
  bestChain: number,
): boolean {
  return elapsedSec >= LUMEN_OBJECTIVE_MIN_SECONDS &&
    bestChain >= LUMEN_OBJECTIVE_CHAIN_TARGET;
}

function pointToMotionDistanceSquared(
  pointDistance: number,
  pointLateral: number,
  motion: LumenMotionSample,
): number {
  const distanceDelta = motion.toDistance - motion.fromDistance;
  const lateralDelta = motion.toLateral - motion.fromLateral;
  const lengthSquared = distanceDelta * distanceDelta +
    lateralDelta * lateralDelta;
  const progress = lengthSquared <= 1e-9
    ? 0
    : clamp(
      ((pointDistance - motion.fromDistance) * distanceDelta +
        (pointLateral - motion.fromLateral) * lateralDelta) / lengthSquared,
      0,
      1,
    );
  const closestDistance = motion.fromDistance + distanceDelta * progress;
  const closestLateral = motion.fromLateral + lateralDelta * progress;
  const forwardGap = pointDistance - closestDistance;
  const lateralGap = pointLateral - closestLateral;
  return forwardGap * forwardGap + lateralGap * lateralGap;
}

export class LumenMoteDirector {
  private active = false;
  private originDistance = LUMEN_MOTE_START_AHEAD_UNITS;
  private nextUnresolvedSequence = 0;
  private currentChain = 0;
  private bestChain = 0;
  private collected = 0;
  private missed = 0;
  private score = 0;
  private objectiveComplete = false;
  private fullChainReached = false;
  private readonly resolved = new Set<number>();
  private readonly presentationPool: LumenMotePresentation[] = Array.from(
    { length: LUMEN_MOTE_POOL_SIZE },
    (_, sequence) => ({
      sequence,
      distance: 0,
      lateral: 0,
      height: 0,
      visible: false,
    }),
  );

  start(startDistance = 0): void {
    this.active = true;
    this.originDistance = startDistance + LUMEN_MOTE_START_AHEAD_UNITS;
    this.nextUnresolvedSequence = 0;
    this.currentChain = 0;
    this.bestChain = 0;
    this.collected = 0;
    this.missed = 0;
    this.score = 0;
    this.objectiveComplete = false;
    this.fullChainReached = false;
    this.resolved.clear();
  }

  stop(): void {
    this.active = false;
    this.currentChain = 0;
    this.resolved.clear();
  }

  private distanceFor(sequence: number): number {
    return this.originDistance + sequence * LUMEN_MOTE_SPACING_UNITS;
  }

  private lateralFor(
    sequence: number,
    gates: readonly Gate[],
    laneHalfWidth: number,
    creatureRadius: number,
  ): number {
    return lumenRouteLateralAt(
      this.distanceFor(sequence),
      gates,
      laneHalfWidth,
      creatureRadius,
    );
  }

  step(motion: LumenMotionSample): LumenMoteStepEvents {
    if (!this.active || motion.toDistance < motion.fromDistance) return NO_EVENTS;

    const collected: LumenMotePickup[] = [];
    const firstCandidate = Math.max(
      0,
      Math.floor(
        (motion.fromDistance - this.originDistance - LUMEN_MOTE_COLLECT_RADIUS) /
          LUMEN_MOTE_SPACING_UNITS,
      ),
    );
    const lastCandidate = Math.max(
      firstCandidate,
      Math.ceil(
        (motion.toDistance - this.originDistance + LUMEN_MOTE_COLLECT_RADIUS) /
          LUMEN_MOTE_SPACING_UNITS,
      ),
    );
    const radiusSquared = LUMEN_MOTE_COLLECT_RADIUS * LUMEN_MOTE_COLLECT_RADIUS;

    for (let sequence = firstCandidate; sequence <= lastCandidate; sequence += 1) {
      if (this.resolved.has(sequence)) continue;
      const distance = this.distanceFor(sequence);
      const lateral = this.lateralFor(
        sequence,
        motion.gates,
        motion.laneHalfWidth,
        motion.creatureRadius,
      );
      if (pointToMotionDistanceSquared(distance, lateral, motion) > radiusSquared) {
        continue;
      }
      this.resolved.add(sequence);
      this.currentChain += 1;
      this.bestChain = Math.max(this.bestChain, this.currentChain);
      this.collected += 1;
      const gainedScore = scoreForLumenMote(this.currentChain);
      this.score += gainedScore;
      collected.push({
        sequence,
        distance,
        lateral,
        chain: this.currentChain,
        bestChain: this.bestChain,
        score: gainedScore,
        totalScore: this.score,
      });
    }

    let brokenChain = 0;
    while (
      this.distanceFor(this.nextUnresolvedSequence) <
        motion.toDistance - LUMEN_MOTE_MISS_BEHIND_UNITS
    ) {
      if (!this.resolved.has(this.nextUnresolvedSequence)) {
        this.resolved.add(this.nextUnresolvedSequence);
        this.missed += 1;
        if (this.currentChain > 0) {
          brokenChain = Math.max(brokenChain, this.currentChain);
          this.currentChain = 0;
        }
      }
      this.nextUnresolvedSequence += 1;
    }

    const objectiveCompleted = !this.objectiveComplete &&
      isLumenObjectiveComplete(motion.elapsedSec, this.bestChain);
    if (objectiveCompleted) this.objectiveComplete = true;
    const fullChainReached = !this.fullChainReached &&
      this.bestChain >= LUMEN_FULL_CHAIN_TARGET;
    if (fullChainReached) this.fullChainReached = true;

    const pruneBefore = Math.max(0, this.nextUnresolvedSequence - 4);
    for (const sequence of this.resolved) {
      if (sequence < pruneBefore) this.resolved.delete(sequence);
    }

    return {
      collected,
      brokenChain,
      objectiveCompleted,
      fullChainReached,
    };
  }

  snapshot(): LumenMoteSnapshot {
    return {
      active: this.active,
      currentChain: this.currentChain,
      bestChain: this.bestChain,
      collected: this.collected,
      missed: this.missed,
      score: this.score,
      objectiveTarget: LUMEN_OBJECTIVE_CHAIN_TARGET,
      objectiveProgress: Math.min(
        LUMEN_OBJECTIVE_CHAIN_TARGET,
        this.bestChain,
      ),
      objectiveComplete: this.objectiveComplete,
      fullChainReached: this.fullChainReached,
    };
  }

  presentation(
    playerDistance: number,
    gates: readonly Gate[],
    laneHalfWidth: number,
    creatureRadius: number,
  ): readonly LumenMotePresentation[] {
    if (!this.active) return NO_PRESENTATION;
    const firstSequence = Math.max(
      0,
      Math.floor(
        (playerDistance - this.originDistance) / LUMEN_MOTE_SPACING_UNITS,
      ) - 2,
    );
    for (let slot = 0; slot < LUMEN_MOTE_POOL_SIZE; slot += 1) {
      const sequence = firstSequence + slot;
      const distance = this.distanceFor(sequence);
      const mote = this.presentationPool[slot];
      if (!mote) continue;
      mote.sequence = sequence;
      mote.distance = distance;
      mote.lateral = this.lateralFor(
        sequence,
        gates,
        laneHalfWidth,
        creatureRadius,
      );
      // Float above the corridor at Glowfin's eye-line so the route reads as a
      // collectible ribbon on a phone, rather than merging into floor detail.
      mote.height = 0.9 + Math.sin(sequence * 0.41) * 0.18;
      mote.visible = !this.resolved.has(sequence) &&
        distance > playerDistance - LUMEN_MOTE_VISIBLE_BEHIND_UNITS &&
        distance < playerDistance + LUMEN_MOTE_VISIBLE_AHEAD_UNITS;
    }
    return this.presentationPool;
  }

  nextTarget(
    playerDistance: number,
    gates: readonly Gate[],
    laneHalfWidth: number,
    creatureRadius: number,
  ): LumenMoteTarget | null {
    if (!this.active) return null;
    const startingSequence = Math.max(
      this.nextUnresolvedSequence,
      Math.floor(
        (playerDistance - this.originDistance) / LUMEN_MOTE_SPACING_UNITS,
      ),
    );
    for (
      let sequence = Math.max(0, startingSequence);
      sequence < startingSequence + LUMEN_MOTE_POOL_SIZE;
      sequence += 1
    ) {
      if (this.resolved.has(sequence)) continue;
      const distance = this.distanceFor(sequence);
      if (distance < playerDistance - LUMEN_MOTE_MISS_BEHIND_UNITS) continue;
      return {
        sequence,
        distance,
        lateral: this.lateralFor(
          sequence,
          gates,
          laneHalfWidth,
          creatureRadius,
        ),
      };
    }
    return null;
  }

  /** Read-only pure-pursuit cue matching the visible ribbon ahead. */
  guideLateral(
    playerDistance: number,
    gates: readonly Gate[],
    laneHalfWidth: number,
    creatureRadius: number,
  ): number | null {
    if (!this.active) return null;
    const nextGate = gates.find((gate) => gate.distance >= playerDistance);
    const guideDistance = Math.min(
      playerDistance + LUMEN_GUIDE_LOOKAHEAD_UNITS,
      nextGate?.distance ?? Number.POSITIVE_INFINITY,
    );
    return lumenRouteLateralAt(
      guideDistance,
      gates,
      laneHalfWidth,
      creatureRadius,
    );
  }
}
