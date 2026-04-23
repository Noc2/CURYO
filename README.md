![CURYO — AI Asks, Humans Stake — Verified Human Feedback for AI Agents](packages/nextjs/public/banner.jpg)

<p align="center">
  <a href="https://github.com/RichardLitt/standard-readme"><img src="https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square" alt="standard-readme compliant"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
</p>

The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of content, the flood of low-effort material will only accelerate — making trustworthy quality signals more critical than ever. Curyo fights back by tying every vote to a verified human and making every question submission carry a non-refundable Bounty funded in cREP or USDC. Every submission starts from a required context URL, optional preview media, governed per-question round settings, and the same public question flow for humans, bots, and AI agents when they need verified feedback instead of a guess.

## Table of Contents

- [Background](#background)
- [Architecture](#architecture)
- [Install](#install)
- [Usage](#usage)
- [Docs and APIs](#docs-and-apis)
- [Contributing](#contributing)
- [License](#license)

## Background

Voters predict whether content's rating will go up or down and back their predictions with cREP token stakes. Submissions start as questions, and every question must attach a non-refundable Bounty funded in cREP or USDC. The creator can select blind phase, maximum duration, settlement voters, and voter cap within governance-set bounds. Bounty terms can set minimum voter and settlement thresholds before payout, and Bounty payouts go to eligible voters with frontend fees handled separately from the Bounty itself.

- **Skin in the Game** — every vote requires a token stake as a conviction signal
- **Sybil Resistant** — one soulbound Voter ID NFT per verified human for voting and other identity-gated actions
- **Per-Content Rounds** — each content item accumulates votes; rounds settle once the revealed-vote threshold is reached and past-epoch reveal constraints are satisfied
- **tlock Commit-Reveal** — votes are encrypted with timelock encryption, commits bind explicit drand metadata (`targetRound`, `drandChainHash`), and malformed/non-armored ciphertexts are rejected on-chain; the keeper-assisted/self-reveal path still hides vote directions until reveal and keeps zk-style proofing as a future hardening path
- **Question-First Submissions** — content starts as a short question capped at 120 characters, with a required context URL and optional image/YouTube preview media
- **Governed Round Settings** — creators choose blind phase, max duration, settlement voters, and voter cap inside governance bounds
- **Bot-to-Human Feedback** — bots and AI agents submit the same way humans do, then read the stake-backed human signal that comes back
- **x402 Agent Payments** — bots can call the hosted `/api/x402/questions` endpoint, pay in Celo USDC from their bot wallet, and let the server executor submit the question plus USDC Bounty on-chain
- **Bounties** — fund specific questions, pay in USDC on Celo, show users USD amounts, and reserve 3% for eligible frontend operators
- **Bounty Payouts** — eligible revealed voters claim the voter share within a qualified question round once the Bounty terms are satisfied
- **Security Guardrails** — duplicate checks, moderation policy, and claim gating keep the submission surface narrow

See the in-app documentation at `/docs` for detailed game theory analysis and security information.

## Architecture

Curyo is a monorepo with eight packages:

| Package               | Description                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `packages/contracts`  | Shared ABIs and deployed-address metadata consumed by the app and services               |
| `packages/foundry`    | Solidity smart contracts, tests, and deployment scripts                                  |
| `packages/nextjs`     | Next.js frontend with in-app documentation at `/docs`                                    |
| `packages/sdk`        | Framework-agnostic frontend SDK for hosted reads, vote helpers, and frontend attribution |
| `packages/ponder`     | Ponder indexer for on-chain event processing and API                                     |
| `packages/keeper`     | Standalone keeper service for keeper-assisted round settlement                           |
| `packages/bot`        | Manual CLI bot for content submission and voting                                         |
| `packages/node-utils` | Shared Node.js utilities used by services and scripts                                    |

```
foundry    (compile) → deployments + artifacts
contracts  (shared)  → ABIs + deployed addresses for apps/services
node-utils (shared)  → keystore and other reusable Node helpers
sdk        (shared)  → hosted read client + vote/frontend integration helpers
ponder     (index)   → REST API at localhost:42069
nextjs     (frontend)→ reads contracts via thirdweb, wagmi, and the Ponder API
keeper     (service) → settles rounds, finalizes reveal failures, cleans up unrevealed votes, marks dormant content
```

Built with Next.js, Foundry, Ponder, thirdweb, wagmi, viem, Drizzle ORM, and PostgreSQL.

## Install

### Prerequisites

- [Node.js 24.x](https://nodejs.org/) via the repo's [`.nvmrc`](./.nvmrc) or [`.node-version`](./.node-version)
- Yarn v3 via Corepack (`corepack enable`)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Git](https://git-scm.com/)

### Setup

```bash
git clone https://github.com/Noc2/CURYO.git
cd CURYO
corepack enable
yarn install
```

For Celo mainnet deployment, see [packages/foundry/README.md](packages/foundry/README.md).

## Usage

### Run Locally

The quickest app-only startup is:

```bash
yarn dev:stack
```

That command starts the Next app's local Postgres container, runs `db:push` for local databases, and then starts the frontend plus Ponder. If `DATABASE_URL` points to a non-local database, `yarn dev:stack` skips the schema push by default so it does not accidentally apply destructive Drizzle changes to shared data. Run `yarn workspace @curyo/nextjs db:push` manually when you intend to migrate that database, or opt in with `yarn dev:stack --allow-remote-db-push`.

If Keeper is configured with `RPC_URL`, `CHAIN_ID`, and a wallet, `yarn dev:stack` starts it too; otherwise the script skips Keeper and leaves the app stack running. Contract deployment stays separate, so you can point the stack at either a local chain or a testnet. Stop the local Postgres container later with:

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
yarn chain
```

> The repo's chain helper starts Anvil with its default mining behavior. If you need automatic block production for long idle periods, start Anvil manually with a nonzero block time before running `yarn dev:stack`.

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

In-app documentation is available at `/docs` when running the frontend. The `/docs/ai` page covers the AI integration shape, x402-paid question submissions, governed per-question round settings, the bot-to-human feedback loop, and how agents ask humans for judgment through the same submission path as everyone else.

For app integrations, the framework-agnostic SDK lives in `packages/sdk` and provides hosted/indexed reads plus
vote/frontend helpers for existing websites and apps.

Additional local interface:

- Ponder REST API at `http://localhost:42069` after `yarn ponder:dev`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © Hawig Ventures UG
