/**
 * Accessibility preferences and immutable leaderboard classification.
 *
 * Reduced motion is presentation-only and therefore remains eligible for the
 * standard board. Reduced-travel steering changes the input mapping, so runs
 * started with it are separated into the assisted division. A run snapshots
 * this classification at start; changing a preference between runs cannot
 * rewrite the competitive truth of a completed replay.
 */

export const ACCESS_PREFERENCES_VERSION = 2 as const;
export const ACCESS_PREFERENCES_KEY = "glowfin.access.v2";
export const LEGACY_ACCESS_PREFERENCES_KEY = "glowfin.access.v1";
export const REDUCED_TRAVEL_SENSITIVITY_MULTIPLIER = 1.35;

export type MotorAssistMode = "standard" | "reduced-travel";
export type LeaderboardDivision = "standard" | "assisted";

export interface AccessPreferencesV2 {
  schemaVersion: typeof ACCESS_PREFERENCES_VERSION;
  motorAssist: MotorAssistMode;
  reducedMotion: boolean;
  highContrast: boolean;
}

interface LegacyAccessPreferencesV1 {
  schemaVersion: 1;
  motorAssist: MotorAssistMode;
  reducedMotion: boolean;
}

export interface RunAccessClassificationV1 {
  schemaVersion: 1;
  division: LeaderboardDivision;
  leaderboardEligible: true;
  motorAssist: MotorAssistMode;
  reducedMotion: boolean;
  reasons: string[];
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultAccessPreferences(
  reducedMotion = typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast = typeof matchMedia === "function" && (
    matchMedia("(prefers-contrast: more)").matches ||
    matchMedia("(forced-colors: active)").matches
  )
): AccessPreferencesV2 {
  return {
    schemaVersion: ACCESS_PREFERENCES_VERSION,
    motorAssist: "standard",
    reducedMotion,
    highContrast
  };
}

export function isAccessPreferences(value: unknown): value is AccessPreferencesV2 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AccessPreferencesV2>;
  return (
    candidate.schemaVersion === ACCESS_PREFERENCES_VERSION &&
    (candidate.motorAssist === "standard" || candidate.motorAssist === "reduced-travel") &&
    typeof candidate.reducedMotion === "boolean" &&
    typeof candidate.highContrast === "boolean"
  );
}

function isLegacyAccessPreferences(value: unknown): value is LegacyAccessPreferencesV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyAccessPreferencesV1>;
  return (
    candidate.schemaVersion === 1 &&
    (candidate.motorAssist === "standard" || candidate.motorAssist === "reduced-travel") &&
    typeof candidate.reducedMotion === "boolean"
  );
}

export function isRunAccessClassification(
  value: unknown
): value is RunAccessClassificationV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RunAccessClassificationV1>;
  return (
    candidate.schemaVersion === 1 &&
    (candidate.division === "standard" || candidate.division === "assisted") &&
    candidate.leaderboardEligible === true &&
    (candidate.motorAssist === "standard" || candidate.motorAssist === "reduced-travel") &&
    typeof candidate.reducedMotion === "boolean" &&
    Array.isArray(candidate.reasons) &&
    candidate.reasons.length <= 4 &&
    candidate.reasons.every((reason) => typeof reason === "string" && reason.length <= 48) &&
    candidate.division === (
      candidate.motorAssist === "reduced-travel" ? "assisted" : "standard"
    )
  );
}

export function classifyRunAccess(
  preferences: AccessPreferencesV2
): RunAccessClassificationV1 {
  const motorAssist = preferences.motorAssist;
  const reducedMotion = preferences.reducedMotion;
  const reasons: string[] = [];
  if (motorAssist === "reduced-travel") reasons.push("reduced-travel-steering");
  if (reducedMotion) reasons.push("reduced-motion-presentation");
  return {
    schemaVersion: 1,
    division: motorAssist === "reduced-travel" ? "assisted" : "standard",
    leaderboardEligible: true,
    motorAssist,
    reducedMotion,
    reasons
  };
}

export function steeringSensitivityMultiplier(preferences: AccessPreferencesV2): number {
  return preferences.motorAssist === "reduced-travel"
    ? REDUCED_TRAVEL_SENSITIVITY_MULTIPLIER
    : 1;
}

export class AccessPreferenceRepository {
  private current: AccessPreferencesV2;

  constructor(
    private readonly storage: PreferenceStorage,
    reducedMotionDefault?: boolean,
    highContrastDefault?: boolean
  ) {
    this.current = defaultAccessPreferences(reducedMotionDefault, highContrastDefault);
  }

  load(): AccessPreferencesV2 {
    try {
      const encoded = this.storage.getItem(ACCESS_PREFERENCES_KEY);
      let loaded = false;
      if (encoded && encoded.length <= 512) {
        try {
          const parsed = JSON.parse(encoded) as unknown;
          if (isAccessPreferences(parsed)) {
            this.current = { ...parsed };
            loaded = true;
          }
        } catch {
          // Fall through to the intact Version 34 preference when available.
        }
      }
      if (!loaded) {
        const legacyEncoded = this.storage.getItem(LEGACY_ACCESS_PREFERENCES_KEY);
        if (legacyEncoded && legacyEncoded.length <= 512) {
          try {
            const legacy = JSON.parse(legacyEncoded) as unknown;
            if (isLegacyAccessPreferences(legacy)) {
              this.current = {
                schemaVersion: ACCESS_PREFERENCES_VERSION,
                motorAssist: legacy.motorAssist,
                reducedMotion: legacy.reducedMotion,
                highContrast: this.current.highContrast
              };
              this.persist();
            }
          } catch {
            // Malformed access data never blocks play.
          }
        }
      }
    } catch {
      // Private browsing and embedded hosts may deny storage. The in-memory
      // preference remains usable without blocking play.
    }
    return this.snapshot();
  }

  toggleMotorAssist(): AccessPreferencesV2 {
    this.current = {
      ...this.current,
      motorAssist: this.current.motorAssist === "standard"
        ? "reduced-travel"
        : "standard"
    };
    this.persist();
    return this.snapshot();
  }

  setReducedMotion(enabled: boolean): AccessPreferencesV2 {
    this.current = { ...this.current, reducedMotion: enabled };
    this.persist();
    return this.snapshot();
  }

  toggleReducedMotion(): AccessPreferencesV2 {
    return this.setReducedMotion(!this.current.reducedMotion);
  }

  setHighContrast(enabled: boolean): AccessPreferencesV2 {
    this.current = { ...this.current, highContrast: enabled };
    this.persist();
    return this.snapshot();
  }

  toggleHighContrast(): AccessPreferencesV2 {
    return this.setHighContrast(!this.current.highContrast);
  }

  snapshot(): AccessPreferencesV2 {
    return { ...this.current };
  }

  private persist(): void {
    try {
      this.storage.setItem(ACCESS_PREFERENCES_KEY, JSON.stringify(this.current));
    } catch {
      // Keep the active in-memory preference when storage is unavailable.
    }
  }
}
