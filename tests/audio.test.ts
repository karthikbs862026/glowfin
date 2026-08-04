import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import {
  GameplayAudioDirector,
  ambientMixForState
} from "../src/audio/audioDirector";
import {
  GLOWFIN_SOUNDTRACK_BARS,
  GLOWFIN_SOUNDTRACK_DURATION_SEC,
  GLOWFIN_SOUNDTRACK_SECTIONS,
  createAmbientSamples,
  encodeMonoPcm16Wav
} from "../src/audio/nativeMobileAudio";
import { isPointerActivationTrigger } from "../src/audio/audioEngine";
import type { StepEvents } from "../src/sim/run";

const noEvents = (): StepEvents => ({
  nearMisses: 0,
  collisions: 0,
  encounters: [],
  justEnded: false
});

const soundtrack = createAmbientSamples();

function sampleRms(samples: Float32Array): number {
  return Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) /
      samples.length
  );
}

function sampleBounds(samples: Float32Array): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    min = Math.min(min, sample);
    max = Math.max(max, sample);
  }
  return { min, max };
}

describe("momentum-layered ambience", () => {
  it("keeps subtle musical support at zero momentum", () => {
    const mix = ambientMixForState(0, 1, tuning);
    expect(mix.bedGain).toBeGreaterThan(0);
    expect(mix.currentGain).toBe(0);
    expect(mix.shimmerGain).toBe(0);
    expect(mix.filterFrequencyHz).toBeGreaterThanOrEqual(800);
    expect(tuning.audio.masterGain * mix.bedGain).toBeLessThan(0.04);
  });

  it("adds current and shimmer only as momentum rises", () => {
    const calm = ambientMixForState(0, 1, tuning);
    const cruise = ambientMixForState(0.65, 1, tuning);
    const max = ambientMixForState(1, 1, tuning);
    expect(cruise.currentGain).toBeGreaterThan(calm.currentGain);
    expect(max.currentGain).toBeGreaterThan(cruise.currentGain);
    expect(max.shimmerGain).toBeGreaterThan(cruise.shimmerGain);
    expect(max.filterFrequencyHz).toBeGreaterThan(calm.filterFrequencyHz);
    expect(calm.currentFrequencyHz).toBeGreaterThanOrEqual(200);
    expect(calm.shimmerFrequencyHz).toBeGreaterThanOrEqual(300);
    expect(max.currentFrequencyHz).toBe(calm.currentFrequencyHz);
    expect(max.shimmerFrequencyHz).toBe(calm.shimmerFrequencyHz);
  });

  it("dims after damage without silencing the world", () => {
    const full = ambientMixForState(0.7, 1, tuning);
    const depleted = ambientMixForState(0.7, 0, tuning);
    expect(depleted.bedGain).toBeGreaterThan(0);
    expect(depleted.bedGain).toBeLessThan(full.bedGain);
    expect(depleted.currentGain).toBeLessThan(full.currentGain);
  });

  it("clamps out-of-range presentation inputs safely", () => {
    expect(ambientMixForState(-10, 20, tuning)).toEqual(
      ambientMixForState(0, 1, tuning)
    );
    expect(ambientMixForState(20, -10, tuning)).toEqual(
      ambientMixForState(1, 0, tuning)
    );
  });
});

describe("native mobile media fallback", () => {
  it("uses the activation-triggering pointer phase for each device class", () => {
    expect(isPointerActivationTrigger("pointerdown", "mouse")).toBe(true);
    expect(isPointerActivationTrigger("pointerup", "mouse")).toBe(false);
    expect(isPointerActivationTrigger("pointerdown", "touch")).toBe(false);
    expect(isPointerActivationTrigger("pointerup", "touch")).toBe(true);
    expect(isPointerActivationTrigger("pointerup", "pen")).toBe(true);
  });

  it("encodes a standards-shaped PCM WAV for the phone media pipeline", () => {
    const samples = createAmbientSamples(8_000, 0.1);
    const wav = encodeMonoPcm16Wav(samples, 8_000);
    const bytes = new Uint8Array(wav);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(new DataView(wav).getUint32(24, true)).toBe(8_000);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
  });

  it("keeps the native score materially non-silent without clipping", () => {
    const bounds = sampleBounds(soundtrack);
    expect(sampleRms(soundtrack)).toBeGreaterThan(0.1);
    expect(bounds.max).toBeLessThan(0.95);
    expect(bounds.min).toBeGreaterThan(-0.95);
  });

  it("provides a genuinely long four-movement loop", () => {
    expect(GLOWFIN_SOUNDTRACK_DURATION_SEC).toBeGreaterThanOrEqual(60);
    expect(GLOWFIN_SOUNDTRACK_BARS).toBeGreaterThanOrEqual(32);
    expect(GLOWFIN_SOUNDTRACK_SECTIONS).toBe(4);
    expect(soundtrack.length).toBe(16_000 * GLOWFIN_SOUNDTRACK_DURATION_SEC);
  });

  it("wraps without an audible waveform click", () => {
    const first = soundtrack[0] ?? 0;
    const last = soundtrack[soundtrack.length - 1] ?? 0;
    expect(Math.abs(first - last)).toBeLessThan(0.001);
  });

  it("does not repeat at the rejected four-second cadence", () => {
    const lag = 16_000 * 4;
    let difference = 0;
    for (let index = 0; index < soundtrack.length - lag; index++) {
      difference += Math.abs(
        (soundtrack[index] ?? 0) - (soundtrack[index + lag] ?? 0)
      );
    }
    const meanDifference = difference / (soundtrack.length - lag);
    expect(meanDifference).toBeGreaterThan(0.04);
  });

  it("contains rhythmic attacks and evolving section energy", () => {
    const windowSize = 16_000 / 8;
    const windows: number[] = [];
    for (let start = 0; start < soundtrack.length; start += windowSize) {
      const slice = soundtrack.slice(start, start + windowSize);
      windows.push(sampleRms(slice));
    }
    let onsets = 0;
    for (let index = 1; index < windows.length; index++) {
      if ((windows[index] ?? 0) - (windows[index - 1] ?? 0) > 0.025) {
        onsets++;
      }
    }
    expect(onsets).toBeGreaterThan(80);
    expect(Math.max(...windows) - Math.min(...windows)).toBeGreaterThan(0.25);
  });
});

describe("gameplay audio event director", () => {
  it("maps near misses to one semantic cue", () => {
    const director = new GameplayAudioDirector(tuning);
    const cues = director.consume(
      { ...noEvents(), nearMisses: 1 },
      0,
      1.7
    );
    expect(cues.map((cue) => cue.type)).toEqual(["near-miss"]);
  });

  it("adds a musical milestone when an integer multiplier band is crossed", () => {
    const director = new GameplayAudioDirector(tuning);
    director.consume({ ...noEvents(), nearMisses: 1 }, 0, 1.7);
    const cues = director.consume(
      { ...noEvents(), nearMisses: 1 },
      0,
      2.4
    );
    expect(cues.map((cue) => cue.type)).toEqual(["near-miss", "multiplier"]);
  });

  it("does not repeat a milestone while staying in the same band", () => {
    const director = new GameplayAudioDirector(tuning);
    director.consume({ ...noEvents(), nearMisses: 1 }, 0, 2.1);
    const cues = director.consume(
      { ...noEvents(), nearMisses: 1 },
      0,
      2.8
    );
    expect(cues.map((cue) => cue.type)).toEqual(["near-miss"]);
  });

  it("emits collision immediately and recovery once the stun clears", () => {
    const director = new GameplayAudioDirector(tuning);
    expect(
      director.consume({ ...noEvents(), collisions: 1 }, 0.6, 1).map((cue) => cue.type)
    ).toEqual(["collision"]);
    expect(director.consume(noEvents(), 0.2, 1)).toEqual([]);
    expect(director.consume(noEvents(), 0, 1).map((cue) => cue.type)).toEqual([
      "recovery"
    ]);
    expect(director.consume(noEvents(), 0, 1)).toEqual([]);
  });

  it("emits a distinct run-end cue", () => {
    const director = new GameplayAudioDirector(tuning);
    const cues = director.consume({ ...noEvents(), justEnded: true }, 0, 1);
    expect(cues.map((cue) => cue.type)).toEqual(["run-end"]);
  });

  it("reset prevents stale recovery or milestone state leaking between runs", () => {
    const director = new GameplayAudioDirector(tuning);
    director.consume({ ...noEvents(), collisions: 1 }, 0.6, 3.2);
    director.reset();
    expect(director.consume(noEvents(), 0, 1)).toEqual([]);
  });

  it("keeps every cue intensity normalized", () => {
    const director = new GameplayAudioDirector(tuning);
    const batches = [
      director.consume({ ...noEvents(), nearMisses: 1 }, 0, 8),
      director.consume({ ...noEvents(), collisions: 1 }, 0.6, 8),
      director.consume({ ...noEvents(), justEnded: true }, 0, 8)
    ].flat();
    for (const cue of batches) {
      expect(cue.intensity).toBeGreaterThanOrEqual(0);
      expect(cue.intensity).toBeLessThanOrEqual(1);
    }
  });
});
