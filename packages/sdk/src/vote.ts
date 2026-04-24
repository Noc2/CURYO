import {
  HumanReputationAbi,
  createTlockVoteCommit,
  encodeVoteTransferPayload,
  type VoteCiphertext,
  type VoteDrandChainHash,
  type VoteCommitHash,
  type VoteTlockRuntime,
  type VoteTransferPayload,
} from "@curyo/contracts";
import { encodeFunctionData, type Address, type Hex } from "viem";

export interface CommitVoteParams {
  commitHash: VoteCommitHash;
  ciphertext: VoteCiphertext;
  roundReferenceRatingBps: number;
  targetRound: bigint;
  drandChainHash: VoteDrandChainHash;
  salt: `0x${string}`;
  stakeWei: bigint;
  frontend: `0x${string}`;
}

export function buildStakeAmountWei(stakeAmount: number): bigint {
  return BigInt(Math.round(stakeAmount * 1e6));
}

export function resolveFrontendCode(frontendCode?: `0x${string}`, defaultFrontendCode?: `0x${string}`): `0x${string}` {
  return frontendCode ?? defaultFrontendCode ?? "0x0000000000000000000000000000000000000000";
}

export function generateVoteSalt(randomValues?: (bytes: Uint8Array) => Uint8Array): `0x${string}` {
  const fillRandom =
    randomValues ??
    ((bytes: Uint8Array) => {
      if (!globalThis.crypto?.getRandomValues) {
        throw new Error("Secure random generator unavailable");
      }
      return globalThis.crypto.getRandomValues(bytes);
    });

  const saltBytes = fillRandom(new Uint8Array(32));
  return `0x${Array.from(saltBytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export async function buildCommitVoteParams(params: {
  voter: Address;
  contentId: bigint;
  isUp: boolean;
  stakeAmount: number;
  epochDuration: number;
  roundId: bigint;
  roundReferenceRatingBps: number;
  frontendCode?: `0x${string}`;
  defaultFrontendCode?: `0x${string}`;
  salt?: `0x${string}`;
  runtime?: VoteTlockRuntime;
}): Promise<CommitVoteParams> {
  const stakeWei = buildStakeAmountWei(params.stakeAmount);
  const frontend = resolveFrontendCode(params.frontendCode, params.defaultFrontendCode);
  const salt = params.salt ?? generateVoteSalt();
  const { ciphertext, commitHash, roundReferenceRatingBps, targetRound, drandChainHash } =
    await createTlockVoteCommit(
      {
        voter: params.voter,
        isUp: params.isUp,
        salt,
        contentId: params.contentId,
        roundId: params.roundId,
        roundReferenceRatingBps: params.roundReferenceRatingBps,
        epochDurationSeconds: params.epochDuration,
      },
      params.runtime,
    );

  return {
    commitHash,
    ciphertext,
    roundReferenceRatingBps,
    targetRound,
    drandChainHash,
    salt,
    stakeWei,
    frontend,
  };
}

export function buildVoteTransferPayload(params: VoteTransferPayload): Hex {
  return encodeVoteTransferPayload(params);
}

export function buildVoteTransferAndCallData(params: {
  votingEngineAddress: Address;
  stakeWei: bigint;
  payload: Hex;
}): Hex {
  return encodeFunctionData({
    abi: HumanReputationAbi,
    functionName: "transferAndCall",
    args: [params.votingEngineAddress, params.stakeWei, params.payload],
  });
}
