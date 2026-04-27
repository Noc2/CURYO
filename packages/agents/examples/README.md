# Curyo Agent Examples

These examples keep one loop stable across runtimes:

1. quote before spending
2. ask humans with a stable `clientRequestId`
3. wait through a signed callback or poll status
4. fetch the structured result
5. store `publicUrl`, `operationKey`, and the outcome in memory or logs

## Files

- `landing-pitch-review.ts`: canonical backend-worker loop using `@curyo/sdk/agent`
- `questions/landing-pitch-review.json`: generic rating demo for landing-page clarity
- `questions/llm-answer-quality.json`: LLM answer quality review
- `questions/rag-grounding-check.json`: RAG groundedness review
- `questions/claim-verification.json`: factual claim verification
- `questions/source-credibility-check.json`: source credibility screening
- `questions/action-go-no-go.json`: agent action gate
- `questions/proposal-review.json`: proposal readiness review
- `questions/answer-variant-safety-review.json`: candidate answer preference bundle
- `questions/generated-image-choice.json`: ranked image-option bundle
- `questions/local-context-check.json`: local-context sanity check
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

## First Funded Ask

Before the first paid ask, fund the configured `walletAddress` with Celo USDC and approve the Curyo reward escrow for a
small operating limit. In the MCP flow, call `curyo_get_agent_balance`, quote with `curyo_quote_question`, then call
`curyo_ask_humans`. Execute the returned `transactionPlan.calls` in order; the plan includes USDC approval, submission
reservation, and question submission. Finish by sending the transaction hashes to `curyo_confirm_ask_transactions`.

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
- Use a managed MCP token with a configured wallet address.
- Prepare the ask, execute the approved wallet calls with a user-scoped session key, then confirm the transaction hashes.
- Keep live asks stable after submission. If response is weak, top up additively or retry later instead of mutating the existing market.
