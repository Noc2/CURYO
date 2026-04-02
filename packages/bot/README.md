# Curyo — Bot (CLI Voting & Content Submission)

Command-line tool for automated content submission and voting. Discovers trending content from external platforms, submits it to the ContentRegistry, and rates content using pluggable strategies backed by external APIs. Votes use **tlock commit-reveal**: the bot encrypts vote directions with timelock encryption, binds the redeployed drand metadata into the commit payload, and commits them on-chain; the keeper-assisted/self-reveal flow reveals votes after each epoch once the on-chain and off-chain checks are satisfied.

## Quick Start

```bash
# From the monorepo root:
yarn bot:submit   # Discover and submit trending content
yarn bot:vote     # Rate content and place votes on-chain
yarn bot:status   # Check bot account balances and Voter ID status

# Target a single category/source with an explicit cap:
yarn workspace @curyo/bot submit --category Movies --max-submissions 5
yarn workspace @curyo/bot submit --source coingecko --max-submissions 2
```

Requires a running Ponder indexer (`yarn ponder:dev`) and configured environment variables.
Public submission sources still work without third-party API keys, but source coverage and automated rating breadth are reduced.

## Scripts

| Command | Description |
|---|---|
| `yarn bot:submit` | Discover trending content from platforms and submit to registry |
| `yarn workspace @curyo/bot submit -- --category Movies --max-submissions 5` | Submit up to 5 items from the `Movies` category |
| `yarn workspace @curyo/bot submit -- --source coingecko --max-submissions 2` | Submit up to 2 items from the CoinGecko source |
| `yarn bot:vote` | Rate content and commit encrypted votes via tlock commit-reveal |
| `yarn bot:status` | Check wallet balances and Voter ID ownership |

## Configuration

Copy `.env.example` to `.env` in the package directory and fill in the deployed network details. The required minimum is:

- one wallet for the role you want to run
- `RPC_URL`, `CHAIN_ID`, and the deployed contract addresses if your chain is not present in `@curyo/contracts`
- `PONDER_URL`

**Wallet (one of):**

| Variable | Description |
|---|---|
| `SUBMIT_KEYSTORE_ACCOUNT` | Foundry keystore account for submissions |
| `SUBMIT_KEYSTORE_PASSWORD` | Password used to decrypt the submission keystore |
| `SUBMIT_PRIVATE_KEY` | Raw private key for submissions (not recommended) |
| `RATE_KEYSTORE_ACCOUNT` | Foundry keystore account for voting |
| `RATE_KEYSTORE_PASSWORD` | Password used to decrypt the rating keystore |
| `RATE_PRIVATE_KEY` | Raw private key for voting (not recommended) |

**Network & Services:**

| Variable | Default | Description |
|---|---|---|
| `RPC_URL` | — | Blockchain RPC endpoint |
| `CHAIN_ID` | — | Network chain ID |
| `CREP_TOKEN_ADDRESS` | Auto-derived for supported chains | Fallback cREP token address |
| `CONTENT_REGISTRY_ADDRESS` | Auto-derived for supported chains | Fallback ContentRegistry address |
| `VOTING_ENGINE_ADDRESS` | Auto-derived for supported chains | Fallback RoundVotingEngine address |
| `VOTER_ID_NFT_ADDRESS` | Auto-derived for supported chains | Fallback VoterIdNFT address |
| `CATEGORY_REGISTRY_ADDRESS` | Auto-derived for supported chains | Fallback CategoryRegistry address |
| `PONDER_URL` | — | Ponder indexer URL |
| `RATE_FRONTEND_ADDRESS` | — | Optional frontend code/operator address attributed on `commitVote()` calls |

**Optional External API Keys:**

| Variable | Description |
|---|---|
| `TMDB_API_KEY` | TheMovieDB API key (movies & TV) |
| `YOUTUBE_API_KEY` | YouTube Data API key |
| `TWITCH_CLIENT_ID` | Twitch API client ID |
| `TWITCH_CLIENT_SECRET` | Twitch API client secret |
| `RAWG_API_KEY` | RAWG API key (games) |

Without these keys the bot can still submit from public sources such as CoinGecko, Open Library, Hugging Face, Scryfall, and Wikipedia, but keyed sources and some rating strategies will be unavailable.

**Tuning (optional):**

| Variable | Default | Description |
|---|---|---|
| `VOTE_STAKE` | — | cREP stake per vote |
| `VOTE_THRESHOLD` | — | Minimum confidence to cast a vote |
| `MAX_VOTES_PER_RUN` | — | Limit votes per execution |
| `MAX_SUBMISSIONS_PER_RUN` | — | Limit submissions per execution |
| `MAX_SUBMISSIONS_PER_CATEGORY` | — | Per-source cap during submission runs |

`submit` also supports one-off CLI overrides:

- `--category <id|name>` to target a specific category such as `4`, `Movies`, or `Crypto Tokens`
- `--source <name>` to target a specific source adapter such as `tmdb` or `coingecko`
- `--max-submissions <count>` to override the per-run cap for that invocation
- `--help` to print the submit-specific usage text

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
├── sources/         # Content platform adapters (public + API-backed)
└── strategies/      # Platform-specific rating strategies
```
