# Curyo AI Agent Adoption Plan

Date: March 6, 2026

Point-in-time note: this document reflects repo state on March 6, 2026. The official read-only MCP server has since been added under `packages/mcp-server`.

## Executive Summary

Curyo is already directionally well-positioned for the AI era: it has a public quality signal, sybil resistance, economic commitment behind ratings, an indexer/API, and an existing bot implementation. The gap is not thesis. The gap is packaging and distribution.

If you want systems like OpenClaw to use Curyo, the fastest path is to make Curyo easy for agents to discover, easy to call, and safe to trust:

1. Position Curyo first as a read-heavy reputation and ranking primitive for AI systems, not primarily as a place where generic agents go on-chain and risk capital.
2. Ship agent-native interfaces where builders already look: remote MCP, OpenAPI, dataset snapshots, and agent-facing docs.
3. Publish official integrations into the ecosystems that currently dominate tool discovery: Anthropic/Claude MCP, OpenAI remote MCP and Apps, GitHub MCP Registry, OpenClaw skills, LangChain, Google ADK, and AI SDK examples.
4. Run outreach as integration distribution, not only brand marketing. In the AI market, the winning motion is "become a default tool in example repos, registries, and eval pipelines."

The practical goal should be: when an agent builder wants a quality/reputation signal for public web content, Curyo should be one of the first tools they can install.

## What The Research Suggests About AI Distribution Right Now

The current agent ecosystem is converging on a few clear distribution surfaces:

- MCP is becoming the default interoperability layer for tools and data sources across Anthropic, OpenAI, GitHub Copilot, Google ADK, LangChain, and other agent frameworks.
- Registries and marketplaces matter because agent builders now discover tools the way developers discover packages: through searchable catalogs, examples, and copy-paste install flows.
- Skills and agent-specific instruction files matter because models and agent runtimes increasingly consume machine-oriented guidance directly.
- Datasets and eval artifacts matter because AI builders do not only want a UI integration; they also want reusable training, ranking, retrieval, and benchmarking inputs.

This changes outreach. Traditional outbound still matters, but the new distribution stack looks more like this:

1. Publish a machine-usable interface.
2. Get listed in the registries and directories where agents and agent builders browse.
3. Publish examples and benchmarks that prove usefulness in a narrow workflow.
4. Then do partner outreach to turn that proof into recurring usage.

## What Curyo Already Has

From the current codebase, Curyo already has several assets that are valuable to AI builders:

- Public, exportable ratings and round history.
- A Ponder-backed API with structured content, rounds, votes, stats, and voter accuracy.
- A documented AI agent integration guide.
- A working bot package with pluggable strategies.
- A credible thesis around stake-backed human quality signals and sybil resistance.

Those are strong raw materials. The friction is that the current AI entrypoint is still builder-heavy:

- Agents are told to self-host Ponder for serious use.
- There is no official remote MCP server.
- There is no published OpenAPI-first or schema-first AI package.
- There is no official OpenClaw skill, GitHub MCP Registry listing, or similar discovery surface.
- There is no curated dataset product for retrieval, ranking, or eval pipelines.

## Strategic Positioning

The most attractive framing for AI is:

"Curyo is a verifiable reputation layer for public content that AI systems can use to rank, filter, and weight information."

That framing is better than "AI agents can gamble on content" for three reasons:

- It makes the first integration read-only, which is much easier for teams to adopt.
- It maps directly to current AI pain points: ranking sources, filtering low-quality content, improving retrieval, weighting evaluation corpora, and building trust layers.
- It lets Curyo sell the strongest property it has: public, economically-backed, human-origin quality signals.

The write path still matters, but it should come later and be aimed at specialized operators, funds, or purpose-built autonomous strategies, not as the first integration target for general agents.

## Product Plan: Make Curyo Agent-Native

### 1. Ship An Official Read-Only MCP Server First

This should be the top priority.

Expose a narrow, reliable tool surface backed by the Ponder API and on-chain data:

- `search_content`
- `get_content_score`
- `get_round_history`
- `get_source_or_submitter_profile`
- `get_voter_accuracy`
- `top_content_by_category`
- `explain_rating`
- `get_recent_rating_changes`

Design principles:

- Read-only by default.
- Stable JSON schemas.
- Fast responses and cached summaries.
- Short, model-friendly descriptions and examples.
- Explicit provenance fields so downstream systems can see where each answer came from.

Why this matters:

- Anthropic, OpenAI, GitHub Copilot, Google ADK, LangChain, and AI SDK ecosystems are all moving toward MCP-compatible tools.
- It turns Curyo from "interesting protocol" into "installable capability."

### 2. Publish An Official OpenClaw Skill

For OpenClaw specifically, the most direct route is an official skill package that wraps the read-only Curyo MCP or API.

The first OpenClaw skill should help with:

- ranking sources before retrieval
- checking whether a URL or content item has a strong or weak Curyo score
- finding high-rated items in a category
- explaining why a source is considered high or low quality

Why this should come before write support:

- It matches the likely initial OpenClaw use case: browsing, retrieval, ranking, and tool orchestration.
- It avoids security, approval, and wallet-management friction.
- It gives you a clean case study for adoption.

Only after the read skill has traction should you add transaction-capable tools such as submission, voting, and rewards claiming. Those write tools should be approval-gated, budget-limited, and disabled by default.

### 3. Productize The Data Layer

Make Curyo usable as a dataset product, not only a live API.

Ship:

- periodic dataset snapshots
- a latest rolling export
- clear schema docs
- category metadata
- quality/confidence fields
- provenance and timestamps
- dataset cards

Best distribution target: Hugging Face datasets, plus direct downloadable exports from a Curyo docs page.

This opens three adoption paths:

- RAG and search ranking
- training-data filtering and weighting
- eval and benchmark construction

### 4. Add A "Curyo For Agents" Landing Surface

Create a concise landing page and docs bundle specifically for AI builders. The current repo already has AI pages, but the next version should be more operational.

It should contain:

- a one-paragraph value proposition
- a copy-paste MCP install flow
- OpenClaw setup instructions
- example prompts
- sample ranking workflows
- API schema links
- dataset links
- latency, rate-limit, and uptime expectations
- security notes for any write-capable actions

This page should be optimized for both humans and models:

- concise markdown
- clear headings
- explicit tool names
- concrete examples
- no marketing fluff

### 5. Treat AGENTS.md As Distribution, Not Just Repo Hygiene

The repo already includes `AGENTS.md`. Expand that idea outward.

Add agent-facing instruction assets that tell models:

- what Curyo is useful for
- when to call it
- when not to call it
- which tool returns which signal
- how to interpret score confidence and provenance

The best version of this is not a huge manifesto. It is a short operational map for agent runtimes and tool builders.

### 6. Delay The Hardest Product Until You Have Pull

Do not lead with full autonomous on-chain voting for generic agents.

It is the highest-friction path because it requires:

- wallet setup
- staking logic
- gas
- key management
- approval UX
- risk controls
- support for mistakes and losses

Instead, sequence the product:

1. Read-only quality oracle for agents.
2. Dataset and benchmark product.
3. Managed write tools for advanced partners.
4. Full autonomous strategy support only after there is clear demand.

## Outreach In The Age Of AI

The old playbook was:

- write threads
- pitch press
- do founder networking
- ask for intros

The new playbook for a product like Curyo is:

- publish interfaces agents can use directly
- get into tool registries and skill directories
- show up in framework examples and starter repos
- produce benchmark evidence
- then run focused partner outreach

For Curyo, outreach should have three lanes.

### Lane 1: Machine Discoverability

This is the new equivalent of SEO for AI.

Actions:

- publish the official MCP server
- list it in MCP Registry and GitHub MCP Registry
- publish the official OpenClaw skill
- make install commands copy-paste simple
- keep docs in concise markdown that models parse cleanly
- maintain stable schemas and examples

Success condition:

An engineer can discover Curyo while searching registries for ranking, reputation, retrieval, trust, or quality tools.

### Lane 2: Builder Distribution

This is the equivalent of developer relations.

Targets:

- Anthropic/Claude ecosystem
- OpenAI Apps and remote MCP users
- OpenClaw community
- LangChain developers
- Google ADK users
- AI SDK / Vercel ecosystem
- GitHub Copilot power users

Actions:

- publish official example repos
- publish starter templates for at least Claude, OpenClaw, LangChain, and ADK
- sponsor or run small hackathons around trusted retrieval and ranking
- offer office-hours support to early integrators
- write integration tutorials with narrow use cases

The key point is to pitch workflows, not abstractions.

Good workflow-level messages:

- "Use Curyo to re-rank web search results before passing them to the model."
- "Use Curyo to filter low-quality sources in RAG."
- "Use Curyo scores to weight eval corpora."
- "Use Curyo to decide which user-submitted links an agent should trust."

### Lane 3: Direct Partner Outreach

This is where human business development still matters.

Priority targets:

- agent browsers and research assistants
- RAG infrastructure teams
- AI eval and benchmarking teams
- dataset curators
- open-source agent projects
- trust and safety teams building source ranking layers

The right pitch is not "please integrate our token protocol."

The right pitch is:

"We already maintain a public, stake-backed quality signal for content. We can give your system a fast trust prior for ranking and filtering public sources."

That is much easier for a partner to act on.

## OpenClaw-Specific Plan

If the goal is "things like OpenClaw start using Curyo," the recommended path is:

### Phase 1: Read Utility

Ship an official OpenClaw skill called something like `curyo-trust` or `curyo-quality`.

Core functions:

- score a URL
- retrieve a content item by URL or Curyo ID
- get recent rating history
- find top-rated items by category
- explain whether a source is trusted, disputed, or low-signal

Deliverables:

- public skill repo
- install instructions
- example tasks
- 2-3 demo videos or gifs
- one benchmark or case study

### Phase 2: Workflow Proof

Build and publish one concrete OpenClaw workflow:

"OpenClaw research mode with Curyo re-ranking."

Flow:

1. OpenClaw gathers candidate sources.
2. Curyo scores or filters them.
3. OpenClaw prefers higher-quality sources for synthesis.
4. The final answer cites both source content and Curyo trust signals.

This gives people a reason to install the skill immediately.

### Phase 3: Controlled Write Actions

Only after the read workflow is established:

- allow content submission
- allow human-approved voting
- allow claiming rewards

Guardrails:

- explicit approval for every on-chain action at first
- per-session spend caps
- allowlists for supported actions
- dry-run previews
- human-readable transaction summaries

## 30 / 60 / 90 Day Roadmap

### First 30 Days

- Build the official read-only Curyo MCP server.
- Define 6-8 stable tools with clear schemas.
- Publish an agent-focused landing page.
- Publish a first dataset snapshot and schema docs.
- Create an official OpenClaw skill that uses the read surface.
- Submit to MCP Registry and GitHub MCP Registry.

### Days 31-60

- Publish Claude, OpenClaw, LangChain, and Google ADK examples.
- Produce one benchmark or case study around re-ranking or source filtering.
- Start targeted outreach to 20-30 agent, RAG, and eval teams.
- Add usage analytics for installs, calls, and most-used tools.
- Tighten latency, caching, and uptime on the read path.

### Days 61-90

- Add explanation/confidence tooling.
- Add partner-facing SLAs or hosted access tiers if demand exists.
- Pilot controlled write actions with 1-3 design partners.
- Package recurring exports for dataset and eval consumers.
- Turn the strongest integration into a public case study.

## KPI Framework

Track both distribution and utility.

Distribution KPIs:

- MCP installs
- OpenClaw skill installs
- registry page views
- GitHub stars/forks on integration repos
- docs conversion from landing page to install

Usage KPIs:

- weekly active agent clients
- MCP/API calls per week
- dataset downloads
- repeat usage by workspace or project
- median latency and success rate

Outcome KPIs:

- number of partner products shipping Curyo-backed ranking
- number of cited benchmark/eval uses
- percentage of AI traffic coming through machine interfaces rather than only the human UI

## Risks And Constraints

- If Curyo stays self-host-first for serious usage, adoption will be slower. Many teams will not run their own indexer until after they already see value.
- If the first agent integration is transactional, conversion will be poor because the trust, approval, and wallet burden is too high.
- If schemas and docs are unstable, agents will fail silently and builders will churn.
- If messaging stays too crypto-native, non-crypto AI teams will ignore the product even if the underlying signal is useful.

## Recommended Immediate Moves

If resources are limited, the highest-leverage order is:

1. Hosted read-only MCP server.
2. Official OpenClaw skill.
3. Dataset snapshots on Hugging Face.
4. Agent-focused landing page and examples.
5. Direct outreach to a short list of agent, RAG, and eval teams with a working demo.

That sequence gives Curyo the best shot at becoming an AI-native reputation primitive rather than just an interesting protocol with a good thesis.

## Sources

- Anthropic MCP docs: https://docs.anthropic.com/en/docs/agents-and-tools/mcp
- Anthropic, "Building effective agents": https://www.anthropic.com/engineering/building-effective-agents
- OpenAI, "New tools and features in the Responses API": https://openai.com/index/new-tools-and-features-in-the-responses-api/
- OpenAI, "How to make your repository agent-friendly": https://openai.com/index/agents-md/
- MCP Registry: https://registry.modelcontextprotocol.io/about
- OpenClaw, "Introducing skills": https://docs.openclaw.ai/blog/introducing-skills
- OpenClaw, "Search for and install skills": https://docs.openclaw.ai/core-concepts/skills/search-and-install-skills
- Google Agent Development Kit, MCP tools: https://google.github.io/adk-docs/tools/mcp-tools/
- LangChain JS, MCP adapters: https://js.langchain.com/docs/integrations/tools/mcp_adapters/
- Hugging Face dataset cards: https://huggingface.co/docs/hub/datasets-cards
