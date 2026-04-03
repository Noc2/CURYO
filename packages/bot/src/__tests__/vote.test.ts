import { ProtocolConfigAbi } from "@curyo/contracts/abis";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9999999999999999999999999999999999999999" as const;
const ENGINE_ADDRESS = "0x3333333333333333333333333333333333333333" as const;
const PROTOCOL_CONFIG_ADDRESS = "0x7777777777777777777777777777777777777777" as const;
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const COMMIT_HASH = `0x${"aa".repeat(32)}` as const;
const CIPHERTEXT = `0x${"bb".repeat(16)}` as const;
const DRAND_CHAIN_HASH = `0x${"cc".repeat(32)}` as const;

type VoteCommandOptions = {
  lastVoteError?: Error;
};

async function loadVoteCommand(options: VoteCommandOptions = {}) {
  vi.resetModules();

  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "hasVoterId":
        return true;
      case "balanceOf":
        return 10_000_000n;
      case "lastVoteTimestamp":
        if (options.lastVoteError) {
          throw options.lastVoteError;
        }
        return 0n;
      case "protocolConfig":
        return PROTOCOL_CONFIG_ADDRESS;
      case "config":
        return [1_200n, 172_800n, 3n, 1_000n] as const;
      default:
        throw new Error(`Unexpected readContract: ${functionName}`);
    }
  });
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });
  const writeContract = vi
    .fn()
    .mockResolvedValueOnce("0xapprove")
    .mockResolvedValueOnce("0xvote");
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const getScore = vi.fn().mockResolvedValue(8.5);

  vi.doMock("node:crypto", () => ({
    randomBytes: vi.fn(() => Buffer.alloc(32, 0x11)),
  }));
  vi.doMock("@curyo/contracts/voting", () => ({
    createTlockVoteCommit: vi.fn().mockResolvedValue({
      ciphertext: CIPHERTEXT,
      commitHash: COMMIT_HASH,
      targetRound: 123n,
      drandChainHash: DRAND_CHAIN_HASH,
    }),
  }));
  vi.doMock("../client.js", () => ({
    getAccount: vi.fn(() => ({ address: ADDRESS })),
    getWalletClient: vi.fn(() => ({ writeContract })),
    publicClient: {
      readContract,
      waitForTransactionReceipt,
    },
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
      rateBot: { privateKey: PRIVATE_KEY },
      voteStake: 1_000_000n,
      voteThreshold: 5,
      maxVotesPerRun: 1,
      contracts: {
        votingEngine: ENGINE_ADDRESS,
      },
      voteFrontendAddress: undefined,
    },
    log,
  }));
  vi.doMock("../ponder.js", () => ({
    ponder: {
      isAvailable: vi.fn().mockResolvedValue(true),
      getContent: vi.fn().mockResolvedValue({
        items: [
          {
            id: "42",
            submitter: "0x1234567890123456789012345678901234567890",
            url: "https://example.com/content",
          },
        ],
      }),
    },
  }));
  vi.doMock("../strategies/index.js", () => ({
    getStrategy: vi.fn(() => ({
      name: "mock-strategy",
      getScore,
    })),
  }));

  const voteModule = await import("../commands/vote.js");
  return {
    ...voteModule,
    mocks: {
      getScore,
      log,
      readContract,
      waitForTransactionReceipt,
      writeContract,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runVote", () => {
  it("reads epoch duration from protocol config instead of the voting engine ABI", async () => {
    const voteCommand = await loadVoteCommand();

    await voteCommand.runVote();

    expect(voteCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ENGINE_ADDRESS,
        functionName: "protocolConfig",
        args: [],
      }),
    );
    expect(voteCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PROTOCOL_CONFIG_ADDRESS,
        abi: ProtocolConfigAbi,
        functionName: "config",
        args: [],
      }),
    );
    expect(voteCommand.mocks.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        address: ENGINE_ADDRESS,
        functionName: "config",
      }),
    );
    expect(voteCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "commitVote",
        args: [42n, 123n, DRAND_CHAIN_HASH, COMMIT_HASH, CIPHERTEXT, 1_000_000n, expect.any(String)],
      }),
    );
  });

  it("warns when a vote-history read fails before skipping the content", async () => {
    const voteCommand = await loadVoteCommand({
      lastVoteError: new Error("history unavailable"),
    });

    await voteCommand.runVote();

    expect(voteCommand.mocks.log.warn).toHaveBeenCalledWith(
      "Skipping content #42 (failed to read vote history: history unavailable)",
    );
    expect(voteCommand.mocks.writeContract).not.toHaveBeenCalled();
  });
});
