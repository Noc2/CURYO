import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPublicClient, createWalletClient, defineChain, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ContentRegistryAbi, CuryoReputationAbi, RoundVotingEngineAbi } from "@curyo/contracts/abis";
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
    const [flag, saltHex] = armored.split(":");
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

import { resolveRounds } from "../keeper.js";

const DEPLOY_BROADCAST_PATH = resolve(
  process.cwd(),
  "..",
  "foundry",
  "broadcast",
  "Deploy.s.sol",
  "31337",
  "run-latest.json",
);

function readLocalDeploymentAddresses() {
  let broadcastRaw: string;
  try {
    broadcastRaw = readFileSync(DEPLOY_BROADCAST_PATH, "utf8");
  } catch {
    return {
      CuryoReputation: undefined,
      ContentRegistry: undefined,
      RoundVotingEngine: undefined,
    };
  }

  const broadcast = JSON.parse(broadcastRaw) as {
    transactions?: Array<{
      contractName?: string;
      contractAddress?: string;
    }>;
  };
  const addresses = new Map<string, `0x${string}`>();
  for (const tx of broadcast.transactions ?? []) {
    if (!tx.contractName || !tx.contractAddress) {
      continue;
    }
    if (!addresses.has(tx.contractName)) {
      addresses.set(tx.contractName, tx.contractAddress as `0x${string}`);
    }
  }

  return {
    CuryoReputation: addresses.get("CuryoReputation"),
    ContentRegistry: addresses.get("ContentRegistry"),
    RoundVotingEngine: addresses.get("RoundVotingEngine"),
  };
}

const localDeployment = readLocalDeploymentAddresses();
const CONTRACTS = {
  crep: localDeployment.CuryoReputation ?? "0x0000000000000000000000000000000000000000",
  contentRegistry: localDeployment.ContentRegistry ?? "0x0000000000000000000000000000000000000000",
  roundVotingEngine: localDeployment.RoundVotingEngine ?? "0x0000000000000000000000000000000000000000",
} as const;

const ACCOUNTS = {
  keeper: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
  submitter: privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
  voter1: privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"),
  voter2: privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"),
  voter3: privateKeyToAccount("0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"),
  deployer: privateKeyToAccount("0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"),
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

function encodeTestCiphertext(isUp: boolean, salt: `0x${string}`): `0x${string}` {
  return stringToHex(`${isUp ? "1" : "0"}:${salt.slice(2)}`) as `0x${string}`;
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
  let deployerClient: ReturnType<typeof createWalletClient>;
  let integrationReady = false;

  beforeAll(async () => {
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
    deployerClient = createWalletClient({
      account: ACCOUNTS.deployer,
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
      }
    } catch {
      integrationReady = false;
    }
  });

  it("reveals and settles a real local round via the keeper", async ({ skip }) => {
    if (!integrationReady) {
      skip();
    }

    const logger = makeLogger();
    const epochDuration = 300n;
    const maxDuration = 86_400n;

    await waitForReceipt(
      publicClient,
      await deployerClient.writeContract({
        address: CONTRACTS.roundVotingEngine,
        abi: RoundVotingEngineAbi,
        functionName: "setConfig",
        args: [epochDuration, maxDuration, 3n, 100n],
      }),
    );

    const nextContentId = (await publicClient.readContract({
      address: CONTRACTS.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "nextContentId",
      args: [],
    })) as bigint;

    await waitForReceipt(
      publicClient,
      await submitterClient.writeContract({
        address: CONTRACTS.crep,
        abi: CuryoReputationAbi,
        functionName: "approve",
        args: [CONTRACTS.contentRegistry, STAKE],
      }),
    );

    await waitForReceipt(
      publicClient,
      await submitterClient.writeContract({
        address: CONTRACTS.contentRegistry,
        abi: ContentRegistryAbi,
        functionName: "submitContent",
        args: [
          `https://example.com/keeper-integration-${Date.now()}`,
          "Keeper integration test",
          "integration",
          1n,
        ],
      }),
    );

    const contentId = nextContentId;
    const voters = [
      { client: voter1Client, account: ACCOUNTS.voter1.address, isUp: true, salt: `0x${"11".repeat(32)}` as `0x${string}` },
      { client: voter2Client, account: ACCOUNTS.voter2.address, isUp: true, salt: `0x${"22".repeat(32)}` as `0x${string}` },
      { client: voter3Client, account: ACCOUNTS.voter3.address, isUp: false, salt: `0x${"33".repeat(32)}` as `0x${string}` },
    ];

    for (const voter of voters) {
      await waitForReceipt(
        publicClient,
        await voter.client.writeContract({
          address: CONTRACTS.crep,
          abi: CuryoReputationAbi,
          functionName: "approve",
          args: [CONTRACTS.roundVotingEngine, STAKE],
        }),
      );

      const ciphertext = encodeTestCiphertext(voter.isUp, voter.salt);
      const commitHash = buildCommitHash(voter.isUp, voter.salt, contentId, ciphertext);

      await waitForReceipt(
        publicClient,
        await voter.client.writeContract({
          address: CONTRACTS.roundVotingEngine,
          abi: RoundVotingEngineAbi,
          functionName: "commitVote",
          args: [contentId, commitHash, ciphertext, STAKE, "0x0000000000000000000000000000000000000000"],
        }),
      );
    }

    const roundId = (await publicClient.readContract({
      address: CONTRACTS.roundVotingEngine,
      abi: RoundVotingEngineAbi,
      functionName: "getActiveRoundId",
      args: [contentId],
    })) as bigint;
    expect(roundId).toBeGreaterThan(0n);

    await increaseTime(publicClient, Number(epochDuration + 1n));

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
      functionName: "getRound",
      args: [contentId, roundId],
    })) as {
      state: number;
      revealedCount: bigint;
      thresholdReachedAt: bigint;
      settledAt: bigint;
    };

    expect(round.revealedCount).toBe(3n);
    expect(round.thresholdReachedAt).toBeGreaterThan(0n);
    expect(round.settledAt).toBeGreaterThan(0n);
    expect(round.state).toBe(1);
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("Failed"));
  });
});
