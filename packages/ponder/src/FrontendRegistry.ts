import { ponder } from "ponder:registry";
import { frontend } from "ponder:schema";

/** Must match FrontendRegistry.STAKE_AMOUNT (1000 HREP with 6 decimals). */
const STAKE_AMOUNT = 1000_000000n;

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
        eligible: true,
        slashed: false,
        exitAvailableAt: null,
        totalFeesCredited: 0n,
        totalFeesClaimed: 0n,
        registeredAt: event.block.timestamp,
      })
      .onConflictDoUpdate({
        operator,
        stakedAmount,
        eligible: true,
        slashed: false,
        exitAvailableAt: null,
        registeredAt: event.block.timestamp,
      });
  },
);

ponder.on(
  "FrontendRegistry:FrontendExitRequested",
  async ({ event, context }) => {
    const { frontend: addr, availableAt } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set({ eligible: false, exitAvailableAt: availableAt });
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
        eligible: false,
        stakedAmount: row.stakedAmount - amount,
      }));
  },
);

ponder.on(
  "FrontendRegistry:FrontendUnslashed",
  async ({ event, context }) => {
    const { frontend: addr } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        slashed: false,
        eligible: row.stakedAmount === STAKE_AMOUNT && row.exitAvailableAt === null,
      }));
  },
);

ponder.on(
  "FrontendRegistry:FrontendStakeToppedUp",
  async ({ event, context }) => {
    const { frontend: addr, newStakedAmount } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        stakedAmount: newStakedAmount,
        eligible: !row.slashed && newStakedAmount === STAKE_AMOUNT && row.exitAvailableAt === null,
      }));
  },
);

ponder.on(
  "FrontendRegistry:FrontendDeregistered",
  async ({ event, context }) => {
    const { frontend: addr } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set({ eligible: false, stakedAmount: 0n, exitAvailableAt: null });
  },
);

ponder.on(
  "FrontendRegistry:FeesCredited",
  async ({ event, context }) => {
    const { frontend: addr, hrepAmount } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        totalFeesCredited: row.totalFeesCredited + hrepAmount,
      }));
  },
);

ponder.on(
  "FrontendRegistry:FeesClaimed",
  async ({ event, context }) => {
    const { frontend: addr, hrepAmount } = event.args;
    await context.db
      .update(frontend, { address: addr })
      .set((row) => ({
        totalFeesClaimed: row.totalFeesClaimed + hrepAmount,
      }));
  },
);
