import { isRetryableDirectCommitSendResult } from "./direct-commit-retry";
import assert from "node:assert/strict";
import test from "node:test";

test("retries reverted direct commit sends", () => {
  assert.equal(
    isRetryableDirectCommitSendResult({
      status: "reverted",
      txHash: `0x${"11".repeat(32)}`,
      reason: "commit already exists",
    }),
    true,
  );
});

test("retries unknown direct commit send failures when no tx hash was returned", () => {
  assert.equal(
    isRetryableDirectCommitSendResult({
      status: "unknown",
      error: "eth_sendTransaction failed",
    }),
    true,
  );
});

test("does not retry unknown direct commit sends once a tx hash exists", () => {
  assert.equal(
    isRetryableDirectCommitSendResult({
      status: "unknown",
      txHash: `0x${"22".repeat(32)}`,
      error: "receipt unavailable after polling",
    }),
    false,
  );
});

test("does not retry successful direct commit sends", () => {
  assert.equal(
    isRetryableDirectCommitSendResult({
      status: "success",
      txHash: `0x${"33".repeat(32)}`,
    }),
    false,
  );
});
