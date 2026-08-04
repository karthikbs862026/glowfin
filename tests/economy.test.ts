import { describe, expect, it } from "vitest";
import {
  ProgressRepository,
  mergeProgress,
  validateProgress,
  type ProgressStorage
} from "../src/persistence/progress";

class MemoryStorage implements ProgressStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function fundedRepository(): ProgressRepository {
  const repository = new ProgressRepository(new MemoryStorage());
  repository.load();
  repository.recordRun({
    score: 90_000,
    elapsedSec: 60,
    forwardDistance: 20_000,
    nearMisses: 30,
    collisions: 0
  }, null, { runId: "economy-funding" });
  return repository;
}

describe("Version 37 Lumen Pearl cosmetic economy", () => {
  it("uses Tide XP for availability, Pearls for purchase and ownership for equip", () => {
    const repository = fundedRepository();
    const before = repository.snapshot();
    expect(before.progression.tideXp).toBeGreaterThanOrEqual(90);
    expect(before.progression.lumenPearls).toBeGreaterThanOrEqual(220);

    const purchase = repository.purchaseCosmetic("glow.coral-rose");
    expect(purchase.status).toBe("purchased");
    expect(purchase.spentPearls).toBe(70);
    expect(purchase.progress.progression.lumenPearls).toBe(
      before.progression.lumenPearls - 70
    );
    expect(purchase.progress.progression.purchasedCosmetics).toEqual(["glow.coral-rose"]);

    const equip = repository.equipCosmetic("glow.coral-rose");
    expect(equip.equipped).toBe(true);
    expect(equip.firstEquip).toBe(true);
    expect(equip.progress.progression.equippedCosmetics.glow).toBe("glow.coral-rose");
    expect(validateProgress(equip.progress)).toBe(true);
  });

  it("never restores spent Pearls when a pre-purchase cloud snapshot is merged", () => {
    const repository = fundedRepository();
    const beforePurchase = repository.snapshot();
    repository.purchaseCosmetic("glow.coral-rose");
    const afterPurchase = repository.snapshot();
    const merged = mergeProgress(afterPurchase, beforePurchase);
    expect(merged.progression.purchasedCosmetics).toEqual(["glow.coral-rose"]);
    expect(merged.progression.lumenPearlsEarned).toBe(
      beforePurchase.progression.lumenPearlsEarned
    );
    expect(merged.progression.lumenPearls).toBe(
      beforePurchase.progression.lumenPearls - 70
    );
    expect(validateProgress(merged)).toBe(true);
  });

  it("rejects Tide-locked and duplicate purchases", () => {
    const repository = fundedRepository();
    expect(repository.purchaseCosmetic("aura.astral-crown").status).toBe("locked");
    repository.purchaseCosmetic("glow.coral-rose");
    expect(repository.purchaseCosmetic("trail.foam-lace").status).toBe("purchased");
    expect(repository.purchaseCosmetic("trail.foam-lace").status).toBe("owned");
  });
});
