# Curyo — Keeper (Round Resolution Service)

Stateless service that reveals committed votes via `revealVoteByCommitKey()` after each epoch, settles eligible rounds via `settleRound()`, finalizes `RevealFailed` rounds after the last grace deadline, sweeps unrevealed-vote cleanup via `processUnrevealedVotes()`, cancels expired rounds, and marks dormant content. Designed for horizontal scaling — multiple instances run independently for redundancy.

## Quick Start

```bash
# Copy and configure environment:
cp .env.example .env.local
# Edit .env.local with your RPC URL, contract addresses, and wallet

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

| Variable | Default | Description |
|---|---|---|
| `RPC_URL` | — | Blockchain RPC endpoint (required) |
| `CHAIN_ID` | — | Network chain ID (required) |
| `VOTING_ENGINE_ADDRESS` | — | Deployed VotingEngine contract address |
| `CONTENT_REGISTRY_ADDRESS` | — | Deployed ContentRegistry contract address |
| `CHAIN_NAME` | Auto-derived from `CHAIN_ID` | Optional human-readable chain label |
| `KEYSTORE_ACCOUNT` | — | Foundry keystore account name (preferred) |
| `KEYSTORE_PASSWORD` | — | Keystore decryption password |
| `KEEPER_PRIVATE_KEY` | — | Raw private key fallback if no keystore is configured |
| `KEEPER_INTERVAL_MS` | `30000` | Resolution loop frequency (ms) |
| `KEEPER_STARTUP_JITTER_MS` | `0` | Random startup delay for multi-instance staggering |
| `KEEPER_CLEANUP_BATCH_SIZE` | `25` | Max commit window processed per `processUnrevealedVotes()` batch |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics server |
| `METRICS_PORT` | `9090` | Metrics server port |
| `LOG_FORMAT` | `json` | Log format: `json` (production) or `text` (development) |

## Docker

```bash
cd packages/keeper
docker build -t curyo-keeper .
docker run --env-file .env curyo-keeper
```

## Monitoring

- **Prometheus metrics:** `http://localhost:9090/metrics`
- **Health check:** `http://localhost:9090/health`

Key metrics: `keeper_is_running` (gauge), `keeper_rounds_settled_total` (counter), `keeper_rounds_cancelled_total` (counter), `keeper_rounds_reveal_failed_finalized_total` (counter), `keeper_unrevealed_cleanup_batches_total` (counter), `keeper_consensus_reserve_wei` (gauge), `keeper_reward_pool_wei` (gauge).

## Project Structure

```
src/
├── index.ts      # Main entry point & event loop
├── keeper.ts     # Core logic (reveal, settle, RevealFailed, cleanup, dormancy)
├── config.ts     # Configuration from environment
├── client.ts     # viem public & wallet clients
├── keystore.ts   # Foundry keystore decryption
├── logger.ts     # Structured logging
├── metrics.ts    # Prometheus metrics server
└── abis/         # Contract ABIs

Dockerfile        # Production container image
```

## Redundancy

Run 2+ instances with different wallet addresses and set `KEEPER_STARTUP_JITTER_MS=15000` to stagger execution cycles. Duplicate settle/finalize/cleanup transactions revert harmlessly — already-processed rounds fail silently on-chain.
