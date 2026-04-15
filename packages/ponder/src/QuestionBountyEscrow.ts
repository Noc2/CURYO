import { ponder } from "ponder:registry";
import { content, questionBounty, questionBountyClaim, questionBountyRound } from "ponder:schema";

ponder.on("QuestionBountyEscrow:BountyCreated", async ({ event, context }) => {
  const {
    bountyId,
    contentId,
    funder,
    funderVoterId,
    amount,
    requiredVoters,
    requiredSettledRounds,
    startRoundId,
    expiresAt,
  } = event.args;

  await context.db
    .insert(questionBounty)
    .values({
      id: bountyId,
      contentId,
      funder,
      funderVoterId,
      fundedAmount: amount,
      unallocatedAmount: amount,
      allocatedAmount: 0n,
      claimedAmount: 0n,
      refundedAmount: 0n,
      requiredVoters: Number(requiredVoters),
      requiredSettledRounds: Number(requiredSettledRounds),
      qualifiedRounds: 0,
      startRoundId,
      expiresAt,
      refunded: false,
      createdAt: event.block.timestamp,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  const existingContent = await context.db.find(content, { id: contentId });
  if (existingContent) {
    await context.db.update(content, { id: contentId }).set({
      lastActivityAt: event.block.timestamp,
    });
  }
});

ponder.on("QuestionBountyEscrow:BountyRoundQualified", async ({ event, context }) => {
  const { bountyId, contentId, roundId, allocation, eligibleVoters } = event.args;

  await context.db
    .insert(questionBountyRound)
    .values({
      id: `${bountyId}-${roundId}`,
      bountyId,
      contentId,
      roundId,
      allocation,
      eligibleVoters: Number(eligibleVoters),
      claimedAmount: 0n,
      claimedCount: 0,
      qualifiedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await context.db.update(questionBounty, { id: bountyId }).set((row) => ({
    unallocatedAmount: row.unallocatedAmount - allocation,
    allocatedAmount: row.allocatedAmount + allocation,
    qualifiedRounds: row.qualifiedRounds + 1,
    updatedAt: event.block.timestamp,
  }));

  const existingContent = await context.db.find(content, { id: contentId });
  if (existingContent) {
    await context.db.update(content, { id: contentId }).set({
      lastActivityAt: event.block.timestamp,
    });
  }
});

ponder.on("QuestionBountyEscrow:BountyRewardClaimed", async ({ event, context }) => {
  const { bountyId, contentId, roundId, claimant, voterId, amount } = event.args;

  await context.db
    .insert(questionBountyClaim)
    .values({
      id: `${bountyId}-${roundId}-${voterId}`,
      bountyId,
      contentId,
      roundId,
      claimant,
      voterId,
      amount,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await context.db.update(questionBountyRound, { id: `${bountyId}-${roundId}` }).set((row) => ({
    claimedAmount: row.claimedAmount + amount,
    claimedCount: row.claimedCount + 1,
  }));

  await context.db.update(questionBounty, { id: bountyId }).set((row) => ({
    claimedAmount: row.claimedAmount + amount,
    updatedAt: event.block.timestamp,
  }));
});

ponder.on("QuestionBountyEscrow:BountyRefunded", async ({ event, context }) => {
  const { bountyId, amount } = event.args;
  const existingBounty = await context.db.find(questionBounty, { id: bountyId });

  await context.db.update(questionBounty, { id: bountyId }).set((row) => ({
    unallocatedAmount: 0n,
    refundedAmount: row.refundedAmount + amount,
    refunded: true,
    updatedAt: event.block.timestamp,
  }));

  if (existingBounty) {
    const existingContent = await context.db.find(content, { id: existingBounty.contentId });
    if (existingContent) {
      await context.db.update(content, { id: existingBounty.contentId }).set({
        lastActivityAt: event.block.timestamp,
      });
    }
  }
});
