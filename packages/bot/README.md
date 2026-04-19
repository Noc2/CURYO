# Curyo — Bot (CLI Voting & Content Submission)

Command-line tool for automated YouTube question submission and voting. Discovers trending videos, submits question-first entries to the ContentRegistry, and rates YouTube content with the configured strategy. The same question-first path is how bots and AI agents can ask verified humans for feedback when an automated strategy cannot answer with confidence. Submissions use a required context URL plus optional preview media, so bot and human flows stay aligned. Every submission carries a configurable Bounty with minimum voter and settlement thresholds, plus governed per-question round settings, so operators can keep the timing and economics aligned with the question they are asking. Votes use **tlock commit-reveal**: the bot encrypts vote directions with timelock encryption using each question's active round settings, binds the redeployed drand metadata into the commit payload, and commits them on-chain; the keeper-assisted/self-reveal flow reveals votes after each epoch once the on-chain and off-chain checks are satisfied.

## Quick Start

```bash
# From the monorepo root:
yarn bot:submit   # Discover and submit trending content
yarn bot:submit:x402 # Pay the hosted x402 API in Celo USDC, then submit
yarn bot:vote     # Rate content and place votes on-chain
yarn bot:claim    # Claim voter rewards earned by the configured rating bot wallet
yarn bot:status   # Check bot account balances and voting identity status

# Target a single category/source with an explicit cap:
yarn workspace @curyo/bot submit --category "Media" --max-submissions 5
yarn workspace @curyo/bot submit --source youtube --max-submissions 2
yarn workspace @curyo/bot submit --transport x402 --source youtube --max-submissions 2
```

Requires configured environment variables and a reachable RPC endpoint.
`vote` and `claim` require a running Ponder indexer (`yarn ponder:dev`); `submit` does not.
`status` reports the configured Ponder endpoint when available but can still run without it.
Question submissions use a question capped at 120 characters. Automated submissions currently use YouTube videos, and each submission must attach a non-refundable Bounty funded in cREP or USDC. The bot uses the same submission rules as a human: required context URL, optional preview media, and the same Bounty guardrails.
For MCP or other agent adapters, treat this as a typed bot-to-human feedback loop: the agent asks a narrow question, humans answer with stake, and downstream clients read the public rating result.

## Scripts

| Command | Description |
|---|---|
| `yarn bot:submit` | Discover trending content from platforms and submit question-first entries to registry |
| `yarn bot:submit:x402` | Discover trending content and submit through the hosted x402 question API |
| `yarn workspace @curyo/bot submit --category "Media" --max-submissions 5` | Submit up to 5 items from the `Media` category |
| `yarn workspace @curyo/bot submit --source youtube --max-submissions 2` | Submit up to 2 items from the YouTube source |
| `yarn bot:vote` | Rate content and commit encrypted votes via tlock commit-reveal |
| `yarn bot:claim` | Claim voter rewards for the configured rating bot wallet |
| `yarn bot:status` | Check wallet balances and voting identity ownership |

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
| `QUESTION_REWARD_POOL_ESCROW_ADDRESS` | Auto-derived for supported chains | Fallback QuestionRewardPoolEscrow address |
| `VOTING_ENGINE_ADDRESS` | Auto-derived for supported chains | Fallback RoundVotingEngine address |
| `ROUND_REWARD_DISTRIBUTOR_ADDRESS` | Auto-derived for supported chains | Fallback RoundRewardDistributor address |
| `VOTER_ID_NFT_ADDRESS` | Auto-derived for supported chains | Fallback VoterIdNFT address |
| `CATEGORY_REGISTRY_ADDRESS` | Auto-derived for supported chains | Fallback CategoryRegistry address |
| `PONDER_URL` | — | Ponder indexer URL |
| `RATE_FRONTEND_ADDRESS` | — | Optional frontend code/operator address attributed on `commitVote()` calls |
| `SUBMIT_REWARD_REQUIRED_VOTERS` | `3` | Minimum voters required before a submission Bounty can pay out |
| `SUBMIT_REWARD_REQUIRED_SETTLED_ROUNDS` | `1` | Minimum settled rounds required before a submission Bounty can pay out |
| `SUBMIT_REWARD_POOL_EXPIRES_AT` | `0` | Optional Unix timestamp for the submission Bounty expiry; `0` keeps it open-ended |
| `SUBMIT_ROUND_BLIND_PHASE_SECONDS` | Protocol default | Optional per-question blind phase for bot-created questions |
| `SUBMIT_ROUND_MAX_DURATION_SECONDS` | Protocol default | Optional per-question round deadline for bot-created questions |
| `SUBMIT_ROUND_MIN_VOTERS` | Protocol default | Optional minimum revealed voters before settlement |
| `SUBMIT_ROUND_MAX_VOTERS` | Protocol default | Optional voter cap for the question round |
| `X402_API_URL` | — | Hosted `/api/x402/questions` endpoint for paid submissions |
| `THIRDWEB_CLIENT_ID` | — | thirdweb client ID used to sign x402 payment headers from the bot wallet |
| `X402_MAX_PAYMENT_USDC` | Bounty amount | Maximum x402 spend per request in atomic USDC |
| `X402_USDC_TOKEN_ADDRESS` | — | Optional Celo USDC token override for operator checks |

**Optional External API Key:**

| Variable | Description |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API key |

**Tuning (optional):**

| Variable | Default | Description |
|---|---|---|
| `VOTE_STAKE` | — | cREP stake per vote |
| `VOTE_THRESHOLD` | — | Minimum confidence to cast a vote |
| `MAX_VOTES_PER_RUN` | — | Limit votes per execution |
| `MAX_SUBMISSIONS_PER_RUN` | — | Limit submissions per execution |
| `MAX_SUBMISSIONS_PER_CATEGORY` | — | Per-source cap during submission runs |
| `SUBMIT_REWARD_ASSET` | `usdc` | Reward-pool asset for submissions: `usdc` or `crep` |

`submit` also supports one-off CLI overrides:

- `--category <id|name>` to target a specific category such as `5` or `Media`
- `--source <name>` to target a specific source adapter such as `youtube`
- `--max-submissions <count>` to override the per-run cap for that invocation
- `--transport x402` to pay the hosted x402 API from the submit bot wallet instead of submitting directly on-chain
- `--help` to print the submit-specific usage text, including the full category/source catalog below

## How Claiming Works

`yarn bot:claim` scans Ponder history plus current on-chain claim state, then submits only the claims that are still outstanding for the configured bot wallets.

- Rating bot claims:
  - `RoundVotingEngine.claimCancelledRoundRefund(contentId, roundId)`
  - `RoundRewardDistributor.claimReward(contentId, roundId)`
  - `RoundRewardDistributor.claimParticipationReward(contentId, roundId)`

Frontend fee sweeping remains a keeper responsibility when the keeper wallet is also the frontend operator.

## Available Categories

`--category` accepts either the numeric ID or the category name. `--source` accepts the source adapter name.

| ID | Category | `--source` | Availability |
|---|---|---|---|
| `5` | Media | `youtube` | Requires `YOUTUBE_API_KEY` |

## How Submission Works

For each `submit` run, the bot:

1. Loads the wallet configured in `SUBMIT_*` and checks that it can submit. Submission no longer requires `hasVoterId(address)`, so a bot wallet can ask questions directly without a human identity gate.
2. Checks that the wallet has enough cREP or USDC for the next submission. Direct on-chain submissions need native gas for the approval, reservation, and submit transactions. x402 submissions need enough Celo USDC for the payment ceiling; the hosted API executor pays the on-chain gas.
3. Chooses the enabled source adapters and fetches trending content. The current bot source reads YouTube's most-popular video feed.
4. Skips items that do not provide a usable context URL, then checks the context-backed submission key for duplicates before attempting a transaction.
5. Truncates generated questions to the 120-character on-chain maximum and calls `previewQuestionSubmissionKey(contextUrl, imageUrls, videoUrl, title, description, tags, categoryId)` to verify the canonical category. Direct submissions then reserve the hidden submission commitment, wait a little over one second for the reservation age check, and submit the question with the matching salt, Bounty metadata, and governed round settings. x402 submissions send the same normalized question, Bounty metadata, and round settings to the hosted API, which settles Celo USDC and performs the on-chain submission from its executor wallet.
6. Stops when it reaches the configured limit, runs out of the selected funding token, or runs out of fresh items. If a direct reveal transaction fails after reservation, the bot attempts to cancel the reservation.

## Testing YouTube Questions With A Bot Wallet

This is the quickest way to test the bot against the current YouTube popular videos feed, submitted under the broad `Media` review category. The submit wallet does not need a Voter ID or delegation.

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
YOUTUBE_API_KEY=...
```

You can use a Foundry keystore instead of `SUBMIT_PRIVATE_KEY` if you prefer.

2. Start the services the bot depends on. For `submit`, the bot only needs a reachable RPC on the same deployment.

```bash
yarn ponder:dev # optional for submit, required for vote
```

If you are testing locally through the web app as well, run the app and Ponder against the same chain so indexed content appears in the UI.

3. Print the submit bot wallet address.

```bash
yarn bot:status
```

4. Fund the bot wallet.

- Send enough cREP or USDC for the batch you want to test. Each successful question submission must attach at least the governance minimum Bounty.
- Send enough native gas token as well so the bot can pay for approvals and submission transactions.
- Delegation is only needed if you also want the bot wallet to vote on behalf of a Voter ID holder.

5. Re-run the status command and confirm the bot wallet is ready.

```bash
yarn bot:status
```

You want to see:

- enough `USDC` or `cREP` for the configured `SUBMIT_REWARD_ASSET`
- enough native gas for the target chain

6. Run a focused YouTube submission.

```bash
yarn workspace @curyo/bot submit --source youtube --category "Media" --max-submissions 1
```

Once the one-item smoke test looks good, increase the cap:

```bash
yarn workspace @curyo/bot submit --source youtube --category "Media" --max-submissions 5
```

Expected behavior:

- The bot fetches YouTube's current popular videos.
- Already-submitted context URLs are skipped automatically.
- Only fresh items are submitted, so the run may submit fewer than the requested max if duplicates are common.
- Each successful submission must attach the minimum non-refundable Bounty in cREP or USDC.
- If `YOUTUBE_API_KEY` is missing, the YouTube source will return no items.

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
│   ├── claim.ts     # Claim bot voter rewards
│   └── status.ts    # Check balances and Voter ID
├── sources/         # Content platform adapters (public + API-backed)
└── strategies/      # Platform-specific rating strategies
```
