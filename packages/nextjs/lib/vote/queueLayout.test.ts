import assert from "node:assert/strict";
import test from "node:test";
import { chunkVoteQueueItems, computeVoteQueueLayout } from "~~/lib/vote/queueLayout";

test("computeVoteQueueLayout keeps one row on standard desktop heights", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1600,
    viewportHeight: 980,
    containerWidth: 1400,
    availableHeight: 360,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 1);
  assert.equal(layout.pageSize, layout.columns);
});

test("computeVoteQueueLayout enables two rows only on extra-large viewports with enough height", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1440,
    viewportHeight: 980,
    containerWidth: 1180,
    availableHeight: 460,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 2);
  assert.ok(layout.columns >= 4);
  assert.equal(layout.pageSize, layout.columns * 2);
});

test("chunkVoteQueueItems groups items into horizontal pages", () => {
  const pages = chunkVoteQueueItems([1, 2, 3, 4, 5, 6, 7, 8, 9], 4);

  assert.deepEqual(pages, [[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
});
