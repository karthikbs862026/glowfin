/**
 * Seeded, deterministic pseudo-random number generator (mulberry32).
 *
 * Part 2.5 requires seeded generation so any run reproduces exactly from its
 * seed. Part 6.4/8.2 require deterministic replay. Math.random() cannot do
 * either — it has no seed and no inspectable state.
 *
 * State is a single uint32, so a run's RNG position can be snapshotted and
 * restored cheaply (useful for frame-step debugging and replay scrubbing,
 * Part 6.10).
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) {
      throw new Error(`SeededRandom: seed must be a finite number, got ${seed}`);
    }
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Next float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Next integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Uniformly pick one element. Throws on empty input rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("SeededRandom.pick: cannot pick from an empty array");
    }
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) {
      throw new Error("SeededRandom.pick: index out of range");
    }
    return item;
  }

  /** Snapshot current position, for replay/debug scrubbing. */
  getState(): number {
    return this.state;
  }

  /** Restore a previously snapshotted position. */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}

/**
 * Generate a seed for a fresh run. Uses Math.random deliberately — this is the
 * one place non-determinism belongs, because every run needs a *different*
 * seed. Once chosen, everything downstream is fully deterministic from it.
 */
export function generateSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
