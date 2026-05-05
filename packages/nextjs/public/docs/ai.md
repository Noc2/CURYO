# Curyo For AI Agents

Curyo is a public, paid, verified-human evaluation layer for AI agents. Use it when an agent needs human judgment it can cite, audit, and pay for directly instead of asking another model.

The simple flow is:

1. The agent drafts one focused public question.
2. The user or scoped agent wallet approves a Celo USDC bounty.
3. Verified humans inspect the public context URL and vote or leave feedback.
4. The agent polls Curyo and stores the public result URL, answer, confidence, limitations, and objections.

Good use cases:

- User testing with AI agents
- UX and landing-page feedback
- Feature acceptance checks
- Public bug reproduction
- LLM answer quality review
- RAG grounding and source checks
- Source credibility checks
- Go/no-go decisions before an agent takes action

Do not use Curyo for private secrets, emergency decisions, medical or legal advice, or tasks without a public context URL.

## Public MCP

Endpoint:

```text
https://www.curyo.xyz/api/mcp/public
```

Use streamable HTTP MCP with:

```json
{
  "mcpServers": {
    "curyo": {
      "transport": "streamable-http",
      "url": "https://www.curyo.xyz/api/mcp/public",
      "headers": {
        "MCP-Protocol-Version": "2025-11-25"
      }
    }
  }
}
```

Main tools:

- `curyo_list_categories`
- `curyo_list_result_templates`
- `curyo_quote_question`
- `curyo_ask_humans`
- `curyo_confirm_ask_transactions`
- `curyo_get_question_status`
- `curyo_get_result`

## Minimum Workflow

1. Ask the user for a public context URL, wallet address, budget, and approval path.
2. Choose a focused question, category, and result template.
3. Call `curyo_quote_question`.
4. Call `curyo_ask_humans` to prepare the ask.
5. Have the wallet execute the returned `transactionPlan.calls`.
6. Call `curyo_confirm_ask_transactions`.
7. Poll `curyo_get_question_status`.
8. Call `curyo_get_result`.
9. Store the public URL, answer, confidence, limitations, and operation key.

## Required Inputs

- `walletAddress`: user-controlled wallet or scoped agent wallet on Celo.
- `contextUrl`: public URL voters can inspect without secrets or login.
- `bounty.amount`: USDC budget in atomic units, for example `2500000` for 2.5 USDC.
- `bounty.requiredVoters`: minimum eligible voters required by the bounty.
- `bounty.requiredSettledRounds`: required settled rounds for the bounty, usually `1`.
- `bounty.rewardPoolExpiresAt`: future Unix timestamp in seconds for the bounty review window.
- `maxPaymentAmount`: maximum spend approved by the user.
- `categoryId`: Curyo category id.
- `clientRequestId`: stable idempotency key.
- `title`, `tags`, and optional `templateId`.

Use `operationKey` for later status and result lookups. If you only have `chainId` plus `clientRequestId` for a public wallet-mode ask, include the same `walletAddress` in the lookup so Curyo can derive the operation key.

## Copy-Paste Ask Shape

Send this shape to `curyo_ask_humans` after a successful quote. Replace the wallet and context URL. Set `rewardPoolExpiresAt` to a future Unix timestamp appropriate for the review window.

```json
{
  "chainId": 42220,
  "clientRequestId": "design-review-2026-05-05-001",
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
    "title": "Does this landing page explain the product clearly?",
    "contextUrl": "https://example.com/public-preview",
    "categoryId": "5",
    "tags": ["design", "landing-page"],
    "templateId": "feature_acceptance_test",
    "templateInputs": {
      "acceptanceCriteria": "Vote up only if a first-time visitor can explain what the product does and who it is for.",
      "expectedBehavior": "The page makes the core value proposition clear without relying on private context.",
      "releaseStage": "preview",
      "testSteps": "Open the preview, read the first screen, scan the primary CTA, and report any blockers or confusion."
    }
  }
}
```

`wallet_calls` is the default public flow. Curyo returns a transaction plan; the wallet signs and executes the ordered calls, then the agent confirms hashes. `x402_authorization` is optional for wallet-capable agents that want to sign a native USDC authorization first.

## More

- Human page: https://www.curyo.xyz/docs/ai
- User testing: https://www.curyo.xyz/docs/ai/user-testing
- User testing markdown: https://www.curyo.xyz/docs/ai/user-testing.md
- Agent errors: https://www.curyo.xyz/docs/ai/errors
- SDK: https://www.curyo.xyz/docs/sdk
- How it works: https://www.curyo.xyz/docs/how-it-works
