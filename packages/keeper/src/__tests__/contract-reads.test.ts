import { describe, expect, it, vi } from "vitest";
import {
  assertContractDeployed,
  readRoundVotingConfig,
  validateKeeperContracts,
} from "../keeper.js";

const ENGINE = "0x1111111111111111111111111111111111111111" as const;
const REGISTRY = "0x2222222222222222222222222222222222222222" as const;

describe("assertContractDeployed", () => {
  it("throws when the configured address has no bytecode", async () => {
    const publicClient = {
      getCode: vi.fn().mockResolvedValue("0x"),
    };

    await expect(assertContractDeployed(publicClient as any, ENGINE, "RoundVotingEngine")).rejects.toThrow(
      `RoundVotingEngine has no bytecode at ${ENGINE}`,
    );
  });
});

describe("readRoundVotingConfig", () => {
  it("returns the decoded config tuple", async () => {
    const publicClient = {
      readContract: vi.fn().mockResolvedValue([1200n, 604800n, 3n, 1000n]),
    };

    await expect(readRoundVotingConfig(publicClient as any, ENGINE)).resolves.toEqual({
      epochDuration: 1200n,
      maxDuration: 604800n,
      minVoters: 3n,
      maxVoters: 1000n,
    });
  });

  it("wraps contract read failures with the engine address", async () => {
    const publicClient = {
      readContract: vi.fn().mockRejectedValue(new Error("returned no data")),
    };

    await expect(readRoundVotingConfig(publicClient as any, ENGINE)).rejects.toThrow(
      `Failed to read RoundVotingEngine.config() at ${ENGINE}: returned no data`,
    );
  });
});

describe("validateKeeperContracts", () => {
  it("checks both configured contract addresses", async () => {
    const publicClient = {
      getCode: vi.fn().mockResolvedValue("0x1234"),
      readContract: vi
        .fn()
        .mockResolvedValueOnce([1200n, 604800n, 3n, 1000n])
        .mockResolvedValueOnce(7n),
    };

    await expect(validateKeeperContracts(publicClient as any, ENGINE, REGISTRY)).resolves.toBeUndefined();
    expect(publicClient.getCode).toHaveBeenNthCalledWith(1, { address: ENGINE });
    expect(publicClient.getCode).toHaveBeenNthCalledWith(2, { address: REGISTRY });
    expect(publicClient.readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ address: ENGINE, functionName: "config" }),
    );
    expect(publicClient.readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ address: REGISTRY, functionName: "nextContentId" }),
    );
  });
});
