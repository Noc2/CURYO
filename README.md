![CURYO — A Better Web, Guided by Human Reputation](packages/nextjs/public/banner.svg)

<p align="center">
  <a href="https://github.com/RichardLitt/standard-readme"><img src="https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square" alt="standard-readme compliant"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
</p>

Decentralized content curation protocol where verified humans stake cREP on content quality predictions.

The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of content, the flood of low-effort material will only accelerate — making trustworthy quality signals more critical than ever. Curyo fights back by tying every vote to a verified reputation. When you stake real tokens on your judgment, low-quality content loses and high-quality content rises — no algorithms, no ads, no manipulation.

## Table of Contents

- [Background](#background)
- [Architecture](#architecture)
- [Install](#install)
- [Usage](#usage)
- [Docs and APIs](#docs-and-apis)
- [Contributing](#contributing)
- [License](#license)

## Background

Curyo replaces passive likes with **prediction games**. Voters predict whether content's rating will go up or down and back their predictions with cREP token stakes. The majority side wins the content-specific voter pool: revealed losers can reclaim a fixed rebate, and the remaining losing pool is split across winners and protocol-defined contributor shares.

- **Skin in the Game** — every vote requires a token stake
- **Sybil Resistant** — one soulbound Voter ID NFT per verified human
- **Per-Content Rounds** — each content item accumulates votes; rounds settle once the revealed-vote threshold is reached and past-epoch reveal constraints are satisfied
- **tlock Commit-Reveal** — votes are encrypted with timelock encryption and revealed after each epoch; vote directions stay hidden until reveal, preventing front-running and copycat strategies
- **Governance-Native Controls** — launch deployments keep upgrades, config, and treasury routing under the governor/timelock, with deployer setup roles renounced after deployment

See the in-app documentation at `/docs` for detailed game theory analysis and security information.

## Architecture

Curyo is a monorepo with seven packages:

| Package | Description |
|---|---|
| `packages/contracts` | Shared ABIs and deployed-address metadata consumed by the app and services |
| `packages/foundry` | Solidity smart contracts, tests, and deployment scripts |
| `packages/nextjs` | Next.js frontend with in-app documentation at `/docs` |
| `packages/ponder` | Ponder indexer for on-chain event processing and API |
| `packages/keeper` | Standalone keeper service for trustless round settlement |
| `packages/bot` | CLI voting bot with pluggable rating strategies |
| `packages/mcp-server` | Read-only MCP server exposing Curyo data to AI agents |

```
foundry   (compile) → deployments + artifacts
contracts (shared)  → ABIs + deployed addresses for apps/services
ponder    (index)   → REST API at localhost:42069
nextjs    (frontend)→ reads contracts via wagmi + Ponder API
keeper    (service) → settles rounds, finalizes reveal failures, cleans up unrevealed votes, marks dormant content
mcp-server (tools)  → exposes read-only MCP tools backed by the Ponder API
```

Built with [Scaffold-ETH 2](https://scaffoldeth.io), Next.js, Foundry, Ponder, RainbowKit, wagmi, and viem.

### Vendored And Upstream Code

Not every directory in this repository is first-party Curyo source.

- `packages/foundry/lib/self/` is vendored upstream Self.xyz code used for identity verification integration.
- `packages/foundry/lib/openzeppelin-*` and other `packages/foundry/lib/*` entries are upstream dependency submodules.

For protocol review, security review, and contribution planning, treat Curyo-owned code as the primary focus:

- `packages/foundry/contracts/`
- `packages/foundry/test/`
- `packages/nextjs/`
- `packages/ponder/`
- `packages/keeper/`
- `packages/bot/`
- `packages/mcp-server/`

## Install

### Prerequisites

- [Node.js 24.x](https://nodejs.org/)
- [Yarn v3](https://yarnpkg.com/)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Git](https://git-scm.com/)

### Setup

```bash
git clone https://github.com/Noc2/CURYO.git
cd CURYO
yarn install
```

For Celo mainnet deployment, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Usage

### Run Locally

The quickest app-only startup is:

```bash
yarn dev:stack
```

That command starts the Next app's local Postgres container, runs `db:push`, and then starts the frontend, Ponder, and Keeper together. Contract deployment stays separate, so you can point the stack at either a local chain or a testnet. Stop the local Postgres container later with:

```bash
yarn dev:db:down
```

If the local Postgres volume was initialized with old credentials, reset it with:

```bash
yarn dev:db:reset
```

If you are using a local chain, keep Anvil and deployment separate:

**1. Local chain:**
```bash
yarn chain --block-time 12
```

> **Important:** The `--block-time 12` flag makes Anvil auto-mine a block every 12 seconds. Without it, Anvil only mines blocks when transactions are sent, causing `block.timestamp` to freeze during idle periods. This prevents the keeper from revealing and settling votes (it uses `block.timestamp` to decide when epochs have ended).

**2. Deploy contracts:**
```bash
yarn deploy
```

**3. Start the app stack:**
```bash
yarn dev:stack
```

Visit [http://localhost:3000](http://localhost:3000).

If you only want the database helper, use `yarn dev:db`. It starts the local Postgres container without the other services.

### Run the Keeper

The keeper is a lightweight stateless service that calls settleRound() on eligible active rounds, cancels expired rounds, and marks dormant content. Anyone can run a keeper — all data is public, and multiple instances provide redundancy with no coordination.

**Configure** by copying `.env.example` and setting contract addresses and a wallet:

```bash
cp packages/keeper/.env.example packages/keeper/.env.local
# Edit packages/keeper/.env.local with your RPC URL, contract addresses, and wallet key
```

**Start the keeper:**

```bash
# Development (with file watching)
yarn keeper:dev

# Production
yarn keeper:start
```

**Docker:**

```bash
docker build -f packages/keeper/Dockerfile -t curyo-keeper .
docker run --env-file packages/keeper/.env.local -p 9090:9090 curyo-keeper
```

**Monitoring:**

- Prometheus metrics: `http://localhost:9090/metrics`
- Health check: `http://localhost:9090/health`

**Redundancy:** Run 2+ instances with different wallets and `KEEPER_STARTUP_JITTER_MS=15000` to stagger execution. Duplicate transactions revert harmlessly.

### Run Tests

```bash
# TypeScript / Node test suites across app + services
yarn test:ts

# Solidity unit tests
yarn foundry:test

# E2E smoke suite (Chromium only)
yarn e2e

# E2E lifecycle coverage (settlement, cancellation, dormancy)
yarn workspace @curyo/nextjs e2e:ci:lifecycle

# E2E keeper-backed settlement coverage
yarn workspace @curyo/nextjs e2e:ci:keeper

# Full local E2E run
yarn workspace @curyo/nextjs e2e:full

# Interactive Playwright UI mode
yarn e2e:ui
```

CI runs the smoke, lifecycle, and keeper-backed E2E suites separately, so `yarn e2e` alone does not match full CI browser coverage.

## Docs and APIs

In-app documentation is available at `/docs` when running the frontend, covering:

- Getting Started
- Funding Your Wallet
- How It Works
- Tokenomics
- Governance
- Smart Contracts
- Security Audit

Additional local interfaces:

- Ponder REST API at `http://localhost:42069` after `yarn ponder:dev`
- MCP server via `yarn mcp:dev` (stdio) or `yarn mcp:dev:http` (streamable HTTP)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © Hawig Ventures UG
