/**
 * Phase 3B Merfolk & Inhabited City contract.
 *
 * This module is deliberately free of Three.js so the runtime, regression
 * tests and zero-dependency art gate agree on what makes the hero guardian a
 * character rather than another ambient silhouette.
 */

export const MERFOLK_GUARDIAN_ROLES = [
  {
    key: "tidekeeper",
    name: "Nacre Tidekeeper",
    gateFamilies: ["tide-court", "nacre-palace"],
    silhouette: "crescent-tiara-and-tide-spear"
  },
  {
    key: "coral-warden",
    name: "Coral Warden",
    gateFamilies: ["coral-sanctuary"],
    silhouette: "broad-sea-fan-crown"
  },
  {
    key: "astral-oracle",
    name: "Astral Oracle",
    gateFamilies: ["lapis-archive", "astral-observatory"],
    silhouette: "armillary-halo-and-star-crystal"
  }
] as const;

export type MerfolkGuardianRole =
  typeof MERFOLK_GUARDIAN_ROLES[number]["key"];

export const MERFOLK_CITY_CONTRACT = {
  key: "moon-garden-merfolk-cast",
  guardianRoles: MERFOLK_GUARDIAN_ROLES.map((role) => role.key),
  populationRoles: [
    "reef-citizen",
    "current-swimmer",
    "conch-herald"
  ],
  minimumDistinctVisibleRoles: 4,
  maximumVisibleHeroGuardians: 1,
  minimumCeremonialHeraldsPerGate: 2,
  maximumBackgroundInstances: 9,
  requiredSilhouetteFeatures: [
    "head",
    "hair-crown",
    "arms",
    "tapered-tail",
    "split-fin"
  ]
} as const;

export function guardianRoleForGateFamily(
  gateFamily: number
): MerfolkGuardianRole {
  if (gateFamily === 2) return "coral-warden";
  if (gateFamily === 1 || gateFamily === 4) return "astral-oracle";
  return "tidekeeper";
}

export const MERFOLK_CHARACTER_CONTRACT = {
  key: "hero-merfolk-guardian",
  name: "Moon-Garden Tidekeeper",
  recognitionLabel: "mermaid",
  minimumReadableHeightPixels: 72,
  minimumFaceHeightPixels: 22,
  minimumEyeDiameterPixels: 4.5,
  minimumWorldHeight: 3.45,
  safeLaneMarginUnits: 0.45,
  triangleRange: [6_800, 8_600] as const,
  maxDraws: 17,
  maxMaterials: 1,
  articulatedJoints: 12,
  requiredParts: [
    "readable-face",
    "expressive-eyes",
    "flowing-hair",
    "articulated-arms",
    "readable-hands",
    "shell-cuirass",
    "lapis-pendant",
    "scaled-tail",
    "broad-caudal-fin",
    "translucent-side-fins",
    "tide-spear",
    "district-regalia"
  ],
  requiredAnimations: [
    "hover",
    "swim",
    "turn",
    "patrol",
    "greeting"
  ],
  requiredMaterialRoles: [
    "nacre",
    "bronze",
    "lapis",
    "crystal",
    "living-coral"
  ],
  backgroundLod: {
    key: "merfolk-citizen",
    role: "background-swimmer",
    maximumInstances: MERFOLK_CITY_CONTRACT.maximumBackgroundInstances,
    minimumSilhouetteFeatures:
      MERFOLK_CITY_CONTRACT.requiredSilhouetteFeatures
  }
} as const;

export const MERFOLK_ANIMATION = {
  driver: "simulation",
  clips: [...MERFOLK_CHARACTER_CONTRACT.requiredAnimations],
  states: [
    "patrol",
    "approach",
    "greeting",
    "turn-away"
  ]
} as const;
