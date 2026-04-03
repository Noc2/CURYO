import { ProtocolConfigAbi } from "@curyo/contracts/abis";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9999999999999999999999999999999999999999" as const;
const ENGINE_ADDRESS = "0x3333333333333333333333333333333333333333" as const;
const PROTOCOL_CONFIG_ADDRESS = "0x7777777777777777777777777777777777777777" as const;
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;

type StatusCommandOptions = {
  roundConfig?: readonly [bigint, bigint, bigint, bigint];
  roundConfigError?: Error;
};

async function loadStatusCommand(options: StatusCommandOptions = {}) {
  vi.resetModules();

  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "hasVoterId":
        return true;
      case "balanceOf":
        return 200_000_000n;
      case "protocolConfig":
        return PROTOCOL_CONFIG_ADDRESS;
      case "config":
        if (options.roundConfigError) {
          throw options.roundConfigError;
        }
        return options.roundConfig ?? ([1_200n, 172_800n, 5n, 10n] as const);
      default:
        throw new Error(`Unexpected readContract: ${functionName}`);
    }
  });
  const getBalance = vi.fn().mockResolvedValue(30n * 10n ** 18n);
  const getAccount = vi.fn(() => ({ address: ADDRESS }));
  const isAvailable = vi.fn().mockResolvedValue(true);
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

  vi.doMock("../client.js", () => ({
    publicClient: {
      readContract,
      getBalance,
    },
    getAccount,
  }));
  vi.doMock("../contracts.js", () => ({
    contractConfig: {
      token: { address: "0x1111111111111111111111111111111111111111", abi: [] },
      voterIdNFT: { address: "0x4444444444444444444444444444444444444444", abi: [] },
      votingEngine: { address: ENGINE_ADDRESS, abi: [] },
    },
  }));
  vi.doMock("../config.js", () => ({
    config: {
      rpcUrl: "https://rpc.example.com",
      chainId: 42220,
      submitBot: { privateKey: PRIVATE_KEY },
      rateBot: { privateKey: PRIVATE_KEY },
      ponderUrl: "https://ponder.example.com",
      voteStake: 1_000_000n,
      voteThreshold: 5,
      maxVotesPerRun: 10,
      maxSubmissionsPerRun: 5,
      maxSubmissionsPerCategory: 3,
      githubToken: "github-token",
      tmdbApiKey: "tmdb-key",
      youtubeApiKey: undefined,
      twitchClientId: undefined,
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));
  vi.doMock("../ponder.js", () => ({
    ponder: {
      isAvailable,
    },
  }));

  const statusModule = await import("../commands/status.js");
  return {
    ...statusModule,
    mocks: {
      consoleLog,
      getAccount,
      getBalance,
      isAvailable,
      readContract,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runStatus", () => {
  it("reads the round config from the protocol config contract", async () => {
    const statusCommand = await loadStatusCommand();

    await statusCommand.runStatus();

    expect(statusCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ENGINE_ADDRESS,
        functionName: "protocolConfig",
        args: [],
      }),
    );
    expect(statusCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PROTOCOL_CONFIG_ADDRESS,
        abi: ProtocolConfigAbi,
        functionName: "config",
        args: [],
      }),
    );
    expect(statusCommand.mocks.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        address: ENGINE_ADDRESS,
        functionName: "config",
      }),
    );
    expect(statusCommand.mocks.consoleLog).toHaveBeenCalledWith("=== Round Config ===");
    expect(statusCommand.mocks.consoleLog).toHaveBeenCalledWith("Epoch dur:  20m (tlock tier window)");
    expect(statusCommand.mocks.consoleLog).toHaveBeenCalledWith("GitHub token:    set");
  });

  it("reports round config failures under the correct label", async () => {
    const statusCommand = await loadStatusCommand({
      roundConfigError: new Error("missing config"),
    });

    await statusCommand.runStatus();

    expect(statusCommand.mocks.consoleLog).toHaveBeenCalledWith("Round config: ERROR (missing config)");
  });
});
