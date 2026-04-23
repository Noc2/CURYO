# General AI Agent Research

Status: research note
Date: 2026-04-23

Related: [OpenClaw Autonomous Agent Research](./openclaw-autonomous-agent-research.md)

## Summary

The OpenClaw-specific research is useful, but Curyo should not position its agent strategy around one runtime only. The broader market is moving toward many kinds of agents:

- Self-hosted persistent agents such as Hermes Agent.
- Chat-based agents in ChatGPT and Claude.
- Terminal and coding agents such as Gemini CLI, Claude Code, Codex-style agents, and local developer assistants.
- Enterprise agents built with managed platforms, agent SDKs, workflow builders, and custom backend loops.

The shared need is the same across these categories: agents can search, write, call tools, use memory, and execute workflows, but they still need a reliable way to ask real humans when model confidence is not enough. Curyo can become that verified human judgment layer if it presents a general integration surface, not only an OpenClaw recipe.

The most important product shift is:

> Curyo should be an agent-accessible human feedback connector.

That means remote MCP, direct HTTP/SDK access, templates, structured results, budget controls, callbacks for daemon agents, and safe polling for chat agents.

## External Signals

### ChatGPT is becoming an agent host, not only a chatbot

OpenAI's ChatGPT agent can browse websites, work with files, connect to apps, fill forms, edit spreadsheets, and pause for confirmation when needed. OpenAI's connector docs also describe custom connectors using MCP, including developer-mode and workspace-managed connector flows.

Implication for Curyo: ChatGPT users may not run a 24/7 daemon, but they can still call Curyo as a custom connector when a task needs external human judgment. The product should support a user-friendly "ask humans" connector flow with clear spend confirmation, result URLs, and no crypto ceremony.

Sources:

- [OpenAI Help Center, ChatGPT agent](https://help.openai.com/en/articles/11752874-chatgpt-agent)
- [OpenAI Help Center, Connectors in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)
- [OpenAI Platform, Building MCP servers for ChatGPT and API integrations](https://platform.openai.com/docs/mcp)

### Claude treats MCP as a first-class connector path

Anthropic's MCP connector lets Claude connect to remote MCP servers through the Messages API. Claude's custom connector docs also describe remote MCP support for Claude, Claude Desktop, and related Claude products, with public HTTP reachability and user authentication. Claude's computer-use docs reinforce the broader pattern: agents are increasingly able to take actions in computer environments, which raises the value of external judgment checkpoints.

Implication for Curyo: a publicly reachable remote MCP endpoint with OAuth or bearer-token auth is not just an OpenClaw feature. It is the connector shape Claude expects for tool access.

Sources:

- [Claude API docs, MCP connector](https://platform.claude.com/docs/en/docs/agents-and-tools/mcp-connector)
- [Anthropic Help Center, custom connectors using remote MCP](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-integrations-using-remote-mcp)
- [Anthropic docs, Computer use tool](https://docs.anthropic.com/en/docs/build-with-claude/computer-use)

### Hermes Agent is a strong self-hosted pattern

Hermes Agent is an open-source persistent agent from Nous Research. Its public README describes a server-running agent with memory, skills, messaging gateways, scheduled work, subagents, terminal backends, and MCP integration. This is exactly the kind of agent that can run long-lived loops, hold an operator budget, store result URLs in memory, and call Curyo repeatedly.

Implication for Curyo: Hermes is probably a better "always-on agent" target than chat-only products. Curyo should provide a Hermes-ready MCP config, a small loop example, and guidance for storing `publicUrl`, `operationKey`, and final result fields in the agent's memory.

Sources:

- [NousResearch/hermes-agent GitHub repository](https://github.com/NousResearch/hermes-agent)
- [Nous Research Hermes Agent page](https://nousresearch.com/hermes-agent/)

### Gemini CLI shows that general-purpose terminal agents also use MCP

Google's Gemini CLI documentation describes an open-source terminal agent with built-in tools, local or remote MCP servers, and support for stdio, SSE, and streamable HTTP MCP transports. It is not only a coding assistant; Google frames it as useful for content generation, research, and task management as well.

Implication for Curyo: the same remote MCP server and `mcpServers` examples should work for developer agents that are not OpenClaw. Curyo should test against at least one non-OpenClaw MCP client so compatibility does not accidentally depend on one runtime.

Sources:

- [Google Gemini CLI documentation](https://google-gemini.github.io/gemini-cli/)
- [Gemini CLI MCP server docs](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html)
- [Google Cloud, Gemini CLI](https://cloud.google.com/gemini/docs/codeassist/gemini-cli)

## Agent Categories Curyo Should Support

### 1. Chat agents

Examples: ChatGPT, Claude, Gemini web experiences, enterprise assistants.

Traits:

- User-initiated rather than always-on.
- Strong conversational UX.
- Often mediated through connectors, apps, or remote MCP.
- May require user confirmation for write or spend actions.
- Webhook delivery is less useful because the agent may not be running when the callback fires.

Curyo needs:

- A remote connector flow.
- Clear tool descriptions and confirmation text.
- Poll-safe result reads.
- Durable public result URLs.
- A simple "ask humans about this" prompt pattern.
- Per-user or per-workspace authentication.

### 2. Self-hosted persistent agents

Examples: Hermes Agent, OpenClaw-style agents, personal server agents, custom daemon agents.

Traits:

- Run for long periods.
- Can hold memory, schedules, queues, and local files.
- Can receive webhooks.
- Can hold bearer tokens, delegated wallets, or managed budgets.
- Can write result URLs back to memory and continue later.

Curyo needs:

- Remote MCP plus direct HTTP/SDK access.
- Signed callbacks.
- Idempotency keys.
- Budget caps and audit logs.
- "Quote, ask, wait, result, remember" examples.
- Error codes that agents can recover from without human help.

### 3. Coding and terminal agents

Examples: Gemini CLI, Claude Code, Codex-style coding agents, Cursor-style tools, local MCP clients.

Traits:

- Strong file, shell, and code execution access.
- Often run in a local workspace.
- Usually support MCP through local config.
- Useful for product, design, copy, research, and software validation tasks.

Curyo needs:

- Copy-paste `mcpServers` configs for local and remote clients.
- Tool schemas that survive strict MCP clients.
- Minimal local setup.
- Examples for "review this landing page," "which UI is clearer," and "should this PR note be posted?"

### 4. Backend workflow agents

Examples: LangGraph/CrewAI-style services, custom business automation, startup lead-gen bots, data-processing loops.

Traits:

- Built by developers.
- Usually prefer direct HTTP or SDK calls over chat-product connectors.
- Can manage their own queues, retries, secrets, and billing.
- Need predictable APIs and stable contracts.

Curyo needs:

- A first-class `askHumans` SDK.
- JSON schemas shared with MCP.
- Webhook verification helpers.
- Exportable audit receipts.
- Direct status/result endpoints.

## What This Means For Curyo

### 1. Remote MCP should be platform-general

The current OpenClaw plan should become the first proof point, not the whole product. The Curyo MCP server should be tested and documented for:

- OpenClaw.
- Hermes Agent.
- ChatGPT custom connectors.
- Claude remote MCP connectors.
- Gemini CLI.
- Generic MCP clients that use `mcpServers`.

This likely means supporting streamable HTTP well, and adding SSE only if required for broad client compatibility.

### 2. Curyo needs connector-friendly authorization

Different agents handle secrets differently:

- ChatGPT and Claude connector flows expect user or workspace authentication.
- Self-hosted agents can store bearer tokens.
- Backend agents may prefer server-to-server API keys.
- Crypto-native agents may use x402 or delegated wallets.

Curyo should support the same logical control model everywhere:

- Agent identity.
- Scopes.
- Daily budget.
- Per-ask cap.
- Category allowlist.
- Pause/revoke.
- Audit trail.

The operator dashboard should eventually replace hand-written `CURYO_MCP_AGENTS` configuration for routine use.

### 3. Chat agents need a safer spend UX than daemon agents

A long-running daemon can be given a daily budget. A ChatGPT or Claude user may expect an explicit confirmation before spending. Curyo should expose quote results in a way the host can present clearly:

- Estimated total cost.
- Bounty amount.
- Service fee.
- Feedback window.
- Expected settlement timing.
- What happens if the ask gets too few responses.
- Refund or expiry behavior.

### 4. Structured results matter more than protocol state

Most agents do not want to reason from raw votes. They need a compact decision object:

- `ready`
- `answer`
- `confidence`
- `distribution`
- `voteCount`
- `rationaleSummary`
- `majorObjections`
- `recommendedNextAction`
- `publicUrl`
- `methodology`
- `limitations`

The raw Curyo round state should still be available for auditability, but it should not be the primary thing an agent branches on.

### 5. Polling and callbacks must both be first-class

Chat agents need polling because the agent session may be gone by the time humans respond. Persistent agents need webhooks because polling forever is wasteful.

Recommended model:

- `curyo_ask_humans` returns `operationKey`, `clientRequestId`, `publicUrl`, `statusTool`, and `pollAfterMs`.
- `curyo_get_question_status` is always safe to call after disconnects.
- `curyo_get_result` returns `ready: false` when still settling, and a structured result when ready.
- Webhooks are signed wake-up hints for server agents, not the source of truth.

### 6. The first connector should sell one primitive

Do not lead with "governance," "token mechanics," or "decentralized surveys" for general AI agents. Lead with:

> Ask verified humans.

The connector should make one thing easy:

1. Pick a template.
2. Quote the ask.
3. Submit with a cap.
4. Wait or poll.
5. Read a structured result.
6. Store the result URL.

## Recommended General Agent Integration Package

### MCP tools

Keep the first tool surface narrow:

- `curyo_list_categories`
- `curyo_list_result_templates`
- `curyo_quote_question`
- `curyo_ask_humans`
- `curyo_get_question_status`
- `curyo_get_result`
- `curyo_get_bot_balance`

Add annotations and docs that make tool behavior obvious to clients:

- Quote and read tools are read-only.
- Ask tools spend budget and submit public questions.
- Result reads are safe and idempotent.
- Errors are machine-readable.

### HTTP and SDK helpers

Expose the same concepts outside MCP:

- `quoteQuestion`
- `askHumans`
- `getQuestionStatus`
- `getResult`
- `buildWebhookVerifier`
- `parseAgentResult`

The SDK should preserve Curyo protocol records but hide transport details.

### Example flows

Create examples for:

- ChatGPT custom connector: ask humans whether a generated pitch is clear.
- Claude connector: ask humans whether an agent should send a message.
- Hermes Agent: run a daily idea-validation loop and store result URLs in memory.
- Gemini CLI: ask humans which README opening is clearer.
- Backend worker: submit a trust check and receive a webhook.

## Priority Roadmap

### Phase 1: General connector MVP

- Make the remote MCP endpoint compatible with streamable HTTP clients.
- Document bearer-token and managed-budget setup.
- Add generic `mcpServers` config examples.
- Add ChatGPT, Claude, Hermes, and Gemini CLI setup notes.
- Add machine-readable error examples.
- Add a landing-page pitch demo that is not OpenClaw-specific.

### Phase 2: Agent-friendly result layer

- Add `curyo_list_result_templates`.
- Stabilize `generic_rating`, `go_no_go`, and `ranked_option_member`.
- Return structured decision fields from `curyo_get_result`.
- Include public feedback notes and objections after settlement.
- Add helper docs for parsing results.

### Phase 3: Operator controls

- Build `/settings?tab=agents`.
- Let operators create, rotate, pause, and revoke agent tokens.
- Add per-agent scope, budget, per-ask cap, and category controls.
- Show ask history, payload hash, payment, result URL, and error state.

### Phase 4: Persistent-agent reliability

- Add signed callbacks.
- Add callback retries and delivery logs.
- Add low-response and stale-bounty events.
- Add clearer expiry behavior for limited-time bounties and feedback windows.

### Phase 5: Broader research and business workflows

- Add study objects.
- Add audience/self-reported cohort summaries.
- Add JSON/CSV exports.
- Add methodology receipts.
- Design private or embargoed context only after the access and disclosure model is explicit.

## Product Positioning

Use:

> Curyo is the verified human judgment layer for AI agents.

Avoid:

> Curyo is an OpenClaw plugin.

OpenClaw can be the first concrete demo, but the larger opportunity is becoming the connector any agent can call when it should ask humans instead of guessing.
