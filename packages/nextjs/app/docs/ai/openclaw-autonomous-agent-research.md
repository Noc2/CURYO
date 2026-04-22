# OpenClaw Autonomous Agent Research

Status: research note
Date: 2026-04-22

## Summary

The core assumption still looks right: Curyo can help always-on business agents by becoming the human judgment checkpoint they call when they should ask instead of guess.

The important nuance is that Curyo already has much of the raw infrastructure:

- A question-first bot-to-human feedback model.
- x402-paid question submission in Celo USDC.
- MCP tools for quote, ask, status, result, categories, and managed budget.
- Agent bearer tokens, scopes, daily budgets, per-ask caps, and category allowlists.
- Verified voters, cREP stake, hidden voting, public results, and optional hidden feedback notes.

The missing work is mostly productization for autonomous agents, not a new protocol primitive. Agents need simple templates, structured results, callbacks, fast turnaround, audience targeting, and operational controls.

## Double-Check Findings

### OpenClaw is a relevant integration target

OpenClaw's MCP documentation describes MCP as the bridge between the CLI and external tools, and it supports local `stdio` servers plus remote `sse` and `streamable-http` transports. That makes Curyo's MCP direction relevant, but the current Curyo MCP route is still a first-release JSON-RPC POST server and explicitly says SSE streams are not enabled.

Implication: Curyo should provide an OpenClaw-ready MCP setup, including remote transport support, copy-paste config, bearer-token auth examples, and a working "ask humans, wait, read result" recipe.

Sources:

- [OpenClaw MCP documentation](https://docs.openclaw.ai/cli/mcp)
- [Curyo MCP tools](../../../lib/mcp/tools.ts)
- [Curyo MCP API route](../../api/mcp/route.ts)

### Fully autonomous agents are still weak at long-horizon work

The Remote Labor Index benchmark reports that current agents are far from replacing human remote workers end-to-end. The paper's headline result is that the best tested agent achieved only a small automation rate on realistic projects, even with tool access.

METR's long-task work points in the same direction: models are improving, but task duration and reliability remain limiting factors. Current agents can complete short bounded tasks much more reliably than long, messy, multi-step work.

Implication: Curyo should not sell itself as a replacement agent runtime. The sharper wedge is an uncertainty checkpoint for agents that already run elsewhere.

Sources:

- [Remote Labor Index paper](https://arxiv.org/abs/2510.26787)
- [METR, Measuring AI ability to complete long tasks](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/)

### Human oversight is a mainstream agent design pattern

OpenAI's agent guide recommends human intervention for high-risk actions and repeated failures. Microsoft similarly emphasizes governance for autonomous agents, including identity, permissions, monitoring, and control over agent actions.

Implication: Curyo fits a broader pattern: autonomous agents need escalation paths. Curyo can make that escalation market-like, paid, auditable, and verified instead of relying only on one local operator approval.

Sources:

- [OpenAI, A practical guide to building AI agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [Microsoft, Securing and governing the rise of autonomous agents](https://www.microsoft.com/en-us/security/blog/2025/08/26/securing-and-governing-the-rise-of-autonomous-agents/)

### There is visible market interest in always-on agents

Current reporting around OpenClaw describes people experimenting with autonomous agents for side projects, small businesses, content, research, and automation. The hype is real, but the product risk is also real: these agents can spend money, post low-quality output, misread ambiguous evidence, or get stuck in loops.

Implication: Curyo's strongest business-agent use cases are the points where a wrong autonomous action is more expensive than asking a small panel of humans.

Source:

- [Business Insider, OpenClaw and AI-agent boom](https://www.businessinsider.com/china-ai-raise-lobsters-openclaw-ai-agent-boom-2026-4)

## What Curyo Should Improve

### 1. OpenClaw-ready MCP package

Current Curyo MCP tools are close to the needed shape, but OpenClaw users need a polished integration:

- Remote MCP transport compatible with OpenClaw's supported modes.
- Example `mcpServers` config.
- Example bearer-token setup with scopes and budget caps.
- A small OpenClaw loop: quote, ask, poll or wait, get result, write result URL to memory.
- Error examples for duplicate ask, insufficient budget, invalid media, category disallowed, still settling, and failed submission.

Recommended first demo:

1. Agent writes a landing-page pitch.
2. Agent asks Curyo: "Would this pitch make you want to learn more?"
3. Curyo returns a structured result.
4. Agent revises or proceeds based on the result.

### 2. Structured agent result package

`curyo_get_result` should return a machine-readable decision object, not only protocol state.

Useful fields:

- `ready`
- `answer`
- `confidence`
- `distribution`
- `voteCount`
- `stakeMass`
- `rationaleSummary`
- `majorObjections`
- `dissentingView`
- `recommendedNextAction`
- `publicUrl`
- `methodology`
- `limitations`

For an agent, the most useful result is not just "rating 72." It is "proceed, medium confidence, humans liked the problem but objected to pricing."

### 3. Typed question templates

Agents should not invent their own schema each time. Add templates that keep the UI simple while making answers parseable:

- `yes_no_unsure`
- `approve_revise_block`
- `pairwise_choice`
- `ranked_choice`
- `fact_check`
- `authenticity_check`
- `landing_page_review`
- `outreach_message_review`
- `purchase_intent`
- `market_need`

These templates can remain metadata around the existing question-first flow, at least initially.

### 4. Webhooks and durable callbacks

Always-on agents should not poll forever. Add signed callbacks for:

- `question.submitted`
- `question.open`
- `question.settling`
- `question.settled`
- `question.failed`
- `feedback.unlocked`
- `bounty.low_response`

Each callback should include operation key, client request ID, content ID, public URL, status, and retry metadata.

### 5. Fast-lane feedback market

Business agents often need quick feedback. Curyo should expose:

- Estimated time to result.
- Quote by desired speed and voter count.
- Dynamic bounty suggestions.
- "Raise bounty if stale" behavior.
- Minimum viable quorum for fast checks.

This makes Curyo usable inside a 24/7 agent loop instead of only as a slow public rating market.

### 6. Audience and expertise routing

New-business agents do not need generic judgment only. They need the right humans:

- Founders.
- Developers.
- Designers.
- Sales operators.
- Local residents.
- Target customers.
- Domain reviewers.

Use public self-reported audience context carefully. Label it as self-reported and aggregate it after settlement. Do not make all voting eligibility depend on easily gamed profile fields.

### 7. Agent operator dashboard

Autonomous-agent operators need controls:

- Create and revoke agent tokens.
- Set per-agent daily and per-ask budgets.
- Restrict categories.
- Pause an agent.
- View every ask, payload hash, payment, result URL, and error.
- Export audit logs.

The backend already has parts of this in MCP auth and budget storage. The missing layer is operator UX and documentation.

### 8. Private or embargoed context

Business creation often involves unreleased ideas, customer segments, pricing, and lead lists. Public auditability is a Curyo strength, but agent operators may need:

- Private source artifacts for voters.
- Public hashes before full reveal.
- Embargoed result disclosure.
- Limited-time access to sensitive screenshots or drafts.

This needs careful design because it changes the default public nature of Curyo questions.

### 9. Feedback notes inside agent reads

Curyo's hidden feedback notes are especially important for agents. An agent usually needs "why" more than it needs a raw score.

Recommendations:

- Include public feedback notes in `curyo_get_result` after settlement.
- Add a summarized rationale field.
- Include source URLs from feedback when available.
- Let the funder award feedback bonuses from an agent-friendly API.
- Return a separate `feedbackQuality` or `actionability` signal where possible.

### 10. SDK helpers for asks

The SDK currently focuses on hosted reads and vote helpers. Add wallet-agnostic helpers for:

- `quoteQuestion`
- `askHumans`
- `getQuestionStatus`
- `getResult`
- `buildWebhookVerifier`
- `parseAgentResult`

The SDK should mirror the MCP schema so OpenClaw, server apps, and custom agents all use the same data shape.

## Recommended Product Positioning

Use:

> Curyo is the verified human judgment layer for autonomous agents.

Avoid:

> Curyo runs autonomous businesses for you.

The latter competes with agent runtimes and overpromises. The former makes Curyo the missing trust layer inside their workflows.

## Priority Roadmap

### Phase 1: OpenClaw checkpoint MVP

- Remote MCP compatibility and docs.
- OpenClaw config example.
- Three templates: `yes_no_unsure`, `approve_revise_block`, `pairwise_choice`.
- Structured result payload.
- Feedback notes included in settled results.
- Signed webhook for settled questions.

### Phase 2: Business-agent workflows

- Landing page review.
- Outreach review.
- Market need validation.
- Purchase-intent pulse.
- Competitor comparison.
- Fast-lane quotes and ETA.

### Phase 3: Operator controls

- Agent dashboard.
- Token lifecycle.
- Budget logs.
- Pause/revoke.
- Audit export.
- Category controls.

### Phase 4: Research and private context

- Study objects.
- Audience routing.
- Embargoed/private artifacts.
- JSON/CSV export.
- Methodology receipts.

## Final Assessment

Curyo is already directionally well positioned. The protocol has the right trust primitives, and the app already exposes x402 and MCP foundations. The product gap is making the experience obvious for autonomous agents:

1. Ask a bounded question.
2. Pay with a capped budget.
3. Wait without babysitting.
4. Receive a structured human signal.
5. Store the public proof in the agent's audit trail.

That is the missing piece many 24/7 OpenClaw-style agents need before they can safely create, market, sell, or publish on their own.
