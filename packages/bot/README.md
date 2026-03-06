# Curyo — Bot (CLI Voting & Content Submission)

Command-line tool for automated content submission and voting. Discovers trending content from external platforms, submits it to the ContentRegistry, and rates content using pluggable strategies backed by external APIs. Votes use **tlock commit-reveal**: the bot encrypts vote directions with timelock encryption and commits them on-chain; the Keeper reveals and settles after each epoch.

## Quick Start

```bash
# From the monorepo root:
yarn bot:submit   # Discover and submit trending content
yarn bot:vote     # Rate content and place votes on-chain
yarn bot:status   # Check bot account balances and Voter ID status
```

Requires a running Ponder indexer (`yarn ponder:dev`) and configured environment variables.

## Scripts

| Command | Description |
|---|---|
| `yarn bot:submit` | Discover trending content from platforms and submit to registry |
| `yarn bot:vote` | Rate content and commit encrypted votes via tlock commit-reveal |
| `yarn bot:status` | Check wallet balances and Voter ID ownership |

## Configuration

Copy `.env.example` to `.env` in the package directory and fill in the deployed network details:

**Wallet (one of):**

| Variable | Description |
|---|---|
| `SUBMIT_KEYSTORE_ACCOUNT` | Foundry keystore account for submissions |
| `SUBMIT_PRIVATE_KEY` | Raw private key for submissions (not recommended) |
| `RATE_KEYSTORE_ACCOUNT` | Foundry keystore account for voting |
| `RATE_PRIVATE_KEY` | Raw private key for voting (not recommended) |

**Network & Services:**

| Variable | Default | Description |
|---|---|---|
| `RPC_URL` | — | Blockchain RPC endpoint |
| `CHAIN_ID` | — | Network chain ID |
| `CREP_TOKEN_ADDRESS` | — | Deployed cREP token address |
| `CONTENT_REGISTRY_ADDRESS` | — | Deployed ContentRegistry address |
| `VOTING_ENGINE_ADDRESS` | — | Deployed RoundVotingEngine address |
| `VOTER_ID_NFT_ADDRESS` | — | Deployed VoterIdNFT address |
| `CATEGORY_REGISTRY_ADDRESS` | — | Deployed CategoryRegistry address |
| `PONDER_URL` | — | Ponder indexer URL |

**External API Keys:**

| Variable | Description |
|---|---|
| `TMDB_API_KEY` | TheMovieDB API key (movies & TV) |
| `YOUTUBE_API_KEY` | YouTube Data API key |
| `TWITCH_CLIENT_ID` | Twitch API client ID |
| `TWITCH_CLIENT_SECRET` | Twitch API client secret |
| `RAWG_API_KEY` | RAWG API key (games) |

**Tuning (optional):**

| Variable | Default | Description |
|---|---|---|
| `VOTE_STAKE` | — | cREP stake per vote |
| `VOTE_THRESHOLD` | — | Minimum confidence to cast a vote |
| `MAX_VOTES_PER_RUN` | — | Limit votes per execution |
| `MAX_SUBMISSIONS_PER_RUN` | — | Limit submissions per execution |

## Project Structure

```
src/
├── index.ts         # CLI entry point & command router
├── config.ts        # Configuration from environment
├── client.ts        # viem public & wallet clients
├── keystore.ts      # Foundry keystore handling
├── contracts.ts     # Contract ABI imports
├── commands/
│   ├── submit.ts    # Discover trending content, submit to ContentRegistry
│   ├── vote.ts      # Rate content, place votes on-chain
│   └── status.ts    # Check balances and Voter ID
├── sources/         # Content platform adapters (TMDB, YouTube, Twitch, RAWG)
└── strategies/      # Rating strategies for different content types
```
