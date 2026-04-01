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
  targetRound: bigint;
  drandChainHash: VoteDrandChainHash;
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

const AGE_ARMOR_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
const AGE_ARMOR_FOOTER = "-----END AGE ENCRYPTED FILE-----";
const AGE_ARMOR_LINE_CHUNK_SIZE = 64;
const AGE_VERSION_LINE = "age-encryption.org/v1";
const AGE_RECIPIENT_PREFIX = "-> ";
const AGE_MAC_PREFIX = "--- ";
const TLOCK_STANZA_PREFIX = "-> tlock ";
const UNPADDED_BASE64_LINE = /^[A-Za-z0-9+/]+$/;
const AGE_MAC_LENGTH = 32;
const MIN_TLOCK_STANZA_BODY_LENGTH = 80;
const MIN_ENCRYPTED_BODY_LENGTH = 65;

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
  targetRound: bigint,
  drandChainHash: VoteDrandChainHash,
  ciphertext: VoteCiphertext,
): VoteCommitHash {
  return keccak256(
    encodePacked(
      ["bool", "bytes32", "uint256", "uint64", "bytes32", "bytes32"],
      [isUp, salt, contentId, targetRound, drandChainHash, keccak256(ciphertext)],
    ),
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
    payload.targetRound,
    payload.drandChainHash,
  ]);
}

export function decodeVoteTransferPayload(data: `0x${string}`): VoteTransferPayload {
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
      throw new Error("invalid vote transfer payload");
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
    throw new Error("invalid vote transfer payload");
  }
}

function decodeAgeArmor(armored: string): Buffer | null {
  const trimmed = armored.trim();
  if (!trimmed.startsWith(AGE_ARMOR_HEADER) || !trimmed.endsWith(AGE_ARMOR_FOOTER)) {
    return null;
  }

  const payload = trimmed.slice(AGE_ARMOR_HEADER.length, trimmed.length - AGE_ARMOR_FOOTER.length);
  const lines = payload.split(/\r?\n/);
  if (lines.some(line => line.length > AGE_ARMOR_LINE_CHUNK_SIZE)) {
    return null;
  }
  if (lines.some(line => line.length > 0 && !/^[A-Za-z0-9+/=]+$/.test(line))) {
    return null;
  }

  const lastLine = lines.at(-1) ?? "";
  if (lastLine.length > AGE_ARMOR_LINE_CHUNK_SIZE) {
    return null;
  }

  return Buffer.from(payload, "base64");
}

function readAsciiLine(payload: Buffer, cursor: number): { line: string; nextCursor: number } | null {
  if (cursor >= payload.length) return null;

  let end = cursor;
  while (end < payload.length && payload[end] !== 0x0a && payload[end] !== 0x0d) {
    end++;
  }
  if (end >= payload.length) {
    return null;
  }

  let nextCursor = end + 1;
  if (payload[end] === 0x0d && nextCursor < payload.length && payload[nextCursor] === 0x0a) {
    nextCursor++;
  }

  return {
    line: payload.subarray(cursor, end).toString("binary"),
    nextCursor,
  };
}

function isValidUnpaddedBase64Line(line: string): boolean {
  return line.length > 0 && line.length <= AGE_ARMOR_LINE_CHUNK_SIZE && UNPADDED_BASE64_LINE.test(line);
}

function unpaddedBase64DecodedLength(charLength: number): number | null {
  const remainder = charLength % 4;
  if (remainder === 1) return null;
  return Math.floor(charLength / 4) * 3 + (remainder === 0 ? 0 : remainder - 1);
}

export function parseTlockCiphertextMetadata(ciphertext: VoteCiphertext): TlockCiphertextMetadata | null {
  try {
    const armored = hexToString(ciphertext);
    const agePayload = decodeAgeArmor(armored);
    if (!agePayload) return null;

    const versionLine = readAsciiLine(agePayload, 0);
    if (!versionLine || versionLine.line !== AGE_VERSION_LINE) {
      return null;
    }

    const stanzaLine = readAsciiLine(agePayload, versionLine.nextCursor);
    if (!stanzaLine || !stanzaLine.line.startsWith(TLOCK_STANZA_PREFIX)) {
      return null;
    }

    const recipientMatch = /^-> tlock ([0-9]+) ([0-9a-fA-F]{64})$/.exec(stanzaLine.line);
    if (!recipientMatch) {
      return null;
    }

    let cursor = stanzaLine.nextCursor;
    let stanzaBodyCharLength = 0;
    while (cursor < agePayload.length) {
      const bodyLine = readAsciiLine(agePayload, cursor);
      if (!bodyLine) return null;
      if (bodyLine.line.startsWith(AGE_MAC_PREFIX)) {
        break;
      }
      if (bodyLine.line.startsWith(AGE_RECIPIENT_PREFIX) || !isValidUnpaddedBase64Line(bodyLine.line)) {
        return null;
      }

      stanzaBodyCharLength += bodyLine.line.length;
      cursor = bodyLine.nextCursor;
    }

    const decodedStanzaBodyLength = unpaddedBase64DecodedLength(stanzaBodyCharLength);
    if (decodedStanzaBodyLength == null || decodedStanzaBodyLength < MIN_TLOCK_STANZA_BODY_LENGTH) {
      return null;
    }

    const macLine = readAsciiLine(agePayload, cursor);
    if (!macLine || !macLine.line.startsWith(AGE_MAC_PREFIX)) {
      return null;
    }

    const mac = macLine.line.slice(AGE_MAC_PREFIX.length);
    const decodedMacLength = unpaddedBase64DecodedLength(mac.length);
    if (!isValidUnpaddedBase64Line(mac) || decodedMacLength !== AGE_MAC_LENGTH) {
      return null;
    }

    if (agePayload.length - macLine.nextCursor < MIN_ENCRYPTED_BODY_LENGTH) {
      return null;
    }

    const [, roundStr, chainHash] = recipientMatch;
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
