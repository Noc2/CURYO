import { getFaucetClaimStatus } from "./FaucetSection";
import assert from "node:assert/strict";
import test from "node:test";

test("getFaucetClaimStatus keeps a claimed faucet separate from minted Voter ID", () => {
  assert.equal(getFaucetClaimStatus({ hasClaimed: true, hasVoterId: false }), "claim_without_voter_id");
});

test("getFaucetClaimStatus treats Voter ID as full verification", () => {
  assert.equal(getFaucetClaimStatus({ hasClaimed: true, hasVoterId: true }), "verified");
  assert.equal(getFaucetClaimStatus({ hasClaimed: false, hasVoterId: true }), "verified");
});

test("getFaucetClaimStatus leaves unclaimed wallets in the faucet flow", () => {
  assert.equal(getFaucetClaimStatus({ hasClaimed: false, hasVoterId: false }), "unclaimed");
});
