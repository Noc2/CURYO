# Curyo Operations Runbook

Status: **Active** | Last updated: 2026-03-10

This document covers the production procedures that sit adjacent to deployment:

- database migration rollout / rollback
- keeper and indexer alert thresholds
- day-2 incident runbooks

---

## 1. Database Migration Rollout

Use this flow for every production schema change in `packages/nextjs/drizzle/`.

### Preflight

1. Confirm the migration files are committed and reviewed.
2. Run the migration against a non-production database first:
   ```bash
   cd packages/nextjs
   DATABASE_URL=<staging-url> DATABASE_AUTH_TOKEN=<staging-token> yarn db:push
   ```
3. Smoke-test the signed-action and watchlist/comment APIs against staging after the push.
4. Freeze production writes for the release window if the change is not known to be backward-compatible.

### Create rollback artifacts before touching production

Create both a logical dump and capture the current UTC timestamp for point-in-time recovery:

```bash
# Logical backup
turso db shell curyo-prod '.dump' > curyo-prod-$(date -u +%Y%m%dT%H%M%SZ).sql

# Save a PITR timestamp alongside the release notes
date -u +%Y-%m-%dT%H:%M:%SZ
```

### Apply the migration

```bash
cd packages/nextjs
DATABASE_URL=<prod-url> DATABASE_AUTH_TOKEN=<prod-token> yarn db:push
```

### Post-migration verification

1. Hit the production app health paths and the API routes that depend on the new schema.
2. Verify comments, watchlist, notifications, and URL validation still read/write successfully.
3. Confirm application logs do not show Drizzle/SQLite schema errors for at least 10 minutes.

---

## 2. Database Rollback

Choose the fastest safe option.

### Preferred: point-in-time restore into a fresh database

If the bad release happened recently enough to use managed restore:

```bash
turso db create curyo-prod-restore --from-db curyo-prod --timestamp <pre-migration-utc-timestamp>
turso db tokens create curyo-prod-restore
turso db show curyo-prod-restore
```

Then:

1. Update `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in Vercel to point at the restored database.
2. Redeploy the frontend.
3. Re-run the post-migration verification checklist.

### Fallback: restore from the logical dump

If PITR is unavailable, restore the `.dump` output into a fresh database:

```bash
turso db create curyo-prod-restore
turso db shell curyo-prod-restore < curyo-prod-<timestamp>.sql
turso db tokens create curyo-prod-restore
turso db show curyo-prod-restore
```

Then repoint production to the restored database and redeploy.

### Rollback decision rule

Rollback immediately if any of these happen after `yarn db:push`:

- API writes fail for comments, watchlist, or notifications
- the app logs schema mismatch / missing column errors
- data integrity checks fail during smoke tests

Do not attempt ad hoc SQL surgery against the production database during an incident. Restore to a known-good state first.

---

## 3. Monitoring Thresholds

### Keeper

Alert on `GET /health` and `/metrics` from `packages/keeper`.

Operational model: run the keeper as active / standby unless you intentionally accept duplicate-submit gas waste. There
is no shared nonce coordinator today.

- `health status != ok`: critical immediately.
- `consecutiveErrors >= 3`: critical.
- `keeper_errors_total` increase `>= 1` over 15 minutes: warning.
- `keeper_errors_total` increase `>= 3` over 15 minutes: critical.
- `keeper_decrypt_failures_total` increase `>= 1` over 60 minutes: warning.
- `keeper_decrypt_failures_total` increase `>= 5` over 60 minutes: critical.
- `keeper_last_run_duration_seconds > interval`: warning.
- `keeper_last_run_duration_seconds > 2 * interval`: critical.
- `keeper_wallet_balance_wei`: warning below `0.05 CELO`, critical below `0.02 CELO`.
- `keeperRewardPool`: warning below `25,000 cREP`, critical below `10,000 cREP`.
- `consensusReserve`: warning below `1,000,000 cREP`, critical below `250,000 cREP`.

### Ponder

- indexer health endpoint non-200: critical.
- lag behind chain head `> 20 blocks` for 5 minutes: warning.
- lag behind chain head `> 100 blocks` for 15 minutes: critical.
- repeated 5xx responses from custom API routes for 5 minutes: critical.

### Frontend / Database

- app 5xx rate materially above baseline for 5 minutes: warning.
- any production schema error after deploy: critical.
- Turso restore / auth token rotation failures: critical.

---

## 4. Incident Runbooks

### Ponder lag

1. Check whether the RPC provider is healthy.
2. Confirm the database is reachable and not full / rate-limited.
3. If the service is unhealthy, redeploy the same build before changing config.
4. If lag continues, switch to a healthy RPC endpoint and redeploy.
5. Do not deploy unrelated code while the indexer is behind.

### drand / tlock outage

1. Confirm whether failures are isolated to your infra or upstream drand availability.
2. Keep the keeper running so it can resume automatically when drand recovers.
3. Page only once the decrypt-failure threshold is crossed; isolated single failures are noise.
4. Do not attempt manual settlement of encrypted votes without a verified plaintext path.
5. Communicate user-facing delay if reveals remain blocked for a sustained period.

### Manual keeper failover

1. Stop the unhealthy keeper instance first.
2. Verify the standby has gas, the right contract addresses, and metrics enabled.
3. Start exactly one replacement keeper and confirm `/health` turns `ok`.
4. Watch for nonce conflicts or duplicate-submit reverts for 10 minutes.
5. Only run multiple keepers intentionally, with documented startup jitter and operator awareness that duplicate submits waste gas.

### Deploy rollback

1. Revert the frontend / service deploy to the last known-good revision.
2. If the bad deploy included a schema change, follow the database rollback procedure above before bringing traffic back.
3. If the deploy failed role verification, stop the launch and resolve governance ownership before any public announcement or bot seeding.
4. Record the incident, root cause, and exact rollback timestamp.

### Database restore

1. Create a fresh restored database instead of mutating the broken one in place.
2. Generate a new auth token for the restored database.
3. Repoint production env vars and redeploy.
4. Run the post-migration verification checklist.
5. Leave the original database untouched until the incident is closed.
