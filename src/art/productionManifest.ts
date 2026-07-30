/**
 * Pure production-art metadata shared by the zero-dependency structural gate
 * and geometry regression tests. Keep this module free of Three.js imports.
 */
export const PRODUCTION_ART = {
  glowfin: {
    lod0: 7240,
    lod1: 3104,
    materials: 2,
    bones: 10
  },
  wallFragment: {
    lod0: 1476,
    lod1: 636,
    lod2: 186,
    materials: 1,
    maxReliefDepth: 0.07
  },
  brokenTower: {
    lod0: 4384,
    lod1: 1592,
    lod2: 508,
    materials: 1
  },
  spire: {
    lod0: 1960,
    lod1: 868,
    lod2: 240,
    materials: 1
  },
  mediumCoral: {
    lod0: 920,
    lod1: 432,
    lod2: 96,
    materials: 1
  },
  heroCoral: {
    lod0: 2536,
    lod1: 1136,
    lod2: 372,
    materials: 1
  },
  shellGarden: {
    lod0: 672,
    lod1: 408,
    lod2: 132,
    materials: 1
  },
  gateFoundation: {
    lod0: 228,
    lod1: 156,
    lod2: 120,
    materials: 1
  },
  ribbonKelp: {
    lod0: 312,
    lod1: 120,
    materials: 1
  },
  godRayMesh: {
    lod0: 12,
    materials: 1
  },
  /**
   * Temporary authored review sources on the visual-reset branch. These are
   * real runtime assets, but explicitly are not substitutes for final GLBs.
   */
  brokenTowerReviewImpostor: {
    lod0: 2,
    materials: 1,
    // Shares the 1024² gate/architecture atlas accounted on the gate family.
    textureMemoryMB: 0,
    maxTextureSizePx: 1024
  },
  coralReviewImpostor: {
    lod0: 2,
    materials: 1,
    // Shared 1024² world atlas: reef, skyline and ambient life.
    textureMemoryMB: 5.4,
    maxTextureSizePx: 1024
  },
  glowfinReviewImpostor: {
    lod0: 2,
    materials: 1,
    textureMemoryMB: 1.7,
    maxTextureSizePx: 706
  },
  gateWallReviewImpostor: {
    lod0: 2,
    materials: 1,
    textureMemoryMB: 5.4,
    maxTextureSizePx: 1024
  },
  skylineReviewImpostor: {
    lod0: 2,
    materials: 1,
    // Owns the shared 1024² skyline/life atlas plus the 384² seabed map.
    textureMemoryMB: 6.2,
    maxTextureSizePx: 1024
  },
  ambientLifeReviewImpostor: {
    lod0: 2,
    materials: 1,
    textureMemoryMB: 0,
    maxTextureSizePx: 1024
  }
} as const;

export const GLOWFIN_ANIMATION = {
  driver: "simulation",
  clips: [
    "breathe",
    "propulsion",
    "bank",
    "collisionSquash",
    "recovery"
  ],
  states: [
    "calm",
    "mid",
    "max",
    "collision",
    "recovery"
  ]
} as const;
