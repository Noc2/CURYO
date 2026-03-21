# Curyo MCP Server

Official read-only MCP server for Curyo data. It exposes indexed Curyo content, categories, profiles, voter-accuracy
stats, and platform metrics through MCP tools, prompts, and resources backed by the Ponder API.

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
| `CURYO_MCP_HTTP_AUTH_SCOPES` | `mcp:read` | Comma-separated scopes attached to validated tokens |
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
CURYO_MCP_HTTP_BEARER_TOKEN=replace-me
```

## Transport Behavior

In Streamable HTTP mode:

- MCP traffic is served on `CURYO_MCP_HTTP_PATH`
- liveness is exposed on `/healthz`
- readiness is exposed on `/readyz`
- bearer auth protects the MCP path when `CURYO_MCP_HTTP_AUTH_MODE=bearer`
- request logs are emitted as JSON to stderr unless disabled

`/readyz` performs a bounded `get_stats` call against the configured Ponder API, so it reflects upstream availability
rather than only process liveness.

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

All tools are read-only and backed by the Ponder API.

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

This server is intentionally read-only.

- no wallet integration
- no signing or transaction submission
- no arbitrary URL fetching
- no passthrough proxying to untrusted endpoints
- no write-capable tools

## Project Structure

```text
src/
├── index.ts            # Entry point
├── config.ts           # Environment parsing and defaults
├── server.ts           # MCP tool registration
├── http.ts             # Streamable HTTP transport and health endpoints
├── auth.ts             # Optional bearer auth for HTTP mode
├── prompts.ts          # MCP prompt catalog
├── resources.ts        # MCP resource registration and tool schema docs
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

The MCP server prefers indexed Ponder data for all current tools. It does not silently mix in write flows or wallet
actions.
