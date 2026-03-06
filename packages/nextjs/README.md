# Curyo — Next.js (Frontend)

Full-stack web application built with Next.js 15 and React 19. Provides the UI for voting on content, submitting content, managing portfolios, and reading in-app documentation. Includes server-side API routes and a SQLite database via Drizzle ORM.

## Quick Start

```bash
# From the monorepo root:
yarn start   # Start the dev server at http://localhost:3000
```

Requires the local chain (`yarn chain`), deployed contracts (`yarn deploy`), and the Ponder indexer (`yarn ponder:dev`) to be running. See the root README for the full local setup.

## Scripts

| Command                 | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `yarn start`            | Start development server (localhost:3000)                         |
| `yarn next:build`       | Production build                                                  |
| `yarn next:lint`        | Run ESLint                                                        |
| `yarn next:check-types` | TypeScript type checking                                          |
| `yarn format`           | Format code with Prettier                                         |
| `yarn db:generate`      | Generate Drizzle migrations                                       |
| `yarn db:push`          | Apply migrations to database                                      |
| `yarn db:studio`        | Interactive database browser                                      |
| `yarn whitepaper`       | Generate the whitepaper PDF                                       |
| `yarn e2e`              | Run Playwright E2E tests (requires local chain + deploy + ponder) |
| `yarn e2e:ui`           | Run E2E tests with interactive Playwright UI                      |

## Configuration

Key environment variables (see `.env.example` for the full list):

| Variable                                | Description                                          |
| --------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY`           | Alchemy RPC provider key                             |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect project ID                             |
| `NEXT_PUBLIC_TARGET_NETWORKS`           | Comma-separated deployed chain IDs exposed in the UI |
| `DATABASE_URL`                          | SQLite/Turso database URL (default: `file:local.db`) |
| `DATABASE_AUTH_TOKEN`                   | Turso auth token (production only)                   |
| `NEXT_PUBLIC_PONDER_URL`                | Public Ponder indexer URL (required in production)   |
| `NEXT_PUBLIC_DEV_FAUCET`                | Enable dev faucet UI                                 |
| `FAUCET_PRIVATE_KEY`                    | Server-side faucet wallet key                        |

## Project Structure

```
app/                          # Next.js App Router
├── (main)/                   # Layout with navbar + sidebar
│   ├── page.tsx              # Home dashboard
│   ├── submit/               # Content submission
│   ├── vote/                 # Voting interface
│   ├── portfolio/            # User content & vote history
│   ├── explore/              # Browse all content
│   └── docs/                 # In-app documentation
├── api/                      # Server-side API routes
├── blockexplorer/            # Scaffold-ETH block explorer
└── debug/                    # Contract debugger

components/                   # React components
├── content/embeds/           # Platform-specific embeds (YouTube, Twitter, etc.)
├── Navbar/
├── Sidebar/
└── scaffold-eth/             # Wallet & contract interaction components

hooks/                        # Custom React hooks
├── scaffold-eth/             # useScaffoldReadContract, useScaffoldWriteContract, etc.
├── useRoundInfo.ts           # Fetch round data from Ponder
└── useRoundPhase.ts          # Calculate current round phase

services/ponder/client.ts     # REST client for the Ponder indexer API
utils/platforms/handlers/     # Platform detection & URL parsing
lib/db/schema.ts              # Drizzle ORM database schema
contracts/deployedContracts.ts # Auto-generated contract addresses & ABIs
scaffold.config.ts            # Target networks, Alchemy/WalletConnect config
```

## Architecture

The frontend reads on-chain data in two ways:

1. **Wagmi/Scaffold-ETH hooks** — direct contract reads and writes via the user's wallet
2. **Ponder API** — indexed historical data fetched through `services/ponder/client.ts`

Uses the `~~/*` path alias for imports from the project root. All client components require the `"use client"` directive.
