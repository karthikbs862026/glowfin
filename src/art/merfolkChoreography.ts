/**
 * Deterministic, lane-safe choreography for the Moon-Garden population.
 *
 * The cast must feel unscripted without using wall-clock randomness: every
 * seed comes from the active gate anchor, and every path is sampled from
 * simulation time.  This keeps replay/debug capture stable while preventing
 * the synchronized mannequin rows that made the first population pass feel
 * uncanny.
 */

export type MerfolkPopulationRole =
  | "reef-citizen"
  | "current-swimmer"
  | "conch-herald";

export type MerfolkMovementMode =
  | "anchored-upright"
  | "lane-safe-swim-loop"
  | "ceremonial-upright";

export interface MerfolkPopulationPose {
  id: string;
  role: MerfolkPopulationRole;
  movementMode: MerfolkMovementMode;
  motionSeed: number;
  speed: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface MerfolkChoreographyInput {
  laneHalfWidth: number;
  anchor: number;
  heroSide: -1 | 1;
  timeSec: number;
  momentumFraction: number;
  density: number;
}

export const MERFOLK_CHOREOGRAPHY_CONTRACT = {
  minimumUprightResidents: 4,
  movingSwimmers: 2,
  minimumLaneClearanceUnits: 0.55,
  minimumSwimmerWorldSeparationUnits: 3.2,
  minimumSwimmerTravelUnits: 0.45,
  minimumSpeedDifference: 0.08,
  maximumAnchoredDriftUnits: 0.13
} as const;

function hash01(value: number, salt: number): number {
  let hash = Math.imul(value ^ salt, 0x27d4eb2d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function poseSeed(anchor: number, index: number, salt: number): number {
  return hash01(Math.round(anchor * 10) + index * 97, salt);
}

/** Approximate local half-widths of the three population silhouettes. */
const LOCAL_HALF_WIDTH: Record<MerfolkPopulationRole, number> = {
  "reef-citizen": 0.48,
  "current-swimmer": 1.02,
  "conch-herald": 0.62
};

export function merfolkLaneClearance(
  pose: MerfolkPopulationPose,
  laneHalfWidth: number
): number {
  const localHalfWidth = LOCAL_HALF_WIDTH[pose.role];
  const worldHalfWidth = localHalfWidth * Math.abs(pose.scale.x);
  return Math.abs(pose.position.x) - worldHalfWidth - laneHalfWidth;
}

export function sampleMerfolkChoreography({
  laneHalfWidth,
  anchor,
  heroSide,
  timeSec,
  momentumFraction,
  density
}: MerfolkChoreographyInput): MerfolkPopulationPose[] {
  const poses: MerfolkPopulationPose[] = [];
  const clampedDensity = clamp(density, 0.25, 1);
  const momentum = clamp(momentumFraction, 0, 1);

  // Upright residents remain composed around the gate. Their tiny independent
  // breathing offsets keep them from reading as frozen duplicates while their
  // travel stays below the anchored-resident contract.
  const citizenCount = Math.max(2, Math.round(3 * clampedDensity));
  for (let index = 0; index < citizenCount; index++) {
    const side: -1 | 1 = index % 2 === 0
      ? (heroSide === 1 ? -1 : 1)
      : heroSide;
    const seed = poseSeed(anchor, index, 1201);
    const phase = timeSec * (0.31 + seed * 0.08) + seed * Math.PI * 2;
    const scale = 1.56 + seed * 0.14 + index * 0.035;
    poses.push({
      id: `reef-citizen-${index}`,
      role: "reef-citizen",
      movementMode: "anchored-upright",
      motionSeed: seed,
      speed: 0.31 + seed * 0.08,
      position: {
        x: side * (laneHalfWidth + 3.42 + index * 0.34 + seed * 0.18),
        y: 3.58 + index * 0.72 + Math.sin(phase) * 0.045,
        z: -anchor + 5.35 + index * 1.28
      },
      rotation: {
        x: 0.012 + seed * 0.012,
        y: side * (-0.08 - seed * 0.035),
        z: side * (0.035 + Math.sin(phase * 0.83) * 0.014)
      },
      scale: { x: side * scale, y: scale, z: scale }
    });
  }

  // Two genuine swim paths occupy opposite galleries and different depth/
  // height bands. Disjoint speed ranges guarantee asynchronous motion. The
  // head-to-tail mesh faces in the instantaneous direction of travel, rather
  // than rotating an upright face and stacking its eyes vertically.
  for (let index = 0; index < 2; index++) {
    const side: -1 | 1 = index === 0
      ? (heroSide === 1 ? -1 : 1)
      : heroSide;
    const seed = poseSeed(anchor, index, 2203);
    const speed = index === 0
      ? 0.48 + seed * 0.07
      : 0.29 + seed * 0.07;
    const phase = timeSec * speed + seed * Math.PI * 2 + index * 1.83;
    const track = Math.sin(phase);
    const velocity = Math.cos(phase);
    const direction: -1 | 1 = velocity >= 0 ? 1 : -1;
    const pathWidth = 0.62 + seed * 0.18;
    const verticalAmplitude = index === 0
      ? 0.24 + seed * 0.08
      : 0.38 + seed * 0.1;
    const scale = 1.3 + seed * 0.08 + momentum * 0.035;
    poses.push({
      id: `current-swimmer-${index}`,
      role: "current-swimmer",
      movementMode: "lane-safe-swim-loop",
      motionSeed: seed,
      speed,
      position: {
        x: side * (laneHalfWidth + 3.38) + track * pathWidth,
        y: (index === 0 ? 5.45 : 7.2) +
          Math.sin(phase * (index === 0 ? 1.37 : 0.81)) * verticalAmplitude,
        z: -anchor + (index === 0 ? 3.0 : -1.25) +
          Math.cos(phase * 0.73) * (0.28 + seed * 0.14)
      },
      rotation: {
        x: 0.018 + Math.sin(phase * 0.61) * 0.018,
        y: side * (0.035 + seed * 0.025),
        z: -Math.sin(phase * 0.92) * (0.055 + seed * 0.02)
      },
      scale: { x: direction * scale, y: scale, z: scale }
    });
  }

  // The herald pair forms the second upright/stationary read. Asymmetric
  // scale, depth and breath phases stop the ceremony from becoming a mirrored
  // copy-paste row while retaining its deliberate gate composition.
  for (const [index, side] of ([-1, 1] as const).entries()) {
    const seed = poseSeed(anchor, index, 3301);
    const speed = 0.24 + seed * 0.06;
    const phase = timeSec * speed + seed * Math.PI * 2;
    const scale = 1.62 + index * 0.12 + seed * 0.06 + momentum * 0.055;
    poses.push({
      id: `conch-herald-${index}`,
      role: "conch-herald",
      movementMode: "ceremonial-upright",
      motionSeed: seed,
      speed,
      position: {
        x: side * (laneHalfWidth + 1.78 + index * 0.12),
        y: 1.72 + index * 0.12 + Math.sin(phase) * 0.035,
        z: -anchor + 4.05 - index * 0.42
      },
      rotation: {
        x: 0.015,
        y: side * (-0.065 - seed * 0.025),
        z: side * (0.018 + Math.sin(phase * 1.41) * 0.01)
      },
      scale: { x: side * scale, y: scale, z: scale }
    });
  }

  return poses;
}
