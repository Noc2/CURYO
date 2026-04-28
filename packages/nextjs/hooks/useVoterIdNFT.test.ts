import { buildVoterIdCacheKey, isInitialQueryPending, shouldReadVoterIdTokenId } from "./useVoterIdNFT";
import assert from "node:assert/strict";
import test from "node:test";

test("isInitialQueryPending blocks while the first load is still in flight", () => {
  assert.equal(
    isInitialQueryPending({
      isLoading: true,
      isFetching: true,
      isFetched: false,
      isError: false,
    }),
    true,
  );
});

test("isInitialQueryPending stays resolved during background refetches", () => {
  assert.equal(
    isInitialQueryPending({
      isLoading: false,
      isFetching: true,
      isFetched: true,
      isError: false,
    }),
    false,
  );
});

test("isInitialQueryPending stops blocking after an error", () => {
  assert.equal(
    isInitialQueryPending({
      isLoading: false,
      isFetching: false,
      isFetched: false,
      isError: true,
    }),
    false,
  );
});

test("shouldReadVoterIdTokenId waits for a fetched Voter ID result", () => {
  assert.equal(
    shouldReadVoterIdTokenId({
      address: "0xfa9605A2c38a0B4f16f689FDD07B63F295b86d1C",
      hasVoterId: true,
      hasVoterIdFetched: false,
    }),
    false,
  );
});

test("shouldReadVoterIdTokenId reads only after a confirmed Voter ID", () => {
  assert.equal(
    shouldReadVoterIdTokenId({
      address: "0xfa9605A2c38a0B4f16f689FDD07B63F295b86d1C",
      hasVoterId: true,
      hasVoterIdFetched: true,
    }),
    true,
  );
});

test("shouldReadVoterIdTokenId skips wallets without a confirmed Voter ID", () => {
  assert.equal(
    shouldReadVoterIdTokenId({
      address: "0xfa9605A2c38a0B4f16f689FDD07B63F295b86d1C",
      hasVoterId: false,
      hasVoterIdFetched: true,
    }),
    false,
  );
});

test("buildVoterIdCacheKey scopes cached IDs to the contract address", () => {
  assert.equal(
    buildVoterIdCacheKey("0x067c804bb006836469379D4A2A69a81803bd1F45", "0xfa9605A2c38a0B4f16f689FDD07B63F295b86d1C"),
    "curyo:voterIdNFT:0x067c804bb006836469379d4a2a69a81803bd1f45:0xfa9605a2c38a0b4f16f689fdd07b63f295b86d1c",
  );
});
