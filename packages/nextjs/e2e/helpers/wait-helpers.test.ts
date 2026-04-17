import assert from "node:assert/strict";
import test from "node:test";
import { gotoWithRetry } from "./wait-helpers";

function withCiEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previousCi = process.env.CI;

  if (value === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = value;
  }

  return run().finally(() => {
    if (previousCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = previousCi;
    }
  });
}

function createPageStub(config: {
  gotoResults: Array<void | Error>;
  runtimeErrorVisible?: boolean;
}) {
  const gotoCalls: Array<{ url: string; options: { timeout: number; waitUntil: string } }> = [];
  const reloadCalls: Array<{ timeout: number; waitUntil: string }> = [];
  const waits: number[] = [];

  const page = {
    async goto(url: string, options: { timeout: number; waitUntil: string }) {
      gotoCalls.push({ url, options });
      const result = config.gotoResults.shift();
      if (result instanceof Error) {
        throw result;
      }
    },
    getByRole(role: string, options: { name: RegExp }) {
      assert.equal(role, "heading");
      assert.match("Application error", options.name);
      return {
        isVisible: async () => config.runtimeErrorVisible ?? false,
      };
    },
    async reload(options: { timeout: number; waitUntil: string }) {
      reloadCalls.push(options);
    },
    async waitForTimeout(ms: number) {
      waits.push(ms);
    },
    isClosed() {
      return false;
    },
  };

  return { gotoCalls, page: page as any, reloadCalls, waits };
}

test("gotoWithRetry retries transient goto failures before succeeding", async () => {
  const { page, gotoCalls, waits } = createPageStub({
    gotoResults: [new Error("net::ERR_ABORTED while navigating"), undefined],
  });

  await gotoWithRetry(page, "/ask", { attempts: 2, timeout: 12_345 });

  assert.equal(gotoCalls.length, 2);
  assert.deepEqual(gotoCalls.map(call => call.url), ["/ask", "/ask"]);
  assert.deepEqual(waits, [1_000]);
  assert.deepEqual(
    gotoCalls.map(call => call.options),
    [
      { timeout: 12_345, waitUntil: "domcontentloaded" },
      { timeout: 12_345, waitUntil: "domcontentloaded" },
    ],
  );
});

test("gotoWithRetry reloads when the application error heading is visible after navigation", async () => {
  const { page, reloadCalls } = createPageStub({
    gotoResults: [undefined],
    runtimeErrorVisible: true,
  });

  await gotoWithRetry(page, "/rate", { timeout: 8_000, waitUntil: "load" });

  assert.deepEqual(reloadCalls, [{ timeout: 8_000, waitUntil: "domcontentloaded" }]);
});

test("gotoWithRetry retries cold page.goto timeouts", async () => {
  const { page, gotoCalls, waits } = createPageStub({
    gotoResults: [new Error("page.goto: Timeout 30000ms exceeded."), undefined],
  });

  await gotoWithRetry(page, "/rate", { attempts: 2, timeout: 30_000 });

  assert.equal(gotoCalls.length, 2);
  assert.deepEqual(waits, [1_000]);
});

test("gotoWithRetry raises the timeout floor in CI", async () => {
  const { page, gotoCalls } = createPageStub({
    gotoResults: [undefined],
  });

  await withCiEnv("true", async () => {
    await gotoWithRetry(page, "/governance", { timeout: 12_345 });
  });

  assert.deepEqual(gotoCalls, [
    {
      url: "/governance",
      options: { timeout: 60_000, waitUntil: "domcontentloaded" },
    },
  ]);
});
