import { describe, expect, it } from "vitest";
import {
  FirstRunTutorial,
  GUIDED_TUTORIAL_KEY,
  GUIDED_TUTORIAL_VERSION,
  GuidedTutorialRepository,
  tutorialPresentation
} from "../src/meta/onboarding";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const idle = (elapsedSec: number) => ({
  elapsedSec,
  steering: 0,
  gateCleared: false,
  nearMiss: false,
  collision: false
});

describe("Version 39 guided learn-by-doing tutorial", () => {
  it("teaches automatic movement, separate left/right steering, gates, risk and recovery", () => {
    const tutorial = new FirstRunTutorial();
    expect(tutorial.step).toBe("auto-swim");
    expect(tutorial.update(idle(2))).toBe("steer-left");
    expect(tutorial.update({ ...idle(2.2), steering: -0.4 })).toBe("steer-right");
    expect(tutorial.update({ ...idle(2.4), steering: 0.4 })).toBe("safe-gate");
    expect(tutorial.update({ ...idle(3), gateCleared: true })).toBe("near-miss");
    expect(tutorial.update({ ...idle(4), nearMiss: true })).toBe("recovery");
    expect(tutorial.update({ ...idle(5), collision: true })).toBe("complete");
  });

  it("uses per-step fallbacks so no player can become trapped", () => {
    const tutorial = new FirstRunTutorial();
    expect(tutorial.update(idle(2))).toBe("steer-left");
    expect(tutorial.update(idle(6))).toBe("steer-right");
    expect(tutorial.update(idle(10))).toBe("safe-gate");
    expect(tutorial.update(idle(17))).toBe("near-miss");
    expect(tutorial.update(idle(24))).toBe("recovery");
    expect(tutorial.update(idle(28))).toBe("complete");
  });

  it("publishes concise phone-readable copy and a visual cue for every state", () => {
    for (const step of [
      "auto-swim",
      "steer-left",
      "steer-right",
      "safe-gate",
      "near-miss",
      "recovery",
      "complete"
    ] as const) {
      const presentation = tutorialPresentation(step);
      expect(presentation.title.length).toBeGreaterThan(5);
      expect(presentation.detail.length).toBeGreaterThan(30);
      expect(presentation.icon.length).toBeGreaterThan(0);
      expect(presentation.progress).toBeGreaterThan(0);
    }
  });

  it("requires the Version 39 tutorial once even for an older returning-player save", () => {
    const storage = new MemoryStorage();
    const repository = new GuidedTutorialRepository(storage);
    expect(repository.completedVersion()).toBe(0);
    expect(repository.isCurrentComplete()).toBe(false);

    repository.completeCurrent();
    expect(storage.getItem(GUIDED_TUTORIAL_KEY)).toBe(String(GUIDED_TUTORIAL_VERSION));
    expect(repository.isCurrentComplete()).toBe(true);
  });
});
