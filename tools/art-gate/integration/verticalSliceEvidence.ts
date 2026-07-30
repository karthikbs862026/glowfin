/**
 * Production-art evidence for the Phase 3B vertical slice.
 *
 * Collider values come from src/sim/gateGeometry.ts, the exact module used by
 * collision and rendering. Art manifests are then built independently from
 * the generated production mesh dimensions and compared by the gate.
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
import {
  GLOWFIN_ANIMATION,
  PRODUCTION_ART
} from "../../../src/art/productionManifest.ts";

const SAMPLE_GATE = {
  distance: 100,
  gapLeft: -2,
  gapRight: 2
};
const LANE_HALF_WIDTH = 6;
const SAMPLE_HEIGHTS = [-0.5, 0.5, 1.5, 2.5, 3];

function wallManifest(
  name: string,
  runtimeObstacleId: string,
  visualPlane: number,
  gapDirection: 1 | -1
): AssetManifest {
  const lods = [
    [0, PRODUCTION_ART.wallFragment.lod0],
    [1, PRODUCTION_ART.wallFragment.lod1],
    [2, PRODUCTION_ART.wallFragment.lod2]
  ] as const;
  return {
    name,
    family: "wallFragment",
    collidable: true,
    runtimeObstacleId,
    materials: PRODUCTION_ART.wallFragment.materials,
    textureMemoryMB: 0,
    contour: "collision-cyan",
    maxReliefDepth: PRODUCTION_ART.wallFragment.maxReliefDepth,
    lods: lods.map(([level, triangles]) => ({
      level,
      triangles,
      playableEdge: {
        axis: "x",
        gapDirection,
        samples: SAMPLE_HEIGHTS.map((height) => ({
          height,
          depth: 0,
          visualPlane
        }))
      }
    }))
  };
}

function decorativeManifests(): AssetManifest[] {
  return [
    {
      name: "glowfin-vertical-slice",
      family: "glowfin",
      collidable: false,
      materials: PRODUCTION_ART.glowfin.materials,
      textureMemoryMB: 0,
      contour: "none",
      bones: PRODUCTION_ART.glowfin.bones,
      maxTextureSizePx: 0,
      clips: [...GLOWFIN_ANIMATION.clips],
      animationDriver: GLOWFIN_ANIMATION.driver,
      observedStates: [...GLOWFIN_ANIMATION.states],
      viewportWidthFraction: 0.09,
      eyeGlowPixels: 5,
      lods: [
        { level: 0, triangles: PRODUCTION_ART.glowfin.lod0 },
        { level: 1, triangles: PRODUCTION_ART.glowfin.lod1 }
      ]
    },
    {
      name: "glowfin-authored-rear-review-impostor",
      family: "artReviewImpostor",
      collidable: false,
      materials: PRODUCTION_ART.glowfinReviewImpostor.materials,
      textureMemoryMB: PRODUCTION_ART.glowfinReviewImpostor.textureMemoryMB,
      maxTextureSizePx: PRODUCTION_ART.glowfinReviewImpostor.maxTextureSizePx,
      contour: "none",
      lods: [{
        level: 0,
        triangles: PRODUCTION_ART.glowfinReviewImpostor.lod0
      }]
    },
    {
      name: "moon-garden-volumetric-broken-tower",
      family: "brokenTower",
      collidable: false,
      materials: PRODUCTION_ART.brokenTower.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.brokenTower.lod0 },
        { level: 1, triangles: PRODUCTION_ART.brokenTower.lod1 },
        { level: 2, triangles: PRODUCTION_ART.brokenTower.lod2 }
      ]
    },
    {
      name: "moon-garden-volumetric-collapsed-arch",
      family: "collapsedArchRuin",
      collidable: false,
      materials: PRODUCTION_ART.collapsedArch.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.collapsedArch.lod0 },
        { level: 1, triangles: PRODUCTION_ART.collapsedArch.lod1 },
        { level: 2, triangles: PRODUCTION_ART.collapsedArch.lod2 }
      ]
    },
    {
      name: "moon-garden-forked-spire",
      family: "spire",
      collidable: false,
      materials: PRODUCTION_ART.spire.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.spire.lod0 },
        { level: 1, triangles: PRODUCTION_ART.spire.lod1 },
        { level: 2, triangles: PRODUCTION_ART.spire.lod2 }
      ]
    },
    {
      name: "moon-garden-volumetric-hero-coral",
      family: "heroCoral",
      collidable: false,
      materials: PRODUCTION_ART.heroCoral.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.heroCoral.lod0 },
        { level: 1, triangles: PRODUCTION_ART.heroCoral.lod1 },
        { level: 2, triangles: PRODUCTION_ART.heroCoral.lod2 }
      ]
    },
    {
      name: "moon-garden-volumetric-medium-coral",
      family: "mediumCoral",
      collidable: false,
      materials: PRODUCTION_ART.mediumCoral.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.mediumCoral.lod0 },
        { level: 1, triangles: PRODUCTION_ART.mediumCoral.lod1 },
        { level: 2, triangles: PRODUCTION_ART.mediumCoral.lod2 }
      ]
    },
    {
      name: "moon-garden-volumetric-shell-garden",
      family: "mediumCoral",
      collidable: false,
      materials: PRODUCTION_ART.shellGarden.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.shellGarden.lod0 },
        { level: 1, triangles: PRODUCTION_ART.shellGarden.lod1 },
        { level: 2, triangles: PRODUCTION_ART.shellGarden.lod2 }
      ]
    },
    {
      name: "moon-garden-gate-rubble-foundation",
      family: "smallProp",
      collidable: false,
      materials: PRODUCTION_ART.gateFoundation.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.gateFoundation.lod0 },
        { level: 1, triangles: PRODUCTION_ART.gateFoundation.lod1 }
      ]
    },
    {
      name: "moon-garden-ribbon-kelp",
      family: "ribbonKelp",
      collidable: false,
      materials: PRODUCTION_ART.ribbonKelp.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.ribbonKelp.lod0 },
        { level: 1, triangles: PRODUCTION_ART.ribbonKelp.lod1 }
      ]
    },
    {
      name: "moon-garden-layered-city-skyline",
      family: "artReviewImpostor",
      collidable: false,
      materials: PRODUCTION_ART.skylineReviewImpostor.materials,
      textureMemoryMB:
        PRODUCTION_ART.skylineReviewImpostor.textureMemoryMB,
      maxTextureSizePx:
        PRODUCTION_ART.skylineReviewImpostor.maxTextureSizePx,
      contour: "none",
      lods: [{
        level: 0,
        triangles: PRODUCTION_ART.skylineReviewImpostor.lod0
      }]
    },
    {
      name: "moon-garden-ambient-life-atlas",
      family: "artReviewImpostor",
      collidable: false,
      materials: PRODUCTION_ART.ambientLifeReviewImpostor.materials,
      textureMemoryMB:
        PRODUCTION_ART.ambientLifeReviewImpostor.textureMemoryMB,
      maxTextureSizePx:
        PRODUCTION_ART.ambientLifeReviewImpostor.maxTextureSizePx,
      contour: "none",
      lods: [{
        level: 0,
        triangles: PRODUCTION_ART.ambientLifeReviewImpostor.lod0
      }]
    },
    {
      name: "moon-garden-god-ray",
      family: "godRayMesh",
      collidable: false,
      materials: PRODUCTION_ART.godRayMesh.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.godRayMesh.lod0 }
      ]
    }
  ];
}
export function buildVerticalSliceEvidence(
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
    assets: [
      ...walls.map((wall) => wallManifest(
        `moon-garden-${wall.side}-wall-fragment`,
        wall.runtimeObstacleId,
        wall.centreX + wall.gapDirection * wall.width / 2,
        wall.gapDirection
      )),
      ...decorativeManifests()
    ],
    runtimeObstacles,
    captures,
    renderEvidence: {
      trail: {
        implementation: "mesh-ribbon",
        particleReplacementUsed: false,
        laneWidthFractionAtMaxMomentum: 1.45 / (LANE_HALF_WIDTH * 2)
      }
    },
    compressedArtPayloadMB: 0.75
  };
}
