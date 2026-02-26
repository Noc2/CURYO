import { ponder } from "ponder:registry";
import { globalStats, profile } from "ponder:schema";

// Note: context.db in event handlers only supports find/insert/update/delete.
// Drizzle query builder (select/from/where) is only available in API routes.
// Aggregate counts start at 0 and are incremented by other event handlers
// (ContentSubmitted, VoteRevealed, RewardClaimed) as new events arrive.

ponder.on("ProfileRegistry:ProfileCreated", async ({ event, context }) => {
  const { user, name } = event.args;

  await context.db
    .insert(profile)
    .values({
      address: user,
      name,
      imageUrl: "",
      createdAt: event.block.timestamp,
      updatedAt: event.block.timestamp,
      totalVotes: 0,
      totalContent: 0,
      totalRewardsClaimed: 0n,
    })
    .onConflictDoNothing();

  await context.db
    .insert(globalStats)
    .values({
      id: "global",
      totalContent: 0,
      totalVotes: 0,
      totalRoundsSettled: 0,
      totalRewardsClaimed: 0n,
      totalProfiles: 1,
      totalVoterIds: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalProfiles: row.totalProfiles + 1,
    }));
});

ponder.on("ProfileRegistry:ProfileUpdated", async ({ event, context }) => {
  const { user, name, imageUrl } = event.args;

  const existing = await context.db.find(profile, { address: user });
  if (existing) {
    await context.db.update(profile, { address: user }).set({
      name,
      imageUrl,
      updatedAt: event.block.timestamp,
    });
  } else {
    await context.db
      .insert(profile)
      .values({
        address: user,
        name,
        imageUrl,
        createdAt: event.block.timestamp,
        updatedAt: event.block.timestamp,
        totalVotes: 0,
        totalContent: 0,
        totalRewardsClaimed: 0n,
      })
      .onConflictDoNothing();
  }
});
