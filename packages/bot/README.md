# Curyo — Bot (CLI Voting & Content Submission)

Command-line tool for automated content submission and voting. Discovers trending content from external platforms, submits question-first entries to the ContentRegistry, and rates content using pluggable strategies backed by external APIs. Votes use **tlock commit-reveal**: the bot encrypts vote directions with timelock encryption, binds the redeployed drand metadata into the commit payload, and commits them on-chain; the keeper-assisted/self-reveal flow reveals votes after each epoch once the on-chain and off-chain checks are satisfied.

## Quick Start

```bash
# From the monorepo root:
yarn bot:submit   # Discover and submit trending content
yarn bot:vote     # Rate content and place votes on-chain
yarn bot:claim    # Claim rewards earned by the configured bot wallets
yarn bot:status   # Check bot account balances and Voter ID status

# Target a single category/source with an explicit cap:
yarn workspace @curyo/bot submit --category "Media" --max-submissions 5
yarn workspace @curyo/bot submit --source coingecko --max-submissions 2
yarn workspace @curyo/bot submit --category "Developer Docs" --source github --max-submissions 2
```

Requires configured environment variables and a reachable RPC endpoint.
`vote` and `claim` require a running Ponder indexer (`yarn ponder:dev`); `submit` does not.
`status` reports the configured Ponder endpoint when available but can still run without it.
Public submission sources still work without third-party API keys, but source coverage and automated rating breadth are reduced.
Question submissions use a question capped at 120 characters. They may be text-only or include a regular link, direct image link, or YouTube link, and reward pool amounts are shown as USD even though settlement happens in USDC on Celo with a default 3% eligible frontend-operator share.

## Scripts

| Command | Description |
|---|---|
| `yarn bot:submit` | Discover trending content from platforms and submit question-first entries to registry |
| `yarn workspace @curyo/bot submit --category "Media" --max-submissions 5` | Submit up to 5 items from the `Media` category |
| `yarn workspace @curyo/bot submit --source coingecko --max-submissions 2` | Submit up to 2 items from the CoinGecko source |
| `yarn bot:vote` | Rate content and commit encrypted votes via tlock commit-reveal |
| `yarn bot:claim` | Claim voter and submitter rewards for the configured bot wallets |
| `yarn bot:status` | Check wallet balances and Voter ID ownership |

The bot is a manual CLI. `yarn dev:stack` starts Ponder, Next.js, and the keeper, but it does not start `submit` or `vote` automatically.

## Configuration

Copy `.env.example` to `.env` in the package directory and fill in the deployed network details. The required minimum is:

- one wallet for the role you want to run
- `RPC_URL`, `CHAIN_ID`, and the deployed contract addresses if your chain is not present in `@curyo/contracts`
- `PONDER_URL` for `vote` and optional `status` checks

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
| `ROUND_REWARD_DISTRIBUTOR_ADDRESS` | Auto-derived for supported chains | Fallback RoundRewardDistributor address |
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
| `GITHUB_TOKEN` | GitHub REST API token for GitHub repo discovery and rating |

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

- `--category <id|name>` to target a specific category such as `1`, `Products`, or `Media`
- `--source <name>` to target a specific source adapter such as `tmdb` or `coingecko`
- `--max-submissions <count>` to override the per-run cap for that invocation
- `--help` to print the submit-specific usage text, including the full category/source catalog below

## How Claiming Works

`yarn bot:claim` scans Ponder history plus current on-chain claim state, then submits only the claims that are still outstanding for the configured bot wallets.

- Submission bot claims:
  - `RoundRewardDistributor.claimSubmitterReward(contentId, roundId)`
  - `ContentRegistry.claimSubmitterParticipationReward(contentId)`
- Rating bot claims:
  - `RoundVotingEngine.claimCancelledRoundRefund(contentId, roundId)`
  - `RoundRewardDistributor.claimReward(contentId, roundId)`
  - `RoundRewardDistributor.claimParticipationReward(contentId, roundId)`

Frontend fee sweeping remains a keeper responsibility when the keeper wallet is also the frontend operator.

## Available Categories

`--category` accepts either the numeric ID or the category name. `--source` accepts the source adapter name.

| ID | Category | `--source` | Availability |
|---|---|---|---|
| `1` | Products | `scryfall`, `rawg`, `coingecko` | Public; RAWG requires `RAWG_API_KEY` |
| `5` | Media | `youtube`, `twitch`, `tmdb`, `openlibrary` | YouTube/Twitch/TMDB require their API keys |
| `7` | AI Answers | `huggingface` | Public |
| `8` | Developer Docs | `github` | Requires `GITHUB_TOKEN` |
| `10` | General | `wikipedia-people` | Public |

Deployed default categories that are already on-chain but still missing automated `submit` coverage:

- `2` Local Places
- `3` Travel
- `4` Apps
- `6` Design
- `9` Trust

## How Submission Works

For each `submit` run, the bot:

1. Loads the wallet configured in `SUBMIT_*` and checks that it can submit. The on-chain `hasVoterId(address)` check resolves delegated identities, so a delegated hot wallet can submit on behalf of the Voter ID holder.
2. Checks that the wallet has enough cREP for the next submission. Each successful question submission stakes **10 cREP**, and the wallet also needs native gas for `approve`, `reserveSubmission`, and `submitQuestion`. Optional reward pools are paid separately in USDC on Celo, shown as USD, and reserve the default frontend-operator share on qualified claims.
3. Chooses the enabled source adapters and fetches trending content. For movies, the `tmdb` source reads TMDB's `/movie/popular` feed.
4. Skips URLs that were already submitted by calling `isUrlSubmitted(url)` before attempting a transaction.
5. Truncates generated questions to the 120-character on-chain maximum, calls `previewQuestionSubmissionKey(url, title, description, tags, categoryId)` to verify the canonical category, reserves the hidden submission commitment, waits a little over one second for the reservation age check, and then submits the question or supported media link with the matching salt.
6. Stops when it reaches the configured limit, runs out of cREP, or runs out of fresh items. If a reveal transaction fails after reservation, the bot attempts to cancel the reservation.

## Testing TMDB Questions With A Delegated Bot Wallet

This is the quickest way to test the bot against the current TMDB popular movies feed, now submitted under the broad `Media` review category.

1. Configure the bot wallet in `packages/bot/.env`.

```bash
cp packages/bot/.env.example packages/bot/.env
```

At minimum, set:

```bash
SUBMIT_PRIVATE_KEY=0x...
RPC_URL=...
CHAIN_ID=...
PONDER_URL=...
TMDB_API_KEY=...
```

You can use a Foundry keystore instead of `SUBMIT_PRIVATE_KEY` if you prefer.

2. Start the services the bot depends on. For `submit`, the bot only needs a reachable RPC on the same deployment.

```bash
yarn ponder:dev # optional for submit, required for vote
```

If you are testing locally through the web app as well, run the app and Ponder against the same chain so you can manage delegation and transfers from the UI.

3. Print the submit bot wallet address.

```bash
yarn bot:status
yarn bot:claim
```

4. From the wallet that already holds your Voter ID, open `/settings?tab=delegation` in the app and set the bot wallet as your delegate.

- Only the Voter ID holder can call `setDelegate(...)`.
- The delegated bot wallet does not need to hold the NFT itself.
- If your holder wallet does not have a Voter ID yet, claim one first through the faucet flow in the app.

5. Fund the bot wallet.

- Send enough cREP for the batch you want to test. The bot stakes `10 cREP` per successful question submission, so `--max-submissions 5` needs at least `50 cREP`.
- Send enough native gas token as well so the bot can pay for approvals and submission transactions.
- Fund USDC on Celo only if your workflow also creates question reward pools; plain bot submissions do not attach a reward pool.
- The same `/settings?tab=delegation` screen can still manage the delegate wallet for vote and claim flows.

6. Re-run the status command and confirm the bot wallet is ready.

```bash
yarn bot:status
```

You want to see:

- `Voter ID: YES`
- enough `cREP`
- enough native gas for the target chain

7. Run a focused TMDB movie submission.

```bash
yarn workspace @curyo/bot submit --source tmdb --category "Media" --max-submissions 1
```

Once the one-item smoke test looks good, increase the cap:

```bash
yarn workspace @curyo/bot submit --source tmdb --category "Media" --max-submissions 5
```

Expected behavior:

- The bot fetches TMDB's current popular movies.
- Already-submitted movie URLs are skipped automatically.
- Only fresh items are submitted, so the run may submit fewer than the requested max if duplicates are common.
- Each successful submission stakes `10 cREP`; optional Question Reward Pool funding is separate.
- If `TMDB_API_KEY` is missing, the TMDB source will return no items.

## Project Structure

```
src/
├── index.ts         # CLI entry point & command router
├── config.ts        # Configuration from environment
├── sourceCatalog.ts # Shared bot coverage manifest (submit + vote)
├── client.ts        # viem public & wallet clients
├── keystore.ts      # Foundry keystore handling
├── contracts.ts     # Contract ABI imports
├── commands/
│   ├── submit.ts    # Discover trending content, submit to ContentRegistry
│   ├── vote.ts      # Rate content, place votes on-chain
│   ├── claim.ts     # Claim bot submitter and voter rewards
│   └── status.ts    # Check balances and Voter ID
├── sources/         # Content platform adapters (public + API-backed)
└── strategies/      # Platform-specific rating strategies
```
