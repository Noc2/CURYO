import { ponder } from "ponder:registry";
import {
  content,
  questionBundleClaim,
  questionBundleQuestion,
  questionBundleReward,
  questionRewardPool,
  questionRewardPoolClaim,
  questionRewardPoolRound,
} from "ponder:schema";

function bundleQuestionRowId(bundleId: bigint, bundleIndex: bigint | number) {
  return `${bundleId}-${bundleIndex}`;
}

ponder.on("QuestionRewardPoolEscrow:RewardPoolCreated", async ({ event, context }) => {
  const {
    rewardPoolId,
    contentId,
    funder,
    funderVoterId,
    asset,
    nonRefundable,
    amount,
    requiredVoters,
    requiredSettledRounds,
    startRoundId,
    bountyOpensAt,
    bountyClosesAt,
    feedbackClosesAt,
    frontendFeeBps,
  } = event.args;

  await context.db
    .insert(questionRewardPool)
    .values({
      id: rewardPoolId,
      contentId,
      funder,
      funderVoterId,
      asset: Number(asset),
      nonRefundable,
      fundedAmount: amount,
      unallocatedAmount: amount,
      allocatedAmount: 0n,
      claimedAmount: 0n,
      voterClaimedAmount: 0n,
      frontendClaimedAmount: 0n,
      refundedAmount: 0n,
      requiredVoters: Number(requiredVoters),
      requiredSettledRounds: Number(requiredSettledRounds),
      qualifiedRounds: 0,
      frontendFeeBps: Number(frontendFeeBps),
      startRoundId,
      bountyOpensAt,
      bountyClosesAt,
      feedbackClosesAt,
      expiresAt: bountyClosesAt,
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

ponder.on("QuestionRewardPoolEscrow:RewardPoolForfeited", async ({ event, context }) => {
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

ponder.on("QuestionRewardPoolEscrow:RewardPoolRoundQualified", async ({ event, context }) => {
  const { rewardPoolId, contentId, roundId, allocation, eligibleVoters, frontendFeeAllocation } = event.args;

  await context.db
    .insert(questionRewardPoolRound)
    .values({
      id: `${rewardPoolId}-${roundId}`,
      rewardPoolId,
      contentId,
      roundId,
      allocation,
      frontendFeeAllocation,
      eligibleVoters: Number(eligibleVoters),
      claimedAmount: 0n,
      voterClaimedAmount: 0n,
      frontendClaimedAmount: 0n,
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
  const {
    rewardPoolId,
    contentId,
    roundId,
    claimant,
    voterId,
    amount,
    frontend,
    frontendRecipient,
    frontendFee,
    grossAmount,
  } = event.args;

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
      grossAmount,
      frontend,
      frontendRecipient,
      frontendFee,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await context.db.update(questionRewardPoolRound, { id: `${rewardPoolId}-${roundId}` }).set((row) => ({
    claimedAmount: row.claimedAmount + grossAmount,
    voterClaimedAmount: row.voterClaimedAmount + amount,
    frontendClaimedAmount: row.frontendClaimedAmount + frontendFee,
    claimedCount: row.claimedCount + 1,
  }));

  await context.db.update(questionRewardPool, { id: rewardPoolId }).set((row) => ({
    claimedAmount: row.claimedAmount + grossAmount,
    voterClaimedAmount: row.voterClaimedAmount + amount,
    frontendClaimedAmount: row.frontendClaimedAmount + frontendFee,
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

ponder.on("QuestionRewardPoolEscrow:QuestionBundleRewardCreated", async ({ event, context }) => {
  const {
    bundleId,
    funder,
    funderVoterId,
    amount,
    requiredCompleters,
    questionCount,
    bountyOpensAt,
    bountyClosesAt,
    feedbackClosesAt,
    frontendFeeBps,
    asset,
  } = event.args;

  await context.db
    .insert(questionBundleReward)
    .values({
      id: bundleId,
      funder,
      funderVoterId,
      asset: Number(asset),
      fundedAmount: amount,
      claimedAmount: 0n,
      voterClaimedAmount: 0n,
      frontendClaimedAmount: 0n,
      refundedAmount: 0n,
      requiredCompleters: Number(requiredCompleters),
      questionCount: Number(questionCount),
      completedQuestionCount: 0,
      claimedCount: 0,
      frontendFeeBps: Number(frontendFeeBps),
      bountyOpensAt,
      bountyClosesAt,
      feedbackClosesAt,
      expiresAt: bountyClosesAt,
      failed: false,
      refunded: false,
      createdAt: event.block.timestamp,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      funder,
      funderVoterId,
      asset: Number(asset),
      fundedAmount: amount,
      requiredCompleters: Number(requiredCompleters),
      questionCount: Number(questionCount),
      frontendFeeBps: Number(frontendFeeBps),
      bountyOpensAt,
      bountyClosesAt,
      feedbackClosesAt,
      expiresAt: bountyClosesAt,
      updatedAt: event.block.timestamp,
      claimedAmount: row.claimedAmount,
      voterClaimedAmount: row.voterClaimedAmount,
      frontendClaimedAmount: row.frontendClaimedAmount,
      refundedAmount: row.refundedAmount,
      completedQuestionCount: row.completedQuestionCount,
      claimedCount: row.claimedCount,
      failed: row.failed,
      refunded: row.refunded,
    }));
});

ponder.on("QuestionRewardPoolEscrow:QuestionBundleRoundRecorded", async ({ event, context }) => {
  const { bundleId, contentId, roundId, bundleIndex } = event.args;
  const id = bundleQuestionRowId(bundleId, bundleIndex);
  const existingQuestion = await context.db.find(questionBundleQuestion, { id });
  const shouldIncrementCompleted = !existingQuestion?.settled;

  await context.db
    .insert(questionBundleQuestion)
    .values({
      id,
      bundleId,
      contentId,
      bundleIndex: Number(bundleIndex),
      roundId,
      settled: true,
      terminal: true,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate(() => ({
      contentId,
      bundleIndex: Number(bundleIndex),
      roundId,
      settled: true,
      terminal: true,
      updatedAt: event.block.timestamp,
    }));

  if (shouldIncrementCompleted) {
    await context.db.update(questionBundleReward, { id: bundleId }).set((row) => ({
      completedQuestionCount: row.completedQuestionCount + 1,
      updatedAt: event.block.timestamp,
    }));
  } else {
    await context.db.update(questionBundleReward, { id: bundleId }).set({
      updatedAt: event.block.timestamp,
    });
  }

  const existingContent = await context.db.find(content, { id: contentId });
  if (existingContent) {
    await context.db.update(content, { id: contentId }).set({
      lastActivityAt: event.block.timestamp,
    });
  }
});

ponder.on("QuestionRewardPoolEscrow:QuestionBundleRewardClaimed", async ({ event, context }) => {
  const {
    bundleId,
    claimant,
    voterId,
    amount,
    frontend,
    frontendRecipient,
    frontendFee,
    grossAmount,
  } = event.args;
  const id = `${bundleId}-${voterId}`;
  const existingClaim = await context.db.find(questionBundleClaim, { id });

  await context.db
    .insert(questionBundleClaim)
    .values({
      id,
      bundleId,
      claimant,
      voterId,
      amount,
      grossAmount,
      frontend,
      frontendRecipient,
      frontendFee,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  if (!existingClaim) {
    await context.db.update(questionBundleReward, { id: bundleId }).set((row) => ({
      claimedAmount: row.claimedAmount + grossAmount,
      voterClaimedAmount: row.voterClaimedAmount + amount,
      frontendClaimedAmount: row.frontendClaimedAmount + frontendFee,
      claimedCount: row.claimedCount + 1,
      updatedAt: event.block.timestamp,
    }));
  }
});

ponder.on("QuestionRewardPoolEscrow:QuestionBundleRewardRefunded", async ({ event, context }) => {
  const { bundleId, amount } = event.args;

  await context.db.update(questionBundleReward, { id: bundleId }).set((row) => ({
    refundedAmount: row.refundedAmount + amount,
    refunded: true,
    updatedAt: event.block.timestamp,
  }));
});

ponder.on("QuestionRewardPoolEscrow:QuestionBundleRewardForfeited", async ({ event, context }) => {
  const { bundleId, amount } = event.args;

  await context.db.update(questionBundleReward, { id: bundleId }).set((row) => ({
    refundedAmount: row.refundedAmount + amount,
    refunded: true,
    updatedAt: event.block.timestamp,
  }));
});
