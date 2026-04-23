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

The missing work is mostly productization for autonomous agents, not a new protocol primitive. Agents need an OpenClaw-ready flow, simple templates, structured results, callbacks, SDK helpers, fast turnaround, audience targeting, and operational controls. Private or embargoed context remains deferred until the access model is designed carefully.

## Double-Check Findings

### OpenClaw is a relevant integration target

OpenClaw's MCP documentation describes MCP as the bridge between the CLI and external tools, and it supports local `stdio` servers plus remote `sse` and `streamable-http` transports. That makes Curyo's MCP direction relevant, but the current Curyo MCP route is still a first-release JSON-RPC POST server and explicitly says SSE streams are not enabled.

Implication: Curyo should provide an OpenClaw-ready MCP setup, including remote transport support, copy-paste config, bearer-token auth examples, and a working "quote, ask humans, wait, read result" recipe.

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
- Example bearer-token setup with scopes and budget caps surfaced from `/settings?tab=agents`, backed initially by `CURYO_MCP_AGENTS`.
- A small OpenClaw loop: list templates, quote, ask, poll or wait for callback, get result, write result URL to memory.
- Error examples for duplicate ask, insufficient budget, invalid media, category disallowed, still settling, and failed submission.

Golden path:

1. Operator reviews agent setup in `/settings?tab=agents`; while static registration remains active, Curyo provisions the bearer token through `CURYO_MCP_AGENTS` with scopes, a daily budget, a per-ask cap, and category allowlists.
2. OpenClaw config points to Curyo's remote MCP endpoint with that bearer token.
3. Agent calls `curyo_list_result_templates` and chooses `generic_rating`, `go_no_go`, or `ranked_option_member`.
4. Agent calls `curyo_quote_question` before any budget is reserved.
5. Agent calls `curyo_ask_humans` with `clientRequestId`, `maxPaymentAmount`, a valid question payload, and an optional callback URL.
6. Agent waits for a signed callback or polls `curyo_get_question_status`.
7. Agent calls `curyo_get_result`, stores `publicUrl` in memory, and continues, revises, or stops.

Recommended first demo:

1. Agent writes a landing-page pitch.
2. Agent asks Curyo: "Would this pitch make you want to learn more?"
3. Curyo returns a structured result.
4. Agent revises or proceeds based on the result.

### 2. Structured agent result package

`curyo_get_result` should return a machine-readable decision object, not only protocol state. This is now implemented as an off-chain result package layered over the existing Curyo rating system.

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

Implementation notes:

- `curyo_get_result` returns these fields at the top level and keeps raw rating/round data under `protocolState`.
- `confidence` is deterministic and derived from revealed participation, stake margin, and settled rating history.
- `majorObjections` and `dissentingView` use public post-settlement voter feedback when available, with stake-based fallback signals when no text is public.
- No subjective rationale or interpretation text is written on-chain.

### 3. Typed question templates

Agents should not invent their own schema each time. The first implementation keeps templates as off-chain result interpretation metadata around the current binary stake-weighted rating system:

- `generic_rating`
- `go_no_go`
- `ranked_option_member`

Additional templates can be added later without changing voting mechanics:

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

Pairwise and ranked-choice behavior can be approximated today by submitting multiple questions under one bounty and ranking each option by settled rating and confidence. The redeployed contract anchors only `questionMetadataHash` and `resultSpecHash`; the template definitions and interpretation logic stay off-chain.

Template guidance for OpenClaw docs:

- Document template IDs, allowed input fields, and result interpretation in the same shape returned by `curyo_list_result_templates`.
- Keep templates stable enough that agents can branch on them without scraping prose.
- Treat template selection as metadata around the existing rating mechanics, not as a new voting contract mode.

### 4. Webhooks and durable callbacks

Always-on agents should not poll forever. Add signed callbacks for:

- `question.submitted`
- `question.open`
- `question.settling`
- `question.settled`
- `question.failed`
- `feedback.unlocked`
- `bounty.low_response`

Each callback should include operation key, client request ID, content ID, public URL, status, attempt count, next retry time, and signature metadata. Callbacks should be treated as wake-up hints; agents should still read `curyo_get_question_status` or `curyo_get_result` before acting.

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

The operator UX should live at `/settings?tab=agents`, alongside account settings, so routine token rotation and budget changes eventually do not require editing `CURYO_MCP_AGENTS` by hand. The backend already has parts of this in MCP auth and budget storage. The first layer is operator visibility and documentation; self-serve token CRUD can replace static registration later.

### 8. Private or embargoed context

Business creation often involves unreleased ideas, customer segments, pricing, and lead lists. Public auditability is a Curyo strength, but agent operators may need:

- Private source artifacts for voters.
- Public hashes before full reveal.
- Embargoed result disclosure.
- Limited-time access to sensitive screenshots or drafts.

Deferred: do not promise this in the OpenClaw-ready MVP. Current docs should explicitly state that agents use public context URLs and public settled result pages. Private artifacts, embargoed asks, restricted voter-only context, and delayed disclosure need careful design because they change the default public nature of Curyo questions.

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

The SDK should mirror the MCP schema so OpenClaw, server apps, and custom agents all use the same data shape. Helper return values should preserve `clientRequestId`, `operationKey`, `publicUrl`, payment metadata, and the structured result fields returned by `curyo_get_result`.

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
- Three initial rating-system templates: `generic_rating`, `go_no_go`, `ranked_option_member`.
- Structured result payload with protocol state, objections, methodology, and limitations.
- Public feedback notes included in settled results.
- Signed webhook for settled questions.
- SDK helper docs for `quoteQuestion`, `askHumans`, `getQuestionStatus`, `getResult`, `buildWebhookVerifier`, and `parseAgentResult`.
- Operator setup docs for `/settings?tab=agents`.

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
- Embargoed/private artifacts, explicitly deferred until access control and disclosure semantics are designed.
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
