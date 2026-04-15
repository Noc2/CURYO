"use client";

import { useCallback, useMemo } from "react";
import { EPOCH_WEIGHT_BPS, REWARD_SPLIT_BPS, ROUND_STATE } from "@curyo/contracts/protocol";
import { useAccount, useReadContracts } from "wagmi";
import { type ClaimableRewardItem, buildVoterParticipationClaimableRewards } from "~~/hooks/claimableRewards";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useClaimableFrontendRewards } from "~~/hooks/useClaimableFrontendRewards";
import { useClaimableQuestionRewards } from "~~/hooks/useClaimableQuestionRewards";
import { useClaimableSubmitterParticipationRewards } from "~~/hooks/useClaimableSubmitterParticipationRewards";
import { useClaimableSubmitterRewards } from "~~/hooks/useClaimableSubmitterRewards";
import { useRecentUserVotes } from "~~/hooks/useRecentUserVotes";

function epochWeightBps(epochIndex: number): number {
  return epochIndex === 0 ? EPOCH_WEIGHT_BPS.blind : EPOCH_WEIGHT_BPS.informed;
}

/**
 * Hook that identifies all claimable rewards across all rounds and content.
 * Uses Ponder API to find the user's recent votes, then checks on-chain state.
 */
export function useAllClaimableRewards() {
  const { address } = useAccount();
  const { votes, refetch: refetchVotes } = useRecentUserVotes(address);
  const {
    claimableItems: submitterClaimableItems,
    isLoading: submitterLoading,
    refetch: refetchSubmitterClaimables,
  } = useClaimableSubmitterRewards();
  const {
    claimableItems: submitterParticipationClaimableItems,
    isLoading: submitterParticipationLoading,
    refetch: refetchSubmitterParticipationClaimables,
  } = useClaimableSubmitterParticipationRewards();
  const {
    claimableItems: frontendClaimableItems,
    isLoading: frontendClaimableLoading,
    refetch: refetchFrontendClaimables,
  } = useClaimableFrontendRewards();
  const {
    claimableItems: questionRewardPoolClaimableItems,
    totalClaimable: totalQuestionRewardPoolClaimable,
    isLoading: questionRewardPoolClaimableLoading,
    refetch: refetchQuestionRewardPoolClaimables,
  } = useClaimableQuestionRewards();

  // --- Step 2: Filter to terminal rounds only ---
  const terminalVotes = useMemo(() => {
    return votes.filter(v => {
      const state = v.roundState;
      if (state === ROUND_STATE.Cancelled) return true;
      if ((state === ROUND_STATE.Tied || state === ROUND_STATE.RevealFailed) && v.revealed) return true;
      if (state === ROUND_STATE.Settled && v.revealed && v.isUp !== null) return true;
      return false;
    });
  }, [votes]);

  // --- Step 3: Multicall rewardClaimed to filter out already claimed ---
  const { data: distributorInfo } = useDeployedContractInfo({ contractName: "RoundRewardDistributor" });
  const { data: engineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });

  const claimedContracts = useMemo(() => {
    if (!distributorInfo || !engineInfo || !address || terminalVotes.length === 0) return [];
    return terminalVotes.map(v => ({
      address: v.roundState === ROUND_STATE.Settled ? distributorInfo.address : engineInfo.address,
      abi: v.roundState === ROUND_STATE.Settled ? distributorInfo.abi : engineInfo.abi,
      functionName:
        v.roundState === ROUND_STATE.Settled ? ("rewardClaimed" as const) : ("cancelledRoundRefundClaimed" as const),
      args: [BigInt(v.contentId), BigInt(v.roundId), address],
    }));
  }, [distributorInfo, engineInfo, address, terminalVotes]);

  const {
    data: claimedResults,
    isLoading: claimedLoading,
    refetch: refetchClaimed,
  } = useReadContracts({
    contracts: claimedContracts,
    query: { enabled: claimedContracts.length > 0 },
  });

  // --- Step 4: Classify unclaimed votes into reward-path and refund-path claims ---
  const unclaimedVotes = useMemo(() => {
    if (!claimedResults || claimedResults.length !== terminalVotes.length) return [];
    return terminalVotes.filter((_, i) => {
      const r = claimedResults[i];
      return r?.status === "success" && r.result === false;
    });
  }, [terminalVotes, claimedResults]);

  const { rewardVotes, refundVotes } = useMemo(() => {
    const rewards: typeof unclaimedVotes = [];
    const refunds: typeof unclaimedVotes = [];
    for (const v of unclaimedVotes) {
      const state = v.roundState;
      if (state === ROUND_STATE.Cancelled || state === ROUND_STATE.Tied || state === ROUND_STATE.RevealFailed) {
        refunds.push(v);
      } else if (state === ROUND_STATE.Settled) {
        rewards.push(v);
      }
    }
    return { rewardVotes: rewards, refundVotes: refunds };
  }, [unclaimedVotes]);

  const settledWinners = useMemo(
    () => rewardVotes.filter(v => v.isUp !== null && v.roundUpWins !== null && v.isUp === v.roundUpWins),
    [rewardVotes],
  );
  const settledLosers = useMemo(
    () => rewardVotes.filter(v => v.isUp !== null && v.roundUpWins !== null && v.isUp !== v.roundUpWins),
    [rewardVotes],
  );
  const settledWinningTerminalVotes = useMemo(
    () =>
      terminalVotes.filter(
        v =>
          v.roundState === ROUND_STATE.Settled &&
          v.revealed &&
          v.isUp !== null &&
          v.roundUpWins !== null &&
          v.isUp === v.roundUpWins,
      ),
    [terminalVotes],
  );

  // --- Step 5: Multicall roundVoterPool + roundWinningStake for winners ---
  const rewardContracts = useMemo(() => {
    if (!engineInfo || settledWinners.length === 0) return [];
    return settledWinners.flatMap(v => [
      {
        address: engineInfo.address,
        abi: engineInfo.abi,
        functionName: "roundVoterPool" as const,
        args: [BigInt(v.contentId), BigInt(v.roundId)],
      },
      {
        address: engineInfo.address,
        abi: engineInfo.abi,
        functionName: "roundWinningStake" as const,
        args: [BigInt(v.contentId), BigInt(v.roundId)],
      },
    ]);
  }, [engineInfo, settledWinners]);

  const { data: rewardResults, isLoading: rewardsLoading } = useReadContracts({
    contracts: rewardContracts,
    query: { enabled: rewardContracts.length > 0 },
  });

  const participationRewardContracts = useMemo(() => {
    if (!distributorInfo || !address || settledWinningTerminalVotes.length === 0) return [];
    return settledWinningTerminalVotes.flatMap(v => {
      const contentId = BigInt(v.contentId);
      const roundId = BigInt(v.roundId);

      return [
        {
          address: distributorInfo.address,
          abi: distributorInfo.abi,
          functionName: "participationRewardClaimed" as const,
          args: [contentId, roundId, address],
        },
        {
          address: distributorInfo.address,
          abi: distributorInfo.abi,
          functionName: "participationRewardPaid" as const,
          args: [contentId, roundId, address],
        },
        {
          address: distributorInfo.address,
          abi: distributorInfo.abi,
          functionName: "roundParticipationRewardRateBps" as const,
          args: [contentId, roundId],
        },
        {
          address: distributorInfo.address,
          abi: distributorInfo.abi,
          functionName: "roundParticipationRewardOwed" as const,
          args: [contentId, roundId],
        },
        {
          address: distributorInfo.address,
          abi: distributorInfo.abi,
          functionName: "roundParticipationRewardReserved" as const,
          args: [contentId, roundId],
        },
        {
          address: distributorInfo.address,
          abi: distributorInfo.abi,
          functionName: "roundParticipationRewardPool" as const,
          args: [contentId, roundId],
        },
      ];
    });
  }, [address, distributorInfo, settledWinningTerminalVotes]);

  const {
    data: participationRewardResults,
    isLoading: participationRewardsLoading,
    refetch: refetchParticipationRewards,
  } = useReadContracts({
    contracts: participationRewardContracts,
    query: { enabled: participationRewardContracts.length > 0 },
  });

  // --- Step 6: Build claimable items with calculated rewards ---
  const { claimableItems, activeStake } = useMemo(() => {
    const items: ClaimableRewardItem[] = [];

    // Safe BigInt conversion — Ponder returns numeric strings, but guard against bad data
    const safeBigInt = (val: unknown): bigint => {
      try {
        return BigInt(val as string | number);
      } catch {
        return 0n;
      }
    };

    // Add cancelled / tied / reveal-failed refunds.
    for (const v of refundVotes) {
      const stake = safeBigInt(v.stake);
      items.push({
        contentId: safeBigInt(v.contentId),
        roundId: safeBigInt(v.roundId),
        reward: stake,
        claimType: "refund",
      });
    }

    // Add settled winners (stake + weighted share of the winner pool).
    if (rewardResults && rewardResults.length === settledWinners.length * 2) {
      for (let i = 0; i < settledWinners.length; i++) {
        const v = settledWinners[i];
        const stake = safeBigInt(v.stake);
        const poolResult = rewardResults[i * 2];
        const winStakeResult = rewardResults[i * 2 + 1];

        let reward = stake; // at minimum, get stake back
        if (poolResult?.status === "success" && winStakeResult?.status === "success") {
          const pool = safeBigInt(poolResult.result);
          const weighted = safeBigInt(winStakeResult.result);
          if (weighted > 0n) {
            const w = BigInt(epochWeightBps(v.epochIndex));
            const effectiveStake = (stake * w) / 10000n;
            const poolShare = (effectiveStake * pool) / weighted;
            reward += poolShare;
          }
        }

        items.push({
          contentId: safeBigInt(v.contentId),
          roundId: safeBigInt(v.roundId),
          reward,
          claimType: "reward",
        });
      }
    }

    // Add settled losers (fixed 5% rebate for revealed losing votes).
    for (const v of settledLosers) {
      const stake = safeBigInt(v.stake);
      const reward = (stake * BigInt(REWARD_SPLIT_BPS.revealedLoserRefund)) / 10000n;
      items.push({
        contentId: safeBigInt(v.contentId),
        roundId: safeBigInt(v.roundId),
        reward,
        claimType: "reward",
      });
    }

    // Active stake = sum of stakes in open rounds
    let active = 0n;
    for (const v of votes) {
      if (v.roundState === ROUND_STATE.Open) {
        active += safeBigInt(v.stake);
      }
    }

    return { claimableItems: items, activeStake: active };
  }, [refundVotes, settledWinners, settledLosers, rewardResults, votes]);

  const participationClaimableItems = useMemo<ClaimableRewardItem[]>(() => {
    if (!participationRewardResults || participationRewardResults.length !== settledWinningTerminalVotes.length * 6) {
      return [];
    }

    const safeBigInt = (val: unknown): bigint => {
      try {
        return BigInt(val as string | number | bigint);
      } catch {
        return 0n;
      }
    };

    const candidates = settledWinningTerminalVotes.map((vote, index) => {
      const claimed = participationRewardResults[index * 6];
      const paid = participationRewardResults[index * 6 + 1];
      const rate = participationRewardResults[index * 6 + 2];
      const owed = participationRewardResults[index * 6 + 3];
      const reserved = participationRewardResults[index * 6 + 4];
      const pool = participationRewardResults[index * 6 + 5];
      const rewardPool =
        pool?.status === "success" && typeof pool.result === "string" && !/^0x0{40}$/i.test(pool.result)
          ? (pool.result.toLowerCase() as `0x${string}`)
          : null;

      return {
        contentId: safeBigInt(vote.contentId),
        roundId: safeBigInt(vote.roundId),
        stake: safeBigInt(vote.stake),
        alreadyClaimed: claimed?.status === "success" && claimed.result === true,
        alreadyPaid: paid?.status === "success" ? safeBigInt(paid.result) : 0n,
        rateBps: rate?.status === "success" ? safeBigInt(rate.result) : 0n,
        totalReward: owed?.status === "success" ? safeBigInt(owed.result) : 0n,
        reservedReward: reserved?.status === "success" ? safeBigInt(reserved.result) : 0n,
        rewardPool,
      };
    });

    return buildVoterParticipationClaimableRewards(candidates);
  }, [participationRewardResults, settledWinningTerminalVotes]);

  const combinedClaimableItems = useMemo(
    () => [
      ...claimableItems,
      ...participationClaimableItems,
      ...submitterClaimableItems,
      ...submitterParticipationClaimableItems,
      ...frontendClaimableItems,
      ...questionRewardPoolClaimableItems,
    ],
    [
      claimableItems,
      participationClaimableItems,
      submitterClaimableItems,
      submitterParticipationClaimableItems,
      frontendClaimableItems,
      questionRewardPoolClaimableItems,
    ],
  );

  const combinedCrepClaimable = useMemo(
    () =>
      [
        ...claimableItems,
        ...participationClaimableItems,
        ...submitterClaimableItems,
        ...submitterParticipationClaimableItems,
        ...frontendClaimableItems,
      ].reduce((sum, item) => sum + item.reward, 0n),
    [
      claimableItems,
      participationClaimableItems,
      submitterClaimableItems,
      submitterParticipationClaimableItems,
      frontendClaimableItems,
    ],
  );

  const isLoading =
    claimedLoading ||
    rewardsLoading ||
    participationRewardsLoading ||
    submitterLoading ||
    submitterParticipationLoading ||
    frontendClaimableLoading ||
    questionRewardPoolClaimableLoading;

  const refetch = useCallback(() => {
    refetchVotes();
    refetchClaimed();
    refetchParticipationRewards();
    refetchSubmitterClaimables();
    refetchSubmitterParticipationClaimables();
    refetchFrontendClaimables();
    refetchQuestionRewardPoolClaimables();
  }, [
    refetchVotes,
    refetchClaimed,
    refetchParticipationRewards,
    refetchSubmitterClaimables,
    refetchSubmitterParticipationClaimables,
    refetchFrontendClaimables,
    refetchQuestionRewardPoolClaimables,
  ]);

  return {
    claimableItems: combinedClaimableItems,
    totalClaimable: combinedCrepClaimable,
    totalCrepClaimable: combinedCrepClaimable,
    totalUsdcClaimable: totalQuestionRewardPoolClaimable,
    activeStake,
    isLoading,
    refetch,
  };
}
