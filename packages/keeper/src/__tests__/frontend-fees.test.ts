import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ACCOUNT,
  FRONTEND,
  CONTENT_REGISTRY,
  VOTING_ENGINE,
  ROUND_REWARD_DISTRIBUTOR,
  FRONTEND_REGISTRY,
  mockConfig,
  readCurrentRoundIds,
  readRound,
  writeContractAndConfirm,
  getRevertReason,
} = vi.hoisted(() => ({
  ACCOUNT: "0x1111111111111111111111111111111111111111" as const,
  FRONTEND: "0x2222222222222222222222222222222222222222" as const,
  CONTENT_REGISTRY: "0x3333333333333333333333333333333333333333" as const,
  VOTING_ENGINE: "0x4444444444444444444444444444444444444444" as const,
  ROUND_REWARD_DISTRIBUTOR: "0x5555555555555555555555555555555555555555" as const,
  FRONTEND_REGISTRY: "0x6666666666666666666666666666666666666666" as const,
  mockConfig: {
    contracts: {
      contentRegistry: "0x3333333333333333333333333333333333333333" as const,
      votingEngine: "0x4444444444444444444444444444444444444444" as const,
    },
    frontendFees: {
      enabled: true,
      frontendAddress: undefined as `0x${string}` | undefined,
      lookbackRounds: 8,
      withdrawEnabled: true,
      contracts: {
        roundRewardDistributor: "0x5555555555555555555555555555555555555555" as const,
        frontendRegistry: "0x6666666666666666666666666666666666666666" as const,
      },
    },
  },
  readCurrentRoundIds: vi.fn(),
  readRound: vi.fn(),
  writeContractAndConfirm: vi.fn(),
  getRevertReason: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock("../config.js", () => ({
  config: mockConfig,
}));

vi.mock("../contract-reads.js", () => ({
  readCurrentRoundIds,
  readRound,
  RoundState: {
    Open: 0,
    Settled: 1,
    Cancelled: 2,
    Tied: 3,
    RevealFailed: 4,
  },
}));

vi.mock("../keeper.js", () => ({
  writeContractAndConfirm,
}));

vi.mock("../revert-utils.js", () => ({
  getRevertReason,
}));

import { claimConfiguredFrontendFees, resetFrontendFeeSweepStateForTests } from "../frontend-fees.js";

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe("claimConfiguredFrontendFees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFrontendFeeSweepStateForTests();
    mockConfig.frontendFees.enabled = true;
    mockConfig.frontendFees.frontendAddress = undefined;
    mockConfig.frontendFees.lookbackRounds = 8;
    mockConfig.frontendFees.withdrawEnabled = true;
    mockConfig.frontendFees.contracts = {
      roundRewardDistributor: ROUND_REWARD_DISTRIBUTOR,
      frontendRegistry: FRONTEND_REGISTRY,
    };
  });

  it("returns without on-chain work when the feature is disabled", async () => {
    mockConfig.frontendFees.enabled = false;
    const publicClient = {
      readContract: vi.fn(),
    };

    const result = await claimConfiguredFrontendFees(
      publicClient as never,
      {} as never,
      { id: 31337 } as never,
      { address: ACCOUNT } as never,
      makeLogger() as never,
    );

    expect(result).toEqual({
      frontendAddress: ACCOUNT,
      roundsClaimed: 0,
      withdrawals: 0,
      withdrawnAmount: 0n,
    });
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("skips sweeping when the configured frontend is not the keeper wallet", async () => {
    mockConfig.frontendFees.frontendAddress = FRONTEND;
    const logger = makeLogger();
    const publicClient = {
      readContract: vi.fn(),
    };

    const result = await claimConfiguredFrontendFees(
      publicClient as never,
      {} as never,
      { id: 31337 } as never,
      { address: ACCOUNT } as never,
      logger as never,
    );

    expect(result).toEqual({
      frontendAddress: FRONTEND,
      roundsClaimed: 0,
      withdrawals: 0,
      withdrawnAmount: 0n,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping frontend fee sweep because keeper wallet is not the configured frontend operator",
      expect.objectContaining({
        frontendAddress: FRONTEND,
        account: ACCOUNT,
      }),
    );
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("claims settled frontend fees and withdraws accumulated credits", async () => {
    const logger = makeLogger();
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case "nextContentId":
            return 2n;
          case "previewFrontendFee":
            return [15n, 0, ACCOUNT, false] as const;
          case "getAccumulatedFees":
            return 15n;
          default:
            throw new Error(`Unexpected readContract(${functionName})`);
        }
      }),
    };

    readCurrentRoundIds.mockResolvedValue({
      activeRoundId: 0n,
      latestRoundId: 1n,
    });
    readRound.mockResolvedValue({
      state: 1,
    });
    writeContractAndConfirm.mockResolvedValue("0xabc");

    const result = await claimConfiguredFrontendFees(
      publicClient as never,
      {} as never,
      { id: 31337 } as never,
      { address: ACCOUNT } as never,
      logger as never,
    );

    expect(result).toEqual({
      frontendAddress: ACCOUNT,
      roundsClaimed: 1,
      withdrawals: 1,
      withdrawnAmount: 15n,
    });
    expect(writeContractAndConfirm).toHaveBeenNthCalledWith(
      1,
      publicClient,
      {},
      expect.objectContaining({
        address: ROUND_REWARD_DISTRIBUTOR,
        functionName: "claimFrontendFee",
        args: [1n, 1n, ACCOUNT],
      }),
    );
    expect(writeContractAndConfirm).toHaveBeenNthCalledWith(
      2,
      publicClient,
      {},
      expect.objectContaining({
        address: FRONTEND_REGISTRY,
        functionName: "claimFees",
        args: [],
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("backfills older settled rounds outside the recent lookback window", async () => {
    mockConfig.frontendFees.lookbackRounds = 2;
    const logger = makeLogger();
    const publicClient = {
      readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly bigint[] }) => {
        switch (functionName) {
          case "nextContentId":
            return 2n;
          case "previewFrontendFee":
            return args?.[1] === 1n ? ([15n, 0, ACCOUNT, false] as const) : ([0n, 0, ACCOUNT, false] as const);
          case "getAccumulatedFees":
            return 0n;
          default:
            throw new Error(`Unexpected readContract(${functionName})`);
        }
      }),
    };

    readCurrentRoundIds.mockResolvedValue({
      activeRoundId: 0n,
      latestRoundId: 5n,
    });
    readRound.mockImplementation(async (_publicClient: unknown, _engine: unknown, _contentId: bigint, roundId: bigint) => ({
      state: roundId === 1n ? 1 : 0,
    }));
    writeContractAndConfirm.mockResolvedValue("0xabc");

    const result = await claimConfiguredFrontendFees(
      publicClient as never,
      {} as never,
      { id: 31337 } as never,
      { address: ACCOUNT } as never,
      logger as never,
    );

    expect(result.roundsClaimed).toBe(1);
    expect(writeContractAndConfirm).toHaveBeenCalledWith(
      publicClient,
      {},
      expect.objectContaining({
        address: ROUND_REWARD_DISTRIBUTOR,
        functionName: "claimFrontendFee",
        args: [1n, 1n, ACCOUNT],
      }),
    );
  });
});
