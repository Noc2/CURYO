import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9999999999999999999999999999999999999999" as const;
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const POOL_ADDRESS = "0x7777777777777777777777777777777777777777" as const;

type ClaimCommandOptions = {
  ponderAvailable?: boolean;
  rateBotConfigured?: boolean;
  submitBotConfigured?: boolean;
  readContract: (params: { functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
  getAllContent?: () => Promise<any[]>;
  getAllRounds?: () => Promise<any[]>;
  getAllVotes?: () => Promise<any[]>;
};

async function loadClaimCommand(options: ClaimCommandOptions) {
  vi.resetModules();

  const writeContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    return `0x${functionName}` as const;
  });
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });
  const getAccount = vi.fn((identity: { privateKey?: string }) => {
    if (!identity.privateKey) {
      throw new Error("No wallet configured");
    }
    return { address: ADDRESS };
  });
  const getWalletClient = vi.fn(() => ({ writeContract }));
  const validateContractKeys = vi.fn().mockResolvedValue(undefined);
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  vi.doMock("../client.js", () => ({
    getAccount,
    getWalletClient,
    publicClient: {
      readContract: vi.fn(options.readContract),
      waitForTransactionReceipt,
    },
    validateContractKeys,
  }));
  vi.doMock("../contracts.js", () => ({
    contractConfig: {
      distributor: { address: "0x3333333333333333333333333333333333333333", abi: [] },
      registry: { address: "0x2222222222222222222222222222222222222222", abi: [] },
      votingEngine: { address: "0x1111111111111111111111111111111111111111", abi: [] },
    },
  }));
  vi.doMock("../config.js", () => ({
    config: {
      ponderUrl: "https://ponder.example.com",
      submitBot: options.submitBotConfigured === false ? {} : { privateKey: PRIVATE_KEY },
      rateBot: options.rateBotConfigured === false ? {} : { privateKey: PRIVATE_KEY },
    },
    getIdentityConfig: (role: "submit" | "rate") =>
      role === "submit"
        ? options.submitBotConfigured === false
          ? {}
          : { privateKey: PRIVATE_KEY }
        : options.rateBotConfigured === false
          ? {}
          : { privateKey: PRIVATE_KEY },
    log,
  }));
  vi.doMock("../ponder.js", () => ({
    ponder: {
      isAvailable: vi.fn().mockResolvedValue(options.ponderAvailable ?? true),
      getAllContent: vi.fn().mockImplementation(async () => (options.getAllContent ? options.getAllContent() : [])),
      getAllRounds: vi.fn().mockImplementation(async () => (options.getAllRounds ? options.getAllRounds() : [])),
      getAllVotes: vi.fn().mockImplementation(async () => (options.getAllVotes ? options.getAllVotes() : [])),
    },
  }));

  const claimModule = await import("../commands/claim.js");
  return {
    ...claimModule,
    mocks: {
      getAccount,
      getWalletClient,
      log,
      validateContractKeys,
      waitForTransactionReceipt,
      writeContract,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runClaim", () => {
  it("does not claim submission-side rewards after submitter upside removal", async () => {
    const claimCommand = await loadClaimCommand({
      rateBotConfigured: false,
      getAllContent: async () => {
        throw new Error("Submission bot claim planning should not read content");
      },
      getAllRounds: async () => {
        throw new Error("Submission bot claim planning should not read rounds");
      },
      readContract: async ({ functionName }) => {
        throw new Error(`Unexpected readContract: ${functionName}`);
      },
    });

    await claimCommand.runClaim();

    expect(claimCommand.mocks.writeContract).not.toHaveBeenCalled();
    expect(claimCommand.mocks.log.info).toHaveBeenCalledWith("No claimable rewards found for submission bot.");
  });

  it("claims rating bot refunds, round payouts, and participation rewards", async () => {
    const claimCommand = await loadClaimCommand({
      submitBotConfigured: false,
      getAllVotes: async () => [
        {
          id: "refund",
          contentId: "1",
          roundId: "1",
          voter: ADDRESS,
          isUp: null,
          stake: "2000000",
          epochIndex: 0,
          revealed: false,
          roundState: 2,
          roundUpWins: null,
        },
        {
          id: "winner",
          contentId: "2",
          roundId: "2",
          voter: ADDRESS,
          isUp: true,
          stake: "4000000",
          epochIndex: 0,
          revealed: true,
          roundState: 1,
          roundUpWins: true,
        },
        {
          id: "loser",
          contentId: "3",
          roundId: "3",
          voter: ADDRESS,
          isUp: false,
          stake: "3000000",
          epochIndex: 1,
          revealed: true,
          roundState: 1,
          roundUpWins: true,
        },
      ],
      readContract: async ({ functionName, args }) => {
        switch (functionName) {
          case "cancelledRoundRefundClaimed":
            return false;
          case "rewardClaimed":
            return false;
          case "roundVoterPool":
            return 8_000_000n;
          case "roundWinningStake":
            return 4_000_000n;
          case "participationRewardClaimed":
            return false;
          case "participationRewardPaid":
            return 0n;
          case "roundParticipationRewardRateBps":
            return 1000n;
          case "roundParticipationRewardOwed":
            return 10_000_000n;
          case "roundParticipationRewardReserved":
            return 10_000_000n;
          case "roundParticipationRewardPool":
            return POOL_ADDRESS;
          default:
            throw new Error(`Unexpected readContract: ${functionName} ${String(args)}`);
        }
      },
    });

    await claimCommand.runClaim();

    expect(claimCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: "claimCancelledRoundRefund",
        args: [1n, 1n],
      }),
    );
    expect(claimCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "claimReward",
        args: [2n, 2n],
      }),
    );
    expect(claimCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        functionName: "claimReward",
        args: [3n, 3n],
      }),
    );
    expect(claimCommand.mocks.writeContract).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        functionName: "claimParticipationReward",
        args: [2n, 2n],
      }),
    );
    expect(claimCommand.mocks.log.info).toHaveBeenCalledWith(
      "Found 4 claim(s) for rating bot worth about 14.55 HREP.",
    );
  });
});
