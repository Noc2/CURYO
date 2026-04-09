import { ContentRegistryAbi } from "@curyo/contracts/abis";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { ponder } from "ponder:registry";
import { content, category, profile, globalStats, ratingChange, round } from "ponder:schema";
import { getCanonicalUrlParts } from "./urlCanonicalization.js";

function displayRatingFromBps(ratingBps: number) {
  return Math.min(100, Math.max(0, Math.round(ratingBps / 100)));
}

async function readRatingStateAtEventBlock(
  context: Parameters<Parameters<typeof ponder.on>[1]>[0]["context"],
  contentId: bigint,
) {
  const contentRegistryAddress = Array.isArray(context.contracts.ContentRegistry.address)
    ? context.contracts.ContentRegistry.address[0]
    : context.contracts.ContentRegistry.address;

  if (!contentRegistryAddress) {
    throw new Error("Missing ContentRegistry address in Ponder context");
  }

  return context.client.readContract({
    abi: ContentRegistryAbi,
    address: contentRegistryAddress,
    functionName: "getRatingState",
    args: [contentId],
  });
}

ponder.on("ContentRegistry:ContentSubmitted", async ({ event, context }) => {
  const { contentId, submitter, contentHash, url, title, description, tags, categoryId } =
    event.args;
  const canonicalUrl = getCanonicalUrlParts(url);

  await context.db
    .insert(content)
    .values({
      id: contentId,
      submitter,
      contentHash,
      url,
      canonicalUrl: canonicalUrl?.canonicalUrl ?? url.trim(),
      urlHost: canonicalUrl?.urlHost ?? "",
      title,
      description,
      tags,
      categoryId,
      status: 0,
      rating: 50,
      ratingBps: 5000,
      conservativeRatingBps: 5000,
      ratingConfidenceMass: 0n,
      ratingEffectiveEvidence: 0n,
      ratingSettledRounds: 0,
      ratingLowSince: 0n,
      submitterStakeReturned: false,
      createdAt: event.block.timestamp,
      lastActivityAt: event.block.timestamp,
      totalVotes: 0,
      totalRounds: 0,
    })
    .onConflictDoNothing();

  // Increment category content count (skip if category not yet indexed)
  const existingCategory = await context.db.find(category, { id: categoryId });
  if (existingCategory) {
    await context.db
      .update(category, { id: categoryId })
      .set((row) => ({ totalContent: row.totalContent + 1 }));
  }

  // Increment profile content count (skip if profile not yet indexed)
  const existingProfile = await context.db.find(profile, { address: submitter });
  if (existingProfile) {
    await context.db
      .update(profile, { address: submitter })
      .set((row) => ({ totalContent: row.totalContent + 1 }));
  }

  // Update global stats
  await context.db
    .insert(globalStats)
    .values({
      id: "global",
      totalContent: 1,
      totalVotes: 0,
      totalRoundsSettled: 0,
      totalRewardsClaimed: 0n,
      totalProfiles: 0,
      totalVoterIds: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalContent: row.totalContent + 1,
    }));
});

ponder.on("ContentRegistry:ContentDormant", async ({ event, context }) => {
  const { contentId } = event.args;
  await context.db.update(content, { id: contentId }).set({
    status: 1,
  });
});

ponder.on("ContentRegistry:ContentRevived", async ({ event, context }) => {
  const { contentId } = event.args;
  await context.db.update(content, { id: contentId }).set({
    status: 0,
    lastActivityAt: event.block.timestamp,
  });
});

ponder.on("ContentRegistry:ContentCancelled", async ({ event, context }) => {
  const { contentId } = event.args;
  await context.db.update(content, { id: contentId }).set({
    status: 2,
  });
});

ponder.on("ContentRegistry:RatingUpdated", async ({ event, context }) => {
  const { contentId, newRating } = event.args;
  const newRatingNum = Number(newRating);
  const newRatingBps = newRatingNum * 100;

  await context.db.update(content, { id: contentId }).set({
    rating: newRatingNum,
    ratingBps: newRatingBps,
    conservativeRatingBps: newRatingBps,
    lastActivityAt: event.block.timestamp,
  });
});

ponder.on("ContentRegistry:RatingStateUpdated", async ({ event, context }) => {
  const {
    contentId,
    roundId,
    referenceRatingBps,
    oldRatingBps,
    newRatingBps,
    conservativeRatingBps,
    confidenceMass,
    effectiveEvidence,
    settledRounds,
  } = event.args;
  const ratingState = await readRatingStateAtEventBlock(context, contentId);
  const lowSince = BigInt(ratingState.lowSince);
  const oldRating = displayRatingFromBps(Number(oldRatingBps));
  const newRating = displayRatingFromBps(Number(newRatingBps));

  await context.db.update(content, { id: contentId }).set({
    rating: newRating,
    ratingBps: Number(newRatingBps),
    conservativeRatingBps: Number(conservativeRatingBps),
    ratingConfidenceMass: confidenceMass,
    ratingEffectiveEvidence: effectiveEvidence,
    ratingSettledRounds: Number(settledRounds),
    ratingLowSince: lowSince,
    lastActivityAt: event.block.timestamp,
  });

  const existingRound = await context.db.find(round, { id: `${contentId}-${roundId}` });
  if (existingRound) {
    await context.db.update(round, { id: `${contentId}-${roundId}` }).set({
      referenceRatingBps: Number(referenceRatingBps),
      ratingBps: Number(newRatingBps),
      conservativeRatingBps: Number(conservativeRatingBps),
      confidenceMass,
      effectiveEvidence,
      settledRounds: Number(settledRounds),
      lowSince,
    });
  } else {
    await context.db.insert(round).values({
      id: `${contentId}-${roundId}`,
      contentId,
      roundId,
      state: ROUND_STATE.Settled,
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      referenceRatingBps: Number(referenceRatingBps),
      ratingBps: Number(newRatingBps),
      conservativeRatingBps: Number(conservativeRatingBps),
      confidenceMass,
      effectiveEvidence,
      settledRounds: Number(settledRounds),
      lowSince,
    });
  }

  await context.db
    .insert(ratingChange)
    .values({
      id: `${contentId}-${roundId}-${event.block.number}`,
      contentId,
      roundId,
      oldRating,
      newRating,
      referenceRatingBps: Number(referenceRatingBps),
      oldRatingBps: Number(oldRatingBps),
      newRatingBps: Number(newRatingBps),
      conservativeRatingBps: Number(conservativeRatingBps),
      confidenceMass,
      effectiveEvidence,
      settledRounds: Number(settledRounds),
      lowSince,
      timestamp: event.block.timestamp,
    })
    .onConflictDoNothing();
});

ponder.on(
  "ContentRegistry:SubmitterStakeReturned",
  async ({ event, context }) => {
    const { contentId } = event.args;
    await context.db.update(content, { id: contentId }).set({
      submitterStakeReturned: true,
    });
  },
);

ponder.on(
  "ContentRegistry:SubmitterStakeSlashed",
  async ({ event, context }) => {
    const { contentId } = event.args;
    await context.db.update(content, { id: contentId }).set({
      submitterStakeReturned: true,
    });
  },
);
