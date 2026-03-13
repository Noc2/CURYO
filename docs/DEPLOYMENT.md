# Curyo Mainnet Deployment Guide

Target chain: **Celo Mainnet** (chain ID `42220`)

## Prerequisites

- [ ] Foundry toolchain installed (`forge`, `cast`, `anvil`)
- [ ] Node.js 20+ and Yarn 3.x
- [ ] CELO for gas — buy from an exchange (Binance, Coinbase, KuCoin, etc.) and send to your deployer address
- [ ] Vercel account (for frontend hosting)
- [ ] Railway account (for Keeper, Ponder, and Bot services)
- [ ] TMDB API key (for bot content seeding)
- [ ] Alchemy API key (optional, for fallback RPC)

---

## 1. Create Wallets

You need **seven** wallets across three security tiers. Never reuse keys across roles.

| Role | Type | Holds | Notes |
|---|---|---|---|
| **Deployer** | Foundry keystore (temporary) | CELO for gas only | Roles renounced post-deploy; archive offline |
| **Cold Wallet A** | Paper / hardware wallet | Voter ID + bulk cREP | Private key NEVER touches a computer; delegates to submit-bot |
| **Cold Wallet B** | Paper / hardware wallet | Voter ID + bulk cREP | Private key NEVER touches a computer; delegates to rate-bot |
| **submit-bot** | Foundry keystore (hot) | Small cREP + gas | Delegate of Cold Wallet A; daily operations |
| **rate-bot** | Foundry keystore (hot) | Small cREP + gas | Delegate of Cold Wallet B; daily operations |
| **keeper** | Foundry keystore (hot) | Gas only (no cREP) | Reveals votes, progresses round state, cleans up unrevealed stake |
| **server** | Foundry keystore (hot) | Gas only | Next.js server operations |

### 1a. Create the Deployer key

```bash
cd packages/foundry
yarn deploy --network celo
# Select "0. Create new keystore" → name it "deployer"
# Set a strong password — write it down offline
```

This runs `cast wallet new` + `cast wallet import` under the hood. The key is stored encrypted at `~/.foundry/keystores/deployer`.

Get the address:

```bash
cast wallet address --account deployer
```

Fund it with CELO for gas (~0.5 CELO is plenty for deployment).

### 1b. Create Cold Wallets (2 identities for bots)

Cold wallets hold Voter IDs and bulk cREP. Their private keys **never touch any computer** after generation — they are written on paper and stored physically (safe deposit box, fireproof safe).

**Generate each cold wallet:**

Option A — Air-gapped machine:
```bash
# On an air-gapped (offline) machine:
cast wallet new
# Record the address AND private key on paper
# Destroy the digital copy immediately
```

Option B — Hardware wallet (Ledger, Trezor):
- Create two separate accounts on your hardware wallet
- Record the addresses — the hardware wallet manages the private keys

You need two cold wallets (one per bot identity):
- **Cold Wallet A** — will hold the Voter ID that delegates to submit-bot
- **Cold Wallet B** — will hold the Voter ID that delegates to rate-bot

**Fund both cold wallets** with CELO from an exchange (enough for a few transactions — ~0.1 CELO each). They only need gas for:
1. Claiming a Voter ID (one-time)
2. Claiming cREP from HumanFaucet (one-time)
3. Setting delegation (one-time)
4. Occasional top-up transfers to bot hot wallets

### 1c. Create Bot Hot Wallets

Two separate bot accounts — one for content submission, one for voting. Each operates as a **delegate** of its corresponding cold wallet.

```bash
# Submission bot
cast wallet new
cast wallet import submit-bot --private-key <PRIVATE_KEY>

# Rating/voting bot
cast wallet new
cast wallet import rate-bot --private-key <PRIVATE_KEY>
```

Fund both with a small amount of CELO for gas. They will receive operational cREP from their cold wallets after delegation is set up (Step 6).

> **Why separate keys?** Each Voter ID is non-transferable and bound to a single address. Submitting content and voting from the same address is blocked (submitters cannot vote on their own content). Separate keys also limit blast radius if one is compromised.

### 1d. Create the Keeper key

```bash
cast wallet new
cast wallet import keeper --private-key <PRIVATE_KEY>
```

Fund with a small amount of CELO for gas (~0.1 CELO to start — the keeper sends reveal, settle, reveal-failed, cleanup, cancel, and inactive-marking transactions).

### 1e. Create the Server key

```bash
cast wallet new
cast wallet import server --private-key <PRIVATE_KEY>
```

Fund with CELO for gas (server-side operations).

### 1f. Security checklist

- [ ] Cold wallet private keys exist **only on paper** — never stored digitally
- [ ] All hot wallet keys stored in Foundry encrypted keystores (`~/.foundry/keystores/`)
- [ ] Keystore passwords stored in a password manager (1Password, Bitwarden), never in plaintext `.env` files
- [ ] No raw private keys in `.env` files (use `KEYSTORE_ACCOUNT` + `KEYSTORE_PASSWORD` env vars)
- [ ] Each role uses a **dedicated** address — deployer, cold-a, cold-b, submit-bot, rate-bot, keeper, server are all different
- [ ] Deployer key will have its roles renounced after deployment (Step 2)
- [ ] Back up hot wallet keystores: `cp -r ~/.foundry/keystores/ <secure-backup-location>`

---

## 2. Deploy the Smart Contracts

### 2a. Configure environment

```bash
# packages/foundry/.env
ALCHEMY_API_KEY=<your-alchemy-key>        # Optional, Celo has free public RPC
```

`LOCALHOST_KEYSTORE_ACCOUNT` only affects localhost deploys. For Celo mainnet, use a dedicated non-default keystore
via `--keystore deployer`.

### 2b. Run deployment

```bash
yarn deploy --network celo --keystore deployer
```

This will:
1. Deploy `TimelockController` (2-day delay) + `CuryoGovernor`
2. Deploy `CuryoReputation` (cREP token, 100M max supply)
3. Deploy all UUPS proxy contracts (ContentRegistry, RoundVotingEngine, RoundRewardDistributor, ProfileRegistry, FrontendRegistry) and non-upgradeable contracts (CategoryRegistry, VoterIdNFT, ParticipationPool, HumanFaucet)
4. Wire cross-contract references
5. Seed 12 content categories, each with a ranking-question template that includes `{title}` and `{rating}`
6. Mint token allocations: 51,899,900→HumanFaucet, 34M→ParticipationPool, 4M→ConsensusReserve, 100K→KeeperRewardPool, 10M→Treasury
7. **Renounce deployer's temporary admin roles** — governance transfers fully to TimelockController
8. **Automatically verify** that governance owns the expected roles and the deployer retained none

### 2c. Verify contracts on Blockscout

Celo uses Blockscout, not Celoscan. Auto-verification is skipped. Verify manually:

```bash
cd packages/foundry
make verify-blockscout CONTRACT_ADDRESS=0x... CONTRACT_NAME=CuryoReputation
make verify-blockscout CONTRACT_ADDRESS=0x... CONTRACT_NAME=ContentRegistry
# Repeat for each contract
```

### 2d. Record deployed addresses

Addresses are written to:
- `packages/foundry/deployments/42220.json`
- `packages/contracts/src/deployedContracts.ts` (auto-generated)

Save a copy of these addresses somewhere safe. You'll need them for Ponder, Keeper, and Bot config.

### 2e. Post-deployment verification

`DeployCuryo.s.sol` now performs automatic post-deploy role verification at the end of the production deploy flow and
fails the deploy command if any deployer setup role remains or governance ownership is missing.

Manual spot-checks are still useful, but they are no longer the primary safety mechanism.

---

## 3. Deploy the Ponder Indexer

The indexer must be running **before** the frontend can display content. Deploy it before the frontend.

### 3a. Configure

The deploy step already refreshes `packages/ponder/.env.local` with the latest `PONDER_*_ADDRESS` and
`PONDER_*_START_BLOCK` values for Celo. Use that file as the source of truth for production.

For Railway, make sure the service has:
- `PONDER_NETWORK=celo`
- `PONDER_RPC_URL_42220=https://forno.celo.org` (or your paid RPC)
- All contract address and start-block vars from `packages/ponder/.env.local`
- `CORS_ORIGIN=https://<your-frontend-domain>`
- `RATE_LIMIT_TRUSTED_IP_HEADERS=x-forwarded-for` (or the header Railway/your proxy overwrites)
- `DATABASE_URL=<managed-postgres-url>`

### 3b. Deploy to Railway

```bash
# Create a new service in the same Railway project
cd packages/ponder
railway service create curyo-ponder

# Set environment variables
railway variables set PONDER_NETWORK=celo
railway variables set PONDER_RPC_URL_42220=https://forno.celo.org
railway variables set CORS_ORIGIN=https://<your-frontend-domain>
railway variables set RATE_LIMIT_TRUSTED_IP_HEADERS=x-forwarded-for
railway variables set DATABASE_URL=<managed-postgres-url>

# Deploy
railway up
```

Then copy the generated `PONDER_*_ADDRESS` and `PONDER_*_START_BLOCK` variables from
`packages/ponder/.env.local` into Railway.

Use managed PostgreSQL in production. PGlite remains fine for local development, but the Ponder package treats it as
dev-only because it is single-process and harder to back up or recover after corruption.

Expose a public domain in the Railway dashboard — you'll need the URL for `NEXT_PUBLIC_PONDER_URL` in Vercel.

### 3c. Verify

```bash
curl 'https://<ponder>.up.railway.app/content'
# Should return indexed content (empty initially, populated after bot seeding)
```

---

## 4. Deploy the Frontend

### 4a. Configure environment variables

Create production env vars (on Vercel dashboard or `.env.production`):

```env
# Public (exposed to browser)
NEXT_PUBLIC_ALCHEMY_API_KEY=<alchemy-key>
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<walletconnect-project-id>
NEXT_PUBLIC_TARGET_NETWORKS=42220
NEXT_PUBLIC_PONDER_URL=https://<your-ponder-domain>
NEXT_PUBLIC_FRONTEND_CODE=<your-frontend-address>   # Set after Step 5
NEXT_PUBLIC_DEV_FAUCET=false

# Server-side only
APP_URL=https://<your-domain>
DATABASE_URL=<turso-database-url>                    # e.g., libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=<turso-auth-token>
TMDB_API_KEY=<tmdb-api-key>
RAWG_API_KEY=<rawg-api-key>
KEYSTORE_ACCOUNT=server
KEYSTORE_PASSWORD=<server-keystore-password>
RATE_LIMIT_TRUSTED_IP_HEADERS=x-forwarded-for        # Or your platform's trusted client-IP header
DEV_FAUCET_ENABLED=false

# Optional: email notifications
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=<verified-from-address>
NOTIFICATION_DELIVERY_SECRET=<random-secret>
```

### 4b. Set up Turso database (production)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login

# Create database
turso db create curyo-prod
turso db show curyo-prod   # Get the URL
turso db tokens create curyo-prod   # Get the auth token

# Push schema
cd packages/nextjs
DATABASE_URL=<turso-url> DATABASE_AUTH_TOKEN=<token> yarn db:push
```

Before running `yarn db:push` against production, take a fresh Turso backup/export, test the migration against a copy
or staging database first, and keep the previous Vercel deployment available until the new schema has been exercised in
production.

### 4c. Deploy to Vercel

```bash
cd packages/nextjs
yarn vercel --prod
```

Set all environment variables from 4a in the Vercel dashboard under **Settings → Environment Variables** before deploying. Redeploy if you add variables after the first deploy.

Rate limiting note: Next.js 15 does not reliably expose `NextRequest.ip`. In production, set `RATE_LIMIT_TRUSTED_IP_HEADERS` only to headers that your edge proxy overwrites, such as `x-forwarded-for` on Vercel or `cf-connecting-ip` on Cloudflare. If you leave it unset, protected API routes fail closed with `503 Rate limiting is misconfigured`.

### 4d. Post-deploy checks

- [ ] Site loads, wallet connects on Celo Mainnet
- [ ] Contract interactions work (content list loads from Ponder)
- [ ] Self.xyz identity verification flow works

---

## 5. Register the Frontend

The frontend address earns 1% of losing stakes from votes placed through it. Registration requires a Voter ID and 1,000 cREP stake.

### 5a. Get a Voter ID for the server wallet

The server wallet needs a Voter ID. Use the HumanFaucet's Self.xyz verification flow from the deployed frontend.

### 5b. Acquire 1,000 cREP

Claim from HumanFaucet (gives cREP on verification).

### 5c. Approve + Register

```bash
# Approve cREP spending by FrontendRegistry
cast send <CuryoReputation> "approve(address,uint256)" <FrontendRegistry> 1000000000 \
  --account server \
  --rpc-url https://forno.celo.org

# Register (stakes fixed 1000 cREP)
cast send <FrontendRegistry> "register()" \
  --account server \
  --rpc-url https://forno.celo.org
```

### 5d. Get governance approval

On mainnet, the deployer has renounced all roles. Frontend approval requires a governance proposal:

1. Create a proposal via the CuryoGovernor to call `FrontendRegistry.approveFrontend(<server-address>)`
2. cREP holders vote on the proposal
3. After passing + timelock delay (2 days), execute the proposal

### 5e. Update frontend config

Set `NEXT_PUBLIC_FRONTEND_CODE=<server-address>` in your Vercel environment variables and redeploy. All votes through your frontend will now credit fees to your address.

---

## 6. Set Up Bot Identities (Cold Wallet + Delegation)

This is the core security architecture: cold wallets hold Voter IDs and bulk cREP, while bot hot wallets operate as delegates. The cold wallet private key **never touches a server**.

### 6a. Claim Voter IDs on cold wallets

Each cold wallet needs its own Voter ID, which requires a unique passport via Self.xyz verification (one passport = one Voter ID). You need **two separate verified identities** — one for each cold wallet.

For each cold wallet:
1. Connect the cold wallet to the frontend (hardware wallet, or temporarily import paper wallet key for this one-time step on a secure offline-capable machine)
2. Complete the Self.xyz identity verification flow
3. The HumanFaucet mints a non-transferable Voter ID to the cold wallet address

The Self.xyz verification hub address on Celo Mainnet is `0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF`.

### 6b. Claim cREP on cold wallets

Each cold wallet claims cREP from the HumanFaucet during the verification step above. This gives each cold wallet a starting balance of cREP.

### 6c. Set up delegation: cold wallet → bot hot wallet

Delegation allows the bot hot wallet to act on behalf of the cold wallet's Voter ID. The cold wallet calls `setDelegate()` once — after this, the cold wallet can go fully offline.

```bash
# Cold Wallet A delegates to submit-bot
cast send <VoterIdNFT> "setDelegate(address)" <submit-bot-address> \
  --account cold-wallet-a \
  --rpc-url https://forno.celo.org

# Cold Wallet B delegates to rate-bot
cast send <VoterIdNFT> "setDelegate(address)" <rate-bot-address> \
  --account cold-wallet-b \
  --rpc-url https://forno.celo.org
```

> If using a paper wallet: temporarily import the key into a Foundry keystore on a secure machine, sign the delegation tx, then **delete the keystore** (`rm ~/.foundry/keystores/cold-wallet-a`). The paper key remains the only copy.

After delegation is set, the bot hot wallet passes all Voter ID checks transparently — `commitVote`, `submitContent`, etc. all work as if the bot holds the Voter ID.

### 6d. Fund bot hot wallets with operational cREP + gas

Transfer a small operational amount of cREP from each cold wallet to its delegate bot:

```bash
# Transfer operational cREP to submit-bot (e.g. 100 cREP = 100_000_000 units)
cast send <CuryoReputation> "transfer(address,uint256)" <submit-bot-address> 100000000 \
  --account cold-wallet-a \
  --rpc-url https://forno.celo.org

# Transfer operational cREP to rate-bot
cast send <CuryoReputation> "transfer(address,uint256)" <rate-bot-address> 100000000 \
  --account cold-wallet-b \
  --rpc-url https://forno.celo.org
```

Also ensure both bot wallets have CELO for gas (~0.1 CELO each, sent from an exchange or another wallet).

### 6e. Top-up procedure

Periodically (e.g. weekly), top up bot hot wallets from cold wallets:

1. Briefly bring the cold wallet online (hardware wallet, or temporarily import paper key)
2. Transfer a small cREP amount to the bot hot wallet
3. Cold wallet goes back offline

Keep the bulk of cREP on the cold wallets. Bot wallets should only hold what they need for the next few days of operations.

---

## 7. Deploy the Keeper

The Keeper is a stateless service that reveals votes, settles eligible rounds, finalizes `RevealFailed` rounds, sweeps unrevealed-vote cleanup, cancels stale rounds, and marks inactive content. It needs only a funded wallet for gas.

### 7a. Configure

```bash
# packages/keeper/.env
RPC_URL=https://forno.celo.org
CHAIN_ID=42220
VOTING_ENGINE_ADDRESS=<RoundVotingEngine-address>
CONTENT_REGISTRY_ADDRESS=<ContentRegistry-address>
KEYSTORE_ACCOUNT=keeper
KEYSTORE_PASSWORD=<keeper-keystore-password>
KEEPER_INTERVAL_MS=30000
KEEPER_STARTUP_JITTER_MS=0
KEEPER_CLEANUP_BATCH_SIZE=25
METRICS_ENABLED=true
METRICS_PORT=9090
LOG_FORMAT=json
```

### 7b. Deploy to Railway

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login

# Create project and service
railway init          # Name it "curyo-keeper"
railway link

# Set environment variables
railway variables set RPC_URL=https://forno.celo.org
railway variables set CHAIN_ID=42220
railway variables set VOTING_ENGINE_ADDRESS=<RoundVotingEngine-address>
railway variables set CONTENT_REGISTRY_ADDRESS=<ContentRegistry-address>

# Railway usually uses the raw key fallback because the container does not ship
# with ~/.foundry/keystores by default.
railway variables set KEEPER_PRIVATE_KEY=<keeper-private-key>
railway variables set KEEPER_INTERVAL_MS=30000
railway variables set METRICS_ENABLED=true
railway variables set METRICS_PORT=9090
railway variables set LOG_FORMAT=json

# Deploy (uses the Dockerfile in packages/keeper/)
cd packages/keeper
railway up
```

Railway will auto-detect the Dockerfile, build, and deploy. Set up a public domain in the Railway dashboard if you want external health checks.

### 7c. Verify it's running

```bash
# Use the Railway-assigned domain or check logs
railway logs

# If you exposed a public domain:
curl 'https://<keeper>.up.railway.app/health'
# Should return healthy status

curl 'https://<keeper>.up.railway.app/metrics'
# Should show Prometheus metrics (roundsResolved, roundsCancelled, etc.)
```

### 7d. Redundancy (recommended)

Run 2+ Keeper instances with different wallets only if you are intentionally operating an active / standby model.

- Keep one primary instance actively sending transactions.
- Keep the standby healthy and funded, but only promote it when the primary is unhealthy.
- If you do run more than one active writer, use `KEEPER_STARTUP_JITTER_MS` and accept that duplicate transactions can
  still race and waste gas because there is no nonce coordinator.
- Document a manual failover procedure up front: disable the primary, confirm the standby has gas and a healthy
  `/health` endpoint, then promote only one instance back to active transaction sending.

---

## 8. Seed Content with Bots

The bot package contains two specialized bots that work together:

- **Submission Bot** (`yarn submit`) — discovers trending content from 9 platforms (YouTube, TMDB, RAWG, Wikipedia, Twitch, OpenLibrary, HuggingFace, Scryfall, CoinGecko) and submits URL, title, description, tags, and category metadata on-chain
- **Rating Bot** (`yarn vote`) — fetches active content from Ponder, rates it using external APIs (like ratio, review scores, market data), and places votes on-chain

Each bot uses a **delegate hot wallet** — the Voter ID stays safe on the cold wallet.

### 8a. Check bot status

```bash
cd packages/bot
yarn status
# Shows: addresses, CELO balances, cREP balances, Voter ID status (via delegation), round config
```

### 8b. Configure bots

```bash
# packages/bot/.env

# --- Network ---
RPC_URL=https://forno.celo.org
CHAIN_ID=42220
PONDER_URL=https://<your-ponder-domain>
CREP_TOKEN_ADDRESS=<CuryoReputation-address>
CONTENT_REGISTRY_ADDRESS=<ContentRegistry-address>
VOTING_ENGINE_ADDRESS=<RoundVotingEngine-address>
VOTER_ID_NFT_ADDRESS=<VoterIdNFT-address>
CATEGORY_REGISTRY_ADDRESS=<CategoryRegistry-address>

# --- Submission Bot Identity ---
SUBMIT_KEYSTORE_ACCOUNT=submit-bot
SUBMIT_KEYSTORE_PASSWORD=<submit-bot-keystore-password>

# --- Rating Bot Identity ---
RATE_KEYSTORE_ACCOUNT=rate-bot
RATE_KEYSTORE_PASSWORD=<rate-bot-keystore-password>

# --- Voting ---
VOTE_STAKE=1000000            # 1 cREP per vote (6 decimals)
VOTE_THRESHOLD=5.0            # Score >= 5.0 → UP, < 5.0 → DOWN

# --- Rate Limits ---
MAX_VOTES_PER_RUN=10
MAX_SUBMISSIONS_PER_RUN=5
MAX_SUBMISSIONS_PER_CATEGORY=3

# --- External API Keys (for content discovery & rating) ---
TMDB_API_KEY=<tmdb-api-key>
YOUTUBE_API_KEY=<youtube-api-key>
TWITCH_CLIENT_ID=<twitch-client-id>
TWITCH_CLIENT_SECRET=<twitch-client-secret>
RAWG_API_KEY=<rawg-api-key>
```

### 8c. Submit initial content

```bash
cd packages/bot

# Submit trending content across all configured bot source categories
yarn submit
```

The submission bot will:
1. Check that the submit-bot wallet has a Voter ID (via delegation from Cold Wallet A) and sufficient cREP (10 cREP per submission)
2. Fetch trending content from each configured source
3. Skip already-submitted URLs (deduplication)
4. Submit up to `MAX_SUBMISSIONS_PER_RUN` items (max `MAX_SUBMISSIONS_PER_CATEGORY` per source)

### 8d. Vote on content

```bash
# Rate content via external APIs and place votes
yarn vote
```

The rating bot will:
1. Check that the rate-bot wallet has a Voter ID (via delegation from Cold Wallet B) and sufficient cREP
2. Fetch active content from the Ponder indexer
3. For each item, call the matching rating strategy (YouTube like ratio, TMDB score, Steam reviews, etc.)
4. Determine vote direction: score >= `VOTE_THRESHOLD` → UP, otherwise → DOWN
5. Commit the vote on-chain via `CuryoReputation.transferAndCall(votingEngine, stakeAmount, abi.encode(contentId, commitHash, ciphertext, frontend))` — the vote direction is encrypted with tlock timelock encryption and hidden until reveal (up to `MAX_VOTES_PER_RUN`)

After each blind phase ends, the Keeper service reveals committed votes using `revealVoteByCommitKey()`, settles or finalizes rounds once eligible, and sweeps unrevealed-vote cleanup on terminal rounds. The reveal path is still a keeper/drand-assisted off-chain decryption flow: the chain checks commit consistency against `keccak256(ciphertext)`, but it does not yet prove on-chain that the ciphertext was honestly decryptable. If the protocol is hardened further later, this is a natural place to add zk-based reveal proofs. Each content item is voted on only once (the bot tracks previous votes).

### 8e. Verify the full loop

1. Submission bot submits content → visible on frontend
2. Rating bot commits encrypted votes → vote directions hidden on-chain until reveal
3. Blind phase ends → Keeper reveals votes via `revealVoteByCommitKey()`
4. Keeper calls `settleRound(contentId, roundId)` → round outcome determined, rewards distributed (weighted by phase), ratings updated
5. Content ratings visible on frontend

### 8f. Ongoing operation

With delegation, the bot hot wallets hold minimal funds and no Voter IDs — cloud deployment is acceptable since the identity stays on the cold wallet.

**Option A: Local cron (recommended)**

Run bots on your own machine with encrypted keystores:

```bash
# macOS: store keystore passwords in Keychain
security add-generic-password -s "submit-bot" -a "$USER" -w "<password>"
security add-generic-password -s "rate-bot" -a "$USER" -w "<password>"

# Add to crontab (crontab -e)
0 */6 * * * cd ~/source/curyo-release/packages/bot && SUBMIT_KEYSTORE_ACCOUNT=submit-bot SUBMIT_KEYSTORE_PASSWORD=$(security find-generic-password -s "submit-bot" -w) yarn submit >> /tmp/curyo-submit.log 2>&1
0 * * * *   cd ~/source/curyo-release/packages/bot && RATE_KEYSTORE_ACCOUNT=rate-bot RATE_KEYSTORE_PASSWORD=$(security find-generic-password -s "rate-bot" -w) yarn vote >> /tmp/curyo-vote.log 2>&1
```

**Option B: Railway (acceptable with delegation)**

Since the Voter ID stays on the cold wallet, deploying bot hot wallets to Railway is acceptable — a compromise only exposes the small operational cREP balance, not the identity.

```bash
cd packages/bot
railway service create curyo-bot

railway variables set RPC_URL=https://forno.celo.org
railway variables set CHAIN_ID=42220
railway variables set PONDER_URL=https://<ponder>.up.railway.app
railway variables set CREP_TOKEN_ADDRESS=<CuryoReputation-address>
railway variables set CONTENT_REGISTRY_ADDRESS=<ContentRegistry-address>
railway variables set VOTING_ENGINE_ADDRESS=<RoundVotingEngine-address>
railway variables set VOTER_ID_NFT_ADDRESS=<VoterIdNFT-address>
railway variables set CATEGORY_REGISTRY_ADDRESS=<CategoryRegistry-address>
railway variables set TMDB_API_KEY=<tmdb-api-key>
railway variables set YOUTUBE_API_KEY=<youtube-api-key>
railway variables set RAWG_API_KEY=<rawg-api-key>
railway variables set SUBMIT_PRIVATE_KEY=<submit-bot-private-key>
railway variables set RATE_PRIVATE_KEY=<rate-bot-private-key>
```

Set up two cron schedules in the Railway dashboard:
- **Submit**: `0 */6 * * *` (every 6 hours) → `yarn submit`
- **Vote**: `0 * * * *` (every hour) → `yarn vote`

---

## 9. Security Hardening

### 9a. Cold wallet security

- [ ] Cold wallet private keys exist **only on paper** (or in a hardware wallet) — never stored digitally
- [ ] Paper keys stored in a secure physical location (safe deposit box, fireproof safe)
- [ ] Each cold wallet holds a non-transferable Voter ID — if the key is lost, the identity cannot be recovered or transferred
- [ ] Cold wallets only come online briefly for top-up transfers; delegation is a one-time setup
- [ ] Consider splitting paper keys across two locations (e.g. first half in home safe, second half in bank deposit box)

### 9b. Hot wallet principle of least privilege

- [ ] Deployer keystore is **archived offline** — it has no remaining roles after deployment
- [ ] Keeper wallet holds **minimal gas only** — it cannot access protocol funds
- [ ] Bot wallets hold **minimal gas + small operational cREP** — only what they need for the next few days
- [ ] Server wallet credentials stored in Vercel environment variables (encrypted at rest), not in repo
- [ ] No raw private keys in any `.env` file committed to git — `.gitignore` covers all `.env*` files
- [ ] Bot wallets do NOT hold Voter IDs — identity stays on cold wallets via delegation

### 9c. Infrastructure security

- [ ] Railway services expose **only** the necessary ports (Ponder: 42069, Keeper: 9090)
- [ ] Ponder API endpoint is rate-limited (use Railway's built-in networking or a Cloudflare proxy)
- [ ] HTTPS everywhere — Railway provides TLS by default on public domains
- [ ] Keeper metrics port (9090) is either private (Railway internal networking) or protected behind auth
- [ ] Enable Vercel's DDoS protection and edge caching for the frontend

### 9d. Contract security

- [ ] All admin roles have been renounced by deployer and transferred to governance (TimelockController)
- [ ] UUPS upgrade authority is held by governance only (`UPGRADER_ROLE`)
- [ ] Frontend operators require governance approval — no self-approval on mainnet
- [ ] HumanFaucet requires Self.xyz identity verification (one person, one vote)
- [ ] TimelockController enforces 2-day delay on all governance actions

### 9e. Governance parameter tuning

Several voting parameters are tunable via governance (`CONFIG_ROLE`) and should be adjusted as the protocol grows:

- **`minVoters`** (default: 3) — the minimum number of revealed votes required to settle a round. At low values, a small coordinated group can dominate round outcomes. **It is highly recommended to increase `minVoters` as the user base grows** (e.g., 5–10 for moderate activity, 15+ for high activity). This raises the cost of collusion attacks, content rating manipulation, and selective revelation strategies. The parameter accepts values from 2 to 10,000.
- **`epochDuration`** (default: 20 minutes) — longer epochs give more time for voter participation before reveals begin but delay settlement. Shorter epochs speed up rounds but reduce the blind voting window.
- **`maxVoters`** (default: 1,000) — the voter cap per round. Raise if rounds consistently hit the cap.

These parameters can be updated via governance proposal (2-day timelock delay). Monitor round statistics (average voter count, unanimous round frequency, participation pool drain rate) to inform tuning decisions.

### 9f. Monitoring

- [ ] Set up alerts on Keeper health endpoint (e.g., UptimeRobot, Betterstack)
- [ ] Monitor Keeper gas balance — alert if below 0.05 CELO
- [ ] Monitor `keeperRewardPool` — warning below 25,000 cREP, critical below 10,000 cREP
- [ ] Monitor `consensusReserve` — warning below 1,000,000 cREP, critical below 250,000 cREP
- [ ] Monitor bot wallet cREP balances — a sudden drain indicates compromise
- [ ] Monitor Ponder sync status — alert if it falls behind chain head
- [ ] Watch for unusual governance proposals (TimelockController events)
- [ ] Monitor for unexpected transactions from bot or cold wallet addresses (Blockscout watch)

Treat the thresholds in this section as the baseline runbook and attach your pager/incident workflow directly to them.

#### Protocol pool monitoring

The governance page now exposes a **Protocol Pools** panel with live balances for Treasury, Consensus Reserve, Keeper
Reward Pool, Participation Pool, and Human Faucet. Use this as the fastest operator sanity check, but do **not** rely
on the UI alone for alerting.

For machine monitoring, poll the `RoundVotingEngine` pool balances directly:

```bash
# Raw values use 6 decimals (1 cREP = 1_000_000)
cast call <RoundVotingEngine> "keeperRewardPool()(uint256)" \
  --rpc-url https://forno.celo.org

cast call <RoundVotingEngine> "consensusReserve()(uint256)" \
  --rpc-url https://forno.celo.org
```

Suggested thresholds:

- **Keeper Reward Pool** — initial funding is **100,000 cREP**
  - Warning: **25,000 cREP** (`25_000_000_000`)
  - Critical: **10,000 cREP** (`10_000_000_000`)
- **Consensus Reserve** — initial funding is **4,000,000 cREP**
  - Warning: **1,000,000 cREP** (`1_000_000_000_000`)
  - Critical: **250,000 cREP** (`250_000_000_000`)

Interpretation:

- `keeperRewardPool` depletion does **not** halt reveals/settlement, but it removes the direct cREP incentive to run
  keeper infrastructure.
- `consensusReserve` depletion does **not** halt contested rounds, but unanimous / one-sided rounds stop receiving the
  5% consensus subsidy until refilled.

At minimum, set one alert that fires on the **warning** threshold and pages on the **critical** threshold. If you do
not yet have dedicated Prometheus/Grafana coverage for these balances, schedule a small periodic RPC check (Betterstack,
cron + webhook, GitHub Action, etc.) around the `cast call` commands above.

#### Protocol pool refill runbook

Both pool top-up functions on `RoundVotingEngine` pull tokens with `safeTransferFrom(msg.sender, ...)`, so a treasury
refill must include **both** an ERC-20 approval and the funding call in the **same governance proposal execution
batch**.

1. Confirm the low balance in two places:
   - Governance UI → **Governance** tab → **Protocol Pools**
   - Direct on-chain check via `cast call`
2. Decide the target restoration level:
   - Default target for `keeperRewardPool`: restore to **100,000 cREP**
   - Default target for `consensusReserve`: restore to **4,000,000 cREP**
3. Calculate the refill amount as `target - currentBalance`.
4. Create a governance proposal executed by the timelock with these calls, in order:
   - `CuryoReputation.approve(<RoundVotingEngine>, amount)`
   - `RoundVotingEngine.fundKeeperRewardPool(amount)`
   - or `RoundVotingEngine.addToConsensusReserve(amount)`
5. Vote, queue, and execute the proposal after the standard **2-day timelock**.
6. Verify the refill:
   - Governance UI pool balances updated
   - `cast call` returns the new balance
   - Keeper / operator notes record the refill date, amount, and proposal ID

If both pools are low, batch all three calls into a single proposal:

1. `approve(<RoundVotingEngine>, keeperAmount + reserveAmount)`
2. `fundKeeperRewardPool(keeperAmount)`
3. `addToConsensusReserve(reserveAmount)`

This keeps the approval scope minimal and avoids leaving a large standing allowance from the treasury to
`RoundVotingEngine`.

### 9g. Secrets rotation plan

| Secret | Rotation frequency | How |
|--------|-------------------|-----|
| Keeper keystore | On compromise | Create new wallet, fund, update Railway env |
| Submit-bot keystore | On compromise | Create new delegate wallet, update delegation from Cold Wallet A, fund, update env |
| Rate-bot keystore | On compromise | Create new delegate wallet, update delegation from Cold Wallet B, fund, update env |
| Server keystore | On compromise | Create new wallet, fund, update Vercel env |
| NOTIFICATION_DELIVERY_SECRET (if enabled) | Quarterly | Regenerate, update Vercel env and cron caller |
| DATABASE_AUTH_TOKEN | Quarterly | `turso db tokens create`, update Vercel env |
| ALCHEMY_API_KEY | On compromise | Rotate in Alchemy dashboard |

> **Bot key compromise recovery:** With delegation, a compromised bot key does NOT compromise the Voter ID. Simply: (1) call `setDelegate(newBotAddress)` from the cold wallet to revoke the old delegate, (2) create a new bot wallet, (3) fund it and update env vars. No governance action needed, no identity loss.

---

## Deployment Order Summary

```
1.  Create wallets (deployer, 2 cold wallets, submit-bot, rate-bot, keeper, server)
2.  Fund deployer with CELO (buy from exchange)
3.  Deploy contracts (yarn deploy --network celo --keystore deployer)
4.  Verify contracts on Blockscout
5.  Deploy Ponder indexer to Railway (with volume for PGlite persistence)
6.  Deploy frontend to Vercel (with Ponder URL, contract addresses)
7.  Register frontend in FrontendRegistry (1,000 cREP stake + governance proposal)
8.  Set up bot identities on cold wallets (Voter ID + cREP via Self.xyz / HumanFaucet)
9.  Set delegation: cold wallets → bot hot wallets (setDelegate)
10. Fund bot hot wallets with operational cREP + gas
11. Deploy Keeper to Railway (point at RoundVotingEngine + ContentRegistry)
12. Run bots (local cron or Railway) — submit content, vote
13. Verify full loop: submit → vote → reveal → resolve → display
14. Set up monitoring and alerts
```
