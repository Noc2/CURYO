# Curyo MCP Server

Official Curyo MCP server for indexed reads and optional hosted write flows. It exposes indexed Curyo content,
categories, profiles, voter-accuracy stats, and platform metrics through MCP tools, prompts, and resources backed by
the Ponder API, and it can optionally enable scoped write tools for hosted agents.

## Quick Start

```bash
# From the monorepo root:
yarn mcp:start
```

For remote MCP clients, run the Streamable HTTP transport:

```bash
# From the monorepo root:
yarn mcp:start:http
```

## Railway Deployment

This package includes a Railway-ready Docker build at `packages/mcp-server/Dockerfile`.

Recommended Railway service settings:

1. Deploy from the monorepo root so workspace dependencies resolve correctly.
2. Set the service to build with `packages/mcp-server/Dockerfile`.
3. Configure the healthcheck path as `/healthz` for process health, or `/readyz` if you want deploys gated on Ponder availability.
4. Attach a public domain and set `CURYO_MCP_PUBLIC_BASE_URL` to that HTTPS origin.

Minimum production variables:

```bash
CURYO_PONDER_URL=https://ponder.example.com
CURYO_MCP_PUBLIC_BASE_URL=https://mcp.example.com
CURYO_MCP_HTTP_CORS_ORIGIN=https://curyo.example.com
CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS=x-real-ip
CURYO_MCP_HTTP_AUTH_MODE=bearer
CURYO_MCP_HTTP_BEARER_TOKEN=replace-me
```

Notes:

- The Dockerfile automatically binds the MCP server to `0.0.0.0` and Railway's injected `PORT`.
- In `NODE_ENV=production`, startup validation rejects `localhost` values for `CURYO_PONDER_URL` and `CURYO_MCP_HTTP_CORS_ORIGIN`.
- In `NODE_ENV=production`, rate limiting also requires `CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS` to be set.
- For hosted wallet sessions, keep the MCP server's `CURYO_MCP_HTTP_SESSION_*` settings aligned with the Next.js issuer configuration.

## Scripts

| Command | Description |
|---|---|
| `yarn mcp:start` | Start the MCP server over local `stdio` |
| `yarn mcp:start:http` | Start the MCP server over Streamable HTTP |
| `yarn mcp:dev` | Run the MCP server in watch mode over `stdio` |
| `yarn mcp:dev:http` | Run the MCP server in watch mode over Streamable HTTP |
| `yarn mcp:test` | Run the MCP package test suite |
| `yarn mcp:check-types` | Run TypeScript type checking |
| `yarn mcp:build` | Build the package |

## Configuration

The server reads from the environment at startup.

| Variable | Default | Description |
|---|---|---|
| `CURYO_PONDER_URL` or `PONDER_URL` | `http://127.0.0.1:42069` | Base URL for the backing Ponder API |
| `CURYO_MCP_TRANSPORT` | `stdio` | MCP transport: `stdio` or `streamable-http` |
| `CURYO_MCP_PONDER_TIMEOUT_MS` | `10000` | Upstream request timeout in milliseconds |
| `CURYO_MCP_SERVER_NAME` | `curyo-readonly` | Advertised MCP server name |
| `CURYO_MCP_SERVER_VERSION` | package version | Advertised MCP server version |
| `CURYO_MCP_HTTP_HOST` | `127.0.0.1` | Bind host for Streamable HTTP mode |
| `CURYO_MCP_HTTP_PORT` | `3334` | Bind port for Streamable HTTP mode |
| `CURYO_MCP_HTTP_PATH` | `/mcp` | MCP HTTP endpoint path |
| `CURYO_MCP_PUBLIC_BASE_URL` | — | Optional public base URL used in startup logs when binding to wildcard hosts |
| `CURYO_MCP_HTTP_CORS_ORIGIN` | `http://localhost:3000` | CORS allow-origin header for Streamable HTTP mode |
| `CURYO_MCP_HTTP_AUTH_MODE` | `none` | HTTP auth mode: `none` or `bearer` |
| `CURYO_MCP_HTTP_BEARER_TOKEN` | — | Single bearer token for HTTP mode |
| `CURYO_MCP_HTTP_BEARER_TOKENS` | — | Comma-separated bearer tokens for rotation |
| `CURYO_MCP_HTTP_AUTH_REALM` | `curyo-mcp` | `WWW-Authenticate` realm |
| `CURYO_MCP_HTTP_AUTH_SCOPES` | `mcp:read` | Default scopes for legacy bearer tokens |
| `CURYO_MCP_HTTP_TOKENS_JSON` | — | JSON array of scoped bearer tokens, each optionally bound to a write identity |
| `CURYO_MCP_HTTP_SESSION_SECRET` | — | Shared HMAC secret used to verify wallet-bound MCP bearer sessions minted by Next.js |
| `CURYO_MCP_HTTP_SESSION_KEY_ID` | `nextjs-default` | Key id expected in wallet-bound MCP bearer session headers |
| `CURYO_MCP_HTTP_SESSION_ISSUER` | `curyo-nextjs` | Expected issuer claim for wallet-bound MCP bearer sessions |
| `CURYO_MCP_HTTP_SESSION_AUDIENCE` | `curyo-mcp` | Expected audience claim for wallet-bound MCP bearer sessions |
| `CURYO_MCP_HTTP_SESSION_SECRETS_JSON` | — | Optional JSON array of multiple verification keys for session rotation |
| `CURYO_MCP_HTTP_RATE_LIMIT_ENABLED` | `1` | Enable in-memory HTTP request rate limiting |
| `CURYO_MCP_HTTP_RATE_LIMIT_WINDOW_MS` | `60000` | Shared fixed window used for MCP HTTP rate limits |
| `CURYO_MCP_HTTP_RATE_LIMIT_READ_LIMIT` | `120` | Max read-oriented MCP HTTP requests per window |
| `CURYO_MCP_HTTP_RATE_LIMIT_WRITE_LIMIT` | `20` | Max write-capable MCP HTTP requests per window |
| `CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS` | — | Comma-separated proxy headers to trust for client IP extraction |
| `CURYO_MCP_WRITE_ENABLED` | `0` | Enable hosted write tools |
| `CURYO_MCP_WRITE_IDENTITIES` | — | JSON array of signer identities (`privateKey` or Foundry keystore credentials) |
| `CURYO_MCP_WRITE_DEFAULT_IDENTITY` | — | Optional stdio-only fallback identity for local development |
| `CURYO_MCP_RPC_URL` or `RPC_URL` | — | RPC endpoint used for write-capable tools |
| `CURYO_MCP_CHAIN_ID` or `CHAIN_ID` | — | Chain ID used for write-capable tools |
| `CURYO_MCP_CHAIN_NAME` | auto-derived | Optional human-readable chain label for write mode |
| `CURYO_MCP_MAX_GAS_PER_TX` | `2000000` | Per-transaction gas cap for hosted writes |
| `CURYO_MCP_WRITE_MAX_VOTE_STAKE` | — | Optional protocol-side cap for hosted `vote` stake amounts |
| `CURYO_MCP_WRITE_SUBMISSION_HOST_ALLOWLIST` | — | Optional CSV allowlist for `submit_content` URL hostnames |
| `CURYO_MCP_WRITE_SUBMISSION_REVEAL_POLL_MS` | `500` | Poll interval while waiting for `submit_content` reveal readiness |
| `CURYO_MCP_WRITE_SUBMISSION_REVEAL_TIMEOUT_MS` | `30000` | Timeout while waiting for `submit_content` reveal readiness |
| `CURYO_MCP_CREP_TOKEN_ADDRESS` | auto-derived on supported chains | Fallback cREP token address for write mode |
| `CURYO_MCP_CONTENT_REGISTRY_ADDRESS` | auto-derived on supported chains | Fallback ContentRegistry address for write mode |
| `CURYO_MCP_VOTING_ENGINE_ADDRESS` | auto-derived on supported chains | Fallback RoundVotingEngine address for write mode |
| `CURYO_MCP_VOTER_ID_NFT_ADDRESS` | auto-derived on supported chains | Fallback VoterIdNFT address for write mode |
| `CURYO_MCP_ROUND_REWARD_DISTRIBUTOR_ADDRESS` | auto-derived on supported chains | Fallback RoundRewardDistributor address for write mode |
| `CURYO_MCP_FRONTEND_REGISTRY_ADDRESS` | auto-derived on supported chains | Fallback FrontendRegistry address for write mode |
| `CURYO_MCP_LOG_ENABLED` | enabled | Set to `0` to suppress stderr JSON logs |

Example remote setup:

```bash
CURYO_PONDER_URL=https://ponder.example.com
CURYO_MCP_TRANSPORT=streamable-http
CURYO_MCP_HTTP_HOST=0.0.0.0
CURYO_MCP_HTTP_PORT=3334
CURYO_MCP_HTTP_PATH=/mcp
CURYO_MCP_PUBLIC_BASE_URL=https://mcp.example.com
CURYO_MCP_HTTP_AUTH_MODE=bearer
CURYO_MCP_HTTP_TOKENS_JSON='[{"token":"replace-me","clientId":"claude-prod","scopes":["mcp:read","mcp:write:vote","mcp:write:submit_content"],"identityId":"curyo-writer","kind":"session","expiresAt":"2030-01-01T00:00:00.000Z","subject":"0x1234..."}]'
CURYO_MCP_HTTP_SESSION_SECRET=nextjs-session-secret
CURYO_MCP_HTTP_SESSION_KEY_ID=nextjs-prod
CURYO_MCP_HTTP_SESSION_ISSUER=curyo-nextjs
CURYO_MCP_HTTP_SESSION_AUDIENCE=curyo-mcp
CURYO_MCP_HTTP_RATE_LIMIT_READ_LIMIT=120
CURYO_MCP_HTTP_RATE_LIMIT_WRITE_LIMIT=20
CURYO_MCP_WRITE_ENABLED=1
CURYO_MCP_RPC_URL=https://forno.celo.org
CURYO_MCP_CHAIN_ID=42220
CURYO_MCP_WRITE_IDENTITIES='[{"id":"curyo-writer","privateKey":"0x...","frontendAddress":"0x7777777777777777777777777777777777777777"}]'
CURYO_MCP_WRITE_MAX_VOTE_STAKE=5000000000000000000
CURYO_MCP_WRITE_SUBMISSION_HOST_ALLOWLIST=curyo.xyz,github.com
```

## Transport Behavior

In Streamable HTTP mode:

- MCP traffic is served on `CURYO_MCP_HTTP_PATH`
- liveness is exposed on `/healthz`
- readiness is exposed on `/readyz`
- Prometheus-style metrics are exposed on `/metrics`
- bearer auth protects the MCP path when `CURYO_MCP_HTTP_AUTH_MODE=bearer`
- expiring/session tokens can be modeled through `CURYO_MCP_HTTP_TOKENS_JSON`
- HTTP rate limits apply before MCP requests reach the transport
- request logs are emitted as JSON to stderr unless disabled
- scoped write tools remain inaccessible unless the caller has a token with the matching write scope
- successful and failed hosted write tools emit structured audit events with action, account, chain, and duration

`/readyz` performs a bounded `get_stats` call against the configured Ponder API, so it reflects upstream availability
rather than only process liveness.

## Hosted Client Config

The Next.js app exposes a canonical hosted-config JSON at `/api/mcp/config`. It is intended to be the single source of
truth for the public endpoint URL, health/readiness URLs, metrics URL, docs URL, and wallet-session settings.

Example response shape:

```json
{
  "serverName": "curyo-readonly",
  "endpointUrl": "https://mcp.curyo.xyz/mcp",
  "healthUrl": "https://mcp.curyo.xyz/healthz",
  "readinessUrl": "https://mcp.curyo.xyz/readyz",
  "metricsUrl": "https://mcp.curyo.xyz/metrics",
  "docsUrl": "https://curyo.xyz/docs/ai",
  "auth": {
    "walletSessions": {
      "challengeUrl": "https://curyo.xyz/api/mcp/session/challenge",
      "tokenUrl": "https://curyo.xyz/api/mcp/session/token"
    }
  }
}
```

## Wallet-Bound Session Issuance

The Next.js app can now mint short-lived wallet-bound MCP bearer sessions for hosted writes. The high-level flow is:

1. Call `/api/mcp/session/challenge` with a wallet address, requested scopes, and an optional client name.
2. Sign the returned message with that wallet.
3. Exchange the signature at `/api/mcp/session/token`.
4. Send the returned bearer token to the hosted MCP endpoint.

The Next.js app decides which wallets may receive which scopes through `CURYO_MCP_SESSION_WALLET_BINDINGS`. The MCP
server only verifies the resulting bearer tokens, so its `CURYO_MCP_HTTP_SESSION_*` values must match the issuer’s
session-signing configuration.

## Client Examples

Claude Desktop:

```json
{
  "mcpServers": {
    "curyo": {
      "transport": {
        "type": "streamable_http",
        "url": "https://mcp.curyo.xyz/mcp",
        "headers": {
          "Authorization": "Bearer ${CURYO_MCP_TOKEN}"
        }
      }
    }
  }
}
```

Cursor / editor MCP clients:

```json
{
  "name": "curyo",
  "transport": {
    "type": "streamable_http",
    "url": "https://mcp.curyo.xyz/mcp",
    "headers": {
      "Authorization": "Bearer ${CURYO_MCP_TOKEN}"
    }
  }
}
```

## MCP Surface

### Tools

- `search_content`: browse indexed Curyo content by status, category, sort order, and pagination
- `get_content`: fetch a single content item with recent rounds and rating history
- `get_content_by_url`: look up a content item by URL
- `get_categories`: list approved content categories
- `get_profile`: fetch a profile with recent activity
- `get_voter_accuracy`: inspect historical voter win/loss and category-level accuracy
- `get_stats`: fetch global platform statistics
- `search_votes`: inspect recent vote activity with conservative pagination caps

Optional hosted write tools:

- `vote`: commit a tlock vote with a scoped authenticated identity and the redeployed drand metadata bindings
- `submit_content`: reserve and reveal a submission through `ContentRegistry`
- `claim_reward`: claim voter, submitter, participation, or cancelled-round refund rewards
- `claim_frontend_fee`: claim round frontend fees and optionally withdraw accumulated registry credits

### Resources

- `curyo://about`
- `curyo://status`
- `curyo://categories`
- `curyo://schema/tools`

### Prompts

- `rank_candidate_sources`
- `inspect_source_trust_profile`
- `summarize_content_history`

## Security Model

Read mode remains indexer-backed and side-effect free. When write mode is enabled, the server still stays narrowly
scoped:

- no arbitrary contract calls
- no generic calldata passthrough
- no arbitrary URL fetching
- no write tools without explicit bearer scopes
- no write execution without a bound signer identity
- only `vote`, `submit_content`, `claim_reward`, and `claim_frontend_fee` are exposed

## Project Structure

```text
src/
├── index.ts            # Entry point
├── config.ts           # Environment parsing and defaults
├── server.ts           # MCP tool registration
├── http.ts             # Streamable HTTP transport and health endpoints
├── auth.ts             # Optional bearer auth for HTTP mode
├── signer-service.ts   # Hosted signer/runtime for narrow write tools
├── prompts.ts          # MCP prompt catalog
├── resources.ts        # MCP resource registration and tool schema docs
├── write-tools.ts      # Scoped MCP write tool registration
├── clients/
│   └── ponder.ts       # Ponder API client
├── lib/
│   ├── filters.ts      # Shared enum/filter definitions
│   ├── logging.ts      # Structured logging helpers
│   └── results.ts      # Response envelope helpers
└── __tests__/          # Package tests
```

## Upstream Dependencies

Primary upstream:

- the Ponder API in `packages/ponder/src/api/index.ts`

Read tools prefer indexed Ponder data. Hosted write tools are opt-in, authenticated, and routed through explicit signer
identities rather than ad hoc wallet state.
