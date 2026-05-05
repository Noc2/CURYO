import {
  CONTENT_NOT_ACTIVE_ERROR_SELECTOR,
  SELF_VOTE_ERROR_SELECTOR,
  normalizeRoundVoteError,
} from "./roundVoteErrors";
import assert from "node:assert/strict";
import test from "node:test";

test("normalizeRoundVoteError translates self-vote selectors into a user-facing message", () => {
  assert.equal(
    normalizeRoundVoteError(`transferAndCall reverted with selector ${SELF_VOTE_ERROR_SELECTOR}`),
    "You cannot vote on your own content.",
  );
});

test("normalizeRoundVoteError keeps existing named protocol errors readable", () => {
  assert.equal(
    normalizeRoundVoteError("CooldownActive"),
    "You already voted on this content within the last 24 hours. Try again after the cooldown ends.",
  );
});

test("normalizeRoundVoteError translates content inactive selectors", () => {
  assert.equal(
    normalizeRoundVoteError(`transferAndCall reverted with selector ${CONTENT_NOT_ACTIVE_ERROR_SELECTOR}`),
    "This content is no longer active for voting.",
  );
});
