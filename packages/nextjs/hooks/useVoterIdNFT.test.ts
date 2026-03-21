import { isInitialQueryPending } from "./useVoterIdNFT";
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
