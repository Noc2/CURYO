import { pickLatestVoteCommittedLog, shouldUseAddressLogCooldownFallback } from "../lib/vote/liveCooldown";
import assert from "node:assert/strict";
import test from "node:test";

test("pickLatestVoteCommittedLog returns null when no logs are present", () => {
  assert.equal(pickLatestVoteCommittedLog([]), null);
});

test("pickLatestVoteCommittedLog prefers the newest block and log index", () => {
  const latest = pickLatestVoteCommittedLog([
    { blockNumber: 10n, logIndex: 4, blockHash: "0x1" as const },
    { blockNumber: 12n, logIndex: 1, blockHash: "0x2" as const },
    { blockNumber: 12n, logIndex: 3, blockHash: "0x3" as const },
    { blockNumber: null, logIndex: 9, blockHash: "0x4" as const },
  ]);

  assert.deepEqual(latest, { blockNumber: 12n, logIndex: 3, blockHash: "0x3" });
});

test("shouldUseAddressLogCooldownFallback disables address logs for token identities", () => {
  assert.equal(shouldUseAddressLogCooldownFallback({ hasVoterId: true, isIdentityResolved: true }), false);
  assert.equal(shouldUseAddressLogCooldownFallback({ hasVoterId: false, isIdentityResolved: true }), true);
  assert.equal(shouldUseAddressLogCooldownFallback({ hasVoterId: false, isIdentityResolved: false }), false);
});
