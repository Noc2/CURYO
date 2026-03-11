import { Buffer } from "buffer";
import { decodeAbiParameters, encodeAbiParameters, hexToString, keccak256, encodePacked, stringToHex, type Address } from "viem";
import { mainnetClient, roundAt, timelockDecrypt, timelockEncrypt } from "tlock-js";

export type VoteSalt = `0x${string}`;
export type VoteCiphertext = `0x${string}`;
export type VoteCommitHash = `0x${string}`;
export interface VoteTransferPayload {
  contentId: bigint;
  commitHash: VoteCommitHash;
  ciphertext: VoteCiphertext;
  frontend: Address;
}
export type VoteTlockRuntime = {
  client?: ReturnType<typeof mainnetClient>;
  now?: () => number;
  encryptFn?: typeof timelockEncrypt;
  decryptFn?: typeof timelockDecrypt;
};

const voteTransferPayloadParams = [
  { name: "contentId", type: "uint256" },
  { name: "commitHash", type: "bytes32" },
  { name: "ciphertext", type: "bytes" },
  { name: "frontend", type: "address" },
] as const;

function saltToBytes(salt: VoteSalt): Uint8Array {
  const hex = salt.startsWith("0x") ? salt.slice(2) : salt;
  if (hex.length !== 64) throw new Error("salt must be 32 bytes");

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export function encodeVotePlaintext(isUp: boolean, salt: VoteSalt): Uint8Array {
  const plaintext = new Uint8Array(33);
  plaintext[0] = isUp ? 1 : 0;
  plaintext.set(saltToBytes(salt), 1);
  return plaintext;
}

export function decodeVotePlaintext(plaintext: Uint8Array): { isUp: boolean; salt: VoteSalt } | null {
  if (plaintext.length !== 33) return null;

  return {
    isUp: plaintext[0] === 1,
    salt: bytesToHex(plaintext.slice(1, 33)),
  };
}

export function buildCommitHash(
  isUp: boolean,
  salt: VoteSalt,
  contentId: bigint,
  ciphertext: VoteCiphertext,
): VoteCommitHash {
  return keccak256(
    encodePacked(["bool", "bytes32", "uint256", "bytes32"], [isUp, salt, contentId, keccak256(ciphertext)]),
  );
}

export function buildCommitKey(voter: Address, commitHash: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(["address", "bytes32"], [voter, commitHash]));
}

export function encodeVoteTransferPayload(payload: VoteTransferPayload): `0x${string}` {
  return encodeAbiParameters(voteTransferPayloadParams, [
    payload.contentId,
    payload.commitHash,
    payload.ciphertext,
    payload.frontend,
  ]);
}

export function decodeVoteTransferPayload(data: `0x${string}`): VoteTransferPayload {
  const [contentId, commitHash, ciphertext, frontend] = decodeAbiParameters(voteTransferPayloadParams, data);
  return {
    contentId,
    commitHash,
    ciphertext,
    frontend,
  };
}

export async function tlockEncryptVote(
  isUp: boolean,
  salt: VoteSalt,
  epochDurationSeconds: number,
  runtime: VoteTlockRuntime = {},
): Promise<VoteCiphertext> {
  const client = runtime.client ?? mainnetClient();
  const now = runtime.now ?? Date.now;
  const encryptFn = runtime.encryptFn ?? timelockEncrypt;
  const chainInfo = await client.chain().info();
  const targetTime = now() + epochDurationSeconds * 1000;
  const targetRound = roundAt(targetTime, chainInfo);
  const armored = await encryptFn(targetRound, Buffer.from(encodeVotePlaintext(isUp, salt)), client);
  return stringToHex(armored) as VoteCiphertext;
}

export async function decryptTlockCiphertext(
  ciphertext: VoteCiphertext,
  runtime: VoteTlockRuntime = {},
): Promise<{ isUp: boolean; salt: VoteSalt } | null> {
  const client = runtime.client ?? mainnetClient();
  const decryptFn = runtime.decryptFn ?? timelockDecrypt;
  const armored = hexToString(ciphertext);
  const plaintext = await decryptFn(armored, client);
  return decodeVotePlaintext(plaintext);
}

export async function createTlockVoteCommit(params: {
  voter?: Address;
  isUp: boolean;
  salt: VoteSalt;
  contentId: bigint;
  epochDurationSeconds: number;
}, runtime: VoteTlockRuntime = {}): Promise<{ ciphertext: VoteCiphertext; commitHash: `0x${string}`; commitKey?: `0x${string}` }> {
  const ciphertext = await tlockEncryptVote(params.isUp, params.salt, params.epochDurationSeconds, runtime);
  const commitHash = buildCommitHash(params.isUp, params.salt, params.contentId, ciphertext);

  return {
    ciphertext,
    commitHash,
    commitKey: params.voter ? buildCommitKey(params.voter, commitHash) : undefined,
  };
}
