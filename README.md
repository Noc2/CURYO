<p align="center">
  <img src="packages/nextjs/public/banner.png" alt="CURYO — Decentralized Reputation Game" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/RichardLitt/standard-readme"><img src="https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square" alt="standard-readme compliant"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT"></a>
</p>

Decentralized reputation game where users stake cREP tokens on content quality predictions.

The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of content, the flood of low-effort material will only accelerate — making trustworthy quality signals more critical than ever. Curyo fights back by tying every vote to a verified reputation. When you stake real tokens on your judgment, low-quality content loses and high-quality content rises — no algorithms, no ads, no manipulation.

## Table of Contents

- [Background](#background)
- [Architecture](#architecture)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

Curyo replaces passive likes with **prediction games**. Voters predict whether content's rating will go UP or DOWN and back their predictions with cREP token stakes. The majority side wins — the losing side's stakes are redistributed to the winning side.

- **Skin in the Game** — every vote requires a token stake
- **Sybil Resistant** — one soulbound Voter ID NFT per verified human
- **Per-Content Rounds** — each content item accumulates votes; settlement triggers randomly with increasing probability
- **Public Voting** — votes are immediately visible and price-moving via bonding curve share pricing; early/contrarian voters earn more shares
- **Fully Decentralized** — no team, no foundation, no central authority

Read the full [Game Theory Analysis](docs/GAME_THEORY_ANALYSIS.md) and [Security Audit](SECURITY_AUDIT.md).

## Architecture

Curyo is a monorepo with five packages:

| Package | Description |
|---|---|
| `packages/foundry` | Solidity smart contracts, tests, and deployment scripts |
| `packages/nextjs` | Next.js frontend with in-app documentation at `/docs` |
| `packages/ponder` | Ponder indexer for on-chain event processing and API |
| `packages/keeper` | Standalone keeper service for trustless vote reveals and round settlement |
| `packages/bot` | CLI voting bot with pluggable rating strategies |

```
foundry (compile) → ABIs + addresses
ponder  (index)   → REST API at localhost:42069
nextjs  (frontend)→ reads contracts via wagmi + Ponder API
keeper  (service) → settles rounds via trySettle(), cancels expired rounds
```

Built with [Scaffold-ETH 2](https://scaffoldeth.io), Next.js, Foundry, Ponder, RainbowKit, wagmi, and viem.

## Install

### Prerequisites

- [Node.js >= 20](https://nodejs.org/)
- [Yarn v3](https://yarnpkg.com/)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Git](https://git-scm.com/)

### Setup

```bash
git clone https://github.com/Noc2/CURYO.git
cd CURYO
yarn install
```

## Usage

### Run Locally

Open four terminals:

**1. Local chain:**
```bash
yarn chain
```

**2. Deploy contracts:**
```bash
yarn deploy
```

**3. Start the indexer:**
```bash
yarn ponder:dev
```

**4. Start the frontend:**
```bash
yarn start
```

Visit [http://localhost:3000](http://localhost:3000).

### Run the Keeper

The keeper is a lightweight stateless service that calls trySettle() on active rounds, cancels expired rounds, and marks dormant content. Anyone can run a keeper — all data is public, and multiple instances provide redundancy with no coordination.

**Configure** by copying `.env.example` and setting contract addresses and a wallet:

```bash
cp packages/keeper/.env.example packages/keeper/.env.local
# Edit packages/keeper/.env.local with your contract addresses and wallet key
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
cd packages/keeper
docker build -t curyo-keeper .
docker run --env-file .env curyo-keeper
```

**Monitoring:**

- Prometheus metrics: `http://localhost:9090/metrics`
- Health check: `http://localhost:9090/health`

**Redundancy:** Run 2+ instances with different wallets and `KEEPER_STARTUP_JITTER_MS=15000` to stagger execution. Duplicate transactions revert harmlessly.

### Run Tests

```bash
# Solidity unit tests
yarn foundry:test

# E2E browser tests (requires all services running — see "Run Locally" above)
# Ensure NEXT_PUBLIC_TLOCK_MOCK=true in packages/nextjs/.env.local
yarn e2e

# Interactive Playwright UI mode
yarn e2e:ui
```

## API

In-app documentation is available at `/docs` when running the frontend, covering:

- Getting Started
- How It Works
- Tokenomics
- Governance
- Smart Contracts
- Security Audit

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © Hawig Ventures UG
