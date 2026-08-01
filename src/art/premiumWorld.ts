/**
 * Pure Phase 3B world-art contract.
 *
 * The renderer, course generator and zero-dependency art gate all consume
 * these names. Keeping the contract free of Three.js prevents a visual family
 * from being silently removed while technical evidence still reports green.
 */

export const GATE_FAMILIES = [
  {
    id: 0,
    key: "tide-court",
    name: "Tide Court",
    silhouette: "broad-round-portal",
    canopy: true,
    materials: ["limestone", "nacre", "bronze"]
  },
  {
    id: 1,
    key: "lapis-archive",
    name: "Lapis Archive",
    silhouette: "pointed-library-vault",
    canopy: true,
    materials: ["lapis", "limestone", "bronze"]
  },
  {
    id: 2,
    key: "coral-sanctuary",
    name: "Living Coral Sanctuary",
    silhouette: "scalloped-living-crown",
    canopy: true,
    materials: ["living-coral", "nacre", "limestone"]
  },
  {
    id: 3,
    key: "nacre-palace",
    name: "Nacre Palace",
    silhouette: "layered-shell-court-with-lantern-domes",
    canopy: true,
    materials: ["nacre", "limestone", "bronze"]
  },
  {
    id: 4,
    key: "astral-observatory",
    name: "Astral Observatory",
    silhouette: "twin-pylon-no-arch",
    canopy: false,
    materials: ["lapis", "crystal", "bronze"]
  }
] as const;

export type GateFacadeVariant = typeof GATE_FAMILIES[number]["id"];

export const PREMIUM_WORLD_CONTRACT = {
  gateFamilyCount: 5,
  requiredGateKeys: GATE_FAMILIES.map((family) => family.key),
  requiredArchitecture: [
    "broken-tower",
    "collapsed-arch",
    "forked-spire",
    "grand-palace-district",
    "twin-pylon-observatory"
  ],
  requiredReef: [
    "maze-ridged-brain-coral",
    "scalloped-table-coral",
    "staghorn-coral",
    "sea-fan",
    "anemone-lantern",
    "ribbon-kelp"
  ],
  requiredLife: [
    "moon-minnow-school",
    "lantern-jelly",
    "ribbon-manta",
    "merfolk-citizen",
    "merfolk-current-swimmer",
    "merfolk-conch-herald",
    "hero-merfolk-guardian"
  ],
  requiredProps: [
    "merfolk-monument",
    "tide-spear",
    "conch-fountain"
  ],
  requiredMaterialRoles: [
    "limestone",
    "nacre",
    "bronze",
    "lapis",
    "crystal",
    "living-coral"
  ],
  maxRepeatedGateFamilyRun: 1,
  minimumDistinctVisibleGateFamilies: 3,
  minimumDistinctReefFamilies: 6,
  minimumAmbientLifeFamilies: 7,
  minimumPropFamilies: 3
} as const;

export const PREMIUM_WORLD_SIGNATURES = {
  gateFamilies: GATE_FAMILIES.map((family) => family.key),
  architecture: [...PREMIUM_WORLD_CONTRACT.requiredArchitecture],
  reef: [...PREMIUM_WORLD_CONTRACT.requiredReef],
  life: [...PREMIUM_WORLD_CONTRACT.requiredLife],
  props: [...PREMIUM_WORLD_CONTRACT.requiredProps],
  materials: [...PREMIUM_WORLD_CONTRACT.requiredMaterialRoles]
} as const;
