export const OWN_CONTENT_FEEDBACK_DISABLED_REASON = "You cannot give feedback on your own question.";

export function getContentFeedbackSubmitTooltip(params: {
  canSubmitDraft: boolean;
  hasCurrentRoundVote: boolean;
  isOwnContent: boolean;
}) {
  if (params.isOwnContent) {
    return OWN_CONTENT_FEEDBACK_DISABLED_REASON;
  }

  if (!params.hasCurrentRoundVote) {
    return "You need to vote first.";
  }

  if (!params.canSubmitDraft) {
    return "Write at least 4 characters.";
  }

  return "Add feedback";
}
