import { ponder } from "ponder:registry";
import { tokenHolder, tokenTransfer } from "ponder:schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Build exclusion set from all PONDER_*_ADDRESS env vars (deployed contracts)
const excludedAddresses = new Set<string>(
  Object.entries(process.env)
    .filter(([key]) => key.startsWith("PONDER_") && key.endsWith("_ADDRESS"))
    .map(([, value]) => value!.toLowerCase()),
);

ponder.on("CuryoReputation:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;

  // Record every transfer for balance history
  await context.db
    .insert(tokenTransfer)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      from: from,
      to: to,
      amount: value,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    })
    .onConflictDoNothing();

  // Track token holders (skip burns and known contracts)
  if (to === ZERO_ADDRESS) return;
  if (excludedAddresses.has(to.toLowerCase())) return;

  await context.db
    .insert(tokenHolder)
    .values({
      address: to,
      firstSeenAt: event.block.timestamp,
    })
    .onConflictDoNothing();
});
