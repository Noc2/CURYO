# Pre-Mainnet Contract Boundary And Auth Plan

Status: **Updated** | Last updated: 2026-03-07

This document tracks the remaining refactor work after the first cleanup pass. The large structural pieces are already in place:

- `@curyo/contracts` is the shared contract artifact package.
- keeper, bot, ponder, MCP, and Next.js already consume shared artifacts.
- `useRoundSnapshot()` exists and the old `useRoundInfo()` / `useRoundPhase()` wrappers are gone.
- comments, username, watchlist, and follows already use one-time signed challenges.
- duplicate ABI outputs have already been removed.
- the obsolete `packages/nextjs/contracts/deployedContracts.ts` artifact has now been deleted.

The remaining work is narrower and should focus on reducing duplication, tightening boundaries, and adding confidence tests before mainnet.

---

## Remaining Goals

1. Consolidate the signed-action framework so route families stop carrying near-identical helper code.
2. Finish the shared round adapter boundary so timing and vote-flow logic live in one place.
3. Add high-signal tests around the shared contract boundary and the one-time challenge flow.

These are the highest-value remaining refactors because they reduce:

- repeated auth logic across multiple API families
- mismatches between screens that interpret round state
- hidden regressions when contract artifacts or tuple shapes change
- replay/race-condition regressions in signed-write routes

---

## Current State

### Already done

- Shared contract metadata now lives in `packages/contracts`.
- Legacy ABI copies in keeper, bot, and ponder are gone.
- The old Next.js `deployedContracts.ts` artifact is gone.
- Round snapshot derivation is centralized in:
  - `packages/nextjs/lib/contracts/roundVotingEngine.ts`
  - `packages/nextjs/hooks/useRoundSnapshot.ts`
- Signed-action primitives are centralized in:
  - `packages/nextjs/lib/auth/signedActions.ts`
- The following route families already use one-time challenges:
  - `packages/nextjs/app/api/comments/*`
  - `packages/nextjs/app/api/username/*`
  - `packages/nextjs/app/api/watchlist/content/*`
  - `packages/nextjs/app/api/follows/profiles/*`

### What is still duplicated

#### Signed actions

The framework exists, but these files still repeat the same shape:

- `packages/nextjs/lib/auth/commentChallenge.ts`
- `packages/nextjs/lib/auth/watchlistChallenge.ts`
- `packages/nextjs/lib/auth/followProfileChallenge.ts`

The matching route files also repeat:

- challenge issuance flow
- challenge verification flow
- challenge error mapping
- action-specific request parsing boilerplate

#### Round-state and vote-flow logic

The read boundary is improved, but the round/timing surface is still split across:

- `packages/nextjs/hooks/useRoundSnapshot.ts`
- `packages/nextjs/hooks/useVotingConfig.ts`
- `packages/nextjs/hooks/useRoundVote.ts`
- `packages/nextjs/hooks/useActiveVotesWithDeadlines.ts`

This is now more of a maintainability issue than a correctness fire, but it is still worth finishing before mainnet.

---

## Workstream A: Signed-Action Consolidation

### Goal

Keep the one-time challenge model, but remove route-family copy-paste and make the framework clearly generic.

### Target architecture

Keep the generic core in:

- `packages/nextjs/lib/auth/signedActions.ts`

Expand it so it owns:

- challenge issuance
- canonical message construction
- common persistence
- one-time consumption
- common error mapping

Reduce each action-specific file to only:

- input normalization
- payload serialization / hashing inputs
- title + action constants

### Proposed module split

#### Generic core

Keep or add in `signedActions.ts`:

- `issueSignedActionChallenge(...)`
- `verifyAndConsumeSignedActionChallenge(...)`
- `mapSignedActionError(...)`
- `hashSignedActionPayload(...)`
- optional small helpers for normalizing addresses or building action definitions

#### Action definitions

Each action module should become a small definition file that exports:

- action constants
- input normalizer
- payload serializer
- message title

That means the action-specific modules stop owning challenge creation wrappers when those wrappers only call the generic core.

### Route refactor

Each challenge route should become:

1. rate limit
2. parse + normalize
3. call `issueSignedActionChallenge(...)`
4. return `{ challengeId, message, expiresAt }`

Each signed-write route should become:

1. rate limit
2. parse + normalize
3. compute payload hash
4. call `verifyAndConsumeSignedActionChallenge(...)` inside the write transaction
5. map generic challenge errors with one shared helper

### Concrete tasks

1. Add `issueSignedActionChallenge()` to `packages/nextjs/lib/auth/signedActions.ts`.
2. Add `mapSignedActionError()` to `packages/nextjs/lib/auth/signedActions.ts`.
3. Refactor:
   - `packages/nextjs/app/api/comments/challenge/route.ts`
   - `packages/nextjs/app/api/watchlist/content/challenge/route.ts`
   - `packages/nextjs/app/api/follows/profiles/challenge/route.ts`
4. Refactor:
   - `packages/nextjs/app/api/comments/route.ts`
   - `packages/nextjs/app/api/username/route.ts`
   - `packages/nextjs/app/api/watchlist/content/route.ts`
   - `packages/nextjs/app/api/follows/profiles/route.ts`
5. Remove any action-specific wrappers that only forward to generic helpers.

### Acceptance criteria

- Challenge routes differ only in payload normalization and action constants.
- Signed-write routes share one challenge-error mapping path.
- No route rebuilds generic challenge persistence logic inline.
- Existing response shapes stay stable.

---

## Workstream B: Round Adapter Completion

### Goal

Keep contract reads and round/timing logic behind a small shared boundary so UI hooks stop carrying round-specific math.

### Target architecture

The shared round adapter should own:

- tuple parsing
- voting config normalization
- round snapshot derivation
- round timing derivation
- vote-commit request shaping
- allowance decision helpers

The core files should be:

- `packages/nextjs/lib/contracts/roundVotingEngine.ts`
- `packages/nextjs/hooks/useRoundSnapshot.ts`

### What should move

#### From `useRoundVote.ts`

Move into shared adapter helpers:

- stake normalization
- commit-hash input shaping
- allowance decision logic
- vote-parameter construction

Keep in the hook:

- wallet presence checks
- terms acceptance
- tx submission
- optimistic query updates
- user-facing error state

#### From `useActiveVotesWithDeadlines.ts`

Keep the Ponder fetch logic there, but reuse shared timing helpers for:

- epoch-1 end
- round expiry
- countdown derivation

If formatting remains local, that is fine. The important part is that timing math should not drift from the snapshot logic.

#### For `useVotingConfig.ts`

Either:

- keep it as a tiny internal helper used by `useRoundSnapshot()` and vote-related hooks, or
- fold it into a lower-level query helper and stop treating it as a feature hook

Do not add more feature hooks that read `config()` independently.

### Concrete tasks

1. Add pure helpers to `packages/nextjs/lib/contracts/roundVotingEngine.ts` for:
   - `needsApproval(...)`
   - `buildCommitVoteParams(...)`
   - `deriveVoteDeadlines(...)`
2. Refactor `packages/nextjs/hooks/useRoundVote.ts` to consume those helpers.
3. Refactor `packages/nextjs/hooks/useActiveVotesWithDeadlines.ts` to reuse shared timing helpers.
4. Decide whether `useVotingConfig.ts` remains as a small internal adapter or gets folded into a lower-level query helper.

### Acceptance criteria

- Round timing math lives in one shared module.
- Vote-commit argument construction lives in one shared module.
- No feature hook owns bespoke round math that is also needed elsewhere.
- Future round-state changes require edits in one place instead of several hooks.

---

## Workstream C: Test Coverage

### Goal

Add small, high-signal tests around the shared boundary rather than broad UI churn.

### Unit tests

Add or extend pure tests for:

- `parseVotingConfig()`
- `parseRound()`
- `deriveRoundSnapshot()`
- `deriveVoteDeadlines()`
- `needsApproval()`
- signed-action payload hashing helpers
- signed-action error mapping helpers

### API tests

Add or extend tests for each signed-action route family:

- challenge issuance succeeds for valid payload
- valid challenge + valid signature succeeds once
- replay returns `409`
- payload mismatch returns `401`
- expired challenge returns `401`
- invalid signature returns `401`

### Concurrency tests

Add a race test that proves one challenge cannot be consumed twice.

Target at least:

- comments
- username updates

### End-to-end tests

Add a small Playwright set for:

- approve then commit vote on fresh allowance
- no re-approval when allowance is already sufficient
- consistent active round display across screens using shared round state
- epoch-1 countdown transition
- settlement readiness display once thresholds are met

### Acceptance criteria

- The shared round adapter has unit coverage for parsing and timing.
- One-time challenge replay protection is covered by API tests.
- At least one concurrency test exists for challenge reuse.
- Browser-level coverage exists for the critical vote flow.

---

## Suggested Implementation Order

1. Finish signed-action consolidation first.
   Reason: the security model is already correct, but the current duplication makes it easier to regress.
2. Finish round adapter extraction next.
   Reason: this reduces frontend/keeper/indexer disagreement risk before mainnet.
3. Add the focused tests immediately after each refactor instead of leaving them to the end.

---

## Explicit Non-Goals

- No large UI/page decomposition in this pass.
- No swap away from wagmi/scaffold-eth before mainnet.
- No Solidity refactor in this plan.
- No full SIWE session auth in this plan.

---

## Ticket Breakdown

1. Add shared signed-action issue/error helpers.
2. Collapse challenge routes onto the shared helper path.
3. Collapse signed-write routes onto the shared helper path.
4. Remove redundant per-action wrappers after migration.
5. Add round vote param helpers in `roundVotingEngine.ts`.
6. Refactor `useRoundVote.ts` to consume shared helpers.
7. Refactor `useActiveVotesWithDeadlines.ts` to consume shared timing helpers.
8. Add unit tests for round helpers.
9. Add API replay/mismatch/expiry tests for signed actions.
10. Add concurrency coverage for challenge reuse.
11. Add a small Playwright suite for critical vote flow and round timing.
