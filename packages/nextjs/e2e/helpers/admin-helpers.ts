/**
 * Direct contract call helpers for admin/governance E2E tests.
 *
 * On local Anvil (chain 31337, local dev), the deployer (account #0)
 * serves as governance and holds all roles: ADMIN_ROLE, GOVERNANCE_ROLE,
 * CONFIG_ROLE. No impersonation needed.
 *
 * Pattern follows cancelExpiredRoundDirect() in keeper.ts — ABI-encode
 * the call with viem and send via eth_sendTransaction.
 */
import { parseRound } from "../../lib/contracts/roundVotingEngine";
import { buildQuestionSubmissionRevealCommitment } from "../../lib/questionSubmissionCommitment";
import { ANVIL_ACCOUNTS } from "./anvil-accounts";
import { runCommitAttempts } from "./commit-attempts";
import { type RpcSendResult, isRetryableDirectCommitSendResult } from "./direct-commit-retry";
import "./fetch-shim";
import { PONDER_URL } from "./ponder-url";
import { E2E_RPC_URL } from "./service-urls";
import { deriveAcceptedTlockTargetRound, deriveDrandRoundRevealableAtSeconds } from "./tlockRuntime";
import { createTlockVoteCommit, encodeVoteTransferPayload } from "@curyo/contracts/voting";

const ANVIL_RPC = E2E_RPC_URL;
// Contract gas costs shift as local protocol code evolves, so E2E helpers estimate
// gas instead of relying on a stale fixed cap for vote/settlement transactions.
const DEFAULT_TX_GAS_LIMIT = 10_000_000n;
const ESTIMATED_TX_GAS_BUFFER = 300_000n;
const DIRECT_VOTE_COMMIT_ATTEMPTS = 3;
const ANVIL_PRIVATE_KEYS_BY_ADDRESS = new Map(
  Object.values(ANVIL_ACCOUNTS).map(account => [account.address.toLowerCase(), account.privateKey as `0x${string}`]),
);

type SubmissionMedia = { imageUrls: string[]; videoUrl: string };
type SubmissionMediaInput = { imageUrls?: readonly string[]; videoUrl?: string };
type SubmissionRoundConfig = { epochDuration: number; maxDuration: number; minVoters: number; maxVoters: number };
const MAX_SUBMISSION_IMAGE_URLS = 4;
const DEFAULT_SUBMISSION_REWARD_ASSET_HREP = 0;
const DEFAULT_SUBMISSION_REWARD_AMOUNT = 1_000_000n;
const DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS = 3n;
const DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS = 1n;
const DEFAULT_SUBMISSION_REWARD_EXPIRES_AT = 0n;
const DEFAULT_QUESTION_METADATA_HASH = "0xed39b36e9ce5c1bfc657909c2f687347be2de998bc871eb8d33df17fdfa0d8cd" as const;
const DEFAULT_RESULT_SPEC_HASH = "0x8e5f27bc3269c62c92754f76279bd83838462060fc6cd77411b7407027cfa11f" as const;
const DEFAULT_SUBMISSION_ROUND_CONFIG: SubmissionRoundConfig = {
  epochDuration: 20 * 60,
  maxDuration: 7 * 24 * 60 * 60,
  minVoters: 3,
  maxVoters: 1000,
};
const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/\S+\.(?:avif|gif|jpe?g|png|webp)(?:[?#]\S*)?$/i;

function isSupportedImageUrl(url: string): boolean {
  return DIRECT_IMAGE_URL_PATTERN.test(url);
}

function isSupportedYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.length > 1;
    }

    if (parsed.hostname === "www.youtube.com" && parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.length > "/embed/".length;
    }

    const isWatchHost =
      parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com" || parsed.hostname === "m.youtube.com";
    return isWatchHost && parsed.pathname === "/watch" && parsed.searchParams.has("v");
  } catch {
    return false;
  }
}

function assertSupportedSubmissionMedia(media: SubmissionMedia): SubmissionMedia {
  const hasVideo = media.videoUrl.trim().length > 0;
  if (hasVideo) {
    if (media.imageUrls.length > 0) {
      throw new Error("E2E submissions must choose images or video, not both.");
    }
    if (!isSupportedYouTubeUrl(media.videoUrl)) {
      throw new Error(`Unsupported E2E submission video URL: ${media.videoUrl}`);
    }
    return media;
  }

  if (media.imageUrls.length > MAX_SUBMISSION_IMAGE_URLS) {
    throw new Error(`E2E submissions support at most ${MAX_SUBMISSION_IMAGE_URLS} images.`);
  }
  const unsupportedImageUrl = media.imageUrls.find(url => !isSupportedImageUrl(url));
  if (unsupportedImageUrl) {
    throw new Error(`Unsupported E2E submission image URL: ${unsupportedImageUrl}`);
  }

  return media;
}

async function rpcRequest<T = any>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error) return null;
  return (json.result ?? null) as T | null;
}

async function resolveTxGasLimit(from: string, to: string, data: `0x${string}`): Promise<bigint> {
  const estimate = await rpcRequest<`0x${string}`>("eth_estimateGas", [{ from, to, data }, "latest"]);
  if (!estimate) {
    return DEFAULT_TX_GAS_LIMIT;
  }

  return BigInt(estimate) + ESTIMATED_TX_GAS_BUFFER;
}

async function resolveProtocolConfigAddress(contractAddress: string): Promise<string> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "protocolConfig",
      type: "function",
      inputs: [],
      outputs: [{ name: "", type: "address" }],
      stateMutability: "view",
    },
  ] as const;

  const data = encodeFunctionData({ abi, functionName: "protocolConfig" });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, "latest"]);
  if (!result) return contractAddress;

  try {
    return decodeFunctionResult({
      abi,
      functionName: "protocolConfig",
      data: result,
    }) as string;
  } catch {
    return contractAddress;
  }
}

async function resolveRegistryAddressGetter(
  contractAddress: string,
  functionName: "hrepToken" | "questionRewardPoolEscrow",
) {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: functionName,
      type: "function",
      inputs: [],
      outputs: [{ name: "", type: "address" }],
      stateMutability: "view",
    },
  ] as const;

  const data = encodeFunctionData({ abi, functionName });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, "latest"]);
  if (!result) return null;

  try {
    return decodeFunctionResult({
      abi,
      functionName,
      data: result,
    }) as string;
  } catch {
    return null;
  }
}

async function buildSubmissionReservation(
  url: string,
  title: string,
  description: string,
  tags: string,
  categoryId: bigint,
  fromAddress: string,
  contractAddress: string,
  media: SubmissionMedia,
  rewardAmount: bigint = DEFAULT_SUBMISSION_REWARD_AMOUNT,
  roundConfig: SubmissionRoundConfig = DEFAULT_SUBMISSION_ROUND_CONFIG,
): Promise<{ revealCommitment: `0x${string}`; salt: `0x${string}` } | null> {
  const { decodeFunctionResult, encodeFunctionData, keccak256, stringToHex } = await import("viem");

  const previewAbi = [
    {
      name: "previewQuestionSubmissionKey",
      type: "function",
      inputs: [
        { name: "contextUrl", type: "string" },
        { name: "imageUrls", type: "string[]" },
        { name: "videoUrl", type: "string" },
        { name: "title", type: "string" },
        { name: "description", type: "string" },
        { name: "tags", type: "string" },
        { name: "categoryId", type: "uint256" },
      ],
      outputs: [
        { name: "resolvedCategoryId", type: "uint256" },
        { name: "submissionKey", type: "bytes32" },
      ],
      stateMutability: "view",
    },
  ] as const;
  const previewData = encodeFunctionData({
    abi: previewAbi,
    functionName: "previewQuestionSubmissionKey",
    args: [url, media.imageUrls, media.videoUrl, title, description, tags, categoryId],
  });

  const previewResult = await rpcRequest<`0x${string}`>("eth_call", [
    { to: contractAddress, data: previewData },
    "latest",
  ]);
  if (!previewResult) return null;

  const [, submissionKey] = decodeFunctionResult({
    abi: previewAbi,
    functionName: "previewQuestionSubmissionKey",
    data: previewResult,
  }) as readonly [bigint, `0x${string}`];

  const salt = keccak256(stringToHex(`${fromAddress}:${categoryId}:${JSON.stringify(media)}:${title}:${Date.now()}`));
  const revealCommitment = buildQuestionSubmissionRevealCommitment({
    categoryId,
    description,
    imageUrls: media.imageUrls,
    questionMetadataHash: DEFAULT_QUESTION_METADATA_HASH,
    rewardAmount,
    rewardAsset: DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
    requiredSettledRounds: DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
    requiredVoters: DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
    resultSpecHash: DEFAULT_RESULT_SPEC_HASH,
    rewardPoolExpiresAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT,
    feedbackClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT,
    roundConfig,
    salt,
    submissionKey,
    submitter: fromAddress as `0x${string}`,
    tags,
    title,
    videoUrl: media.videoUrl,
  });

  return { revealCommitment, salt };
}

async function resolveSubmissionRoundConfig(
  contractAddress: string,
  roundConfig?: SubmissionRoundConfig,
): Promise<SubmissionRoundConfig> {
  if (roundConfig) {
    return roundConfig;
  }

  try {
    const currentConfig = await readRoundConfig(contractAddress);
    return {
      epochDuration: Number(currentConfig.epochDuration),
      maxDuration: Number(currentConfig.maxDuration),
      minVoters: Number(currentConfig.minVoters),
      maxVoters: Number(currentConfig.maxVoters),
    };
  } catch {
    return DEFAULT_SUBMISSION_ROUND_CONFIG;
  }
}

function toSubmissionMedia(_url: string, media?: SubmissionMediaInput): SubmissionMedia {
  if (media) {
    return assertSupportedSubmissionMedia({
      imageUrls: media.imageUrls ? [...media.imageUrls] : [],
      videoUrl: media.videoUrl ?? "",
    });
  }

  return { imageUrls: [], videoUrl: "" };
}

/** Send a raw transaction to the Anvil RPC and report whether its outcome is known. */
async function sendTxViaRpc(from: string, to: string, data: `0x${string}`): Promise<RpcSendResult> {
  const gasLimit = await resolveTxGasLimit(from, to, data);
  // Impersonate the sender so accounts beyond Anvil's default 10 can send txs
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_impersonateAccount", params: [from], id: Date.now() }),
  });

  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_sendTransaction",
      params: [{ from, to, data, gas: `0x${gasLimit.toString(16)}` }],
      id: Date.now(),
    }),
  });
  const json = await res.json();

  // Stop impersonation (non-fatal if it fails)
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_stopImpersonatingAccount", params: [from], id: Date.now() }),
  });

  if (json.error) {
    console.error(`[sendTx] RPC error from=${from} to=${to}: ${JSON.stringify(json.error)}`);
    return { status: "unknown", error: JSON.stringify(json.error) };
  }

  // Anvil auto-mines, but the receipt may not be available instantly when
  // the keeper is also sending transactions. Retry a few times.
  const txHash = json.result as `0x${string}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const receiptRes = await fetch(ANVIL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: Date.now(),
      }),
    });
    const receiptJson = await receiptRes.json();
    const status = receiptJson.result?.status;
    if (status === "0x1") return { status: "success", txHash };
    if (status === "0x0") {
      // Log revert data for debugging
      const revertData = receiptJson.result?.revertReason || "no revert reason";
      console.error(`[sendTx] Tx reverted from=${from} to=${to} hash=${txHash} reason=${revertData}`);
      return { status: "reverted", txHash, reason: revertData };
    }
    // Receipt not yet available — wait and retry
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const error = `Transaction receipt for ${txHash} was still unavailable after polling; refusing to retry ambiguously`;
  console.error(`[sendTx] ${error}`);
  return { status: "unknown", txHash, error };
}

async function sendTx(from: string, to: string, data: `0x${string}`): Promise<boolean> {
  const gasLimit = await resolveTxGasLimit(from, to, data);
  const privateKey = ANVIL_PRIVATE_KEYS_BY_ADDRESS.get(from.toLowerCase());
  if (privateKey) {
    try {
      const [{ createPublicClient, createWalletClient, http }, { privateKeyToAccount }, { foundry }] =
        await Promise.all([import("viem"), import("viem/accounts"), import("viem/chains")]);
      const account = privateKeyToAccount(privateKey);
      const publicClient = createPublicClient({ chain: foundry, transport: http(ANVIL_RPC) });
      const walletClient = createWalletClient({ account, chain: foundry, transport: http(ANVIL_RPC) });
      const txHash = await walletClient.sendTransaction({
        to: to as `0x${string}`,
        data,
        gas: gasLimit,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return receipt.status === "success";
    } catch (error) {
      console.warn(`[sendTx] Signed tx failed from=${from} to=${to}; falling back to RPC send: ${String(error)}`);
    }
  }

  const result = await sendTxViaRpc(from, to, data);
  return result.status === "success";
}

async function readLatestBlockSnapshot(): Promise<{ blockTag: `0x${string}`; timestampSeconds: number }> {
  const block = await rpcRequest<{ number?: string; timestamp?: string }>("eth_getBlockByNumber", ["latest", false]);
  if (!block?.number || !block?.timestamp) {
    throw new Error("Failed to read latest block timestamp from Anvil");
  }

  const blockNumber = BigInt(block.number);
  return {
    blockTag: `0x${blockNumber.toString(16)}`,
    timestampSeconds: Number(BigInt(block.timestamp)),
  };
}

async function resolveTlockCommitRuntime(
  votingEngineAddress: string,
  contentId: bigint,
  commitRoundId: bigint,
): Promise<{ targetRound: bigint }> {
  const latestBlock = await readLatestBlockSnapshot();
  const currentRoundId = await readCurrentRoundId(votingEngineAddress, contentId, latestBlock.blockTag);
  const { epochDuration } = await readRoundConfig(votingEngineAddress);
  const drandConfig = await readRoundDrandConfig(votingEngineAddress, contentId, commitRoundId, latestBlock.blockTag);

  let roundStartTimeSeconds: number | null = null;
  if (currentRoundId > 0n && currentRoundId === commitRoundId) {
    const round = await readRoundAtBlock(votingEngineAddress, contentId, currentRoundId, latestBlock.blockTag);
    const parsedRound = parseRound(round);
    if (parsedRound?.state === 0 && parsedRound.startTime > 0n) {
      roundStartTimeSeconds = Number(parsedRound.startTime);
    }
  }

  const targetRound = deriveAcceptedTlockTargetRound({
    latestBlockTimestampSeconds: latestBlock.timestampSeconds,
    roundEpochDurationSeconds: Number(epochDuration),
    drandGenesisTimeSeconds: drandConfig.genesisTime,
    drandPeriodSeconds: drandConfig.period,
    roundStartTimeSeconds,
  });

  return { targetRound };
}

async function readRoundReferenceRatingBps(
  contractAddress: string,
  contentId: bigint,
  blockTag: `0x${string}`,
): Promise<number> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "previewCommitReferenceRatingBps",
      type: "function",
      inputs: [{ name: "contentId", type: "uint256" }],
      outputs: [{ name: "", type: "uint16" }],
      stateMutability: "view",
    },
  ] as const;

  const data = encodeFunctionData({
    abi,
    functionName: "previewCommitReferenceRatingBps",
    args: [contentId],
  });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, blockTag]);
  if (!result) {
    throw new Error("Failed to read previewCommitReferenceRatingBps from Anvil");
  }

  return decodeFunctionResult({
    abi,
    functionName: "previewCommitReferenceRatingBps",
    data: result,
  }) as number;
}

async function readPreviewCommitRoundId(
  contractAddress: string,
  contentId: bigint,
  blockTag: `0x${string}`,
): Promise<bigint> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "previewCommitRoundId",
      type: "function",
      inputs: [{ name: "contentId", type: "uint256" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;

  const data = encodeFunctionData({
    abi,
    functionName: "previewCommitRoundId",
    args: [contentId],
  });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, blockTag]);
  if (!result) {
    throw new Error("Failed to read previewCommitRoundId from Anvil");
  }

  return decodeFunctionResult({
    abi,
    functionName: "previewCommitRoundId",
    data: result,
  }) as bigint;
}

async function readCurrentRoundId(
  contractAddress: string,
  contentId: bigint,
  blockTag: `0x${string}`,
): Promise<bigint> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "currentRoundId",
      type: "function",
      inputs: [{ name: "contentId", type: "uint256" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "currentRoundId",
    args: [contentId],
  });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, blockTag]);
  if (!result) {
    throw new Error("Failed to read currentRoundId from Anvil");
  }

  return decodeFunctionResult({
    abi,
    functionName: "currentRoundId",
    data: result,
  }) as bigint;
}

async function readRoundAtBlock(
  contractAddress: string,
  contentId: bigint,
  roundId: bigint,
  blockTag: `0x${string}`,
): Promise<unknown> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "rounds",
      type: "function",
      inputs: [
        { name: "contentId", type: "uint256" },
        { name: "roundId", type: "uint256" },
      ],
      outputs: [
        {
          type: "tuple",
          components: [
            { name: "startTime", type: "uint256" },
            { name: "state", type: "uint8" },
            { name: "voteCount", type: "uint256" },
            { name: "revealedCount", type: "uint256" },
            { name: "totalStake", type: "uint256" },
            { name: "upPool", type: "uint256" },
            { name: "downPool", type: "uint256" },
            { name: "upCount", type: "uint256" },
            { name: "downCount", type: "uint256" },
            { name: "upWins", type: "bool" },
            { name: "settledAt", type: "uint256" },
            { name: "thresholdReachedAt", type: "uint256" },
            { name: "weightedUpPool", type: "uint256" },
            { name: "weightedDownPool", type: "uint256" },
          ],
        },
      ],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "rounds",
    args: [contentId, roundId],
  });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, blockTag]);
  if (!result) {
    throw new Error("Failed to read round data from Anvil");
  }

  return decodeFunctionResult({
    abi,
    functionName: "rounds",
    data: result,
  });
}

async function readRoundDrandConfig(
  contractAddress: string,
  contentId: bigint,
  roundId: bigint,
  blockTag: `0x${string}`,
): Promise<{ chainHash: `0x${string}`; genesisTime: bigint; period: bigint }> {
  const protocolConfigAddress = await resolveProtocolConfigAddress(contractAddress);
  if (roundId > 0n) {
    const [chainHash, genesisTime, period] = await Promise.all([
      readUintOrBytes32Getter(contractAddress, "roundDrandChainHashSnapshot", [contentId, roundId], blockTag),
      readUintOrBytes32Getter(contractAddress, "roundDrandGenesisTimeSnapshot", [contentId, roundId], blockTag),
      readUintOrBytes32Getter(contractAddress, "roundDrandPeriodSnapshot", [contentId, roundId], blockTag),
    ]);

    if (
      typeof chainHash === "string" &&
      chainHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
      typeof genesisTime === "bigint" &&
      genesisTime > 0n &&
      typeof period === "bigint" &&
      period > 0n
    ) {
      return { chainHash, genesisTime, period };
    }
  }

  const [chainHash, genesisTime, period] = await Promise.all([
    readUintOrBytes32Getter(protocolConfigAddress, "drandChainHash", [], blockTag),
    readUintOrBytes32Getter(protocolConfigAddress, "drandGenesisTime", [], blockTag),
    readUintOrBytes32Getter(protocolConfigAddress, "drandPeriod", [], blockTag),
  ]);

  if (typeof chainHash !== "string" || typeof genesisTime !== "bigint" || typeof period !== "bigint") {
    throw new Error("Failed to read drand config");
  }

  return { chainHash, genesisTime, period };
}

async function readUintOrBytes32Getter(
  contractAddress: string,
  functionName: string,
  args: readonly bigint[],
  blockTag: `0x${string}` | "latest",
): Promise<bigint | `0x${string}`> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const outputType = functionName.toLowerCase().includes("hash") ? "bytes32" : "uint64";
  const abi = [
    {
      name: functionName,
      type: "function",
      inputs: args.map((_, index) => ({ name: `arg${index}`, type: "uint256" })),
      outputs: [{ name: "", type: outputType }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName,
    args: [...args],
  });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, blockTag]);
  if (!result) {
    throw new Error(`Failed to read ${functionName} from Anvil`);
  }

  return decodeFunctionResult({
    abi,
    functionName,
    data: result,
  }) as bigint | `0x${string}`;
}

async function readCommitTiming(
  contractAddress: string,
  contentId: bigint,
  roundId: bigint,
  commitKey: `0x${string}`,
  blockTag: `0x${string}`,
): Promise<{ revealableAfter: bigint; targetRound: bigint } | null> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "commits",
      type: "function",
      inputs: [
        { name: "contentId", type: "uint256" },
        { name: "roundId", type: "uint256" },
        { name: "commitKey", type: "bytes32" },
      ],
      outputs: [
        { name: "voter", type: "address" },
        { name: "stakeAmount", type: "uint64" },
        { name: "ciphertext", type: "bytes" },
        { name: "targetRound", type: "uint64" },
        { name: "drandChainHash", type: "bytes32" },
        { name: "frontend", type: "address" },
        { name: "revealableAfter", type: "uint48" },
        { name: "revealed", type: "bool" },
        { name: "isUp", type: "bool" },
        { name: "epochIndex", type: "uint8" },
      ],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "commits",
    args: [contentId, roundId, commitKey],
  });
  const result = await rpcRequest<`0x${string}`>("eth_call", [{ to: contractAddress, data }, blockTag]);
  if (!result) {
    return null;
  }

  const commit = decodeFunctionResult({
    abi,
    functionName: "commits",
    data: result,
  }) as readonly [
    `0x${string}`,
    bigint,
    `0x${string}`,
    bigint,
    `0x${string}`,
    string,
    number,
    boolean,
    boolean,
    number,
  ];

  if (commit[0] === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  return {
    targetRound: commit[3],
    revealableAfter: BigInt(commit[6]),
  };
}

async function ensureCommitRevealable(
  contractAddress: string,
  contentId: bigint,
  roundId: bigint,
  commitKey: `0x${string}`,
): Promise<void> {
  const latestBlock = await readLatestBlockSnapshot();
  const commit = await readCommitTiming(contractAddress, contentId, roundId, commitKey, latestBlock.blockTag);
  if (!commit) {
    return;
  }

  const drandConfig = await readRoundDrandConfig(contractAddress, contentId, roundId, latestBlock.blockTag);
  const targetRoundRevealableAt = deriveDrandRoundRevealableAtSeconds({
    targetRound: commit.targetRound,
    drandGenesisTimeSeconds: drandConfig.genesisTime,
    drandPeriodSeconds: drandConfig.period,
  });
  const revealNotBefore =
    targetRoundRevealableAt > commit.revealableAfter ? targetRoundRevealableAt : commit.revealableAfter;
  const latestTimestamp = BigInt(latestBlock.timestampSeconds);
  if (latestTimestamp >= revealNotBefore) {
    return;
  }

  const secondsToIncrease = Number(revealNotBefore - latestTimestamp);
  if (!Number.isSafeInteger(secondsToIncrease) || secondsToIncrease <= 0) {
    return;
  }

  await evmIncreaseTime(secondsToIncrease);
}

/**
 * Add seeded category metadata directly.
 * Calls CategoryRegistry.addCategory(string, string, string[]).
 */
export async function addCategory(
  name: string,
  slug: string,
  subcategories: string[],
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "addCategory",
        type: "function",
        inputs: [
          { name: "name", type: "string" },
          { name: "slug", type: "string" },
          { name: "subcategories", type: "string[]" },
        ],
        outputs: [{ name: "categoryId", type: "uint256" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "addCategory",
    args: [name, slug, subcategories],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Register the caller as a frontend operator.
 * Calls FrontendRegistry.register().
 * Caller must have approved 1000 HREP to the FrontendRegistry.
 */
export async function registerFrontend(fromAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "register",
        type: "function",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "register",
    args: [],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Ask a question directly via contract call.
 * Caller funds the mandatory non-refundable HREP bounty during submission.
 * Returns true when the submission transaction succeeds.
 */
export async function submitContentDirect(
  url: string,
  title: string,
  description: string,
  tags: string,
  categoryId: number | bigint,
  fromAddress: string,
  contractAddress: string,
  mediaInput?: SubmissionMediaInput,
  rewardAmount: bigint = DEFAULT_SUBMISSION_REWARD_AMOUNT,
  roundConfig?: SubmissionRoundConfig,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const resolvedCategoryId = BigInt(categoryId);
  const media = toSubmissionMedia(url, mediaInput);
  const resolvedRoundConfig = await resolveSubmissionRoundConfig(contractAddress, roundConfig);
  const reservation = await buildSubmissionReservation(
    url,
    title,
    description,
    tags,
    resolvedCategoryId,
    fromAddress,
    contractAddress,
    media,
    rewardAmount,
    resolvedRoundConfig,
  );
  if (!reservation) return false;

  const [hrepTokenAddress, rewardEscrowAddress] = await Promise.all([
    resolveRegistryAddressGetter(contractAddress, "hrepToken"),
    resolveRegistryAddressGetter(contractAddress, "questionRewardPoolEscrow"),
  ]);
  if (!hrepTokenAddress || !rewardEscrowAddress) return false;

  const rewardApproved = await approveHREP(rewardEscrowAddress, rewardAmount, fromAddress, hrepTokenAddress);
  if (!rewardApproved) return false;

  const reserveData = encodeFunctionData({
    abi: [
      {
        name: "reserveSubmission",
        type: "function",
        inputs: [{ name: "revealCommitment", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "reserveSubmission",
    args: [reservation.revealCommitment],
  });
  const reserved = await sendTx(fromAddress, contractAddress, reserveData);
  if (!reserved) return false;

  await evmIncreaseTime(1);

  const data = encodeFunctionData({
    abi: [
      {
        name: "submitQuestionWithRewardAndRoundConfig",
        type: "function",
        inputs: [
          { name: "contextUrl", type: "string" },
          { name: "imageUrls", type: "string[]" },
          { name: "videoUrl", type: "string" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "tags", type: "string" },
          { name: "categoryId", type: "uint256" },
          { name: "salt", type: "bytes32" },
          {
            name: "rewardTerms",
            type: "tuple",
            components: [
              { name: "asset", type: "uint8" },
              { name: "amount", type: "uint256" },
              { name: "requiredVoters", type: "uint256" },
              { name: "requiredSettledRounds", type: "uint256" },
              { name: "bountyClosesAt", type: "uint256" },
              { name: "feedbackClosesAt", type: "uint256" },
            ],
          },
          {
            name: "roundConfig",
            type: "tuple",
            components: [
              { name: "epochDuration", type: "uint32" },
              { name: "maxDuration", type: "uint32" },
              { name: "minVoters", type: "uint16" },
              { name: "maxVoters", type: "uint16" },
            ],
          },
          {
            name: "spec",
            type: "tuple",
            components: [
              { name: "questionMetadataHash", type: "bytes32" },
              { name: "resultSpecHash", type: "bytes32" },
            ],
          },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "submitQuestionWithRewardAndRoundConfig",
    args: [
      url,
      media.imageUrls,
      media.videoUrl,
      title,
      description,
      tags,
      resolvedCategoryId,
      reservation.salt,
      {
        asset: DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
        amount: rewardAmount,
        requiredVoters: DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
        requiredSettledRounds: DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
        bountyClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT,
        feedbackClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT,
      },
      resolvedRoundConfig,
      {
        questionMetadataHash: DEFAULT_QUESTION_METADATA_HASH,
        resultSpecHash: DEFAULT_RESULT_SPEC_HASH,
      },
    ],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Cancel content before any votes (submitter only).
 * Calls ContentRegistry.cancelContent(uint256 contentId).
 */
export async function cancelContent(
  contentId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "cancelContent",
        type: "function",
        inputs: [{ name: "contentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "cancelContent",
    args: [BigInt(contentId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Deregister a frontend (operator only — must call from the registered address).
 * Calls FrontendRegistry.requestDeregister(). This only starts the unbonding period.
 */
export async function deregisterFrontend(fromAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "requestDeregister",
        type: "function",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "requestDeregister",
    args: [],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Complete a pending frontend deregistration after the unbonding period.
 * Calls FrontendRegistry.completeDeregister() to withdraw stake + pending fees.
 */
export async function completeDeregisterFrontend(fromAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "completeDeregister",
        type: "function",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "completeDeregister",
    args: [],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Slash a registered frontend's stake.
 * Calls FrontendRegistry.slashFrontend(address, uint256, string).
 * Requires GOVERNANCE_ROLE (deployer has it in local dev).
 */
export async function slashFrontend(
  frontendAddr: string,
  amount: bigint,
  reason: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "slashFrontend",
        type: "function",
        inputs: [
          { name: "frontend", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "reason", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "slashFrontend",
    args: [frontendAddr as `0x${string}`, amount, reason],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Unslash a frontend so it can be deregistered.
 * Calls FrontendRegistry.unslashFrontend(address).
 * Requires GOVERNANCE_ROLE (deployer in local dev).
 */
export async function unslashFrontend(
  frontendAddr: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "unslashFrontend",
        type: "function",
        inputs: [{ name: "frontend", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "unslashFrontend",
    args: [frontendAddr as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Advance the Anvil chain time by a given number of seconds.
 * Calls evm_increaseTime + evm_mine.
 */
export async function evmIncreaseTime(seconds: number): Promise<void> {
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 1 }),
  });
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 2 }),
  });
}

/**
 * Set the chain timestamp to an absolute value and mine a block.
 * Useful for syncing chain time back to real time in tests that
 * called evmIncreaseTime many times.
 */
export async function evmSetTimestamp(timestampSeconds: number): Promise<void> {
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "evm_setNextBlockTimestamp",
      params: [`0x${Math.floor(timestampSeconds).toString(16)}`],
      id: 1,
    }),
  });
  await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 2 }),
  });
}

/**
 * Mint a voter ID NFT for a holder.
 * Calls VoterIdNFT.mint(address to, uint256 nullifier).
 * Requires authorized minter (account #0 in local dev).
 */
export async function mintVoterId(
  holderAddress: string,
  nullifier: bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "mint",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "nullifier", type: "uint256" },
        ],
        outputs: [{ name: "tokenId", type: "uint256" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "mint",
    args: [holderAddress as `0x${string}`, nullifier],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Revoke a voter ID NFT from a holder.
 * Calls VoterIdNFT.revokeVoterId(address holder).
 * Requires owner (deployer in local dev).
 */
export async function revokeVoterId(
  holderAddress: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "revokeVoterId",
        type: "function",
        inputs: [{ name: "holder", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "revokeVoterId",
    args: [holderAddress as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Mark content as dormant after DORMANCY_PERIOD (30 days) of inactivity.
 * Calls ContentRegistry.markDormant(uint256 contentId).
 * Permissionless — anyone can call after the dormancy period expires.
 */
export async function markDormant(
  contentId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "markDormant",
        type: "function",
        inputs: [{ name: "contentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "markDormant",
    args: [BigInt(contentId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Revive dormant content by staking 5 HREP.
 * Calls ContentRegistry.reviveContent(uint256 contentId).
 * Requires caller to have approved 5 HREP (5e6) to the ContentRegistry.
 */
export async function reviveContent(
  contentId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "reviveContent",
        type: "function",
        inputs: [{ name: "contentId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "reviveContent",
    args: [BigInt(contentId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Transfer HREP tokens from one address to another.
 * Calls HumanReputation.transfer(address to, uint256 amount).
 */
export async function transferHREP(
  toAddress: string,
  amount: bigint,
  fromAddress: string,
  tokenAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "transfer",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "transfer",
    args: [toAddress as `0x${string}`, amount],
  });
  return sendTx(fromAddress, tokenAddress, data);
}

/**
 * Approve ERC20 token spending.
 * Calls HumanReputation.approve(address spender, uint256 amount).
 */
export async function approveHREP(
  spender: string,
  amount: bigint,
  fromAddress: string,
  tokenAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "approve",
        type: "function",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "approve",
    args: [spender as `0x${string}`, amount],
  });
  return sendTx(fromAddress, tokenAddress, data);
}

/**
 * Claim participation reward after round settlement.
 * Calls RoundRewardDistributor.claimParticipationReward(uint256 contentId, uint256 roundId).
 * Any voter in the round can call — reverts with AlreadyClaimed on double claim.
 */
export async function claimParticipationReward(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimParticipationReward",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimParticipationReward",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Claim frontend fees for a settled round.
 * Calls RoundRewardDistributor.claimFrontendFee(uint256 contentId, uint256 roundId, address frontend).
 * Permissionless, but the fee is credited or paid to the frontend specified in the round snapshot.
 */
export async function claimFrontendFee(
  contentId: number | bigint,
  roundId: number | bigint,
  frontendAddress: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimFrontendFee",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "frontend", type: "address" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimFrontendFee",
    args: [BigInt(contentId), BigInt(roundId), frontendAddress as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Route a settled frontend fee to protocol once the frontend is slashed or underbonded.
 * Calls RoundRewardDistributor.confiscateFrontendFee(uint256 contentId, uint256 roundId, address frontend).
 * Admin only.
 */
export async function confiscateFrontendFee(
  contentId: number | bigint,
  roundId: number | bigint,
  frontendAddress: string,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "confiscateFrontendFee",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "frontend", type: "address" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "confiscateFrontendFee",
    args: [BigInt(contentId), BigInt(roundId), frontendAddress as `0x${string}`],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Check if an address has a VoterID on-chain (not Ponder).
 * Calls holderToTokenId(address) — returns true if tokenId > 0.
 */
export async function hasVoterIdOnChain(holderAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: "holderToTokenId",
      type: "function",
      inputs: [{ name: "holder", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "holderToTokenId",
    args: [holderAddress as `0x${string}`],
  });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return false;
  const tokenId = decodeFunctionResult({ abi, functionName: "holderToTokenId", data: json.result });
  return tokenId > 0n;
}

/**
 * Get full frontend info from chain.
 * Calls FrontendRegistry.getFrontendInfo(address).
 */
export async function getFrontendInfoOnChain(
  frontendAddr: string,
  contractAddress: string,
): Promise<{ registered: boolean; stakedAmount: bigint; eligible: boolean; slashed: boolean }> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: "getFrontendInfo",
      type: "function",
      inputs: [{ name: "frontend", type: "address" }],
      outputs: [
        { name: "operator", type: "address" },
        { name: "stakedAmount", type: "uint256" },
        { name: "eligible", type: "bool" },
        { name: "slashed", type: "bool" },
      ],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "getFrontendInfo",
    args: [frontendAddr as `0x${string}`],
  });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return { registered: false, stakedAmount: 0n, eligible: false, slashed: false };
  const [operator, stakedAmount, eligible, slashed] = decodeFunctionResult({
    abi,
    functionName: "getFrontendInfo",
    data: json.result,
  });
  return {
    registered: operator !== "0x0000000000000000000000000000000000000000",
    stakedAmount,
    eligible,
    slashed,
  };
}

/**
 * Read accumulated frontend fees from the FrontendRegistry.
 */
export async function getFrontendAccumulatedFees(frontendAddr: string, contractAddress: string): Promise<bigint> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "getAccumulatedFees",
      type: "function",
      inputs: [{ name: "frontend", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "getAccumulatedFees",
    args: [frontendAddr as `0x${string}`],
  });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return 0n;
  return decodeFunctionResult({ abi, functionName: "getAccumulatedFees", data: json.result }) as bigint;
}

// ============================================================
// ROUND VOTING ENGINE — tlock commit-reveal direct contract calls
// ============================================================

async function resolveVoteCommitEpochDurationSeconds(
  votingEngineAddress: string,
  epochDurationSeconds?: number,
): Promise<number> {
  if (epochDurationSeconds != null) {
    return epochDurationSeconds;
  }

  const { epochDuration } = await readRoundConfig(votingEngineAddress);
  return Number(epochDuration);
}

async function buildVoteCommitSalt(
  fromAddress: string,
  contentId: bigint,
  attemptIndex: number,
): Promise<`0x${string}`> {
  const { encodePacked, keccak256 } = await import("viem");
  return keccak256(
    encodePacked(
      ["address", "uint256", "uint256", "uint8"],
      [fromAddress as `0x${string}`, contentId, BigInt(Date.now()), attemptIndex],
    ),
  );
}

/**
 * Commit a vote directly via contract call (tlock commit-reveal).
 * Encrypts vote direction with drand tlock and computes commitHash/commitKey.
 * Caller must have approved stakeAmount of HREP to the RoundVotingEngine.
 *
 * Returns { success, commitKey, isUp, salt } for later reveal.
 */
export async function commitVoteDirect(
  contentId: number | bigint,
  isUp: boolean,
  stakeAmount: bigint,
  frontend: string,
  fromAddress: string,
  contractAddress: string,
  epochDurationSeconds?: number,
): Promise<{ success: boolean; retryable: boolean; commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }> {
  const { encodeFunctionData } = await import("viem");
  const resolvedEpochDurationSeconds = await resolveVoteCommitEpochDurationSeconds(
    contractAddress,
    epochDurationSeconds,
  );
  const contentIdBigInt = BigInt(contentId);

  return runCommitAttempts({
    attempts: DIRECT_VOTE_COMMIT_ATTEMPTS,
    attempt: async attemptIndex => {
      const salt = await buildVoteCommitSalt(fromAddress, contentIdBigInt, attemptIndex);
      const latestBlock = await readLatestBlockSnapshot();
      const roundId = await readPreviewCommitRoundId(contractAddress, contentIdBigInt, latestBlock.blockTag);
      const roundReferenceRatingBps = await readRoundReferenceRatingBps(
        contractAddress,
        contentIdBigInt,
        latestBlock.blockTag,
      );
      const tlockRuntime = await resolveTlockCommitRuntime(contractAddress, contentIdBigInt, roundId);
      const {
        ciphertext,
        commitHash: chash,
        commitKey: ckey,
        targetRound,
        drandChainHash,
      } = await createTlockVoteCommit(
        {
          voter: fromAddress as `0x${string}`,
          isUp,
          salt,
          contentId: contentIdBigInt,
          roundId,
          roundReferenceRatingBps,
          epochDurationSeconds: resolvedEpochDurationSeconds,
        },
        {
          targetRound: tlockRuntime.targetRound,
        },
      );

      const data = encodeFunctionData({
        abi: [
          {
            name: "commitVote",
            type: "function",
            inputs: [
              { name: "contentId", type: "uint256" },
              { name: "roundReferenceRatingBps", type: "uint16" },
              { name: "targetRound", type: "uint64" },
              { name: "drandChainHash", type: "bytes32" },
              { name: "commitHash", type: "bytes32" },
              { name: "ciphertext", type: "bytes" },
              { name: "stakeAmount", type: "uint256" },
              { name: "frontend", type: "address" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ] as any,
        functionName: "commitVote",
        args: [
          contentIdBigInt,
          roundReferenceRatingBps,
          targetRound,
          drandChainHash,
          chash,
          ciphertext,
          stakeAmount,
          frontend as `0x${string}`,
        ],
      });

      const sendResult = await sendTxViaRpc(fromAddress, contractAddress, data);
      return {
        success: sendResult.status === "success",
        retryable: isRetryableDirectCommitSendResult(sendResult),
        commitKey: ckey!,
        isUp,
        salt,
      };
    },
    isSuccess: result => result.success,
    shouldRetry: result => result.retryable,
    onRetry: attemptIndex => {
      console.warn(
        `[commitVoteDirect] Retrying stale tlock commit for ${fromAddress} on content ${contentIdBigInt.toString()} (attempt ${attemptIndex + 2}/${DIRECT_VOTE_COMMIT_ATTEMPTS})`,
      );
    },
  });
}

/**
 * Commit a vote via the single-transaction ERC-1363 transferAndCall path.
 * Transfers HREP to the voting engine and commits the encrypted vote atomically.
 */
export async function commitVoteWithTransferAndCallDirect(
  contentId: number | bigint,
  isUp: boolean,
  stakeAmount: bigint,
  frontend: string,
  fromAddress: string,
  tokenAddress: string,
  votingEngineAddress: string,
  epochDurationSeconds?: number,
): Promise<{ success: boolean; retryable: boolean; commitKey: `0x${string}`; isUp: boolean; salt: `0x${string}` }> {
  const { encodeFunctionData } = await import("viem");
  const resolvedEpochDurationSeconds = await resolveVoteCommitEpochDurationSeconds(
    votingEngineAddress,
    epochDurationSeconds,
  );
  const contentIdBigInt = BigInt(contentId);

  return runCommitAttempts({
    attempts: DIRECT_VOTE_COMMIT_ATTEMPTS,
    attempt: async attemptIndex => {
      const salt = await buildVoteCommitSalt(fromAddress, contentIdBigInt, attemptIndex);
      const latestBlock = await readLatestBlockSnapshot();
      const roundId = await readPreviewCommitRoundId(votingEngineAddress, contentIdBigInt, latestBlock.blockTag);
      const roundReferenceRatingBps = await readRoundReferenceRatingBps(
        votingEngineAddress,
        contentIdBigInt,
        latestBlock.blockTag,
      );
      const tlockRuntime = await resolveTlockCommitRuntime(votingEngineAddress, contentIdBigInt, roundId);
      const {
        ciphertext,
        commitHash: chash,
        commitKey: ckey,
        targetRound,
        drandChainHash,
      } = await createTlockVoteCommit(
        {
          voter: fromAddress as `0x${string}`,
          isUp,
          salt,
          contentId: contentIdBigInt,
          roundId,
          roundReferenceRatingBps,
          epochDurationSeconds: resolvedEpochDurationSeconds,
        },
        {
          targetRound: tlockRuntime.targetRound,
        },
      );

      const payload = encodeVoteTransferPayload({
        contentId: contentIdBigInt,
        roundReferenceRatingBps,
        commitHash: chash,
        ciphertext,
        targetRound,
        drandChainHash,
        frontend: frontend as `0x${string}`,
      });

      const data = encodeFunctionData({
        abi: [
          {
            name: "transferAndCall",
            type: "function",
            inputs: [
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "data", type: "bytes" },
            ],
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "transferAndCall",
        args: [votingEngineAddress as `0x${string}`, stakeAmount, payload],
      });

      const sendResult = await sendTxViaRpc(fromAddress, tokenAddress, data);
      return {
        success: sendResult.status === "success",
        retryable: isRetryableDirectCommitSendResult(sendResult),
        commitKey: ckey!,
        isUp,
        salt,
      };
    },
    isSuccess: result => result.success,
    shouldRetry: result => result.retryable,
    onRetry: attemptIndex => {
      console.warn(
        `[commitVoteWithTransferAndCallDirect] Retrying stale tlock commit for ${fromAddress} on content ${contentIdBigInt.toString()} (attempt ${attemptIndex + 2}/${DIRECT_VOTE_COMMIT_ATTEMPTS})`,
      );
    },
  });
}

/**
 * Reveal a committed vote via contract call.
 * Calls revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt).
 * Anyone can reveal — the keeper normally does this after epoch ends.
 */
export async function revealVoteDirect(
  contentId: number | bigint,
  roundId: number | bigint,
  commitKey: `0x${string}`,
  isUp: boolean,
  salt: `0x${string}`,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  await ensureCommitRevealable(contractAddress, BigInt(contentId), BigInt(roundId), commitKey);
  const data = encodeFunctionData({
    abi: [
      {
        name: "revealVoteByCommitKey",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "commitKey", type: "bytes32" },
          { name: "isUp", type: "bool" },
          { name: "salt", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "revealVoteByCommitKey",
    args: [BigInt(contentId), BigInt(roundId), commitKey, isUp, salt],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Settle a round via contract call.
 * Calls settleRound(contentId, roundId).
 * Requires: ≥minVoters revealed.
 */
export async function settleRoundDirect(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "settleRound",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "settleRound",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  const ok = await sendTx(fromAddress, contractAddress, data);
  if (ok) return true;

  // The keeper may have already settled this round — check round state.
  // State 1 = Settled, 3 = Tied — both are acceptable outcomes.
  const stateData = encodeFunctionData({
    abi: [
      {
        name: "rounds",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [
          {
            name: "",
            type: "tuple",
            components: [
              { name: "startTime", type: "uint256" },
              { name: "state", type: "uint8" },
            ],
          },
        ],
        stateMutability: "view",
      },
    ],
    functionName: "rounds",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  try {
    const res = await fetch(ANVIL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: contractAddress, data: stateData }, "latest"],
        id: Date.now(),
      }),
    });
    const json = await res.json();
    if (json.result) {
      // state is at byte offset 32 (second word in the tuple)
      const stateHex = "0x" + json.result.slice(66, 130);
      const state = parseInt(stateHex, 16);
      if (state === 1 || state === 3) {
        console.log(`[settleRoundDirect] Round already settled by keeper (state=${state})`);
        return true;
      }
    }
  } catch {
    // Fall through — return false
  }
  return false;
}

/**
 * Finalize a round that hit commit quorum but never reached reveal quorum.
 * Calls finalizeRevealFailedRound(contentId, roundId).
 */
export async function finalizeRevealFailedRound(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "finalizeRevealFailedRound",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "finalizeRevealFailedRound",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Process unrevealed votes after settlement.
 * Calls processUnrevealedVotes(contentId, roundId, startIndex, count).
 * Routes settled past-epoch stakes to the consensus reserve, forfeits
 * tied/reveal-failed stakes to treasury, and refunds current/future-epoch stakes.
 */
export async function processUnrevealedVotes(
  contentId: number | bigint,
  roundId: number | bigint,
  startIndex: number,
  count: number,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "processUnrevealedVotes",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "startIndex", type: "uint256" },
          { name: "count", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "processUnrevealedVotes",
    args: [BigInt(contentId), BigInt(roundId), BigInt(startIndex), BigInt(count)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Claim refund from a cancelled round.
 * Calls claimCancelledRoundRefund(contentId, roundId).
 * All voters can refund cancelled/tied rounds; reveal-failed rounds require a revealed vote.
 */
export async function claimCancelledRoundRefund(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimCancelledRoundRefund",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimCancelledRoundRefund",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Claim a settled-round voter payout.
 * Winners receive stake plus winnings; revealed losers receive the fixed rebate.
 */
export async function claimVoterReward(
  contentId: number | bigint,
  roundId: number | bigint,
  fromAddress: string,
  contractAddress: string,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimReward",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimReward",
    args: [BigInt(contentId), BigInt(roundId)],
  });
  return sendTx(fromAddress, contractAddress, data);
}

/**
 * Read a public uint256 view function from a contract (e.g. consensusReserve).
 */
export async function readUint256(functionName: string, contractAddress: string, args: bigint[] = []): Promise<bigint> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: functionName,
      type: "function",
      inputs: args.map((_, i) => ({ name: `arg${i}`, type: "uint256" })),
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({ abi, functionName, args });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return 0n;
  return decodeFunctionResult({ abi, functionName, data: json.result }) as bigint;
}

/**
 * Read a public bool view function from a contract.
 */
export async function readBool(functionName: string, contractAddress: string, args: bigint[] = []): Promise<boolean> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: functionName,
      type: "function",
      inputs: args.map((_, i) => ({ name: `arg${i}`, type: "uint256" })),
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({ abi, functionName, args });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return false;
  return decodeFunctionResult({ abi, functionName, data: json.result }) as boolean;
}

/**
 * Read a public address view function from a contract (e.g. treasury()).
 */
export async function readAddress(functionName: string, contractAddress: string): Promise<`0x${string}`> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: functionName,
      type: "function",
      inputs: [],
      outputs: [{ name: "", type: "address" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({ abi, functionName, args: [] });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return "0x0000000000000000000000000000000000000000";
  return decodeFunctionResult({ abi, functionName, data: json.result }) as `0x${string}`;
}

/**
 * Read an ERC20 token balance via balanceOf(address).
 */
export async function readTokenBalance(holder: string, tokenAddress: string): Promise<bigint> {
  const { decodeFunctionResult, encodeFunctionData } = await import("viem");
  const abi = [
    {
      name: "balanceOf",
      type: "function",
      inputs: [{ name: "holder", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: "balanceOf",
    args: [holder as `0x${string}`],
  });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: tokenAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) return 0n;
  return decodeFunctionResult({ abi, functionName: "balanceOf", data: json.result }) as bigint;
}

/**
 * Read the active round ID for a content item.
 */
export async function getActiveRoundId(contentId: number | bigint, contractAddress: string): Promise<bigint> {
  const { encodeFunctionData } = await import("viem");
  const currentRoundId = await readUint256("currentRoundId", contractAddress, [BigInt(contentId)]);
  if (currentRoundId === 0n) {
    return 0n;
  }

  const data = encodeFunctionData({
    abi: [
      {
        name: "rounds",
        type: "function",
        inputs: [
          { name: "contentId", type: "uint256" },
          { name: "roundId", type: "uint256" },
        ],
        outputs: [
          {
            name: "startTime",
            type: "uint256",
          },
          {
            name: "state",
            type: "uint8",
          },
        ],
        stateMutability: "view",
      },
    ],
    functionName: "rounds",
    args: [BigInt(contentId), currentRoundId],
  });

  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) {
    return 0n;
  }

  const stateHex = "0x" + json.result.slice(66, 130);
  const state = parseInt(stateHex, 16);
  return state === 0 ? currentRoundId : 0n;
}

/**
 * Generic Ponder polling helper. Polls until the predicate returns true or timeout.
 */
export async function waitForPonderIndexed(
  pollFn: () => Promise<boolean>,
  maxWaitMs = 60_000,
  pollInterval = 2_000,
  label = "waitForPonderIndexed",
): Promise<boolean> {
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < maxWaitMs) {
    attempts++;
    try {
      if (await pollFn()) return true;
    } catch (err) {
      console.warn(`[${label}] attempt ${attempts} error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.warn(`[${label}] timed out after ${elapsed}s (${attempts} attempts)`);
  return false;
}

/**
 * Read the current round config tuple.
 * Accepts a ProtocolConfig address directly or a contract that exposes protocolConfig().
 */
export async function readRoundConfig(contractAddress: string): Promise<{
  epochDuration: bigint;
  maxDuration: bigint;
  minVoters: bigint;
  maxVoters: bigint;
}> {
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const abi = [
    {
      name: "config",
      type: "function",
      inputs: [],
      outputs: [
        { name: "epochDuration", type: "uint256" },
        { name: "maxDuration", type: "uint256" },
        { name: "minVoters", type: "uint256" },
        { name: "maxVoters", type: "uint256" },
      ],
      stateMutability: "view",
    },
  ] as const;
  const configAddress = await resolveProtocolConfigAddress(contractAddress);
  const data = encodeFunctionData({ abi, functionName: "config" });
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: configAddress, data }, "latest"],
      id: Date.now(),
    }),
  });
  const json = await res.json();
  if (json.error || !json.result) throw new Error(`readRoundConfig failed: ${JSON.stringify(json.error)}`);
  const [epochDuration, maxDuration, minVoters, maxVoters] = decodeFunctionResult({
    abi,
    functionName: "config",
    data: json.result,
  });
  return { epochDuration, maxDuration, minVoters, maxVoters };
}

/**
 * Set test-friendly round config on ProtocolConfig.
 * Accepts either a RoundVotingEngine address (resolves its ProtocolConfig)
 * or a ProtocolConfig address directly.
 * Requires CONFIG_ROLE (account #9 / DEPLOYER in local dev).
 */
export async function setTestConfig(
  contractAddress: string,
  fromAddress: string,
  epochDuration = 300,
  maxDuration = 86400,
  minVoters = 3,
  maxVoters = 100,
): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const configAddress = await resolveProtocolConfigAddress(contractAddress);
  const data = encodeFunctionData({
    abi: [
      {
        name: "setConfig",
        type: "function",
        inputs: [
          { name: "_epochDuration", type: "uint256" },
          { name: "_maxDuration", type: "uint256" },
          { name: "_minVoters", type: "uint256" },
          { name: "_maxVoters", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "setConfig",
    args: [BigInt(epochDuration), BigInt(maxDuration), BigInt(minVoters), BigInt(maxVoters)],
  });
  return sendTx(fromAddress, configAddress, data);
}

/**
 * Wait for Ponder to catch up to the current chain block number.
 * Call this after mining blocks to ensure Ponder has processed all new blocks
 * before polling for specific indexed data.
 */
export async function waitForPonderSync(
  maxWaitMs = 120_000,
  pollInterval = 2_000,
  ponderURL = PONDER_URL,
): Promise<boolean> {
  // Get current chain block number
  const blockRes = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: Date.now() }),
  });
  const blockJson = await blockRes.json();
  const chainBlock = parseInt(blockJson.result, 16);

  const start = Date.now();
  let lastPonderBlock = 0;
  while (Date.now() - start < maxWaitMs) {
    try {
      const statusRes = await fetch(`${ponderURL}/status`);
      if (statusRes.ok) {
        const status = await statusRes.json();
        const ponderBlock = status?.hardhat?.block?.number ?? 0;
        lastPonderBlock = ponderBlock;
        if (ponderBlock >= chainBlock) return true;
      }
    } catch {
      // Ponder may not be ready yet
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.warn(
    `[waitForPonderSync] timed out after ${elapsed}s — chain block: ${chainBlock}, ponder block: ${lastPonderBlock}`,
  );
  return false;
}

/**
 * Withdraw accumulated frontend fees via FrontendRegistry.claimFees().
 * Must be called by the frontend operator address. Transfers HREP from
 * the registry to the operator's wallet.
 */
export async function claimFrontendFees(fromAddress: string, contractAddress: string): Promise<boolean> {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: [
      {
        name: "claimFees",
        type: "function",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "claimFees",
    args: [],
  });
  return sendTx(fromAddress, contractAddress, data);
}
