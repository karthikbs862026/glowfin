import { describe, expect, it } from "vitest";
import main from "../src/main.ts?raw";
import hud from "../src/render/hud.ts?raw";
import {
  isIntegratedRealmThreeExperience,
  realmHandoffDestination,
} from "../src/realms/handoff";

describe("Version 45 Realm 2 to Realm 3 handoff", () => {
  it("enables Realm 3 persistence for every promoted main route", () => {
    for (const path of ["/", "/index.html", "/game", "/game/", "/game/index.html", "/game-v45-r1/"]) {
      expect(isIntegratedRealmThreeExperience(45, path), path).toBe(true);
    }
    expect(isIntegratedRealmThreeExperience(44, "/game-v44-r1/")).toBe(false);
    expect(isIntegratedRealmThreeExperience(45, "/game-v44-r1/")).toBe(false);
  });

  it("advances only a victorious, unlocked Crystal Trench run", () => {
    const base = {
      crystalTrenchUnlocked: true,
      leviathanGraveyardUnlocked: false,
      crystalTrenchRaceWon: false,
    };
    expect(realmHandoffDestination("kelp-cathedral", base)).toBe("crystal-trench");
    expect(realmHandoffDestination("crystal-trench", base)).toBe("crystal-trench");
    expect(realmHandoffDestination("crystal-trench", {
      ...base,
      leviathanGraveyardUnlocked: true,
    })).toBe("crystal-trench");
    expect(realmHandoffDestination("crystal-trench", {
      ...base,
      leviathanGraveyardUnlocked: true,
      crystalTrenchRaceWon: true,
    })).toBe("leviathan-graveyard");
  });

  it("surfaces the unlock and wires the primary action into Heartlight War", () => {
    expect(hud).toContain("Continue to Leviathan Graveyard");
    expect(hud).toContain("Realm 3 unlocked · Leviathan Graveyard");
    expect(main).toContain('source: "realm-two-complete"');
    expect(main).toContain('startRun("fresh", { realmId: "leviathan-graveyard" })');
    expect(main).toContain("realmRecord.leviathanGraveyardNewlyUnlocked");
  });
});
