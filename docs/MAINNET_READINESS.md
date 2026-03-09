# Mainnet Readiness Checklist

Status: **Draft** | Last updated: 2026-03-09

This document tracks every item that must be resolved (BLOCKING) or should be resolved (NON-BLOCKING) before deploying Curyo to Celo Mainnet (chain ID 42220).

---

## BLOCKING — Must resolve before mainnet

### Smart Contracts

- [ ] **External audit completed and findings addressed**
  No third-party audit report found in the repository. The codebase has internal test coverage (38 top-level Foundry test files including invariant/solvency/adversarial suites) and Slither static analysis in CI, but no formal external audit trail.

- [ ] **Post-deployment role verification automated**
  `DEPLOYMENT.md` Step 2e shows manual `cast call` checks to confirm the deployer renounced all roles. Automate this as a script that fails loudly if the deployer retains any role — human error here is catastrophic.
  _Ref: `DEPLOYMENT.md:173-185`_

### Keeper

- [x] **drand decryption error handling** _(fixed)_
  The keeper now increments `keeper_decrypt_failures_total`, logs warnings on decrypt/decode failures, and exposes `decryptFailures` via `/health`. What remains is documenting concrete alert thresholds, tracked below under "Keeper metrics alert thresholds documented".
  _Ref: `packages/keeper/src/keeper.ts:368-391`, `packages/keeper/src/metrics.ts:8-125`_

- [x] **Keeper wallet balance pre-flight check** _(fixed)_
  The keeper now checks native gas balance at the start of each `tick()`, emits `keeper_wallet_balance_wei`, includes `walletBalanceWei` in `/health`, and warns when the balance drops below `MIN_BALANCE`.
  _Ref: `packages/keeper/src/index.ts:60-80`, `packages/keeper/src/metrics.ts:20-125`_

- [x] **Graceful shutdown waits for in-flight tick** _(fixed)_
  `shutdown()` now sets a `shuttingDown` flag, clears the interval, waits for the current tick to finish (up to 30 seconds), then exits.
  _Ref: `packages/keeper/src/index.ts:114-139`_

### Ponder Indexer

- [x] **Production database strategy** _(documented)_
  Ponder auto-detects `DATABASE_URL` and uses PostgreSQL when set (falls back to PGlite otherwise). Added `DATABASE_URL`, `DATABASE_PRIVATE_URL`, and `DATABASE_SCHEMA` to `.env.example` with production guidance. PGlite is now documented as dev-only. Operators must set `DATABASE_URL` to a managed PostgreSQL instance (Railway Postgres, Neon, Supabase) for production.
  _Ref: `packages/ponder/.env.example:32-40`_

- [x] **`CORS_ORIGIN` startup failure is silent** _(fixed)_
  Replaced the top-level `throw` with a `console.error` + 503 middleware. Ponder now starts successfully (preserving built-in `/health` and `/status`), logs a clear `FATAL` message, and returns `503` with an actionable error body on all custom API routes. Railway health checks can detect the unhealthy state without crash loops.
  _Ref: `packages/ponder/src/api/index.ts:62-72`_

### Frontend (Next.js)

- [x] **Content-Security-Policy header** _(fixed)_
  Added a comprehensive CSP header restricting `script-src`, `connect-src`, `frame-src`, `img-src`, `font-src`, `style-src`, `object-src`, `base-uri`, and `form-action` to known origins. Dev-only localhost origins are conditionally included. Production Ponder URL injected via `NEXT_PUBLIC_PONDER_URL` at build time.
  _Ref: `packages/nextjs/next.config.ts:8-56`_

- [ ] **Database migration rollout / rollback documented**
  Versioned Drizzle migrations now exist (`packages/nextjs/drizzle/`, `yarn db:generate`, `yarn db:push`), so schema versioning is in place. What is still missing is a production runbook for pre-deploy dry-runs, backups, rollback/restore, and how to apply migrations safely against Turso.
  _Ref: `packages/nextjs/drizzle/`, `packages/nextjs/package.json:18-20`, `docs/DEPLOYMENT.md:254-269`_

### Environment & Secrets

- [x] **Alchemy fallback behavior documented** _(resolved)_
  Production does not require `NEXT_PUBLIC_ALCHEMY_API_KEY`. On Celo the frontend can run without a dedicated Alchemy key, and `.env.example` now documents that the key is optional and the app uses the configured public RPCs when no Alchemy key is set. Teams that want predictable RPC throughput should still provision their own provider key.
  _Ref: `packages/nextjs/utils/env/public.ts:109-117`, `packages/nextjs/.env.example:10-13`_

### CI/CD

- [x] **E2E tests do not run on push to main** _(fixed)_
  Added `push: branches: [main]` trigger to the E2E workflow.
  _Ref: `.github/workflows/e2e.yaml:3-8`_

---

## NON-BLOCKING — Should resolve, not a launch gate

### Smart Contracts

- [ ] **Keeper reward pool exhaustion monitoring**
  If `keeperRewardPool` depletes, the keeper still works but earns no rewards — reducing incentive to operate. Document a monitoring alert for when the pool drops below a threshold (e.g., 10K cREP) and a governance procedure to refill it.
  _Ref: `packages/foundry/contracts/RoundVotingEngine.sol` (keeperRewardPool state variable)_

- [ ] **Consensus reserve depletion monitoring**
  Same as above for `consensusReserve` (4M cREP initial). Unanimous rounds stop earning the 5% subsidy when exhausted.

- [ ] **Tlock ciphertext binding documented or enforced**
  `commitVote()` requires a non-empty ciphertext, but `revealVoteByCommitKey()` verifies only the plaintext commit hash and never proves that the stored ciphertext decrypts to the revealed payload. Today, permissionless reveal via drand is an off-chain convention rather than an on-chain guarantee, and some public docs describe a stronger property than the contract actually enforces. Either bind ciphertext to the reveal path or document this trust model explicitly before mainnet.
  The near-term mitigation and economic hardening plan in `docs/REVEAL_HARDENING_PLAN_2026-03-09.md` is now implemented, but it does not close the ciphertext-binding gap by itself.
  _Ref: `packages/foundry/contracts/RoundVotingEngine.sol:435-437`, `packages/foundry/contracts/RoundVotingEngine.sol:603-614`_

- [ ] **ParticipationPool halving schedule transparency**
  The current participation reward rate is already surfaced in the app via `useParticipationRate()` (submission, staking, and streak/portfolio flows), but users still do not get a clear "current tier / next halving" status widget at claim time. If this matters for launch polish, add a shared component for the current tier and next threshold.
  _Ref: `packages/foundry/contracts/ParticipationPool.sol:118-128`, `packages/nextjs/hooks/useParticipationRate.ts`, `packages/nextjs/components/swipe/StakeSelector.tsx`, `packages/nextjs/app/portfolio/page.tsx`_

### Keeper

- [ ] **Nonce management for multi-instance deployments**
  `DEPLOYMENT.md` recommends running 2+ keeper instances for redundancy. Without nonce coordination, concurrent instances may submit txs with conflicting nonces. Currently mitigated by `KEEPER_STARTUP_JITTER_MS` staggering, but under load both could fire simultaneously. Duplicate reveals simply revert (no harm, wasted gas). Document this trade-off or add explicit nonce management.
  _Ref: `DEPLOYMENT.md:461-463`, `packages/keeper/src/index.ts:50-54`_

- [ ] **Keeper metrics alert thresholds documented**
  `DEPLOYMENT.md` already covers baseline monitoring (Keeper health, gas balance, bot balances, Ponder sync), but it still lacks concrete thresholds for `keeper_decrypt_failures_total`, `keeper_errors_total`, and abnormal run duration. Add copy-paste alert rules to `DEPLOYMENT.md` or a separate `OPERATIONS.md`.
  _Ref: `packages/keeper/src/metrics.ts`, `docs/DEPLOYMENT.md:643-650`_

### Ponder Indexer

- [x] **Rate limiting is in-memory** _(documented)_
  Added doc comment to `RateLimiter` class documenting the limitation: resets on restart, not shared across replicas. Acceptable for single-instance Ponder deployment. Comment notes Redis-backed replacement needed if scaling to multiple instances.
  _Ref: `packages/ponder/src/api/rate-limit.ts:5-12`_

- [x] **Database query error handling** _(fixed)_
  Added `app.onError()` global handler that catches unhandled errors from all routes and returns `{ "error": "Internal server error" }` with 500 status. Errors are logged to stderr for operator visibility.
  _Ref: `packages/ponder/src/api/index.ts:33-36`_

### Frontend (Next.js)

- [x] **robots.txt** _(fixed)_
  Added `public/robots.txt` blocking `/api/` and `/debug/` routes. Sitemap deferred — all routes are dynamic/app-generated content.

- [x] **URL validation TOCTOU window** _(accepted risk)_
  Re-checked the current `generic` URL validation path: the SSRF check still resolves DNS separately from the later `HEAD` fetch, so a DNS rebinding attack could theoretically bypass the private-IP filter. For the current threat model this remains acceptable because the route is validating user-submitted URLs rather than fetching sensitive internal resources, and redirects are revalidated before the second request. If this service is ever deployed on AWS/GCP or into an environment with reachable metadata/internal HTTP endpoints, revisit and harden this path.
  _Ref: `packages/nextjs/app/api/url-validation/route.ts:65-76`_

- [x] **Image proxy redirect handling** _(fixed)_
  The image proxy validates the initial hostname, re-validates a single redirect target, and keeps both fetches at `redirect: "manual"`. Additional hops fail closed rather than bypassing the allowlist.
  _Ref: `packages/nextjs/app/api/image-proxy/route.ts:56-80`_

- [x] **Frontend rate-limit cleanup race** _(fixed)_
  Added a small DB-backed cleanup lease so only one Next.js instance performs expired rate-limit row cleanup per interval. Other instances skip cleanup work instead of issuing concurrent `DELETE` queries.
  _Ref: `packages/nextjs/utils/rateLimit.ts`_

### Documentation

- [ ] **Operations runbook**
  `DEPLOYMENT.md` now covers monitoring, security checks, wallet-balance alerts, and secret rotation. What is still missing is a concise day-2 incident runbook for Ponder lag, prolonged drand outages, database backup/restore, deploy rollback, and manual keeper failover.

- [x] **Self.xyz dependency documented** _(documented)_
  The mainnet deployment guide already documents the dependency, verification flow, cold-wallet identity requirements, and mainnet hub address. Public legal/docs pages also mention the third-party dependency. An emergency fallback policy is still a product/governance decision, but the dependency itself is documented.
  _Ref: `docs/DEPLOYMENT.md:284-341`_

---

## Already Solid — No action needed

These areas were reviewed and found production-ready:

| Area | Notes |
|------|-------|
| Access control | All UUPS contracts restrict `_authorizeUpgrade` to `UPGRADER_ROLE`. Deployer roles renounced in deploy script. Storage gaps present. |
| Reentrancy | `ReentrancyGuardTransient` on all state-modifying externals. HumanFaucet uses manual bool guard (documented). |
| Token handling | `SafeERC20` throughout. No raw `.transfer()`. Pull-based refunds for cancelled/tied rounds. |
| Initialization | `_disableInitializers()` in all UUPS constructors. Two-stage init (deployer + governance). |
| Input validation | Zero-address checks, stake bounds (1-100 cREP), ciphertext size limits (10KB), URL length limits (2048). |
| Custom errors | No require strings — gas-efficient custom errors throughout. |
| Test coverage | 38 top-level Foundry test files: invariant solvency, game theory, governance lifecycle, branch coverage, edge cases, and security/adversarial suites. |
| .gitignore | `.env` and `.env.*` properly excluded. No secrets in tracked files. Anvil test keys are well-known deterministic values. |
| Dev-only gating | Debug routes redirect in production. Dev faucet double-gated. Localhost URLs rejected in production configs across all packages. |
| Console output | All `console.error/warn` is legitimate error handling. Debug logging gated by `DEBUG` env var or `NODE_ENV`. No stray `console.log`. |
| Cold wallet architecture | Delegation model keeps Voter IDs on cold wallets. Bot compromise only exposes operational cREP, not identity. |
| Commit hash anti-front-running | Per-voter commit hashes and reveal verification prevent copied-commit front-running and preserve a blind voting phase. |
| Security headers | HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy all set. |
| SSRF protection | HTTPS-only, private IP rejection, localhost/link-local blocked, DNS resolution check, image proxy allowlist. |
| Rate limiting | DB-backed per-IP rate limiting on all API routes. Ponder has in-memory rate limiting. |
| CI | Lint + type-check on push/PR. Slither static analysis on push/PR. E2E on PR, push to `main`, and weekly. |
