import { VOTE_COOLDOWN_SECONDS } from "./cooldown";
import { buildVoteCooldownItemsFromLogs } from "./cooldownLogs";
import assert from "node:assert/strict";
import test from "node:test";

test("buildVoteCooldownItemsFromLogs keeps the latest commit per content", async () => {
  const items = await buildVoteCooldownItemsFromLogs(
    [
      { args: { contentId: 7n }, blockNumber: 10n, logIndex: 0 },
      { args: { contentId: 7n }, blockNumber: 11n, logIndex: 0 },
      { args: { contentId: 8n }, blockNumber: 9n, logIndex: 2 },
      { args: { contentId: 7n }, blockNumber: 11n, logIndex: 3 },
      { args: {}, blockNumber: 12n, logIndex: 0 },
    ],
    async log => Number(log.blockNumber) * 100,
  );

  assert.deepEqual(
    items.sort((left, right) => Number(left.contentId) - Number(right.contentId)),
    [
      {
        contentId: "7",
        latestCommittedAt: "1100",
        cooldownEndsAt: (1100 + VOTE_COOLDOWN_SECONDS).toString(),
      },
      {
        contentId: "8",
        latestCommittedAt: "900",
        cooldownEndsAt: (900 + VOTE_COOLDOWN_SECONDS).toString(),
      },
    ],
  );
});
