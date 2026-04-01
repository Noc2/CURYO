import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  __resetHttpRateLimitStateForTests,
  __setHttpRateLimitStoreFactoryForTests,
  enforceHttpRateLimit,
  HttpRateLimitError,
  HttpRateLimitStoreError,
} from "../lib/http-rate-limit.js";

const rateLimitConfig = {
  enabled: true,
  windowMs: 60_000,
  readRequestsPerWindow: 1,
  writeRequestsPerWindow: 1,
  trustedProxyHeaders: [],
  store: "memory" as const,
  redisUrl: null,
  redisKeyPrefix: "curyo:mcp:ratelimit",
  redisConnectTimeoutMs: 2_000,
};

describe("enforceHttpRateLimit", () => {
  it("limits repeated requests in the same window for the memory store", async () => {
    __resetHttpRateLimitStateForTests();

    const request = {
      method: "POST",
      url: "/mcp",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;

    await enforceHttpRateLimit(request, rateLimitConfig, undefined, "/mcp");
    await expect(enforceHttpRateLimit(request, rateLimitConfig, undefined, "/mcp")).rejects.toBeInstanceOf(
      HttpRateLimitError,
    );
  });

  it("uses the configured rate-limit store implementation", async () => {
    __resetHttpRateLimitStateForTests();
    const increment = vi.fn(async () => ({
      count: 1,
      expiresAt: Date.now() + 60_000,
    }));

    __setHttpRateLimitStoreFactoryForTests(() => ({
      increment,
    }));

    const request = {
      method: "POST",
      url: "/mcp",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;

    await enforceHttpRateLimit(request, rateLimitConfig, undefined, "/mcp");

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith(
      expect.stringMatching(/^curyo:mcp:ratelimit:/),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("surfaces shared rate-limit backend failures", async () => {
    __resetHttpRateLimitStateForTests();

    __setHttpRateLimitStoreFactoryForTests(() => ({
      increment: async () => {
        throw new Error("redis down");
      },
    }));

    const request = {
      method: "POST",
      url: "/mcp",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;

    await expect(enforceHttpRateLimit(request, rateLimitConfig, undefined, "/mcp")).rejects.toBeInstanceOf(
      HttpRateLimitStoreError,
    );
  });
});
