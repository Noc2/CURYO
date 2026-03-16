import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const VALID_ENV = {
  RPC_URL: "https://rpc.example.com",
  CHAIN_ID: "11142220",
  PONDER_URL: "https://ponder.example.com",
  CREP_TOKEN_ADDRESS: "0x1111111111111111111111111111111111111111",
  CONTENT_REGISTRY_ADDRESS: "0x2222222222222222222222222222222222222222",
  VOTING_ENGINE_ADDRESS: "0x3333333333333333333333333333333333333333",
  VOTER_ID_NFT_ADDRESS: "0x4444444444444444444444444444444444444444",
  CATEGORY_REGISTRY_ADDRESS: "0x5555555555555555555555555555555555555555",
  RATE_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  YOUTUBE_API_KEY: "youtube-key",
};

async function loadBotConfig(overrides: Record<string, string | undefined> = {}, removals: string[] = []) {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    ...VALID_ENV,
    ...overrides,
  };

  for (const key of removals) {
    delete process.env[key];
  }

  return import("../config.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("bot config", () => {
  it("returns role-specific identity config", async () => {
    const submitKey = `0x${"22".repeat(32)}`;
    const { getIdentityConfig } = await loadBotConfig({
      SUBMIT_PRIVATE_KEY: submitKey,
    });

    expect(getIdentityConfig("submit")).toMatchObject({ privateKey: submitKey });
    expect(getIdentityConfig("rate")).toMatchObject({ privateKey: VALID_ENV.RATE_PRIVATE_KEY });
  });

  it("warns when no source API keys are configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadBotConfig({}, ["TMDB_API_KEY", "YOUTUBE_API_KEY", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "RAWG_API_KEY"]);

    expect(warnSpy).toHaveBeenCalledWith(
      "[Bot] WARN: No keyed content-source API keys configured — public sources still work, but some sources and rating strategies will be unavailable",
    );
  });

  it("validateConfig exits when the selected role has no identity configured", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as any;
    const botModule = await loadBotConfig({}, ["SUBMIT_KEYSTORE_ACCOUNT", "SUBMIT_KEYSTORE_PASSWORD", "SUBMIT_PRIVATE_KEY"]);

    expect(() => botModule.validateConfig("submit")).toThrow("process.exit:1");
    expect(errorSpy).toHaveBeenCalledWith(
      "[Bot] ERROR: SUBMIT_KEYSTORE_ACCOUNT or SUBMIT_PRIVATE_KEY is required",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("rejects localhost service URLs in production", async () => {
    await expect(
      loadBotConfig({
        NODE_ENV: "production",
        RPC_URL: "http://localhost:8545",
      }),
    ).rejects.toThrow("RPC_URL must not point to localhost in production");

    await expect(
      loadBotConfig({
        NODE_ENV: "production",
        PONDER_URL: "http://127.0.0.1:42069",
      }),
    ).rejects.toThrow("PONDER_URL must not point to localhost in production");
  });
});
