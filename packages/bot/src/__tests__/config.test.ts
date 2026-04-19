import deployedContracts from "@curyo/contracts/deployedContracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const chain31337 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[31337];
const ORIGINAL_ENV = { ...process.env };
const VALID_ENV = {
  RPC_URL: "https://rpc.example.com",
  CHAIN_ID: "31337",
  PONDER_URL: "https://ponder.example.com",
  CREP_TOKEN_ADDRESS: chain31337?.CuryoReputation?.address ?? "0x1111111111111111111111111111111111111111",
  CONTENT_REGISTRY_ADDRESS: chain31337?.ContentRegistry?.address ?? "0x2222222222222222222222222222222222222222",
  QUESTION_REWARD_POOL_ESCROW_ADDRESS:
    chain31337?.QuestionRewardPoolEscrow?.address ?? "0x7777777777777777777777777777777777777777",
  VOTING_ENGINE_ADDRESS: chain31337?.RoundVotingEngine?.address ?? "0x3333333333333333333333333333333333333333",
  ROUND_REWARD_DISTRIBUTOR_ADDRESS:
    chain31337?.RoundRewardDistributor?.address ?? "0x6666666666666666666666666666666666666666",
  VOTER_ID_NFT_ADDRESS: chain31337?.VoterIdNFT?.address ?? "0x4444444444444444444444444444444444444444",
  CATEGORY_REGISTRY_ADDRESS: chain31337?.CategoryRegistry?.address ?? "0x5555555555555555555555555555555555555555",
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

  it("uses the default submit bounty terms when no overrides are present", async () => {
    const { config } = await loadBotConfig();

    expect(config.submitRewardRequiredVoters).toBe(3);
    expect(config.submitRewardRequiredSettledRounds).toBe(1);
    expect(config.submitRewardPoolExpiresAt).toBe(0n);
    expect(config.submitRoundConfig).toEqual({
      epochDuration: undefined,
      maxDuration: undefined,
      minVoters: undefined,
      maxVoters: undefined,
    });
    expect(config.x402.apiUrl).toBeUndefined();
  });

  it("parses numeric bot config values strictly", async () => {
    const { config } = await loadBotConfig({
      VOTE_STAKE: "2500000",
      VOTE_THRESHOLD: "3.5",
      MAX_VOTES_PER_RUN: "12",
      MAX_SUBMISSIONS_PER_RUN: "7",
      MAX_SUBMISSIONS_PER_CATEGORY: "4",
      SUBMIT_REWARD_REQUIRED_VOTERS: "4",
      SUBMIT_REWARD_REQUIRED_SETTLED_ROUNDS: "2",
      SUBMIT_REWARD_POOL_EXPIRES_AT: "1234567890",
      SUBMIT_ROUND_BLIND_PHASE_SECONDS: "600",
      SUBMIT_ROUND_MAX_DURATION_SECONDS: "7200",
      SUBMIT_ROUND_MIN_VOTERS: "5",
      SUBMIT_ROUND_MAX_VOTERS: "50",
      X402_API_URL: "https://curyo.example/api/x402/questions",
      X402_MAX_PAYMENT_USDC: "1500000",
      THIRDWEB_CLIENT_ID: "thirdweb-client",
      X402_USDC_TOKEN_ADDRESS: "0x8888888888888888888888888888888888888888",
    });

    expect(config.voteStake).toBe(2500000n);
    expect(config.voteThreshold).toBe(3.5);
    expect(config.maxVotesPerRun).toBe(12);
    expect(config.maxSubmissionsPerRun).toBe(7);
    expect(config.maxSubmissionsPerCategory).toBe(4);
    expect(config.submitRewardRequiredVoters).toBe(4);
    expect(config.submitRewardRequiredSettledRounds).toBe(2);
    expect(config.submitRewardPoolExpiresAt).toBe(1234567890n);
    expect(config.submitRoundConfig).toEqual({
      epochDuration: 600n,
      maxDuration: 7_200n,
      minVoters: 5n,
      maxVoters: 50n,
    });
    expect(config.x402).toMatchObject({
      apiUrl: "https://curyo.example/api/x402/questions",
      maxPaymentUsdc: 1_500_000n,
      thirdwebClientId: "thirdweb-client",
      usdcTokenAddress: "0x8888888888888888888888888888888888888888",
    });
  });

  it("rejects malformed numeric bot config values", async () => {
    await expect(
      loadBotConfig({
        VOTE_STAKE: "25.5",
        VOTE_THRESHOLD: "NaN",
        MAX_VOTES_PER_RUN: "0",
        MAX_SUBMISSIONS_PER_RUN: "-1",
        MAX_SUBMISSIONS_PER_CATEGORY: "many",
        SUBMIT_REWARD_REQUIRED_VOTERS: "0",
        SUBMIT_REWARD_REQUIRED_SETTLED_ROUNDS: "0",
        SUBMIT_REWARD_POOL_EXPIRES_AT: "-1",
        SUBMIT_ROUND_BLIND_PHASE_SECONDS: "0",
        SUBMIT_ROUND_MAX_DURATION_SECONDS: "-1",
        SUBMIT_ROUND_MIN_VOTERS: "few",
        SUBMIT_ROUND_MAX_VOTERS: "many",
        X402_MAX_PAYMENT_USDC: "0",
      }),
    ).rejects.toThrow("Invalid bot configuration");

    await expect(
      loadBotConfig({
        VOTE_STAKE: "25.5",
        VOTE_THRESHOLD: "NaN",
        MAX_VOTES_PER_RUN: "0",
        MAX_SUBMISSIONS_PER_RUN: "-1",
        MAX_SUBMISSIONS_PER_CATEGORY: "many",
        SUBMIT_REWARD_REQUIRED_VOTERS: "0",
        SUBMIT_REWARD_REQUIRED_SETTLED_ROUNDS: "0",
        SUBMIT_REWARD_POOL_EXPIRES_AT: "-1",
        SUBMIT_ROUND_BLIND_PHASE_SECONDS: "0",
        SUBMIT_ROUND_MAX_DURATION_SECONDS: "-1",
        SUBMIT_ROUND_MIN_VOTERS: "few",
        SUBMIT_ROUND_MAX_VOTERS: "many",
        X402_MAX_PAYMENT_USDC: "0",
      }),
    ).rejects.toThrow("VOTE_STAKE must be a positive integer");
  });

  it("warns when no source API keys are configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadBotConfig({}, ["YOUTUBE_API_KEY"]);

    expect(warnSpy).toHaveBeenCalledWith(
      "[Bot] WARN: YOUTUBE_API_KEY is not configured — submit and rating sources will return no items",
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

  it("does not require PONDER_URL for submit-only validation", async () => {
    const { validateConfig } = await loadBotConfig(
      {
        SUBMIT_PRIVATE_KEY: `0x${"22".repeat(32)}`,
      },
      ["PONDER_URL"],
    );

    expect(() => validateConfig("submit")).not.toThrow();
  });

  it("requires PONDER_URL for the vote bot role", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as any;
    const botModule = await loadBotConfig({}, ["PONDER_URL"]);

    expect(() => botModule.validateConfig("rate")).toThrow("process.exit:1");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: PONDER_URL is required");
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
        "QUESTION_REWARD_POOL_ESCROW_ADDRESS",
        "VOTING_ENGINE_ADDRESS",
        "ROUND_REWARD_DISTRIBUTOR_ADDRESS",
        "VOTER_ID_NFT_ADDRESS",
        "CATEGORY_REGISTRY_ADDRESS",
      ],
    );

    expect(config.contracts.crepToken).toBe(chain31337.CuryoReputation.address);
    expect(config.contracts.contentRegistry).toBe(chain31337.ContentRegistry.address);
    expect(config.contracts.questionRewardPoolEscrow).toBe(chain31337.QuestionRewardPoolEscrow.address);
    expect(config.contracts.votingEngine).toBe(chain31337.RoundVotingEngine.address);
    expect(config.contracts.roundRewardDistributor).toBe(chain31337.RoundRewardDistributor.address);
    expect(config.contracts.voterIdNFT).toBe(chain31337.VoterIdNFT.address);
    expect(config.contracts.categoryRegistry).toBe(chain31337.CategoryRegistry.address);
  });

  it("ignores stale contract env values in favor of shared deployment artifacts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config } = await loadBotConfig({
      CREP_TOKEN_ADDRESS: "0x1111111111111111111111111111111111111111",
      CONTENT_REGISTRY_ADDRESS: "0x2222222222222222222222222222222222222222",
      QUESTION_REWARD_POOL_ESCROW_ADDRESS: "0x7777777777777777777777777777777777777777",
      VOTING_ENGINE_ADDRESS: "0x3333333333333333333333333333333333333333",
      ROUND_REWARD_DISTRIBUTOR_ADDRESS: "0x6666666666666666666666666666666666666666",
      VOTER_ID_NFT_ADDRESS: "0x4444444444444444444444444444444444444444",
      CATEGORY_REGISTRY_ADDRESS: "0x5555555555555555555555555555555555555555",
    });

    expect(config.contracts.crepToken).toBe(chain31337.CuryoReputation.address);
    expect(config.contracts.contentRegistry).toBe(chain31337.ContentRegistry.address);
    expect(config.contracts.questionRewardPoolEscrow).toBe(chain31337.QuestionRewardPoolEscrow.address);
    expect(config.contracts.votingEngine).toBe(chain31337.RoundVotingEngine.address);
    expect(config.contracts.roundRewardDistributor).toBe(chain31337.RoundRewardDistributor.address);
    expect(config.contracts.voterIdNFT).toBe(chain31337.VoterIdNFT.address);
    expect(config.contracts.categoryRegistry).toBe(chain31337.CategoryRegistry.address);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CREP_TOKEN_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CONTENT_REGISTRY_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring QUESTION_REWARD_POOL_ESCROW_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring VOTING_ENGINE_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring ROUND_REWARD_DISTRIBUTOR_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring VOTER_ID_NFT_ADDRESS"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring CATEGORY_REGISTRY_ADDRESS"));
  });

  it("only requires submit contracts for submit validation on unsupported chains", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as any;
    const botModule = await loadBotConfig(
      {
        CHAIN_ID: "999999",
        SUBMIT_PRIVATE_KEY: `0x${"22".repeat(32)}`,
      },
      [
        "CREP_TOKEN_ADDRESS",
        "CONTENT_REGISTRY_ADDRESS",
        "QUESTION_REWARD_POOL_ESCROW_ADDRESS",
        "VOTING_ENGINE_ADDRESS",
        "VOTER_ID_NFT_ADDRESS",
        "CATEGORY_REGISTRY_ADDRESS",
      ],
    );

    expect(() => botModule.validateConfig("submit")).toThrow("process.exit:1");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: CREP_TOKEN_ADDRESS is required");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: CONTENT_REGISTRY_ADDRESS is required");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: QUESTION_REWARD_POOL_ESCROW_ADDRESS is required");
    expect(errorSpy).not.toHaveBeenCalledWith("[Bot] ERROR: VOTER_ID_NFT_ADDRESS is required");
    expect(errorSpy).not.toHaveBeenCalledWith("[Bot] ERROR: VOTING_ENGINE_ADDRESS is required");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("only requires vote contracts for rate validation on unsupported chains", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as any;
    const botModule = await loadBotConfig(
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
    );

    expect(() => botModule.validateConfig("rate")).toThrow("process.exit:1");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: CREP_TOKEN_ADDRESS is required");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: VOTING_ENGINE_ADDRESS is required");
    expect(errorSpy).toHaveBeenCalledWith("[Bot] ERROR: VOTER_ID_NFT_ADDRESS is required");
    expect(errorSpy).not.toHaveBeenCalledWith("[Bot] ERROR: CONTENT_REGISTRY_ADDRESS is required");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("rejects an invalid vote frontend address", async () => {
    await expect(
      loadBotConfig({
        RATE_FRONTEND_ADDRESS: "not-an-address",
      }),
    ).rejects.toThrow("RATE_FRONTEND_ADDRESS must be a valid address");
  });
});
