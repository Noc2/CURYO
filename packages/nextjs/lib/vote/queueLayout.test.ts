import assert from "node:assert/strict";
import test from "node:test";
import { chunkVoteQueueItems, computeVoteQueueLayout } from "~~/lib/vote/queueLayout";

test("computeVoteQueueLayout keeps one row on standard desktop heights", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1280,
    containerWidth: 760,
    availableHeight: 520,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 1);
  assert.equal(layout.pageSize, layout.columns);
});

test("computeVoteQueueLayout hides the desktop queue when height is too small", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1440,
    containerWidth: 1024,
    availableHeight: 180,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 0);
  assert.equal(layout.pageSize, 0);
});

test("computeVoteQueueLayout enables two rows only on extra-large viewports with enough height", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1440,
    containerWidth: 1024,
    availableHeight: 460,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 2);
  assert.ok(layout.columns >= 4);
  assert.equal(layout.pageSize, layout.columns * 2);
});

test("computeVoteQueueLayout enables three rows on very tall desktop layouts", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1728,
    containerWidth: 1180,
    availableHeight: 760,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 3);
  assert.ok(layout.columns >= 5);
  assert.equal(layout.pageSize, layout.columns * 3);
});

test("computeVoteQueueLayout keeps one row when a second row would overflow the viewport", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1440,
    containerWidth: 1024,
    availableHeight: 390,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 1);
  assert.equal(layout.pageSize, layout.columns);
});

test("computeVoteQueueLayout keeps one row on mobile regardless of tight height", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 390,
    containerWidth: 358,
    availableHeight: 140,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 1);
  assert.equal(layout.pageSize, layout.columns);
});

test("chunkVoteQueueItems groups items into horizontal pages", () => {
  const pages = chunkVoteQueueItems([1, 2, 3, 4, 5, 6, 7, 8, 9], 4);

  assert.deepEqual(pages, [[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
});
