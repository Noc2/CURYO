# Curyo Production Deployment Plan

Target chain: **Celo Sepolia** (testnet) → then **Celo mainnet**

## Prerequisites

- [ ] Foundry toolchain installed (`forge`, `cast`, `anvil`)
- [ ] Node.js 20+ and Yarn 3.x
- [ ] Celo Sepolia ETH for gas (from faucet: https://faucet.celo.org/alfajores)
- [ ] Vercel account (for frontend hosting)
- [ ] Railway account (for Keeper, Ponder, and Bot services)
- [ ] TMDB API key (for bot content seeding)
- [ ] Alchemy API key (optional, for fallback RPC)

---

## 1. Create Secure Keys

You need **five** separate keystore accounts. Never reuse keys across roles.

### 1a. Create the Deployer key

```bash
cd packages/foundry
yarn deploy --network celoSepolia
# Select "0. Create new keystore" → name it "deployer"
# Set a strong password — write it down offline
```

This runs `cast wallet new` + `cast wallet import` under the hood. The key is stored encrypted at `~/.foundry/keystores/deployer`.

Get the address:

```bash
cast wallet address --account deployer
```

Fund it with Celo Sepolia ETH for gas (~0.5 CELO should be plenty for deployment).

### 1b. Create the Keeper key

```bash
cast wallet new
# Copy the private key
cast wallet import keeper --private-key <PRIVATE_KEY>
# Set a password
```

Fund with a small amount of CELO for gas (~0.1 CELO, the keeper only sends settle/cancel/dormancy txns).

### 1c. Create the Bot keys

Two separate bot accounts are required — one for content submission, one for voting. **Each bot needs its own Voter ID**, which requires a unique passport via Self.xyz verification (one passport = one Voter ID). If you are a single operator, you will need two different verified identities.

```bash
# Submission bot
cast wallet new
cast wallet import submit-bot --private-key <PRIVATE_KEY>

# Rating/voting bot
cast wallet new
cast wallet import rate-bot --private-key <PRIVATE_KEY>
```

Fund both with CELO for gas. Both bots need cREP and a Voter ID (acquired from the HumanFaucet after Self.xyz verification).

> **Why separate keys?** Each Voter ID is soulbound to a single address. Submitting content and voting from the same address is blocked (submitters cannot vote on their own content). Separate keys also limit blast radius if one is compromised.

### 1d. Create the Faucet/Server key (for Next.js server-side operations)

```bash
cast wallet new
cast wallet import server --private-key <PRIVATE_KEY>
```

Fund with CELO for gas (the dev faucet sends test tokens server-side).

### 1e. Security checklist

- [ ] All private keys stored **only** in Foundry encrypted keystores (`~/.foundry/keystores/`)
- [ ] Passwords stored in a password manager (1Password, Bitwarden), never in `.env` files on disk in plaintext for production
- [ ] No raw private keys in `.env` files (use `KEYSTORE_ACCOUNT` + `KEYSTORE_PASSWORD` env vars, or secrets manager)
- [ ] Each role uses a **dedicated** address — deployer, keeper, submit-bot, rate-bot, server are all different
- [ ] Deployer key will have its roles renounced after deployment (see Step 2)
- [ ] Back up keystores: `cp -r ~/.foundry/keystores/ <secure-backup-location>`

---

## 2. Deploy the Smart Contracts

### 2a. Configure environment

```bash
# packages/foundry/.env
ALCHEMY_API_KEY=<your-alchemy-key>        # Optional, Celo has free public RPC
ETHERSCAN_API_KEY=<not-used-for-celo>
LOCALHOST_KEYSTORE_ACCOUNT=scaffold-eth-default
```

### 2b. Run deployment

```bash
yarn deploy --network celoSepolia --keystore deployer
```

This will:
1. Deploy `TimelockController` (2-day delay) + `CuryoGovernor`
2. Deploy `CuryoReputation` (cREP token, 100M max supply)
3. Deploy all UUPS proxy contracts (ContentRegistry, RoundVotingEngine, RoundRewardDistributor, ProfileRegistry, FrontendRegistry) and non-upgradeable contracts (CategoryRegistry, VoterIdNFT, ParticipationPool, HumanFaucet)
4. Wire cross-contract references
5. Seed 11 content categories
6. Mint token allocations: 52M→HumanFaucet, 34M→ParticipationPool, 4M→ConsensusReserve, 10M→Treasury
7. **Renounce deployer's temporary admin roles** — governance transfers fully to TimelockController

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
- `packages/foundry/deployments/11142220.json`
- `packages/nextjs/contracts/deployedContracts.ts` (auto-generated)

Save a copy of these addresses somewhere safe. You'll need them for Ponder, Keeper, and Bot config.

### 2e. Post-deployment verification

```bash
# Confirm governance owns all admin roles (deployer should have none)
cast call <ContentRegistry> "hasRole(bytes32,address)(bool)" $(cast keccak "ADMIN_ROLE") <deployer-address> --rpc-url https://forno.celo-sepolia.celo-testnet.org
# Should return false

# Confirm TimelockController has governance
cast call <ContentRegistry> "hasRole(bytes32,address)(bool)" $(cast keccak "ADMIN_ROLE") <timelock-address> --rpc-url https://forno.celo-sepolia.celo-testnet.org
# Should return true
```

---

## 3. Deploy the Frontend

### 3a. Configure environment variables

Create production env vars (on Vercel dashboard or `.env.production`):

```env
# Public (exposed to browser)
NEXT_PUBLIC_ALCHEMY_API_KEY=<alchemy-key>
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<walletconnect-project-id>
NEXT_PUBLIC_TMDB_API_KEY=<tmdb-api-key>
NEXT_PUBLIC_PONDER_URL=https://<your-ponder-domain>
NEXT_PUBLIC_FRONTEND_CODE=<your-frontend-address>   # Set after Step 4
NEXT_PUBLIC_DEV_FAUCET=false                         # true only on testnet

# Server-side only
NEXTAUTH_URL=https://<your-domain>
NEXTAUTH_SECRET=<random-32-byte-hex>
DATABASE_URL=<turso-database-url>                    # e.g., libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=<turso-auth-token>
KEYSTORE_ACCOUNT=server
KEYSTORE_PASSWORD=<server-keystore-password>
DEV_FAUCET_ENABLED=false                             # true only on testnet
```

### 3b. Set up Turso database (production)

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

### 3c. Deploy to Vercel

```bash
cd packages/nextjs
yarn vercel --prod
```

Set all environment variables from 3a in the Vercel dashboard under **Settings → Environment Variables** before deploying. Redeploy if you add variables after the first deploy.

### 3d. Post-deploy checks

- [ ] Site loads, wallet connects on Celo Sepolia
- [ ] Contract interactions work (content list loads from Ponder)
- [ ] HumanFaucet / Self.xyz identity verification flow works

---

## 4. Register the Frontend

The frontend address earns 1% of the losing pool from votes placed through it. Registration requires a Voter ID and 1,000 cREP stake.

### 4a. Get a Voter ID

The frontend operator address needs a VoterIdNFT first. Use the HumanFaucet's Self.xyz verification flow from the deployed frontend, or if on testnet with dev faucet enabled, use that.

### 4b. Acquire 1,000 cREP

On testnet: claim from HumanFaucet (gives cREP on verification). On mainnet: acquire through the ParticipationPool or other distribution mechanisms.

### 4c. Approve + Register

```bash
# Approve cREP spending by FrontendRegistry
cast send <CuryoReputation> "approve(address,uint256)" <FrontendRegistry> 1000000000 \
  --account server \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org

# Register (stakes fixed 1000 cREP)
cast send <FrontendRegistry> "register()" \
  --account server \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org
```

### 4d. Get governance approval

On testnet where deployer still has governance: self-approve. On production: submit a governance proposal.

```bash
# Testnet only — deployer has governance role
cast send <FrontendRegistry> "approveFrontend(address)" <server-address> \
  --account deployer \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org
```

### 4e. Update frontend config

Set `NEXT_PUBLIC_FRONTEND_CODE=<server-address>` in your Vercel environment variables and redeploy. All votes through your frontend will now credit fees to your address.

---

## 5. Deploy the Keeper

The Keeper is a stateless service that settles rounds, cancels stale content, and marks dormant items. It needs only a funded wallet for gas.

### 5a. Configure

```bash
# packages/keeper/.env
RPC_URL=https://forno.celo-sepolia.celo-testnet.org
CHAIN_ID=11142220
VOTING_ENGINE_ADDRESS=<RoundVotingEngine-address>
CONTENT_REGISTRY_ADDRESS=<ContentRegistry-address>
KEYSTORE_ACCOUNT=keeper
KEYSTORE_PASSWORD=<keeper-keystore-password>
KEEPER_INTERVAL_MS=30000
KEEPER_STARTUP_JITTER_MS=0
METRICS_ENABLED=true
METRICS_PORT=9090
LOG_FORMAT=json
```

### 5b. Deploy to Railway

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login

# Create project and service
railway init          # Name it "curyo-keeper"
railway link

# Set environment variables
railway variables set RPC_URL=https://forno.celo-sepolia.celo-testnet.org
railway variables set CHAIN_ID=11142220
railway variables set VOTING_ENGINE_ADDRESS=<RoundVotingEngine-address>
railway variables set CONTENT_REGISTRY_ADDRESS=<ContentRegistry-address>
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

### 5c. Verify it's running

```bash
# Use the Railway-assigned domain or check logs
railway logs

# If you exposed a public domain:
curl https://<keeper>.up.railway.app/health
# Should return healthy status

curl https://<keeper>.up.railway.app/metrics
# Should show Prometheus metrics (roundsSettled, roundsCancelled, etc.)
```

### 5d. Redundancy (recommended)

Run 2+ Keeper instances with different wallets. Duplicate transactions simply revert (no harm). Use `KEEPER_STARTUP_JITTER_MS` to stagger instances and reduce wasted gas.

---

## 6. Security Hardening

### 6a. Key security

- [ ] Deployer keystore is **archived offline** — it has no remaining roles after deployment, but keep it safe for potential future reference
- [ ] Keeper wallet holds **minimal gas only** — it cannot access protocol funds
- [ ] Bot wallets hold **minimal gas + cREP** — only what they need to submit/vote
- [ ] Server wallet credentials stored in Vercel environment variables (encrypted at rest), not in repo
- [ ] No raw private keys in any `.env` file committed to git — `.gitignore` covers all `.env*` files

### 6a-1. Bot key security (Voter ID protection)

Bot keys are **especially sensitive** because each is linked to a soulbound Voter ID. If a bot key is compromised, the attacker gains a verified identity that cannot be re-issued to the same passport.

**Why cloud secrets managers are NOT ideal for bot keys:**

Cloud providers (Railway encrypted variables, AWS Secrets Manager, etc.) still store and decrypt your private key in their infrastructure. For a regular API key this is fine, but a blockchain private key tied to a soulbound identity has a unique risk: if compromised, the Voter ID cannot be re-issued to the same passport — you permanently lose that identity. Trusting a third party with this key defeats the purpose of self-custody.

**Why multisig (Safe) doesn't work:**

The VoterIdNFT is soulbound and non-transferable. All contract interactions (`vote`, `submitContent`) require `msg.sender` to hold a Voter ID. A Safe multisig address cannot receive a soulbound NFT in a useful way, and there is no delegation or session key mechanism in the current contracts. The signing key **must** be the same EOA that holds the Voter ID.

**Recommended approaches (best → acceptable):**

**1. Transaction queue + local signing (recommended)**

The bot runs on Railway (or any server) **without any private key**. It prepares unsigned transactions and stores them in a queue. You review and sign them locally with a hardware wallet or Foundry keystore.

Flow:
1. Bot discovers content / rates items → generates unsigned tx calldata
2. Bot writes pending transactions to a queue (JSON file, SQLite, or API endpoint)
3. You review pending transactions locally (CLI or simple web UI)
4. You sign and submit a batch using `cast send` with your hardware wallet or keystore
5. Bot marks transactions as submitted

This eliminates hot key risk entirely. The private key never leaves your local machine. Content submission is not time-critical, so batch signing once or twice a day works well. Voting has round deadlines but a daily signing window is usually sufficient given 15-minute epochs.

**2. Run bots locally**

Run the bot on your own machine using a Foundry encrypted keystore. The key never leaves your device. Schedule runs with cron:

```bash
# Local crontab
0 */6 * * * cd ~/source/curyo/packages/bot && KEYSTORE_PASSWORD=$(security find-generic-password -s "submit-bot" -w) yarn submit
0 * * * *   cd ~/source/curyo/packages/bot && KEYSTORE_PASSWORD=$(security find-generic-password -s "rate-bot" -w) yarn vote
```

On macOS, store keystore passwords in Keychain. On Linux, use `secret-tool` or `pass`. The key is encrypted at rest and only decrypted in memory during execution.

**3. Cloud deployment with encrypted variables (acceptable for testnet)**

If you accept the trust tradeoff (e.g., on testnet where the Voter ID has no real value), you can use Railway encrypted variables. See section 7f. This is the simplest setup but means Railway infrastructure has access to your key.

**Principle of least privilege (all approaches):**
- [ ] Fund bot wallets with only enough cREP for the next few runs (e.g. 50-100 cREP), not the full faucet claim
- [ ] Keep the bulk of cREP in a separate cold wallet and top up periodically
- [ ] Fund with minimal CELO for gas (~0.1 CELO at a time)

**Monitoring and response:**
- [ ] Set up balance alerts — a sudden drain indicates compromise
- [ ] Monitor for unexpected transactions from bot addresses (Blockscout watch or custom Ponder alerts)
- [ ] **Incident response plan**: if compromised, immediately report the Voter ID to governance for revocation (`VoterIdNFT.revoke(tokenId)`), then create a new wallet and re-verify with a new passport

**Contract-level delegation (implemented):**

VoterIdNFT now supports delegation: the SBT holder (cold wallet) calls `setDelegate(botAddress)` once, and the bot operates with its own key while transparently passing all Voter ID checks. The cold wallet's private key never touches a server. See the [Delegation & Security docs](/docs/delegation) for full setup instructions and security recommendations.

- [ ] Set up delegation from cold wallet to bot key via Governance > Profile > Delegation
- [ ] Store cold wallet (SBT holder) offline on a hardware wallet after setting delegate
- [ ] Fund delegate with only the cREP needed for upcoming operations

### 6b. Infrastructure security

- [ ] Railway services expose **only** the necessary ports (Ponder: 42069, Keeper: 9090)
- [ ] Ponder API endpoint is rate-limited (use Railway's built-in networking or a Cloudflare proxy)
- [ ] HTTPS everywhere — Railway provides TLS by default on public domains
- [ ] Keeper metrics port (9090) is either private (Railway internal networking) or protected behind auth
- [ ] Enable Vercel's DDoS protection and edge caching for the frontend

### 6c. Contract security

- [ ] All admin roles have been renounced by deployer and transferred to governance (TimelockController)
- [ ] UUPS upgrade authority is held by governance only (`UPGRADER_ROLE`)
- [ ] Frontend operators require governance approval — no self-approval on mainnet
- [ ] HumanFaucet requires Self.xyz identity verification (sybil resistance)
- [ ] TimelockController enforces 2-day delay on all governance actions

### 6d. Monitoring

- [ ] Set up alerts on Keeper health endpoint (e.g., UptimeRobot, Betterstack)
- [ ] Monitor Keeper gas balance — alert if below 0.05 CELO
- [ ] Monitor Ponder sync status — alert if it falls behind chain head
- [ ] Watch for unusual governance proposals (TimelockController events)

### 6e. Secrets rotation plan

| Secret | Rotation frequency | How |
|--------|-------------------|-----|
| Keeper keystore | On compromise | Create new wallet, fund, update Railway env |
| Submit-bot keystore | On compromise | Revoke Voter ID via governance, create new wallet, re-verify with new passport, fund, update Railway env |
| Rate-bot keystore | On compromise | Revoke Voter ID via governance, create new wallet, re-verify with new passport, fund, update Railway env |
| Server keystore | On compromise | Create new wallet, fund, update Vercel env |
| NEXTAUTH_SECRET | Quarterly | Regenerate, update Vercel env |
| DATABASE_AUTH_TOKEN | Quarterly | `turso db tokens create`, update Vercel env |
| ALCHEMY_API_KEY | On compromise | Rotate in Alchemy dashboard |

---

## 7. Seed Initial Content with Bots

The bot package contains two specialized bots that work together:

- **Submission Bot** (`yarn submit`) — discovers trending content from 9 platforms (YouTube, TMDB, Steam, Wikipedia, Twitch, OpenLibrary, HuggingFace, Scryfall, CoinGecko) and submits it on-chain
- **Rating Bot** (`yarn vote`) — fetches active content from Ponder, rates it using external APIs (like ratio, review scores, market data), and places votes on-chain

Each bot uses a **separate wallet** for isolation and reputation tracking.

### 7a. Set up bot accounts

Each bot address needs its own Voter ID and cREP. Voter IDs are soulbound (non-transferable) and require a unique passport via Self.xyz — **each bot needs a separate verified identity**. Use the HumanFaucet claim flow for each bot address (or the dev faucet on testnet).

```bash
# Check both bots' status
cd packages/bot
yarn status
# Shows: addresses, CELO balances, cREP balances, Voter ID status, round config
```

### 7b. Configure bots

```bash
# packages/bot/.env

# --- Network ---
RPC_URL=https://forno.celo-sepolia.celo-testnet.org
CHAIN_ID=11142220
PONDER_URL=https://<your-ponder-domain>

# --- Submission Bot Identity ---
SUBMIT_KEYSTORE_ACCOUNT=submit-bot
SUBMIT_KEYSTORE_PASSWORD=<submit-bot-keystore-password>
# Or use: SUBMIT_PRIVATE_KEY=0x...

# --- Rating Bot Identity ---
RATE_KEYSTORE_ACCOUNT=rate-bot
RATE_KEYSTORE_PASSWORD=<rate-bot-keystore-password>
# Or use: RATE_PRIVATE_KEY=0x...

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
```

### 7c. Submit initial content

```bash
cd packages/bot

# Submit trending content across all 11 categories
yarn submit
```

The submission bot will:
1. Check that the submit-bot wallet has a Voter ID and sufficient cREP (10 cREP per submission)
2. Fetch trending content from each configured source
3. Skip already-submitted URLs (deduplication)
4. Submit up to `MAX_SUBMISSIONS_PER_RUN` items (max `MAX_SUBMISSIONS_PER_CATEGORY` per source)

### 7d. Vote on content

```bash
# Rate content via external APIs and place votes
yarn vote
```

The rating bot will:
1. Check that the rate-bot wallet has a Voter ID and sufficient cREP
2. Fetch active content from the Ponder indexer
3. For each item, call the matching rating strategy (YouTube like ratio, TMDB score, Steam reviews, etc.)
4. Determine vote direction: score >= `VOTE_THRESHOLD` → UP, otherwise → DOWN
5. Commit the vote on-chain via `commitVote(contentId, commitHash, ciphertext, stakeAmount, frontend)` — the vote direction is encrypted with tlock timelock encryption and hidden until reveal (up to `MAX_VOTES_PER_RUN`)

After each epoch ends, the Keeper service reveals committed votes using `revealVoteByCommitKey()` and then settles rounds. Each content item is voted on only once (the bot tracks previous votes).

### 7e. Verify the full loop

1. Submission bot submits content → visible on frontend
2. Rating bot commits encrypted votes → vote directions hidden on-chain until reveal
3. Epoch ends → Keeper reveals votes via `revealVoteByCommitKey()`
4. Keeper calls `settleRound(contentId, roundId)` → round outcome determined, rewards distributed (epoch-weighted), ratings updated
5. Content ratings visible on frontend

### 7f. Ongoing operation

Choose a deployment strategy based on your security requirements (see Section 6a-1):

#### Option A: Transaction queue (recommended for mainnet)

Deploy the bot to Railway **without private keys**. The bot prepares unsigned transactions that you sign locally.

```bash
cd packages/bot
railway service create curyo-bot

# Set shared environment variables (NO private keys)
railway variables set RPC_URL=https://forno.celo-sepolia.celo-testnet.org
railway variables set CHAIN_ID=11142220
railway variables set PONDER_URL=https://<ponder>.up.railway.app
railway variables set TMDB_API_KEY=<tmdb-api-key>
railway variables set YOUTUBE_API_KEY=<youtube-api-key>
railway variables set BOT_MODE=prepare  # Prepare transactions only, don't sign
```

The bot writes pending transactions to stdout/logs or a shared volume. You then sign locally:

```bash
# Review and sign pending submissions
cd packages/bot
yarn sign-pending --role submit --keystore submit-bot

# Review and sign pending votes
yarn sign-pending --role vote --keystore rate-bot
```

> **Note:** The `prepare` mode and `sign-pending` command need to be implemented (see the bot README for status). Until then, run the bots locally (Option B).

#### Option B: Local cron (recommended until tx queue is implemented)

Run bots on your own machine with encrypted keystores:

```bash
# macOS: store keystore passwords in Keychain
security add-generic-password -s "submit-bot" -a "$USER" -w "<password>"
security add-generic-password -s "rate-bot" -a "$USER" -w "<password>"

# Add to crontab (crontab -e)
0 */6 * * * cd ~/source/curyo/packages/bot && SUBMIT_KEYSTORE_ACCOUNT=submit-bot SUBMIT_KEYSTORE_PASSWORD=$(security find-generic-password -s "submit-bot" -w) yarn submit >> /tmp/curyo-submit.log 2>&1
0 * * * *   cd ~/source/curyo/packages/bot && RATE_KEYSTORE_ACCOUNT=rate-bot RATE_KEYSTORE_PASSWORD=$(security find-generic-password -s "rate-bot" -w) yarn vote >> /tmp/curyo-vote.log 2>&1
```

#### Option C: Railway with private keys (testnet only)

If you accept the cloud trust tradeoff (testnet only):

```bash
cd packages/bot
railway service create curyo-bot

railway variables set RPC_URL=https://forno.celo-sepolia.celo-testnet.org
railway variables set CHAIN_ID=11142220
railway variables set PONDER_URL=https://<ponder>.up.railway.app
railway variables set TMDB_API_KEY=<tmdb-api-key>
railway variables set YOUTUBE_API_KEY=<youtube-api-key>

# ⚠️ Private keys in cloud — acceptable for testnet, not recommended for mainnet
railway variables set SUBMIT_PRIVATE_KEY=<submit-bot-private-key>
railway variables set RATE_PRIVATE_KEY=<rate-bot-private-key>
```

Set up two cron schedules in the Railway dashboard:
- **Submit**: `0 */6 * * *` (every 6 hours) → `yarn submit`
- **Vote**: `0 * * * *` (every hour) → `yarn vote`

Or run manually during initial seeding and switch to cron once satisfied.

---

## Deploy the Ponder Indexer

The indexer must be running **before** the frontend can display content. Deploy it alongside or before the frontend.

### Configure

Update `ponder.config.ts` with the deployed contract addresses from Step 2d (they are already baked in from the deployment).

### Deploy to Railway

```bash
# Create a new service in the same Railway project
cd packages/ponder
railway service create curyo-ponder

# Set environment variables
railway variables set PONDER_RPC_URL_11142220=https://forno.celo-sepolia.celo-testnet.org

# Deploy
railway up
```

Ponder uses PGlite for local storage. Attach a **Railway volume** to persist the indexed data across deploys:
1. In the Railway dashboard, go to the Ponder service
2. Click **+ New** → **Volume**
3. Mount path: `/app/.ponder`
4. This prevents re-indexing from scratch on every redeploy

Expose a public domain in the Railway dashboard — you'll need the URL for `NEXT_PUBLIC_PONDER_URL` in Vercel.

### Verify

```bash
curl https://<ponder>.up.railway.app/content
# Should return indexed content (empty initially, populated after bot seeding)
```

---

## Deployment Order Summary

```
1.  Create keys (deployer, keeper, submit-bot, rate-bot, server)
2.  Fund deployer with CELO
3.  Deploy contracts (yarn deploy --network celoSepolia --keystore deployer)
4.  Verify contracts on Blockscout
5.  Deploy Ponder indexer to Railway (with volume for PGlite persistence)
6.  Deploy frontend to Vercel (with Ponder URL, contract addresses)
7.  Register frontend in FrontendRegistry (fixed 1,000 cREP stake, get governance approval)
8.  Deploy Keeper to Railway (point at RoundVotingEngine + ContentRegistry)
9.  Set up bot accounts (Voter ID + cREP via HumanFaucet for both submit-bot and rate-bot)
10. Run bots locally with encrypted keystores, or deploy to Railway (testnet only — see 7f)
11. Verify full loop: submit → vote → settle → display
12. Set up monitoring and alerts
```
