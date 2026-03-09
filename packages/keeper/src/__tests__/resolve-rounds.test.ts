import { beforeEach, describe, expect, it, vi } from "vitest";

const ENGINE = "0x1111111111111111111111111111111111111111" as const;
const REGISTRY = "0x2222222222222222222222222222222222222222" as const;
const VOTER = "0x3333333333333333333333333333333333333333" as const;
const ACCOUNT = "0x4444444444444444444444444444444444444444" as const;
const COMMIT_KEY_1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const COMMIT_KEY_2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

const { mockConfig, timelockDecrypt } = vi.hoisted(() => ({
  mockConfig: {
    contracts: {
      votingEngine: "0x1111111111111111111111111111111111111111",
      contentRegistry: "0x2222222222222222222222222222222222222222",
    },
    dormancyPeriod: 30n * 24n * 60n * 60n,
    cleanupBatchSize: 25,
  },
  timelockDecrypt: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: mockConfig,
}));

vi.mock("tlock-js", () => ({
  timelockDecrypt,
  mainnetClient: vi.fn(() => ({})),
}));

import { resolveRounds, resetKeeperStateForTests } from "../keeper.js";

type RoundStateValue = 0 | 1 | 2 | 3 | 4;

interface RoundData {
  startTime: bigint;
  state: RoundStateValue;
  voteCount: bigint;
  revealedCount: bigint;
  settledAt: bigint;
  thresholdReachedAt: bigint;
}

interface CommitData {
  voter: `0x${string}`;
  stakeAmount: bigint;
  ciphertext: `0x${string}`;
  frontend: `0x${string}`;
  revealableAfter: bigint;
  revealed: boolean;
  isUp: boolean;
  epochIndex: number;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeRound({
  state,
  voteCount,
  revealedCount,
  settledAt = 0n,
  thresholdReachedAt = 0n,
}: {
  state: RoundStateValue;
  voteCount: bigint;
  revealedCount: bigint;
  settledAt?: bigint;
  thresholdReachedAt?: bigint;
}): RoundData {
  return {
    startTime: 1n,
    state,
    voteCount,
    revealedCount,
    settledAt,
    thresholdReachedAt,
  };
}

function makeCommit(overrides: Partial<CommitData> = {}): CommitData {
  return {
    voter: VOTER,
    stakeAmount: 100n,
    ciphertext: "0x1234",
    frontend: "0x0000000000000000000000000000000000000000",
    revealableAfter: 10n,
    revealed: false,
    isUp: true,
    epochIndex: 0,
    ...overrides,
  };
}

function makePlaintext(isUp: boolean, fillByte: number): Buffer {
  return Buffer.concat([Buffer.from([isUp ? 1 : 0]), Buffer.alloc(32, fillByte)]);
}

function makeHarness(options: {
  now?: bigint;
  activeRoundId?: bigint;
  latestRoundId?: bigint;
  round: RoundData;
  roundConfig?: { epochDuration: bigint; maxDuration: bigint; minVoters: bigint; maxVoters: bigint };
  commitKeys?: readonly `0x${string}`[];
  commits?: Record<string, CommitData>;
  revealGracePeriod?: bigint;
  lastCommitRevealableAfter?: bigint;
}) {
  const roundConfig = options.roundConfig || {
    epochDuration: 1200n,
    maxDuration: 604800n,
    minVoters: 3n,
    maxVoters: 1000n,
  };
  const now = options.now ?? 10_000n;
  const latestRoundId = options.latestRoundId ?? 1n;
  const activeRoundId = options.activeRoundId ?? 0n;
  const commitKeys = options.commitKeys ?? [];
  const commits = options.commits ?? {};
  const round = options.round;

  const publicClient = {
    getBlock: vi.fn().mockResolvedValue({ timestamp: now }),
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      switch (functionName) {
        case "nextContentId":
          return 2n;
        case "getActiveRoundId":
          return activeRoundId;
        case "nextRoundId":
          return latestRoundId;
        case "getRound":
          return round;
        case "getRoundConfig":
          return roundConfig;
        case "roundRevealGracePeriodSnapshot":
          return options.revealGracePeriod ?? 3600n;
        case "revealGracePeriod":
          return options.revealGracePeriod ?? 3600n;
        case "lastCommitRevealableAfter":
          return (
            options.lastCommitRevealableAfter ??
            Object.values(commits).reduce((max, commit) => {
              return commit.revealableAfter > max ? commit.revealableAfter : max;
            }, 0n)
          );
        case "getRoundCommitHashes":
          return commitKeys;
        case "getCommit":
          return commits[String(args[2])] ?? makeCommit({ revealed: true, stakeAmount: 0n });
        case "getContent":
          return { status: 1, lastActivityAt: now };
        default:
          throw new Error(`Unexpected readContract(${functionName})`);
      }
    }),
  };

  const walletClient = {
    writeContract: vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      if (functionName === "finalizeRevealFailedRound") {
        round.state = 4;
        round.settledAt = now;
        return "0xfinalized";
      }

      if (functionName === "processUnrevealedVotes") {
        const startIndex = Number(args[2]);
        const count = Number(args[3]);
        const endIndex = Math.min(commitKeys.length, startIndex + count);
        let processed = false;
        for (let i = startIndex; i < endIndex; i++) {
          const commit = commits[String(commitKeys[i])];
          if (commit && !commit.revealed && commit.stakeAmount > 0n) {
            commit.stakeAmount = 0n;
            processed = true;
          }
        }
        if (!processed) {
          throw new Error("NothingProcessed");
        }
        return "0xcleanup";
      }

      if (functionName === "revealVoteByCommitKey") {
        const commitKey = String(args[2]);
        const commit = commits[commitKey];
        if (!commit || commit.revealed) {
          throw new Error("AlreadyRevealed");
        }
        commit.revealed = true;
        round.revealedCount += 1n;
        if (round.revealedCount >= roundConfig.minVoters && round.thresholdReachedAt === 0n) {
          round.thresholdReachedAt = now;
        }
        return "0xrevealed";
      }

      if (functionName === "settleRound") {
        round.state = 1;
        round.settledAt = now;
        return "0xsettled";
      }

      if (functionName === "cancelExpiredRound") {
        round.state = 2;
        return "0xcancelled";
      }

      if (functionName === "markDormant") {
        return "0xdormant";
      }

      throw new Error(`Unexpected writeContract(${functionName})`);
    }),
  };

  return { publicClient, walletClient, round, commits };
}

describe("resolveRounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.cleanupBatchSize = 25;
    resetKeeperStateForTests();
  });

  it("finalizes reveal-failed rounds and cleans up unrevealed stake", async () => {
    timelockDecrypt.mockRejectedValue(new Error("beacon unavailable"));

    const round = makeRound({
      state: 0,
      voteCount: 3n,
      revealedCount: 2n,
    });
    const commit = makeCommit({
      revealableAfter: 100n,
    });
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: commit,
      },
      revealGracePeriod: 60n,
      lastCommitRevealableAfter: 100n,
      now: 605_000n,
    });
    const logger = makeLogger();

    const result = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(result).toMatchObject({
      roundsRevealFailedFinalized: 1,
      cleanupBatchesProcessed: 1,
      roundsSettled: 0,
      roundsCancelled: 0,
      votesRevealed: 0,
    });
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "finalizeRevealFailedRound" }),
    );
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "processUnrevealedVotes" }),
    );
  });

  it("reveals and settles a round once reveal quorum is met", async () => {
    timelockDecrypt
      .mockResolvedValueOnce(makePlaintext(true, 1))
      .mockResolvedValueOnce(makePlaintext(true, 2))
      .mockResolvedValueOnce(makePlaintext(false, 3));

    const round = makeRound({
      state: 0,
      voteCount: 3n,
      revealedCount: 0n,
    });
    const { publicClient, walletClient, commits } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1, COMMIT_KEY_2, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
      commits: {
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n, ciphertext: "0xaaaa" }),
        [COMMIT_KEY_2]: makeCommit({ revealableAfter: 100n, ciphertext: "0xbbbb" }),
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc": makeCommit({
          revealableAfter: 100n,
          ciphertext: "0xcccc",
          isUp: false,
        }),
      },
      now: 1_000n,
    });
    const logger = makeLogger();

    const result = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(result).toMatchObject({
      votesRevealed: 3,
      roundsSettled: 1,
      roundsRevealFailedFinalized: 0,
    });
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "settleRound" }),
    );
    expect(commits[COMMIT_KEY_1].revealed).toBe(true);
    expect(commits[COMMIT_KEY_2].revealed).toBe(true);
    expect(round.state).toBe(1);
  });

  it("processes terminal-round cleanup in configured batches", async () => {
    mockConfig.cleanupBatchSize = 1;

    const round = makeRound({
      state: 1,
      voteCount: 2n,
      revealedCount: 2n,
      settledAt: 500n,
      thresholdReachedAt: 400n,
    });
    const { publicClient, walletClient, commits } = makeHarness({
      activeRoundId: 0n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1, COMMIT_KEY_2],
      commits: {
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n }),
        [COMMIT_KEY_2]: makeCommit({ revealableAfter: 200n }),
      },
      now: 1_000n,
    });
    const logger = makeLogger();

    const firstResult = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(firstResult.cleanupBatchesProcessed).toBe(1);
    expect(walletClient.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: "processUnrevealedVotes",
        args: [1n, 1n, 0n, 1n],
      }),
    );

    const secondResult = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(secondResult.cleanupBatchesProcessed).toBe(1);
    expect(walletClient.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "processUnrevealedVotes",
        args: [1n, 1n, 1n, 1n],
      }),
    );
    expect(commits[COMMIT_KEY_1].stakeAmount).toBe(0n);
    expect(commits[COMMIT_KEY_2].stakeAmount).toBe(0n);
  });

  it("cancels an expired below-quorum round at the exact deadline", async () => {
    timelockDecrypt.mockReset();

    const round = makeRound({
      state: 0,
      voteCount: 2n,
      revealedCount: 0n,
    });
    round.startTime = 100n;
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      roundConfig: {
        epochDuration: 1200n,
        maxDuration: 900n,
        minVoters: 3n,
        maxVoters: 1000n,
      },
      now: 1_000n,
    });
    const logger = makeLogger();

    const result = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(result.roundsCancelled).toBe(1);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "cancelExpiredRound" }),
    );
  });

  it("does not finalize reveal-failed before maxDuration even when reveal grace has passed", async () => {
    timelockDecrypt.mockRejectedValue(new Error("beacon unavailable"));

    const round = makeRound({
      state: 0,
      voteCount: 3n,
      revealedCount: 2n,
    });
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      roundConfig: {
        epochDuration: 1200n,
        maxDuration: 5_000n,
        minVoters: 3n,
        maxVoters: 1000n,
      },
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n }),
      },
      revealGracePeriod: 60n,
      lastCommitRevealableAfter: 950n,
      now: 1_000n,
    });
    const logger = makeLogger();

    const result = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(result.roundsRevealFailedFinalized).toBe(0);
    expect(walletClient.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "finalizeRevealFailedRound" }),
    );
  });
});
