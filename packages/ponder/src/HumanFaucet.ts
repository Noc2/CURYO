import { ponder } from "ponder:registry";
import { humanFaucetClaim, humanFaucetReferralReward } from "ponder:schema";

ponder.on("HumanFaucet:TokensClaimed", async ({ event, context }) => {
  const { user, nullifier, amount } = event.args;

  await context.db
    .insert(humanFaucetClaim)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      user,
      nullifier,
      amount,
      blockNumber: event.block.number,
      claimedAt: event.block.timestamp,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
    })
    .onConflictDoNothing();
});

ponder.on("HumanFaucet:ReferralRewardPaid", async ({ event, context }) => {
  const { referrer, claimant, referrerReward, claimantBonus } = event.args;

  await context.db
    .insert(humanFaucetReferralReward)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      referrer,
      claimant,
      referrerReward,
      claimantBonus,
      blockNumber: event.block.number,
      paidAt: event.block.timestamp,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
    })
    .onConflictDoNothing();
});
