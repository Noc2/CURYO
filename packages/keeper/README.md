# Curyo — Keeper (Round Resolution Service)

Stateless service that reveals committed votes via `revealVoteByCommitKey()` after each epoch, settles eligible rounds via `settleRound()`, finalizes `RevealFailed` rounds after the last grace deadline, sweeps unrevealed-vote cleanup via `processUnrevealedVotes()`, cancels expired rounds, marks dormant content, and can optionally sweep frontend fees when the keeper wallet is also the frontend operator. In the redeployed tlock model, it also performs deeper AGE/tlock stanza checks against the stored drand metadata before decrypting. Designed for horizontal scaling — multiple instances run independently for redundancy.

## Quick Start

```bash
# Copy and configure environment:
cp .env.example .env.local
# Edit .env.local with your RPC URL, chain, and wallet

# From the monorepo root:
yarn keeper:dev    # Development mode (with file watching)
yarn keeper:start  # Production mode (long-running service)
```

## Scripts

| Command | Description |
|---|---|
| `yarn keeper:dev` | Development mode with auto-restart on file changes |
| `yarn keeper:start` | Production mode |

## Configuration

Copy `.env.example` to `.env.local` and configure:

For live `CHAIN_ID` values `11142220` and `42220`, Keeper reads the latest contract addresses from `@curyo/contracts`.
For local `31337`, address vars override the shared artifact so a fresh Anvil deploy can be used without committing
machine-specific local addresses. Only set address vars on unsupported chains or local Hardhat/Anvil.

| Variable | Default | Description |
|---|---|---|
| `RPC_URL` | — | Blockchain RPC endpoint (required) |
| `CHAIN_ID` | — | Network chain ID (required) |
| `VOTING_ENGINE_ADDRESS` | Auto-derived for supported chains | Local `31337` override only; live chains require shared deployment artifacts |
| `CONTENT_REGISTRY_ADDRESS` | Auto-derived for supported chains | Local `31337` override only; live chains require shared deployment artifacts |
| `ROUND_REWARD_DISTRIBUTOR_ADDRESS` | Auto-derived when frontend-fee sweep is enabled on supported chains | Local `31337` override only; live chains require shared deployment artifacts |
| `FRONTEND_REGISTRY_ADDRESS` | Auto-derived when frontend-fee sweep is enabled on supported chains | Local `31337` override only; live chains require shared deployment artifacts |
| `CHAIN_NAME` | Auto-derived from `CHAIN_ID` | Optional human-readable chain label |
| `KEYSTORE_ACCOUNT` | — | Foundry keystore account name (preferred) |
| `KEYSTORE_PASSWORD` | — | Keystore decryption password |
| `KEEPER_PRIVATE_KEY` | — | Raw private key fallback if no keystore is configured |
| `KEEPER_INTERVAL_MS` | `30000` | Resolution loop frequency (ms) |
| `KEEPER_STARTUP_JITTER_MS` | `0` | Random startup delay for multi-instance staggering |
| `KEEPER_CLEANUP_BATCH_SIZE` | `25` | Max commit window processed per `processUnrevealedVotes()` batch |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics server |
| `METRICS_BIND_ADDRESS` | `127.0.0.1` | Metrics server bind address |
| `METRICS_PORT` | `9090` | Metrics server port |
| `LOG_FORMAT` | `json` | Log format: `json` (production) or `text` (development) |
| `DORMANCY_PERIOD` | `2592000` | Dormancy threshold in seconds used for dormant content sweeps |
| `MIN_GAS_BALANCE_WEI` | `10000000000000000` | Warning threshold for keeper wallet gas balance |
| `MAX_GAS_PER_TX` | `2000000` | Per-transaction gas cap for keeper writes |
| `KEEPER_FRONTEND_FEE_ENABLED` | `false` | Enable hosted frontend fee sweep mode |
| `KEEPER_FRONTEND_ADDRESS` | keeper wallet address | Optional frontend/operator address to claim for. Must match the keeper wallet for fee sweeps to run. |
| `KEEPER_FRONTEND_FEE_LOOKBACK_ROUNDS` | `8` | Number of recent rounds per content item to prioritize before backfilling older frontend fees |
| `KEEPER_FRONTEND_FEE_WITHDRAW` | `true` | Withdraw accumulated `FrontendRegistry` fees after claiming round fees |

## Docker

```bash
# From the monorepo root (the image needs the shared @curyo/contracts workspace)
docker build -f packages/keeper/Dockerfile -t curyo-keeper .
docker run --env-file packages/keeper/.env.local -e METRICS_BIND_ADDRESS=0.0.0.0 -p 9090:9090 curyo-keeper
```

## Monitoring

- **Prometheus metrics:** `http://localhost:9090/metrics`
- **Health check:** `http://localhost:9090/health`

Key metrics: `keeper_is_running` (gauge), `keeper_rounds_settled_total` (counter), `keeper_rounds_cancelled_total` (counter), `keeper_rounds_reveal_failed_finalized_total` (counter), `keeper_unrevealed_cleanup_batches_total` (counter), `keeper_consensus_reserve_wei` (gauge).

When `KEEPER_FRONTEND_FEE_ENABLED=true`, the same worker prioritizes recent settled rounds for the configured frontend/operator, then backfills older settled rounds so historical `RoundRewardDistributor.claimFrontendFee(...)` claims do not age out of automation. It can also withdraw accumulated `FrontendRegistry.claimFees()` credits.

## Project Structure

```
src/
├── index.ts      # Main entry point & event loop
├── keeper.ts     # Core logic (reveal, settle, RevealFailed, cleanup, dormancy)
├── frontend-fees.ts # Optional hosted frontend fee sweeps
├── config.ts     # Configuration from environment
├── client.ts     # viem public & wallet clients
├── keystore.ts   # Foundry keystore decryption
├── logger.ts     # Structured logging
├── metrics.ts    # Prometheus metrics server
└── revert-utils.ts # Shared revert decoding helpers
```

Contract ABIs and deployment metadata are imported from the shared `@curyo/contracts` workspace package.

## Redundancy

Run 2+ instances with different wallet addresses and set `KEEPER_STARTUP_JITTER_MS=15000` to stagger execution cycles. Duplicate settle/finalize/cleanup transactions revert harmlessly — already-processed rounds fail silently on-chain.
