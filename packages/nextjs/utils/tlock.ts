/**
 * tlock encryption utilities for timelock-encrypted voting.
 *
 * In production: uses drand/tlock-js to encrypt votes to a future drand round.
 * In mock mode (local dev): skips encryption, stores plaintext as "ciphertext".
 *
 * The tlock-js and drand-client packages are optional dependencies.
 * When not installed, mock mode is used automatically.
 */
import { encodePacked, keccak256 } from "viem";

// --- Mock mode ---
// For local development, we skip actual tlock encryption.
// The ciphertext is just the ABI-encoded plaintext vote data.

const IS_MOCK = process.env.NEXT_PUBLIC_TLOCK_MOCK === "true";

// --- Drand Quicknet Network Configuration ---
// https://docs.drand.love/blog/2023/10/16/quicknet-is-live/
const QUICKNET_CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const QUICKNET_GENESIS_TIME = 1692803367; // 2023-08-23 15:09:27 UTC
const QUICKNET_PERIOD = 3; // seconds between rounds

/**
 * Calculate the drand round number for a given Unix timestamp.
 * Formula: round = ((timestamp - genesis_time) / period) + 1
 */
export function getRoundForTime(timestamp: number): number {
  if (timestamp <= QUICKNET_GENESIS_TIME) {
    return 1;
  }
  return Math.floor((timestamp - QUICKNET_GENESIS_TIME) / QUICKNET_PERIOD) + 1;
}

/**
 * Calculate the Unix timestamp when a given drand round will be emitted.
 */
export function getTimeForRound(round: number): number {
  return QUICKNET_GENESIS_TIME + (round - 1) * QUICKNET_PERIOD;
}

/**
 * Create a drand chain client for the quicknet network.
 */
async function createDrandClient() {
  const { HttpChainClient, HttpCachingChain } = await import("drand-client");

  const chain = new HttpCachingChain(`https://api.drand.sh/${QUICKNET_CHAIN_HASH}`);

  return new HttpChainClient(chain);
}

/**
 * Generate a random 32-byte salt for commit-reveal voting.
 */
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

/**
 * Compute the commit hash for a vote (now includes contentId).
 * Must match: keccak256(abi.encodePacked(isUp, salt, contentId))
 */
export function computeCommitHash(isUp: boolean, salt: `0x${string}`, contentId: bigint): `0x${string}` {
  return keccak256(encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]));
}

/**
 * Encrypt a vote using tlock (or mock).
 * Now includes contentId in the encrypted payload.
 * Returns the ciphertext as a hex string.
 *
 * @param isUp - The vote direction (true = up, false = down)
 * @param salt - Random 32-byte salt for commit-reveal
 * @param contentId - The content being voted on
 * @param decryptionTime - Unix timestamp when votes become decryptable (epoch end or round deadline)
 */
export async function encryptVote(
  isUp: boolean,
  salt: `0x${string}`,
  contentId: bigint,
  decryptionTime?: number,
): Promise<`0x${string}`> {
  if (IS_MOCK) {
    // Mock: encode the plaintext vote data as "ciphertext"
    // Format: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes) = 65 bytes
    return encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]);
  }

  // Production: use tlock-js for real timelock encryption
  if (!decryptionTime) {
    throw new Error("decryptionTime is required for production tlock encryption");
  }

  const { timelockEncrypt } = await import("tlock-js");

  // Calculate which drand round corresponds to decryption time
  const targetRound = getRoundForTime(decryptionTime);

  // Create payload: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes)
  const packedData = encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]);
  const payload = Buffer.from(packedData.slice(2), "hex");

  // Create drand client
  const client = await createDrandClient();

  // Encrypt to future round (returns armored ciphertext string)
  const armoredCiphertext = await timelockEncrypt(targetRound, payload, client);

  // Convert armored ciphertext to hex for storage on-chain
  return `0x${Buffer.from(armoredCiphertext).toString("hex")}` as `0x${string}`;
}

/**
 * Decrypt a tlock ciphertext (used by the keeper script).
 * Now extracts contentId from the payload.
 *
 * Note: Will throw an error if the drand round hasn't been published yet.
 */
export async function decryptVote(ciphertext: `0x${string}`): Promise<{
  isUp: boolean;
  salt: `0x${string}`;
  contentId: bigint;
}> {
  if (IS_MOCK) {
    // Mock: decode the plaintext "ciphertext"
    // encodePacked format: bool (1 byte) + bytes32 (32 bytes) + uint256 (32 bytes) = 65 bytes = 130 hex chars
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

  return { isUp: isUpByte === 1, salt, contentId };
}

// --- localStorage helpers for salt backup ---

const SALT_STORAGE_KEY = "curyo_epoch_salts";

interface StoredEpochSalt {
  contentId: string;
  epochId: string;
  salt: string;
  isUp: boolean;
  commitHash: string; // For reveal lookup
  timestamp: number;
  /** Stake amount in whole tokens (e.g. 10 = 10 cREP), for UI display. Optional for backwards compat. */
  stakeAmount?: number;
  /** Voter address that cast this vote. Optional for backwards compat with existing salts. */
  voter?: string;
}

/**
 * Store a salt in localStorage as backup for the keeper.
 * @param voter - The address of the voter (for per-account filtering).
 * @param stakeAmount - Optional stake in whole tokens, for showing "Your vote: X cREP" in UI.
 */
export function storeSalt(
  contentId: bigint,
  epochId: bigint,
  salt: `0x${string}`,
  isUp: boolean,
  voter: string,
  stakeAmount?: number,
): void {
  if (typeof window === "undefined") return;

  // Compute commit hash for reveal lookup
  const commitHash = computeCommitHash(isUp, salt, contentId);

  const existing = getAllSalts();
  existing.push({
    contentId: contentId.toString(),
    epochId: epochId.toString(),
    salt,
    isUp,
    commitHash,
    timestamp: Date.now(),
    voter: voter.toLowerCase(),
    ...(stakeAmount != null && { stakeAmount }),
  });
  localStorage.setItem(SALT_STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Retrieve a stored salt for a specific content and epoch.
 * @param voter - If provided, only match salts belonging to this address.
 */
export function getSalt(contentId: bigint, epochId: bigint, voter?: string): StoredEpochSalt | null {
  if (typeof window === "undefined") return null;

  const salts = getSalts(voter);
  return salts.find(s => s.contentId === contentId.toString() && s.epochId === epochId.toString()) ?? null;
}

/**
 * Get all stored salts (unfiltered). Used internally and by removeSalt.
 */
function getAllSalts(): StoredEpochSalt[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(SALT_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredEpochSalt[];
  } catch {
    return [];
  }
}

/**
 * Get stored salts, optionally filtered by voter address.
 * @param voter - If provided, only return salts belonging to this address.
 *                Legacy salts without a voter field are excluded when filtering.
 */
export function getSalts(voter?: string): StoredEpochSalt[] {
  const all = getAllSalts();
  if (!voter) return all;
  const addr = voter.toLowerCase();
  return all.filter(s => s.voter?.toLowerCase() === addr);
}

/**
 * Remove a salt after the epoch is settled.
 */
export function removeSalt(contentId: bigint, epochId: bigint): void {
  if (typeof window === "undefined") return;

  const salts = getAllSalts().filter(s => !(s.contentId === contentId.toString() && s.epochId === epochId.toString()));
  localStorage.setItem(SALT_STORAGE_KEY, JSON.stringify(salts));
}

// =============================================================================
// Round-based salt storage (for RoundVotingEngine)
// =============================================================================

const ROUND_SALT_STORAGE_KEY = "curyo_round_salts";
export const ROUND_SALTS_UPDATED_EVENT = "curyo:round-salts-updated";

function emitRoundSaltsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ROUND_SALTS_UPDATED_EVENT));
}

export interface StoredRoundSalt {
  contentId: string;
  roundId: string;
  salt: string;
  isUp: boolean;
  commitHash: string; // For reveal lookup
  timestamp: number;
  /** Stake amount in whole tokens (e.g. 10 = 10 cREP), for UI display. */
  stakeAmount?: number;
  /** Voter address that cast this vote. */
  voter?: string;
}

/**
 * Store a salt in localStorage keyed by (contentId, roundId).
 * @param voter - The address of the voter (for per-account filtering).
 * @param stakeAmount - Optional stake in whole tokens, for showing "Your vote: X cREP" in UI.
 */
export function storeRoundSalt(
  contentId: bigint,
  roundId: bigint,
  salt: `0x${string}`,
  isUp: boolean,
  voter: string,
  stakeAmount?: number,
): void {
  if (typeof window === "undefined") return;

  const commitHash = computeCommitHash(isUp, salt, contentId);

  const existing = getAllRoundSalts();
  existing.push({
    contentId: contentId.toString(),
    roundId: roundId.toString(),
    salt,
    isUp,
    commitHash,
    timestamp: Date.now(),
    voter: voter.toLowerCase(),
    ...(stakeAmount != null && { stakeAmount }),
  });
  localStorage.setItem(ROUND_SALT_STORAGE_KEY, JSON.stringify(existing));
  emitRoundSaltsUpdated();
}

/**
 * Retrieve a stored salt for a specific content and round.
 * @param voter - If provided, only match salts belonging to this address.
 */
export function getRoundSalt(contentId: bigint, roundId: bigint, voter?: string): StoredRoundSalt | null {
  if (typeof window === "undefined") return null;

  const salts = getRoundSalts(voter);
  return salts.find(s => s.contentId === contentId.toString() && s.roundId === roundId.toString()) ?? null;
}

/**
 * Get all stored round salts (unfiltered). Used internally.
 */
function getAllRoundSalts(): StoredRoundSalt[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(ROUND_SALT_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredRoundSalt[];
  } catch {
    return [];
  }
}

/**
 * Get stored round salts, optionally filtered by voter address.
 * @param voter - If provided, only return salts belonging to this address.
 */
export function getRoundSalts(voter?: string): StoredRoundSalt[] {
  const all = getAllRoundSalts();
  if (!voter) return all;
  const addr = voter.toLowerCase();
  return all.filter(s => s.voter?.toLowerCase() === addr);
}

/**
 * Remove a round salt after the round is settled.
 */
export function removeRoundSalt(contentId: bigint, roundId: bigint): void {
  if (typeof window === "undefined") return;

  const salts = getAllRoundSalts().filter(
    s => !(s.contentId === contentId.toString() && s.roundId === roundId.toString()),
  );
  localStorage.setItem(ROUND_SALT_STORAGE_KEY, JSON.stringify(salts));
  emitRoundSaltsUpdated();
}
