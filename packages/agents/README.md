# Curyo Agents

Agent-facing examples, templates, question guidance, and CLI helpers for asking verified humans through Curyo.

This package is for the moment an agent should ask instead of guess. The core loop is:

1. choose a result template
2. lint the question
3. quote before spending
4. ask humans with a stable `clientRequestId`
5. poll status or wait for a callback
6. read the structured result and store the public URL

## Quick Start

```bash
# Show built-in result templates.
yarn agents:templates

# Validate a focused example ask.
yarn agents:lint --file packages/agents/examples/questions/landing-pitch-review.json

# Quote and submit through the configured hosted agent surface.
yarn agents:quote --file packages/agents/examples/questions/landing-pitch-review.json
yarn agents:ask --file packages/agents/examples/questions/landing-pitch-review.json

# Recover later without resubmitting.
yarn agents:status --operation-key 0x...
yarn agents:result --operation-key 0x...
```

The CLI reads `.env` from the current process environment. Use a managed agent token for authenticated HTTP or MCP flows, or use `CURYO_API_BASE_URL` alone when calling the hosted x402 question endpoint with a payment-aware fetch wrapper in your runtime.

## Configuration

```bash
cp packages/agents/.env.example packages/agents/.env
```

| Variable | Description |
| --- | --- |
| `CURYO_API_BASE_URL` | Hosted Curyo origin, for example `https://curyo.example` |
| `CURYO_MCP_TOKEN` | Optional managed agent bearer token with quote, ask, read, and balance scopes |
| `CURYO_MCP_API_URL` | Optional MCP endpoint override; defaults to `${CURYO_API_BASE_URL}/api/mcp` in SDK clients |
| `CURYO_MCP_PROTOCOL_VERSION` | Optional MCP protocol version override |

## Examples

Runtime setup examples live in `examples/`:

- `openclaw.md` and `openclaw.mcpServers.json`
- `hermes-agent.md`
- `gemini-cli.md` and `gemini-cli.mcpServers.json`
- `chat-connectors.md`
- `landing-pitch-review.ts`

Question payload examples live in `examples/questions/`:

- `landing-pitch-review.json`
- `source-credibility-check.json`
- `action-go-no-go.json`
- `generated-image-choice.json`
- `local-context-check.json`

These are intentionally narrow. They show questions worth a bounty because the answer depends on human judgment: clarity, trust, taste, local context, or whether an agent should proceed with an action.

## Templates

The canonical built-in result templates are exported from `@curyo/agents/templates`:

- `generic_rating`
- `go_no_go`
- `ranked_option_member`

Next.js, MCP tools, x402 submission parsing, and SDK examples should consume these definitions rather than duplicating template metadata.

## Question Design

Good agent questions:

- ask one bounded question
- include a public HTTPS context URL
- make the UP/DOWN vote meaning clear
- choose a result template before submission
- use a stable `clientRequestId` so retries do not duplicate spend
- fund enough bounty for the expected voter count and timing

Avoid questions that ask humans to fill a website with generic content. Curyo asks should buy judgment where the agent has meaningful uncertainty.

## Project Structure

```text
src/
├── cli.ts             # templates/lint/quote/ask/status/result CLI
├── config.ts          # hosted agent runtime environment
├── index.ts           # public package exports
├── questionSpecs.ts   # canonical question/result spec hashing
├── templates.ts       # canonical result template definitions
└── questions/         # example payload types and linting
```
