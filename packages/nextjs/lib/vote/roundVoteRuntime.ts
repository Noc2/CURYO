import { parseRound } from "../contracts/roundVotingEngine";
import { deriveCommitVoteRuntimeNowMs } from "./tlockCommitTiming";
import { RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { type PublicClient } from "viem";

export async function resolveRoundVoteRuntime(params: {
  publicClient: PublicClient;
  votingEngineAddress: `0x${string}`;
  contentId: bigint;
  epochDuration: number;
}) {
  const latestBlock = await params.publicClient.getBlock({ blockTag: "latest" });
  const snapshotBlockNumber = latestBlock.number;
  const currentRoundId = await params.publicClient.readContract({
    address: params.votingEngineAddress,
    abi: RoundVotingEngineAbi,
    functionName: "currentRoundId",
    args: [params.contentId],
    blockNumber: snapshotBlockNumber,
  });

  let roundStartTimeSeconds: number | null = null;
  if (currentRoundId > 0n) {
    const round = await params.publicClient.readContract({
      address: params.votingEngineAddress,
      abi: RoundVotingEngineAbi,
      functionName: "rounds",
      args: [params.contentId, currentRoundId],
      blockNumber: snapshotBlockNumber,
    });
    const parsedRound = parseRound(round);

    if (parsedRound?.state === 0 && parsedRound.startTime > 0n) {
      roundStartTimeSeconds = Number(parsedRound.startTime);
    }
  }

  const runtimeNowMs = deriveCommitVoteRuntimeNowMs({
    latestBlockTimestampSeconds: Number(latestBlock.timestamp),
    epochDurationSeconds: params.epochDuration,
    roundStartTimeSeconds,
  });

  return {
    now: () => runtimeNowMs,
  };
}
