import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ContentRegistryAbi, HumanReputationAbi, ProtocolConfigAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
import deployedContracts from "@curyo/contracts/deployedContracts";
import { buildCommitHash } from "@curyo/contracts/voting";

const roundCommitPreviewAbi = [
  {
    type: "function",
    name: "previewCommitRoundId",
    stateMutability: "view",
    inputs: [{ name: "contentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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
    const footerIndex = armorLines.findIndex(line => line.startsWith("-----END AGE ENCRYPTED FILE-----"));
    const agePayload = Buffer.from(armorLines.slice(1, footerIndex).join(""), "base64").toString("binary");
    const payloadLines = agePayload.split("\n");
    const [flag, saltHex] = (payloadLines[payloadLines.length - 1] ?? "").split(":");
    return Buffer.concat([Buffer.from([flag === "1" ? 1 : 0]), Buffer.from((saltHex ?? "").slice(0, 64), "hex")]);
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
  hrep: chain31337?.HumanReputation?.address ?? "0x0000000000000000000000000000000000000000",
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

const STAKE = 1n * 10n ** 6n;
const DEFAULT_SUBMISSION_REWARD_AMOUNT = 1_000_000n;

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
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
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

function roundAt(timestamp: bigint, genesisTime: bigint, period: bigint) {
  if (period === 0n || timestamp < genesisTime) return 0n;
  return ((timestamp - genesisTime) / period) + 1n;
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
    const [drandChainHash, drandGenesisTime, drandPeriod] = await Promise.all([
      publicClient.readContract({
        address: protocolConfigAddress,
        abi: ProtocolConfigAbi,
        functionName: "drandChainHash",
        args: [],
      }) as Promise<`0x${string}`>,
      publicClient.readContract({
        address: protocolConfigAddress,
        abi: ProtocolConfigAbi,
        functionName: "drandGenesisTime",
        args: [],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: protocolConfigAddress,
        abi: ProtocolConfigAbi,
        functionName: "drandPeriod",
        args: [],
      }) as Promise<bigint>,
    ]);
    const nextContentId = (await publicClient.readContract({
      address: CONTRACTS.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "nextContentId",
      args: [],
    })) as bigint;
    const questionRewardPoolEscrow = (await publicClient.readContract({
      address: CONTRACTS.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "questionRewardPoolEscrow",
      args: [],
    })) as `0x${string}`;

    await waitForReceipt(
      publicClient,
      await submitterClient.writeContract({
        account: ACCOUNTS.submitter,
        chain: CHAIN,
        address: CONTRACTS.hrep,
        abi: HumanReputationAbi,
        functionName: "approve",
        args: [questionRewardPoolEscrow, DEFAULT_SUBMISSION_REWARD_AMOUNT],
      }),
    );

    const submissionImageUrl = `https://example.com/keeper-integration-${Date.now()}.jpg`;
    const submissionContextUrl = submissionImageUrl;
    const submissionTitle = "Keeper integration test";
    const submissionDescription = "integration";
    const submissionTags = "keeper,integration";
    const submissionCategoryId = 1n;
    const submissionSalt = `0x${"44".repeat(32)}` as `0x${string}`;
    const [, submissionKey] = (await publicClient.readContract({
      address: CONTRACTS.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "previewQuestionSubmissionKey",
      args: [
        submissionContextUrl,
        [submissionImageUrl],
        "",
        submissionTitle,
        submissionDescription,
        submissionTags,
        submissionCategoryId,
      ],
    })) as readonly [bigint, `0x${string}`];
    const submissionMediaHash = keccak256(
      encodeAbiParameters([{ type: "string[]" }, { type: "string" }], [[submissionImageUrl], ""]),
    );
    const revealCommitment = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "string" },
          { type: "string" },
          { type: "string" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "address" },
          { type: "uint8" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint32" },
          { type: "uint32" },
          { type: "uint16" },
          { type: "uint16" },
        ],
        [
          submissionKey,
          submissionMediaHash,
          submissionTitle,
          submissionDescription,
          submissionTags,
          submissionCategoryId,
          submissionSalt,
          ACCOUNTS.submitter.address,
          0,
          DEFAULT_SUBMISSION_REWARD_AMOUNT,
          3n,
          1n,
          0n,
          1_200,
          604_800,
          3,
          1_000,
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

    try {
      await waitForReceipt(
        publicClient,
        await submitterClient.writeContract({
          account: ACCOUNTS.submitter,
          chain: CHAIN,
          address: CONTRACTS.contentRegistry,
          abi: ContentRegistryAbi,
          functionName: "submitQuestion",
          args: [
            submissionContextUrl,
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
    } catch (error) {
      if (process.env.KEEPER_INTEGRATION_REQUIRE_LOCALHOST === "1") {
        throw error;
      }
      skip();
      return;
    }

    const contentId = nextContentId;
    expect(contentId).toBeGreaterThan(0n);

    const roundReferenceRatingBps = Number(
      await publicClient.readContract({
        address: CONTRACTS.roundVotingEngine,
        abi: RoundVotingEngineAbi,
        functionName: "previewCommitReferenceRatingBps",
        args: [contentId],
      }),
    );
    const roundId = (await publicClient.readContract({
      address: CONTRACTS.roundVotingEngine,
      abi: roundCommitPreviewAbi,
      functionName: "previewCommitRoundId",
      args: [contentId],
    })) as bigint;
    const voters = [
      {
        client: voter1Client,
        account: ACCOUNTS.voter1.address,
        isUp: true,
        salt: `0x${"11".repeat(32)}` as `0x${string}`,
      },
      {
        client: voter2Client,
        account: ACCOUNTS.voter2.address,
        isUp: true,
        salt: `0x${"22".repeat(32)}` as `0x${string}`,
      },
      {
        client: voter3Client,
        account: ACCOUNTS.voter3.address,
        isUp: false,
        salt: `0x${"33".repeat(32)}` as `0x${string}`,
      },
    ];

    for (const voter of voters) {
      await waitForReceipt(
        publicClient,
        await voter.client.writeContract({
          account: voter.account,
          chain: CHAIN,
          address: CONTRACTS.hrep,
          abi: HumanReputationAbi,
          functionName: "approve",
          args: [CONTRACTS.roundVotingEngine, STAKE],
        }),
      );

      const latestBlock = await publicClient.getBlock();
      const targetRound = roundAt(
        latestBlock.timestamp + BigInt(epochDurationSeconds) + drandPeriod,
        drandGenesisTime,
        drandPeriod,
      );
      expect(targetRound).toBeGreaterThan(0n);
      const ciphertext = encodeTestCiphertext({ ...voter, targetRound, drandChainHash });
      const commitHash = buildCommitHash(
        voter.isUp,
        voter.salt,
        voter.account,
        contentId,
        roundId,
        roundReferenceRatingBps,
        targetRound,
        drandChainHash,
        ciphertext,
      );

      const commitArgs = [
        contentId,
        roundReferenceRatingBps,
        targetRound,
        drandChainHash,
        commitHash,
        ciphertext,
        STAKE,
        "0x0000000000000000000000000000000000000000",
      ] as const;
      await publicClient.simulateContract({
        account: voter.account,
        address: CONTRACTS.roundVotingEngine,
        abi: RoundVotingEngineAbi as any,
        functionName: "commitVote",
        args: commitArgs,
      });
      await waitForReceipt(
        publicClient,
        await voter.client.writeContract({
          account: voter.account,
          chain: CHAIN,
          address: CONTRACTS.roundVotingEngine,
          abi: RoundVotingEngineAbi as any,
          functionName: "commitVote",
          args: commitArgs,
        }),
      );
    }

    const currentRoundId = (await publicClient.readContract({
      address: CONTRACTS.roundVotingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "currentRoundId",
      args: [contentId],
    })) as bigint;
    expect(currentRoundId).toBe(roundId);

    await increaseTime(publicClient, epochDurationSeconds + Number(drandPeriod) + 5);

    const result = await resolveRounds(publicClient as any, keeperClient as any, CHAIN, ACCOUNTS.keeper as any, logger as any);

    expect(result.votesRevealed).toBeGreaterThanOrEqual(3);
    expect(result.roundsSettled).toBeGreaterThanOrEqual(1);

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
  }, 30_000);
});
