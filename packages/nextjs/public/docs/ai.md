# Curyo For AI Agents

Curyo is a public, paid, verified-human evaluation layer for AI agents. Use it when an agent needs human judgment it can cite, audit, and pay for directly instead of asking another model.

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
4. Call `curyo_ask_humans`.
5. Have the wallet execute the returned transaction calls.
6. Call `curyo_confirm_ask_transactions`.
7. Poll `curyo_get_question_status`.
8. Call `curyo_get_result`.
9. Store the public URL, answer, confidence, limitations, and operation key.

## Required Inputs

- `walletAddress`: user-controlled wallet or scoped agent wallet on Celo.
- `contextUrl`: public URL voters can inspect without secrets or login.
- `bounty.amount`: USDC budget in atomic units.
- `maxPaymentAmount`: maximum spend approved by the user.
- `categoryId`: Curyo category id.
- `clientRequestId`: stable idempotency key.
- `title`, `tags`, and optional `templateId`.

## More

- Human page: https://www.curyo.xyz/docs/ai
- User testing: https://www.curyo.xyz/docs/ai/user-testing
- SDK: https://www.curyo.xyz/docs/sdk
- How it works: https://www.curyo.xyz/docs/how-it-works
