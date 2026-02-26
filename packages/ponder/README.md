# Curyo — Ponder (Indexer & API)

On-chain event indexer built with [Ponder](https://ponder.sh/). Listens to smart contract events, stores processed data, and exposes a REST API on port 42069 for consumption by the frontend and bot.

## Quick Start

```bash
# From the monorepo root:
yarn ponder:dev     # Development mode with file watching + auto-recovery
yarn ponder:start   # Production mode (no file watching)
yarn ponder:codegen # Regenerate TypeScript types from schema
```

Requires a running chain (local via `yarn chain` or a configured testnet RPC).

## Scripts

| Command | Description |
|---|---|
| `yarn ponder:dev` | Development mode with crash recovery |
| `yarn ponder:start` | Production mode |
| `yarn ponder:codegen` | Generate types from `ponder.schema.ts` |

Within the package directory, additional scripts are available:

| Command | Description |
|---|---|
| `yarn dev:raw` | Development mode without recovery wrapper |
| `yarn serve` | Run API only (no indexing) |

## Configuration

| Variable | Description |
|---|---|
| `PONDER_NETWORK` | Active network: `hardhat`, `celoSepolia`, or `celo` |
| `PONDER_RPC_URL_31337` | RPC URL for local Hardhat/Anvil chain |
| `PONDER_RPC_URL_11142220` | RPC URL for Celo Sepolia |
| `PONDER_RPC_URL_42220` | RPC URL for Celo mainnet |
| `CORS_ORIGIN` | Allowed origins (comma-separated; defaults to `*`) |

## Project Structure

```
ponder.config.ts              # Network setup, contract addresses, start blocks
ponder.schema.ts              # Database tables & relationships

src/
├── ContentRegistry.ts        # Content submission & lifecycle events
├── RoundVotingEngine.ts      # Commit, reveal, settle, cancel events
├── RoundRewardDistributor.ts # Reward distribution events
├── CategoryRegistry.ts       # Category registration events
├── ProfileRegistry.ts        # Profile update events
├── FrontendRegistry.ts       # Frontend fee events
├── VoterIdNFT.ts             # NFT minting events
├── CuryoReputation.ts        # Token transfer events
└── api/
    └── index.ts              # REST API routes (Hono)

abis/                         # Contract ABIs (copied from foundry build)
scripts/
└── devWithRecovery.mjs       # Auto-restart on crash, clears corrupted state
```

## API Endpoints

The REST API is built with Hono. Key routes:

| Endpoint | Description |
|---|---|
| `GET /content` | List content with filters and pagination |
| `GET /content/:id` | Single content item |
| `GET /votes` | List votes with filters |
| `GET /profile/:address` | User profile and reputation |
| `GET /category` | List content categories |

Routes `/health` and `/status` are reserved by Ponder.

## Troubleshooting

**PGlite corruption:** If Ponder crashes or behaves unexpectedly after a crash, clear the local state:

```bash
rm -rf packages/ponder/.ponder
```

**BigInt serialization:** Always use `replaceBigInts()` from `"ponder"` before calling `c.json()` in API routes — `JSON.stringify` cannot serialize BigInt values.
