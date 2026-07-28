// Seeded pseudo-random number generator (mulberry32).
//
// Why: demos must be reproducible. Same seed -> same org, every run. We never call
// Math.random() anywhere in the engine, so nothing is left to chance on camera.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // Returns a float in [0, 1). This is the only place randomness enters.
  next(): number {
    let a = this.state;
    a = (a + 0x6d2b79f5) | 0;
    this.state = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Convenience wrappers so the engine reads like plain English.
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  // Inclusive on both ends.
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
