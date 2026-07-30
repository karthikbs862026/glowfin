/**
 * Authoritative gate geometry shared by simulation, rendering and Phase 3 art
 * validation.
 *
 * The gate opening is gameplay truth. Art may decorate the wall mass, but it
 * may not redefine either playable edge. Keeping this module free of renderer
 * and config imports lets the zero-dependency art gate consume the exact same
 * calculations as the runtime collision path.
 */

export interface GateGeometrySource {
  distance: number;
  gapLeft: number;
  gapRight: number;
}
export type GateSide = "left" | "right";

export interface GateWallGeometry {
  side: GateSide;
  /** Stable identifier used by art manifests and capture evidence. */
  runtimeObstacleId: "procedural-gate-left" | "procedural-gate-right";
  /** Lateral plane forming the playable opening. */
  colliderPlane: number;
  /** +1 when the safe opening lies to increasing x, otherwise -1. */
  gapDirection: 1 | -1;
  /** Wall width from the lane boundary to the playable edge. */
  width: number;
  /** World-space centre used by the primitive renderer. */
  centreX: number;
}

export const PROCEDURAL_GATE_VISUAL = {
  wallHeight: 4,
  wallDepth: 1.4,
  wallFloorY: -1
} as const;

/**
 * Resolve both wall masses from the same gate edges used for collision.
 * No renderer-specific approximation is allowed downstream.
 */
export function gateWallGeometry(
  gate: GateGeometrySource,
  laneHalfWidth: number
): readonly [GateWallGeometry, GateWallGeometry] {
  const leftWidth = Math.max(0, gate.gapLeft + laneHalfWidth);
  const rightWidth = Math.max(0, laneHalfWidth - gate.gapRight);

  return [
    {
      side: "left",
      runtimeObstacleId: "procedural-gate-left",
      colliderPlane: gate.gapLeft,
      gapDirection: 1,
      width: leftWidth,
      centreX: -laneHalfWidth + leftWidth / 2
    },
    {
      side: "right",
      runtimeObstacleId: "procedural-gate-right",
      colliderPlane: gate.gapRight,
      gapDirection: -1,
      width: rightWidth,
      centreX: laneHalfWidth - rightWidth / 2
    }
  ];
}

export interface GateClearance {
  leftClearance: number;
  rightClearance: number;
  clearance: number;
}

/** Exact lateral clearance used by the deterministic collision evaluator. */
export function gateClearance(
  lateralPosition: number,
  creatureRadius: number,
  gate: GateGeometrySource
): GateClearance {
  const creatureLeft = lateralPosition - creatureRadius;
  const creatureRight = lateralPosition + creatureRadius;
  const leftClearance = creatureLeft - gate.gapLeft;
  const rightClearance = gate.gapRight - creatureRight;

  return {
    leftClearance,
    rightClearance,
    clearance: Math.min(leftClearance, rightClearance)
  };
}
