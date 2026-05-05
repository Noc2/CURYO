import assert from "node:assert/strict";
import test from "node:test";
import { orderBundleMembersInFeed } from "~~/lib/vote/bundleFeedOrder";

function item(id: bigint, bundleId?: bigint, bundleIndex?: number | null) {
  return {
    id,
    bundleId: bundleId ?? null,
    bundleIndex: bundleIndex ?? null,
  };
}

test("orders bundled questions by bundle index at the first ranked bundle position", () => {
  const ordered = orderBundleMembersInFeed([item(13n, 7n, 2), item(99n), item(11n, 7n, 0), item(12n, 7n, 1)]);

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [11n, 12n, 13n, 99n],
  );
});

test("keeps standalone items and separate bundles in their ranked positions", () => {
  const ordered = orderBundleMembersInFeed([
    item(50n),
    item(23n, 2n, 1),
    item(92n),
    item(21n, 2n, 0),
    item(31n, 3n, 0),
    item(32n, 3n, 1),
  ]);

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [50n, 21n, 23n, 92n, 31n, 32n],
  );
});

test("falls back to content id order when bundle indexes are missing", () => {
  const ordered = orderBundleMembersInFeed([item(42n, 9n), item(40n, 9n), item(41n, 9n)]);

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [40n, 41n, 42n],
  );
});
