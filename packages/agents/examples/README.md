# Curyo Agent Examples

These examples keep one loop stable across runtimes:

1. quote before spending
2. ask humans with a stable `clientRequestId`
3. wait through a signed callback or poll status
4. fetch the structured result
5. store `publicUrl`, `operationKey`, and the outcome in memory or logs

## Files

- `landing-pitch-review.ts`: canonical backend-worker loop using `@curyo/sdk/agent`
- `generic-remote-mcp.json`: baseline remote MCP config for clients that read an `mcpServers` object
- `openclaw.mcpServers.json`: OpenClaw-oriented `mcpServers` example
- `openclaw.md`: OpenClaw-specific setup notes and loop guidance
- `gemini-cli.mcpServers.json`: Gemini CLI-oriented `mcpServers` example
- `gemini-cli.md`: Gemini CLI setup notes for local and remote MCP use
- `chat-connectors.md`: setup notes for ChatGPT and Claude connector flows
- `hermes-agent.md`: setup notes for Hermes-style long-running agents

## Recommended First Demo

Use the landing-page pitch checkpoint:

- Draft a short landing-page pitch.
- Ask Curyo: `Would this pitch make you want to learn more?`
- Wait for the structured result.
- Revise when the answer is `revise` or confidence is low.
- Continue when the answer is `proceed`.

That keeps the integration narrow while still exercising quote, ask, wait, result, and memory writes.

## Runtime Notes

### OpenClaw

- Use `openclaw.mcpServers.json` as the starting point.
- Prefer bearer tokens scoped to `curyo:quote`, `curyo:ask`, `curyo:read`, and `curyo:balance`.
- Keep daily and per-ask budget caps small until the loop has proven stable.
- Write `operationKey`, `clientRequestId`, `publicUrl`, and `answer` into memory so the agent can avoid duplicate asks.

### Hermes

- Hermes can use the same remote MCP shape as OpenClaw.
- Store `operationKey`, `publicUrl`, `answer`, `confidence`, and any `cohortSummary` or `liveAskGuidance` fields in memory for later planning.
- Prefer callbacks for wakeups, but treat `getQuestionStatus` and `getResult` as the source of truth before acting.

### ChatGPT and Claude

- Use a remote connector or remote MCP wrapper that can call the same quote, ask, status, and result surfaces.
- Present quote output clearly before the host approves spend.
- Use the same landing-page pitch demo first so the branching logic stays easy to inspect in conversation.

### Gemini CLI and local coding agents

- Use `gemini-cli.mcpServers.json` or `generic-remote-mcp.json`.
- Prefer polling over a local callback unless your runtime already exposes a webhook receiver.
- Write the returned `publicUrl` into the task log or session memory so later steps can cite the human checkpoint.

### Backend workers

- Start from `landing-pitch-review.ts`.
- If you need x402 funding instead of a managed MCP token, provide a payment-aware `fetchImpl`.
- Keep `quoteQuestion()` on a non-paying fetch when you use x402. Pass `quoteFetchImpl: fetch` and reserve the payment-wrapped `fetchImpl` for `askHumans()`.
- Keep live asks stable after submission. If response is weak, top up additively or retry later instead of mutating the existing market.
