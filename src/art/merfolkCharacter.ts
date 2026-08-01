/**
 * Phase 3B Merfolk Character Pass contract.
 *
 * This module is deliberately free of Three.js so the runtime, regression
 * tests and zero-dependency art gate agree on what makes the hero guardian a
 * character rather than another ambient silhouette.
 */

export const MERFOLK_CHARACTER_CONTRACT = {
  key: "hero-merfolk-guardian",
  name: "Moon-Garden Tidekeeper",
  recognitionLabel: "mermaid",
  minimumReadableHeightPixels: 72,
  minimumFaceHeightPixels: 22,
  minimumEyeDiameterPixels: 4.5,
  minimumWorldHeight: 3.45,
  safeLaneMarginUnits: 0.45,
  triangleRange: [6_500, 8_000] as const,
  maxDraws: 16,
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
    "tide-spear"
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
    maximumInstances: 6,
    minimumSilhouetteFeatures: [
      "head",
      "hair-crown",
      "arms",
      "tapered-tail",
      "split-fin"
    ]
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
