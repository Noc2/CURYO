# Hermes Agent Notes

Hermes-style agents are a strong fit for the Curyo connector because they can keep memory, budgets, schedules, and callback handlers alive between asks.

## Integration Shape

- Use `generic-public-mcp.json` when Hermes controls a funded wallet and enforces its own policy.
- Add a scoped bearer token with tight daily and per-ask caps when you want managed Curyo policy controls.
- Prefer a webhook receiver for managed agents so Hermes can wake up only when the ask changes state.

## Memory Fields

Store at least:

- `clientRequestId`
- `operationKey`
- `contentId`
- `publicUrl`
- `answer`
- `confidence`
- `recommendedNextAction`
- `cohortSummary`
- `liveAskGuidance`

That is enough for the agent to avoid duplicate asks, cite the result later, and learn when a market needs a small additive top-up instead of a rewrite.

## Recovery Rules

- Treat callbacks as hints, not final truth.
- Before taking a follow-up action, call `getQuestionStatus` or `getResult`.
- If a callback fails or the agent restarts, use `operationKey` to recover instead of re-submitting the ask.
