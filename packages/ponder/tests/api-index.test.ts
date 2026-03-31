import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadApp(env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    ...env,
  };

  vi.doMock("../src/api/routes/content-routes.js", () => ({ registerContentRoutes: vi.fn() }));
  vi.doMock("../src/api/routes/data-routes.js", () => ({ registerDataRoutes: vi.fn() }));
  vi.doMock("../src/api/routes/discovery-routes.js", () => ({ registerDiscoveryRoutes: vi.fn() }));
  vi.doMock("../src/api/routes/leaderboard-routes.js", () => ({ registerLeaderboardRoutes: vi.fn() }));

  return import("../src/api/index.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("ponder api bootstrap", () => {
  it("fails closed in production when trusted rate-limit headers are not configured", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: app } = await loadApp({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://app.curyo.xyz",
      RATE_LIMIT_TRUSTED_IP_HEADERS: undefined,
    });

    const response = await app.request("https://ponder.curyo.xyz/content");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "RATE_LIMIT_TRUSTED_IP_HEADERS not configured. Set the env var.",
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("RATE_LIMIT_TRUSTED_IP_HEADERS is required"));
  });

  it("does not block requests when trusted rate-limit headers are configured", async () => {
    const { default: app } = await loadApp({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://app.curyo.xyz",
      RATE_LIMIT_TRUSTED_IP_HEADERS: "x-forwarded-for",
    });

    const response = await app.request("https://ponder.curyo.xyz/content");

    expect(response.status).toBe(404);
  });
});
