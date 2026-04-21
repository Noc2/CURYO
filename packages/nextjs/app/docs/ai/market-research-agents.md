# AI Agent Market Research Findings

Status: research note
Date: 2026-04-21

## Summary

AI agents are a strong fit for Curyo's "ask verified humans" primitive, but market research is a more specific product category than generic agent feedback. Curyo already has the core rails: paid asks, x402, MCP tools, required context URLs, governed round settings, bounties, verified voters, and stake-backed public results.

The missing layer is research workflow support: typed question templates, audience targeting, study grouping, structured results, exports, webhooks, and transparent methodology. The strongest positioning is not "AI market research replaces humans." It is:

> Curyo is the verified human validation layer for AI-led market research.

Agents can use synthetic respondents, web research, and LLM analysis for speed, then use Curyo to validate high-stakes assumptions with real verified humans.

## External Research Signals

### AI agents are becoming a real workflow primitive

McKinsey's 2025 State of AI survey reports broad AI use and growing agent experimentation. It says 88 percent of respondents report regular AI use in at least one business function, 23 percent report scaling an agentic AI system somewhere in the enterprise, and another 39 percent are experimenting with AI agents. It also notes that high performers are more likely to use AI for growth and innovation, not only efficiency.

Source: [McKinsey, The state of AI in 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai)

Implication for Curyo: agents will increasingly run market research workflows themselves. They will need tools for "ask humans," "validate this assumption," "compare concepts," and "return an auditable result."

### Market research is moving toward AI-led and synthetic workflows

Qualtrics reports that research teams are increasingly using purpose-built AI, synthetic responses, and agentic workflows. It also says 78 percent of researchers predict AI agents will run more than half of all research projects by 2028.

Source: [Qualtrics, Research Teams Not Using AI are Four Times More Likely to Lose Organizational Influence](https://www.qualtrics.com/articles/news/research-teams-not-using-ai-are-four-times-more-likely-lose-organizational-influence/)

Qualtrics also separates several meanings of "synthetic data": synthetic personas, derived insights, simulated individual-level data, digital twins, and simulated conversations. That fragmentation matters because each output supports a different use case.

Source: [Qualtrics, Synthetic data for market research](https://www.qualtrics.com/articles/strategy-research/synthetic-data-market-research/)

Implication for Curyo: the product should be explicit about what it returns. Curyo returns verified human judgment signals, not synthetic respondents and not absolute truth.

### Synthetic respondents are useful but risky without human validation

NIM compared real U.S. consumers with AI-generated respondents and concluded that AI can streamline research and provide fast directional insight, but it lacks the depth and nuance of real consumer feedback. NIM also highlights mainstream bias: AI tends to favor well-known brands and mainstream opinions, missing early adopters and niche markets.

Source: [NIM, AI-generated respondents](https://www.nim.org/en/research/projects-overview/detail-research-project/synthetische-befragte)

NIQ makes a similar point from the provider side: synthetic market research models need testing, calibration, and validation against real human consumer data. It warns that convincing output is not the same thing as accurate output.

Source: [NIQ, The rise of synthetic respondents in market research](https://nielseniq.com/global/en/insights/education/2024/the-rise-of-synthetic-respondents/)

Implication for Curyo: Curyo can be the calibration and validation layer for synthetic research. This is likely the cleanest wedge.

### AI fraud makes verified human panels more valuable

Greenbook and Ipsos report that 36 percent of surveyed business decision makers experienced some form of AI fraud, and they identify market research risks such as fabricated data, bot infiltration, over-reliance on AI, and unsecured AI practices.

Source: [Greenbook, Unmasking Fraud as the Scariest AI Trend in Market Research](https://www.greenbook.org/insights/artificial-intelligence-and-machine-learning/unmasking-fraud-as-the-scariest-ai-trend-in-market-research)

The Guardian also reported on withdrawn survey findings that were based on fraudulent data and discussed the risk of AI-generated bogus responses in online opt-in surveys.

Source: [The Guardian, fraudulent data and AI's threat to polling](https://www.theguardian.com/technology/2026/mar/28/how-fraudulent-church-data-revealed-ais-threat-to-polling)

Implication for Curyo: the verified-human, stake-backed design is a direct answer to market research data-quality anxiety.

### Research ethics are becoming more explicit around AI

The ICC/ESOMAR 2025 Code emphasizes transparency, accountability, fit-for-purpose research, data protection, human oversight, and clear responsibility across fragmented research workflows.

Source: [ICC/ESOMAR International Code 2025](https://iccwbo.org/news-publications/business-solutions/iccesomar-international-code-market-opinion-social-research-data-analytics/)

Implication for Curyo: market-research features should include methodology receipts, clear disclosure that the ask was agent-submitted, audience/sample metadata, limitations, and data handling notes.

## What Curyo Already Has

Curyo is already unusually close to this use case:

- A single "ask humans" primitive for agents.
- Required context URL for every question.
- Optional image and YouTube preview media.
- Paid x402 question submission in Celo USDC.
- MCP tools for quoting, asking, checking status, reading results, listing categories, and checking managed budget.
- Managed MCP budgets, bearer-token agents, per-ask caps, daily budgets, and optional category allowlists.
- Verified humans through Voter ID.
- cREP stake-backed votes.
- Hidden voting during the blind phase.
- Optional hidden feedback that unlocks after settlement.
- Public result URLs and on-chain auditability.

Important current limitations for this category:

- The x402/MCP question payload is generic: `title`, `description`, `contextUrl`, `imageUrls`, `videoUrl`, `tags`, `categoryId`, `roundConfig`, and `bounty`.
- The MCP result is a public human signal with rating, vote counts, stake pools, confidence mass, and round status.
- There is no explicit market-research schema for answer type, target audience, study grouping, segment cuts, result exports, or callbacks.

## Missing Features For AI-Agent Market Research

### 1. Typed research templates

Agents should not invent a free-form question every time. Add templates that produce machine-readable answers:

- Concept test: "Would this solve a real problem?"
- Feature priority: "Which feature matters most?"
- Message test: "Which headline is clearer?"
- Purchase intent: "How likely would you be to buy?"
- Pricing pulse: "Does this feel too cheap, fair, or too expensive?"
- Competitor comparison: "Which option would you choose?"
- Problem validation: "Is this a painful enough problem?"
- Trust check: "Does this product/page/listing seem credible?"
- Synthetic validation: "Do these synthetic insights match your real preference?"

Recommended answer schemas:

- `yes_no_unsure`
- `single_choice`
- `pairwise_choice`
- `ranked_choice`
- `likert_5`
- `purchase_intent_5`
- `price_perception`
- `supported_contradicted_unclear`

The current platform rating can remain the core public signal, but the research API should return a typed interpretation that agents can consume without scraping prose.

### 2. Audience targeting and quota rules

Market research cares who answered. Curyo verifies humanity, but the category needs privacy-preserving audience selection:

- Opt-in cohorts: founders, developers, designers, creators, students, parents, crypto users, frequent travelers, etc.
- Region and language cohorts where legally and ethically supported.
- Experience-based cohorts: "has voted in AI product questions," "has high accuracy in category X," "has opted into consumer research."
- Quotas: minimum N voters in cohort A, maximum share from cohort B, balanced sample where possible.
- Agent-visible eligibility estimates before payment.

Avoid raw demographic surveillance. Prefer self-declared, opt-in, credentialed, or behavior-derived cohorts with clear disclosure.

### 3. Study objects

Market research is rarely just one isolated question. Add a study abstraction that groups multiple questions under one brief:

```ts
curyo_research_create_study({
  title: "Landing page message test",
  researchGoal: "Find which promise resonates with early-stage founders",
  audience: { cohorts: ["founders", "saas-builders"], minRespondents: 50 },
  questions: [
    { template: "pairwise_choice", prompt: "Which headline is clearer?", options: ["A", "B"] },
    { template: "likert_5", prompt: "How credible does the offer feel?" },
    { template: "open_reason", prompt: "What would make you hesitate?" }
  ],
  budget: { maxUsdc: "250000000" },
  webhookUrl: "https://agent.example.com/curyo/results"
});
```

The study can compile several Curyo questions, each with its own bounty and round config, while giving agents one object to track.

### 4. Research result package

Agents need a result object that looks like research output, not only protocol state:

```ts
{
  studyId: "study_...",
  status: "complete",
  methodology: {
    source: "verified_human_curyo_panel",
    submittedBy: "ai_agent",
    voterIdentity: "voter_id_verified",
    stakeBacked: true,
    limitations: ["public panel", "opt-in voters", "not statistically representative"]
  },
  sample: {
    totalVoters: 73,
    revealedVoters: 69,
    cohorts: [{ id: "founders", count: 31 }, { id: "developers", count: 28 }]
  },
  answers: [
    {
      questionId: "42",
      answerType: "pairwise_choice",
      winner: "A",
      distribution: { A: 48, B: 18, unsure: 3 },
      confidence: 0.81,
      rationaleSummary: "Voters found A more specific and less hype-heavy."
    }
  ],
  exports: {
    jsonUrl: "...",
    csvUrl: "..."
  }
}
```

### 5. Webhooks and async callbacks

Agents should not need to poll constantly. Add callbacks for:

- `question.submitted`
- `question.settling`
- `question.settled`
- `question.failed`
- `study.completed`
- `study.partial_result`

Include signed webhook payloads and retry logs.

### 6. Confidential or embargoed research mode

Some research briefs include unreleased features, pricing, or positioning. Curyo's public auditability is a strength, but research customers may need:

- Private preview media for eligible voters only.
- Hashed or encrypted artifacts with delayed public reveal.
- Embargoed results until a settlement or timestamp.
- Public proof that a study happened without exposing all context immediately.

This should be designed carefully because it changes the openness of the current product.

### 7. Research quality and fraud controls

Curyo already has verified humans and stake. Market research needs additional quality metadata:

- Attention or comprehension checks for research-style studies.
- Minimum feedback length when rationale is required.
- Voter consistency and category accuracy reporting.
- Duplicate/coordinated-response detection.
- "Not enough context" as a first-class answer.
- Sample limitations in every result.

### 8. SDK and MCP surface for research

The current SDK focuses on hosted reads and vote helpers. Add a higher-level research/agent surface:

- `curyo.research.quoteStudy(...)`
- `curyo.research.askHumans(...)`
- `curyo.research.createStudy(...)`
- `curyo.research.getResult(...)`
- `curyo.research.exportResult(...)`

MCP tools:

- `curyo_research_list_templates`
- `curyo_research_quote_study`
- `curyo_research_create_study`
- `curyo_research_get_study_status`
- `curyo_research_get_result`
- `curyo_research_export`

## Suggested Implementation Order

### Phase 1: Agent research MVP

- Add typed templates to the MCP schema and x402 payload as optional research metadata.
- Add structured result interpretation for binary, single-choice, and pairwise questions.
- Add `webhookUrl` support.
- Add docs and examples for "synthetic research validation."
- Keep protocol changes minimal by storing research metadata off-chain and anchoring hashes.

### Phase 2: Audience and cohorts

- Add opt-in research cohorts to user profiles.
- Let agents specify cohort targets and minimum sample counts.
- Add quota-aware quote estimates.
- Add cohort counts to result payloads without exposing private personal data.

### Phase 3: Studies and exports

- Add study objects that group multiple paid asks.
- Add JSON and CSV exports.
- Add research reports with methodology, sample, answer distributions, feedback summary, and limitations.

### Phase 4: Confidential research

- Design private artifact access for eligible voters.
- Add embargoed public disclosure options.
- Add signed methodology receipts so the audit trail remains useful.

## Product Positioning

The best near-term message:

> AI agents can generate hypotheses instantly. Curyo checks them against real verified humans.

This avoids competing head-on with synthetic respondent vendors. It also uses Curyo's existing strengths: verified identity, stake-backed judgment, paid incentives, public auditability, and agent-accessible payment rails.

## Open Questions

- How representative should Curyo try to be, versus being explicit that it is an opt-in verified-human signal?
- Should research cohorts be self-declared, credentialed, behavior-derived, or all three?
- Should confidential market research be allowed if Curyo's default identity is public auditability?
- Should typed research answers influence the 0-100 rating, or remain a separate interpretation layer?
- How should Curyo price quality: more voters, better cohorts, feedback depth, faster settlement, or all of these?

