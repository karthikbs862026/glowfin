import type { GateFacadeVariant } from "./premiumWorld";

export type ArchitectureFamilyIndex = 0 | 1 | 2 | 3 | 4;
export type PropFamilyIndex = 0 | 1 | 2;

export interface DistrictArchitectureStage {
  familyIndex: ArchitectureFamilyIndex;
  side: -1 | 1;
  depthOffset: number;
  desiredHeight: number;
  widthStretch: number;
  depthStretch: number;
  outerMargin: number;
  tint: readonly [number, number, number];
}

export interface DistrictPropStage {
  familyIndex: PropFamilyIndex;
  side: -1 | 1;
  depthOffset: number;
  scale: number;
  outerMargin: number;
  tint: readonly [number, number, number];
}

/**
 * The living-district pass adds instances to existing draw families. These
 * caps therefore improve the frame without introducing new draw calls or
 * allowing ambient life to grow without bound.
 */
export const LIVING_DISTRICT_CONTRACT = {
  prominentArchitecturePerSide: 2,
  guaranteedPropCounts: {
    monument: 1,
    tideSpear: 2,
    conchFountain: 1
  },
  life: {
    fishPerSchool: 9,
    maximumFishSchools: 5,
    maximumJellies: 10,
    maximumRays: 6,
    fishPool: 48,
    jellyPool: 14,
    rayPool: 8
  },
  reef: {
    maximumSwayWorldUnits: 0.24,
    laneSafetyWorldUnits: 0.46,
    travellingWaveSpeed: 1.7,
    signatureRadiusWorldUnits: 18,
    signatureHeightBoost: [1.2, 1.18, 1.12, 1.16, 1.14, 1.08],
    signatureWidthBoost: [1.14, 1.18, 1.08, 1.16, 1.12, 1.06]
  }
} as const;

const PRIMARY_ARCHITECTURE = [3, 0, 2, 3, 4] as const;
const SUPPORT_ARCHITECTURE = [0, 1, 3, 0, 2] as const;

const DISTRICT_TINTS = [
  [0.83, 0.93, 1],
  [0.7, 0.82, 1],
  [1, 0.76, 0.9],
  [1, 0.91, 0.78],
  [0.72, 0.88, 1]
] as const;

function architectureStage(
  familyIndex: ArchitectureFamilyIndex,
  gateFamily: GateFacadeVariant,
  side: -1 | 1,
  layer: 0 | 1,
  heroSide: -1 | 1
): DistrictArchitectureStage {
  const heroClearance = side === heroSide ? 1.15 : 0;
  return {
    familyIndex,
    side,
    depthOffset: layer === 0 ? 5.5 : 15.5,
    desiredHeight: layer === 0 ? 7.8 : 5.9,
    widthStretch: layer === 0 ? 1.08 : 0.94,
    depthStretch: layer === 0 ? 0.92 : 0.82,
    outerMargin: (layer === 0 ? 0.9 : 2.7) + heroClearance,
    tint: DISTRICT_TINTS[gateFamily]
  };
}

/**
 * Returns the guaranteed, gate-linked composition around the next encounter.
 * It is pure so staging remains reviewable and replay-independent.
 */
export function buildLivingDistrictStage(
  gateFamily: GateFacadeVariant,
  heroSide: -1 | 1
): {
  architecture: DistrictArchitectureStage[];
  props: DistrictPropStage[];
} {
  const primary = PRIMARY_ARCHITECTURE[gateFamily];
  const support = SUPPORT_ARCHITECTURE[gateFamily];
  const architecture: DistrictArchitectureStage[] = [];
  for (const side of [-1, 1] as const) {
    architecture.push(
      architectureStage(primary, gateFamily, side, 0, heroSide),
      architectureStage(support, gateFamily, side, 1, heroSide)
    );
  }

  return {
    architecture,
    props: [
      {
        familyIndex: 1,
        side: -1,
        depthOffset: -1.6,
        scale: 1.38,
        outerMargin: 0.72,
        tint: [0.86, 0.88, 1]
      },
      {
        familyIndex: 1,
        side: 1,
        depthOffset: -1.6,
        scale: 1.38,
        outerMargin: 0.72,
        tint: [0.86, 0.88, 1]
      },
      {
        familyIndex: 0,
        side: heroSide === 1 ? -1 : 1,
        depthOffset: 7.2,
        scale: 1.42,
        outerMargin: 1.35,
        tint: [0.92, 0.82, 0.72]
      },
      {
        familyIndex: 2,
        side: heroSide,
        depthOffset: 8.6,
        scale: 1.3,
        outerMargin: 2.45,
        tint: [0.78, 0.94, 1]
      }
    ]
  };
}
