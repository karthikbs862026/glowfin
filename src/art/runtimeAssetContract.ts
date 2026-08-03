/**
 * Immutable names shared by the Phase 3C exporter, browser loader and tests.
 * Runtime art may change topology, but these semantic names are the contract
 * that keeps five gate families and six reef families from collapsing back
 * into cosmetic variants.
 */
export const RUNTIME_PRODUCTION_ASSETS = {
  build: "phase3c-v29-cohesion",
  gateUrl: "art/moon-garden/models/moon-gate-v1.glb",
  reefUrl: "art/moon-garden/models/reef-kit-v1.glb",
  lods: [0, 1, 2],
  gateVariants: [0, 1, 2, 3, 4],
  reefFamilies: [
    "BrainCoral",
    "TableCoral",
    "Staghorn",
    "SeaFan",
    "Anemone",
    "Kelp"
  ],
  maxPackedBytes: 1_250_000
} as const;

export type RuntimeArtLod =
  typeof RUNTIME_PRODUCTION_ASSETS.lods[number];
export type RuntimeGateVariant =
  typeof RUNTIME_PRODUCTION_ASSETS.gateVariants[number];
export type RuntimeReefFamily =
  typeof RUNTIME_PRODUCTION_ASSETS.reefFamilies[number];
export type RuntimeGateSide = "Left" | "Right";

export function runtimeGateWallName(
  side: RuntimeGateSide,
  variant: RuntimeGateVariant,
  lod: RuntimeArtLod
): string {
  return `MoonGate_${side}_Variant${variant}_LOD${lod}`;
}

export function runtimeGateCanopyName(
  variant: RuntimeGateVariant,
  lod: RuntimeArtLod
): string {
  return `MoonGate_Canopy_Variant${variant}_LOD${lod}`;
}

export function runtimeReefName(
  family: RuntimeReefFamily,
  lod: RuntimeArtLod
): string {
  return `${family}_LOD${lod}`;
}

export function expectedRuntimeGateNodes(): string[] {
  const names: string[] = [];
  for (const lod of RUNTIME_PRODUCTION_ASSETS.lods) {
    for (const variant of RUNTIME_PRODUCTION_ASSETS.gateVariants) {
      names.push(runtimeGateCanopyName(variant, lod));
      names.push(runtimeGateWallName("Left", variant, lod));
      names.push(runtimeGateWallName("Right", variant, lod));
    }
  }
  return names;
}

export function expectedRuntimeReefNodes(): string[] {
  const names: string[] = [];
  for (const family of RUNTIME_PRODUCTION_ASSETS.reefFamilies) {
    const lods = family === "Kelp" ? [0, 1] as const : RUNTIME_PRODUCTION_ASSETS.lods;
    for (const lod of lods) names.push(runtimeReefName(family, lod));
  }
  return names;
}

export const RUNTIME_SHADER_ATTRIBUTE_ALIASES = {
  _glowweight: "glowWeight",
  _swayweight: "swayWeight",
  _materialrole: "materialRole"
} as const;
