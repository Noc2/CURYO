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
  let pendingTimestampSeconds = Number(latestBlock.timestamp);
  let canReadPendingBlock = false;
  try {
    const pendingBlock = await params.publicClient.getBlock({ blockTag: "pending" });
    pendingTimestampSeconds = Number(pendingBlock.timestamp);
    canReadPendingBlock = true;
  } catch {
    pendingTimestampSeconds = Number(latestBlock.timestamp);
  }

  const snapshotBlockNumber = latestBlock.number;
  const runtimeTimestampSeconds = Math.max(Number(latestBlock.timestamp), pendingTimestampSeconds);
  const previewBlock = canReadPendingBlock ? { blockTag: "pending" as const } : { blockNumber: snapshotBlockNumber };

  const [roundId, roundReferenceRatingBps] = await Promise.all([
    params.publicClient.readContract({
      address: params.votingEngineAddress,
      abi: roundCommitPreviewAbi,
      functionName: "previewCommitRoundId",
      args: [params.contentId],
      ...previewBlock,
    }),
    params.publicClient.readContract({
      address: params.votingEngineAddress,
      abi: RoundVotingEngineAbi,
      functionName: "previewCommitReferenceRatingBps",
      args: [params.contentId],
      ...previewBlock,
    }),
  ]);

  let roundStartTimeSeconds: number | null = null;
  let epochDuration = params.fallbackEpochDuration;
  if (roundId > 0n) {
    const [round, roundConfig] = await Promise.all([
      params.publicClient.readContract({
        address: params.votingEngineAddress,
        abi: RoundVotingEngineAbi,
        functionName: "rounds",
        args: [params.contentId, roundId],
        blockNumber: snapshotBlockNumber,
      }),
      params.publicClient.readContract({
        address: params.votingEngineAddress,
        abi: RoundVotingEngineAbi,
        functionName: "roundConfigSnapshot",
        args: [params.contentId, roundId],
        blockNumber: snapshotBlockNumber,
      }),
    ]);
    const parsedRound = parseRound(round);

    if (parsedRound?.state === 0 && parsedRound.startTime > 0n) {
      epochDuration = parseVotingConfig(roundConfig).epochDuration;
      roundStartTimeSeconds = Number(parsedRound.startTime);
    }
  }

  const runtimeNowMs = deriveCommitVoteRuntimeNowMs({
    latestBlockTimestampSeconds: runtimeTimestampSeconds,
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
