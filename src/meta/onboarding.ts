export const GUIDED_TUTORIAL_VERSION = 39 as const;
export const GUIDED_TUTORIAL_KEY = "glowfin.guided-tutorial.version";

export type TutorialStep =
  | "auto-swim"
  | "steer-left"
  | "steer-right"
  | "safe-gate"
  | "near-miss"
  | "recovery"
  | "complete";

export interface TutorialSignal {
  elapsedSec: number;
  steering: number;
  gateCleared: boolean;
  nearMiss: boolean;
  collision: boolean;
}

export interface TutorialPresentation {
  step: TutorialStep;
  eyebrow: string;
  icon: string;
  title: string;
  detail: string;
  progress: number;
}

export interface TutorialStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PRESENTATION: Record<TutorialStep, TutorialPresentation> = {
  "auto-swim": {
    step: "auto-swim",
    eyebrow: "Guided Dive · 1/6",
    icon: "↑",
    title: "Glowfin swims forward",
    detail: "No need to push ahead. Keep one finger on the water and get ready to guide Glowfin.",
    progress: 1 / 6
  },
  "steer-left": {
    step: "steer-left",
    eyebrow: "Guided Dive · 2/6",
    icon: "←",
    title: "Drag left now",
    detail: "Slide one finger left. Glowfin follows your finger while the current keeps moving forward.",
    progress: 2 / 6
  },
  "steer-right": {
    step: "steer-right",
    eyebrow: "Guided Dive · 3/6",
    icon: "→",
    title: "Now drag right",
    detail: "Slide the same finger right. Small, smooth movements are easier than fast swipes.",
    progress: 3 / 6
  },
  "safe-gate": {
    step: "safe-gate",
    eyebrow: "Guided Dive · 4/6",
    icon: "◇",
    title: "Aim through cyan",
    detail: "Cyan openings are safe. Centre Glowfin inside the glow and let the current carry you through.",
    progress: 4 / 6
  },
  "near-miss": {
    step: "near-miss",
    eyebrow: "Guided Dive · 5/6",
    icon: "×1.35",
    title: "Close passes score more",
    detail: "Skim a cyan edge—or take the narrow rose Moonflash route—to raise your reward. Wide cyan is always safer.",
    progress: 5 / 6
  },
  recovery: {
    step: "recovery",
    eyebrow: "Guided Dive · 6/6",
    icon: "↻",
    title: "A bump is not game over",
    detail: "A collision dims Light and slows Flow. Keep steering safely while both rebuild.",
    progress: 1
  },
  complete: {
    step: "complete",
    eyebrow: "Guided Dive complete",
    icon: "✓",
    title: "You are ready",
    detail: "Follow cyan, choose rose only when confident, protect Light and build the brightest Moonwake you can.",
    progress: 1
  }
};

export function tutorialPresentation(step: TutorialStep): TutorialPresentation {
  return { ...PRESENTATION[step] };
}

/**
 * Device-local version stamp for the wrapper tutorial. A new tutorial version
 * is deliberately shown once even when an older save was migrated as a
 * returning player. It contains no identity or gameplay data.
 */
export class GuidedTutorialRepository {
  constructor(private readonly storage: TutorialStorage) {}

  completedVersion(): number {
    try {
      const value = Number(this.storage.getItem(GUIDED_TUTORIAL_KEY));
      return Number.isInteger(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  isCurrentComplete(): boolean {
    return this.completedVersion() >= GUIDED_TUTORIAL_VERSION;
  }

  completeCurrent(): void {
    try {
      this.storage.setItem(GUIDED_TUTORIAL_KEY, String(GUIDED_TUTORIAL_VERSION));
    } catch {
      // Storage can be unavailable in hardened browser modes. The tutorial
      // still completes for the current session and is safe to offer again.
    }
  }
}

/**
 * A short learn-by-doing sequence. Every action advances immediately and each
 * step has a conservative relative timeout, so young players, motor-assist
 * players and first-time touch users cannot become trapped.
 */
export class FirstRunTutorial {
  private current: TutorialStep = "auto-swim";
  private stepStartedAtSec = 0;

  get step(): TutorialStep {
    return this.current;
  }

  private advance(next: TutorialStep, elapsedSec: number): TutorialStep {
    this.current = next;
    this.stepStartedAtSec = elapsedSec;
    return this.current;
  }

  update(signal: TutorialSignal): TutorialStep {
    const elapsed = Math.max(0, signal.elapsedSec);
    const stepElapsed = Math.max(0, elapsed - this.stepStartedAtSec);

    switch (this.current) {
      case "auto-swim":
        if (stepElapsed >= 2) return this.advance("steer-left", elapsed);
        break;
      case "steer-left":
        if (signal.steering <= -0.18 || stepElapsed >= 4) {
          return this.advance("steer-right", elapsed);
        }
        break;
      case "steer-right":
        if (signal.steering >= 0.18 || stepElapsed >= 4) {
          return this.advance("safe-gate", elapsed);
        }
        break;
      case "safe-gate":
        if (signal.gateCleared || stepElapsed >= 7) {
          return this.advance("near-miss", elapsed);
        }
        break;
      case "near-miss":
        if (signal.nearMiss || stepElapsed >= 7) {
          return this.advance("recovery", elapsed);
        }
        break;
      case "recovery":
        if (signal.collision || stepElapsed >= 4) {
          return this.advance("complete", elapsed);
        }
        break;
      case "complete":
        break;
    }
    return this.current;
  }
}
