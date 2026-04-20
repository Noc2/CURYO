import { ponder } from "ponder:registry";
import { category } from "ponder:schema";

ponder.on("CategoryRegistry:CategoryAdded", async ({ event, context }) => {
  const { categoryId, name, slug } = event.args;

  // CategoryAdded is now the only category path: seed-only discovery metadata.
  await context.db
    .insert(category)
    .values({
      id: categoryId,
      name,
      slug,
      createdAt: event.block.timestamp,
      totalVotes: 0,
      totalContent: 0,
    })
    .onConflictDoUpdate({ name, slug });
});
