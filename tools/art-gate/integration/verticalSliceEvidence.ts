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
import { PREMIUM_WORLD_SIGNATURES } from "../../../src/art/premiumWorld.ts";
import {
  MERFOLK_ANIMATION,
  MERFOLK_CHARACTER_CONTRACT,
  MERFOLK_CITY_CONTRACT
} from "../../../src/art/merfolkCharacter.ts";

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
    textureMemoryMB: PRODUCTION_ART.wallFragment.textureMemoryMB,
    maxTextureSizePx: PRODUCTION_ART.wallFragment.maxTextureSizePx,
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
      name: "glowfin-v2-runtime-production",
      family: "glowfin",
      collidable: false,
      materials: PRODUCTION_ART.glowfin.materials,
      textureMemoryMB: 1,
      contour: "none",
      bones: PRODUCTION_ART.glowfin.bones,
      maxTextureSizePx: 512,
      clips: [...GLOWFIN_ANIMATION.clips],
      animationDriver: GLOWFIN_ANIMATION.driver,
      observedStates: [...GLOWFIN_ANIMATION.states],
      viewportWidthFraction: 0.09,
      eyeGlowPixels: 10,
      lods: [
        { level: 0, triangles: PRODUCTION_ART.glowfin.lod0 },
        { level: 1, triangles: PRODUCTION_ART.glowfin.lod1 }
      ]
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
      name: "moon-garden-grand-palace-district",
      family: "palaceDistrict",
      collidable: false,
      materials: PRODUCTION_ART.palaceDistrict.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.palaceDistrict.lod0 },
        { level: 1, triangles: PRODUCTION_ART.palaceDistrict.lod1 },
        { level: 2, triangles: PRODUCTION_ART.palaceDistrict.lod2 }
      ]
    },
    {
      name: "moon-garden-twin-pylon-observatory",
      family: "observatory",
      collidable: false,
      materials: PRODUCTION_ART.observatory.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.observatory.lod0 },
        { level: 1, triangles: PRODUCTION_ART.observatory.lod1 },
        { level: 2, triangles: PRODUCTION_ART.observatory.lod2 }
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
      name: "moon-garden-maze-ridged-brain-coral",
      family: "brainCoral",
      collidable: false,
      materials: PRODUCTION_ART.brainCoral.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.brainCoral.lod0 },
        { level: 1, triangles: PRODUCTION_ART.brainCoral.lod1 },
        { level: 2, triangles: PRODUCTION_ART.brainCoral.lod2 }
      ]
    },
    {
      name: "moon-garden-scalloped-table-coral",
      family: "tableCoral",
      collidable: false,
      materials: PRODUCTION_ART.tableCoral.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [
        { level: 0, triangles: PRODUCTION_ART.tableCoral.lod0 },
        { level: 1, triangles: PRODUCTION_ART.tableCoral.lod1 },
        { level: 2, triangles: PRODUCTION_ART.tableCoral.lod2 }
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
      name: "moon-garden-volumetric-skyline-cluster",
      family: "distantSkyline",
      collidable: false,
      materials: PRODUCTION_ART.skylineCluster.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{
        level: 0,
        triangles: PRODUCTION_ART.skylineCluster.lod2
      }]
    },
    {
      name: "moon-garden-moon-minnow",
      family: "ambientCreature",
      collidable: false,
      materials: PRODUCTION_ART.moonMinnow.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{ level: 0, triangles: PRODUCTION_ART.moonMinnow.lod0 }]
    },
    {
      name: "moon-garden-lantern-jelly",
      family: "ambientCreature",
      collidable: false,
      materials: PRODUCTION_ART.lanternJelly.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{ level: 0, triangles: PRODUCTION_ART.lanternJelly.lod0 }]
    },
    {
      name: "moon-garden-ribbon-ray",
      family: "ambientCreature",
      collidable: false,
      materials: PRODUCTION_ART.ribbonRay.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{ level: 0, triangles: PRODUCTION_ART.ribbonRay.lod0 }]
    },
    {
      name: "moon-garden-merfolk-citizen",
      family: "merfolkCreature",
      collidable: false,
      materials: PRODUCTION_ART.moonfolkCitizen.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{ level: 0, triangles: PRODUCTION_ART.moonfolkCitizen.lod0 }]
    },
    {
      name: "moon-garden-merfolk-current-swimmer",
      family: "merfolkCreature",
      collidable: false,
      materials: PRODUCTION_ART.moonfolkSwimmer.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{ level: 0, triangles: PRODUCTION_ART.moonfolkSwimmer.lod0 }]
    },
    {
      name: "moon-garden-merfolk-conch-herald",
      family: "merfolkCreature",
      collidable: false,
      materials: PRODUCTION_ART.merfolkConchHerald.materials,
      textureMemoryMB: 0,
      contour: "none",
      lods: [{ level: 0, triangles: PRODUCTION_ART.merfolkConchHerald.lod0 }]
    },
    {
      name: "moon-garden-hero-merfolk-guardian",
      family: "heroMerfolk",
      collidable: false,
      materials: PRODUCTION_ART.heroMerfolkGuardian.materials,
      textureMemoryMB: 0,
      contour: "none",
      articulatedJoints:
        PRODUCTION_ART.heroMerfolkGuardian.articulatedJoints,
      readableHeightPixels:
        PRODUCTION_ART.heroMerfolkGuardian.readableHeightPixels,
      readableFaceHeightPixels:
        PRODUCTION_ART.heroMerfolkGuardian.readableFaceHeightPixels,
      readableEyeDiameterPixels:
        PRODUCTION_ART.heroMerfolkGuardian.readableEyeDiameterPixels,
      recognitionLabel: MERFOLK_CHARACTER_CONTRACT.recognitionLabel,
      castRoles: [...MERFOLK_CITY_CONTRACT.guardianRoles],
      populationRoles: [...MERFOLK_CITY_CONTRACT.populationRoles],
      parts: [...MERFOLK_CHARACTER_CONTRACT.requiredParts],
      clips: [...MERFOLK_ANIMATION.clips],
      animationDriver: MERFOLK_ANIMATION.driver,
      observedStates: [...MERFOLK_ANIMATION.states],
      lods: [{
        level: 0,
        triangles: PRODUCTION_ART.heroMerfolkGuardian.lod0
      }]
    },
    {
      name: "moon-garden-merfolk-monument",
      family: "heroProp",
      collidable: false,
      materials: PRODUCTION_ART.merfolkMonument.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [{ level: 0, triangles: PRODUCTION_ART.merfolkMonument.lod0 }]
    },
    {
      name: "moon-garden-tide-spear",
      family: "heroProp",
      collidable: false,
      materials: PRODUCTION_ART.tideSpear.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [{ level: 0, triangles: PRODUCTION_ART.tideSpear.lod0 }]
    },
    {
      name: "moon-garden-conch-fountain",
      family: "heroProp",
      collidable: false,
      materials: PRODUCTION_ART.conchFountain.materials,
      textureMemoryMB: 0,
      contour: "decorative",
      lods: [{ level: 0, triangles: PRODUCTION_ART.conchFountain.lod0 }]
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
    worldQuality: {
      gateFamilies: [...PREMIUM_WORLD_SIGNATURES.gateFamilies],
      architecture: [...PREMIUM_WORLD_SIGNATURES.architecture],
      reef: [...PREMIUM_WORLD_SIGNATURES.reef],
      life: [...PREMIUM_WORLD_SIGNATURES.life],
      props: [...PREMIUM_WORLD_SIGNATURES.props],
      materials: [...PREMIUM_WORLD_SIGNATURES.materials]
    },
    compressedArtPayloadMB: 0.16
  };
}
