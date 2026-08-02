import type { TuningConfig } from "../core/config";
import type { StepEvents } from "../sim/run";

export type GameplayAudioCueType =
  | "near-miss"
  | "multiplier"
  | "collision"
  | "recovery"
  | "run-end";

export interface GameplayAudioCue {
  type: GameplayAudioCueType;
  /** Normalized musical emphasis, never gameplay state. */
  intensity: number;
  /** Stable sequence number used only to vary stereo placement and voicing. */
  sequence: number;
}

export interface AmbientAudioMix {
  bedGain: number;
  currentGain: number;
  shimmerGain: number;
  waterGain: number;
  filterFrequencyHz: number;
  currentFrequencyHz: number;
  shimmerFrequencyHz: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Pure momentum-to-mix mapping. The same normalized momentum that drives
 * speed, glow, trail and camera drives this mix; audio cannot create a second
 * difficulty signal that drifts away from the simulation.
 */
export function ambientMixForState(
  momentumFraction: number,
  lightFraction: number,
  cfg: TuningConfig
): AmbientAudioMix {
  const momentum = clamp01(momentumFraction);
  const light = clamp01(lightFraction);
  const current = smoothstep(
    cfg.audio.currentLayerStartMomentum,
    0.82,
    momentum
  );
  const shimmer = smoothstep(
    cfg.audio.shimmerLayerStartMomentum,
    1,
    momentum
  );
  // Collision dimming must be audible without making the world fall silent.
  const vitality = 0.38 + light * 0.62;
  const ambient = cfg.audio.ambientGain;

  return {
    bedGain: ambient * (0.46 + momentum * 0.12) * vitality,
    currentGain: ambient * 0.38 * current * vitality,
    shimmerGain: ambient * 0.22 * shimmer * vitality,
    waterGain: ambient * (0.11 + current * 0.05) * vitality,
    // Keep the persistent spectrum above the bass roll-off of small phone
    // speakers. The previous 82–175 Hz emphasis was measurable in Chromium,
    // but was effectively inaudible on the owner's physical phones.
    filterFrequencyHz: 1_100 + momentum * 1_700,
    currentFrequencyHz: 220 + momentum * 55,
    shimmerFrequencyHz: 329.63 + momentum * 164.82
  };
}

/**
 * Converts deterministic simulation transitions into semantic sound cues.
 * It owns no Web Audio state, so event timing remains regression-testable in
 * Node and cannot affect replay determinism.
 */
export class GameplayAudioDirector {
  private previousStunSec = 0;
  private previousMultiplier: number;
  private sequence = 0;

  constructor(private readonly cfg: TuningConfig) {
    this.previousMultiplier = cfg.scoring.multiplierStart;
  }

  reset(multiplier = this.cfg.scoring.multiplierStart): void {
    this.previousStunSec = 0;
    this.previousMultiplier = multiplier;
    this.sequence = 0;
  }

  consume(
    events: StepEvents,
    stunRemainingSec: number,
    multiplier: number
  ): GameplayAudioCue[] {
    const cues: GameplayAudioCue[] = [];
    const normalizedMultiplier = clamp01(
      (multiplier - this.cfg.scoring.multiplierStart) /
        Math.max(
          0.001,
          this.cfg.scoring.multiplierCap - this.cfg.scoring.multiplierStart
        )
    );

    if (events.collisions > 0) {
      cues.push(this.cue("collision", 1));
    }

    if (events.nearMisses > 0) {
      cues.push(this.cue("near-miss", 0.62 + normalizedMultiplier * 0.38));

      const previousBand = Math.floor(this.previousMultiplier + 1e-9);
      const currentBand = Math.floor(multiplier + 1e-9);
      if (currentBand >= 2 && currentBand > previousBand) {
        cues.push(this.cue("multiplier", 0.56 + normalizedMultiplier * 0.44));
      }
    }

    if (
      this.previousStunSec > 0 &&
      stunRemainingSec <= 0 &&
      events.collisions === 0 &&
      !events.justEnded
    ) {
      cues.push(this.cue("recovery", 0.7));
    }

    if (events.justEnded) {
      cues.push(this.cue("run-end", 1));
    }

    this.previousStunSec = Math.max(0, stunRemainingSec);
    this.previousMultiplier = multiplier;
    return cues;
  }

  private cue(type: GameplayAudioCueType, intensity: number): GameplayAudioCue {
    this.sequence++;
    return { type, intensity: clamp01(intensity), sequence: this.sequence };
  }
}
