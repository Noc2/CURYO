import assert from "node:assert/strict";
import test from "node:test";
import { computeVoteQueueLayout, resolveVoteQueueWindowItems } from "~~/lib/vote/queueLayout";

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

test("computeVoteQueueLayout keeps multi-row gaps aligned with the design rhythm", () => {
  const layout = computeVoteQueueLayout({
    viewportWidth: 1440,
    containerWidth: 1024,
    availableHeight: 460,
    rootFontSize: 16,
  });

  assert.equal(layout.rows, 2);
  assert.equal(layout.gapPx, 10);
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

test("resolveVoteQueueWindowItems hides thumbnails when the layout has zero rows", () => {
  const visibleItems = resolveVoteQueueWindowItems([1, 2, 3, 4, 5], 2, {
    rows: 0,
    columns: 5,
  });

  assert.deepEqual(visibleItems, []);
});

test("resolveVoteQueueWindowItems keeps the full rail for single-row layouts", () => {
  const visibleItems = resolveVoteQueueWindowItems([1, 2, 3, 4, 5], 2, {
    rows: 1,
    columns: 5,
  });

  assert.deepEqual(visibleItems, [1, 2, 3, 4, 5]);
});

test("resolveVoteQueueWindowItems anchors the active item near the middle of the first row in two-row layouts", () => {
  const items = Array.from({ length: 20 }, (_, index) => index + 1);

  assert.deepEqual(
    resolveVoteQueueWindowItems(items, 2, {
      rows: 2,
      columns: 5,
    }),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );

  assert.deepEqual(
    resolveVoteQueueWindowItems(items, 3, {
      rows: 2,
      columns: 5,
    }),
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
});

test("resolveVoteQueueWindowItems shifts a three-row layout by one item while keeping full rows only", () => {
  const items = Array.from({ length: 20 }, (_, index) => index + 1);

  assert.deepEqual(
    resolveVoteQueueWindowItems(items, 2, {
      rows: 3,
      columns: 5,
    }),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  );

  assert.deepEqual(
    resolveVoteQueueWindowItems(items, 3, {
      rows: 3,
      columns: 5,
    }),
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  );
});

test("resolveVoteQueueWindowItems clamps cleanly near the end of the feed", () => {
  const items = Array.from({ length: 20 }, (_, index) => index + 1);

  const visibleItems = resolveVoteQueueWindowItems(items, 19, {
    rows: 2,
    columns: 5,
  });

  assert.deepEqual(visibleItems, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});
