import { buildLinkedWalletAddresses, normalizeLinkedWalletAddress } from "./linkedWalletAddresses";
import assert from "node:assert/strict";
import test from "node:test";

test("normalizeLinkedWalletAddress lowercases addresses and skips zero address values", () => {
  assert.equal(
    normalizeLinkedWalletAddress("0xAbC0000000000000000000000000000000000000"),
    "0xabc0000000000000000000000000000000000000",
  );
  assert.equal(normalizeLinkedWalletAddress("0x0000000000000000000000000000000000000000"), null);
  assert.equal(normalizeLinkedWalletAddress(""), null);
});

test("buildLinkedWalletAddresses deduplicates linked wallet addresses", () => {
  assert.deepEqual(
    buildLinkedWalletAddresses(
      "0xAbC0000000000000000000000000000000000000",
      "0xabc0000000000000000000000000000000000000",
      "0xDef0000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      undefined,
    ),
    ["0xabc0000000000000000000000000000000000000", "0xdef0000000000000000000000000000000000000"],
  );
});
