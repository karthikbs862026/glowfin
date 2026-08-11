export const REALM_IDS = [
  "moon-garden",
  "kelp-cathedral",
  "crystal-trench",
] as const;

export type RealmId = typeof REALM_IDS[number];

export type RealmGameplayVerb =
  | "swaying-frond-window"
  | "reversing-current-tunnel"
  | "manta-rescue"
  | "relic-current"
  | "prism-pulse"
  | "trench-threshold"
  | "sliding-crystal-plates"
  | "mirror-current-race";

export interface RealmPalette {
  fog: number;
  routeCalm: number;
  routeMomentum: number;
  accent: number;
}

export interface RealmBudget {
  maxDrawCalls: number;
  maxTriangles: number;
  maxTextureMemoryMB: number;
  maxActiveMaterials: number;
  minReactionWindowMs: number;
  minimumFrameRate: number;
}

export interface RealmDefinition {
  id: RealmId;
  revision: 1;
  title: string;
  shortTitle: string;
  description: string;
  residents: readonly string[];
  gameplayVerbs: readonly RealmGameplayVerb[];
  heroEncounter: string;
  relicPageId: string | null;
  palette: Readonly<RealmPalette>;
  budget: Readonly<RealmBudget>;
}

export const REALM_BUDGET: Readonly<RealmBudget> = Object.freeze({
  maxDrawCalls: 90,
  maxTriangles: 150_000,
  maxTextureMemoryMB: 48,
  maxActiveMaterials: 12,
  minReactionWindowMs: 700,
  minimumFrameRate: 30,
});

export const MOON_GARDEN_REALM: Readonly<RealmDefinition> = Object.freeze({
  id: "moon-garden",
  revision: 1,
  title: "The Moon-Garden Ruins",
  shortTitle: "Moon Garden",
  description: "The restored home current for Classic Dive and Chapter One.",
  residents: ["merfolk", "moon rays", "reef citizens"],
  gameplayVerbs: [],
  heroEncounter: "Restore the Moon Well",
  relicPageId: null,
  palette: {
    fog: 0x12364c,
    routeCalm: 0x63e0ff,
    routeMomentum: 0xff6be0,
    accent: 0xffe49c,
  },
  budget: REALM_BUDGET,
});

export const KELP_CATHEDRAL_REALM: Readonly<RealmDefinition> = Object.freeze({
  id: "kelp-cathedral",
  revision: 1,
  title: "Kelp Cathedral",
  shortTitle: "Kelp Cathedral",
  description: "Towering kelp columns, filtered emerald light and shell bells.",
  residents: ["sea dragons", "shell-choir keepers", "baby manta"],
  gameplayVerbs: [
    "swaying-frond-window",
    "reversing-current-tunnel",
    "manta-rescue",
    "relic-current",
  ] as const,
  heroEncounter: "Rescue the baby manta from the collapsing kelp chamber",
  relicPageId: "kelp-cathedral-page-1",
  palette: {
    fog: 0x073f38,
    routeCalm: 0x57f0b3,
    routeMomentum: 0xffd26f,
    accent: 0xbaffdf,
  },
  budget: REALM_BUDGET,
});

export const CRYSTAL_TRENCH_REALM: Readonly<RealmDefinition> = Object.freeze({
  id: "crystal-trench",
  revision: 1,
  title: "Crystal Trench · Mirror Current",
  shortTitle: "Crystal Trench",
  description: "Indigo caverns, reflective crystal forests and refracted moonbeams.",
  residents: ["Neri", "trench lanternfish", "mirror rays", "glass shrimp"],
  gameplayVerbs: [
    "prism-pulse",
    "trench-threshold",
    "sliding-crystal-plates",
    "mirror-current-race",
  ] as const,
  heroEncounter: "Read the plates, seal the Trench Gate and race Neri through the mirror current",
  relicPageId: "crystal-trench-page-1",
  palette: {
    fog: 0x111738,
    routeCalm: 0x62e8ff,
    routeMomentum: 0x9a78ff,
    accent: 0xd7fbff,
  },
  budget: REALM_BUDGET,
});

export const REALM_DEFINITIONS: Readonly<Record<RealmId, Readonly<RealmDefinition>>> =
  Object.freeze({
    "moon-garden": MOON_GARDEN_REALM,
    "kelp-cathedral": KELP_CATHEDRAL_REALM,
    "crystal-trench": CRYSTAL_TRENCH_REALM,
  });

export function isRealmId(value: unknown): value is RealmId {
  return typeof value === "string" && REALM_IDS.some((id) => id === value);
}

export function realmDefinition(id: RealmId): Readonly<RealmDefinition> {
  return REALM_DEFINITIONS[id];
}

export function realmDefinitionIssues(
  definition: Readonly<RealmDefinition>,
): string[] {
  const issues: string[] = [];
  if (!definition.title.trim()) issues.push("title");
  if (new Set(definition.gameplayVerbs).size !== definition.gameplayVerbs.length) {
    issues.push("duplicate-gameplay-verbs");
  }
  if (definition.budget.maxDrawCalls > REALM_BUDGET.maxDrawCalls) issues.push("draw-calls");
  if (definition.budget.maxTriangles > REALM_BUDGET.maxTriangles) issues.push("triangles");
  if (definition.budget.maxTextureMemoryMB > REALM_BUDGET.maxTextureMemoryMB) issues.push("textures");
  if (definition.budget.maxActiveMaterials > REALM_BUDGET.maxActiveMaterials) issues.push("materials");
  if (definition.budget.minReactionWindowMs < REALM_BUDGET.minReactionWindowMs) issues.push("reaction-window");
  if (definition.budget.minimumFrameRate < REALM_BUDGET.minimumFrameRate) issues.push("frame-rate");
  return issues;
}
