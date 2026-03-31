import { Buffer } from "buffer";
import { decodeAbiParameters, encodeAbiParameters, hexToString, keccak256, encodePacked, stringToHex, type Address } from "viem";
import { mainnetClient, roundAt, timelockDecrypt, timelockEncrypt } from "tlock-js";

export type VoteSalt = `0x${string}`;
export type VoteCiphertext = `0x${string}`;
export type VoteCommitHash = `0x${string}`;
export type VoteDrandChainHash = `0x${string}`;
export interface VoteCommitMetadata {
  targetRound: bigint;
  drandChainHash: VoteDrandChainHash;
}
export interface TlockCiphertextMetadata extends VoteCommitMetadata {}
export interface VoteTransferPayload {
  contentId: bigint;
  commitHash: VoteCommitHash;
  ciphertext: VoteCiphertext;
  targetRound?: bigint;
  drandChainHash?: VoteDrandChainHash;
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
  { name: "targetRound", type: "uint64" },
  { name: "drandChainHash", type: "bytes32" },
] as const;

const misorderedVoteTransferPayloadParams = [
  { name: "contentId", type: "uint256" },
  { name: "commitHash", type: "bytes32" },
  { name: "ciphertext", type: "bytes" },
  { name: "targetRound", type: "uint64" },
  { name: "drandChainHash", type: "bytes32" },
  { name: "frontend", type: "address" },
] as const;

const legacyVoteTransferPayloadParams = [
  { name: "contentId", type: "uint256" },
  { name: "commitHash", type: "bytes32" },
  { name: "ciphertext", type: "bytes" },
  { name: "frontend", type: "address" },
] as const;

const AGE_ARMOR_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
const AGE_ARMOR_FOOTER = "-----END AGE ENCRYPTED FILE-----";
const TLOCK_STANZA_PREFIX = "-> tlock ";

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
): VoteCommitHash;
export function buildCommitHash(
  isUp: boolean,
  salt: VoteSalt,
  contentId: bigint,
  targetRound: bigint,
  drandChainHash: VoteDrandChainHash,
  ciphertext: VoteCiphertext,
): VoteCommitHash;
export function buildCommitHash(
  isUp: boolean,
  salt: VoteSalt,
  contentId: bigint,
  targetRoundOrCiphertext: bigint | VoteCiphertext,
  drandChainHashOrCiphertext?: VoteDrandChainHash | VoteCiphertext,
  ciphertextMaybe?: VoteCiphertext,
): VoteCommitHash {
  if (typeof targetRoundOrCiphertext === "bigint" && typeof drandChainHashOrCiphertext === "string" && ciphertextMaybe != null) {
    return keccak256(
      encodePacked(
        ["bool", "bytes32", "uint256", "uint64", "bytes32", "bytes32"],
        [isUp, salt, contentId, targetRoundOrCiphertext, drandChainHashOrCiphertext, keccak256(ciphertextMaybe)],
      ),
    );
  }

  const ciphertext = targetRoundOrCiphertext as VoteCiphertext;
  return keccak256(encodePacked(["bool", "bytes32", "uint256", "bytes32"], [isUp, salt, contentId, keccak256(ciphertext)]));
}

export function buildCommitKey(voter: Address, commitHash: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(["address", "bytes32"], [voter, commitHash]));
}

export function encodeVoteTransferPayload(payload: VoteTransferPayload): `0x${string}` {
  if (payload.targetRound != null && payload.drandChainHash != null) {
    return encodeAbiParameters(voteTransferPayloadParams, [
      payload.contentId,
      payload.commitHash,
      payload.ciphertext,
      payload.frontend,
      payload.targetRound,
      payload.drandChainHash,
    ]);
  }

  return encodeAbiParameters(legacyVoteTransferPayloadParams, [
    payload.contentId,
    payload.commitHash,
    payload.ciphertext,
    payload.frontend,
  ]);
}

export function decodeVoteTransferPayload(data: `0x${string}`): VoteTransferPayload {
  const decodeCanonicalPayload = (): VoteTransferPayload | null => {
    try {
      const [contentId, commitHash, ciphertext, frontend, targetRound, drandChainHash] = decodeAbiParameters(
        voteTransferPayloadParams,
        data,
      );
      const reencoded = encodeAbiParameters(voteTransferPayloadParams, [
        contentId,
        commitHash,
        ciphertext,
        frontend,
        targetRound,
        drandChainHash,
      ]);
      if (reencoded.toLowerCase() !== data.toLowerCase()) {
        return null;
      }

      return {
        contentId,
        commitHash,
        ciphertext,
        frontend,
        targetRound,
        drandChainHash,
      };
    } catch {
      return null;
    }
  };

  const decodeMisorderedPayload = (): VoteTransferPayload | null => {
    try {
      const [contentId, commitHash, ciphertext, targetRound, drandChainHash, frontend] = decodeAbiParameters(
        misorderedVoteTransferPayloadParams,
        data,
      );
      const reencoded = encodeAbiParameters(misorderedVoteTransferPayloadParams, [
        contentId,
        commitHash,
        ciphertext,
        targetRound,
        drandChainHash,
        frontend,
      ]);
      if (reencoded.toLowerCase() !== data.toLowerCase()) {
        return null;
      }

      return {
        contentId,
        commitHash,
        ciphertext,
        targetRound,
        drandChainHash,
        frontend,
      };
    } catch {
      return null;
    }
  };

  const matchesCiphertextMetadata = (payload: VoteTransferPayload): boolean => {
    if (payload.targetRound == null || payload.drandChainHash == null) {
      return false;
    }

    const metadata = parseTlockCiphertextMetadata(payload.ciphertext);
    if (!metadata) {
      return false;
    }

    return metadata.targetRound === payload.targetRound
      && metadata.drandChainHash.toLowerCase() === payload.drandChainHash.toLowerCase();
  };

  const canonicalPayload = decodeCanonicalPayload();
  if (canonicalPayload && matchesCiphertextMetadata(canonicalPayload)) {
    return canonicalPayload;
  }

  const misorderedPayload = decodeMisorderedPayload();
  if (misorderedPayload && matchesCiphertextMetadata(misorderedPayload)) {
    return misorderedPayload;
  }

  if (canonicalPayload) {
    return canonicalPayload;
  }

  if (misorderedPayload) {
    return misorderedPayload;
  }

  try {
    const [contentId, commitHash, ciphertext, frontend] = decodeAbiParameters(legacyVoteTransferPayloadParams, data);
    return {
      contentId,
      commitHash,
      ciphertext,
      frontend,
    };
  } catch {
    throw new Error("invalid vote transfer payload");
  }
}

function decodeAgeArmor(armored: string): string | null {
  const trimmed = armored.trim();
  if (!trimmed.startsWith(AGE_ARMOR_HEADER) || !trimmed.endsWith(AGE_ARMOR_FOOTER)) {
    return null;
  }

  const payload = trimmed.slice(AGE_ARMOR_HEADER.length, trimmed.length - AGE_ARMOR_FOOTER.length);
  return Buffer.from(payload, "base64").toString("binary");
}

export function parseTlockCiphertextMetadata(ciphertext: VoteCiphertext): TlockCiphertextMetadata | null {
  try {
    const armored = hexToString(ciphertext);
    const agePayload = decodeAgeArmor(armored);
    if (!agePayload) return null;

    const stanzaLine = agePayload
      .split("\n")
      .map(line => line.trim())
      .find(line => line.startsWith(TLOCK_STANZA_PREFIX));
    if (!stanzaLine) return null;

    const [, type, roundStr, chainHash, ...rest] = stanzaLine.split(" ");
    if (type !== "tlock" || rest.length > 0 || !roundStr || !chainHash) {
      return null;
    }

    if (!/^[0-9]+$/.test(roundStr) || !/^[0-9a-fA-F]{64}$/.test(chainHash)) {
      return null;
    }

    return {
      targetRound: BigInt(roundStr),
      drandChainHash: `0x${chainHash.toLowerCase()}` as VoteDrandChainHash,
    };
  } catch {
    return null;
  }
}

async function createTlockVoteArtifacts(
  isUp: boolean,
  salt: VoteSalt,
  epochDurationSeconds: number,
  runtime: VoteTlockRuntime = {},
): Promise<{ ciphertext: VoteCiphertext; targetRound: bigint; drandChainHash: VoteDrandChainHash }> {
  const client = runtime.client ?? mainnetClient();
  const now = runtime.now ?? Date.now;
  const encryptFn = runtime.encryptFn ?? timelockEncrypt;
  const chainInfo = await client.chain().info();
  const targetTime = now() + epochDurationSeconds * 1000;
  const targetRound = roundAt(targetTime, chainInfo);
  const armored = await encryptFn(targetRound, Buffer.from(encodeVotePlaintext(isUp, salt)), client);
  return {
    ciphertext: stringToHex(armored) as VoteCiphertext,
    targetRound: BigInt(targetRound),
    drandChainHash: `0x${chainInfo.hash}` as VoteDrandChainHash,
  };
}

export async function tlockEncryptVote(
  isUp: boolean,
  salt: VoteSalt,
  epochDurationSeconds: number,
  runtime: VoteTlockRuntime = {},
): Promise<VoteCiphertext> {
  const { ciphertext } = await createTlockVoteArtifacts(isUp, salt, epochDurationSeconds, runtime);
  return ciphertext;
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
}, runtime: VoteTlockRuntime = {}): Promise<{
  ciphertext: VoteCiphertext;
  commitHash: `0x${string}`;
  targetRound: bigint;
  drandChainHash: VoteDrandChainHash;
  commitKey?: `0x${string}`;
}> {
  const { ciphertext, targetRound, drandChainHash } = await createTlockVoteArtifacts(
    params.isUp,
    params.salt,
    params.epochDurationSeconds,
    runtime,
  );
  const commitHash = buildCommitHash(params.isUp, params.salt, params.contentId, targetRound, drandChainHash, ciphertext);

  return {
    ciphertext,
    commitHash,
    targetRound,
    drandChainHash,
    commitKey: params.voter ? buildCommitKey(params.voter, commitHash) : undefined,
  };
}
