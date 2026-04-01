import deployedContracts from "@curyo/contracts/deployedContracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const chain42220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[42220];
const chain11142220 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[11142220];
const ORIGINAL_ENV = { ...process.env };
const VALID_ENV = {
  RPC_URL: "https://rpc.example.com",
  CHAIN_ID: "11142220",
  PONDER_URL: "https://ponder.example.com",
  CREP_TOKEN_ADDRESS: chain11142220?.CuryoReputation?.address ?? "0x1111111111111111111111111111111111111111",
  CONTENT_REGISTRY_ADDRESS: chain11142220?.ContentRegistry?.address ?? "0x2222222222222222222222222222222222222222",
  VOTING_ENGINE_ADDRESS: chain11142220?.RoundVotingEngine?.address ?? "0x3333333333333333333333333333333333333333",
  VOTER_ID_NFT_ADDRESS: chain11142220?.VoterIdNFT?.address ?? "0x4444444444444444444444444444444444444444",
  CATEGORY_REGISTRY_ADDRESS: chain11142220?.CategoryRegistry?.address ?? "0x5555555555555555555555555555555555555555",
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

  it("loads an optional frontend address for vote attribution", async () => {
    const frontendAddress = "0x7777777777777777777777777777777777777777";
    const { config } = await loadBotConfig({
      RATE_FRONTEND_ADDRESS: frontendAddress,
    });

    expect(config.voteFrontendAddress).toBe(frontendAddress);
  });

  it("parses numeric bot config values strictly", async () => {
    const { config } = await loadBotConfig({
      VOTE_STAKE: "2500000",
      VOTE_THRESHOLD: "3.5",
      MAX_VOTES_PER_RUN: "12",
      MAX_SUBMISSIONS_PER_RUN: "7",
      MAX_SUBMISSIONS_PER_CATEGORY: "4",
    });

    expect(config.voteStake).toBe(2500000n);
    expect(config.voteThreshold).toBe(3.5);
    expect(config.maxVotesPerRun).toBe(12);
    expect(config.maxSubmissionsPerRun).toBe(7);
    expect(config.maxSubmissionsPerCategory).toBe(4);
  });

  it("rejects malformed numeric bot config values", async () => {
    await expect(
      loadBotConfig({
        VOTE_STAKE: "25.5",
        VOTE_THRESHOLD: "NaN",
        MAX_VOTES_PER_RUN: "0",
        MAX_SUBMISSIONS_PER_RUN: "-1",
        MAX_SUBMISSIONS_PER_CATEGORY: "many",
      }),
    ).rejects.toThrow("Invalid bot configuration");

    await expect(
      loadBotConfig({
        VOTE_STAKE: "25.5",
        VOTE_THRESHOLD: "NaN",
        MAX_VOTES_PER_RUN: "0",
        MAX_SUBMISSIONS_PER_RUN: "-1",
        MAX_SUBMISSIONS_PER_CATEGORY: "many",
      }),
    ).rejects.toThrow("VOTE_STAKE must be a positive integer");
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

  it("derives supported-chain contract addresses from shared deployment artifacts", async () => {
    const { config } = await loadBotConfig(
      {},
      [
        "CREP_TOKEN_ADDRESS",
        "CONTENT_REGISTRY_ADDRESS",
        "VOTING_ENGINE_ADDRESS",
        "VOTER_ID_NFT_ADDRESS",
        "CATEGORY_REGISTRY_ADDRESS",
      ],
    );

    expect(config.contracts.crepToken).toBe(chain11142220.CuryoReputation.address);
    expect(config.contracts.contentRegistry).toBe(chain11142220.ContentRegistry.address);
    expect(config.contracts.votingEngine).toBe(chain11142220.RoundVotingEngine.address);
    expect(config.contracts.voterIdNFT).toBe(chain11142220.VoterIdNFT.address);
    expect(config.contracts.categoryRegistry).toBe(chain11142220.CategoryRegistry.address);
  });

  it("derives Celo mainnet contract addresses from shared deployment artifacts", async () => {
    const { config } = await loadBotConfig(
      {
        CHAIN_ID: "42220",
      },
      [
        "CREP_TOKEN_ADDRESS",
        "CONTENT_REGISTRY_ADDRESS",
        "VOTING_ENGINE_ADDRESS",
        "VOTER_ID_NFT_ADDRESS",
        "CATEGORY_REGISTRY_ADDRESS",
      ],
    );

    expect(config.contracts.crepToken).toBe(chain42220.CuryoReputation.address);
    expect(config.contracts.contentRegistry).toBe(chain42220.ContentRegistry.address);
    expect(config.contracts.votingEngine).toBe(chain42220.RoundVotingEngine.address);
    expect(config.contracts.voterIdNFT).toBe(chain42220.VoterIdNFT.address);
    expect(config.contracts.categoryRegistry).toBe(chain42220.CategoryRegistry.address);
  });

  it("ignores stale contract env values in favor of shared deployment artifacts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config } = await loadBotConfig({
      CREP_TOKEN_ADDRESS: "0x1111111111111111111111111111111111111111",
      CONTENT_REGISTRY_ADDRESS: "0x2222222222222222222222222222222222222222",
      VOTING_ENGINE_ADDRESS: "0x3333333333333333333333333333333333333333",
      VOTER_ID_NFT_ADDRESS: "0x4444444444444444444444444444444444444444",
      CATEGORY_REGISTRY_ADDRESS: "0x5555555555555555555555555555555555555555",
    });

    expect(config.contracts.crepToken).toBe(chain11142220.CuryoReputation.address);
    expect(config.contracts.contentRegistry).toBe(chain11142220.ContentRegistry.address);
    expect(config.contracts.votingEngine).toBe(chain11142220.RoundVotingEngine.address);
    expect(config.contracts.voterIdNFT).toBe(chain11142220.VoterIdNFT.address);
    expect(config.contracts.categoryRegistry).toBe(chain11142220.CategoryRegistry.address);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CREP_TOKEN_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CONTENT_REGISTRY_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring VOTING_ENGINE_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring VOTER_ID_NFT_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CATEGORY_REGISTRY_ADDRESS"));
  });

  it("still requires contract env values for unsupported chains", async () => {
    await expect(
      loadBotConfig(
        {
          CHAIN_ID: "999999",
        },
        [
          "CREP_TOKEN_ADDRESS",
          "CONTENT_REGISTRY_ADDRESS",
          "VOTING_ENGINE_ADDRESS",
          "VOTER_ID_NFT_ADDRESS",
          "CATEGORY_REGISTRY_ADDRESS",
        ],
      ),
    ).rejects.toThrow("CREP_TOKEN_ADDRESS is required");
  });

  it("rejects an invalid vote frontend address", async () => {
    await expect(
      loadBotConfig({
        RATE_FRONTEND_ADDRESS: "not-an-address",
      }),
    ).rejects.toThrow("RATE_FRONTEND_ADDRESS must be a valid address");
  });
});
