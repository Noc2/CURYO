# AI Agent Human Feedback Playbook

Status: draft research note

This note captures the working strategy for making Curyo useful to bots and AI agents that need verified human judgment. The core idea is simple: Curyo can become the human feedback layer agents call when they should ask instead of guess.

## Positioning

Curyo is a verified human feedback oracle for autonomous agents.

Agents already have tool calls, memory, search, wallets, and workflow runners. What they still lack is a clean way to ask humans a bounded question, attach the relevant context, pay for responses, and get back a structured result they can use in a later decision. Curyo is especially well suited to that role because the protocol already turns questions into public, stake-backed signals, and now the same submission flow applies to both bots and humans.

This is different from generic human-in-the-loop approval. Approval asks a single operator whether an agent may continue. Curyo can ask a market of verified humans what is true, useful, safe, interesting, locally relevant, or worth acting on.

For the general agent connector MVP, keep the product surface narrow: configure an agent token, choose a template, quote the ask, submit with an idempotency key, wait through a signed callback webhook or status read, then consume the structured result. Private or embargoed context is intentionally deferred; the first flow assumes public context URLs and public settled result pages.

## Questions Agents Would Ask Humans

AI agents are most likely to ask humans questions in places where model confidence is not enough, where social judgment matters, or where the cost of a wrong answer is higher than the cost of asking.

### Authenticity and Provenance

- Is this image likely authentic?
- Does this screenshot look manipulated?
- Is this product review from a real user?
- Does this social post look coordinated, promotional, or organic?
- Is this profile, listing, ticket, or support request legitimate?

These questions benefit from human pattern recognition, local context, and skepticism around artifacts that models may over-trust.

### Relevance and Usefulness

- Is this search result useful for the user's intent?
- Is this answer actually helpful, or just plausible?
- Which of these sources best answers the question?
- Should this item be included in a digest, recommendation feed, or research memo?

These fit agent pipelines that rank content, curate leads, build reports, or decide what to escalate.

### Quality, Taste, and Preference

- Which product photo looks more trustworthy?
- Which landing page headline is clearer?
- Which generated image best matches the prompt?
- Which design feels more premium, more credible, or less confusing?
- Would you click this recommendation?

Models can generate options cheaply, but humans remain useful for taste, clarity, and cultural resonance.

### Moderation and Norms

- Is this content hateful, sexual, violent, misleading, or harassment?
- Is this borderline content acceptable in this community?
- Does this claim need a warning label?
- Should this user report be escalated?

This category should support policies, jurisdiction, community-specific rules, and evidence links. It should also allow "not enough context" as a valid answer.

### Local and Real-World Context

- Is this event still happening at this location?
- Does this storefront look open?
- Is this translation natural for local speakers?
- Is this restaurant, venue, seller, or listing trustworthy?
- Does this local instruction make sense to someone on the ground?

Agents will ask these when web data is stale or when local nuance matters.

### Ambiguous Factual Judgment

- Is this claim supported by the linked source?
- Does this summary misrepresent the article?
- Is this data point likely a typo?
- Which of these conflicting sources is more credible?

Curyo should avoid presenting these as final truth. The safer framing is "verified human judgment signal with cited evidence."

### Agent Action Review

- Should this agent send this email?
- Should this bot open this issue?
- Should this trade, purchase, booking, or post be blocked for review?
- Does this autonomous action look reasonable given the stated goal?

This overlaps with human-in-the-loop approval, but Curyo can make it broader: instead of one owner approval, a bot can buy a small verified judgment quorum.

### Training and Dataset Filtering

- Is this example high-quality training data?
- Does this label match the image?
- Which answer is better?
- Is this reasoning trace acceptable?
- Should this generated sample be kept or discarded?

This resembles classic human preference collection, but Curyo can add public incentives, reputation, and auditable reward flows.

### Market, Social, and Community Judgment

- Will people find this post interesting?
- Is this proposal likely to be controversial?
- Which feature request matters more?
- Is this bounty clear enough for contributors?
- Should this token, project, or claim be treated as suspicious?

This is valuable for bots operating in social, DAO, creator, marketplace, or governance contexts.

## Make Asking Easy

The most important product decision is to give agents one obvious primitive:

```ts
const request = await curyo.askHumans({
  question: "Does this image look AI-generated?",
  context: "The agent is deciding whether to include it in a verified seller listing.",
  mediaUrl: "https://example.com/image.jpg",
  evidenceUrl: "https://example.com/listing",
  category: "authenticity",
  answerType: "yes_no_unsure",
  budgetUsd: "5.00",
  roundConfig: {
    blindPhaseSeconds: 10 * 60,
    maxDurationSeconds: 60 * 60,
    minVoters: 15,
    maxVoters: 75,
  },
  webhookUrl: "https://agent.example.com/curyo/webhook",
  idempotencyKey: "listing-123-auth-check",
});
```

The SDK helper should hide transport differences while preserving the protocol record. `askHumans()` can use hosted x402 for wallet-funded agents or managed MCP budgets for remote MCP clients, but the returned object should always include the client request ID, operation key, public URL, payment metadata, status URL, and later the same structured result shape returned by `curyo_get_result`.

The response should be immediately useful:

```ts
{
  questionId: "0x...",
  publicUrl: "https://curyo.example/questions/0x...",
  escrowTxHash: "0x...",
  estimatedResolution: "2026-04-17T14:30:00Z",
  statusUrl: "https://api.curyo.example/questions/0x..."
}
```

When the result is ready:

```ts
{
  questionId: "0x...",
  status: "settled",
  ready: true,
  answer: "proceed",
  confidence: {
    level: "medium",
    score: 0.62
  },
  distribution: {
    ratingBps: 7200,
    conservativeRatingBps: 6100,
    up: { count: 21, stake: "84000000000000000000", share: 0.78 },
    down: { count: 4, stake: "24000000000000000000", share: 0.22 }
  },
  majorObjections: [
    { type: "concern", summary: "Humans liked the problem but objected to pricing." }
  ],
  recommendedNextAction: "proceed_after_addressing_objections",
  methodology: {
    templateId: "generic_rating",
    ratingSystem: "curyo.binary_staked_rating.v1"
  },
  limitations: ["Curyo ratings are human judgment signals, not factual proof."],
  resultUrl: "https://curyo.example/questions/0x..."
}
```

## Templates

Agents should not start from a blank text box. The first templates should keep the user-facing rating system simple while still letting the agent describe the question clearly:

- Generic rating: default support signal for one question.
- Go / no-go: UP means proceed, DOWN means stop or revise.
- Ranked option member: ask one question per option in the same bounty and rank by settled rating plus confidence.

Later templates can build richer product UX on top of the same primitive:

- Binary judgment: yes, no, unsure.
- Pairwise choice: A, B, tie, neither.
- Ranking: ordered list of options.
- Fact check: supported, contradicted, unclear, source missing.
- Moderation: allowed, restricted, remove, escalate.
- Authenticity: likely real, likely synthetic, manipulated, unclear.
- Action approval: approve, reject, revise, escalate.

Templates reduce invalid questions, make pricing predictable, and help agents parse results without brittle natural-language scraping.

The first implementation keeps template definitions and result interpretation off-chain. The redeployed contract should only anchor `questionMetadataHash` and `resultSpecHash` so indexers and agents can verify which metadata/result spec was used without paying to store subjective text on-chain.

Template docs should be machine-readable enough for agents:

- `curyo_list_result_templates` returns the current IDs, display names, expected metadata fields, and result interpretation notes.
- `generic_rating`, `go_no_go`, and `ranked_option_member` are the first stable generic agent templates.
- Later templates can be added without changing voting mechanics as long as they remain off-chain result interpretation metadata.

## Payment Design

The payment flow should feel like an API call, not a crypto workflow.

Recommended layers:

- Prepaid bot wallet: agents deposit USDC or CELO once, then spend against a budget.
- Per-question escrow: each submitted question creates or funds a bounty.
- Quote before submit: agents call `quoteQuestion` to estimate cost, expected voters, service fee, deadline, and whether the requested round settings fit governance bounds.
- Budget caps: per-question, daily, weekly, and per-category limits.
- Idempotency keys: retries must not double-pay.
- Expiry handling: limited-time bounty and feedback windows should be explicit, but current public question bounties are not a generic refund promise.
- Webhooks: agents should not need to poll constantly; signed callbacks should wake the agent when the ask is submitted, open, settling, settled, failed, feedback unlocked, or under-responding.
- Receipts: every paid question returns transaction hashes, protocol fees, reward distribution, and final settlement metadata.

The user-facing rating system should stay the same everywhere: one 0-100 community rating, with templates used to describe the question rather than to introduce multiple scoring models.

For agent adoption, payment should support both on-chain wallets and API-managed billing. The on-chain path is ideal for crypto-native agents. A managed billing path helps chat connectors, terminal agents, and backend workers start quickly while still settling into protocol rails underneath.

## MCP Tool Surface

An MCP adapter should expose narrow Curyo actions, not raw transaction access. A useful initial tool set:

- `curyo_quote_question`: estimate cost and requirements before paying.
- `curyo_ask_humans`: submit a validated question with budget, context, media, and webhook.
- `curyo_get_question_status`: check lifecycle state.
- `curyo_get_result`: fetch the settled human signal.
- `curyo_list_categories`: discover supported categories and templates.
- `curyo_estimate_budget`: ask "what budget gets me N voters in T minutes?"
- `curyo_cancel_or_expire_question`: cancel when still allowed or expire stale work.
- `curyo_get_bot_balance`: show spendable balance and caps.

The production MCP server starts with paid `curyo_ask_humans` as the core workflow, not as a later add-on. Read tools exist to make the paid ask safe and useful:

- `curyo_quote_question` must run deterministic preflight before any spend is reserved.
- `curyo_ask_humans` must require explicit budget fields and an idempotency key.
- `curyo_get_question_status` and `curyo_get_result` must let agents recover from disconnects without repeating a paid ask.
- `curyo_get_bot_balance` must show the authenticated agent's remaining managed budget and configured caps.

Agent integration docs should present the same flow every time:

1. Configure the remote MCP endpoint and bearer token.
2. Read `curyo_list_result_templates`.
3. Quote with `curyo_quote_question`.
4. Submit with `curyo_ask_humans`, `clientRequestId`, `maxPaymentAmount`, and optional callback URL.
5. Recover with `curyo_get_question_status`.
6. Finish with `curyo_get_result` and persist the result URL.

The adapter should be conservative around writes:

- Simulate before submit.
- Require explicit budget fields.
- Enforce wallet scopes.
- Log client name, source adapter, question body, category, transaction hash, and result.
- Return machine-readable errors for duplicate, invalid media, insufficient funds, policy rejection, and rate limits.

## Generic Agent Flow

A ChatGPT connector, Claude connector, Hermes daemon, OpenClaw agent, Gemini CLI workflow, or backend worker can use the same core flow:

1. The operator reviews agent setup in `/settings?tab=agents`; while static registration remains active, Curyo provisions the bearer token through `CURYO_MCP_AGENTS` with scopes, daily budget, per-ask cap, and category allowlist.
2. The agent runtime points at Curyo's remote MCP endpoint, SDK, or HTTP API with the appropriate credential.
3. The bot detects uncertainty in a task, such as suspicious media, unclear instructions, or a risky autonomous action.
4. It calls `curyo_list_result_templates` and picks the closest template.
5. It calls `curyo_quote_question` with category, deadline, budget, and desired voter count.
6. It submits through `curyo_ask_humans`, funding the bounty from a managed agent budget or delegated bot wallet.
7. It receives a `questionId`, `publicUrl`, `operationKey`, and payment or escrow metadata.
8. It waits for a signed callback or polls `curyo_get_question_status`.
9. It calls `curyo_get_result` and maps the result into its own policy.
10. It stores the result URL in its audit log so humans can inspect why the bot acted.

The whole experience should fit in one or two tool calls from the agent's perspective.

Runtime examples:

- ChatGPT or Claude connector: ask humans whether a generated pitch is clear, then poll for the result in the same conversation.
- Hermes or OpenClaw daemon: ask humans during a long-running workflow, receive a signed callback webhook, and write the result URL to memory.
- Gemini CLI or coding agent: ask humans which README opening or UI copy is clearer from a local `mcpServers` config.
- Backend worker: submit a trust check through SDK or HTTP helpers and process the callback in a queue.

## Media Policy

Every question should carry a required context URL. Preview media should remain optional.

Good rule:

- Require a context URL for every question.
- Allow optional image or video preview media when it helps discovery or visual judgment.
- Strongly encourage previews or source links for visual, authenticity, design, product, place, and content-moderation categories.
- Let abstract judgment, governance, ranking, policy, and action-approval questions ship without preview media.
- Prefer questions with evidence in ranking and discovery.
- Let agents attach structured artifacts such as screenshots, logs, diffs, source URLs, model outputs, and traces.

Mandatory preview media everywhere would block many useful questions, especially abstract decisions, policy review, source ranking, and "should the agent do this?" approvals.

## Product Requirements

To make this easy for bots:

- Provide one SDK function: `askHumans`.
- Provide SDK helpers for `quoteQuestion`, `getQuestionStatus`, `getResult`, `buildWebhookVerifier`, and `parseAgentResult`.
- Provide a matching MCP adapter with the same schemas.
- Use the hosted `/api/x402/questions` endpoint for direct paid asks: the bot wallet holds Celo USDC, thirdweb signs the x402 payment, and the API executor funds the on-chain USDC Bounty.
- Use managed MCP agent budgets for remote MCP clients that cannot sign x402 payment headers inside a JSON-RPC tool call. The MCP server should reserve from the authenticated agent's budget, submit from the server executor wallet, and return an auditable operation record.
- Provide hosted webhooks and status URLs.
- Provide question templates with typed result schemas.
- Provide bot wallets, delegated spend limits, and clear receipts.
- Provide `quote -> submit -> wait -> result` as the golden path.
- Provide examples for common agent frameworks.
- Provide operator settings at `/settings?tab=agents` for token lifecycle, scopes, budgets, category allowlists, pauses, audit logs, and ask history; keep `CURYO_MCP_AGENTS` as the source of truth until that UI is wired to persistent token management.
- Make all writes idempotent.
- Support media uploads, source links, and screenshots.
- Expose public result pages for auditability.
- Keep the question submission rules identical for humans and bots.
- Defer private artifacts, embargoed asks, restricted voter-only context, and delayed disclosure until the security and disclosure model is explicit.

## Research Anchors

- [OpenClaw agents overview](https://openclawdoc.com/docs/agents/overview/) describes autonomous agents as goal-directed systems that interact with environments through tools.
- [Model Context Protocol introduction](https://modelcontextprotocol.io/docs/getting-started/intro) frames MCP as a standard way for applications to provide context and tools to language models.
- [MCP elicitation specification](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation) is relevant because it formalizes how tools can request additional user input, although Curyo's use case is broader: paid feedback from verified humans, not only the current local user.
- [OpenAI's human preferences work](https://openai.com/index/learning-from-human-preferences/) is a useful precedent for using human comparisons and preferences to improve model behavior.
- [Amazon Mechanical Turk requester concepts](https://docs.aws.amazon.com/zh_cn/AWSMechTurk/latest/RequesterUI/mechanical-turk-concepts.html) show the older marketplace pattern of requester-funded human tasks, assignments, rewards, and qualifications.
- [Coinbase x402 docs](https://docs.cdp.coinbase.com/x402/welcome) are relevant to agent payments because they show a modern API-native payment pattern.
- [thirdweb x402 docs](https://portal.thirdweb.com/x402) are relevant because Curyo's hosted question endpoint uses thirdweb's x402 client and server settlement helpers.
- [Celo x402 docs](https://docs.celo.org/build-on-celo/build-with-ai/x402) anchor the Celo USDC payment asset used by bot wallets.
- [OpenAI Agents JS human-in-the-loop guide](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/) shows the approval/checkpoint pattern that Curyo can complement with broader verified human judgment.

## Shortest Path

Build the first version around:

1. `askHumans()` in the SDK, with companion helpers for quote, status, result, callback verification, and result parsing.
2. A thin MCP adapter exposing quote, paid ask, status, result, categories, and balance.
3. A prepaid bot wallet with Celo USDC for x402 and managed MCP agent budgets for remote MCP clients.
4. Three generic agent templates: `generic_rating`, `go_no_go`, and `ranked_option_member`.
5. Webhook delivery plus a public result page.
6. `/settings?tab=agents` operator setup for token lifecycle, scopes, budgets, and audit records, backed initially by `CURYO_MCP_AGENTS`.
7. A neutral landing-page pitch review example, plus runtime-specific setup notes for ChatGPT, Claude, Hermes, Gemini CLI, OpenClaw, and backend workers.

That would make the protocol legible to AI agents: when uncertain, ask humans, pay fairly, and consume a structured signal.
