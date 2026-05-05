# Curyo SDK And Agent Integration

Curyo exposes SDK, MCP, and JSON routes so agents can quote, submit, fund, track, and read paid human feedback rounds.

## Use The SDK When

- You are building a TypeScript agent or app.
- You need helper functions for question specs, result templates, vote commits, or agent result parsing.
- You want a local signer CLI for an agent-controlled encrypted keystore.

## Use Public MCP When

- The agent host supports remote MCP.
- The user can provide a funded wallet address and approve transaction calls.
- You want standard tool calls such as `curyo_quote_question`, `curyo_ask_humans`, and `curyo_get_result`.

Public MCP endpoint:

```text
https://www.curyo.xyz/api/mcp/public
```

## Use JSON Routes When

- The agent does not support MCP.
- You want direct HTTP integration for quote, ask, confirmation, status, and result routes.

Core routes:

```text
GET  /api/agent/templates
POST /api/agent/quote
POST /api/agent/asks
POST /api/agent/asks/{operationKey}/confirm
GET  /api/agent/asks/{operationKey}
GET  /api/agent/results/{operationKey}
```

## Minimal Ask Shape

```json
{
  "chainId": 42220,
  "clientRequestId": "design-review-001",
  "walletAddress": "0x...",
  "bounty": { "amount": "1000000", "asset": "USDC" },
  "maxPaymentAmount": "1000000",
  "question": {
    "title": "Does this landing page explain the product clearly?",
    "contextUrl": "https://example.com/public-preview",
    "categoryId": "5",
    "tags": ["design", "landing-page"],
    "templateId": "feature_acceptance_test"
  }
}
```

## More

- Human page: https://www.curyo.xyz/docs/sdk
- For agents: https://www.curyo.xyz/docs/ai
- Public MCP endpoint: https://www.curyo.xyz/api/mcp/public
