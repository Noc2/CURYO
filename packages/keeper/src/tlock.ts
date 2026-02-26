/**
 * tlock decryption utility for the keeper.
 * Adapted from packages/nextjs/utils/tlock.ts — decrypt-only, no browser deps.
 */
import { encodePacked } from "viem";
import { config } from "./config.js";

// Drand Quicknet configuration
const QUICKNET_CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";

async function createDrandClient() {
  const { HttpChainClient, HttpCachingChain } = await import("drand-client");
  const chain = new HttpCachingChain(`https://api.drand.sh/${QUICKNET_CHAIN_HASH}`);
  return new HttpChainClient(chain);
}

/**
 * Decrypt a tlock ciphertext and extract the vote data.
 * Throws if the drand round hasn't been published yet.
 */
export async function decryptVote(ciphertext: `0x${string}`): Promise<{
  isUp: boolean;
  salt: `0x${string}`;
  contentId: bigint;
}> {
  if (config.tlockMock) {
    // Mock: decode the plaintext "ciphertext"
    // encodePacked format: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes) = 65 bytes
    const hex = ciphertext.slice(2);
    const isUpByte = parseInt(hex.slice(0, 2), 16);
    const salt = `0x${hex.slice(2, 66)}` as `0x${string}`;
    const contentId = BigInt(`0x${hex.slice(66, 130)}`);
    return { isUp: isUpByte === 1, salt, contentId };
  }

  const { timelockDecrypt } = await import("tlock-js");

  // Convert hex back to armored ciphertext string
  const armoredCiphertext = Buffer.from(ciphertext.slice(2), "hex").toString();

  const client = await createDrandClient();
  const payload = await timelockDecrypt(armoredCiphertext, client);

  // Parse payload: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes) = 65 bytes
  const hex = payload.toString("hex");
  const isUpByte = parseInt(hex.slice(0, 2), 16);
  const salt = `0x${hex.slice(2, 66)}` as `0x${string}`;
  const contentId = BigInt(`0x${hex.slice(66, 130)}`);

  return { isUp: isUpByte === 1, salt, contentId };
}
