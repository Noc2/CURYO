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
  allowance?: bigint;
  roundStateError?: Error;
  currentRoundId?: bigint;
  currentRoundStartTime?: bigint;
  currentRoundState?: number;
  roundConfigSnapshot?: readonly [bigint, bigint, bigint, bigint];
  voterCommitHash?: `0x${string}`;
  commitVoteError?: Error;
};

async function loadVoteCommand(options: VoteCommandOptions = {}) {
  vi.resetModules();

  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "hasVoterId":
        return true;
      case "balanceOf":
        return 10_000_000n;
      case "allowance":
        return options.allowance ?? 0n;
      case "currentRoundId":
        if (options.roundStateError) throw options.roundStateError;
        return options.currentRoundId ?? 0n;
      case "voterCommitHash":
        if (options.roundStateError) throw options.roundStateError;
        return options.voterCommitHash ?? `0x${"00".repeat(32)}`;
      case "protocolConfig":
        return PROTOCOL_CONFIG_ADDRESS;
      case "config":
        return [1_200n, 172_800n, 3n, 1_000n] as const;
      case "roundConfigSnapshot":
        return options.roundConfigSnapshot ?? ([900n, 7_200n, 5n, 50n] as const);
      case "rounds":
        return [options.currentRoundStartTime ?? 1_000n, options.currentRoundState ?? 0] as const;
      case "previewCommitReferenceRatingBps":
        return 5_000;
      default:
        throw new Error(`Unexpected readContract: ${functionName}`);
    }
  });
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });
  const writeContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "approve":
        return "0xapprove";
      case "commitVote":
        if (options.commitVoteError) throw options.commitVoteError;
        return "0xvote";
      default:
        throw new Error(`Unexpected writeContract: ${functionName}`);
    }
  });
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const getScore = vi.fn().mockResolvedValue(8.5);
  const createTlockVoteCommit = vi.fn().mockResolvedValue({
    ciphertext: CIPHERTEXT,
    commitHash: COMMIT_HASH,
    targetRound: 123n,
    drandChainHash: DRAND_CHAIN_HASH,
    roundReferenceRatingBps: 5_000,
  });

  vi.doMock("node:crypto", () => ({
    randomBytes: vi.fn(() => Buffer.alloc(32, 0x11)),
  }));
  vi.doMock("@curyo/contracts/voting", () => ({
    createTlockVoteCommit,
  }));
  vi.doMock("../client.js", () => ({
    getAccount: vi.fn(() => ({ address: ADDRESS })),
    getWalletClient: vi.fn(() => ({ writeContract })),
    publicClient: {
      getBlock: vi.fn().mockResolvedValue({ number: 123n, timestamp: 1_100n }),
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
            roundEpochDuration: 600,
            roundMaxDuration: 7_200,
            roundMinVoters: 5,
            roundMaxVoters: 50,
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
      createTlockVoteCommit,
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
  it("uses the per-question round config when preparing tlock vote commits", async () => {
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
    expect(voteCommand.mocks.createTlockVoteCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        contentId: 42n,
        epochDurationSeconds: 600,
        roundReferenceRatingBps: 5_000,
      }),
      expect.objectContaining({
        now: expect.any(Function),
      }),
    );
    expect(voteCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "commitVote",
        args: [42n, 5_000, 123n, DRAND_CHAIN_HASH, COMMIT_HASH, CIPHERTEXT, 1_000_000n, expect.any(String)],
      }),
    );
  });

  it("uses the current round snapshot when the question already has an open round", async () => {
    const voteCommand = await loadVoteCommand({
      currentRoundId: 7n,
      currentRoundStartTime: 1_000n,
      roundConfigSnapshot: [900n, 7_200n, 5n, 50n],
    });

    await voteCommand.runVote();

    expect(voteCommand.mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "roundConfigSnapshot",
        args: [42n, 7n],
      }),
    );
    expect(voteCommand.mocks.createTlockVoteCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        epochDurationSeconds: 900,
      }),
      expect.objectContaining({
        now: expect.any(Function),
      }),
    );
  });

  it("warns when the current-round vote-state read fails before skipping the content", async () => {
    const voteCommand = await loadVoteCommand({
      roundStateError: new Error("round state unavailable"),
    });

    await voteCommand.runVote();

    expect(voteCommand.mocks.log.warn).toHaveBeenCalledWith(
      "Skipping content #42 (failed to read current round vote state: round state unavailable)",
    );
    expect(voteCommand.mocks.writeContract).not.toHaveBeenCalled();
  });

  it("skips content already committed in the current round", async () => {
    const voteCommand = await loadVoteCommand({
      currentRoundId: 7n,
      voterCommitHash: COMMIT_HASH,
    });

    await voteCommand.runVote();

    expect(voteCommand.mocks.log.debug).toHaveBeenCalledWith(
      "Skipping content #42 (already committed in the current round)",
    );
    expect(voteCommand.mocks.writeContract).not.toHaveBeenCalled();
  });

  it("reuses an existing voting allowance when it is already sufficient", async () => {
    const voteCommand = await loadVoteCommand({
      allowance: 1_000_000n,
    });

    await voteCommand.runVote();

    expect(voteCommand.mocks.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "approve",
      }),
    );
    expect(voteCommand.mocks.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "commitVote",
      }),
    );
  });

  it("treats cooldown reverts as a skip instead of an error", async () => {
    const voteCommand = await loadVoteCommand({
      commitVoteError: new Error("CooldownActive"),
    });

    await voteCommand.runVote();

    expect(voteCommand.mocks.log.debug).toHaveBeenCalledWith(
      "Skipping content #42 (vote cooldown still active)",
    );
    expect(voteCommand.mocks.log.error).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to vote on content #42"),
    );
  });
});
