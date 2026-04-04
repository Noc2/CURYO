import { Buffer } from "buffer";
import { resolve } from "path";
import { encodeAbiParameters, encodePacked, keccak256, stringToHex, type Address } from "viem";

export type VoteSalt = `0x${string}`;
export type VoteCiphertext = `0x${string}`;
export type VoteCommitHash = `0x${string}`;
export type VoteDrandChainHash = `0x${string}`;
export interface VoteTransferPayload {
  contentId: bigint;
  roundReferenceRatingBps: number;
  commitHash: VoteCommitHash;
  ciphertext: VoteCiphertext;
  targetRound: bigint;
  drandChainHash: VoteDrandChainHash;
  frontend: Address;
}
export type VoteTlockRuntime = {
  client?: {
    chain(): {
      info(): Promise<Record<string, unknown> & { hash: string }>;
    };
  };
  now?: () => number;
  encryptFn?: (targetRound: number, payload: Uint8Array, client: unknown) => Promise<string>;
};

const CONTRACTS_PACKAGE_JSON = resolve(__dirname, "../../../contracts/package.json");

const voteTransferPayloadParams = [
  { name: "contentId", type: "uint256" },
  { name: "roundReferenceRatingBps", type: "uint16" },
  { name: "commitHash", type: "bytes32" },
  { name: "ciphertext", type: "bytes" },
  { name: "frontend", type: "address" },
  { name: "targetRound", type: "uint64" },
  { name: "drandChainHash", type: "bytes32" },
] as const;

function saltToBytes(salt: VoteSalt): Uint8Array {
  const hex = salt.startsWith("0x") ? salt.slice(2) : salt;
  if (hex.length !== 64) {
    throw new Error("salt must be 32 bytes");
  }

  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function encodeVotePlaintext(isUp: boolean, salt: VoteSalt): Uint8Array {
  const plaintext = new Uint8Array(33);
  plaintext[0] = isUp ? 1 : 0;
  plaintext.set(saltToBytes(salt), 1);
  return plaintext;
}

function buildCommitHash(
  isUp: boolean,
  salt: VoteSalt,
  contentId: bigint,
  roundReferenceRatingBps: number,
  targetRound: bigint,
  drandChainHash: VoteDrandChainHash,
  ciphertext: VoteCiphertext,
): VoteCommitHash {
  return keccak256(
    encodePacked(
      ["bool", "bytes32", "uint256", "uint16", "uint64", "bytes32", "bytes32"],
      [isUp, salt, contentId, roundReferenceRatingBps, targetRound, drandChainHash, keccak256(ciphertext)],
    ),
  );
}

function buildCommitKey(voter: Address, commitHash: VoteCommitHash): `0x${string}` {
  return keccak256(encodePacked(["address", "bytes32"], [voter, commitHash]));
}

async function createTlockVoteArtifacts(
  isUp: boolean,
  salt: VoteSalt,
  epochDurationSeconds: number,
  runtime: VoteTlockRuntime = {},
): Promise<{ ciphertext: VoteCiphertext; targetRound: bigint; drandChainHash: VoteDrandChainHash }> {
  const { createRequire } = await import("module");
  const contractsRequire = createRequire(CONTRACTS_PACKAGE_JSON);
  const { mainnetClient, roundAt, timelockEncrypt } = contractsRequire("tlock-js") as {
    mainnetClient: () => NonNullable<VoteTlockRuntime["client"]>;
    roundAt: (targetTimeMs: number, chainInfo: Record<string, unknown>) => number;
    timelockEncrypt: NonNullable<VoteTlockRuntime["encryptFn"]>;
  };
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

export async function createTlockVoteCommit(
  params: {
    voter?: Address;
    isUp: boolean;
    salt: VoteSalt;
    contentId: bigint;
    roundReferenceRatingBps: number;
    epochDurationSeconds: number;
  },
  runtime: VoteTlockRuntime = {},
): Promise<{
  ciphertext: VoteCiphertext;
  commitHash: VoteCommitHash;
  targetRound: bigint;
  drandChainHash: VoteDrandChainHash;
  roundReferenceRatingBps: number;
  commitKey?: `0x${string}`;
}> {
  const { ciphertext, targetRound, drandChainHash } = await createTlockVoteArtifacts(
    params.isUp,
    params.salt,
    params.epochDurationSeconds,
    runtime,
  );
  const commitHash = buildCommitHash(
    params.isUp,
    params.salt,
    params.contentId,
    params.roundReferenceRatingBps,
    targetRound,
    drandChainHash,
    ciphertext,
  );

  return {
    ciphertext,
    commitHash,
    targetRound,
    drandChainHash,
    roundReferenceRatingBps: params.roundReferenceRatingBps,
    commitKey: params.voter ? buildCommitKey(params.voter, commitHash) : undefined,
  };
}

export function encodeVoteTransferPayload(payload: VoteTransferPayload): `0x${string}` {
  return encodeAbiParameters(voteTransferPayloadParams, [
    payload.contentId,
    payload.roundReferenceRatingBps,
    payload.commitHash,
    payload.ciphertext,
    payload.frontend,
    payload.targetRound,
    payload.drandChainHash,
  ]);
}
