# Curyo — Next.js (Frontend)

Full-stack web application built with Next.js 15 and React 19. Provides the UI for voting on content, question-first submissions with a required context URL and optional image or YouTube preview media, managing profiles, and reading in-app documentation. Question submissions must attach a non-refundable bounty funded in cREP or USDC, while claim flows remain tied to Voter ID where the protocol still requires it. Humans, bots, and AI agents all submit through the same question-first path. The app includes server-side API routes plus a PostgreSQL database via Drizzle ORM.

## Quick Start

```bash
# From the monorepo root:
yarn dev:stack   # Start local Postgres, apply schema, then run Next.js + Ponder + Keeper
```

Deployment stays separate, so you can point the app stack at either a local chain or a testnet. For local-chain development, keep `yarn chain` and `yarn deploy` separate. Use `yarn dev:db:down` to stop the local Postgres container when you are done.

## Scripts

Run these from the monorepo root unless noted otherwise:

| Command                                         | Description                                                     |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `yarn start`                                    | Start development server (localhost:3000)                       |
| `yarn dev:db`                                   | Start the local Postgres container for the Next app             |
| `yarn dev:db:down`                              | Stop the local Postgres container                               |
| `yarn dev:db:reset`                             | Reset the local Postgres container and its data volume          |
| `yarn dev:stack`                                | Start local Postgres, apply schema, then run Next.js + Ponder + Keeper |
| `yarn next:build`                               | Production build                                                |
| `yarn next:lint`                                | Run ESLint                                                      |
| `yarn next:check-types`                         | TypeScript type checking                                        |
| `yarn workspace @curyo/nextjs format`           | Format frontend code with Prettier                              |
| `yarn workspace @curyo/nextjs db:generate`      | Generate Drizzle migrations                                     |
| `yarn workspace @curyo/nextjs db:push`          | Apply migrations to the configured database                     |
| `yarn workspace @curyo/nextjs db:studio`        | Open the Drizzle studio UI                                      |
| `yarn workspace @curyo/nextjs whitepaper`       | Generate the whitepaper PDF                                     |
| `yarn workspace @curyo/nextjs demo:record`      | Record the short Playwright product demo video                  |
| `yarn e2e`                                      | Run the Playwright smoke suite (Chromium)                       |
| `yarn workspace @curyo/nextjs e2e:ci:lifecycle` | Run lifecycle suites for settlement, cancellation, and dormancy |
| `yarn workspace @curyo/nextjs e2e:ci:keeper`    | Run keeper-backed settlement coverage                           |
| `yarn workspace @curyo/nextjs e2e:full`         | Run the full local Playwright suite, including keeper coverage  |
| `yarn e2e:ui`                                   | Run E2E tests with interactive Playwright UI                    |

CI runs the smoke, lifecycle, and keeper-backed suites separately, so `yarn e2e` is only the smallest browser pass.

## Demo Recorder

To generate the shortest scripted product walkthrough video, start the local chain, deploy contracts, and run the app stack first:

```bash
yarn chain
yarn deploy
yarn dev:stack
```

Then record the demo:

```bash
yarn workspace @curyo/nextjs demo:record
```

The recorder saves a `.webm` file under `packages/nextjs/e2e/artifacts/demo/`. Set `CURYO_DEMO_HEADLESS=false` if you want to watch the browser while it records, or `CURYO_DEMO_VIDEO_PATH=/absolute/path/demo.webm` to override the output file location.

## Configuration

Key environment variables (see `.env.example` for the full list):

| Variable                                | Description                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY`           | Alchemy RPC provider key                                                      |
| `NEXT_PUBLIC_RPC_URL_31337`             | Optional browser RPC override for local Foundry                               |
| `NEXT_PUBLIC_RPC_URL_11142220`          | Optional browser RPC override for Celo Sepolia                                |
| `NEXT_PUBLIC_RPC_URL_42220`             | Optional browser RPC override for Celo mainnet                                |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Optional WalletConnect project ID for external wallet discovery               |
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`        | thirdweb client ID for in-app wallets and sponsored transactions              |
| `THIRDWEB_SECRET_KEY`                   | thirdweb server secret used by the hosted x402 question endpoint              |
| `NEXT_PUBLIC_TARGET_NETWORKS`           | Comma-separated deployed chain IDs exposed in the UI (required in production) |
| `DATABASE_URL`                          | PostgreSQL URL for the Next app logical database                              |
| `RESEND_API_KEY`                        | Resend API key for email notification delivery                                |
| `RESEND_FROM_EMAIL`                     | Verified sender address/domain used by Resend                                 |
| `APP_URL`                               | Public app URL used in verification and email links                           |
| `NOTIFICATION_DELIVERY_SECRET`          | Secret for the email delivery cron endpoint                                   |
| `NEXT_PUBLIC_PONDER_URL`                | Public Ponder indexer URL (required in production)                            |
| `THIRDWEB_SERVER_VERIFIER_SECRET`       | Shared secret used by the thirdweb server verifier webhook                    |
| `CURYO_X402_EXECUTOR_PRIVATE_KEY`       | Server executor key that receives x402 USDC and submits paid questions        |
| `CURYO_X402_SERVICE_FEE_USDC`           | Optional x402 service fee in atomic USDC, added to the requested Bounty       |
| `CURYO_X402_PAYMENT_WAIT_UNTIL`         | x402 settlement wait mode; defaults to `confirmed` so the executor has USDC before submitting |
| `CURYO_X402_USDC_ADDRESS`               | Optional USDC override for x402 payments; Celo and Celo Sepolia default automatically |
| `FREE_TRANSACTION_LIMIT`                | Free sponsored app transactions per verified wallet or identity-gated flow (defaults to `25`) |
| `RATE_LIMIT_TRUSTED_IP_HEADERS`         | Comma-separated proxy IP headers to trust for API rate limiting in production |
| `KEYSTORE_ACCOUNT`                      | Optional Foundry keystore name used by the development faucet                 |
| `KEYSTORE_PASSWORD`                     | Optional password used to decrypt the development faucet keystore             |
| `DEV_FAUCET_ENABLED`                    | Enable the development-only cREP, mock USDC, and Voter ID faucet route        |
| `FAUCET_PRIVATE_KEY`                    | Server-side faucet wallet key                                                 |

Notes:

- Browser RPC reads prefer `NEXT_PUBLIC_RPC_URL_<chainId>` overrides first, then `NEXT_PUBLIC_ALCHEMY_API_KEY`, then the chain's default public RPC list.
- Mainnet is not a supported `NEXT_PUBLIC_TARGET_NETWORKS` entry. The browser can still add mainnet for wallet tooling when you provide a mainnet-capable RPC via `NEXT_PUBLIC_ALCHEMY_API_KEY` or a mainnet RPC override, but the target-network parser only accepts `31337`, `11142220`, and `42220`.
- No contract address env vars are needed for supported chains. The frontend reads deployment metadata from `@curyo/contracts` and fails fast if `NEXT_PUBLIC_TARGET_NETWORKS` includes a chain without it.
- In production, the intended setup is one Railway Postgres service with separate logical databases for Ponder and Next.js.
- If your Postgres provider terminates TLS with a private or self-signed chain, append `uselibpqcompat=true&sslmode=require` to `DATABASE_URL` to opt out of the app's default `verify-full` normalization.
- For local development, `yarn dev:db` and `yarn dev:stack` manage a Docker Postgres container when `DATABASE_URL` points to localhost. `yarn dev:stack` only runs `db:push` automatically for local databases; non-local databases require a manual `yarn workspace @curyo/nextjs db:push` or the explicit `CURYO_DEV_STACK_ALLOW_REMOTE_DB_PUSH=1` opt-in.
- On Next.js 15, `NextRequest.ip` is not reliably populated. On non-Vercel production hosts you must configure `RATE_LIMIT_TRUSTED_IP_HEADERS` to the header(s) your hosting proxy overwrites. Vercel auto-trusts `x-real-ip`, and localhost shortcuts are only enabled for development or explicit local production-style E2E builds. Protected API routes fail closed when no trusted client IP can be derived or when the rate-limit store is unavailable.
- The free transaction quota is enforced by the thirdweb server verifier route at `/api/thirdweb/verify-transaction`. Configure the same secret in thirdweb’s dashboard and in `THIRDWEB_SERVER_VERIFIER_SECRET`.
- The hosted x402 question route lives at `/api/x402/questions`. It accepts a normalized question payload, returns x402 `402 Payment Required` challenges, settles Celo USDC through thirdweb, then submits `submitQuestionWithReward` from `CURYO_X402_EXECUTOR_PRIVATE_KEY`. Keep that executor funded with native gas, and keep the x402 pay-to wallet/executor able to fund the USDC Bounty.
- The Next.js dev faucet reads `KEYSTORE_ACCOUNT`/`KEYSTORE_PASSWORD` or `FAUCET_PRIVATE_KEY` from `packages/nextjs/.env.local`. Keeper wallet settings live separately in `packages/keeper/.env.local`.

## Project Structure

```text
app/                          # Next.js App Router
├── api/                      # Server-side API routes
├── debug/                    # Contract debugger
├── docs/                     # In-app documentation
├── ask/, rate/               # Question asking and rating flows
└── profiles/, settings/      # User profile and preference routes

components/                   # React components
├── content/embeds/           # Media embeds
├── home/, leaderboard/       # Home and leaderboard UIs
├── profile/, submit/, vote/  # Feature-specific flow components
├── shared/, ui/              # Shared presentation primitives
└── scaffold-eth/             # Wallet and contract interaction components

hooks/                        # Custom React hooks
├── scaffold-eth/             # useScaffoldReadContract, useScaffoldWriteContract, etc.
├── usePonderQuery.ts         # Shared indexed-data fetch helper
├── useRoundSnapshot.ts       # Shared active-round contract read + derived state
└── useVotingConfig.ts        # Shared voting config contract read

services/ponder/client.ts     # REST client for the Ponder indexer API
services/web3/                # wagmi config and wallet connector setup
lib/db/schema.ts              # Drizzle ORM database schema
lib/notifications/            # Email preference and delivery logic
utils/platforms/handlers/     # Platform detection and URL parsing
scaffold.config.ts            # Target networks, Alchemy/WalletConnect config
```

## Architecture

The frontend reads on-chain data in two ways:

1. **Wagmi/Scaffold-ETH hooks** — direct contract reads and writes via the user's wallet
2. **Ponder API** — indexed historical data fetched through `services/ponder/client.ts`

Shared contract ABIs and deployment metadata come from the `@curyo/contracts` workspace package.

Uses the `~~/*` path alias for imports from the project root. All client components require the `"use client"` directive.
