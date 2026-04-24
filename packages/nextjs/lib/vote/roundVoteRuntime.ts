import { parseRound, parseVotingConfig } from "../contracts/roundVotingEngine";
import { deriveCommitVoteRuntimeNowMs } from "./tlockCommitTiming";
import { RoundVotingEngineAbi } from "@curyo/contracts/abis";
import { type PublicClient } from "viem";

const roundCommitPreviewAbi = [
  {
    type: "function",
    name: "previewCommitRoundId",
    stateMutability: "view",
    inputs: [{ name: "contentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function resolveRoundVoteRuntime(params: {
  publicClient: PublicClient;
  votingEngineAddress: `0x${string}`;
  contentId: bigint;
  fallbackEpochDuration: number;
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
  let epochDuration = params.fallbackEpochDuration;
  if (currentRoundId > 0n) {
    const [round, roundConfig] = await Promise.all([
      params.publicClient.readContract({
        address: params.votingEngineAddress,
        abi: RoundVotingEngineAbi,
        functionName: "rounds",
        args: [params.contentId, currentRoundId],
        blockNumber: snapshotBlockNumber,
      }),
      params.publicClient.readContract({
        address: params.votingEngineAddress,
        abi: RoundVotingEngineAbi,
        functionName: "roundConfigSnapshot",
        args: [params.contentId, currentRoundId],
        blockNumber: snapshotBlockNumber,
      }),
    ]);
    const parsedRound = parseRound(round);
    epochDuration = parseVotingConfig(roundConfig).epochDuration;

    if (parsedRound?.state === 0 && parsedRound.startTime > 0n) {
      roundStartTimeSeconds = Number(parsedRound.startTime);
    }
  }

  const [roundId, roundReferenceRatingBps] = await Promise.all([
    params.publicClient.readContract({
      address: params.votingEngineAddress,
      abi: roundCommitPreviewAbi,
      functionName: "previewCommitRoundId",
      args: [params.contentId],
      blockNumber: snapshotBlockNumber,
    }),
    params.publicClient.readContract({
      address: params.votingEngineAddress,
      abi: RoundVotingEngineAbi,
      functionName: "previewCommitReferenceRatingBps",
      args: [params.contentId],
      blockNumber: snapshotBlockNumber,
    }),
  ]);

  const runtimeNowMs = deriveCommitVoteRuntimeNowMs({
    latestBlockTimestampSeconds: Number(latestBlock.timestamp),
    epochDurationSeconds: epochDuration,
    roundStartTimeSeconds,
  });

  return {
    epochDuration,
    now: () => runtimeNowMs,
    roundId,
    roundReferenceRatingBps: roundReferenceRatingBps as number,
  };
}
