"use client";

import { isAddress, parseUnits } from "viem";
import { contracts } from "~~/utils/scaffold-eth/contract";

const SUBMISSION_REWARD_DECIMALS = 6;
export const MIN_REWARD_POOL_REQUIRED_VOTERS = 3;
export const MIN_REWARD_POOL_SETTLED_ROUNDS = 1;
export const DEFAULT_REWARD_POOL_FRONTEND_FEE_BPS = 300;
export const DEFAULT_SUBMISSION_REWARD_POOL = 1_000_000n;
export const SUBMISSION_REWARD_ASSET_CREP = 0;
export const SUBMISSION_REWARD_ASSET_USDC = 1;

export type SubmissionRewardAsset = "crep" | "usdc";

export const QUESTION_SUBMISSION_ABI = [
  {
    type: "function",
    name: "previewQuestionSubmissionKey",
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
  {
    type: "function",
    name: "previewQuestionMediaSubmissionKey",
    inputs: [
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
  {
    type: "function",
    name: "submitQuestionWithReward",
    inputs: [
      { name: "contextUrl", type: "string" },
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "tags", type: "string" },
      { name: "categoryId", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "rewardAsset", type: "uint8" },
      { name: "rewardAmount", type: "uint256" },
      { name: "requiredVoters", type: "uint256" },
      { name: "requiredSettledRounds", type: "uint256" },
      { name: "rewardPoolExpiresAt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitQuestion",
    inputs: [
      { name: "contextUrl", type: "string" },
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "tags", type: "string" },
      { name: "categoryId", type: "uint256" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitQuestionWithMediaWithReward",
    inputs: [
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "tags", type: "string" },
      { name: "categoryId", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "rewardAsset", type: "uint8" },
      { name: "rewardAmount", type: "uint256" },
      { name: "requiredVoters", type: "uint256" },
      { name: "requiredSettledRounds", type: "uint256" },
      { name: "rewardPoolExpiresAt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitQuestionWithMedia",
    inputs: [
      { name: "imageUrls", type: "string[]" },
      { name: "videoUrl", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "tags", type: "string" },
      { name: "categoryId", type: "uint256" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createRewardPoolWithAsset",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "asset", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "requiredVoters", type: "uint256" },
      { name: "requiredSettledRounds", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
    ],
    outputs: [{ name: "rewardPoolId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

export const QUESTION_REWARD_POOL_ESCROW_ABI = [
  {
    type: "function",
    name: "createRewardPool",
    inputs: [
      { name: "contentId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "requiredVoters", type: "uint256" },
      { name: "requiredSettledRounds", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
    ],
    outputs: [{ name: "rewardPoolId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimQuestionReward",
    inputs: [
      { name: "rewardPoolId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    outputs: [{ name: "rewardAmount", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimableQuestionReward",
    inputs: [
      { name: "rewardPoolId", type: "uint256" },
      { name: "roundId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "claimableAmount", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "crepToken",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "usdcToken",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

export const ERC20_APPROVAL_ABI = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const CELO_USDC_BY_CHAIN_ID: Record<number, `0x${string}`> = {
  42220: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  11142220: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
};

function normalizeAddress(value: string | undefined): `0x${string}` | undefined {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed) ? (trimmed as `0x${string}`) : undefined;
}

export function getConfiguredQuestionRewardPoolEscrowAddress(chainId: number): `0x${string}` | undefined {
  const envAddress = normalizeAddress(process.env.NEXT_PUBLIC_QUESTION_REWARD_POOL_ESCROW_ADDRESS);
  if (envAddress) return envAddress;

  const deployedAddress = (contracts?.[chainId]?.QuestionRewardPoolEscrow as { address?: string } | undefined)?.address;
  return normalizeAddress(deployedAddress);
}

export function getDefaultUsdcAddress(chainId: number): `0x${string}` | undefined {
  return normalizeAddress(process.env.NEXT_PUBLIC_CELO_USDC_ADDRESS) ?? CELO_USDC_BY_CHAIN_ID[chainId];
}

export function parseUsdRewardPoolAmount(value: string): bigint | null {
  return parseTokenAmount6(value);
}

export function parseSubmissionRewardAmount(value: string): bigint | null {
  return parseTokenAmount6(value);
}

function parseTokenAmount6(value: string): bigint | null {
  const trimmed = value.trim();
  const hasCommas = trimmed.includes(",");
  const normalized = hasCommas ? trimmed.replace(/,/g, "") : trimmed;
  const validGroupedAmount = /^\d{1,3}(?:,\d{3})+(?:\.\d{0,6})?$/.test(trimmed);
  const validPlainAmount = /^\d+(?:\.\d{0,6})?$/.test(trimmed);
  if (hasCommas ? !validGroupedAmount : !validPlainAmount) return null;
  try {
    const parsed = parseUnits(normalized, SUBMISSION_REWARD_DECIMALS);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function formatTokenAmount6(value: bigint | number | string | undefined | null): string {
  const raw = typeof value === "bigint" ? value : BigInt(value ?? 0);
  const whole = raw / 1_000_000n;
  const fractional = raw % 1_000_000n;
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionalText = fractional.toString().padStart(6, "0").replace(/0+$/, "");
  return fractionalText ? `${groupedWhole}.${fractionalText}` : groupedWhole;
}

export function formatSubmissionRewardAmount(
  value: bigint | number | string | undefined | null,
  asset: SubmissionRewardAsset,
): string {
  return `${formatTokenAmount6(value)} ${asset === "crep" ? "cREP" : "USDC"}`;
}

export function formatUsdAmount(value: bigint | number | string | undefined | null): string {
  const raw = typeof value === "bigint" ? value : BigInt(value ?? 0);
  const whole = raw / 1_000_000n;
  const fractional = raw % 1_000_000n;
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (fractional / 10_000n).toString().padStart(2, "0");
  return fractional > 0n ? `$${groupedWhole}.${cents}` : `$${groupedWhole}`;
}
