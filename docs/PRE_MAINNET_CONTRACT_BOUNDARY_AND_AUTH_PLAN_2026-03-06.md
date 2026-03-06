# Pre-Mainnet Contract Boundary And Auth Plan

Status: **Draft** | Last updated: 2026-03-06

This document turns two pre-mainnet recommendations into an implementation plan:

1. Build a shared contract adapter + round snapshot layer, deduplicate ABI/address artifacts, and add end-to-end coverage around the shared layer.
2. Make signed-write auth consistent by moving `comments` onto the same one-time challenge model already used by `username`, then reuse that framework for the other replayable endpoints.

The goal is to reduce transaction mistakes, frontend/keeper/indexer disagreement, and replayable signed writes before mainnet.

---

## Scope

### In scope

- Shared frontend contract boundary for round state and vote submission helpers.
- Single generated contract artifact package consumed by Next.js, keeper, bot, ponder, and MCP.
- Playwright coverage for approve/write flows and round-state transitions.
- One-time challenge flow for comment submission.
- Reusable signed-action helpers for future migration of watchlist/follow endpoints.

### Out of scope

- Replacing wagmi/scaffold-eth hooks across the entire app.
- Large UI rewrites or page decomposition.
- Contract changes in `packages/foundry/contracts/`.
- Full SIWE session auth.

---

## Why This Should Happen Before Mainnet

### Shared contract boundary

Today, the round state is derived in multiple places:

- `packages/nextjs/hooks/useRoundInfo.ts`
- `packages/nextjs/hooks/useRoundPhase.ts`
- `packages/nextjs/hooks/useVotingConfig.ts`
- `packages/nextjs/hooks/useRoundVote.ts`

Those paths duplicate reads of `config()`, `getActiveRoundId()`, and `getRound()`, and they duplicate tuple decoding, timing math, and readiness rules. That creates three main risks:

- the UI computes different round states in different screens
- contract ABI shape changes break multiple hooks at once
- write flows depend on duplicated ad hoc logic instead of one tested boundary

### Signed-write auth

`packages/nextjs/app/api/comments/route.ts` still accepts deterministic signed messages with no nonce, expiry, or one-time consumption. That is replayable. `username` already has the right direction of fix, but its helper is still specialized instead of reusable.

---

## Workstream A: Shared Contract Boundary, Artifact Deduplication, And E2E Coverage

## A1. Target Architecture

### A1.1 Generated contract package

Add a new workspace package:

- `packages/contracts`
- package name: `@curyo/contracts`

This package becomes the only generated source of truth for:

- contract ABIs
- deployed addresses by chain
- lightweight metadata such as inherited functions or deployed block numbers if needed

It should export:

- `@curyo/contracts/abis`
- `@curyo/contracts/addresses`
- `@curyo/contracts/definitions`

Do not keep ABIs duplicated in:

- `packages/keeper/src/abis/*`
- `packages/bot/src/abis/*`
- `packages/ponder/abis/*`

Do not keep the huge mixed ABI+address output only in:

- `packages/nextjs/contracts/deployedContracts.ts`

The current generator in `packages/foundry/scripts-js/generateTsAbis.js` should remain the orchestrator for now. It already understands the repo’s deployment layout and proxy naming. The change is where it writes outputs, not a generator rewrite.

### A1.2 Frontend adapter layer

Create a dedicated adapter layer in Next.js, for example:

- `packages/nextjs/lib/contracts/roundVotingEngine.ts`
- `packages/nextjs/lib/contracts/curyoReputation.ts`
- `packages/nextjs/lib/contracts/types.ts`

This layer owns:

- named-vs-positional tuple decoding
- bigint-to-UI model normalization
- round-state derivation
- allowance and approve/commit request shaping
- stable typed return models for hooks and components

It should expose pure functions such as:

- `parseVotingConfig(raw)`
- `parseRound(raw)`
- `deriveRoundSnapshot({ config, roundId, round, optimisticDelta, now })`
- `needsApproval({ allowance, requiredStake })`
- `buildCommitVoteParams({ contentId, isUp, salt, ciphertext, stakeWei, frontend })`

### A1.3 Shared read hook

Add a single low-level read hook:

- `packages/nextjs/hooks/useRoundSnapshot.ts`

It should be the only hook that directly reads:

- `config()`
- `getActiveRoundId(contentId)`
- `getRound(contentId, roundId)`

Everything else becomes a selector over the shared snapshot:

- `useRoundInfo()` becomes a light wrapper over `useRoundSnapshot()`
- `useRoundPhase()` becomes a light wrapper over `useRoundSnapshot()`
- `useActiveVotesWithDeadlines()` should reuse the same timing helpers for epoch math

### A1.4 Shared write helpers

Keep `useScaffoldWriteContract()` as the transport wrapper for now, but move vote-flow logic out of `useRoundVote()` where possible.

`useRoundVote()` should retain:

- wallet presence checks
- terms acceptance
- optimistic UI updates
- error display

The adapter layer should own:

- stake normalization
- commit hash construction inputs
- allowance decision logic
- commitVote argument construction

## A2. Package-By-Package Tasks

### `packages/foundry`

- Update `scripts-js/generateTsAbis.js` to emit `@curyo/contracts` outputs.
- Keep existing deploy-time behavior that updates Ponder env values.
- Add a parity mode or snapshot test so generation failures are obvious.

### `packages/contracts`

- Create workspace package with generated files checked into git.
- Export ABIs individually and through a barrel file.
- Export chain-address maps in a small file that is safe for browser import.
- Export a typed contract registry shape that Next.js can consume without re-defining `GenericContractsDeclaration`.

### `packages/nextjs`

- Add `lib/contracts/*` pure adapters.
- Add `hooks/useRoundSnapshot.ts`.
- Refactor `useRoundInfo.ts`, `useRoundPhase.ts`, and `useVotingConfig.ts` to consume shared parsing/derivation.
- Refactor `useRoundVote.ts` so it stops reading `config()` ad hoc and stops owning round-specific decoding rules.
- Switch imports from local `contracts/deployedContracts.ts` to `@curyo/contracts`.
- Update `e2e/helpers/contracts.ts` to read addresses from `@curyo/contracts`.

### `packages/keeper`

- Replace local ABI imports with `@curyo/contracts`.
- Keep keeper transaction logic unchanged.
- Add one small startup assertion test that confirms expected contract names resolve from the shared package.

### `packages/bot`

- Replace local ABI imports with `@curyo/contracts`.
- Keep current CLI behavior unchanged.

### `packages/ponder`

- Replace `abis/*` imports in `ponder.config.ts` with `@curyo/contracts`.
- Keep route and indexing behavior unchanged.
- Remove `scripts/sync-abis.sh` once the migration is complete and verified.

### `packages/mcp-server`

- If any contract metadata is used directly later, import from `@curyo/contracts` instead of duplicating addresses.

## A3. Implementation Order

### Phase A0: Lock boundaries

- Decide the package name and output shape for `@curyo/contracts`.
- Decide whether browser-facing consumers import only addresses or addresses plus ABIs.
- Decide whether ERC-1271 support is needed for signed writes before mainnet. This affects Workstream B, not the artifact package itself, but it should be decided once.

### Phase A1: Artifact deduplication

- Create `packages/contracts`.
- Teach `generateTsAbis.js` to write the new package.
- Keep old outputs temporarily.
- Add parity tests comparing old and new data for one deployment snapshot.

### Phase A2: Frontend read boundary

- Add pure parsing and derivation helpers.
- Add `useRoundSnapshot()`.
- Migrate `useVotingConfig()`, `useRoundInfo()`, and `useRoundPhase()`.
- Verify no UI behavior changes.

### Phase A3: Frontend write boundary

- Extract approval and commit argument helpers.
- Refactor `useRoundVote()` to consume them.
- Preserve the existing `disableSimulate` escape hatch in `useScaffoldWriteContract()`.

### Phase A4: Consumer migration

- Move keeper, bot, ponder, and MCP imports to `@curyo/contracts`.
- Remove duplicated ABI files only after all consumers are green.

### Phase A5: Cleanup

- Delete legacy ABI copies.
- Delete or reduce `packages/nextjs/contracts/deployedContracts.ts` if it is fully superseded.
- Update README and package docs.

## A4. Test Plan

### Unit tests

Add fast tests for pure helpers:

- `parseVotingConfig()` accepts both named and positional tuples
- `parseRound()` normalizes missing fields safely
- `deriveRoundSnapshot()` computes `votersNeeded`, `isRoundFull`, `readyToSettle`, epoch-1 status, and countdowns consistently
- `needsApproval()` handles equal, below, and above allowance cases

### Integration tests

Add targeted hook tests or adapter-level tests for:

- `useRoundSnapshot()` with mocked contract responses
- optimistic vote deltas merged into the snapshot
- stale/undefined `contentId` and `roundId` handling

### End-to-end tests

Add Playwright scenarios that validate user-visible behavior, not internal implementation:

- approve then commit vote on a fresh allowance
- commit vote without re-approval when allowance is already sufficient
- active round detection stays consistent across screens that use round state
- epoch-1 countdown and transition behavior
- settlement readiness once `minVoters` is reached
- round-full behavior once `maxVoters` is reached

### Artifact parity tests

Add repo-level tests that fail if ABIs or addresses diverge between the generated package and consumers during migration.

## A5. Acceptance Criteria

- `@curyo/contracts` is the single source of truth for ABIs and addresses.
- Next.js, keeper, bot, ponder, and MCP compile against `@curyo/contracts`.
- `useRoundInfo()` and `useRoundPhase()` no longer read contracts independently.
- Round timing and readiness math live in shared pure helpers with unit tests.
- Playwright covers approve/write flow, active round detection, epoch timing, and settlement readiness.
- Legacy duplicate ABI files are removed or explicitly marked transitional.

---

## Workstream B: Signed-Action Auth Consistency

## B1. Target Architecture

Move from per-route custom signing strings to a reusable one-time signed-action framework.

Add shared helpers under:

- `packages/nextjs/lib/auth/signedActions.ts`
- `packages/nextjs/lib/auth/commentChallenge.ts`

Move the table definition to:

- `packages/nextjs/lib/db/schema.ts`

The generic framework should own:

- challenge issuance
- nonce generation
- payload hashing
- canonical message construction
- expiry checks
- one-time consumption
- race-safe update semantics

The route-specific module should own:

- request normalization
- payload hashing fields for comments
- response shaping

## B2. Message Model

Follow a SIWE-style anti-replay model without implementing full session auth:

- action name
- wallet address
- payload hash
- nonce
- issued/created time
- expiration time

For comments, the payload hash should bind:

- normalized `contentId`
- normalized trimmed comment body

This prevents reusing one signature for:

- a different comment body
- a different content item
- a later replay of the same request

## B3. Package-By-Package Tasks

### `packages/nextjs/lib/db`

- Move `signed_action_challenges` table ownership into `schema.ts`.
- Add indexes for `expiresAt` and any common lookup path still needed.
- Keep the migration compatible with the already-created table.

### `packages/nextjs/lib/auth`

- Extract generic helpers out of `profileUpdateChallenge.ts`.
- Keep profile-specific validation logic in a profile module.
- Add a comment-specific module with:
  - input normalization
  - payload hashing
  - challenge message builder wrapper

### `packages/nextjs/app/api/comments`

- Add `app/api/comments/challenge/route.ts`.
- Change `POST /api/comments` to require `challengeId + signature`.
- Verify and consume the challenge inside the same transaction as the insert.
- Preserve existing rate limiting and response shape.

### `packages/nextjs/hooks`

- Update `useComments.ts` to:
  - request a challenge first
  - sign the returned message
  - submit `challengeId`
  - preserve optimistic UI semantics

### `packages/nextjs/e2e`

- Replace the current simple comment-signature test with challenge-based tests.
- Add replay and expiry coverage.

### Follow-up endpoints

After comments, migrate the same framework into:

- `packages/nextjs/app/api/watchlist/content/route.ts`
- `packages/nextjs/app/api/follows/profiles/route.ts`

These are not the first priority, but they should use the same helper instead of keeping replayable signatures.

## B4. Implementation Order

### Phase B0: Generalize the helper

- Split generic challenge logic from profile-specific validation.
- Keep username behavior unchanged while refactoring internals.

### Phase B1: Comments migration

- Add comment challenge endpoint.
- Update comment post route.
- Update `useComments.ts`.
- Add API and E2E coverage.

### Phase B2: Endpoint family cleanup

- Move watchlist and follows onto the shared framework.
- Remove duplicate signature-building utilities where possible.

## B5. Test Plan

### API tests

Add or update API tests for:

- challenge issuance succeeds for valid comment payload
- fresh challenge + valid signature creates exactly one comment
- replay of the same challenge returns `409`
- payload mismatch returns `401`
- expired challenge returns `401`
- invalid signature returns `401`

### Concurrency tests

Add a race test proving that two concurrent requests using the same `challengeId` cannot both insert a comment.

### UI tests

Add one browser-level test that proves the comment composer still works end to end with wallet signing in the new two-step flow.

## B6. Acceptance Criteria

- `POST /api/comments` is no longer replayable.
- Comment challenge verification and consumption happen atomically with insert.
- `useComments.ts` signs server-issued messages, not deterministic local strings.
- The challenge framework is generic enough that watchlist/follows can migrate without copy-paste.
- Existing `username` behavior still passes after the helper extraction.

---

## Decisions To Lock Before Starting

- Keep the current generator and change outputs, rather than swapping to a new ABI generator before mainnet.
- Keep wagmi/scaffold-eth as the transport layer for now.
- Treat comments as the first signed-action migration because it is active security debt.
- Defer full route-family migration for watchlist/follows until comments is complete.
- Decide explicitly whether v1 signed-write endpoints support only EOAs or also ERC-1271 contract wallets.

---

## Suggested Ticket Breakdown

1. Create `@curyo/contracts` and generate ABIs/addresses into it.
2. Migrate Next.js contract imports to `@curyo/contracts` without behavior changes.
3. Add pure round parsing/derivation helpers.
4. Add `useRoundSnapshot()` and migrate `useVotingConfig`, `useRoundInfo`, and `useRoundPhase`.
5. Refactor `useRoundVote()` to consume shared write helpers.
6. Migrate keeper, bot, ponder, and MCP to `@curyo/contracts`.
7. Add Playwright scenarios for approve/write flow and round-state transitions.
8. Extract generic signed-action challenge helpers.
9. Migrate comments to one-time challenges.
10. Add replay, expiry, mismatch, and concurrency tests.
11. Migrate watchlist and follows onto the same framework.

---

## Research Notes

- wagmi’s TypeScript guidance favors const-asserted ABIs and typed config over loose runtime objects.
- viem’s contract-instance and message-verification utilities support a clean adapter boundary, but browser bundle cost and migration churn argue for retaining the current hook transport before mainnet.
- Playwright recommends testing user-visible behavior and keeping scenarios isolated; that fits a small number of critical round-state and tx-flow tests better than broad UI regression suites.
- EIP-4361 is useful here mainly as the anti-replay model: nonce, issuance time, and expiration time should be treated as required properties for signed actions.

Sources:

- https://wagmi.sh/react/typescript
- https://viem.sh/docs/contract/getContract
- https://wagmi.sh/cli/api/plugins/foundry
- https://playwright.dev/docs/best-practices
- https://playwright.dev/docs/api-testing
- https://eips.ethereum.org/EIPS/eip-4361
- https://viem.sh/docs/utilities/verifyMessage
