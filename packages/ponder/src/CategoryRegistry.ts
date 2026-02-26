import { ponder } from "ponder:registry";
import { category } from "ponder:schema";

ponder.on(
  "CategoryRegistry:CategorySubmitted",
  async ({ event, context }) => {
    const { categoryId, submitter, name, domain, proposalId } = event.args;

    await context.db
      .insert(category)
      .values({
        id: categoryId,
        name,
        domain,
        submitter,
        status: 0, // Pending
        proposalId,
        createdAt: event.block.timestamp,
        totalVotes: 0,
        totalContent: 0,
      })
      .onConflictDoNothing();
  },
);

ponder.on(
  "CategoryRegistry:CategoryApproved",
  async ({ event, context }) => {
    const { categoryId } = event.args;
    await context.db
      .update(category, { id: categoryId })
      .set({ status: 1 });
  },
);

ponder.on(
  "CategoryRegistry:CategoryRejected",
  async ({ event, context }) => {
    const { categoryId } = event.args;
    await context.db
      .update(category, { id: categoryId })
      .set({ status: 2 });
  },
);

ponder.on("CategoryRegistry:CategoryAdded", async ({ event, context }) => {
  const { categoryId, name, domain } = event.args;

  // CategoryAdded is the admin fast-path. Insert as approved or update if exists.
  await context.db
    .insert(category)
    .values({
      id: categoryId,
      name,
      domain,
      submitter: event.transaction.from,
      status: 1, // Approved immediately
      createdAt: event.block.timestamp,
      totalVotes: 0,
      totalContent: 0,
    })
    .onConflictDoUpdate({ status: 1, name, domain });
});
