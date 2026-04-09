import { getFaucetClaimStatus, getFaucetReferralInputState } from "./FaucetSection";
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

test("getFaucetReferralInputState accepts valid referral addresses", () => {
  const state = getFaucetReferralInputState({
    connectedAddress: "0x1111111111111111111111111111111111111111",
    inputValue: " 0xC1CD80C7CD37B5499560C362B164CBA1CFF71B44 ",
  });

  assert.equal(state.normalizedReferrer, "0xc1cd80c7cd37b5499560c362b164cba1cff71b44");
  assert.equal(state.hasReferralInput, true);
  assert.equal(state.isInvalid, false);
  assert.equal(state.isSelfReferral, false);
  assert.equal(state.canCheckReferrer, true);
});

test("getFaucetReferralInputState flags invalid referral input without enabling checks", () => {
  const state = getFaucetReferralInputState({
    connectedAddress: "0x1111111111111111111111111111111111111111",
    inputValue: "not-an-address",
  });

  assert.equal(state.normalizedReferrer, null);
  assert.equal(state.hasReferralInput, true);
  assert.equal(state.isInvalid, true);
  assert.equal(state.isSelfReferral, false);
  assert.equal(state.canCheckReferrer, false);
});

test("getFaucetReferralInputState blocks same-wallet referrals", () => {
  const state = getFaucetReferralInputState({
    connectedAddress: "0xC1CD80C7CD37B5499560C362B164CBA1CFF71B44",
    inputValue: "0xc1cd80c7cd37b5499560c362b164cba1cff71b44",
  });

  assert.equal(state.normalizedReferrer, "0xc1cd80c7cd37b5499560c362b164cba1cff71b44");
  assert.equal(state.isInvalid, false);
  assert.equal(state.isSelfReferral, true);
  assert.equal(state.canCheckReferrer, false);
});
