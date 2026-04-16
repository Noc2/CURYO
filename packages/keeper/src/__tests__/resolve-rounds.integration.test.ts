import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ContentRegistryAbi, CuryoReputationAbi, ProtocolConfigAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import deployedContracts from "@curyo/contracts/deployedContracts";
import { buildCommitHash } from "@curyo/contracts/voting";

const LOCAL_RPC_URL = process.env.KEEPER_INTEGRATION_RPC_URL || "http://127.0.0.1:8545";
const CHAIN = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: { http: [LOCAL_RPC_URL] },
  },
});

const { mockConfig, timelockDecrypt } = vi.hoisted(() => ({
  mockConfig: {
    contracts: {
      votingEngine: "0x0000000000000000000000000000000000000000",
      contentRegistry: "0x0000000000000000000000000000000000000000",
    },
    dormancyPeriod: 30n * 24n * 60n * 60n,
    cleanupBatchSize: 25,
  },
  timelockDecrypt: vi.fn(async (armored: string) => {
    const armorLines = armored.split("\n");
    const agePayload = Buffer.from(armorLines[1] ?? "", "base64").toString("binary");
    const payloadLines = agePayload.split("\n");
    const [flag, saltHex] = (payloadLines[payloadLines.length - 1] ?? "").split(":");
    return Buffer.concat([Buffer.from([flag === "1" ? 1 : 0]), Buffer.from(saltHex, "hex")]);
  }),
}));

vi.mock("../config.js", () => ({
  config: mockConfig,
}));

vi.mock("tlock-js", () => ({
  timelockDecrypt,
  mainnetClient: vi.fn(() => ({})),
}));

import { resetKeeperStateForTests, resolveRounds } from "../keeper.js";

const chain31337 = (deployedContracts as Record<number, Record<string, { address: `0x${string}` }>>)[31337];
const CONTRACTS = {
  crep: chain31337?.CuryoReputation?.address ?? "0x0000000000000000000000000000000000000000",
  contentRegistry: chain31337?.ContentRegistry?.address ?? "0x0000000000000000000000000000000000000000",
  roundVotingEngine: chain31337?.RoundVotingEngine?.address ?? "0x0000000000000000000000000000000000000000",
} as const;

const ACCOUNTS = {
  keeper: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
  submitter: privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
  voter1: privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"),
  voter2: privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"),
  voter3: privateKeyToAccount("0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"),
} as const;

const STAKE = 10n * 10n ** 6n;

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function encodeTestCiphertext(params: {
  isUp: boolean;
  salt: `0x${string}`;
  targetRound: bigint;
  drandChainHash: `0x${string}`;
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
    Buffer.from(`${params.isUp ? "1" : "0"}:${params.salt.slice(2)}`, "utf8"),
    Buffer.alloc(Math.max(0, 65 - Buffer.byteLength(`${params.isUp ? "1" : "0"}:${params.salt.slice(2)}`, "utf8")), 0x58),
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

  return stringToHex(
    [
      "-----BEGIN AGE ENCRYPTED FILE-----",
      chunkBase64(agePayload.toString("base64")),
      "-----END AGE ENCRYPTED FILE-----",
      "",
    ].join("\n"),
  ) as `0x${string}`;
}

async function waitForReceipt(publicClient: ReturnType<typeof createPublicClient>, hash: `0x${string}`) {
  await publicClient.waitForTransactionReceipt({ hash });
}

async function increaseTime(publicClient: ReturnType<typeof createPublicClient>, seconds: number) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await publicClient.request({
    method: "evm_mine",
    params: [],
  });
}

describe("resolveRounds integration", () => {
  let publicClient: ReturnType<typeof createPublicClient>;
  let keeperClient: ReturnType<typeof createWalletClient>;
  let submitterClient: ReturnType<typeof createWalletClient>;
  let voter1Client: ReturnType<typeof createWalletClient>;
  let voter2Client: ReturnType<typeof createWalletClient>;
  let voter3Client: ReturnType<typeof createWalletClient>;
  let integrationReady = false;
  let integrationIssue = "integration test not initialized";

  beforeAll(async () => {
    resetKeeperStateForTests();
    publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(LOCAL_RPC_URL),
    });
    keeperClient = createWalletClient({
      account: ACCOUNTS.keeper,
      chain: CHAIN,
      transport: http(LOCAL_RPC_URL),
    });
    submitterClient = createWalletClient({
      account: ACCOUNTS.submitter,
      chain: CHAIN,
      transport: http(LOCAL_RPC_URL),
    });
    voter1Client = createWalletClient({
      account: ACCOUNTS.voter1,
      chain: CHAIN,
      transport: http(LOCAL_RPC_URL),
    });
    voter2Client = createWalletClient({
      account: ACCOUNTS.voter2,
      chain: CHAIN,
      transport: http(LOCAL_RPC_URL),
    });
    voter3Client = createWalletClient({
      account: ACCOUNTS.voter3,
      chain: CHAIN,
      transport: http(LOCAL_RPC_URL),
    });

    try {
      const [chainId, engineCode, registryCode] = await Promise.all([
        publicClient.getChainId(),
        publicClient.getCode({ address: CONTRACTS.roundVotingEngine }),
        publicClient.getCode({ address: CONTRACTS.contentRegistry }),
      ]);
      integrationReady = chainId === 31337 && !!engineCode && engineCode !== "0x" && !!registryCode && registryCode !== "0x";
      if (integrationReady) {
        mockConfig.contracts.votingEngine = CONTRACTS.roundVotingEngine;
        mockConfig.contracts.contentRegistry = CONTRACTS.contentRegistry;
        integrationIssue = "";
      } else {
        integrationIssue = `readiness failed: chainId=${chainId}, engine=${engineCode}, registry=${registryCode}`;
      }
    } catch (error) {
      integrationReady = false;
      integrationIssue = `readiness threw: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  it("reveals and settles a real local round via the keeper", async ({ skip }) => {
    if (!integrationReady) {
      if (process.env.KEEPER_INTEGRATION_REQUIRE_LOCALHOST === "1") {
        throw new Error(integrationIssue);
      }
      skip();
    }

    const logger = makeLogger();
    const protocolConfigAddress = (await publicClient.readContract({
      address: CONTRACTS.roundVotingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "protocolConfig",
      args: [],
    })) as `0x${string}`;
    const [epochDurationSeconds] = (await publicClient.readContract({
      address: protocolConfigAddress,
      abi: ProtocolConfigAbi,
      functionName: "config",
      args: [],
    })) as unknown as readonly [number, number, number, number];

    const nextContentId = (await publicClient.readContract({
      address: CONTRACTS.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "nextContentId",
      args: [],
    })) as bigint;

    await waitForReceipt(
      publicClient,
      await submitterClient.writeContract({
        account: ACCOUNTS.submitter,
        chain: CHAIN,
        address: CONTRACTS.crep,
        abi: CuryoReputationAbi,
        functionName: "approve",
        args: [CONTRACTS.contentRegistry, STAKE],
      }),
    );

    const submissionImageUrl = `https://example.com/keeper-integration-${Date.now()}.jpg`;
    const submissionTitle = "Keeper integration test";
    const submissionDescription = "integration";
    const submissionTags = "keeper,integration";
    const submissionCategoryId = 1n;
    const submissionSalt = `0x${"44".repeat(32)}` as `0x${string}`;
    const [, submissionKey] = (await publicClient.readContract({
      address: CONTRACTS.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "previewQuestionMediaSubmissionKey",
      args: [[submissionImageUrl], "", submissionTitle, submissionDescription, submissionTags, submissionCategoryId],
    })) as readonly [bigint, `0x${string}`];
    const revealCommitment = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "string" },
          { type: "string" },
          { type: "string" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "address" },
        ],
        [
          submissionKey,
          submissionTitle,
          submissionDescription,
          submissionTags,
          submissionCategoryId,
          submissionSalt,
          ACCOUNTS.submitter.address,
        ],
      ),
    );

    await waitForReceipt(
      publicClient,
      await submitterClient.writeContract({
        account: ACCOUNTS.submitter,
        chain: CHAIN,
        address: CONTRACTS.contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "reserveSubmission",
        args: [revealCommitment],
      }),
    );
    await increaseTime(publicClient, 2);

    await waitForReceipt(
      publicClient,
      await submitterClient.writeContract({
        account: ACCOUNTS.submitter,
        chain: CHAIN,
        address: CONTRACTS.contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "submitQuestionWithMedia",
        args: [
          [submissionImageUrl],
          "",
          submissionTitle,
          submissionDescription,
          submissionTags,
          submissionCategoryId,
          submissionSalt,
        ],
      }),
    );

    const contentId = nextContentId;
    const roundReferenceRatingBps = Number(
      await publicClient.readContract({
        address: CONTRACTS.roundVotingEngine,
        abi: RoundVotingEngineAbi,
        functionName: "previewCommitReferenceRatingBps",
        args: [contentId],
      }),
    );
    const voters = [
      {
        client: voter1Client,
        account: ACCOUNTS.voter1.address,
        isUp: true,
        salt: `0x${"11".repeat(32)}` as `0x${string}`,
        targetRound: 123n,
        drandChainHash: `0x${"ab".repeat(32)}` as `0x${string}`,
      },
      {
        client: voter2Client,
        account: ACCOUNTS.voter2.address,
        isUp: true,
        salt: `0x${"22".repeat(32)}` as `0x${string}`,
        targetRound: 123n,
        drandChainHash: `0x${"ab".repeat(32)}` as `0x${string}`,
      },
      {
        client: voter3Client,
        account: ACCOUNTS.voter3.address,
        isUp: false,
        salt: `0x${"33".repeat(32)}` as `0x${string}`,
        targetRound: 123n,
        drandChainHash: `0x${"ab".repeat(32)}` as `0x${string}`,
      },
    ];

    for (const voter of voters) {
      await waitForReceipt(
        publicClient,
        await voter.client.writeContract({
          account: voter.account,
          chain: CHAIN,
          address: CONTRACTS.crep,
          abi: CuryoReputationAbi,
          functionName: "approve",
          args: [CONTRACTS.roundVotingEngine, STAKE],
        }),
      );

      const ciphertext = encodeTestCiphertext(voter);
      const commitHash = buildCommitHash(
        voter.isUp,
        voter.salt,
        contentId,
        roundReferenceRatingBps,
        voter.targetRound,
        voter.drandChainHash,
        ciphertext,
      );

      await waitForReceipt(
        publicClient,
        await voter.client.writeContract({
          account: voter.account,
          chain: CHAIN,
          address: CONTRACTS.roundVotingEngine,
          abi: RoundVotingEngineAbi as any,
          functionName: "commitVote",
          args: [
            contentId,
            roundReferenceRatingBps,
            voter.targetRound,
            voter.drandChainHash,
            commitHash,
            ciphertext,
            STAKE,
            "0x0000000000000000000000000000000000000000",
          ],
        }),
      );
    }

    const roundId = (await publicClient.readContract({
      address: CONTRACTS.roundVotingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "currentRoundId",
      args: [contentId],
    })) as bigint;
    expect(roundId).toBeGreaterThan(0n);

    await increaseTime(publicClient, epochDurationSeconds + 1);

    const result = await resolveRounds(publicClient as any, keeperClient as any, CHAIN, ACCOUNTS.keeper as any, logger as any);

    expect(result).toMatchObject({
      votesRevealed: 3,
      roundsSettled: 1,
      roundsCancelled: 0,
      roundsRevealFailedFinalized: 0,
      cleanupBatchesProcessed: 0,
    });

    const round = (await publicClient.readContract({
      address: CONTRACTS.roundVotingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "rounds",
      args: [contentId, roundId],
    })) as unknown as { state?: number; revealedCount?: bigint; settledAt?: bigint; thresholdReachedAt?: bigint } & readonly unknown[];
    const roundTuple = round as readonly unknown[];
    const state = Number(round.state ?? roundTuple[1] ?? 0);
    const revealedCount = BigInt((round.revealedCount ?? roundTuple[3] ?? 0) as bigint | number | string);
    const settledAt = BigInt((round.settledAt ?? roundTuple[10] ?? 0) as bigint | number | string);
    const thresholdReachedAt = BigInt((round.thresholdReachedAt ?? roundTuple[11] ?? 0) as bigint | number | string);

    expect(revealedCount).toBe(3n);
    expect(thresholdReachedAt).toBeGreaterThan(0n);
    expect(settledAt).toBeGreaterThan(0n);
    expect(state).toBe(1);
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("Failed"));
  });
});
