import assert from "node:assert/strict";
import test from "node:test";
import { replaceUrlPreservingHistoryState } from "~~/lib/ui/browserHistory";

test("replaceUrlPreservingHistoryState keeps the current Next history state", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const historyState = { __NA: true, tree: ["governance"] };
  const calls: unknown[][] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        state: historyState,
        replaceState: (...args: unknown[]) => calls.push(args),
      },
    },
  });

  try {
    replaceUrlPreservingHistoryState("/rate");
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], historyState);
  assert.equal(calls[0][1], "");
  assert.equal(calls[0][2], "/rate");
});

test("replaceUrlPreservingHistoryState is a no-op during server execution", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  if (originalWindow) {
    Reflect.deleteProperty(globalThis, "window");
  }

  try {
    assert.doesNotThrow(() => replaceUrlPreservingHistoryState("/rate"));
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    }
  }
});
