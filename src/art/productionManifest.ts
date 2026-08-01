/**
 * Pure production-art metadata shared by the zero-dependency structural gate
 * and geometry regression tests. Keep this module free of Three.js imports.
 */
export const PRODUCTION_ART = {
  glowfin: {
    lod0: 6780,
    lod1: 3388,
    materials: 2,
    bones: 10
  },
  wallFragment: {
    lod0: 1386,
    lod1: 838,
    lod2: 168,
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
    lod0: 360,
    lod1: 272,
    lod2: 184,
    materials: 1
  },
  spire: {
    lod0: 1568,
    lod1: 688,
    lod2: 244,
    materials: 1
  },
  palaceDistrict: {
    lod0: 1132,
    lod1: 654,
    lod2: 390,
    materials: 1
  },
  observatory: {
    lod0: 492,
    lod1: 300,
    lod2: 100,
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
    lod0: 892,
    lod1: 396,
    lod2: 81,
    materials: 1
  },
  brainCoral: {
    lod0: 1764,
    lod1: 870,
    lod2: 268,
    materials: 1
  },
  tableCoral: {
    lod0: 876,
    lod1: 748,
    lod2: 344,
    materials: 1
  },
  gateFoundation: {
    lod0: 336,
    lod1: 156,
    lod2: 132,
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
  moonfolkGuardian: {
    lod0: 1076,
    materials: 1
  },
  moonfolkCitizen: {
    lod0: 1076,
    materials: 1
  },
  moonfolkSwimmer: {
    lod0: 1328,
    materials: 1
  },
  merfolkConchHerald: {
    lod0: 1428,
    materials: 1
  },
  heroMerfolkGuardian: {
    lod0: 8143,
    materials: 1,
    draws: 17,
    articulatedJoints: 12,
    readableHeightPixels: 72,
    readableFaceHeightPixels: 22,
    readableEyeDiameterPixels: 4.5
  },
  merfolkMonument: {
    lod0: 1296,
    materials: 1
  },
  tideSpear: {
    lod0: 112,
    materials: 1
  },
  conchFountain: {
    lod0: 688,
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
