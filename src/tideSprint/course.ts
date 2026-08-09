export const TIDE_SPRINT_FINISH_UNITS = 2700;
export const TIDE_SPRINT_LANE_HALF_WIDTH = 4.65;
export const TIDE_SPRINT_FLOW_RADIUS = 1.7;

export type TideSprintSection =
  | "moon-garden-launch"
  | "relic-current"
  | "final-moonflash";

export interface TideSprintCourseObstacle {
  id: string;
  distance: number;
  lateral: number;
  radius: number;
  side: -1 | 1;
}

export interface TideSprintCurrentRing {
  id: string;
  distance: number;
  lateral: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function tideSprintSectionAtDistance(distance: number): TideSprintSection {
  if (distance < 900) return "moon-garden-launch";
  if (distance < 1800) return "relic-current";
  return "final-moonflash";
}

/**
 * The authored centre of the fast current. It is deterministic and depends
 * only on course distance, never on the player's position or placement.
 */
export function tideSprintCurrentCenter(distance: number): number {
  const bounded = clamp(distance, 0, TIDE_SPRINT_FINISH_UNITS);
  const section = tideSprintSectionAtDistance(bounded);
  if (section === "moon-garden-launch") {
    return Math.sin(bounded / 128) * 2.28 + Math.sin(bounded / 58) * 0.28;
  }
  if (section === "relic-current") {
    const local = bounded - 900;
    return Math.sin(local / 92 + 0.55) * 2.78 + Math.sin(local / 41) * 0.36;
  }
  const local = bounded - 1800;
  return Math.sin(local / 74 + 1.15) * 2.48 + Math.sin(local / 33) * 0.62;
}

export function tideSprintCurrentRadius(distance: number): number {
  const section = tideSprintSectionAtDistance(distance);
  if (section === "relic-current") return 1.52;
  if (section === "final-moonflash") return 1.42;
  return TIDE_SPRINT_FLOW_RADIUS;
}

const OBSTACLE_DISTANCES = [
  365, 610, 845,
  1030, 1265, 1515, 1735,
  1940, 2145, 2355, 2530,
] as const;

export const TIDE_SPRINT_OBSTACLES: readonly TideSprintCourseObstacle[] =
  Object.freeze(OBSTACLE_DISTANCES.map((distance, index) => {
    const side = (index % 2 === 0 ? 1 : -1) as -1 | 1;
    const current = tideSprintCurrentCenter(distance);
    return {
      id: `reef-${index + 1}`,
      distance,
      lateral: clamp(
        current + side * (index % 3 === 0 ? 1.12 : 1.42),
        -TIDE_SPRINT_LANE_HALF_WIDTH + 0.55,
        TIDE_SPRINT_LANE_HALF_WIDTH - 0.55,
      ),
      radius: index >= 7 ? 0.9 : 0.82,
      side,
    };
  }));

/**
 * Deterministic Moonflash boosters. Every ring is inside the authored current,
 * but offset from its easy centre line. A racer must deliberately line up for
 * the ring while preserving enough handling to return to the next bend.
 */
const CURRENT_RING_LAYOUT = [
  [250, -0.72],
  [530, 0.72],
  [770, -0.72],
  [940, 0.72],
  [1170, -0.72],
  [1410, 0.72],
  [1640, -0.72],
  [1860, 0.72],
  [2060, -0.72],
  [2270, 0.72],
  [2450, -0.72],
  [2640, 0.72],
] as const;

export const TIDE_SPRINT_CURRENT_RING_CAPTURE_RADIUS = 0.64;

export const TIDE_SPRINT_CURRENT_RINGS: readonly TideSprintCurrentRing[] =
  Object.freeze(CURRENT_RING_LAYOUT.map(([distance, offset], index) => ({
    id: `current-ring-${index + 1}`,
    distance,
    lateral: clamp(
      tideSprintCurrentCenter(distance) + offset,
      -TIDE_SPRINT_LANE_HALF_WIDTH + 0.7,
      TIDE_SPRINT_LANE_HALF_WIDTH - 0.7,
    ),
  })));

export function tideSprintNearestCurrentRingAhead(
  distance: number,
  lookAhead: number,
): TideSprintCurrentRing | null {
  return TIDE_SPRINT_CURRENT_RINGS.find((ring) =>
    ring.distance >= distance && ring.distance <= distance + lookAhead
  ) ?? null;
}

export function tideSprintNearestObstacleAhead(
  distance: number,
  lookAhead: number,
): TideSprintCourseObstacle | null {
  return TIDE_SPRINT_OBSTACLES.find((obstacle) =>
    obstacle.distance >= distance && obstacle.distance <= distance + lookAhead
  ) ?? null;
}

export function tideSprintSafeCurrentTarget(
  distance: number,
  lookAhead = 54,
): number {
  let target = tideSprintCurrentCenter(distance + lookAhead);
  const obstacle = tideSprintNearestObstacleAhead(distance, lookAhead + 24);
  if (obstacle && Math.abs(obstacle.lateral - target) < obstacle.radius + 0.72) {
    target += obstacle.side > 0 ? -(obstacle.radius + 0.9) : obstacle.radius + 0.9;
  }
  return clamp(
    target,
    -TIDE_SPRINT_LANE_HALF_WIDTH,
    TIDE_SPRINT_LANE_HALF_WIDTH,
  );
}

export function tideSprintSectionLabel(section: TideSprintSection): string {
  if (section === "relic-current") return "2 · Relic Current";
  if (section === "final-moonflash") return "3 · Final Moonflash";
  return "1 · Moon-Garden Launch";
}
