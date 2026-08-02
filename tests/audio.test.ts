import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import {
  GameplayAudioDirector,
  ambientMixForState
} from "../src/audio/audioDirector";
import type { StepEvents } from "../src/sim/run";

const noEvents = (): StepEvents => ({
  nearMisses: 0,
  collisions: 0,
  justEnded: false
});

describe("momentum-layered ambience", () => {
  it("keeps a calm audible bed at zero momentum", () => {
    const mix = ambientMixForState(0, 1, tuning);
    expect(mix.bedGain).toBeGreaterThan(0);
    expect(mix.currentGain).toBe(0);
    expect(mix.shimmerGain).toBe(0);
  });

  it("adds current and shimmer only as momentum rises", () => {
    const calm = ambientMixForState(0, 1, tuning);
    const cruise = ambientMixForState(0.65, 1, tuning);
    const max = ambientMixForState(1, 1, tuning);
    expect(cruise.currentGain).toBeGreaterThan(calm.currentGain);
    expect(max.currentGain).toBeGreaterThan(cruise.currentGain);
    expect(max.shimmerGain).toBeGreaterThan(cruise.shimmerGain);
    expect(max.filterFrequencyHz).toBeGreaterThan(calm.filterFrequencyHz);
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
