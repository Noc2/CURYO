import { ponder } from "ponder:registry";
import { content, category, profile, globalStats, ratingChange } from "ponder:schema";
import { eq } from "ponder";
import { getCanonicalUrlParts } from "./urlCanonicalization.js";

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
  const { contentId, oldRating, newRating } = event.args;
  await context.db.update(content, { id: contentId }).set({
    rating: Number(newRating),
  });

  await context.db
    .insert(ratingChange)
    .values({
      id: `${contentId}-${event.block.number}`,
      contentId,
      oldRating: Number(oldRating),
      newRating: Number(newRating),
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
