# Curyo Agent Examples

These examples keep one loop stable across runtimes:

1. quote before spending
2. prepare an ask with a stable `clientRequestId`
3. wait through a signed callback or poll status
4. fetch the structured result
5. store `publicUrl`, `operationKey`, and the outcome in memory or logs

## Files

- `landing-pitch-review.ts`: canonical backend-worker loop using `@curyo/sdk/agent`
- `questions/landing-pitch-review.json`: generic rating demo for landing-page clarity
- `questions/ai-website-feedback-service.json`: canonical AI website generation plus human feedback market-interest ask
- `questions/llm-answer-quality.json`: LLM answer quality review
- `questions/rag-grounding-check.json`: RAG groundedness review
- `questions/claim-verification.json`: factual claim verification
- `questions/source-credibility-check.json`: source credibility screening
- `questions/action-go-no-go.json`: agent action gate
- `questions/feature-acceptance-test.json`: public preview feature acceptance and bug-finding
- `questions/agent-trace-review.json`: agent trace and tool-call review
- `questions/proposal-review.json`: proposal readiness review
- `questions/answer-variant-safety-review.json`: candidate answer preference bundle, with one binary-rated question per answer
- `questions/generated-image-choice.json`: ranked image-option bundle, with one binary-rated question per image
- `questions/local-context-check.json`: local-context sanity check
- `generic-public-mcp.json`: tokenless remote MCP config for clients that read an `mcpServers` object
- `generic-remote-mcp.json`: managed remote MCP config for clients that read an `mcpServers` object
- `openclaw.mcpServers.json`: OpenClaw-oriented `mcpServers` example
- `openclaw.md`: OpenClaw-specific setup notes and loop guidance
- `gemini-cli.mcpServers.json`: Gemini CLI-oriented `mcpServers` example
- `gemini-cli.md`: Gemini CLI setup notes for local and remote MCP use
- `chat-connectors.md`: setup notes for ChatGPT and Claude connector flows
- `hermes-agent.md`: setup notes for Hermes-style long-running agents

## Recommended First Demo

Use the landing-page pitch checkpoint for mechanics, or `questions/ai-website-feedback-service.json` when testing an AI
website-generation service concept:

- Draft a short landing-page pitch.
- Ask Curyo: `Would this pitch make you want to learn more?`
- Wait for the structured result.
- Revise when the answer is `revise` or confidence is low.
- Continue when the answer is `proceed`.

That keeps the integration narrow while still exercising quote, ask, wait, result, and memory writes.

When a coding agent has built a public preview and needs users to test whether it works, use
`questions/feature-acceptance-test.json`. It keeps the vote binary while asking voters to follow explicit test steps and
leave reproducible failure notes in feedback.

When comparing options, do not ask one multiple-choice question. Use `ranked_option_member` or
`pairwise_output_preference`, submit one question per option in the same bundle, then compare the settled ratings.

## First Funded Ask

Before the first paid ask, fund the configured `walletAddress` with Celo USDC. In the public MCP flow, quote with
`curyo_quote_question`, then call `curyo_ask_humans` to prepare the ask. Execute the returned `transactionPlan.calls` in
order; the plan includes USDC approval, submission reservation, and question submission. Finish by sending the
transaction hashes to `curyo_confirm_ask_transactions`. Example bounty amounts are atomic USDC units, and
`rewardPoolExpiresAt` should be a future Unix timestamp for the review window. Managed agents can also call
`curyo_get_agent_balance`, use signed callbacks, and rely on Curyo-enforced per-ask or daily caps.

The public MCP config is enough for accountless use. In a chat-hosted runtime, the agent should ask the user for the
funded `walletAddress`, the public context URL, the bounty budget, and whether the user wants to approve spend through a
browser signing link or let a local signer execute the returned calls. Creating a Curyo account is optional and only
needed for managed policies, saved tokens, callbacks, balance tooling, or audit exports.

## Runtime Notes

### OpenClaw

- Use `openclaw.mcpServers.json` as the starting point.
- Start with the public MCP config when the agent already controls a funded wallet.
- Add bearer tokens scoped to `curyo:quote`, `curyo:ask`, `curyo:read`, and `curyo:balance` only when you want managed caps or callbacks.
- Keep daily and per-ask budget caps small until the managed loop has proven stable.
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

- Use `generic-public-mcp.json` for wallet-direct asks, or `gemini-cli.mcpServers.json` / `generic-remote-mcp.json` for managed token flows.
- Prefer polling over a local callback unless your runtime already exposes a webhook receiver.
- Write the returned `publicUrl` into the task log or session memory so later steps can cite the human checkpoint.

### Backend workers

- Start from `landing-pitch-review.ts`.
- Use `CURYO_API_BASE_URL` plus a funded `CURYO_AGENT_WALLET_ADDRESS` for public direct HTTP, or add a managed MCP token for Curyo-enforced caps.
- Prepare the ask, execute the approved wallet calls with a user-scoped session key, then confirm the transaction hashes.
- Keep live asks stable after submission. If response is weak, top up additively or retry later instead of mutating the existing market.
