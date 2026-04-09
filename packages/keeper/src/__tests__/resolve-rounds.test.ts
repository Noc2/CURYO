import { beforeEach, describe, expect, it, vi } from "vitest";

const VOTER = "0x3333333333333333333333333333333333333333" as const;
const ACCOUNT = "0x4444444444444444444444444444444444444444" as const;
const COMMIT_KEY_1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const COMMIT_KEY_2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const TOO_EARLY_TLOCK_ERROR = "It's too early to decrypt the ciphertext - decryptable at round 27013021";
const zeroHash = `0x${"0".repeat(64)}` as const;

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
  targetRound?: bigint;
  drandChainHash?: `0x${string}`;
  frontend: `0x${string}`;
  revealableAfter: bigint;
  revealed: boolean;
  isUp: boolean;
  epochIndex: number;
}

interface ContentData {
  id: bigint;
  createdAt: bigint;
  submitterStakeReturned: boolean;
}

interface RatingStateData {
  settledRounds: bigint;
  lowSince: bigint;
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

function makeTlockCiphertext(params: {
  isUp: boolean;
  salt: `0x${string}`;
  targetRound: bigint;
  drandChainHash: `0x${string}`;
  plaintextMarker?: string;
}): `0x${string}` {
  const chunkBase64 = (input: string, chunkSize = 64): string => {
    const chunks: string[] = [];
    for (let i = 0; i < input.length; i += chunkSize) {
      chunks.push(input.slice(i, i + chunkSize));
    }
    return chunks.join("\n");
  };
  const toUnpaddedBase64 = (input: Buffer | string): string => Buffer.from(input).toString("base64").replace(/=+$/u, "");
  const encryptedBody = Buffer.concat([
    Buffer.from(params.plaintextMarker ?? `${params.isUp ? "1" : "0"}:${params.salt.slice(2)}`, "utf8"),
    Buffer.alloc(Math.max(0, 65 - Buffer.byteLength(params.plaintextMarker ?? `${params.isUp ? "1" : "0"}:${params.salt.slice(2)}`, "utf8")), 0x58),
  ]);
  const recipientBody = chunkBase64(toUnpaddedBase64(Buffer.alloc(128, 0x42)));
  const mac = toUnpaddedBase64(Buffer.alloc(32, 0x24));
  const agePayload = Buffer.concat([
    Buffer.from(
      [
        "age-encryption.org/v1",
        `-> tlock ${params.targetRound.toString()} ${params.drandChainHash.slice(2)}`,
        recipientBody,
        `--- ${mac}`,
        "",
      ].join("\n"),
      "utf8",
    ),
    encryptedBody,
  ]);

  return `0x${Buffer.from(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      chunkBase64(agePayload.toString("base64")),
      "-----END AGE ENCRYPTED FILE-----",
      "",
    ].join("\n"),
    "utf-8",
  ).toString("hex")}` as `0x${string}`;
}

function makeCommit(overrides: Partial<CommitData> = {}): CommitData {
  const salt = `0x${"aa".repeat(32)}` as `0x${string}`;
  const targetRound = 123n;
  const drandChainHash = `0x${"ab".repeat(32)}` as `0x${string}`;
  return {
    voter: VOTER,
    stakeAmount: 100n,
    ciphertext: makeTlockCiphertext({
      isUp: true,
      salt,
      targetRound,
      drandChainHash,
    }),
    targetRound,
    drandChainHash,
    frontend: "0x0000000000000000000000000000000000000000",
    revealableAfter: 10n,
    revealed: false,
    isUp: true,
    epochIndex: 0,
    ...overrides,
  };
}

function toRoundTuple(round: RoundData) {
  return [
    round.startTime,
    round.state,
    round.voteCount,
    round.revealedCount,
    0n,
    0n,
    0n,
    0n,
    0n,
    false,
    round.settledAt,
    round.thresholdReachedAt,
    0n,
    0n,
  ] as const;
}

function toCommitTuple(commit: CommitData) {
  return [
    commit.voter,
    commit.stakeAmount,
    commit.ciphertext,
    commit.targetRound ?? 0n,
    commit.drandChainHash ?? `0x${"0".repeat(64)}`,
    commit.frontend,
    commit.revealableAfter,
    commit.revealed,
    commit.isUp,
    commit.epochIndex,
  ] as const;
}

function toRoundConfigTuple(config: { epochDuration: bigint; maxDuration: bigint; minVoters: bigint; maxVoters: bigint }) {
  return [config.epochDuration, config.maxDuration, config.minVoters, config.maxVoters] as const;
}

function toContentTuple(content: ContentData) {
  return [
    content.id,
    zeroHash,
    ACCOUNT,
    100n,
    content.createdAt,
    content.createdAt,
    0,
    0,
    ACCOUNT,
    content.submitterStakeReturned,
    50,
    1n,
  ] as const;
}

function toRatingStateTuple(ratingState: RatingStateData) {
  return [0n, 0n, 0n, ratingState.settledRounds, 5000, 5000, 0n, ratingState.lowSince] as const;
}

function makePlaintext(isUp: boolean, fillByte: number): Buffer {
  return Buffer.concat([Buffer.from([isUp ? 1 : 0]), Buffer.alloc(32, fillByte)]);
}

function makeHarness(options: {
  now?: bigint;
  activeRoundId?: bigint;
  latestRoundId?: bigint;
  currentRoundId?: bigint;
  tupleResults?: boolean;
  dormancyEligible?: boolean;
  content?: ContentData;
  ratingState?: RatingStateData;
  slashable?: boolean;
  milestoneZeroTermsSnapshotted?: boolean;
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
  const currentRoundId = options.currentRoundId ?? (latestRoundId > 0n ? latestRoundId : activeRoundId);
  const tupleResults = options.tupleResults ?? false;
  const dormancyEligible = options.dormancyEligible ?? false;
  const content = options.content ?? {
    id: 1n,
    createdAt: options.now != null ? options.now - 5n * 24n * 60n * 60n : now - 5n * 24n * 60n * 60n,
    submitterStakeReturned: false,
  };
  const ratingState = options.ratingState ?? {
    settledRounds: 0n,
    lowSince: 0n,
  };
  const slashable = options.slashable ?? false;
  const milestoneZeroTermsSnapshotted = options.milestoneZeroTermsSnapshotted ?? (ratingState.settledRounds > 0n);
  const commitKeys = options.commitKeys ?? [];
  const commits = options.commits ?? {};
  const round = options.round;

  const publicClient = {
    getBlock: vi.fn().mockResolvedValue({ timestamp: now }),
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      switch (functionName) {
        case "nextContentId":
          return 2n;
        case "currentRoundId":
          return currentRoundId;
        case "nextRoundId":
          return latestRoundId;
        case "rounds":
          return tupleResults ? toRoundTuple(round) : round;
        case "roundConfigSnapshot":
          return tupleResults ? toRoundConfigTuple(roundConfig) : roundConfig;
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
        case "getRoundCommitCount":
          return BigInt(commitKeys.length);
        case "roundCommitHashes":
          return commitKeys[Number(args[2])] ?? zeroHash;
        case "commits":
          return tupleResults
            ? toCommitTuple(commits[String(args[2])] ?? makeCommit({ revealed: true, stakeAmount: 0n }))
            : commits[String(args[2])] ?? makeCommit({ revealed: true, stakeAmount: 0n });
        case "contents":
          return tupleResults ? toContentTuple(content) : content;
        case "getRatingState":
          return tupleResults ? toRatingStateTuple(ratingState) : ratingState;
        case "isSubmitterStakeSlashable":
          return slashable;
        case "milestoneZeroSubmitterTermsSnapshotted":
          return milestoneZeroTermsSnapshotted;
        case "isDormancyEligible":
          return dormancyEligible;
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

      if (functionName === "resolveSubmitterStake") {
        return "0xsubmitter";
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
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n }),
        [COMMIT_KEY_2]: makeCommit({ revealableAfter: 100n }),
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc": makeCommit({
          revealableAfter: 100n,
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

  it("treats malformed tlock ciphertext metadata as a permanent failure without decrypting", async () => {
    const round = makeRound({
      state: 0,
      voteCount: 1n,
      revealedCount: 0n,
    });
    const badCommit = makeCommit({ revealableAfter: 100n });
    badCommit.ciphertext = "0x1234";
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: badCommit,
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

    expect(result.votesRevealed).toBe(0);
    expect(timelockDecrypt).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "tlock ciphertext metadata invalid",
      expect.objectContaining({
        contentId: 1,
        roundId: 1,
        commitKey: COMMIT_KEY_1,
        permanent: true,
        error: "malformed tlock ciphertext metadata",
      }),
    );
    expect(walletClient.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "revealVoteByCommitKey",
      }),
    );
  });

  it("treats shallow pseudo-tlock envelopes as a permanent failure without decrypting", async () => {
    const round = makeRound({
      state: 0,
      voteCount: 1n,
      revealedCount: 0n,
    });
    const badCommit = makeCommit({ revealableAfter: 100n });
    badCommit.ciphertext = (`0x${Buffer.from(
      [
        "-----BEGIN AGE ENCRYPTED FILE-----",
        Buffer.from(
          [
            "age-encryption.org/v1",
            `-> tlock ${badCommit.targetRound!.toString()} ${badCommit.drandChainHash!.slice(2)}`,
            "payload 1:" + "11".repeat(32),
            "--- bWFj",
          ].join("\n"),
          "binary",
        ).toString("base64"),
        "-----END AGE ENCRYPTED FILE-----",
        "",
      ].join("\n"),
      "utf8",
    ).toString("hex")}`) as `0x${string}`;
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: badCommit,
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

    expect(result.votesRevealed).toBe(0);
    expect(timelockDecrypt).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "tlock ciphertext metadata invalid",
      expect.objectContaining({
        contentId: 1,
        roundId: 1,
        commitKey: COMMIT_KEY_1,
        permanent: true,
        error: "malformed tlock ciphertext metadata",
      }),
    );
  });

  it("treats mismatched tlock metadata as a permanent failure without decrypting", async () => {
    const round = makeRound({
      state: 0,
      voteCount: 1n,
      revealedCount: 0n,
    });
    const badCommit = makeCommit({ revealableAfter: 100n });
    badCommit.targetRound = badCommit.targetRound! + 1n;
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: badCommit,
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

    expect(result.votesRevealed).toBe(0);
    expect(timelockDecrypt).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "tlock ciphertext metadata invalid",
      expect.objectContaining({
        contentId: 1,
        roundId: 1,
        commitKey: COMMIT_KEY_1,
        permanent: true,
        error: expect.stringContaining("tlock metadata mismatch"),
      }),
    );
  });

  it("keeps retrying when tlock says the ciphertext is not decryptable yet", async () => {
    timelockDecrypt.mockRejectedValue(new Error(TOO_EARLY_TLOCK_ERROR));

    const round = makeRound({
      state: 0,
      voteCount: 1n,
      revealedCount: 0n,
    });
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n }),
      },
      now: 1_000n,
    });
    const logger = makeLogger();

    for (let i = 0; i < 12; i++) {
      await resolveRounds(
        publicClient as any,
        walletClient as any,
        {} as any,
        { address: ACCOUNT } as any,
        logger as any,
      );
    }

    expect(timelockDecrypt).toHaveBeenCalledTimes(12);
    expect(walletClient.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "revealVoteByCommitKey" }),
    );
    expect(logger.warn).not.toHaveBeenCalledWith("tlock decryption failed", expect.anything());
    expect(logger.error).not.toHaveBeenCalledWith("tlock decryption failed", expect.anything());
    expect(logger.debug).toHaveBeenCalledTimes(12);
    expect(logger.debug).toHaveBeenLastCalledWith(
      "tlock ciphertext not decryptable yet",
      expect.objectContaining({
        contentId: 1,
        roundId: 1,
        commitKey: COMMIT_KEY_1,
        decryptableAtRound: "27013021",
        error: TOO_EARLY_TLOCK_ERROR,
      }),
    );
  });

  it("stops retrying permanently bad ciphertext after the max retry budget", async () => {
    timelockDecrypt.mockRejectedValue(new Error("beacon unavailable"));

    const round = makeRound({
      state: 0,
      voteCount: 1n,
      revealedCount: 0n,
    });
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 1n,
      latestRoundId: 1n,
      round,
      commitKeys: [COMMIT_KEY_1],
      commits: {
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n }),
      },
      now: 1_000n,
    });
    const logger = makeLogger();

    for (let i = 0; i < 12; i++) {
      await resolveRounds(
        publicClient as any,
        walletClient as any,
        {} as any,
        { address: ACCOUNT } as any,
        logger as any,
      );
    }

    expect(timelockDecrypt).toHaveBeenCalledTimes(10);
    expect(logger.warn).toHaveBeenCalledTimes(9);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenLastCalledWith(
      "tlock decryption failed",
      expect.objectContaining({
        contentId: 1,
        roundId: 1,
        commitKey: COMMIT_KEY_1,
        attempt: 10,
        permanent: true,
        error: "beacon unavailable",
      }),
    );
    expect(logger.warn).toHaveBeenLastCalledWith(
      "tlock decryption failed",
      expect.objectContaining({
        contentId: 1,
        roundId: 1,
        commitKey: COMMIT_KEY_1,
        attempt: 9,
        permanent: false,
        error: "beacon unavailable",
      }),
    );
    expect(walletClient.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "revealVoteByCommitKey" }),
    );
  });

  it("handles tuple-shaped viem reads from live contracts", async () => {
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
      tupleResults: true,
      round,
      commitKeys: [COMMIT_KEY_1, COMMIT_KEY_2, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
      commits: {
        [COMMIT_KEY_1]: makeCommit({ revealableAfter: 100n }),
        [COMMIT_KEY_2]: makeCommit({ revealableAfter: 100n }),
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc": makeCommit({
          revealableAfter: 100n,
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
    });
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

  it("resolves submitter stakes before the dormancy sweep when eligible", async () => {
    const round = makeRound({
      state: 2,
      voteCount: 1n,
      revealedCount: 0n,
    });
    const { publicClient, walletClient } = makeHarness({
      activeRoundId: 0n,
      latestRoundId: 1n,
      round,
      ratingState: {
        settledRounds: 1n,
        lowSince: 0n,
      },
      milestoneZeroTermsSnapshotted: true,
      dormancyEligible: true,
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
      submitterStakesResolved: 1,
      contentMarkedDormant: 1,
    });
    expect(walletClient.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "resolveSubmitterStake", args: [1n] }),
    );
    expect(walletClient.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "markDormant", args: [1n] }),
    );
  });

  it("resolves dormant submitter stakes after the active round closes", async () => {
    const round = makeRound({
      state: 2,
      voteCount: 0n,
      revealedCount: 0n,
    });
    const now = 40n * 24n * 60n * 60n;
    const { publicClient, walletClient } = makeHarness({
      now,
      activeRoundId: 0n,
      latestRoundId: 1n,
      currentRoundId: 0n,
      round,
      content: {
        id: 1n,
        createdAt: now - mockConfig.dormancyPeriod - 1n,
        submitterStakeReturned: false,
      },
      ratingState: {
        settledRounds: 0n,
        lowSince: 0n,
      },
    });
    const logger = makeLogger();

    const result = await resolveRounds(
      publicClient as any,
      walletClient as any,
      {} as any,
      { address: ACCOUNT } as any,
      logger as any,
    );

    expect(result.submitterStakesResolved).toBe(1);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "resolveSubmitterStake", args: [1n] }),
    );
  });
});
