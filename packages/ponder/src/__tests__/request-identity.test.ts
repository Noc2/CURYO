import { describe, expect, it } from "vitest";
import { isLoopbackRateLimitIdentifier, resolveRateLimitIdentifier } from "../api/request-identity.js";

function makeHeaderGetter(headers: Record<string, string>) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return (name: string) => normalized[name.toLowerCase()];
}

describe("resolveRateLimitIdentifier", () => {
  it("uses the first forwarded-for hop in development", () => {
    const identifier = resolveRateLimitIdentifier(
      makeHeaderGetter({
        "x-forwarded-for": "198.51.100.10, 10.0.0.2",
      }),
      { nodeEnv: "development" },
    );

    expect(identifier).toBe("ip:198.51.100.10");
  });

  it("uses configured trusted headers in production", () => {
    const previous = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS;
    process.env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for, x-real-ip";

    try {
      const identifier = resolveRateLimitIdentifier(
        makeHeaderGetter({
          "x-forwarded-for": "203.0.113.5, 10.0.0.1",
        }),
        { nodeEnv: "production" },
      );

      expect(identifier).toBe("ip:203.0.113.5");
    } finally {
      if (previous === undefined) {
        delete process.env.RATE_LIMIT_TRUSTED_IP_HEADERS;
      } else {
        process.env.RATE_LIMIT_TRUSTED_IP_HEADERS = previous;
      }
    }
  });

  it("falls back to a stable fingerprint when no trusted IP is available", () => {
    const identifier = resolveRateLimitIdentifier(
      makeHeaderGetter({
        "user-agent": "vitest",
        "accept-language": "en-US",
      }),
      { nodeEnv: "production", requestUrl: "https://ponder.example/content" },
    );

    expect(identifier).toMatch(/^fingerprint:/);
  });
});

describe("isLoopbackRateLimitIdentifier", () => {
  it("recognizes loopback identifiers", () => {
    expect(isLoopbackRateLimitIdentifier("ip:127.0.0.1")).toBe(true);
    expect(isLoopbackRateLimitIdentifier("ip:::1")).toBe(true);
    expect(isLoopbackRateLimitIdentifier("ip:localhost")).toBe(true);
  });

  it("does not treat fingerprint fallbacks as loopback", () => {
    expect(isLoopbackRateLimitIdentifier("fingerprint:abc")).toBe(false);
  });
});
