/**
 * Authoritative gate geometry shared by simulation, rendering and Phase 3 art
 * validation.
 *
 * The gate opening is gameplay truth. Art may decorate the wall mass, but it
 * may not redefine either playable edge. Keeping this module free of renderer
 * and config imports lets the zero-dependency art gate consume the exact same
 * calculations as the runtime collision path.
 */
import {
  shutterOpeningAt,
  type SignatureObstaclePlan
} from "./obstacleVariety.ts";

export interface GateGeometrySource {
  distance: number;
  gapLeft: number;
  gapRight: number;
}

export interface RuntimeGateGeometrySource extends GateGeometrySource {
  obstaclePlan?: SignatureObstaclePlan;
}

export type GateOpeningRoute = "standard" | "safe" | "moonflash";

export interface GateOpeningGeometry {
  left: number;
  right: number;
  route: GateOpeningRoute;
  scoreMultiplier: number;
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
  /** World-space centre used by every runtime visual LOD. */
  centreX: number;
}

export const PROCEDURAL_GATE_VISUAL = {
  // Architectural height is visual only. The collider remains the exact
  // lateral gap plane below; a taller silhouette lets the broken arch carry
  // the portrait composition instead of reading as two waist-high slabs.
  wallHeight: 6.35,
  wallDepth: 2.05,
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

/** Every playable opening at the exact deterministic simulation time. */
export function gateOpeningsAt(
  gate: RuntimeGateGeometrySource,
  elapsedSec: number
): readonly GateOpeningGeometry[] {
  const plan = gate.obstaclePlan;
  if (plan?.verb === "moonflash-choice") {
    return plan.openings
      .map((opening) => ({ ...opening }))
      .sort((left, right) => left.left - right.left);
  }
  if (plan?.verb === "ceremonial-shutter") {
    const opening = shutterOpeningAt(plan, elapsedSec);
    return [{
      left: opening.left,
      right: opening.right,
      route: "standard",
      scoreMultiplier: 1
    }];
  }
  return [{
    left: gate.gapLeft,
    right: gate.gapRight,
    route: "standard",
    scoreMultiplier: 1
  }];
}

export interface GateWallSegmentGeometry {
  role: "outer-left" | "divider" | "outer-right";
  side: GateSide;
  left: number;
  right: number;
  width: number;
  centreX: number;
}

/**
 * Resolve all collidable wall masses from the same opening list used by the
 * collision evaluator. Choice gates therefore gain a real central divider,
 * while shutters move their two inner faces without renderer inference.
 */
export function gateWallSegmentsAt(
  gate: RuntimeGateGeometrySource,
  laneHalfWidth: number,
  elapsedSec: number
): readonly GateWallSegmentGeometry[] {
  const openings = gateOpeningsAt(gate, elapsedSec);
  const segments: GateWallSegmentGeometry[] = [];
  let cursor = -laneHalfWidth;
  for (let index = 0; index < openings.length; index++) {
    const opening = openings[index];
    if (!opening) continue;
    const left = Math.max(-laneHalfWidth, Math.min(laneHalfWidth, opening.left));
    if (left > cursor + 1e-6) {
      const right = left;
      const centreX = (cursor + right) * 0.5;
      segments.push({
        role: segments.length === 0 ? "outer-left" : "divider",
        side: centreX <= 0 ? "left" : "right",
        left: cursor,
        right,
        width: right - cursor,
        centreX
      });
    }
    cursor = Math.max(cursor, opening.right);
  }
  if (cursor < laneHalfWidth - 1e-6) {
    const centreX = (cursor + laneHalfWidth) * 0.5;
    segments.push({
      role: "outer-right",
      side: "right",
      left: cursor,
      right: laneHalfWidth,
      width: laneHalfWidth - cursor,
      centreX
    });
  }
  return segments;
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
