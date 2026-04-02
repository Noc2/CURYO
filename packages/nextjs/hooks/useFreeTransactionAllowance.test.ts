import {
  buildExhaustionToastKey,
  buildFreeTransactionAllowanceSnapshotKey,
  buildSponsorshipSyncAttemptKey,
  clearSponsorshipSyncAttemptAfterFailure,
} from "./useFreeTransactionAllowance";
import assert from "node:assert/strict";
import test from "node:test";

test("buildFreeTransactionAllowanceSnapshotKey scopes cached summaries by environment", () => {
  assert.equal(
    buildFreeTransactionAllowanceSnapshotKey(
      "0xAbCdEf0000000000000000000000000000000000",
      11142220,
      "https://preview.curyo.example",
    ),
    "curyo-free-transactions-summary:https://preview.curyo.example:0xabcdef0000000000000000000000000000000000:11142220",
  );
});

test("buildExhaustionToastKey scopes exhaustion notifications by environment", () => {
  assert.equal(
    buildExhaustionToastKey({
      chainId: 11142220,
      environmentScope: "https://curyo.example",
      voterIdTokenId: "42",
    }),
    "curyo-free-transactions-exhausted:https://curyo.example:11142220:42",
  );
});

test("buildSponsorshipSyncAttemptKey normalizes the wallet address", () => {
  assert.equal(
    buildSponsorshipSyncAttemptKey({
      address: "0xAbCdEf0000000000000000000000000000000000",
      chainId: 11142220,
      sponsorshipMode: "sponsored",
    }),
    "0xabcdef0000000000000000000000000000000000:11142220:sponsored",
  );
});

test("clearSponsorshipSyncAttemptAfterFailure clears the matching failed attempt", () => {
  assert.equal(
    clearSponsorshipSyncAttemptAfterFailure(
      "0xabcdef0000000000000000000000000000000000:11142220:self-funded",
      "0xabcdef0000000000000000000000000000000000:11142220:self-funded",
    ),
    null,
  );
});

test("clearSponsorshipSyncAttemptAfterFailure preserves newer attempts", () => {
  assert.equal(
    clearSponsorshipSyncAttemptAfterFailure(
      "0xabcdef0000000000000000000000000000000000:42220:sponsored",
      "0xabcdef0000000000000000000000000000000000:11142220:self-funded",
    ),
    "0xabcdef0000000000000000000000000000000000:42220:sponsored",
  );
});
