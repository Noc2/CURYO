# Mainnet Readiness Checklist

Status: **Draft** | Last updated: 2026-03-06

This document tracks every item that must be resolved (BLOCKING) or should be resolved (NON-BLOCKING) before deploying Curyo to Celo Mainnet (chain ID 42220).

---

## BLOCKING — Must resolve before mainnet

### Smart Contracts

- [ ] **External audit completed and findings addressed**
  No third-party audit report found in the repository. The codebase has internal test coverage (32 test files including invariant/solvency tests) and Slither static analysis in CI, but no formal external audit trail.

- [ ] **Post-deployment role verification automated**
  `DEPLOYMENT.md` Step 2e shows manual `cast call` checks to confirm the deployer renounced all roles. Automate this as a script that fails loudly if the deployer retains any role — human error here is catastrophic.
  _Ref: `DEPLOYMENT.md:173-185`_

### Keeper

- [ ] **drand decryption error handling**
  `timelockDecrypt()` failures are caught and logged at debug level, but if the drand beacon is persistently unavailable, reveals silently stop and rounds never settle. There is no metric or alert for "decryption failures per tick" — operators won't know until users complain.
  _Ref: `packages/keeper/src/keeper.ts:368-378`_

  Fix: increment a `keeper_decrypt_failures_total` counter in the metrics, and document an alert threshold (e.g., > 10 failures in one interval).

- [ ] **Keeper wallet balance pre-flight check**
  The keeper sends `writeContract` calls without verifying it has sufficient gas. If the wallet drains, every tx silently fails (caught as a generic error). Add a balance check at the start of each `tick()` and expose it in `/health`.
  _Ref: `packages/keeper/src/index.ts:59-89`_

- [ ] **Graceful shutdown waits for in-flight tick**
  `shutdown()` calls `process.exit(0)` immediately, which can interrupt a mid-flight `resolveRounds()` call. If a reveal tx was sent but the settlement tx hasn't been sent yet, the round is left in a partially-revealed state until the next tick.
  _Ref: `packages/keeper/src/index.ts:98-103`_

  Fix: set a flag, wait for `isRunning` to become false (with a timeout), then exit.

### Ponder Indexer

- [ ] **Production database strategy**
  `DEPLOYMENT.md` recommends PGlite with a Railway volume. PGlite is an embedded single-process database — it cannot be shared across replicas, has no backup tooling, and a volume corruption requires full re-index from block 0. Evaluate migrating to managed PostgreSQL (Ponder supports it natively) or document the accepted risk and recovery procedure.
  _Ref: `DEPLOYMENT.md:211-215`_

- [ ] **`CORS_ORIGIN` startup failure is silent**
  In production, a missing `CORS_ORIGIN` throws during config load. On Railway this means the container exits and restarts in a loop with no user-facing error. Ensure Railway health checks detect this and alert.
  _Ref: `packages/ponder/ponder.config.ts:93`, `packages/ponder/.env.example:32`_

### Frontend (Next.js)

- [x] **Content-Security-Policy header** _(fixed)_
  Added a comprehensive CSP header restricting `script-src`, `connect-src`, `frame-src`, `img-src`, `font-src`, `style-src`, `object-src`, `base-uri`, and `form-action` to known origins. Dev-only localhost origins are conditionally included. Production Ponder URL injected via `NEXT_PUBLIC_PONDER_URL` at build time.
  _Ref: `packages/nextjs/next.config.ts:8-56`_

- [ ] **Database migration strategy documented**
  Drizzle + Turso is configured, and `DEPLOYMENT.md` shows `yarn db:push`, but there is no rollback procedure, no migration versioning, and no pre-deploy dry-run step. A failed migration on a production Turso database could corrupt user data (profiles, cached metadata, rate-limit state).
  _Ref: `packages/nextjs/drizzle.config.ts`, `DEPLOYMENT.md:266-269`_

### Environment & Secrets

- [ ] **Production Alchemy API key required**
  In production, `alchemyApiKey` is `undefined` if `NEXT_PUBLIC_ALCHEMY_API_KEY` is not set (the hardcoded default is excluded). The app silently falls back to public RPCs, which may be rate-limited. Either require the key in production or document this as accepted.
  _Ref: `packages/nextjs/utils/env/public.ts:114`_

- [ ] **Rotate shared Alchemy key in source**
  `DEFAULT_ALCHEMY_API_KEY = "cR4WnXePioePZ5fFrnSiR"` is committed to git. This is a scaffold-eth shared key. If the repo goes public, it will be scraped and abused. Rotate it or accept it as a low-priority public fallback.
  _Ref: `packages/nextjs/utils/env/public.ts:17`_

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

- [ ] **ParticipationPool halving schedule transparency**
  The pool uses a halving schedule (90% -> 45% -> 22.5% -> ... -> 1% floor). Users should see the current tier and projected reward rate in the UI before claiming.
  _Ref: `packages/foundry/contracts/ParticipationPool.sol:118-128`_

### Keeper

- [ ] **Nonce management for multi-instance deployments**
  `DEPLOYMENT.md` recommends running 2+ keeper instances for redundancy. Without nonce coordination, concurrent instances may submit txs with conflicting nonces. Currently mitigated by `KEEPER_STARTUP_JITTER_MS` staggering, but under load both could fire simultaneously. Duplicate reveals simply revert (no harm, wasted gas). Document this trade-off or add explicit nonce management.
  _Ref: `DEPLOYMENT.md:461-463`, `packages/keeper/src/index.ts:50-54`_

- [ ] **Keeper metrics alert thresholds documented**
  Prometheus metrics are exposed at `/metrics` but there's no guidance on what thresholds to set for alerts (e.g., `keeper_errors_total` > N, `keeper_run_duration_seconds` > M). Add recommended alerting rules to `DEPLOYMENT.md` or a separate `OPERATIONS.md`.
  _Ref: `packages/keeper/src/metrics.ts`_

### Ponder Indexer

- [ ] **Rate limiting is in-memory**
  The Ponder API uses an in-memory rate-limit store. It resets on container restart and cannot be shared across replicas. For a single-instance deployment this is acceptable; document the limitation.
  _Ref: `packages/ponder/src/api/index.ts:27-37`_

- [ ] **Database query error handling**
  Drizzle queries in API routes are not wrapped in try-catch. A database error returns a raw 500 with no structured error message. Wrap queries and return consistent error responses.
  _Ref: `packages/ponder/src/api/index.ts` (various query locations)_

### Frontend (Next.js)

- [x] **robots.txt** _(fixed)_
  Added `public/robots.txt` blocking `/api/` and `/debug/` routes. Sitemap deferred — all routes are dynamic/app-generated content.

- [ ] **URL validation TOCTOU window (documented)**
  The SSRF check resolves DNS separately from the fetch. A DNS rebinding attack could bypass private-IP checks. The code already documents this at line 66-67. For the current threat model (server-side validation of user-submitted URLs, not fetching sensitive resources), this is acceptable. If the server ever runs on AWS/GCP with instance metadata endpoints, revisit.
  _Ref: `packages/nextjs/app/api/url-validation/route.ts:65-76`_

- [ ] **Image proxy redirect depth**
  The image proxy follows one redirect and validates the target, but stops there. An attacker controlling an allowed domain could chain a 302 to a blocked domain. Low risk since `ALLOWED_HOSTS` is a curated set of trusted CDNs.
  _Ref: `packages/nextjs/app/api/image-proxy/route.ts:56-81`_

- [ ] **Frontend rate-limit cleanup race**
  Multiple Next.js server instances can trigger rate-limit cleanup concurrently (thundering herd on the DB). Low impact — cleanup is idempotent and Turso handles concurrent writes.
  _Ref: `packages/nextjs/utils/rateLimit.ts`_

### Documentation

- [ ] **Operations runbook**
  `DEPLOYMENT.md` covers initial setup but not day-2 operations: monitoring health, handling degradation (Ponder falls behind, keeper wallet drained, drand outage), secrets rotation procedures, database backup/restore, update/rollback procedures.

- [ ] **Self.xyz dependency documented**
  All sybil resistance depends on Self.xyz hub availability. If the hub goes down, no new users can claim Voter IDs. Document the dependency, uptime expectations, and emergency fallback (governance override?).
  _Ref: `packages/foundry/contracts/HumanFaucet.sol` (SelfVerificationRoot dependency)_

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
| Test coverage | 32 test files: invariant solvency, game theory, governance lifecycle, branch coverage, edge cases, security tests. |
| .gitignore | `.env` and `.env.*` properly excluded. No secrets in tracked files. Anvil test keys are well-known deterministic values. |
| Dev-only gating | Debug routes redirect in production. Dev faucet double-gated. Localhost URLs rejected in production configs across all packages. |
| Console output | All `console.error/warn` is legitimate error handling. Debug logging gated by `DEBUG` env var or `NODE_ENV`. No stray `console.log`. |
| Cold wallet architecture | Delegation model keeps Voter IDs on cold wallets. Bot compromise only exposes operational cREP, not identity. |
| Commit-reveal voting | Real tlock encryption via drand quicknet mainnet. Front-running prevented by design. |
| Security headers | HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy all set. |
| SSRF protection | HTTPS-only, private IP rejection, localhost/link-local blocked, DNS resolution check, image proxy allowlist. |
| Rate limiting | DB-backed per-IP rate limiting on all API routes. Ponder has in-memory rate limiting. |
| CI | Lint + type-check on push/PR. Slither static analysis on push/PR. E2E on PR + weekly. |
