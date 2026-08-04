import { describe, expect, it } from "vitest";
import { FirstRunTutorial, tutorialPresentation } from "../src/meta/onboarding";

describe("Version 37 learn-by-playing tutorial", () => {
  it("reacts to steering and near misses while staying within the bounded first 24 seconds", () => {
    const tutorial = new FirstRunTutorial();
    expect(tutorial.step).toBe("steer");
    expect(tutorial.update({ elapsedSec: 1, steering: 0.4, nearMiss: false, collision: false })).toBe("light");
    expect(tutorial.update({ elapsedSec: 8, steering: 0, nearMiss: false, collision: false })).toBe("near-miss");
    expect(tutorial.update({ elapsedSec: 11, steering: 0, nearMiss: true, collision: false })).toBe("recovery");
    expect(tutorial.update({ elapsedSec: 20, steering: 0, nearMiss: false, collision: true })).toBe("complete");
  });

  it("uses time fallbacks so an inexperienced player cannot become trapped", () => {
    const tutorial = new FirstRunTutorial();
    expect(tutorial.update({ elapsedSec: 4.9, steering: 0, nearMiss: false, collision: false })).toBe("steer");
    expect(tutorial.update({ elapsedSec: 5, steering: 0, nearMiss: false, collision: false })).toBe("light");
    expect(tutorial.update({ elapsedSec: 8, steering: 0, nearMiss: false, collision: false })).toBe("near-miss");
    expect(tutorial.update({ elapsedSec: 17, steering: 0, nearMiss: false, collision: false })).toBe("recovery");
    expect(tutorial.update({ elapsedSec: 24, steering: 0, nearMiss: false, collision: false })).toBe("complete");
  });

  it("publishes phone-readable teaching copy for every state", () => {
    for (const step of ["steer", "light", "near-miss", "recovery", "complete"] as const) {
      const presentation = tutorialPresentation(step);
      expect(presentation.title.length).toBeGreaterThan(5);
      expect(presentation.detail.length).toBeGreaterThan(30);
      expect(presentation.progress).toBeGreaterThan(0);
    }
  });
});
