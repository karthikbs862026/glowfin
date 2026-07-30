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
    lod0: 1088,
    lod1: 736,
    lod2: 200,
    materials: 1,
    maxReliefDepth: 0.07,
    textureMemoryMB: 1.4,
    maxTextureSizePx: 512
  },
  brokenTower: {
    lod0: 3520,
    lod1: 1520,
    lod2: 432,
    materials: 1
  },
  collapsedArch: {
    lod0: 480,
    lod1: 324,
    lod2: 212,
    materials: 1
  },
  spire: {
    lod0: 1568,
    lod1: 688,
    lod2: 244,
    materials: 1
  },
  mediumCoral: {
    lod0: 842,
    lod1: 418,
    lod2: 90,
    materials: 1
  },
  heroCoral: {
    lod0: 2352,
    lod1: 1198,
    lod2: 300,
    materials: 1
  },
  shellGarden: {
    lod0: 698,
    lod1: 444,
    lod2: 117,
    materials: 1
  },
  gateFoundation: {
    lod0: 228,
    lod1: 156,
    lod2: 120,
    materials: 1
  },
  ribbonKelp: {
    lod0: 396,
    lod1: 244,
    materials: 1
  },
  skylineCluster: {
    lod2: 388,
    materials: 1
  },
  moonMinnow: {
    lod0: 94,
    materials: 1
  },
  lanternJelly: {
    lod0: 206,
    materials: 1
  },
  ribbonRay: {
    lod0: 144,
    materials: 1
  },
  gardenSpirit: {
    lod0: 160,
    materials: 1
  },
  godRayMesh: {
    lod0: 12,
    materials: 1
  },
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
