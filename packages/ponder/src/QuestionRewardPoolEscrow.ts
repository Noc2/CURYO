import { ponder } from "ponder:registry";
import { content, questionRewardPool, questionRewardPoolClaim, questionRewardPoolRound } from "ponder:schema";

ponder.on("QuestionRewardPoolEscrow:RewardPoolCreated", async ({ event, context }) => {
  const {
    rewardPoolId,
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
    .insert(questionRewardPool)
    .values({
      id: rewardPoolId,
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

ponder.on("QuestionRewardPoolEscrow:RewardPoolRoundQualified", async ({ event, context }) => {
  const { rewardPoolId, contentId, roundId, allocation, eligibleVoters } = event.args;

  await context.db
    .insert(questionRewardPoolRound)
    .values({
      id: `${rewardPoolId}-${roundId}`,
      rewardPoolId,
      contentId,
      roundId,
      allocation,
      eligibleVoters: Number(eligibleVoters),
      claimedAmount: 0n,
      claimedCount: 0,
      qualifiedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await context.db.update(questionRewardPool, { id: rewardPoolId }).set((row) => ({
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

ponder.on("QuestionRewardPoolEscrow:QuestionRewardClaimed", async ({ event, context }) => {
  const { rewardPoolId, contentId, roundId, claimant, voterId, amount } = event.args;

  await context.db
    .insert(questionRewardPoolClaim)
    .values({
      id: `${rewardPoolId}-${roundId}-${voterId}`,
      rewardPoolId,
      contentId,
      roundId,
      claimant,
      voterId,
      amount,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await context.db.update(questionRewardPoolRound, { id: `${rewardPoolId}-${roundId}` }).set((row) => ({
    claimedAmount: row.claimedAmount + amount,
    claimedCount: row.claimedCount + 1,
  }));

  await context.db.update(questionRewardPool, { id: rewardPoolId }).set((row) => ({
    claimedAmount: row.claimedAmount + amount,
    updatedAt: event.block.timestamp,
  }));
});

ponder.on("QuestionRewardPoolEscrow:RewardPoolRefunded", async ({ event, context }) => {
  const { rewardPoolId, amount } = event.args;
  const existingRewardPool = await context.db.find(questionRewardPool, { id: rewardPoolId });

  await context.db.update(questionRewardPool, { id: rewardPoolId }).set((row) => ({
    unallocatedAmount: 0n,
    refundedAmount: row.refundedAmount + amount,
    refunded: true,
    updatedAt: event.block.timestamp,
  }));

  if (existingRewardPool) {
    const existingContent = await context.db.find(content, { id: existingRewardPool.contentId });
    if (existingContent) {
      await context.db.update(content, { id: existingRewardPool.contentId }).set({
        lastActivityAt: event.block.timestamp,
      });
    }
  }
});
