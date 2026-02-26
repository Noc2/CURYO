import { ponder } from "ponder:registry";
import { frontend } from "ponder:schema";

ponder.on(
  "FrontendRegistry:FrontendRegistered",
  async ({ event, context }) => {
    const { frontend: addr, operator, stakedAmount } = event.args;

    await context.db
      .insert(frontend)
      .values({
        address: addr,
        operator,
        stakedAmount,
        approved: false,
        slashed: false,
        totalFeesCredited: 0n,
        totalFeesClaimed: 0n,
        registeredAt: event.block.timestamp,
      })
      .onConflictDoUpdate({
        operator,
        stakedAmount,
        approved: false,
        slashed: false,
        registeredAt: event.block.timestamp,
      });
  },
);

ponder.on(
  "FrontendRegistry:FrontendApproved",
  async ({ event, context }) => {
    const { frontend: addr } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set({ approved: true });
  },
);

ponder.on(
  "FrontendRegistry:FrontendSlashed",
  async ({ event, context }) => {
    const { frontend: addr, amount } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        slashed: true,
        approved: false,
        stakedAmount: row.stakedAmount - amount,
      }));
  },
);

ponder.on(
  "FrontendRegistry:FrontendDeregistered",
  async ({ event, context }) => {
    const { frontend: addr } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set({ approved: false, stakedAmount: 0n });
  },
);

ponder.on(
  "FrontendRegistry:FeesCredited",
  async ({ event, context }) => {
    const { frontend: addr, crepAmount } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        totalFeesCredited: row.totalFeesCredited + crepAmount,
      }));
  },
);

ponder.on(
  "FrontendRegistry:FeesClaimed",
  async ({ event, context }) => {
    const { frontend: addr, crepAmount } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        totalFeesClaimed: row.totalFeesClaimed + crepAmount,
      }));
  },
);
