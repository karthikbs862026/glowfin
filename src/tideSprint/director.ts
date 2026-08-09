import {
  TIDE_SPRINT_FINISH_UNITS,
  TIDE_SPRINT_LANE_HALF_WIDTH,
  TIDE_SPRINT_CURRENT_RING_CAPTURE_RADIUS,
  TIDE_SPRINT_CURRENT_RINGS,
  TIDE_SPRINT_OBSTACLES,
  tideSprintCurrentCenter,
  tideSprintCurrentRadius,
  tideSprintNearestCurrentRingAhead,
  tideSprintSafeCurrentTarget,
  tideSprintSectionAtDistance,
  type TideSprintSection,
} from "./course";
import {
  TIDE_SPRINT_CHARACTER_IDS,
  tideSprintCrewMember,
  type TideSprintCharacterId,
  type TideSprintCrewId,
} from "./crew";

export { TIDE_SPRINT_FINISH_UNITS as CLEAN_TIDE_SPRINT_FINISH_UNITS };
export const CLEAN_TIDE_SPRINT_SEED = 0x54494445;
export const CLEAN_TIDE_SPRINT_REVISION = "v42-r10-photo-finish-current-bursts";

export const TIDE_SPRINT_SPEED_MODES = ["slow", "cruise", "sprint"] as const;
export type TideSprintSpeedMode = typeof TIDE_SPRINT_SPEED_MODES[number];

export interface TideSprintSpeedProfile {
  label: string;
  throttle: number;
  handling: string;
  explanation: string;
}

export const TIDE_SPRINT_SPEED_PROFILES: Readonly<
  Record<TideSprintSpeedMode, TideSprintSpeedProfile>
> = Object.freeze({
  slow: Object.freeze({
    label: "SLOW",
    throttle: 0.18,
    handling: "TIGHT TURNS",
    explanation: "Use before sharp bends and close reefs.",
  }),
  cruise: Object.freeze({
    label: "CRUISE",
    throttle: 0.56,
    handling: "BALANCED",
    explanation: "A steady speed with balanced steering.",
  }),
  sprint: Object.freeze({
    label: "SPRINT",
    throttle: 1,
    handling: "WIDE TURNS",
    explanation: "Fastest on clear water and straight currents.",
  }),
});

export const TIDE_SPRINT_DEFAULT_SPEED_MODE: TideSprintSpeedMode = "cruise";
export const TIDE_SPRINT_DEFAULT_THROTTLE =
  TIDE_SPRINT_SPEED_PROFILES[TIDE_SPRINT_DEFAULT_SPEED_MODE].throttle;
export const TIDE_SPRINT_MIN_CONTROL_SPEED = 22.8;
export const TIDE_SPRINT_MAX_CONTROL_SPEED = 37.2;

export const TIDE_SPRINT_FLOW_SPEED_BONUS = 5.8;
export const TIDE_SPRINT_CURRENT_RING_SPEED_BONUS = 6.4;
export const TIDE_SPRINT_CURRENT_RING_BOOST_SEC = 1.9;
const PENALTY_SPEED = 19.5;
const FORWARD_ACCELERATION = 8.2;
const FORWARD_DECELERATION = 12.8;
const LATERAL_SPEED = 6.9;
const LATERAL_ACCELERATION = 19.5;
const RACER_RADIUS = 0.44;
const RIVAL_THROTTLE_BASE = 0.58;
const RIVAL_THROTTLE_SKILL_SCALE = 0.4;

export interface TideSprintControlFrame {
  targetLateral: number;
  throttle: number;
}

export interface TideSprintGhostControlSource {
  readonly label: string;
  controlAtFrame(frameIndex: number): TideSprintControlFrame;
}

export interface CleanTideSprintRacer {
  id: string;
  label: string;
  character: TideSprintCharacterId;
  player: boolean;
  namedRival: boolean;
  ghost: boolean;
  distance: number;
  lateral: number;
  lateralVelocity: number;
  speed: number;
  throttle: number;
  flow: number;
  chain: number;
  boost: number;
  boosts: number;
  collisions: number;
  finishedAtSec: number | null;
}

export interface CleanTideSprintSnapshot {
  active: boolean;
  planHash: string;
  selected: TideSprintCrewId;
  finishDistance: number;
  elapsedSec: number;
  progress: number;
  section: TideSprintSection;
  rank: number;
  racers: readonly CleanTideSprintRacer[];
  player: CleanTideSprintRacer;
  currentCenter: number;
  currentRadius: number;
  finished: boolean;
}

export interface CleanTideSprintStanding {
  id: string;
  label: string;
  character: TideSprintCharacterId;
  player: boolean;
  ghost: boolean;
  finishSec: number;
}

export interface CleanTideSprintResult {
  placement: number;
  elapsedSec: number;
  selected: TideSprintCrewId;
  boostsCollected: number;
  collisions: number;
  standings: readonly CleanTideSprintStanding[];
}

export interface CleanTideSprintStepEvents {
  sectionChanged: TideSprintSection | null;
  rankChanged: number | null;
  collected: boolean;
  boosted: boolean;
  collision: boolean;
  finished: boolean;
}

interface RivalPlan {
  index: number;
  skill: number;
  phase: number;
}

interface InternalRacer extends CleanTideSprintRacer {
  targetLateral: number;
  boostSec: number;
  penaltySec: number;
  collectedIds: Set<string>;
  hitIds: Set<string>;
  gridOrder: number;
  plan: RivalPlan | null;
}

interface IntegrationEvents {
  collected: boolean;
  collision: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function tideSprintControlSpeed(throttle: number): number {
  return TIDE_SPRINT_MIN_CONTROL_SPEED +
    (TIDE_SPRINT_MAX_CONTROL_SPEED - TIDE_SPRINT_MIN_CONTROL_SPEED) *
      clamp(throttle, 0, 1);
}

export function tideSprintSteeringAuthority(throttle: number): number {
  return 1.18 - clamp(throttle, 0, 1) * 0.32;
}

export function tideSprintSpeedModeStep(
  mode: TideSprintSpeedMode,
  direction: -1 | 1,
): TideSprintSpeedMode {
  const index = TIDE_SPRINT_SPEED_MODES.indexOf(mode);
  const next = clamp(index + direction, 0, TIDE_SPRINT_SPEED_MODES.length - 1);
  return TIDE_SPRINT_SPEED_MODES[next]!;
}

/**
 * A spring-loaded one-finger throttle. The gesture always begins at Cruise:
 * dragging upward reaches Sprint, dragging downward reaches Slow, and lifting
 * the finger returns to Cruise. This keeps speed visible and causal instead of
 * leaving a hidden persistent throttle behind after a swipe.
 */
export function tideSprintVerticalDragToThrottle(
  deltaPixels: number,
  viewportHeight: number,
): number {
  const dragSpan = Math.max(104, viewportHeight * 0.18);
  const gesture = clamp(-deltaPixels / dragSpan, -1, 1);
  if (gesture >= 0) {
    return TIDE_SPRINT_DEFAULT_THROTTLE +
      gesture * (TIDE_SPRINT_SPEED_PROFILES.sprint.throttle - TIDE_SPRINT_DEFAULT_THROTTLE);
  }
  return TIDE_SPRINT_DEFAULT_THROTTLE +
    gesture * (TIDE_SPRINT_DEFAULT_THROTTLE - TIDE_SPRINT_SPEED_PROFILES.slow.throttle);
}

export function tideSprintThrottleMode(throttle: number): TideSprintSpeedMode {
  const slowCruiseMidpoint = (
    TIDE_SPRINT_SPEED_PROFILES.slow.throttle +
    TIDE_SPRINT_SPEED_PROFILES.cruise.throttle
  ) / 2;
  const cruiseSprintMidpoint = (
    TIDE_SPRINT_SPEED_PROFILES.cruise.throttle +
    TIDE_SPRINT_SPEED_PROFILES.sprint.throttle
  ) / 2;
  if (throttle < slowCruiseMidpoint) return "slow";
  if (throttle > cruiseSprintMidpoint) return "sprint";
  return "cruise";
}

function moveToward(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
}

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const CLEAN_TIDE_SPRINT_PLAN_HASH = checksum(JSON.stringify({
  seed: CLEAN_TIDE_SPRINT_SEED,
  revision: CLEAN_TIDE_SPRINT_REVISION,
  finish: TIDE_SPRINT_FINISH_UNITS,
  sections: 3,
  minimumControlSpeed: TIDE_SPRINT_MIN_CONTROL_SPEED,
  maximumControlSpeed: TIDE_SPRINT_MAX_CONTROL_SPEED,
  defaultThrottle: TIDE_SPRINT_DEFAULT_THROTTLE,
  speedProfiles: TIDE_SPRINT_SPEED_PROFILES,
  flowSpeedBonus: TIDE_SPRINT_FLOW_SPEED_BONUS,
  currentRings: TIDE_SPRINT_CURRENT_RINGS,
  currentRingCaptureRadius: TIDE_SPRINT_CURRENT_RING_CAPTURE_RADIUS,
  currentRingSpeedBonus: TIDE_SPRINT_CURRENT_RING_SPEED_BONUS,
  currentRingBoostSec: TIDE_SPRINT_CURRENT_RING_BOOST_SEC,
  lateralSpeed: LATERAL_SPEED,
  throttleControl: "spring-loaded-two-axis-gesture",
  speedHandlingTradeoff: "slow-tight-sprint-wide",
  rivalSkills: [0.96, 0.86, 0.8],
  rivalThrottleBase: RIVAL_THROTTLE_BASE,
  rivalThrottleSkillScale: RIVAL_THROTTLE_SKILL_SCALE,
  currentCueModel: "player-anchored-arrow-stream-banks-visible-halo",
  characterStats: "identical",
  rubberBanding: false,
  competitivePower: false,
}));

export function cleanTideSprintSection(progress: number): TideSprintSection {
  return tideSprintSectionAtDistance(progress * TIDE_SPRINT_FINISH_UNITS);
}

export function tideSprintDragDeltaToTarget(
  startTarget: number,
  deltaPixels: number,
  viewportWidth: number,
): number {
  const dragSpan = Math.max(96, viewportWidth * 0.36);
  return clamp(
    startTarget + deltaPixels / dragSpan * TIDE_SPRINT_LANE_HALF_WIDTH,
    -TIDE_SPRINT_LANE_HALF_WIDTH,
    TIDE_SPRINT_LANE_HALF_WIDTH,
  );
}

export function tideSprintIdealControl(distance: number): TideSprintControlFrame {
  const ring = tideSprintNearestCurrentRingAhead(distance + 3, 88);
  return {
    targetLateral: ring?.lateral ?? tideSprintSafeCurrentTarget(distance),
    throttle: 1,
  };
}

export function tideSprintCurrentOnlyControl(
  distance: number,
): TideSprintControlFrame {
  return {
    targetLateral: tideSprintSafeCurrentTarget(distance),
    throttle: 1,
  };
}

function publicRacer(racer: Readonly<InternalRacer>): CleanTideSprintRacer {
  return {
    id: racer.id,
    label: racer.label,
    character: racer.character,
    player: racer.player,
    namedRival: racer.namedRival,
    ghost: racer.ghost,
    distance: racer.distance,
    lateral: racer.lateral,
    lateralVelocity: racer.lateralVelocity,
    speed: racer.speed,
    throttle: racer.throttle,
    flow: racer.flow,
    chain: racer.chain,
    boost: clamp(racer.boostSec / TIDE_SPRINT_CURRENT_RING_BOOST_SEC, 0, 1),
    boosts: racer.boosts,
    collisions: racer.collisions,
    finishedAtSec: racer.finishedAtSec,
  };
}

function cloneRacer(racer: Readonly<InternalRacer>): InternalRacer {
  return {
    ...racer,
    collectedIds: new Set(racer.collectedIds),
    hitIds: new Set(racer.hitIds),
    plan: racer.plan ? { ...racer.plan } : null,
  };
}

function createRacer(
  id: string,
  label: string,
  character: TideSprintCharacterId,
  gridOrder: number,
  player: boolean,
  namedRival: boolean,
  ghost: boolean,
  plan: RivalPlan | null,
): InternalRacer {
  return {
    id,
    label,
    character,
    player,
    namedRival,
    ghost,
    distance: 0,
    lateral: player ? 0 : ([-1.8, -0.6, 0.7, 1.85][gridOrder] ?? 0),
    lateralVelocity: 0,
    targetLateral: 0,
    speed: tideSprintControlSpeed(TIDE_SPRINT_DEFAULT_THROTTLE),
    throttle: TIDE_SPRINT_DEFAULT_THROTTLE,
    flow: 0,
    chain: 0,
    boost: 0,
    boosts: 0,
    collisions: 0,
    boostSec: 0,
    penaltySec: 0,
    collectedIds: new Set<string>(),
    hitIds: new Set<string>(),
    gridOrder,
    plan,
    finishedAtSec: null,
  };
}

export class CleanTideSprintDirector {
  private active = false;
  private selected: TideSprintCrewId = "glowfin";
  private elapsedSec = 0;
  private section: TideSprintSection = "moon-garden-launch";
  private rank = 4;
  private racers: InternalRacer[] = [];
  private ghostSource: TideSprintGhostControlSource | null = null;
  private frameIndex = 0;

  start(
    selected: TideSprintCrewId,
    ghostSource: TideSprintGhostControlSource | null = null,
  ): void {
    this.active = true;
    this.selected = selected;
    this.elapsedSec = 0;
    this.section = "moon-garden-launch";
    this.rank = 4;
    this.ghostSource = ghostSource;
    this.frameIndex = 0;

    const opponentCharacters = TIDE_SPRINT_CHARACTER_IDS.filter((id) => id !== selected);
    const rivalSkills = [0.96, 0.86, 0.8] as const;
    this.racers = [
      createRacer("player", "You", selected, 3, true, false, false, null),
      ...opponentCharacters.map((character, index) => createRacer(
        index === 0 ? "named-rival" : index === 1 ? "verified-echo" : "moon-echo",
        index === 0
          ? tideSprintCrewMember(character).name
          : index === 1
            ? ghostSource?.label ?? "Tide Echo"
            : "Moon Echo",
        character,
        index,
        false,
        index === 0,
        index > 0,
        {
          index,
          skill: rivalSkills[index]!,
          phase: [0.45, 2.25, 4.6][index]!,
        },
      )),
    ];
    if (ghostSource) {
      const savedGhost = this.racers.find((racer) => racer.id === "verified-echo");
      if (savedGhost) savedGhost.lateral = 0;
    }
  }

  step(dtSec: number, control: TideSprintControlFrame): CleanTideSprintStepEvents {
    const player = this.playerState();
    if (!this.active || player.finishedAtSec !== null) {
      return {
        sectionChanged: null,
        rankChanged: null,
        collected: false,
        boosted: false,
        collision: false,
        finished: false,
      };
    }

    const safeDt = clamp(dtSec, 0, 1 / 20);
    const previousElapsed = this.elapsedSec;
    this.elapsedSec += safeDt;
    const playerEvents = this.integrate(
      player,
      clamp(
        control.targetLateral,
        -TIDE_SPRINT_LANE_HALF_WIDTH,
        TIDE_SPRINT_LANE_HALF_WIDTH,
      ),
      clamp(control.throttle, 0, 1),
      safeDt,
      previousElapsed,
    );
    for (const rival of this.racers) {
      if (rival.player || rival.finishedAtSec !== null) continue;
      const rivalControl = this.rivalControl(rival, previousElapsed, this.frameIndex);
      this.integrate(
        rival,
        rivalControl.targetLateral,
        rivalControl.throttle,
        safeDt,
        previousElapsed,
      );
    }
    this.frameIndex += 1;

    const nextSection = tideSprintSectionAtDistance(player.distance);
    const sectionChanged = nextSection === this.section ? null : nextSection;
    this.section = nextSection;
    const previousRank = this.rank;
    this.rank = this.rankOf(player);
    const rankChanged = this.rank === previousRank ? null : this.rank;
    return {
      sectionChanged,
      rankChanged,
      collected: playerEvents.collected,
      boosted: playerEvents.collected,
      collision: playerEvents.collision,
      finished: player.finishedAtSec !== null,
    };
  }

  snapshot(): CleanTideSprintSnapshot {
    const player = this.playerState();
    const progress = clamp(player.distance / TIDE_SPRINT_FINISH_UNITS, 0, 1);
    const racers = this.racers.map(publicRacer);
    const publicPlayer = racers.find((racer) => racer.player) ?? publicRacer(player);
    return {
      active: this.active,
      planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
      selected: this.selected,
      finishDistance: TIDE_SPRINT_FINISH_UNITS,
      elapsedSec: this.elapsedSec,
      progress,
      section: this.section,
      rank: this.rank,
      racers,
      player: publicPlayer,
      currentCenter: tideSprintCurrentCenter(player.distance),
      currentRadius: tideSprintCurrentRadius(player.distance),
      finished: player.finishedAtSec !== null,
    };
  }

  result(): CleanTideSprintResult | null {
    const player = this.playerState();
    if (player.finishedAtSec === null) return null;
    const projected = this.racers.map(cloneRacer);
    let projectionElapsed = this.elapsedSec;
    let projectionFrame = this.frameIndex;
    const dtSec = 1 / 120;
    for (let step = 0; step < 120 * 40; step += 1) {
      if (projected.every((racer) => racer.finishedAtSec !== null)) break;
      for (const racer of projected) {
        if (racer.player || racer.finishedAtSec !== null) continue;
        const rivalControl = this.rivalControl(
          racer,
          projectionElapsed,
          projectionFrame,
        );
        this.integrate(
          racer,
          rivalControl.targetLateral,
          rivalControl.throttle,
          dtSec,
          projectionElapsed,
        );
      }
      projectionElapsed += dtSec;
      projectionFrame += 1;
    }
    const standings: CleanTideSprintStanding[] = projected.map((racer) => ({
      id: racer.id,
      label: racer.label,
      character: racer.character,
      player: racer.player,
      ghost: racer.ghost,
      finishSec: racer.finishedAtSec ?? projectionElapsed,
    }));
    standings.sort((left, right) => left.finishSec - right.finishSec);
    return {
      placement: standings.findIndex((standing) => standing.player) + 1,
      elapsedSec: player.finishedAtSec,
      selected: this.selected,
      boostsCollected: player.boosts,
      collisions: player.collisions,
      standings,
    };
  }

  private playerState(): InternalRacer {
    const player = this.racers.find((racer) => racer.player);
    if (!player) throw new Error("Tide Sprint has not started.");
    return player;
  }

  private rivalControl(
    racer: Readonly<InternalRacer>,
    elapsedSec: number,
    frameIndex: number,
  ): TideSprintControlFrame {
    if (racer.id === "verified-echo" && this.ghostSource) {
      return this.ghostSource.controlAtFrame(frameIndex);
    }
    return {
      targetLateral: this.rivalTarget(racer, elapsedSec),
      throttle: this.rivalThrottle(racer, elapsedSec),
    };
  }

  private rivalTarget(racer: Readonly<InternalRacer>, elapsedSec: number): number {
    const plan = racer.plan;
    if (!plan) return racer.targetLateral;
    const lookAhead = 50 + plan.skill * 16;
    const ring = tideSprintNearestCurrentRingAhead(
      racer.distance + 3,
      70 + plan.skill * 18,
    );
    const ideal = ring?.lateral ?? tideSprintSafeCurrentTarget(racer.distance, lookAhead);
    const plannedError = Math.sin(elapsedSec * (0.31 + plan.index * 0.035) + plan.phase) *
      (1 - plan.skill) * 5.1;
    return clamp(
      ideal + plannedError,
      -TIDE_SPRINT_LANE_HALF_WIDTH,
      TIDE_SPRINT_LANE_HALF_WIDTH,
    );
  }

  private rivalThrottle(racer: Readonly<InternalRacer>, elapsedSec: number): number {
    const plan = racer.plan;
    if (!plan) return racer.throttle;
    const authoredPulse = Math.sin(elapsedSec * 0.23 + plan.phase) * 0.025;
    return clamp(
      RIVAL_THROTTLE_BASE + plan.skill * RIVAL_THROTTLE_SKILL_SCALE + authoredPulse,
      0,
      1,
    );
  }

  private integrate(
    racer: InternalRacer,
    targetLateral: number,
    targetThrottle: number,
    dtSec: number,
    previousElapsed: number,
  ): IntegrationEvents {
    if (racer.finishedAtSec !== null) return { collected: false, collision: false };
    racer.targetLateral = targetLateral;
    racer.throttle = clamp(targetThrottle, 0, 1);
    const steeringAuthority = tideSprintSteeringAuthority(racer.throttle);
    const desiredLateralVelocity = clamp(
      (targetLateral - racer.lateral) * 3.8,
      -LATERAL_SPEED * steeringAuthority,
      LATERAL_SPEED * steeringAuthority,
    );
    racer.lateralVelocity = moveToward(
      racer.lateralVelocity,
      desiredLateralVelocity,
      LATERAL_ACCELERATION * steeringAuthority * dtSec,
    );
    racer.lateral = clamp(
      racer.lateral + racer.lateralVelocity * dtSec,
      -TIDE_SPRINT_LANE_HALF_WIDTH,
      TIDE_SPRINT_LANE_HALF_WIDTH,
    );

    racer.boostSec = Math.max(0, racer.boostSec - dtSec);
    racer.penaltySec = Math.max(0, racer.penaltySec - dtSec);
    const currentCenter = tideSprintCurrentCenter(racer.distance + 18);
    const currentRadius = tideSprintCurrentRadius(racer.distance);
    const alignment = clamp(
      1 - Math.abs(racer.lateral - currentCenter) / (currentRadius + 0.72),
      0,
      1,
    );
    racer.flow = alignment * alignment * (3 - 2 * alignment);
    const flowingSpeed = tideSprintControlSpeed(racer.throttle) +
      TIDE_SPRINT_FLOW_SPEED_BONUS * racer.flow +
      (racer.boostSec > 0 ? TIDE_SPRINT_CURRENT_RING_SPEED_BONUS : 0);
    const targetSpeed = racer.penaltySec > 0 ? PENALTY_SPEED : flowingSpeed;
    racer.speed = moveToward(
      racer.speed,
      targetSpeed,
      (targetSpeed >= racer.speed ? FORWARD_ACCELERATION : FORWARD_DECELERATION) * dtSec,
    );

    const beforeDistance = racer.distance;
    racer.distance = Math.min(
      TIDE_SPRINT_FINISH_UNITS,
      racer.distance + racer.speed * dtSec,
    );

    let collision = false;
    for (const obstacle of TIDE_SPRINT_OBSTACLES) {
      if (
        racer.hitIds.has(obstacle.id) ||
        obstacle.distance <= beforeDistance ||
        obstacle.distance > racer.distance
      ) continue;
      racer.hitIds.add(obstacle.id);
      if (Math.abs(racer.lateral - obstacle.lateral) <= obstacle.radius + RACER_RADIUS) {
        racer.penaltySec = Math.max(racer.penaltySec, 1.25);
        racer.chain = 0;
        racer.collisions += 1;
        collision = true;
      }
    }

    let collected = false;
    for (const ring of TIDE_SPRINT_CURRENT_RINGS) {
      if (
        racer.collectedIds.has(ring.id) ||
        ring.distance <= beforeDistance ||
        ring.distance > racer.distance
      ) continue;
      racer.collectedIds.add(ring.id);
      if (
        Math.abs(racer.lateral - ring.lateral) <=
          TIDE_SPRINT_CURRENT_RING_CAPTURE_RADIUS
      ) {
        racer.boostSec = Math.max(
          racer.boostSec,
          TIDE_SPRINT_CURRENT_RING_BOOST_SEC,
        );
        racer.chain += 1;
        racer.boosts += 1;
        collected = true;
      } else {
        racer.chain = 0;
      }
    }

    if (racer.distance >= TIDE_SPRINT_FINISH_UNITS) {
      const travelled = Math.max(1e-6, racer.distance - beforeDistance);
      const crossed = clamp(
        (TIDE_SPRINT_FINISH_UNITS - beforeDistance) / travelled,
        0,
        1,
      );
      racer.finishedAtSec = previousElapsed + crossed * dtSec;
      racer.distance = TIDE_SPRINT_FINISH_UNITS;
    }
    return { collected, collision };
  }

  private rankOf(player: Readonly<InternalRacer>): number {
    const ordered = [...this.racers].sort((left, right) => {
      if (left.finishedAtSec !== null || right.finishedAtSec !== null) {
        if (left.finishedAtSec === null) return 1;
        if (right.finishedAtSec === null) return -1;
        return left.finishedAtSec - right.finishedAtSec;
      }
      const distanceDifference = right.distance - left.distance;
      if (Math.abs(distanceDifference) > 1e-5) return distanceDifference;
      return left.gridOrder - right.gridOrder;
    });
    return ordered.findIndex((racer) => racer.id === player.id) + 1;
  }
}
