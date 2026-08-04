export type TutorialStep = "steer" | "light" | "near-miss" | "recovery" | "complete";

export interface TutorialSignal {
  elapsedSec: number;
  steering: number;
  nearMiss: boolean;
  collision: boolean;
}

export interface TutorialPresentation {
  step: TutorialStep;
  eyebrow: string;
  title: string;
  detail: string;
  progress: number;
}

const PRESENTATION: Record<TutorialStep, TutorialPresentation> = {
  steer: {
    step: "steer",
    eyebrow: "Learn the current · 1/4",
    title: "Swipe to steer",
    detail: "Drag left and right. Glowfin follows your finger while the current carries you forward.",
    progress: 0.25
  },
  light: {
    step: "light",
    eyebrow: "Learn the current · 2/4",
    title: "Protect your light",
    detail: "The labelled Light meter is your safety. A hit dims it; clear swimming restores it.",
    progress: 0.5
  },
  "near-miss": {
    step: "near-miss",
    eyebrow: "Learn the current · 3/4",
    title: "Skim the cyan edge",
    detail: "A close, clean pass raises your multiplier. Choose the narrow line only when it feels readable.",
    progress: 0.75
  },
  recovery: {
    step: "recovery",
    eyebrow: "Learn the current · 4/4",
    title: "Recover, don’t restart",
    detail: "Collisions are recoverable. Keep steering while Glowfin’s light and momentum rebuild.",
    progress: 1
  },
  complete: {
    step: "complete",
    eyebrow: "Current learned",
    title: "The Moon-Garden is yours",
    detail: "Thread close passes, protect your light and build the brightest Moonwake you can.",
    progress: 1
  }
};

export function tutorialPresentation(step: TutorialStep): TutorialPresentation {
  return { ...PRESENTATION[step] };
}

/**
 * A bounded learn-by-playing sequence. Player actions advance it immediately,
 * while conservative time fallbacks prevent an inexperienced player from
 * becoming trapped on one instruction.
 */
export class FirstRunTutorial {
  private current: TutorialStep = "steer";

  get step(): TutorialStep {
    return this.current;
  }

  update(signal: TutorialSignal): TutorialStep {
    const elapsed = Math.max(0, signal.elapsedSec);
    if (this.current === "steer" && (Math.abs(signal.steering) >= 0.22 || elapsed >= 5)) {
      this.current = "light";
    }
    if (this.current === "light" && elapsed >= 8) {
      this.current = "near-miss";
    }
    if (this.current === "near-miss" && (signal.nearMiss || elapsed >= 17)) {
      this.current = "recovery";
    }
    if (this.current === "recovery" && elapsed >= 20 && (signal.collision || elapsed >= 24)) {
      this.current = "complete";
    }
    return this.current;
  }
}
