#!/usr/bin/env npx ts-node
/**
 * EpochResolver — Keeper script for epoch-based voting.
 *
 * For each content + epoch that has ended:
 * 1. Decrypt all tlock ciphertexts (or in mock mode, decode plaintext).
 * 2. Batch-call revealVote() for each voter.
 * 3. Call settleEpoch() once all reveals are submitted.
 *
 * Usage:
 *   npx ts-node packages/foundry/script/EpochResolver.ts
 *
 * Environment:
 *   KEEPER_PRIVATE_KEY  — private key for the keeper account
 *   RPC_URL             — JSON-RPC endpoint (default: http://127.0.0.1:8545)
 *   VOTING_ENGINE       — EpochVotingEngine contract address
 *   MOCK_MODE           — set to "true" for local dev (skip tlock decryption)
 */

import { createPublicClient, createWalletClient, http, parseAbi, decodeAbiParameters, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

// --- Configuration ---
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
if (!process.env.KEEPER_PRIVATE_KEY) {
  console.error("Error: KEEPER_PRIVATE_KEY environment variable is required.");
  process.exit(1);
}
const KEEPER_KEY = process.env.KEEPER_PRIVATE_KEY as `0x${string}`;
const VOTING_ENGINE_ADDRESS = process.env.VOTING_ENGINE as `0x${string}` | undefined;
const IS_MOCK = process.env.MOCK_MODE !== "false";

// --- Drand Quicknet Network Configuration ---
// https://docs.drand.love/blog/2023/10/16/quicknet-is-live/
const QUICKNET_CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";

/**
 * Create a drand chain client for the quicknet network.
 */
async function createDrandClient() {
  const { HttpChainClient, HttpCachingChain } = await import("drand-client");
  const chain = new HttpCachingChain(`https://api.drand.sh/${QUICKNET_CHAIN_HASH}`);
  return new HttpChainClient(chain);
}

// Minimal ABI for the EpochVotingEngine functions we need
const VOTING_ENGINE_ABI = parseAbi([
  "function getCurrentEpochId() view returns (uint256)",
  "function genesisTime() view returns (uint256)",
  "function config() view returns (uint256 duration, uint256 revealDuration, uint256 bonusPoolBps)",
  "function getEpoch(uint256 contentId, uint256 epochId) view returns (uint256 startTime, uint256 endTime, uint8 state, uint256 upPool, uint256 downPool, uint256 upCount, uint256 downCount, uint256 commitCount, bool upWins)",
  "function getEpochVoterCount(uint256 contentId, uint256 epochId) view returns (uint256)",
  "function getEpochVoter(uint256 contentId, uint256 epochId, uint256 index) view returns (address)",
  "function getVote(uint256 contentId, uint256 epochId, address voter) view returns (bytes32 commitHash, bytes ciphertext, uint256 stakeAmount, bool revealed, bool isUp)",
  "function getEpochContentIds(uint256 epochId) view returns (uint256[])",
  "function revealVote(uint256 contentId, uint256 epochId, address voter, bool isUp, bytes32 salt)",
  "function settleEpoch(uint256 contentId, uint256 epochId)",
]);

// EpochState enum (matching Solidity)
const EpochState = { Active: 0, Revealing: 1, Settled: 2, Cancelled: 3 } as const;

async function main() {
  const account = privateKeyToAccount(KEEPER_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  if (!VOTING_ENGINE_ADDRESS) {
    console.error("Error: VOTING_ENGINE environment variable not set.");
    console.error("Set it to the deployed EpochVotingEngine proxy address.");
    process.exit(1);
  }

  const contractAddr = getAddress(VOTING_ENGINE_ADDRESS);

  console.log(`EpochResolver starting...`);
  console.log(`  RPC: ${RPC_URL}`);
  console.log(`  Keeper: ${account.address}`);
  console.log(`  VotingEngine: ${contractAddr}`);
  console.log(`  Mock mode: ${IS_MOCK}`);
  console.log();

  // Read current epoch and config
  const currentEpochId = await publicClient.readContract({
    address: contractAddr,
    abi: VOTING_ENGINE_ABI,
    functionName: "getCurrentEpochId",
  });

  const config = await publicClient.readContract({
    address: contractAddr,
    abi: VOTING_ENGINE_ABI,
    functionName: "config",
  });

  console.log(`Current epoch: ${currentEpochId}`);
  console.log(`Epoch duration: ${config[0]}s, Reveal duration: ${config[2]}s`);
  console.log();

  // Process previous epochs (current epoch is still active)
  // Look back up to 10 epochs
  const lookback = 10n;
  const startEpoch = currentEpochId > lookback ? currentEpochId - lookback : 0n;

  for (let epochId = startEpoch; epochId < currentEpochId; epochId++) {
    // Get all content IDs that had votes in this epoch
    const contentIds = await publicClient.readContract({
      address: contractAddr,
      abi: VOTING_ENGINE_ABI,
      functionName: "getEpochContentIds",
      args: [epochId],
    });

    if (contentIds.length === 0) continue;

    console.log(`--- Epoch ${epochId} (${contentIds.length} content items) ---`);

    for (const contentId of contentIds) {
      const epoch = await publicClient.readContract({
        address: contractAddr,
        abi: VOTING_ENGINE_ABI,
        functionName: "getEpoch",
        args: [contentId, epochId],
      });

      const state = epoch[2];

      // Skip already settled/cancelled epochs
      if (state === EpochState.Settled || state === EpochState.Cancelled) {
        console.log(`  Content #${contentId}: already ${state === EpochState.Settled ? "settled" : "cancelled"}`);
        continue;
      }

      // Reveal unrevealed votes
      const voterCount = await publicClient.readContract({
        address: contractAddr,
        abi: VOTING_ENGINE_ABI,
        functionName: "getEpochVoterCount",
        args: [contentId, epochId],
      });

      let revealedCount = 0;
      for (let i = 0n; i < voterCount; i++) {
        const voter = await publicClient.readContract({
          address: contractAddr,
          abi: VOTING_ENGINE_ABI,
          functionName: "getEpochVoter",
          args: [contentId, epochId, i],
        });

        const vote = await publicClient.readContract({
          address: contractAddr,
          abi: VOTING_ENGINE_ABI,
          functionName: "getVote",
          args: [contentId, epochId, voter],
        });

        const [, ciphertext, , revealed] = vote;

        if (revealed) {
          revealedCount++;
          continue;
        }

        // Decrypt the vote
        try {
          const { isUp, salt } = await decryptVote(ciphertext, contentId);

          const hash = await walletClient.writeContract({
            address: contractAddr,
            abi: VOTING_ENGINE_ABI,
            functionName: "revealVote",
            args: [contentId, epochId, voter, isUp, salt],
          });

          console.log(`  Revealed vote for ${voter} on content #${contentId} (tx: ${hash})`);
          revealedCount++;
        } catch (err: any) {
          console.error(`  Failed to reveal vote for ${voter}: ${err.shortMessage || err.message}`);
        }
      }

      console.log(`  Content #${contentId}: ${revealedCount}/${voterCount} revealed`);

      // Try to settle the epoch
      try {
        const settleTx = await walletClient.writeContract({
          address: contractAddr,
          abi: VOTING_ENGINE_ABI,
          functionName: "settleEpoch",
          args: [contentId, epochId],
        });
        console.log(`  Settled epoch for content #${contentId} (tx: ${settleTx})`);
      } catch (err: any) {
        console.error(`  Failed to settle content #${contentId}: ${err.shortMessage || err.message}`);
      }
    }
  }

  console.log("\nEpochResolver complete.");
}

/**
 * Decrypt a vote ciphertext.
 * In mock mode: decode plaintext ABI-encoded data.
 * In production: use tlock-js to decrypt with drand beacon.
 *
 * @param ciphertext - The encrypted vote data
 * @param expectedContentId - The content ID we expect (for verification in production)
 * @returns Decrypted vote data
 */
async function decryptVote(
  ciphertext: `0x${string}`,
  expectedContentId: bigint,
): Promise<{ isUp: boolean; salt: `0x${string}`; contentId: bigint }> {
  if (IS_MOCK) {
    // Mock: decode the plaintext "ciphertext"
    // Format: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes) = 65 bytes = 130 hex chars
    const hex = ciphertext.slice(2); // Remove 0x prefix

    const isUpByte = parseInt(hex.slice(0, 2), 16);
    const salt = `0x${hex.slice(2, 66)}` as `0x${string}`;
    const contentId = BigInt(`0x${hex.slice(66, 130)}`);

    return { isUp: isUpByte === 1, salt, contentId };
  }

  // Production: use tlock-js for real timelock decryption
  const { timelockDecrypt } = await import("tlock-js");

  // Convert hex back to armored ciphertext string
  const armoredCiphertext = Buffer.from(ciphertext.slice(2), "hex").toString();

  // Create drand client
  const client = await createDrandClient();

  // Decrypt (will throw if round not yet available)
  const payload = await timelockDecrypt(armoredCiphertext, client);

  // Parse payload: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes) = 65 bytes
  const hex = payload.toString("hex");
  const isUpByte = parseInt(hex.slice(0, 2), 16);
  const salt = `0x${hex.slice(2, 66)}` as `0x${string}`;
  const contentId = BigInt(`0x${hex.slice(66, 130)}`);

  // Verify contentId matches expected (security check)
  if (contentId !== expectedContentId) {
    throw new Error(`Content ID mismatch: expected ${expectedContentId}, got ${contentId}`);
  }

  return { isUp: isUpByte === 1, salt, contentId };
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
