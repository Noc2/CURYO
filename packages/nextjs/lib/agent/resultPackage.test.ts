import { buildAgentResultPackage } from "./resultPackage";
import { listAgentResultTemplates } from "./templates";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import assert from "node:assert/strict";
import test from "node:test";
import type { ContentFeedbackItem } from "~~/lib/feedback/types";
import type { PonderContentItem } from "~~/services/ponder/client";

const GENERIC_TEMPLATE = listAgentResultTemplates()[0];

function content(overrides: Partial<PonderContentItem> = {}): PonderContentItem {
  return {
    categoryId: "5",
    conservativeRatingBps: 6200,
    contentHash: `0x${"1".repeat(64)}`,
    createdAt: "1",
    description: "Should the agent proceed with the pricing plan?",
    id: "123",
    lastActivityAt: "2",
    openRound: null,
    questionMetadataHash: `0x${"2".repeat(64)}`,
    rating: 72,
    ratingBps: 7200,
    ratingConfidenceMass: "100",
    ratingEffectiveEvidence: "90",
    ratingLowSince: "0",
    ratingSettledRounds: 2,
    resultSpecHash: GENERIC_TEMPLATE.resultSpecHash,
    roundEpochDuration: 1200,
    roundMaxDuration: 604800,
    roundMaxVoters: 1000,
    roundMinVoters: 3,
    status: 0,
    submitter: `0x${"3".repeat(40)}`,
    tags: "pricing,agent",
    title: "Pricing plan",
    totalRounds: 2,
    totalVotes: 8,
    url: "https://example.com/pricing",
    ...overrides,
  };
}

function feedback(overrides: Partial<ContentFeedbackItem> = {}): ContentFeedbackItem {
  return {
    authorAddress: `0x${"4".repeat(40)}`,
    body: "Humans liked the problem, but the proposed pricing is too high for small teams.",
    chainId: 42220,
    clientNonce: null,
    contentId: "123",
    createdAt: "2026-01-01T00:00:00.000Z",
    feedbackHash: `0x${"5".repeat(64)}`,
    feedbackType: "concern",
    feedbackTypeLabel: "Concern",
    id: 1,
    isOwn: false,
    isPublic: true,
    moderationStatus: "approved",
    roundId: "2",
    sourceUrl: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    visibilityStatus: "hidden_until_settlement",
    ...overrides,
  };
}

test("buildAgentResultPackage turns a settled rating into an agent decision", () => {
  const result = buildAgentResultPackage({
    audienceContext: {
      fields: {
        ageGroup: [],
        expertise: [{ down: 0, total: 2, up: 2, value: "ai" }],
        languages: [{ down: 0, total: 2, up: 2, value: "en" }],
        nationalities: [],
        residenceCountry: [{ down: 0, total: 2, up: 2, value: "DE" }],
        roles: [
          { down: 0, total: 1, up: 1, value: "founder" },
          { down: 0, total: 2, up: 2, value: "engineer" },
        ],
      },
      note: "Audience context is public, self-reported, unverified, and not used for vote eligibility.",
      restrictedEligibility: false,
      selfReportedProfileCount: 2,
      source: "self_reported_public_profiles",
      totalRevealedVotes: 8,
      verified: false,
    },
    content: content(),
    feedback: [feedback()],
    latestRound: {
      downCount: 2,
      downPool: "300",
      revealedCount: 8,
      roundId: "2",
      settledAt: "100",
      state: ROUND_STATE.Settled,
      totalStake: "1000",
      upCount: 6,
      upPool: "700",
      upWins: true,
      voteCount: 8,
    },
    publicUrl: "https://curyo.xyz/rate?content=123",
  });

  assert.equal(result.ready, true);
  assert.equal(result.answer, "proceed");
  assert.equal(result.cohortSummary?.coverageShare, 0.25);
  assert.equal(result.cohortSummary?.topSignals.roles[0]?.value, "engineer");
  assert.equal(result.recommendedNextAction, "proceed_after_addressing_objections");
  assert.equal(result.distribution.up.share, 0.7);
  assert.equal(result.majorObjections[0]?.type, "concern");
  assert.deepEqual(result.feedbackQuality, {
    actionability: "medium",
    objectionCount: 1,
    publicNoteCount: 1,
    sourceUrlCount: 0,
  });
  assert.match(result.rationaleSummary, /72\/100/);
  assert.equal(result.methodology.templateId, "generic_rating");
});

test("buildAgentResultPackage exposes feedback source URLs for agents", () => {
  const result = buildAgentResultPackage({
    audienceContext: null,
    content: content(),
    feedback: [
      feedback({ feedbackType: "source_quality", sourceUrl: "https://example.com/source-a" }),
      feedback({ feedbackType: "counterpoint", id: 2, sourceUrl: "https://example.com/source-a" }),
      feedback({ feedbackType: "concern", id: 3, sourceUrl: "https://example.com/source-b" }),
    ],
    latestRound: {
      downCount: 3,
      downPool: "400",
      revealedCount: 8,
      roundId: "2",
      settledAt: "100",
      state: ROUND_STATE.Settled,
      totalStake: "1000",
      upCount: 5,
      upPool: "600",
      upWins: true,
      voteCount: 8,
    },
    publicUrl: "https://curyo.xyz/rate?content=123",
  });

  assert.equal(result.feedbackQuality.actionability, "high");
  assert.equal(result.feedbackQuality.sourceUrlCount, 2);
  assert.deepEqual(result.sourceUrls, ["https://example.com/source-a", "https://example.com/source-b"]);
});

test("buildAgentResultPackage keeps open rounds pending", () => {
  const result = buildAgentResultPackage({
    audienceContext: null,
    content: content({
      openRound: {
        confidenceMass: "0",
        conservativeRatingBps: 5000,
        downCount: 0,
        downPool: "0",
        effectiveEvidence: "0",
        epochDuration: 1200,
        estimatedSettlementTime: "4700002400",
        lowSince: "1700000100",
        maxDuration: 7200,
        maxVoters: 50,
        minVoters: 3,
        ratingBps: 5000,
        referenceRatingBps: 5000,
        revealedCount: 0,
        roundId: "1",
        settledRounds: 0,
        startTime: "1699998800",
        totalStake: "0",
        upCount: 0,
        upPool: "0",
        voteCount: 0,
      },
      rating: 50,
      ratingBps: 5000,
      ratingSettledRounds: 0,
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
        nextBountyClosesAt: "4700007200",
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
    }),
    feedback: [],
    latestRound: {
      downCount: 0,
      downPool: "0",
      revealedCount: 0,
      roundId: "1",
      state: ROUND_STATE.Open,
      totalStake: "0",
      upCount: 0,
      upPool: "0",
      voteCount: 0,
    },
    publicUrl: null,
  });

  assert.equal(result.ready, false);
  assert.equal(result.answer, "pending");
  assert.deepEqual(result.liveAskGuidance, {
    lowResponseRisk: "high",
    reasonCodes: [
      "quorum_not_reached",
      "low_response_persisting",
      "bounty_below_healthy_target",
    ],
    recommendedAction: "top_up",
    suggestedTopUpAtomic: "500000",
  });
  assert.equal(result.recommendedNextAction, "wait_for_settlement");
  assert.equal(result.confidence.level, "none");
  assert.ok(result.limitations.some(item => item.includes("not settled")));
});

test("buildAgentResultPackage prefers the latest round rating over stale content aggregates", () => {
  const result = buildAgentResultPackage({
    audienceContext: null,
    content: content({
      conservativeRatingBps: 7200,
      rating: 72,
      ratingBps: 7200,
    }),
    feedback: [],
    latestRound: {
      conservativeRatingBps: 3900,
      downCount: 5,
      downPool: "610",
      ratingBps: 3900,
      revealedCount: 8,
      roundId: "3",
      settledAt: "100",
      state: ROUND_STATE.Settled,
      totalStake: "1000",
      upCount: 3,
      upPool: "390",
      upWins: false,
      voteCount: 8,
    },
    publicUrl: "https://curyo.xyz/rate?content=123",
  });

  assert.equal(result.answer, "do_not_proceed");
  assert.equal(result.distribution.rating, 39);
  assert.equal(result.distribution.ratingBps, 3900);
  assert.equal(result.distribution.conservativeRatingBps, 3900);
  assert.equal(result.recommendedNextAction, "do_not_proceed");
  assert.match(result.rationaleSummary, /39\/100/);
});
