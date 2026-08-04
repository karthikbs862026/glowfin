import { describe, expect, it } from "vitest";
import {
  COSMETIC_CATALOG,
  COSMETIC_UNLOCKS,
  DEFAULT_COSMETIC_LOADOUT,
  calculateRunPearlReward,
  cosmeticAvailability,
  cosmeticPalette,
  grandfatheredCosmeticsForXp,
  loadoutWithCosmetic,
  nextCosmeticInCategory,
  purchasedCosmeticCost,
  sanitizeCosmeticLoadout,
  sanitizeOwnedCosmetics,
  tideLevelForXp,
  tideProgressForXp,
  tideXpForLevel
} from "../src/meta/progression";

describe("Version 33 Moonwake progression", () => {
  it("ships exactly twelve unique cosmetic-only unlocks across all four categories", () => {
    expect(COSMETIC_UNLOCKS).toHaveLength(12);
    expect(COSMETIC_CATALOG).toHaveLength(16);
    expect(new Set(COSMETIC_CATALOG.map((item) => item.id)).size).toBe(16);
    expect(new Set(COSMETIC_UNLOCKS.map((item) => item.category))).toEqual(
      new Set(["glow", "fin", "trail", "aura"])
    );
    expect(COSMETIC_UNLOCKS.every((item) => item.unlockLevel >= 2)).toBe(true);
  });

  it("uses deterministic quadratic Tide Level boundaries", () => {
    expect([1, 2, 3, 10].map(tideXpForLevel)).toEqual([0, 90, 360, 7290]);
    expect(tideLevelForXp(89)).toBe(1);
    expect(tideLevelForXp(90)).toBe(2);
    expect(tideLevelForXp(359)).toBe(2);
    expect(tideLevelForXp(360)).toBe(3);
    expect(tideProgressForXp(225)).toMatchObject({
      level: 2,
      levelStartXp: 90,
      nextLevelXp: 360,
      xpIntoLevel: 135,
      xpForNextLevel: 270,
      fraction: 0.5
    });
  });

  it("rejects locked, unknown and wrong-category cosmetics during save sanitization", () => {
    expect(sanitizeCosmeticLoadout({
      glow: "aura.astral-crown",
      fin: "fin.astral-edge",
      trail: "missing",
      aura: "aura.pearl-halo"
    }, 0)).toEqual(DEFAULT_COSMETIC_LOADOUT);

    const levelThree = tideXpForLevel(3);
    expect(sanitizeCosmeticLoadout({
      ...DEFAULT_COSMETIC_LOADOUT,
      fin: "fin.nacre-edge",
      aura: "aura.pearl-halo"
    }, levelThree)).toMatchObject({
      fin: "fin.nacre-edge",
      aura: "aura.pearl-halo"
    });
  });

  it("cycles only through cosmetics unlocked for the requested category", () => {
    const levelTwo = tideXpForLevel(2);
    const coral = nextCosmeticInCategory(
      { ...DEFAULT_COSMETIC_LOADOUT },
      "glow",
      levelTwo
    );
    expect(coral.glow).toBe("glow.coral-rose");
    expect(nextCosmeticInCategory(coral, "glow", levelTwo).glow).toBe(
      DEFAULT_COSMETIC_LOADOUT.glow
    );
    expect(nextCosmeticInCategory(coral, "aura", levelTwo).aura).toBe("aura.none");
  });

  it("resolves cosmetics into existing shader-uniform palette values", () => {
    expect(cosmeticPalette({
      glow: "glow.pearl-gold",
      fin: "fin.astral-edge",
      trail: "trail.royal-current",
      aura: "aura.astral-crown"
    })).toEqual({
      glowColor: 0xffd889,
      glowStrength: 0.32,
      finAccentColor: 0xa7ecff,
      finAccentStrength: 0.78,
      trailNearColor: 0xff9fe6,
      trailFarColor: 0x694dff,
      auraColor: 0xffc9f2,
      auraStrength: 0.48
    });
  });

  it("calculates deterministic bounded Lumen Pearl rewards with a clean-run bonus", () => {
    const clean = calculateRunPearlReward({
      score: 4_500,
      elapsedSec: 30,
      forwardDistance: 1_400,
      nearMisses: 5,
      collisions: 0
    });
    const hit = calculateRunPearlReward({
      score: 4_500,
      elapsedSec: 30,
      forwardDistance: 1_400,
      nearMisses: 5,
      collisions: 1
    });
    expect(clean.cleanRunPearls).toBe(8);
    expect(clean.pearls - hit.pearls).toBe(8);
    expect(clean.xp).toBeLessThan(clean.pearls);
    expect(calculateRunPearlReward({
      score: Number.MAX_SAFE_INTEGER,
      elapsedSec: 999,
      forwardDistance: Number.MAX_SAFE_INTEGER,
      nearMisses: Number.MAX_SAFE_INTEGER,
      collisions: 0
    }).pearls).toBeLessThanOrEqual(220);
  });

  it("separates Tide availability, Pearl ownership and equipped state", () => {
    const coral = COSMETIC_CATALOG.find((item) => item.id === "glow.coral-rose")!;
    const defaults = sanitizeOwnedCosmetics([]);
    expect(cosmeticAvailability(coral, 0, defaults, { ...DEFAULT_COSMETIC_LOADOUT })).toBe("locked");
    expect(cosmeticAvailability(
      coral,
      tideXpForLevel(2),
      defaults,
      { ...DEFAULT_COSMETIC_LOADOUT }
    )).toBe("available");
    const owned = sanitizeOwnedCosmetics([...defaults, coral.id]);
    expect(cosmeticAvailability(
      coral,
      tideXpForLevel(2),
      owned,
      { ...DEFAULT_COSMETIC_LOADOUT }
    )).toBe("owned");
    const equipped = loadoutWithCosmetic({ ...DEFAULT_COSMETIC_LOADOUT }, coral.id, owned);
    expect(cosmeticAvailability(coral, tideXpForLevel(2), owned, equipped)).toBe("equipped");
    expect(purchasedCosmeticCost([coral.id, coral.id])).toBe(coral.pricePearls);
  });

  it("grandfathers every previously auto-unlocked cosmetic during Version 36 migration", () => {
    const owned = grandfatheredCosmeticsForXp(tideXpForLevel(4));
    expect(owned).toContain("glow.coral-rose");
    expect(owned).toContain("trail.star-ribbon");
    expect(owned).not.toContain("fin.coral-bloom");
  });
});
