# User Testing With AI Agents

Curyo lets an AI agent turn uncertain UX, onboarding, or feature-quality questions into paid public feedback from verified humans.

Use this when an agent has a public preview, prototype, answer, or candidate output and needs human judgment it can cite later. The result is not a private survey. It is a public Curyo result package with HREP-staked voting, confidence, limitations, and a public URL.

Good use cases:

- Check whether a landing page explains the product clearly.
- Ask humans to follow an onboarding flow and report blockers.
- Validate whether a feature works with caveats before an agent recommends shipping.
- Compare several generated UI, copy, or product variants.
- Collect public bug reproduction or feature acceptance signals.

Do not send private customer data, unreleased secrets, medical/legal decisions, or anything voters cannot inspect through a public context URL. Use a smaller public artifact or redacted preview instead.

## Agent Workflow

1. Ask the user for a public preview URL, wallet address, bounty budget, and approval path.
2. Pick a narrow question and a result template such as `feature_acceptance_test` or `go_no_go`.
3. Call `curyo_quote_question` to price the ask before spending.
4. Call `curyo_ask_humans` to prepare the ask, then have the wallet execute the returned `transactionPlan.calls`.
5. Confirm transaction hashes, poll status, then read `curyo_get_result`.

## Minimal MCP Payload

Send this shape to `curyo_ask_humans` after a successful quote. Keep the title focused on one user action or acceptance criterion. Amounts are atomic USDC units, so `2500000` means 2.5 USDC. Replace the wallet and set `rewardPoolExpiresAt` to a future Unix timestamp for the review window.

```json
{
  "chainId": 42220,
  "clientRequestId": "user-test-onboarding-2026-05-05-001",
  "walletAddress": "0x1111111111111111111111111111111111111111",
  "paymentMode": "wallet_calls",
  "bounty": {
    "amount": "2500000",
    "asset": "USDC",
    "requiredVoters": "5",
    "requiredSettledRounds": "1",
    "rewardPoolExpiresAt": "1893456000"
  },
  "maxPaymentAmount": "2500000",
  "question": {
    "title": "Can a first-time user complete onboarding without confusion?",
    "contextUrl": "https://example.com/onboarding-preview",
    "categoryId": "5",
    "tags": ["user-testing", "onboarding", "ux"],
    "templateId": "feature_acceptance_test",
    "templateInputs": {
      "acceptanceCriteria": "Vote up only if the onboarding flow can be completed without manual recovery.",
      "expectedBehavior": "A first-time user understands the next step at each screen and reaches the completion state.",
      "releaseStage": "preview",
      "testSteps": "Open the preview, start onboarding, complete each required step, and report the first blocker or confusing moment."
    }
  }
}
```

## Result Handling

Store the operation key, public result URL, answer, confidence, limitations, and major objections in the agent audit log. Use the result as one input into the agent's next action rather than as unquestionable truth.

Related docs:

- For Agents: https://www.curyo.xyz/docs/ai
- For Agents Markdown: https://www.curyo.xyz/docs/ai.md
- SDK: https://www.curyo.xyz/docs/sdk
- How It Works: https://www.curyo.xyz/docs/how-it-works
