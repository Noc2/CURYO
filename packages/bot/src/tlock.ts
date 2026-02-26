/**
 * tlock encryption utilities for timelock-encrypted voting.
 * Adapted from packages/nextjs/utils/tlock.ts for Node.js CLI (no browser deps).
 */
import crypto from "crypto";
import { encodePacked, keccak256 } from "viem";
import { config } from "./config.js";

// Drand Quicknet configuration
const QUICKNET_CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const QUICKNET_GENESIS_TIME = 1692803367;
const QUICKNET_PERIOD = 3;

export function getRoundForTime(timestamp: number): number {
  if (timestamp <= QUICKNET_GENESIS_TIME) return 1;
  return Math.floor((timestamp - QUICKNET_GENESIS_TIME) / QUICKNET_PERIOD) + 1;
}

export function generateSalt(): `0x${string}` {
  const bytes = crypto.randomBytes(32);
  return `0x${bytes.toString("hex")}` as `0x${string}`;
}

export function computeCommitHash(isUp: boolean, salt: `0x${string}`, contentId: bigint): `0x${string}` {
  return keccak256(encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]));
}

export async function encryptVote(
  isUp: boolean,
  salt: `0x${string}`,
  contentId: bigint,
  decryptionTime?: number,
): Promise<`0x${string}`> {
  if (config.tlockMock) {
    // Mock: encode the plaintext vote data as "ciphertext"
    return encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]);
  }

  if (!decryptionTime) {
    throw new Error("decryptionTime is required for production tlock encryption");
  }

  const { timelockEncrypt } = await import("tlock-js");
  const { HttpChainClient, HttpCachingChain } = await import("drand-client");

  const targetRound = getRoundForTime(decryptionTime);
  const packedData = encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]);
  const payload = Buffer.from(packedData.slice(2), "hex");

  const chain = new HttpCachingChain(`https://api.drand.sh/${QUICKNET_CHAIN_HASH}`);
  const client = new HttpChainClient(chain);

  const armoredCiphertext = await timelockEncrypt(targetRound, payload, client);
  return `0x${Buffer.from(armoredCiphertext).toString("hex")}` as `0x${string}`;
}
