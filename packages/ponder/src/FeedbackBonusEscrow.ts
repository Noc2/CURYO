import { ponder } from "ponder:registry";
import { content, feedbackBonusAward, feedbackBonusPool } from "ponder:schema";

async function touchContent(context: { db: any }, contentId: bigint, timestamp: bigint) {
  const existingContent = await context.db.find(content, { id: contentId });
  if (existingContent) {
    await context.db.update(content, { id: contentId }).set({
      lastActivityAt: timestamp,
    });
  }
}

ponder.on("FeedbackBonusEscrow:FeedbackBonusPoolCreated", async ({ event, context }) => {
  const { poolId, contentId, roundId, funder, awarder, amount, feedbackClosesAt, frontendFeeBps } = event.args;

  await context.db
    .insert(feedbackBonusPool)
    .values({
      id: poolId,
      contentId,
      roundId,
      funder,
      awarder,
      fundedAmount: amount,
      remainingAmount: amount,
      awardedAmount: 0n,
      voterAwardedAmount: 0n,
      frontendAwardedAmount: 0n,
      forfeitedAmount: 0n,
      awardCount: 0,
      feedbackClosesAt,
      awardDeadline: feedbackClosesAt,
      frontendFeeBps: Number(frontendFeeBps),
      forfeited: false,
      createdAt: event.block.timestamp,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await touchContent(context, contentId, event.block.timestamp);
});

ponder.on("FeedbackBonusEscrow:FeedbackBonusAwarded", async ({ event, context }) => {
  const {
    poolId,
    contentId,
    roundId,
    recipient,
    voterId,
    feedbackHash,
    grossAmount,
    recipientAmount,
    frontend,
    frontendRecipient,
    frontendFee,
  } = event.args;

  await context.db
    .insert(feedbackBonusAward)
    .values({
      id: `${poolId}-${feedbackHash}`,
      poolId,
      contentId,
      roundId,
      recipient,
      voterId,
      feedbackHash,
      grossAmount,
      recipientAmount,
      frontend,
      frontendRecipient,
      frontendFee,
      awardedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await context.db.update(feedbackBonusPool, { id: poolId }).set((row) => ({
    remainingAmount: row.remainingAmount - grossAmount,
    awardedAmount: row.awardedAmount + grossAmount,
    voterAwardedAmount: row.voterAwardedAmount + recipientAmount,
    frontendAwardedAmount: row.frontendAwardedAmount + frontendFee,
    awardCount: row.awardCount + 1,
    updatedAt: event.block.timestamp,
  }));

  await touchContent(context, contentId, event.block.timestamp);
});

ponder.on("FeedbackBonusEscrow:FeedbackBonusForfeited", async ({ event, context }) => {
  const { poolId, amount } = event.args;
  const existingPool = await context.db.find(feedbackBonusPool, { id: poolId });

  await context.db.update(feedbackBonusPool, { id: poolId }).set((row) => ({
    remainingAmount: 0n,
    forfeitedAmount: row.forfeitedAmount + amount,
    forfeited: true,
    updatedAt: event.block.timestamp,
  }));

  if (existingPool) {
    await touchContent(context, existingPool.contentId, event.block.timestamp);
  }
});
