export interface RateLimitEntry {
  timestamps: number[];
}

/**
 * In-memory IP-based sliding-window rate limiter.
 *
 * Limitations (acceptable for single-instance Ponder deployments):
 * - State resets on process restart — brief burst allowed after redeploy.
 * - Cannot be shared across replicas — each instance tracks independently.
 * If Ponder is scaled to multiple instances, replace with a Redis-backed limiter.
 */
export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private lastCleanup: number;

  constructor(
    private readonly limit: number = 120,
    private readonly windowMs: number = 60_000,
    private readonly cleanupIntervalMs: number = 60_000,
  ) {
    this.lastCleanup = Date.now();
  }

  check(ip: string, now = Date.now()): { allowed: boolean; retryAfter?: number } {
    this.maybeCleanup(now);

    const cutoff = now - this.windowMs;
    let entry = this.store.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(ip, entry);
    }

    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= this.limit) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    entry.timestamps.push(now);
    return { allowed: true };
  }

  cleanup(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      if (entry.timestamps.length === 0) this.store.delete(key);
    }
    this.lastCleanup = now;
  }

  get size(): number {
    return this.store.size;
  }

  private maybeCleanup(now: number): void {
    if (now - this.lastCleanup >= this.cleanupIntervalMs) {
      this.cleanup(now);
    }
  }
}
