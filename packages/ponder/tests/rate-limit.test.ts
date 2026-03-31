import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/api/rate-limit.js";

describe("RateLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = new RateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      const { allowed } = limiter.check("1.2.3.4");
      expect(allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    const limiter = new RateLimiter(3, 60_000);
    const now = 100_000;

    limiter.check("1.2.3.4", now);
    limiter.check("1.2.3.4", now + 1);
    limiter.check("1.2.3.4", now + 2);

    const { allowed, retryAfter } = limiter.check("1.2.3.4", now + 3);
    expect(allowed).toBe(false);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("window slides after time passes", () => {
    const limiter = new RateLimiter(2, 1000);
    const now = 100_000;

    limiter.check("1.2.3.4", now);
    limiter.check("1.2.3.4", now + 100);

    expect(limiter.check("1.2.3.4", now + 200).allowed).toBe(false);
    expect(limiter.check("1.2.3.4", now + 1001).allowed).toBe(true);
  });

  it("cleanup removes stale entries", () => {
    const limiter = new RateLimiter(10, 1000);
    const now = 100_000;

    limiter.check("1.2.3.4", now);
    limiter.check("5.6.7.8", now);
    expect(limiter.size).toBe(2);

    limiter.cleanup(now + 2000);
    expect(limiter.size).toBe(0);
  });
});
