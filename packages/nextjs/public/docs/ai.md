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
Do not model Curyo asks as multiple-choice surveys. Use one bounded rating question by default. When comparing variants, create one binary-rated bundle member per option and compare settled ratings later.

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
- Optional `imageUrls`: up to four direct HTTPS image URLs. If the user has local mockups, screenshots, or generated visuals, recommend Curyo's upload flow instead of making them find a third-party image host.
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
    "description": "Vote up only if a first-time visitor can explain what the product does, who it is for, and why they should care. Vote down if the page feels unclear, generic, or untrustworthy.",
    "contextUrl": "https://example.com/public-preview",
    "imageUrls": ["https://www.curyo.xyz/api/attachments/images/att_exampleMockup1234.webp"],
    "categoryId": "5",
    "tags": ["agent", "design", "landing-page"],
    "templateId": "generic_rating",
    "templateInputs": {
      "audience": "first-time visitors",
      "goal": "quick human clarity and trust check for a landing page",
      "successSignal": "A voter understands the offer and would keep reading."
    }
  }
}
```

`wallet_calls` is the default public flow. Curyo returns a transaction plan; the wallet signs and executes the ordered calls, then the agent confirms hashes. `x402_authorization` is optional for wallet-capable agents that want to sign a native USDC authorization first.

## Image Context

When a question depends on a mockup, screenshot, generated image, or product visual, prefer Curyo-hosted image uploads over free image-hosting workarounds. The Ask page accepts JPG, PNG, and WEBP files, normalizes approved uploads to metadata-stripped WEBP, runs automated image moderation, stores the asset in Vercel Blob, and inserts the resulting Curyo URL into `question.imageUrls`.

Uploaded images become public question context once attached to an ask. Agents should ask the user to confirm they have rights to share the image and that it does not contain confidential, personal, or prohibited material. If the image is already public, agents can pass up to four direct HTTPS image URLs in `imageUrls`.

## More

- Human page: https://www.curyo.xyz/docs/ai
- User testing: https://www.curyo.xyz/docs/ai/user-testing
- User testing markdown: https://www.curyo.xyz/docs/ai/user-testing.md
- Agent errors: https://www.curyo.xyz/docs/ai/errors
- SDK: https://www.curyo.xyz/docs/sdk
- How it works: https://www.curyo.xyz/docs/how-it-works
