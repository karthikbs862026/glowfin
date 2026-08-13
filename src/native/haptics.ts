/**
 * Presentation-only haptic policy for the Version 39 app wrappers.
 *
 * No haptic call may feed back into simulation, scoring, replay, rewards, or
 * input. The driver is injected so web builds and tests remain deterministic.
 */

export const HAPTICS_PREFERENCE_STORAGE_ID = "glowfin.haptics.v1";

export type HapticCue =
  | "tutorial-step"
  | "near-miss"
  | "collision"
  | "lumen-mote"
  | "lumen-chain"
  | "purchase"
  | "milestone"
  | "threat-pulse"
  | "minion-hit"
  | "minion-defeat"
  | "lumen-bloom"
  | "current-break"
  | "boss-regenerate"
  | "vault-charge"
  | "vault-break"
  | "auralis-arrival"
  | "grand-blast"
  | "moon-seal"
  | "equip"
  | "setting";

export type HapticImpactStyle = "LIGHT" | "MEDIUM" | "HEAVY";
export type HapticNotificationType = "SUCCESS" | "WARNING" | "ERROR";

export interface HapticDriver {
  impact(style: HapticImpactStyle): Promise<void>;
  notification(type: HapticNotificationType): Promise<void>;
}

export interface HapticPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class HapticPreferenceRepository {
  private enabled = true;

  constructor(private readonly storage: HapticPreferenceStorage) {}

  load(): boolean {
    try {
      const stored = this.storage.getItem(HAPTICS_PREFERENCE_STORAGE_ID);
      if (stored === "off") this.enabled = false;
      if (stored === "on") this.enabled = true;
    } catch {
      // Native private-storage failures must not block the game shell.
    }
    return this.enabled;
  }

  setEnabled(enabled: boolean): boolean {
    this.enabled = enabled;
    try {
      this.storage.setItem(HAPTICS_PREFERENCE_STORAGE_ID, enabled ? "on" : "off");
    } catch {
      // The in-memory setting remains valid for the current process.
    }
    return this.enabled;
  }

  toggle(): boolean {
    return this.setEnabled(!this.enabled);
  }
}

interface HapticDirectorOptions {
  enabled: boolean;
  driver: HapticDriver | null;
  now?: () => number;
}

const CUE_COOLDOWN_MS: Record<HapticCue, number> = {
  "tutorial-step": 180,
  "near-miss": 650,
  collision: 350,
  "lumen-mote": 110,
  "lumen-chain": 280,
  purchase: 500,
  milestone: 800,
  "threat-pulse": 520,
  "minion-hit": 180,
  "minion-defeat": 420,
  "lumen-bloom": 380,
  "current-break": 240,
  "boss-regenerate": 700,
  "vault-charge": 800,
  "vault-break": 1_000,
  "auralis-arrival": 900,
  "grand-blast": 1_200,
  "moon-seal": 900,
  equip: 220,
  setting: 180
};

/**
 * Fire-and-forget haptics with per-cue throttling. Native plugin failure is
 * deliberately contained; a missing motor can never interrupt a frame.
 */
export class HapticDirector {
  private enabled: boolean;
  private active = true;
  private readonly lastCueAt = new Map<HapticCue, number>();
  private readonly now: () => number;

  constructor(private readonly options: HapticDirectorOptions) {
    this.enabled = options.enabled;
    this.now = options.now ?? (() => performance.now());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  play(cue: HapticCue): boolean {
    if (!this.enabled || !this.active || !this.options.driver) return false;
    const now = this.now();
    const previous = this.lastCueAt.get(cue) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < CUE_COOLDOWN_MS[cue]) return false;
    this.lastCueAt.set(cue, now);
    void this.dispatch(cue).catch(() => {
      // Capacitor resolves calls on hardware without a haptic motor, but any
      // unexpected bridge rejection is also presentation-only and contained.
    });
    return true;
  }

  private dispatch(cue: HapticCue): Promise<void> {
    const driver = this.options.driver;
    if (!driver) return Promise.resolve();
    switch (cue) {
      case "collision":
      case "grand-blast":
        return driver.impact("HEAVY");
      case "lumen-chain":
        return driver.impact("MEDIUM");
      case "purchase":
      case "milestone":
      case "minion-defeat":
      case "lumen-bloom":
      case "vault-break":
      case "auralis-arrival":
      case "moon-seal":
        return driver.notification("SUCCESS");
      case "threat-pulse":
      case "boss-regenerate":
      case "vault-charge":
        return driver.impact("MEDIUM");
      case "current-break":
      case "minion-hit":
      case "lumen-mote":
      case "tutorial-step":
      case "near-miss":
      case "equip":
      case "setting":
        return driver.impact("LIGHT");
    }
  }
}
