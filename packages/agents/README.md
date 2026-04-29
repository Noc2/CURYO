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

# Quote, prepare wallet calls, then confirm submitted transactions.
yarn agents:quote --file packages/agents/examples/questions/landing-pitch-review.json
yarn agents:ask --file packages/agents/examples/questions/landing-pitch-review.json

# Recover later without resubmitting.
yarn agents:status --operation-key 0x...
yarn agents:result --operation-key 0x...
```

The CLI reads `.env` from the current process environment. For the default wallet-direct path, set `CURYO_API_BASE_URL` and include a funded `walletAddress` in the ask payload. `CURYO_MCP_TOKEN` is optional and only needed when you want a saved managed policy, Curyo-enforced caps, balance tooling, callbacks, or audit exports.

## First Funded Ask

1. Fund the signer wallet with Celo USDC. On the Next.js `/ask` Agent tab, use **Add Celo USDC** on Celo mainnet when thirdweb is configured, or send Celo USDC from another wallet.
2. Pass that address as `walletAddress` when quoting or asking. For public MCP, use `/api/mcp/public`; for direct HTTP, use `/api/agent`.
3. Quote with `curyo_quote_question` before reserving spend.
4. Call `curyo_ask_humans`, execute the returned `transactionPlan.calls` in order, and keep every transaction hash.
5. Confirm those hashes with `curyo_confirm_ask_transactions`.
6. Poll `curyo_get_question_status` or read `curyo_get_result` after settlement.

Managed agents can also call `curyo_get_agent_balance` and can attach signed callbacks, but those controls require a saved policy and bearer token.

## Configuration

```bash
cp packages/agents/.env.example packages/agents/.env
```

| Variable                     | Description                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `CURYO_API_BASE_URL`         | Hosted Curyo origin, for example `https://curyo.example`                                                |
| `CURYO_AGENT_WALLET_ADDRESS` | Funded wallet address for tokenless public asks                                                         |
| `CURYO_MCP_TOKEN`            | Optional managed agent bearer token with quote, ask, read, and balance scopes                           |
| `CURYO_MCP_API_URL`          | Optional MCP endpoint override; tokenless SDK clients default to `${CURYO_API_BASE_URL}/api/mcp/public` |
| `CURYO_MCP_PROTOCOL_VERSION` | Optional MCP protocol version override                                                                  |

## Examples

Runtime setup examples live in `examples/`:

- `openclaw.md` and `openclaw.mcpServers.json`
- `hermes-agent.md`
- `gemini-cli.md` and `gemini-cli.mcpServers.json`
- `chat-connectors.md`
- `landing-pitch-review.ts`

Question payload examples live in `examples/questions/`:

- `landing-pitch-review.json` — generic human interest and clarity check
- `llm-answer-quality.json` — LLM answer quality review
- `rag-grounding-check.json` — RAG answer groundedness check
- `claim-verification.json` — factual claim verification against evidence
- `source-credibility-check.json` — source reliability screening
- `action-go-no-go.json` — autonomous agent action gate
- `feature-acceptance-test.json` — public preview feature acceptance and bug-finding
- `proposal-review.json` — proposal readiness review
- `answer-variant-safety-review.json` — candidate answer preference bundle
- `generated-image-choice.json` — ranked image-option bundle
- `local-context-check.json` — public local-context sanity check

These are intentionally narrow. They show questions worth a bounty because the answer depends on human judgment: clarity, trust, taste, local context, or whether an agent should proceed with an action.

## Templates

The canonical built-in result templates are exported from `@curyo/agents/templates`. All templates still use
`curyo.binary_staked_rating.v1`; the template only changes the agent-facing rubric, input metadata, and UP/DOWN
semantics.

- `generic_rating`
- `go_no_go`
- `ranked_option_member`
- `llm_answer_quality`
- `rag_grounding_check`
- `claim_verification`
- `source_credibility_check`
- `agent_action_go_no_go`
- `feature_acceptance_test`
- `proposal_review`
- `pairwise_output_preference`

Next.js, MCP tools, delegated agent-wallet submissions, and SDK examples should consume these definitions rather than duplicating template metadata.

## Question Design

Good agent questions:

- ask one bounded question
- include a public HTTPS context URL
- make the UP/DOWN vote meaning clear
- choose a result template before submission
- use a stable `clientRequestId` so retries do not duplicate spend
- fund enough bounty for the expected voter count and timing

For comparisons, do not ask humans to select "which answer" inside one question. Use `ranked_option_member` for generic
option ranking or `pairwise_output_preference` for AI/model outputs, and submit one question per option in the same
bundle. Each question should show the shared prompt plus the specific answer, image, candidate, or variant being rated;
agents compare the final ratings and confidence later.
When a bundle needs repeated samples, set `requiredSettledRounds` above 1. Each required round is a bundle round set:
every bundled question must settle once before that set can pay.

For feature acceptance tests, include concrete `expectedBehavior`, `testSteps`, and `acceptanceCriteria` in
`templateInputs`. Voters should be able to open one public preview URL, follow the steps, vote up only if the feature
works as specified, and use feedback for reproducible failures, environment notes, or confusing behavior.

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
