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
  minimumSwimmerTravelDifferenceUnits: 0.2,
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
  // One resident per side is enough to establish the upright/static read.
  // A third resident repeated the same silhouette on one side and recreated
  // the unsettling vertical stack visible in the owner screenshots.
  const citizenCount = Math.max(2, Math.round(2 * clampedDensity));
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
        x: side * (laneHalfWidth + 3.02 + index * 0.16 + seed * 0.12),
        y: 4.08 + index * 0.48 + Math.sin(phase) * 0.045,
        z: -anchor + 4.72 + index * 0.92
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
    // The lower swimmer follows a broad/faster circular current; the upper
    // swimmer follows a smaller/slower one. Circular screen-plane paths keep
    // travel visible even when a sample begins near a sine turning point.
    const pathWidth = index === 0
      ? 0.88 + seed * 0.08
      : 0.5 + seed * 0.05;
    const verticalAmplitude = index === 0
      ? pathWidth
      : pathWidth * 1.08;
    // Wide maximum-momentum FOV previously shrank Astral swimmers below the
    // phone floor. Compensate only the decorative cast scale; collision and
    // course geometry remain untouched.
    const scale = 1.46 + seed * 0.08 + momentum * 0.9;
    const galleryDistance =
      laneHalfWidth +
      LOCAL_HALF_WIDTH["current-swimmer"] * scale +
      pathWidth +
      0.78;
    poses.push({
      id: `current-swimmer-${index}`,
      role: "current-swimmer",
      movementMode: "lane-safe-swim-loop",
      motionSeed: seed,
      speed,
      position: {
        x: side * galleryDistance + track * pathWidth,
        y: (index === 0 ? 7.45 : 9.35) +
          Math.cos(phase) * verticalAmplitude,
        // Both swimmers stay in front of the gate depth plane. Previously the
        // upper swimmer passed behind masonry at the second evidence sample,
        // leaving only disconnected fin fragments for the tracker.
        z: -anchor + (index === 0 ? 4.15 : 3.05) +
          Math.sin(phase * 0.47) * (0.16 + seed * 0.04)
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
