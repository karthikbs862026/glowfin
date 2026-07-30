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
    lod0: 1464,
    lod1: 624,
    lod2: 174,
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
  ribbonKelp: {
    lod0: 416,
    lod1: 120,
    materials: 1
  },
  godRayMesh: {
    lod0: 12,
    materials: 1
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
