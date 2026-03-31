import { describe, expect, it, vi } from "vitest";
import type { WriteConfig } from "../config.js";
import { CuryoWriteService } from "../signer-service.js";

const baseWriteConfig: WriteConfig = {
  enabled: true,
  rpcUrl: "https://rpc.celo.example",
  chainId: 11142220,
  chainName: "Celo Sepolia",
  maxGasPerTx: 2_000_000,
  defaultIdentityId: null,
  identities: [
    {
      id: "writer",
      label: "Writer",
      privateKey: `0x${"11".repeat(32)}`,
      frontendAddress: "0x7777777777777777777777777777777777777777",
    },
  ],
  contracts: {
    crepToken: "0x1111111111111111111111111111111111111111",
    contentRegistry: "0x2222222222222222222222222222222222222222",
    votingEngine: "0x3333333333333333333333333333333333333333",
    voterIdNFT: "0x4444444444444444444444444444444444444444",
    roundRewardDistributor: "0x5555555555555555555555555555555555555555",
    frontendRegistry: "0x6666666666666666666666666666666666666666",
  },
  policy: {
    maxVoteStake: null,
    allowedSubmissionHosts: [],
    submissionRevealPollIntervalMs: 5,
    submissionRevealTimeoutMs: 1_500,
  },
};

function createService(config: WriteConfig = baseWriteConfig) {
  const service = new CuryoWriteService(config);
  const internals = service as unknown as {
    getContext: ReturnType<typeof vi.fn>;
    readContract: ReturnType<typeof vi.fn>;
    simulateContract: ReturnType<typeof vi.fn>;
    writeContract: ReturnType<typeof vi.fn>;
  };

  return {
    service,
    internals,
  };
}

const mockContext = {
  account: {
    address: "0x7777777777777777777777777777777777777777",
  },
  identity: {
    id: "writer",
    frontendAddress: "0x7777777777777777777777777777777777777777",
  },
} as const;

describe("CuryoWriteService", () => {
  it("rejects vote stakes above the configured policy cap", async () => {
    const { service } = createService({
      ...baseWriteConfig,
      policy: {
        ...baseWriteConfig.policy,
        maxVoteStake: 99n,
      },
    });

    await expect(
      service.vote("writer", {
        contentId: "1",
        direction: "up",
        stakeAmount: "100",
      }),
    ).rejects.toThrow("vote stake exceeds the configured MCP limit");
  });

  it("rejects submissions outside the configured host allowlist", async () => {
    const { service } = createService({
      ...baseWriteConfig,
      policy: {
        ...baseWriteConfig.policy,
        allowedSubmissionHosts: ["curyo.xyz"],
      },
    });

    await expect(
      service.submitContent("writer", {
        url: "https://example.com/post",
        title: "Example",
        description: "Example description",
        tags: ["tag"],
        categoryId: "1",
      }),
    ).rejects.toThrow('Submission host "example.com" is not allowed by MCP policy');
  });

  it("simulates a reward claim before sending the live transaction", async () => {
    const { service, internals } = createService();
    internals.getContext = vi.fn(() => mockContext);
    internals.simulateContract = vi.fn(async () => {});
    internals.writeContract = vi.fn(async () => `0x${"aa".repeat(32)}`);

    const result = await service.claimReward("writer", {
      contentId: "1",
      roundId: "2",
      kind: "voter",
    });

    expect(internals.simulateContract).toHaveBeenCalledTimes(1);
    expect(internals.writeContract).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      action: "claim_reward",
      txHash: `0x${"aa".repeat(32)}`,
    });
  });

  it("rejects frontend fee claims when the previewed operator does not match the signer", async () => {
    const { service, internals } = createService();
    internals.getContext = vi.fn(() => mockContext);
    internals.readContract = vi
      .fn()
      .mockResolvedValueOnce([1n, 0, "0x8888888888888888888888888888888888888888", false] as const)
      .mockResolvedValueOnce(0n);

    await expect(
      service.claimFrontendFee("writer", {
        contentId: "1",
        roundId: "2",
      }),
    ).rejects.toThrow("claim_frontend_fee preview resolved a different frontend operator wallet than the bound signer");
  });
});
