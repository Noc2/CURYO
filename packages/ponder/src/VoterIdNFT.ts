import { ponder } from "ponder:registry";
import { voterId, globalStats } from "ponder:schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

ponder.on("VoterIdNFT:Transfer", async ({ event, context }) => {
  const { to, tokenId } = event.args;

  // Ignore mints and burns — VoterIdMinted handles creation
  if (event.args.from === ZERO_ADDRESS || to === ZERO_ADDRESS) return;

  const existing = await context.db.find(voterId, { tokenId });
  if (existing) {
    await context.db.update(voterId, { tokenId }).set({ holder: to });
  }
});

ponder.on("VoterIdNFT:VoterIdMinted", async ({ event, context }) => {
  const { tokenId, holder, nullifier } = event.args;

  await context.db
    .insert(voterId)
    .values({
      tokenId,
      holder,
      nullifier,
      mintedAt: event.block.timestamp,
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
      totalProfiles: 0,
      totalVoterIds: 1,
    })
    .onConflictDoUpdate((row) => ({
      totalVoterIds: row.totalVoterIds + 1,
    }));
});

ponder.on("VoterIdNFT:VoterIdRevoked", async ({ event, context }) => {
  const { tokenId } = event.args;

  const existing = await context.db.find(voterId, { tokenId });
  if (existing) {
    await context.db.update(voterId, { tokenId }).set({ revoked: true });
  }
});
