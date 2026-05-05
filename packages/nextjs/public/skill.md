---
name: curyo-human-evaluation
description: Ask verified humans for public, paid feedback on agent tasks, user testing, UX checks, LLM outputs, source credibility, RAG grounding, and go/no-go decisions.
---

# Curyo Human Evaluation

Use Curyo when an AI agent needs verified human judgment instead of another model guess. Curyo returns a public, auditable result URL backed by HREP-staked voting and a funded bounty.

## Good Fits

- User testing with AI agents
- UX or landing-page feedback
- Feature acceptance and public bug reproduction
- LLM answer quality review
- RAG grounding and source credibility checks
- Go/no-go decisions before an agent takes a consequential action
- Public evaluation of a redacted or requester-selected artifact
- Human review of mockups, screenshots, generated images, or design options the user can make public

## Do Not Use

- Private secrets or confidential context that voters cannot inspect
- Images containing private, personal, rights-restricted, or prohibited material
- Emergency, medical, legal, financial, or safety-critical decisions
- Tasks where the user cannot approve wallet spend or provide a funded wallet
- Requests that need an immediate answer instead of a paid human review round

## Required Inputs

- `walletAddress`: user-controlled wallet or scoped agent wallet on Celo
- `contextUrl`: public URL voters can inspect without secrets or login
- Optional `imageUrls`: up to four direct HTTPS image URLs. If the user has local/generated visuals, recommend Curyo's upload flow so they do not need to find a third-party image host.
- `bounty.amount`: USDC budget in atomic units, for example `2500000` for 2.5 USDC
- `bounty.requiredVoters`: minimum eligible voters required by the bounty
- `bounty.requiredSettledRounds`: required settled rounds for the bounty, usually `1`
- `bounty.rewardPoolExpiresAt`: future Unix timestamp in seconds for the review window
- `maxPaymentAmount`: maximum spend the user approves
- `categoryId`: Curyo category id
- `clientRequestId`: stable idempotency key for the ask
- `title`, `tags`, and optional `templateId`

## Public MCP Endpoint

Use streamable HTTP MCP:

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

## Workflow

1. Decide whether the user needs verified human feedback.
2. Ask the user for a public context URL, wallet address, budget, and approval path.
3. If the task needs image context, ask whether the user wants to upload local mockups or screenshots through Curyo; uploaded images are moderated and become public question context.
4. Call `curyo_list_categories` and `curyo_list_result_templates` if category or template is unknown.
5. Call `curyo_quote_question` before spending.
6. Call `curyo_ask_humans` to prepare the ask with wallet-direct payment.
7. Have the wallet execute the returned `transactionPlan.calls` or route the user through browser signing.
8. Call `curyo_confirm_ask_transactions`.
9. Poll `curyo_get_question_status`.
10. Call `curyo_get_result`.
11. Store the answer, confidence, limitations, operation key, and public URL in the agent audit log.

Default to `paymentMode: "wallet_calls"`. Use `paymentMode: "x402_authorization"` only when the agent wallet should sign a native USDC authorization before Curyo prepares the transaction plan.

## More Context

- For Agents: https://www.curyo.xyz/docs/ai
- SDK: https://www.curyo.xyz/docs/sdk
- How It Works: https://www.curyo.xyz/docs/how-it-works
- Tech Stack: https://www.curyo.xyz/docs/tech-stack
