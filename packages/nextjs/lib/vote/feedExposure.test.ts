import {
  FEED_EXPOSURE_STORAGE_KEY,
  applyFeedExposurePolicy,
  buildFeedExposureScope,
  recordFeedExposure,
  recordFeedPositiveInteraction,
} from "./feedExposure";
import assert from "node:assert/strict";
import test from "node:test";

const storage = (() => {
  const values = new Map<string, string>();
  return {
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
})();

function installStorage() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
}

function resetStorage() {
  installStorage();
  storage.clear();
}

function item(id: bigint) {
  return { id };
}

test("applyFeedExposurePolicy moves recently ignored items behind fresh candidates", () => {
  resetStorage();
  const scope = buildFeedExposureScope({ address: "0xABC", chainId: 31337 });
  const now = Date.UTC(2026, 3, 11);

  recordFeedExposure(scope, { contentId: 1n, hasPositiveInteraction: false, now });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n), item(3n)], {
    minVisibleItems: 1,
    now: now + 60_000,
    scope,
  });

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [2n, 3n, 1n],
  );
});

test("positive interactions clear ignored suppression", () => {
  resetStorage();
  const scope = buildFeedExposureScope({ address: "0xABC", chainId: 31337 });
  const now = Date.UTC(2026, 3, 11);

  recordFeedExposure(scope, { contentId: 1n, hasPositiveInteraction: false, now });
  recordFeedPositiveInteraction(scope, { contentId: 1n, now: now + 1_000 });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n)], {
    minVisibleItems: 1,
    now: now + 60_000,
    scope,
  });

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [1n, 2n],
  );
});

test("protected content ids stay visible even when previously ignored", () => {
  resetStorage();
  const scope = buildFeedExposureScope({ address: null, chainId: 31337 });
  const now = Date.UTC(2026, 3, 11);

  recordFeedExposure(scope, { contentId: 1n, hasPositiveInteraction: false, now });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n)], {
    minVisibleItems: 1,
    now: now + 60_000,
    protectedContentIds: [1n],
    scope,
  });

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [1n, 2n],
  );
});

test("disabled policy preserves explicit-mode ordering", () => {
  resetStorage();
  const scope = buildFeedExposureScope({ address: "0xABC", chainId: 31337 });
  const now = Date.UTC(2026, 3, 11);

  recordFeedExposure(scope, { contentId: 1n, hasPositiveInteraction: false, now });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n), item(3n)], {
    enabled: false,
    minVisibleItems: 1,
    now: now + 60_000,
    scope,
  });

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [1n, 2n, 3n],
  );
});

test("ignored content naturally returns after the cooldown window", () => {
  resetStorage();
  const scope = buildFeedExposureScope({ address: "0xABC", chainId: 31337 });
  const now = Date.UTC(2026, 3, 11);

  recordFeedExposure(scope, { contentId: 1n, hasPositiveInteraction: false, now });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n)], {
    minVisibleItems: 1,
    now: now + 25 * 60 * 60 * 1000,
    scope,
  });

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [1n, 2n],
  );
});

test("policy is scoped by chain and viewer", () => {
  resetStorage();
  const scopedViewer = buildFeedExposureScope({ address: "0xABC", chainId: 31337 });
  const otherViewer = buildFeedExposureScope({ address: "0xDEF", chainId: 31337 });
  const now = Date.UTC(2026, 3, 11);

  recordFeedExposure(scopedViewer, { contentId: 1n, hasPositiveInteraction: false, now });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n)], {
    minVisibleItems: 1,
    now: now + 60_000,
    scope: otherViewer,
  });

  assert.deepEqual(
    ordered.map(entry => entry.id),
    [1n, 2n],
  );
});

test("policy leaves items unchanged when localStorage is unavailable", () => {
  resetStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: undefined,
  });

  const ordered = applyFeedExposurePolicy([item(1n), item(2n)], {
    minVisibleItems: 1,
    now: Date.UTC(2026, 3, 11),
    scope: buildFeedExposureScope({ address: "0xABC", chainId: 31337 }),
  });

  assert.equal(storage.getItem(FEED_EXPOSURE_STORAGE_KEY), null);
  assert.deepEqual(
    ordered.map(entry => entry.id),
    [1n, 2n],
  );
});
