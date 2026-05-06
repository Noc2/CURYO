# User Testing With AI Agents

Curyo lets an AI agent turn uncertain UX, onboarding, or feature-quality questions into paid public feedback from verified humans.

Use this when an agent has a public preview, prototype, answer, or candidate output and needs human judgment it can cite later. The result is not a private survey. It is a public Curyo result package with HREP-staked voting, confidence, limitations, and a public URL.

The safest default is one Curyo-native rating question with public context and clear up/down vote semantics. Curyo is not a multiple-choice survey builder; agents should avoid answer-option lists unless they are creating a supported ranked bundle.

Good use cases:

- Check whether a landing page explains the product clearly.
- Ask humans to follow an onboarding flow and report blockers.
- Validate whether a feature works with caveats before an agent recommends shipping.
- Collect public bug reproduction or feature acceptance signals.

## Agent Rules

- Ask one bounded Curyo question unless the template is a ranked bundle.
- Define exactly what an up vote and a down vote mean.
- Put follow-up prompts in the feedback guidance, not in separate survey fields.
- Use one question per option with `ranked_option_member` or `pairwise_output_preference` when comparing variants.

Do not send private customer data, unreleased secrets, medical/legal decisions, or anything voters cannot inspect through a public context URL. Do not ask a multiple-choice survey, price-range poll, or several follow-up questions in one Curyo ask. Use a smaller public artifact or redacted preview instead.

## Mockups And Screenshots

If the user wants feedback on a local mockup, screenshot, generated image, or design option, route them through Curyo's image upload on the Ask page. Curyo normalizes accepted uploads to metadata-stripped WEBP, runs automated moderation, stores approved files in Vercel Blob, and adds the public Curyo image URL to `imageUrls`. Treat uploaded images as public question context and do not include confidential, personal, or rights-restricted material.

## Agent Workflow

1. Ask the user for a public preview URL, wallet address, bounty budget, and approval path.
2. Pick a narrow question and a result template such as `feature_acceptance_test` or `go_no_go`.
3. Call `curyo_quote_question` to price the ask before spending.
4. Call `curyo_ask_humans` to prepare the ask, then have the wallet execute the returned `transactionPlan.calls`.
5. Confirm transaction hashes, poll status, then read `curyo_get_result`.

## Website Feedback Payload

Send this shape to `curyo_ask_humans` after a successful quote. Keep the title focused on one user judgment. Amounts are atomic USDC units, so `2500000` means 2.5 USDC. Replace the wallet, context URL, optional image URL, and `rewardPoolExpiresAt`.

```json
{
  "chainId": 42220,
  "clientRequestId": "ai-website-feedback-2026-05-06-001",
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
    "title": "Would this AI website feedback service be compelling enough to try?",
    "description": "Review the public mockup. Vote up if the offer is clear, credible, and useful enough to try for a real website project. Vote down if it feels unclear, generic, or unnecessary. In feedback, mention your biggest hesitation.",
    "contextUrl": "https://example.com/ai-website-feedback-mockup",
    "imageUrls": ["https://www.curyo.xyz/api/attachments/images/att_websiteFeedbackMockup.webp"],
    "categoryId": "5",
    "tags": ["agent", "website-generation", "market-interest"],
    "templateId": "generic_rating",
    "templateInputs": {
      "audience": "people considering a new or redesigned website",
      "goal": "validate whether AI-generated website directions plus verified human feedback is a compelling service",
      "successSignal": "Voters would consider trying it and can name why it would help."
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
