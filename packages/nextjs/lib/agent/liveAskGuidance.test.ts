import { buildAgentLiveAskGuidance } from "./liveAskGuidance";
import assert from "node:assert/strict";
import test from "node:test";
import type { PonderContentItem } from "~~/services/ponder/client";

function content(overrides: Partial<PonderContentItem> = {}): PonderContentItem {
  return {
    categoryId: "5",
    conservativeRatingBps: 5000,
    contentHash: `0x${"1".repeat(64)}`,
    createdAt: "1",
    description: "Would this make you want to learn more?",
    id: "42",
    lastActivityAt: "2",
    openRound: {
      confidenceMass: "0",
      conservativeRatingBps: 5000,
      downCount: 0,
      downPool: "0",
      effectiveEvidence: "0",
      epochDuration: 1200,
      estimatedSettlementTime: "1700002400",
      lowSince: undefined,
      maxDuration: 7200,
      maxVoters: 50,
      minVoters: 3,
      ratingBps: 5000,
      referenceRatingBps: 5000,
      revealedCount: 1,
      roundId: "1",
      settledRounds: 0,
      startTime: "1699998800",
      totalStake: "1000",
      upCount: 1,
      upPool: "1000",
      voteCount: 1,
    },
    questionMetadataHash: `0x${"2".repeat(64)}`,
    rating: 50,
    ratingBps: 5000,
    ratingConfidenceMass: "0",
    ratingEffectiveEvidence: "0",
    ratingLowSince: "0",
    ratingSettledRounds: 0,
    resultSpecHash: null,
    rewardPoolSummary: {
      activeRewardPoolCount: 1,
      activeUnallocatedAmount: "1000000",
      claimableAllocatedAmount: "0",
      currentRewardPoolAmount: "1000000",
      currency: "USDC",
      decimals: 6,
      displayCurrency: "USD",
      expiredRewardPoolCount: 0,
      expiredUnallocatedAmount: "0",
      hasActiveBounty: true,
      nextBountyClosesAt: "1700007200",
      nextFeedbackClosesAt: null,
      qualifiedRoundCount: 0,
      rewardPoolCount: 1,
      totalAllocatedAmount: "0",
      totalClaimedAmount: "0",
      totalFrontendClaimedAmount: "0",
      totalFundedAmount: "1000000",
      totalRefundedAmount: "0",
      totalUnallocatedAmount: "1000000",
      totalVoterClaimedAmount: "0",
    },
    roundEpochDuration: 1200,
    roundMaxDuration: 7200,
    roundMaxVoters: 50,
    roundMinVoters: 3,
    status: 0,
    submitter: `0x${"3".repeat(40)}`,
    tags: "agent,pitch",
    title: "Pitch interest",
    totalRounds: 1,
    totalVotes: 1,
    url: "https://example.com/pitch",
    ...overrides,
  };
}

test("buildAgentLiveAskGuidance recommends topping up weak live asks", () => {
  const guidance = buildAgentLiveAskGuidance({
    content: content({
      openRound: {
        ...content().openRound!,
        lowSince: "1700000100",
        voteCount: 1,
      },
    }),
    nowSeconds: 1_700_000_300,
  });

  assert.deepEqual(guidance, {
    lowResponseRisk: "high",
    reasonCodes: ["quorum_not_reached", "low_response_persisting", "bounty_below_healthy_target"],
    recommendedAction: "top_up",
    suggestedTopUpAtomic: "500000",
  });
});

test("buildAgentLiveAskGuidance flags asks below the conservative starting bounty before lowSince is set", () => {
  const guidance = buildAgentLiveAskGuidance({
    content: content({
      rewardPoolSummary: {
        ...content().rewardPoolSummary!,
        currentRewardPoolAmount: "500000",
      },
    }),
    nowSeconds: 1_700_000_300,
  });

  assert.deepEqual(guidance, {
    lowResponseRisk: "high",
    reasonCodes: [
      "quorum_not_reached",
      "bounty_below_conservative_start",
      "bounty_below_healthy_target",
    ],
    recommendedAction: "top_up",
    suggestedTopUpAtomic: "1000000",
  });
});

test("buildAgentLiveAskGuidance recommends retry_later when a weak bounty is about to close", () => {
  const guidance = buildAgentLiveAskGuidance({
    content: content({
      openRound: {
        ...content().openRound!,
        estimatedSettlementTime: "1700000500",
        lowSince: "1700000100",
        voteCount: 1,
      },
      rewardPoolSummary: {
        ...content().rewardPoolSummary!,
        nextBountyClosesAt: "1700001800",
      },
    }),
    nowSeconds: 1_700_000_200,
  });

  assert.equal(guidance?.recommendedAction, "retry_later");
  assert.equal(guidance?.lowResponseRisk, "high");
  assert.ok(guidance?.reasonCodes.includes("bounty_closing_soon"));
  assert.ok(guidance?.reasonCodes.includes("settlement_near_with_quorum_gap"));
});

test("buildAgentLiveAskGuidance returns low-risk guidance for healthy open asks", () => {
  const guidance = buildAgentLiveAskGuidance({
    content: content({
      openRound: {
        ...content().openRound!,
        voteCount: 4,
      },
      rewardPoolSummary: {
        ...content().rewardPoolSummary!,
        currentRewardPoolAmount: "2000000",
      },
    }),
    nowSeconds: 1_700_000_100,
  });

  assert.deepEqual(guidance, {
    lowResponseRisk: "low",
    reasonCodes: [],
    recommendedAction: "wait",
    suggestedTopUpAtomic: null,
  });
});

test("buildAgentLiveAskGuidance ignores zero lowSince sentinels", () => {
  const guidance = buildAgentLiveAskGuidance({
    content: content({
      openRound: {
        ...content().openRound!,
        lowSince: "0",
        voteCount: 4,
      },
      rewardPoolSummary: {
        ...content().rewardPoolSummary!,
        currentRewardPoolAmount: "2000000",
      },
    }),
    nowSeconds: 1_700_000_100,
  });

  assert.deepEqual(guidance, {
    lowResponseRisk: "low",
    reasonCodes: [],
    recommendedAction: "wait",
    suggestedTopUpAtomic: null,
  });
});
