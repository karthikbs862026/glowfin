import { describe, expect, it } from "vitest";
import {
  ACCESS_PREFERENCES_KEY,
  LEGACY_ACCESS_PREFERENCES_KEY,
  AccessPreferenceRepository,
  classifyRunAccess,
  defaultAccessPreferences,
  steeringSensitivityMultiplier,
  type PreferenceStorage
} from "../src/competitive/assists";
import { SteeringSource } from "../src/input/steering";

class MemoryStorage implements PreferenceStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("Version 35 accessibility classification", () => {
  it("keeps presentation-only reduced motion on the standard board", () => {
    expect(classifyRunAccess({
      ...defaultAccessPreferences(false),
      reducedMotion: true
    })).toEqual({
      schemaVersion: 1,
      division: "standard",
      leaderboardEligible: true,
      motorAssist: "standard",
      reducedMotion: true,
      reasons: ["reduced-motion-presentation"]
    });
  });

  it("separates reduced-travel steering into the assisted division", () => {
    const preferences = {
      ...defaultAccessPreferences(false),
      motorAssist: "reduced-travel" as const
    };
    expect(classifyRunAccess(preferences)).toMatchObject({
      division: "assisted",
      leaderboardEligible: true,
      reasons: ["reduced-travel-steering"]
    });
    expect(steeringSensitivityMultiplier(preferences)).toBe(1.35);
  });

  it("persists a bounded preference and ignores malformed storage", () => {
    const storage = new MemoryStorage();
    const repository = new AccessPreferenceRepository(storage, false);
    expect(repository.load().motorAssist).toBe("standard");
    expect(repository.toggleMotorAssist().motorAssist).toBe("reduced-travel");
    expect(new AccessPreferenceRepository(storage, false).load().motorAssist).toBe("reduced-travel");
    storage.setItem(ACCESS_PREFERENCES_KEY, JSON.stringify({ schemaVersion: 99 }));
    expect(new AccessPreferenceRepository(storage, false).load().motorAssist).toBe("standard");
  });

  it("migrates Version 34 access settings and persists presentation controls", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_ACCESS_PREFERENCES_KEY, JSON.stringify({
      schemaVersion: 1,
      motorAssist: "reduced-travel",
      reducedMotion: true
    }));
    storage.setItem(ACCESS_PREFERENCES_KEY, "{corrupt");
    const repository = new AccessPreferenceRepository(storage, false, false);
    expect(repository.load()).toEqual({
      schemaVersion: 2,
      motorAssist: "reduced-travel",
      reducedMotion: true,
      highContrast: false
    });
    expect(repository.toggleHighContrast().highContrast).toBe(true);
    expect(repository.toggleReducedMotion().reducedMotion).toBe(false);
    expect(new AccessPreferenceRepository(storage, true, false).load()).toMatchObject({
      motorAssist: "reduced-travel",
      reducedMotion: false,
      highContrast: true
    });
  });

  it("reduces physical drag without adding smoothing or exceeding the target range", () => {
    const source = new SteeringSource({ dragRangeFraction: 0.25, sensitivity: 1, deadZone: 0 });
    source.handle({ kind: "down", pointerId: 1, normalizedX: 0.5 });
    source.handle({ kind: "move", pointerId: 1, normalizedX: 0.625 });
    expect(source.getTarget()).toBeCloseTo(0.5);
    source.setSensitivityMultiplier(1.35);
    expect(source.isEngaged()).toBe(false);
    source.handle({ kind: "down", pointerId: 2, normalizedX: 0.5 });
    source.handle({ kind: "move", pointerId: 2, normalizedX: 0.625 });
    expect(source.getTarget()).toBeCloseTo(0.675);
  });
});
