import {
  type ContentItem,
  filterModeratedContentItems,
  filterRpcFeed,
  isContentSearchQueryTooShort,
  mapContentItem,
  sortRpcFeed,
} from "./shared";
import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackMediaItems } from "~~/lib/contentMedia";

function buildItem(
  id: bigint,
  title: string,
  description: string,
  tags: string[],
  url = `https://example.com/${id.toString()}`,
): ContentItem {
  return {
    id,
    url,
    media: buildFallbackMediaItems(url),
    title,
    description,
    tags,
    submitter: "0x0000000000000000000000000000000000000001",
    contentHash: `hash-${id.toString()}`,
    isOwnContent: false,
    categoryId: 1n,
    rating: 50,
    createdAt: "2026-03-31T00:00:00.000Z",
    lastActivityAt: "2026-03-31T00:00:00.000Z",
    totalVotes: 0,
    totalRounds: 0,
    openRound: null,
    isValidUrl: true,
    thumbnailUrl: null,
    rewardPoolSummary: null,
    feedbackBonusSummary: null,
  };
}

test("isContentSearchQueryTooShort allows url-like lookups while blocking generic short terms", () => {
  assert.equal(isContentSearchQueryTooShort("ai"), true);
  assert.equal(isContentSearchQueryTooShort("x.com"), false);
  assert.equal(isContentSearchQueryTooShort("https://curyo.xyz"), false);
});

test("sortRpcFeed prioritizes stronger relevance matches for rpc search fallback", () => {
  const feed = [
    buildItem(1n, "Marie Curie notebook", "Archived research notes from an early physics lab", ["science"]),
    buildItem(2n, "Lab archive", "A deep dive into radioactivity research", ["chemistry"]),
    buildItem(3n, "Modern physics", "General notes", ["history"]),
  ];

  const sorted = sortRpcFeed(feed, "relevance", "radioactivity research");

  assert.deepEqual(
    sorted.map(item => item.id),
    [2n, 1n, 3n],
  );
});

test("sortRpcFeed orders bounty-backed items by available USD bounties", () => {
  const feed = [
    {
      ...buildItem(1n, "Funded", "A funded question", ["markets"]),
      rewardPoolSummary: {
        totalFunded: 12_000_000n,
        totalAvailable: 5_000_000n,
        activeRewardPoolCount: 1,
      },
    },
    {
      ...buildItem(2n, "Bigger funded", "A more funded question", ["markets"]),
      rewardPoolSummary: {
        totalFunded: 30_000_000n,
        totalAvailable: 22_000_000n,
        activeRewardPoolCount: 1,
      },
    },
    buildItem(3n, "Unfunded", "No bounty", ["markets"]),
  ];

  const sorted = sortRpcFeed(feed, "highest_rewards");

  assert.deepEqual(
    sorted.map(item => item.id),
    [2n, 1n, 3n],
  );
});

test("sortRpcFeed includes open feedback bonuses in reward sorting", () => {
  const feed = [
    {
      ...buildItem(1n, "Feedback funded", "A question with feedback bonus", ["markets"]),
      feedbackBonusSummary: {
        totalFunded: 40_000_000n,
        totalRemaining: 24_000_000n,
        totalAwarded: 16_000_000n,
        activePoolCount: 1,
        awardCount: 1,
      },
    },
    {
      ...buildItem(2n, "Question funded", "A question with voter bounty", ["markets"]),
      rewardPoolSummary: {
        totalFunded: 30_000_000n,
        totalAvailable: 22_000_000n,
        activeRewardPoolCount: 1,
      },
    },
  ];

  const sorted = sortRpcFeed(feed, "highest_rewards");

  assert.deepEqual(
    sorted.map(item => item.id),
    [1n, 2n],
  );
});

test("filterModeratedContentItems removes content blocked by the frontend policy", () => {
  const feed = [
    buildItem(1n, "Normal title", "Normal description", ["science"]),
    buildItem(2n, "NSFW title", "Normal description", ["art"]),
  ];

  assert.deepEqual(
    filterModeratedContentItems(feed).map(item => item.id),
    [1n],
  );
});

test("mapContentItem marks linked submitter addresses as own content", () => {
  const item = mapContentItem(
    {
      id: "1",
      url: "https://example.com/1",
      title: "Delegated submission",
      description: "Submitted through a linked voter wallet",
      tags: "",
      submitter: "0x00000000000000000000000000000000000000aa",
      contentHash: "hash-1",
      categoryId: "1",
      rating: 50,
    },
    "0x0000000000000000000000000000000000000001",
    ["0x00000000000000000000000000000000000000aa"],
  );

  assert.equal(item.isOwnContent, true);
});

test("mapContentItem supports text-only questions and Ponder bounty summaries", () => {
  const item = mapContentItem({
    id: "2",
    url: null,
    title: "Would you book this hotel?",
    description: "Assume a weekend stay with a family.",
    tags: "Hotels,Value",
    submitter: "0x00000000000000000000000000000000000000aa",
    contentHash: "hash-2",
    questionMetadataHash: `0x${"2".repeat(64)}`,
    resultSpecHash: `0x${"3".repeat(64)}`,
    categoryId: "2",
    rating: 50,
    rewardPoolSummary: {
      totalFundedAmount: "25000000",
      currentRewardPoolAmount: "18000000",
      totalClaimedAmount: "7000000",
      totalVoterClaimedAmount: "6790000",
      totalFrontendClaimedAmount: "210000",
      activeRewardPoolCount: 1,
    },
    feedbackBonusSummary: {
      totalFundedAmount: "12000000",
      totalRemainingAmount: "8000000",
      totalAwardedAmount: "4000000",
      totalVoterAwardedAmount: "3880000",
      totalFrontendAwardedAmount: "120000",
      totalForfeitedAmount: "0",
      activePoolCount: 1,
      awardCount: 1,
    },
  });

  assert.equal(item.url, "");
  assert.deepEqual(item.media, []);
  assert.equal(item.question, "Would you book this hotel?");
  assert.equal(item.questionMetadataHash, `0x${"2".repeat(64)}`);
  assert.equal(item.resultSpecHash, `0x${"3".repeat(64)}`);
  assert.equal(item.rewardPoolSummary?.totalFunded, 25_000_000n);
  assert.equal(item.rewardPoolSummary?.totalAvailable, 18_000_000n);
  assert.equal(item.rewardPoolSummary?.totalClaimed, 7_000_000n);
  assert.equal(item.rewardPoolSummary?.totalVoterClaimed, 6_790_000n);
  assert.equal(item.rewardPoolSummary?.totalFrontendClaimed, 210_000n);
  assert.equal(item.rewardPoolSummary?.activeRewardPoolCount, 1);
  assert.equal(item.feedbackBonusSummary?.totalFunded, 12_000_000n);
  assert.equal(item.feedbackBonusSummary?.totalRemaining, 8_000_000n);
  assert.equal(item.feedbackBonusSummary?.totalAwarded, 4_000_000n);
  assert.equal(item.feedbackBonusSummary?.totalVoterAwarded, 3_880_000n);
  assert.equal(item.feedbackBonusSummary?.totalFrontendAwarded, 120_000n);
  assert.equal(item.feedbackBonusSummary?.activePoolCount, 1);
  assert.equal(item.feedbackBonusSummary?.awardCount, 1);
});

test("mapContentItem prefers Ponder question text when present", () => {
  const item = mapContentItem({
    id: "3",
    url: "https://example.com/evidence",
    question: "Would this itinerary be worth the extra transfer time?",
    title: "Example evidence link",
    description: "Compare the cheaper route with the direct route.",
    tags: "Travel",
    submitter: "0x00000000000000000000000000000000000000aa",
    contentHash: "hash-3",
    categoryId: "2",
    rating: 50,
  });

  assert.equal(item.question, "Would this itinerary be worth the extra transfer time?");
  assert.equal(item.title, "Example evidence link");
});

test("filterRpcFeed matches any address in the submitters filter", () => {
  const matching = {
    ...buildItem(1n, "Delegated", "Bot-submitted content", []),
    submitter: "0x00000000000000000000000000000000000000aa",
  };
  const ignored = {
    ...buildItem(2n, "Other", "Other content", []),
    submitter: "0x00000000000000000000000000000000000000bb",
  };

  assert.deepEqual(
    filterRpcFeed([matching, ignored], {
      submitters: ["0x0000000000000000000000000000000000000001", "0x00000000000000000000000000000000000000aa"],
    }).map(item => item.id),
    [1n],
  );
});
