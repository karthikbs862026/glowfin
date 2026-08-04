import type { ReplaySummary } from "../replay/replay";

export type CosmeticCategory = "glow" | "fin" | "trail" | "aura";

export interface CosmeticDefinition {
  id: string;
  category: CosmeticCategory;
  name: string;
  unlockLevel: number;
  pricePearls: number;
  primaryColor: number;
  secondaryColor: number;
  strength: number;
}
export interface CosmeticLoadout {
  glow: string;
  fin: string;
  trail: string;
  aura: string;
}

export interface CosmeticPalette {
  glowColor: number;
  glowStrength: number;
  finAccentColor: number;
  finAccentStrength: number;
  trailNearColor: number;
  trailFarColor: number;
  auraColor: number;
  auraStrength: number;
}

export interface TideProgress {
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  fraction: number;
}

export interface RunPearlReward {
  pearls: number;
  xp: number;
  distancePearls: number;
  skillPearls: number;
  scorePearls: number;
  cleanRunPearls: number;
}

const DEFAULTS: CosmeticDefinition[] = [
  {
    id: "glow.moon-cyan",
    category: "glow",
    name: "Moon Cyan",
    unlockLevel: 1,
    pricePearls: 0,
    primaryColor: 0x63e6ff,
    secondaryColor: 0x7c72ff,
    strength: 0
  },
  {
    id: "fin.tideglass",
    category: "fin",
    name: "Tideglass",
    unlockLevel: 1,
    pricePearls: 0,
    primaryColor: 0x79edf2,
    secondaryColor: 0x7659d4,
    strength: 0
  },
  {
    id: "trail.moonwake",
    category: "trail",
    name: "Moonwake",
    unlockLevel: 1,
    pricePearls: 0,
    primaryColor: 0x8fefff,
    secondaryColor: 0x7a5cff,
    strength: 1
  },
  {
    id: "aura.none",
    category: "aura",
    name: "Quiet Current",
    unlockLevel: 1,
    pricePearls: 0,
    primaryColor: 0x63e6ff,
    secondaryColor: 0x63e6ff,
    strength: 0
  }
];

/**
 * Exactly twelve cosmetic-only unlocks. Every visual is expressed through
 * uniforms on the already-budgeted Glowfin and trail materials; none adds a
 * mesh, material, collider, sound authority, score modifier or input change.
 */
const UNLOCKS: CosmeticDefinition[] = [
  { id: "glow.coral-rose", category: "glow", name: "Coral Rose", unlockLevel: 2, pricePearls: 70, primaryColor: 0xff78b9, secondaryColor: 0x7cecff, strength: 0.3 },
  { id: "trail.foam-lace", category: "trail", name: "Foam Lace", unlockLevel: 2, pricePearls: 85, primaryColor: 0xd5fbff, secondaryColor: 0x4dd7e8, strength: 1 },
  { id: "fin.nacre-edge", category: "fin", name: "Nacre Edge", unlockLevel: 3, pricePearls: 115, primaryColor: 0xffd9f1, secondaryColor: 0x8ef4ff, strength: 0.72 },
  { id: "aura.pearl-halo", category: "aura", name: "Pearl Halo", unlockLevel: 3, pricePearls: 135, primaryColor: 0xfff0c7, secondaryColor: 0xbef8ff, strength: 0.28 },
  { id: "glow.lapis-violet", category: "glow", name: "Lapis Violet", unlockLevel: 4, pricePearls: 165, primaryColor: 0x8f78ff, secondaryColor: 0x50e6ff, strength: 0.34 },
  { id: "trail.star-ribbon", category: "trail", name: "Star Ribbon", unlockLevel: 4, pricePearls: 195, primaryColor: 0xf4e9ff, secondaryColor: 0x9b60ff, strength: 1 },
  { id: "fin.coral-bloom", category: "fin", name: "Coral Bloom", unlockLevel: 5, pricePearls: 235, primaryColor: 0xff789f, secondaryColor: 0xffb974, strength: 0.74 },
  { id: "aura.tide-sparks", category: "aura", name: "Tide Sparks", unlockLevel: 6, pricePearls: 280, primaryColor: 0x5cf6ff, secondaryColor: 0x8d72ff, strength: 0.38 },
  { id: "glow.pearl-gold", category: "glow", name: "Pearl Gold", unlockLevel: 7, pricePearls: 330, primaryColor: 0xffd889, secondaryColor: 0x81efff, strength: 0.32 },
  { id: "trail.royal-current", category: "trail", name: "Royal Current", unlockLevel: 8, pricePearls: 390, primaryColor: 0xff9fe6, secondaryColor: 0x694dff, strength: 1 },
  { id: "fin.astral-edge", category: "fin", name: "Astral Edge", unlockLevel: 9, pricePearls: 460, primaryColor: 0xa7ecff, secondaryColor: 0xc071ff, strength: 0.78 },
  { id: "aura.astral-crown", category: "aura", name: "Astral Crown", unlockLevel: 10, pricePearls: 540, primaryColor: 0xffc9f2, secondaryColor: 0x7defff, strength: 0.48 }
];

export const COSMETIC_CATALOG: readonly CosmeticDefinition[] = Object.freeze([
  ...DEFAULTS,
  ...UNLOCKS
]);

export const COSMETIC_UNLOCKS: readonly CosmeticDefinition[] = Object.freeze([
  ...UNLOCKS
]);

export const DEFAULT_COSMETIC_LOADOUT: Readonly<CosmeticLoadout> = Object.freeze({
  glow: "glow.moon-cyan",
  fin: "fin.tideglass",
  trail: "trail.moonwake",
  aura: "aura.none"
});

export const DEFAULT_COSMETIC_IDS: readonly string[] = Object.freeze(
  Object.values(DEFAULT_COSMETIC_LOADOUT)
);

const cosmeticById = new Map(COSMETIC_CATALOG.map((entry) => [entry.id, entry]));

function clampCount(value: number): number {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

export function cosmeticDefinition(id: string): CosmeticDefinition | null {
  return cosmeticById.get(id) ?? null;
}

export function tideXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const completed = safeLevel - 1;
  return completed * completed * 90;
}

export function tideLevelForXp(xp: number): number {
  const safeXp = clampCount(xp);
  return Math.max(1, Math.floor(Math.sqrt(safeXp / 90)) + 1);
}

export function tideProgressForXp(xp: number): TideProgress {
  const safeXp = clampCount(xp);
  const level = tideLevelForXp(safeXp);
  const levelStartXp = tideXpForLevel(level);
  const nextLevelXp = tideXpForLevel(level + 1);
  const xpForNextLevel = Math.max(1, nextLevelXp - levelStartXp);
  const xpIntoLevel = Math.max(0, safeXp - levelStartXp);
  return {
    level,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    fraction: Math.max(0, Math.min(1, xpIntoLevel / xpForNextLevel))
  };
}

export function unlockedCosmeticsForXp(xp: number): CosmeticDefinition[] {
  const level = tideLevelForXp(xp);
  return COSMETIC_CATALOG.filter((entry) => entry.unlockLevel <= level);
}

export function sanitizeOwnedCosmetics(value: unknown): string[] {
  const requested = Array.isArray(value) ? value : [];
  const valid = requested.filter((id): id is string => (
    typeof id === "string" && cosmeticById.has(id)
  ));
  return Array.from(new Set([...DEFAULT_COSMETIC_IDS, ...valid])).sort();
}

export function grandfatheredCosmeticsForXp(xp: number): string[] {
  return sanitizeOwnedCosmetics(unlockedCosmeticsForXp(xp).map((item) => item.id));
}

export type CosmeticAvailability = "locked" | "available" | "owned" | "equipped";

export function cosmeticAvailability(
  cosmetic: CosmeticDefinition,
  tideXp: number,
  ownedCosmetics: readonly string[],
  loadout: CosmeticLoadout
): CosmeticAvailability {
  if (loadout[cosmetic.category] === cosmetic.id) return "equipped";
  if (ownedCosmetics.includes(cosmetic.id)) return "owned";
  return tideLevelForXp(tideXp) >= cosmetic.unlockLevel ? "available" : "locked";
}

export function purchasedCosmeticCost(ids: readonly string[]): number {
  return Array.from(new Set(ids)).reduce((total, id) => {
    const item = cosmeticDefinition(id);
    return total + (item?.pricePearls ?? 0);
  }, 0);
}

export function newlyUnlockedCosmetics(
  previousXp: number,
  nextXp: number
): CosmeticDefinition[] {
  const previousLevel = tideLevelForXp(previousXp);
  const nextLevel = tideLevelForXp(nextXp);
  if (nextLevel <= previousLevel) return [];
  return COSMETIC_UNLOCKS.filter((entry) => (
    entry.unlockLevel > previousLevel && entry.unlockLevel <= nextLevel
  ));
}

export function sanitizeCosmeticLoadout(
  value: unknown,
  ownedOrXp: readonly string[] | number
): CosmeticLoadout {
  const candidate = value && typeof value === "object"
    ? value as Partial<CosmeticLoadout>
    : {};
  const owned = Array.isArray(ownedOrXp)
    ? new Set(sanitizeOwnedCosmetics(ownedOrXp))
    : new Set(unlockedCosmeticsForXp(ownedOrXp as number).map((item) => item.id));
  const choose = (category: CosmeticCategory): string => {
    const requested = candidate[category];
    const definition = typeof requested === "string"
      ? cosmeticDefinition(requested)
      : null;
    return definition?.category === category && owned.has(definition.id)
      ? definition.id
      : DEFAULT_COSMETIC_LOADOUT[category];
  };
  return {
    glow: choose("glow"),
    fin: choose("fin"),
    trail: choose("trail"),
    aura: choose("aura")
  };
}

export function nextCosmeticInCategory(
  loadout: CosmeticLoadout,
  category: CosmeticCategory,
  ownedOrXp: readonly string[] | number
): CosmeticLoadout {
  const owned = Array.isArray(ownedOrXp)
    ? sanitizeOwnedCosmetics(ownedOrXp)
    : unlockedCosmeticsForXp(ownedOrXp as number).map((item) => item.id);
  const available = COSMETIC_CATALOG
    .filter((entry) => owned.includes(entry.id))
    .filter((entry) => entry.category === category);
  if (available.length < 1) return sanitizeCosmeticLoadout(loadout, owned);
  const current = available.findIndex((entry) => entry.id === loadout[category]);
  const next = available[(current + 1 + available.length) % available.length] ?? available[0];
  return {
    ...sanitizeCosmeticLoadout(loadout, owned),
    [category]: next?.id ?? DEFAULT_COSMETIC_LOADOUT[category]
  };
}

export function loadoutWithCosmetic(
  loadout: CosmeticLoadout,
  cosmeticId: string,
  ownedCosmetics: readonly string[]
): CosmeticLoadout {
  const cosmetic = cosmeticDefinition(cosmeticId);
  const owned = sanitizeOwnedCosmetics(ownedCosmetics);
  if (!cosmetic || !owned.includes(cosmetic.id)) {
    return sanitizeCosmeticLoadout(loadout, owned);
  }
  return {
    ...sanitizeCosmeticLoadout(loadout, owned),
    [cosmetic.category]: cosmetic.id
  };
}

export function cosmeticPalette(loadout: CosmeticLoadout): CosmeticPalette {
  const safe = sanitizeCosmeticLoadout(loadout, Number.MAX_SAFE_INTEGER);
  const glow = cosmeticDefinition(safe.glow) ?? DEFAULTS[0]!;
  const fin = cosmeticDefinition(safe.fin) ?? DEFAULTS[1]!;
  const trail = cosmeticDefinition(safe.trail) ?? DEFAULTS[2]!;
  const aura = cosmeticDefinition(safe.aura) ?? DEFAULTS[3]!;
  return {
    glowColor: glow.primaryColor,
    glowStrength: glow.strength,
    finAccentColor: fin.primaryColor,
    finAccentStrength: fin.strength,
    trailNearColor: trail.primaryColor,
    trailFarColor: trail.secondaryColor,
    auraColor: aura.primaryColor,
    auraStrength: aura.strength
  };
}

export function calculateRunPearlReward(summary: ReplaySummary): RunPearlReward {
  const distancePearls = Math.min(80, Math.floor(Math.max(0, summary.forwardDistance) / 70));
  const skillPearls = Math.min(72, clampCount(summary.nearMisses) * 4);
  const scorePearls = Math.min(55, Math.floor(Math.max(0, summary.score) / 450));
  const cleanRunPearls = summary.collisions === 0 && summary.elapsedSec >= 20 ? 8 : 0;
  const pearls = Math.max(
    5,
    Math.min(220, 5 + distancePearls + skillPearls + scorePearls + cleanRunPearls)
  );
  const xp = Math.max(
    3,
    Math.min(150, Math.floor(pearls * 0.62) + Math.min(12, clampCount(summary.nearMisses)))
  );
  return {
    pearls,
    xp,
    distancePearls,
    skillPearls,
    scorePearls,
    cleanRunPearls
  };
}
