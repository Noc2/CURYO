# Curyo MCP Server Plan

Date: March 6, 2026

## Purpose

This package is the planned home for the official read-only Curyo MCP server.

The goal is to make Curyo's public reputation data easy for agents to consume through MCP without requiring them to understand the full monorepo, self-host Ponder first, or interact with wallets and on-chain write flows.

## Why This Should Be A Separate Package

The MCP server should live outside `packages/ponder` and `packages/nextjs`.

Reasons:

- `packages/ponder` is the indexed data source, not the agent-facing protocol adapter.
- `packages/nextjs` is the product UI and site, not the canonical integration surface for agents.
- An MCP package will need its own release cadence, runtime, transport support, tests, observability, and registry/distribution workflow.
- Keeping it separate makes it easier to publish, host, benchmark, and iterate without coupling agent integrations to frontend or indexer internals.

Recommended package path:

- `packages/mcp-server/`

## Product Goal

Make Curyo installable as a read-only quality and reputation tool for agent systems.

The first version should optimize for:

- retrieval and ranking workflows
- source trust checks
- content exploration
- historical score inspection
- easy installation in local and hosted MCP clients

It should not optimize for:

- wallet actions
- content submission
- voting
- reward claiming
- arbitrary web fetching
- generalized search outside Curyo data

## Success Criteria

The v1 MCP server is successful if:

- an agent builder can install it in under 10 minutes
- the core tools are read-only and deterministic
- tool outputs are small, structured, and provenance-rich
- it works both locally and as a hosted remote MCP endpoint
- OpenClaw, Claude, ChatGPT, and other MCP-capable clients can use it without custom glue code

## Recommended V1 Architecture

### Runtime

- TypeScript on Node.js
- official TypeScript MCP SDK
- one binary/package with two transports:
  - `stdio` for local installs
  - Streamable HTTP for hosted remote installs

### Upstream Data Sources

Primary upstream:

- Ponder API in `packages/ponder/src/api/index.ts`

Secondary upstream, only if explicitly needed:

- direct read-only RPC calls via `viem`

Default rule:

- prefer Ponder for all indexed/historical queries
- only use direct RPC for narrow freshness or liveness checks
- never mix sources silently; always expose provenance in the response

### Internal Modules

Recommended future layout:

```text
packages/mcp-server/
├── package.json
├── README.md
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── server.ts
│   ├── transports/
│   │   ├── stdio.ts
│   │   └── http.ts
│   ├── clients/
│   │   ├── ponder.ts
│   │   └── rpc.ts
│   ├── tools/
│   │   ├── searchContent.ts
│   │   ├── getContent.ts
│   │   ├── getContentRounds.ts
│   │   ├── getProfile.ts
│   │   ├── getVoterAccuracy.ts
│   │   ├── getGlobalStats.ts
│   │   └── getRecentVotes.ts
│   ├── resources/
│   │   ├── categories.ts
│   │   ├── schemaDocs.ts
│   │   └── status.ts
│   ├── schemas/
│   │   ├── inputs.ts
│   │   └── outputs.ts
│   └── lib/
│       ├── cache.ts
│       ├── errors.ts
│       ├── logging.ts
│       └── provenance.ts
└── test/
```

## Recommended V1 MCP Surface

Keep v1 small. The first release should expose only high-confidence tools that map cleanly to the existing indexed data.

### Tools

1. `search_content`
   - Purpose: browse Curyo content with filters.
   - Inputs: `status`, `categoryId`, `sortBy`, `limit`, `offset`.
   - Upstream: `GET /content`
   - Notes: this is the main discovery tool.

2. `get_content`
   - Purpose: fetch a single content item and recent rounds.
   - Inputs: `contentId`
   - Upstream: `GET /content/:id`
   - Notes: include current rating, vote counts, category, and recent round summaries.

3. `get_categories`
   - Purpose: list available categories.
   - Inputs: none
   - Upstream: `GET /categories`
   - Notes: useful for agent planning and filter discovery.

4. `get_profile`
   - Purpose: fetch a submitter or voter profile.
   - Inputs: `address`
   - Upstream: `GET /profile/:address`
   - Notes: should return profile metadata plus high-level reputation fields when available.

5. `get_voter_accuracy`
   - Purpose: inspect a voter's historical performance.
   - Inputs: `address`
   - Upstream: `GET /voter-accuracy/:address`
   - Notes: important for trust and meta-analysis workflows.

6. `get_stats`
   - Purpose: fetch platform-wide metrics.
   - Inputs: none
   - Upstream: `GET /stats`
   - Notes: useful for dashboards, agent context, and quick health checks.

7. `search_votes`
   - Purpose: inspect recent or filtered vote activity.
   - Inputs: `voter`, `contentId`, `roundId`, `revealed`, `limit`, `offset`
   - Upstream: `GET /votes`
   - Notes: keep defaults conservative to avoid oversized outputs.

### Resources

Use MCP resources for stable, low-churn data and documentation-like content.

Recommended resources:

- `curyo://categories`
- `curyo://status`
- `curyo://schema/tools`
- `curyo://about`

### Prompts

Do not lead with MCP prompts in v1. Add them only after the tools are stable.

Possible phase-2 prompts:

- "Rank candidate sources with Curyo"
- "Inspect a source's trust profile"
- "Summarize the history of a content item"

## Upstream API Gaps To Close Before Or During Implementation

The current Ponder API already covers most of the v1 surface, but there are a few important gaps.

### Gap 1: URL Lookup

AI workflows usually start with a URL, not a numeric Curyo content ID.

Recommended addition in Ponder:

- `GET /content/by-url?url=...`

Alternative:

- `GET /content/by-hash?contentHash=...`

Without this, the MCP server will be awkward for "check this source" workflows.

### Gap 2: Stronger Search Semantics

`GET /content` is filterable, but it is not yet a true lookup/search endpoint.

Recommended additions:

- exact URL lookup
- optional substring search over URL and tags
- category + rating threshold filters

### Gap 3: MCP-Friendly Summaries

Some current API responses are UI-friendly but not yet optimized for token-efficient agent use.

Recommended server-side normalization in the MCP layer:

- compress repeated fields
- include human-readable enums
- return capped round and vote slices
- attach explicit provenance and freshness metadata

## Response Design Rules

Every tool response should follow the same shape:

- `data`: the primary result payload
- `provenance`: source system, endpoint, network, and retrieval timestamp
- `freshness`: whether the data came from Ponder only or included direct RPC reads
- `warnings`: partial data, pagination caps, stale upstream state, or filtered results

Rules:

- return JSON only
- avoid large blobs of prose
- keep defaults small
- cap page sizes strictly
- prefer explicit enums over magic integers
- stringify large integers consistently

## Security Model

This server must stay strictly read-only.

Hard boundaries:

- no wallet integration
- no signing
- no transaction simulation
- no arbitrary URL fetching
- no passthrough proxying to untrusted endpoints
- no raw SQL-like query tool
- no secrets returned to clients

Operational safeguards:

- strict input validation on every tool
- allowlist only the intended upstream Curyo services
- rate limiting on hosted HTTP transport
- output size caps
- timeout budgets on all upstream requests
- clear error types for upstream unavailable vs invalid input

## Caching And Performance

Read-only MCP usage will often be bursty.

Recommended defaults:

- in-memory TTL cache for hot reads
- cache key = tool name + normalized input
- short TTL for changing endpoints like `search_votes`
- slightly longer TTL for categories and stats
- request deduplication for concurrent identical lookups

Do not cache in a way that hides provenance or freshness.

## Deployment Plan

### Local

Support `stdio` transport so developers can install the MCP server directly from the repo or from a published package.

### Hosted

Support Streamable HTTP for:

- OpenAI remote MCP usage
- hosted Claude-compatible installs
- OpenClaw skill backends
- shared team deployments

Hosted requirements:

- health endpoint
- structured logs
- latency metrics
- auth hook for future API key support
- optional read-only public mode for low-risk discovery

## Testing Plan

The MCP package should have its own tests independent of Next.js and Ponder UI tests.

### Unit Tests

- tool input validation
- response normalization
- enum/value mapping
- error translation
- provenance tagging

### Integration Tests

- against a mocked Ponder API
- against a local real Ponder instance for smoke coverage
- stdio transport handshake
- HTTP transport handshake

### Contract Tests

- freeze example tool responses
- ensure schema stability across releases

## Rollout Plan

### Phase 0: Design And Prerequisites

- finalize v1 tool list
- add missing Ponder lookup endpoints
- define canonical response shapes
- decide hosted vs self-host defaults

### Phase 1: Local MVP

- implement stdio server
- implement core tools against Ponder
- add unit tests and smoke tests
- validate with Claude Desktop / local MCP client

### Phase 2: Hosted Remote MCP

- add Streamable HTTP transport
- add caching, metrics, and rate limiting
- deploy a public beta endpoint
- validate with OpenClaw and remote MCP clients

### Phase 3: Distribution

- publish install docs
- submit to MCP Registry
- submit to GitHub MCP Registry
- wrap as an official OpenClaw skill
- publish example workflows and case studies

## Recommended First Build Sequence

If implementation starts now, the order should be:

1. Add `GET /content/by-url` to Ponder.
2. Implement `search_content`, `get_content`, `get_categories`, `get_profile`, `get_voter_accuracy`, and `get_stats`.
3. Ship a local `stdio` MVP.
4. Add hosted HTTP transport.
5. Publish the official OpenClaw skill on top of the hosted read-only MCP server.

That sequence keeps the project useful early and avoids getting stuck on the hardest distribution and hosting work before the core tools are proven.

## Sources

- Anthropic MCP docs: https://docs.anthropic.com/en/docs/agents-and-tools/mcp
- MCP server concepts: https://modelcontextprotocol.io/docs/learn/server-concepts
- MCP JavaScript SDK repo: https://github.com/modelcontextprotocol/typescript-sdk
- OpenAI, "New tools and features in the Responses API": https://openai.com/index/new-tools-and-features-in-the-responses-api/
- MCP Registry: https://registry.modelcontextprotocol.io/about
