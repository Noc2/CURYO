import { OWN_CONTENT_FEEDBACK_DISABLED_REASON, getContentFeedbackSubmitTooltip } from "./contentFeedbackSubmitState";
import assert from "node:assert/strict";
import test from "node:test";

test("feedback submit tooltip explains own questions before vote gating", () => {
  assert.equal(
    getContentFeedbackSubmitTooltip({
      canSubmitDraft: true,
      hasCurrentRoundVote: false,
      isOwnContent: true,
    }),
    OWN_CONTENT_FEEDBACK_DISABLED_REASON,
  );
});

test("feedback submit tooltip keeps vote-first guidance for non-voters on other questions", () => {
  assert.equal(
    getContentFeedbackSubmitTooltip({
      canSubmitDraft: true,
      hasCurrentRoundVote: false,
      isOwnContent: false,
    }),
    "You need to vote first.",
  );
});

test("feedback submit tooltip asks for enough text after ownership and voting checks pass", () => {
  assert.equal(
    getContentFeedbackSubmitTooltip({
      canSubmitDraft: false,
      hasCurrentRoundVote: true,
      isOwnContent: false,
    }),
    "Write at least 4 characters.",
  );
});
