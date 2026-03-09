import { ponder } from "ponder:registry";
import { profileFollow } from "ponder:schema";

ponder.on("FollowRegistry:ProfileFollowed", async ({ event, context }) => {
  const { follower, followed } = event.args;
  const id = `${follower.toLowerCase()}-${followed.toLowerCase()}`;

  await context.db
    .insert(profileFollow)
    .values({
      id,
      follower,
      followed,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      follower,
      followed,
      createdAt: event.block.timestamp,
    });
});

ponder.on("FollowRegistry:ProfileUnfollowed", async ({ event, context }) => {
  const { follower, followed } = event.args;
  const id = `${follower.toLowerCase()}-${followed.toLowerCase()}`;

  await context.db.delete(profileFollow, { id });
});
