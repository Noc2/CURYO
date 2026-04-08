"use client";

import { Address } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";
import { getWalletDisplayLiquidMicro, useWalletDisplaySummary } from "~~/hooks/useWalletDisplaySummary";

function toMicroUnits(value: number) {
  return BigInt(Math.round(value * 1e6));
}

export function useWalletSummaryData(address?: Address) {
  const isPageVisible = usePageVisibility();
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked: votingStaked } = useVotingStakes(address);
  const { votes: activeVotes, earliestReveal, hasPendingReveals } = useActiveVotesWithDeadlines(address);

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    watch: false,
    query: {
      enabled: !!address,
      staleTime: 60_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
    watch: false,
    query: {
      enabled: !!address,
      staleTime: 60_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const fallbackVotingStakedMicro = activeVotes.reduce((sum, vote) => sum + BigInt(vote.stake), 0n);
  const indexedVotingStakedMicro = toMicroUnits(votingStaked);
  const votingStakedMicro =
    indexedVotingStakedMicro > fallbackVotingStakedMicro ? indexedVotingStakedMicro : fallbackVotingStakedMicro;

  const summary = useWalletDisplaySummary(
    address,
    !address || crepBalance === undefined
      ? null
      : {
          liquidMicro: crepBalance,
          votingStakedMicro,
          submissionStakedMicro: toMicroUnits(totalSubmissionStake),
          frontendStakedMicro: frontendInfo?.[1] ?? 0n,
        },
  );

  return {
    activeVotes,
    crepBalance,
    earliestReveal,
    hasPendingReveals,
    liquidBalance: getWalletDisplayLiquidMicro(summary, crepBalance),
    summary,
  };
}
