/**
 * Phase 3A evidence for the current primitive gate renderer.
 *
 * Collider values come from src/sim/gateGeometry.ts, the exact module used by
 * collision and rendering. Art manifests are then built independently from
 * the primitive mesh dimensions and compared by the gate.
 */

import {
  gateWallGeometry,
  PROCEDURAL_GATE_VISUAL
} from "../../../src/sim/gateGeometry.ts";
import type {
  AssetManifest,
  GateInput,
  RuntimeObstacle,
  SceneCapture
} from "../src/types.ts";

const SAMPLE_GATE = {
  distance: 100,
  gapLeft: -2,
  gapRight: 2
};
const LANE_HALF_WIDTH = 6;
const SAMPLE_HEIGHTS = [-0.5, 0.5, 1.5, 2.5, 3];

function manifest(
  name: string,
  runtimeObstacleId: string,
  colliderPlane: number,
  gapDirection: 1 | -1
): AssetManifest {
  return {
    name,
    family: "wallFragment",
    collidable: true,
    baselineProcedural: true,
    runtimeObstacleId,
    materials: 1,
    textureMemoryMB: 0,
    contour: "collision-cyan",
    maxReliefDepth: 0,
    lods: [{
      level: 0,
      triangles: 12,
      playableEdge: {
        axis: "x",
        gapDirection,
        samples: SAMPLE_HEIGHTS.map((height) => ({
          height,
          depth: 0,
          visualPlane: colliderPlane
        }))
      }
    }]
  };
}
export function buildProceduralEvidence(
  runtimeRevision: string,
  captures: SceneCapture[] = []
): GateInput {
  const walls = gateWallGeometry(SAMPLE_GATE, LANE_HALF_WIDTH);
  const runtimeObstacles: RuntimeObstacle[] = walls.map((wall) => ({
    id: wall.runtimeObstacleId,
    family: "wallFragment",
    axis: "x",
    gapDirection: wall.gapDirection,
    colliderPlane: wall.colliderPlane,
    colliderEnvelope: {
      min: [
        wall.centreX - wall.width / 2,
        PROCEDURAL_GATE_VISUAL.wallFloorY,
        SAMPLE_GATE.distance - PROCEDURAL_GATE_VISUAL.wallDepth / 2
      ],
      max: [
        wall.centreX + wall.width / 2,
        PROCEDURAL_GATE_VISUAL.wallFloorY +
          PROCEDURAL_GATE_VISUAL.wallHeight,
        SAMPLE_GATE.distance + PROCEDURAL_GATE_VISUAL.wallDepth / 2
      ]
    },
    source: {
      module: "src/sim/gateGeometry.ts",
      exportName: "gateWallGeometry",
      runtimeRevision
    }
  }));

  return {
    evidenceVersion: "1.1.0",
    runtimeRevision,
    assets: walls.map((wall) => manifest(
      `procedural-${wall.side}-wall`,
      wall.runtimeObstacleId,
      wall.colliderPlane,
      wall.gapDirection
    )),
    runtimeObstacles,
    captures,
    renderEvidence: {
      trail: {
        implementation: "mesh-ribbon",
        particleReplacementUsed: false,
        laneWidthFractionAtMaxMomentum: 1.45 / (LANE_HALF_WIDTH * 2)
      }
    },
    compressedArtPayloadMB: 0
  };
}
