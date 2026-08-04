import { describe, expect, it, vi } from "vitest";
import {
  HAPTICS_PREFERENCE_STORAGE_ID,
  HapticDirector,
  HapticPreferenceRepository,
  type HapticDriver,
  type HapticImpactStyle,
  type HapticNotificationType,
  type HapticPreferenceStorage
} from "../src/native/haptics";

class MemoryStorage implements HapticPreferenceStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function driver() {
  const impacts: HapticImpactStyle[] = [];
  const notifications: HapticNotificationType[] = [];
  const implementation: HapticDriver = {
    impact: vi.fn(async (style) => { impacts.push(style); }),
    notification: vi.fn(async (type) => { notifications.push(type); })
  };
  return { implementation, impacts, notifications };
}

describe("Version 39 native haptics", () => {
  it("defaults on, persists an explicit opt-out, and recovers malformed storage", () => {
    const storage = new MemoryStorage();
    const repository = new HapticPreferenceRepository(storage);
    expect(repository.load()).toBe(true);
    expect(repository.toggle()).toBe(false);
    expect(storage.getItem(HAPTICS_PREFERENCE_STORAGE_ID)).toBe("off");
    expect(new HapticPreferenceRepository(storage).load()).toBe(false);
    storage.setItem(HAPTICS_PREFERENCE_STORAGE_ID, "corrupt");
    expect(new HapticPreferenceRepository(storage).load()).toBe(true);
  });

  it("maps gameplay cues to restrained native impact and success patterns", () => {
    const native = driver();
    let now = 1_000;
    const director = new HapticDirector({
      enabled: true,
      driver: native.implementation,
      now: () => now
    });

    expect(director.play("near-miss")).toBe(true);
    now += 700;
    expect(director.play("collision")).toBe(true);
    now += 400;
    expect(director.play("purchase")).toBe(true);
    now += 900;
    expect(director.play("milestone")).toBe(true);

    expect(native.impacts).toEqual(["LIGHT", "HEAVY"]);
    expect(native.notifications).toEqual(["SUCCESS", "SUCCESS"]);
  });

  it("throttles cue bursts and never calls the bridge while disabled or inactive", () => {
    const native = driver();
    let now = 100;
    const director = new HapticDirector({
      enabled: true,
      driver: native.implementation,
      now: () => now
    });

    expect(director.play("near-miss")).toBe(true);
    now += 100;
    expect(director.play("near-miss")).toBe(false);
    director.setActive(false);
    now += 1_000;
    expect(director.play("collision")).toBe(false);
    director.setActive(true);
    director.setEnabled(false);
    expect(director.play("collision")).toBe(false);
    expect(native.impacts).toEqual(["LIGHT"]);
  });

  it("is a silent no-op when the web build has no native driver", () => {
    const director = new HapticDirector({ enabled: true, driver: null });
    expect(director.play("collision")).toBe(false);
    expect(director.play("purchase")).toBe(false);
  });
});
