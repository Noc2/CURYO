import { isClaimableFrontendFeeSnapshot, normalizeFrontendFeeDisposition } from "./server";
import assert from "node:assert/strict";
import { test } from "node:test";

test("normalizeFrontendFeeDisposition accepts uint8 values decoded as numbers", () => {
  assert.equal(normalizeFrontendFeeDisposition(0), 0n);
  assert.equal(normalizeFrontendFeeDisposition(1), 1n);
  assert.equal(normalizeFrontendFeeDisposition(2), 2n);
});

test("isClaimableFrontendFeeSnapshot keeps number dispositions claimable", () => {
  assert.equal(isClaimableFrontendFeeSnapshot(10n, 1, false), true);
  assert.equal(isClaimableFrontendFeeSnapshot(10n, 2, false), false);
  assert.equal(isClaimableFrontendFeeSnapshot(10n, 1n, true), false);
});
