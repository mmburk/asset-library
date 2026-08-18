/**
 * Deterministic, allocation-free pseudo random number generator.
 *
 * Uses mulberry32: 32-bit state, excellent distribution for procedural
 * generation, and fast enough to call thousands of times during asset builds.
 * The same seed always produces the same asset — essential for reproducible
 * level generation and for networked games where clients must agree.
 */

/** Minimal read-only surface, so consumers can accept any compatible source. */
export interface RandomSource {
  next(): number;
}

/** FNV-1a hash — turns a string label into a stable 32-bit seed. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class Rng implements RandomSource {
  private readonly initialSeed: number;
  private state: number;

  /** Cached second value from the Box-Muller transform. `NaN` means empty. */
  private gaussianSpare = Number.NaN;

  constructor(seed: number | string = 1) {
    this.initialSeed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.state = this.initialSeed;
  }

  /** The seed this generator was constructed with. */
  get seed(): number {
    return this.initialSeed;
  }

  /** Rewinds the generator to its initial seed. */
  reset(): void {
    this.state = this.initialSeed;
    this.gaussianSpare = Number.NaN;
  }

  /** Re-seeds the generator in place, keeping the object identity. */
  reseed(seed: number | string): void {
    this.state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.gaussianSpare = Number.NaN;
  }

  /** Uniform float in `[0, 1)`. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in `[min, max)`. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in `[min, max)`. */
  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }

  /** Uniform integer in `[min, max]`. */
  intInclusive(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** `true` with the given probability (default 50%). */
  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /** Returns `-1` or `1` with equal probability. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Uniform value in `[-magnitude, magnitude)`. */
  spread(magnitude: number): number {
    return (this.next() * 2 - 1) * magnitude;
  }

  /**
   * Picks one element from `items`.
   * @throws if the array is empty — a silent `undefined` would corrupt assets.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Rng.pick: cannot pick from an empty array.');
    }
    return items[this.int(0, items.length)] as T;
  }

  /**
   * Picks an index using per-item weights.
   * @throws if the weights are empty or sum to zero.
   */
  pickWeightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (w > 0) total += w;
    }
    if (total <= 0) {
      throw new Error('Rng.pickWeightedIndex: weights must contain at least one positive value.');
    }
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (w <= 0) continue;
      roll -= w;
      if (roll <= 0) return i;
    }
    return weights.length - 1;
  }

  /** Fisher-Yates shuffle, in place. Does not allocate. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Normally distributed value via Box-Muller, with the spare value cached. */
  gaussian(mean = 0, standardDeviation = 1): number {
    if (!Number.isNaN(this.gaussianSpare)) {
      const spare = this.gaussianSpare;
      this.gaussianSpare = Number.NaN;
      return mean + spare * standardDeviation;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    this.gaussianSpare = v * factor;
    return mean + u * factor * standardDeviation;
  }

  /**
   * Creates an independent generator derived from this one.
   * Useful for giving each asset category its own deterministic stream.
   */
  fork(label: number | string = 0): Rng {
    const offset = typeof label === 'string' ? hashSeed(label) : label >>> 0;
    return new Rng((this.initialSeed ^ Math.imul(offset + 1, 0x9e3779b1)) >>> 0);
  }
}
