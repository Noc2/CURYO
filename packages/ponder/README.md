# Curyo — Ponder (Indexer & API)

On-chain event indexer built with [Ponder](https://ponder.sh/). Listens to smart contract events, stores processed data, and exposes a REST API on port 42069 for consumption by the frontend and bot.

## Quick Start

```bash
# From the monorepo root:
cp packages/ponder/.env.example packages/ponder/.env.local
# Edit packages/ponder/.env.local with your RPC URL and network selection

yarn ponder:dev     # Development mode with file watching + auto-recovery, terminal UI disabled
yarn ponder:start   # Production mode (no file watching)
yarn ponder:codegen # Regenerate TypeScript types from schema
```

Requires a running chain (local via `yarn chain` or a configured testnet RPC).

## Scripts

| Command | Description |
|---|---|
| `yarn ponder:dev` | Development mode with crash recovery and terminal UI disabled |
| `yarn ponder:start` | Production mode |
| `yarn ponder:codegen` | Generate types from `ponder.schema.ts` |

Within the package directory, additional scripts are available:

| Command | Description |
|---|---|
| `yarn dev:raw` | Development mode without recovery wrapper, terminal UI disabled |
| `yarn dev:ui` | Development mode with Ponder's live terminal UI enabled |
| `yarn serve` | Run API only (no indexing) |

## Configuration

| Variable | Description |
|---|---|
| `PONDER_NETWORK` | Active network: `hardhat`, `celoSepolia`, or `celo` |
| `PONDER_RPC_URL_31337` | RPC URL for local Hardhat/Anvil chain |
| `PONDER_RPC_URL_11142220` | RPC URL for Celo Sepolia |
| `PONDER_RPC_URL_42220` | RPC URL for Celo mainnet |
| `PONDER_CONTENT_REGISTRY_ADDRESS` etc. | Optional fallback addresses when the active chain has no shared deployment in `@curyo/contracts` |
| `PONDER_CONTENT_REGISTRY_START_BLOCK` etc. | Optional fallback start blocks when the active chain has no shared deployment metadata |
| `CORS_ORIGIN` | Allowed origins (comma-separated; required in production) |
| `RATE_LIMIT_TRUSTED_IP_HEADERS` | Comma-separated proxy IP headers to trust for API rate limiting in production |

For supported chains, Ponder treats `@curyo/contracts` as the source of truth and ignores stale address/start-block env values.
After `yarn deploy`, the Foundry deployment script refreshes `packages/ponder/.env.local` to match the deployment
target. Local deploys set `PONDER_NETWORK=hardhat`; live deploys such as
`yarn deploy --network celoSepolia --keystore <name>` set the matching live network.

## Project Structure

```
ponder.config.ts              # Network setup, contract addresses, start blocks
ponder.schema.ts              # Database tables & relationships

src/
├── ContentRegistry.ts        # Content submission & lifecycle events
├── RoundVotingEngine.ts      # Commit, reveal, settle, cancel events
├── RoundRewardDistributor.ts # Reward distribution events
├── QuestionRewardPoolEscrow.ts # USDC reward pool funding, voter claims, and frontend shares
├── CategoryRegistry.ts       # Seeded discovery category metadata
├── ProfileRegistry.ts       # Profile update events
├── FrontendRegistry.ts       # Frontend fee events
├── VoterIdNFT.ts             # NFT minting events
├── CuryoReputation.ts        # Token transfer events
└── api/
    └── index.ts              # REST API routes (Hono)

scripts/
└── devWithRecovery.mjs       # Auto-restart on crash, clears corrupted state
```

ABIs come from `@curyo/contracts/abis`; the indexer imports the shared package directly.

## API Endpoints

The REST API is built with Hono. Key routes:

| Endpoint | Description |
|---|---|
| `GET /content` | List content with filters and pagination |
| `GET /content/:id` | Single content item |
| `GET /content/by-url?url=...` | Look up a single content item by URL |
| `GET /votes` | List votes with filters |
| `GET /question-reward-claim-candidates` | Claimable USDC reward-pool rounds for a revealed voter |
| `GET /profile/:address` | User profile and reputation |
| `GET /categories` | List content categories |

Question Reward Pool tables track gross USDC allocation, voter payouts, and the default eligible frontend-operator
share separately so API consumers can display both voter rewards and operator fees.

Routes `/health` and `/status` are reserved by Ponder.

## Troubleshooting

**Local chain rewind / reset:** `yarn ponder:dev` now auto-recovers once if the local hardhat/anvil chain was reset and the persisted Ponder checkpoint points at a block that no longer exists. It clears `packages/ponder/.ponder/pglite` and retries automatically.

**PGlite corruption or unrecoverable local state:** If Ponder still crashes or behaves unexpectedly after the retry, clear the local state manually:

```bash
rm -rf packages/ponder/.ponder
```

**BigInt serialization:** Always use `replaceBigInts()` from `"ponder"` before calling `c.json()` in API routes — `JSON.stringify` cannot serialize BigInt values.

**Rate limiting behind proxies:** In production, set `RATE_LIMIT_TRUSTED_IP_HEADERS` only to headers your edge proxy overwrites, such as `x-forwarded-for` on Vercel/Railway behind a trusted proxy or `cf-connecting-ip` on Cloudflare. If you leave it unset, Ponder falls back to a request fingerprint instead of skipping rate limiting.
