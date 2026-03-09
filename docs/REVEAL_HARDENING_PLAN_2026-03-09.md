# Reveal Hardening Plan

Status: Implemented
Last updated: 2026-03-09

## Summary

This document describes the recommended near-term hardening path for Curyo's reveal model.

The recommendation is:

- keep the current tlock-based automatic keeper reveal as the default UX
- add a hidden `Reveal my vote` fallback for users who want direct control if the keeper appears delayed
- change the round economics so that non-reveal is materially worse than reveal
- keep the protocol simple by avoiding new relayers, delegated reveal signatures, or zk/optimistic dispute machinery in this phase

This is the best balance between:

- user experience
- engineering effort
- auditability
- better resistance to quorum-withholding and selective non-reveal

## Goals

- Preserve the current "commit once, keeper reveals automatically" happy path.
- Give users a direct self-reveal fallback without turning reveal into a primary manual workflow.
- Remove the current full-refund path for attackers who commit but strategically refuse to reveal.
- Make revealed losing votes strictly better than unrevealed losing votes.
- Avoid introducing new contract or frontend trust assumptions beyond what already exists.

## Non-Goals

- This does not close the ciphertext-binding trust gap by itself.
- This does not add delegated reveal signatures, relayers, or meta-transactions.
- This does not attempt zk verification before mainnet.
- This does not turn manual self-reveal into a default user journey.

## Current Problems

### 1. Keeper fallback existed at the protocol layer before the product caught up

`revealVoteByCommitKey()` is already permissionless in `packages/foundry/contracts/RoundVotingEngine.sol`, so a user can reveal their own vote after epoch end.

The missing piece was the app:

- the production Next.js frontend now exposes a hidden manual reveal flow
- the public docs now describe that fallback without claiming reveal secrets are persisted client-side by default

### 2. Quorum-withholding / cancel-for-refund

Today a round can still end in a refund-friendly state even after attackers created meaningful commit activity, because cancellation is effectively governed by revealed votes rather than total commits.

### 3. Selective non-reveal remains economically attractive

Today a losing voter may prefer to stay unrevealed if that increases their chance of avoiding an unfavorable outcome. That optionality should be reduced economically even if it is not fully eliminated cryptographically.

## Chosen Direction

The plan has two layers.

### Layer A: Hidden self-reveal fallback

This is a product/liveness improvement:

- users can reveal their own votes if they do not want to rely on the keeper
- the page remains hidden and advanced
- the default product story stays "auto-reveal in the background"

### Layer B: Economic hardening

This is a protocol improvement:

- revealed losing votes get a small rebate
- unrevealed losing votes get nothing
- once a round reaches commit quorum, attackers no longer get a full cancel refund by simply withholding reveals
- if commit quorum is reached but reveal quorum never is, the round ends in a penalizing terminal state instead of a full refund

## Detailed Spec

## A. Hidden Self-Reveal Fallback

### UX placement

- Add a small secondary text link near the existing voting-stake / cREP wallet status in `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown.tsx`.
- Only show it when the connected account has unrevealed votes.
- The link should remain subtle. It is a backup, not a main call to action.

Suggested copy:

- `Reveal my vote`

### Route

Add a hidden route:

- `/vote/reveal`

Requirements:

- wallet connection required
- not linked from main nav
- no indexable feature card or hero
- plain explanatory copy: `Advanced fallback if automatic reveal appears delayed.`

### Data flow

Do not add a server endpoint.

For each unrevealed vote:

1. fetch the user's open-round votes from Ponder
2. read `voterCommitHash(contentId, roundId, voter)` from `RoundVotingEngine`
3. derive `commitKey = keccak256(abi.encodePacked(voter, commitHash))`
4. read `getCommit(contentId, roundId, commitKey)`
5. if `block.timestamp >= revealableAfter`, decrypt the on-chain ciphertext locally in the browser
6. call the existing `revealVoteByCommitKey(...)` transaction from the connected wallet

### Secret handling

Do not store `(isUp, salt)` in `localStorage` by default.

Instead:

- decrypt on demand from the on-chain ciphertext after epoch end
- keep reveal material in memory for the current session only

Rationale:

- OWASP guidance treats local storage as unsafe for sensitive data under XSS
- the fallback does not need long-lived local secret persistence

### Error handling

Treat these as benign:

- `AlreadyRevealed`
- keeper/user race on the same vote

Do not auto-call `settleRound()` from this page in v1.

## B. Economic Hardening

## B1. Round outcome rules

The round should have four economic terminal paths:

1. `Cancelled`
2. `Settled`
3. `Tied`
4. `RevealFailed` (new)

### Cancelled

`Cancelled` should only be reachable if:

- the round expires, and
- `voteCount < minVoters`

This preserves refunds for genuinely low-participation rounds.

### Settled

`Settled` remains the normal path when:

- `revealedCount >= minVoters`, and
- all past-epoch reveal obligations are satisfied or past grace

### Tied

`Tied` remains a normal terminal outcome when weighted pools are equal.

### RevealFailed (new)

Add a new terminal state when:

- `voteCount >= minVoters`, but
- `revealedCount < minVoters`, and
- the final reveal grace deadline has passed

This prevents "commit quorum reached, withhold reveals, get refunded anyway."

## B2. Proposed penalty / refund schedule

### Recommended constants

Start with:

- `REVEALED_LOSER_REFUND_BPS = 500` (5%)

Do not make this governance-configurable in v1.

Reason:

- smaller attack surface
- easier economic analysis
- easier audit story

If later made configurable, cap it at `<= 1000` (10%).

### Settled round payouts

#### Winning revealed votes

No change:

- full stake return
- proportional share of the net losing pool

#### Losing revealed votes

New rule:

- receive a small rebate, recommended at `5%` of original stake

This makes "reveal and lose" strictly better than "do not reveal and lose."

#### Losing unrevealed votes

New rule:

- receive `0`

This is the core non-reveal penalty.

### Tied round payouts

Recommended rule:

- revealed votes: full stake refund
- unrevealed votes whose reveal deadline passed: `0`

This is intentionally stricter than the current tied-round refund behavior. The reason is that non-reveal can still be used strategically to block or delay resolution.

### RevealFailed payouts

Recommended rule:

- revealed votes: full stake refund
- unrevealed votes: `0`
- no rating update
- no submitter/front-end/category reward distribution
- no consensus subsidy

This preserves fairness for users who did reveal while still penalizing those who withheld.

## B3. Source of loser rebates

The revealed-loser rebate should come out of the losing side's raw stake before the existing pool split.

Recommended accounting:

1. compute `rawLosingPool`
2. compute `revealedLoserRefundPool`
3. `netLosingPool = rawLosingPool - revealedLoserRefundPool`
4. apply the existing `RewardMath.splitPool(netLosingPool)` logic

This avoids hidden inflation and keeps the change economically explicit.

## B4. Settlement / finalization rules

### Keep `settleRound()` for normal settlement

`settleRound()` should still handle:

- `Settled`
- `Tied`

### Change `cancelExpiredRound()`

`cancelExpiredRound()` should only succeed if:

- the round expired, and
- `voteCount < minVoters`

It should no longer be possible to cancel for full refund once commit quorum exists.

### Add `finalizeRevealFailedRound()`

Add a new function, for example:

- `finalizeRevealFailedRound(contentId, roundId)`

It should be permissionless and should succeed only when:

- round is still open
- `voteCount >= minVoters`
- `revealedCount < minVoters`
- the final reveal grace deadline has passed

Recommended timing rule:

- track `lastCommitRevealableAfter[contentId][roundId]`
- allow `RevealFailed` once `block.timestamp >= lastCommitRevealableAfter + revealGracePeriod`

This avoids waiting until theoretical max round lifetime if the last real commit happened earlier.

## B5. Unrevealed-vote processing

`processUnrevealedVotes()` should be updated for the new policy.

### Settled

- unrevealed votes with `revealableAfter <= settledAt`: forfeit
- unrevealed votes with `revealableAfter > settledAt`: refund, because they had no chance to reveal before the round closed

### Tied

Recommended:

- same "no chance => refund" logic for future/current-epoch votes
- past-deadline unrevealed votes forfeit

### RevealFailed

Recommended:

- all unrevealed votes forfeit, because `RevealFailed` only becomes reachable after the final reveal grace deadline

## C. Contract-Level Changes

### `RoundLib.sol`

- add `RevealFailed` to `RoundState`

### `RoundVotingEngine.sol`

Add:

- `mapping(uint256 => mapping(uint256 => uint256)) public lastCommitRevealableAfter;`
- `function finalizeRevealFailedRound(uint256 contentId, uint256 roundId) external`

Change:

- `_commitVote()` updates `lastCommitRevealableAfter`
- `cancelExpiredRound()` uses `voteCount`, not reveal-threshold history
- `processUnrevealedVotes()` includes `RevealFailed` behavior

Keep:

- `revealVoteByCommitKey()` unchanged

### `RoundRewardDistributor.sol`

Change `claimReward()` semantics:

- winning revealed vote: existing winner payout
- losing revealed vote: pay small rebate
- losing unrevealed vote: no payout

Add or rename events if needed so the indexer/UI can distinguish:

- normal winner claims
- loser rebate claims

### `RewardMath.sol`

Add helper(s) for:

- loser rebate pool calculation
- net losing pool split after loser rebates

## D. Frontend / Indexer Plan

### Hidden reveal page

Add:

- `packages/nextjs/app/vote/reveal/page.tsx`
- `packages/nextjs/hooks/useManualReveal.ts`

### Ponder

Update indexing and API handling for:

- new `RevealFailed` state
- loser rebate claims if represented by new events

### UI updates outside the hidden reveal page

Keep changes minimal:

- subtle wallet link
- round-state handling where necessary for `RevealFailed`
- no new prominent reveal UI

## Security Review

## New risks intentionally avoided

This plan does not introduce:

- new relayer signatures
- delegated reveal meta-transactions
- server-side secret custody
- default local browser persistence of reveal secrets
- optimistic rollback logic
- zk verifier complexity

## New risks introduced by the economic changes

### 1. Self-opposition profitability may worsen

Even a small loser rebate can improve same-user / colluding opposite-side farming.

Mitigation:

- start at `5%`, not higher
- rerun `packages/foundry/test/SelfOppositionProfitability.t.sol`
- reject the change if adversarial profitability becomes unacceptable at low-participation levels

### 2. Solvency bugs

Changing payout semantics affects the main fund-flow surface.

Mitigation:

- update and rerun `InvariantSolvency.t.sol`
- add specific accounting invariants for loser rebates and `RevealFailed`

### 3. Stuck rounds if `RevealFailed` timing is wrong

If the finalization condition is too weak or too strong, rounds may fail to close or may close prematurely.

Mitigation:

- track `lastCommitRevealableAfter`
- add explicit tests for late last-epoch commits

### 4. Indexer / frontend state drift

New terminal states and payout semantics can cause UI/indexer mismatch if only part of the stack is updated.

Mitigation:

- regenerate shared ABIs
- update Ponder state mappings
- add cross-package integration coverage

## Testing Plan

### Contract tests

Extend:

- `packages/foundry/test/SelectiveRevelationTest.t.sol`
- `packages/foundry/test/SettlementEdgeCases.t.sol`
- `packages/foundry/test/AdversarialTests.t.sol`
- `packages/foundry/test/SelfOppositionProfitability.t.sol`
- `packages/foundry/test/InvariantSolvency.t.sol`

Add scenarios for:

- `cancelExpiredRound()` with `voteCount >= minVoters` now reverting
- `RevealFailed` path after final reveal grace
- loser rebate payout to revealed losers only
- tied rounds with unrevealed expired commits forfeiting
- future/current-epoch unrevealed refund behavior after early settlement/tie

### Frontend tests

Add:

- hidden reveal page unit coverage
- benign `AlreadyRevealed` race handling
- no default `localStorage` persistence of reveal data

### E2E tests

Add at least:

1. user commits a vote
2. keeper is paused or bypassed
3. user reaches hidden reveal page via wallet-status link
4. user reveals successfully
5. later round state reflects the reveal

And:

1. commit quorum reached
2. attackers reveal too few votes
3. round cannot cancel for refund
4. after grace, `RevealFailed` finalizes
5. revealed users recover stake, unrevealed users do not

## Documentation Plan

### Public docs

Update:

- `packages/nextjs/scripts/whitepaper/content.ts`
- `packages/nextjs/app/docs/smart-contracts/page.tsx`
- `packages/nextjs/app/docs/how-it-works/page.tsx`

Required changes:

- explain that keeper reveal remains the default UX
- explain that self-reveal is available as an advanced fallback
- explain that unrevealed losing votes are penalized more heavily than revealed losing votes
- explain the shipped `RevealFailed` behavior

### Mainnet readiness

`docs/MAINNET_READINESS.md` should point to this plan instead of the narrower fallback-only note.

Important:

- the ciphertext-binding readiness item still remains open
- this plan improves liveness and economics but does not cryptographically bind ciphertext to the reveal path

## Implementation Phases

### Phase 1: Hidden self-reveal fallback

Ship first because it is low-risk and useful independently.

Scope:

- hidden route
- wallet-status link
- local post-epoch decryption
- direct user reveal tx
- docs correction

### Phase 2: Contract economic changes

Scope:

- `RevealFailed`
- cancel rule change
- loser rebate
- unrevealed forfeiture changes

### Phase 3: Indexer / UI integration

Scope:

- new round state handling
- loser rebate display
- portfolio/history consistency

### Phase 4: Adversarial validation

Do not ship phase 2 without:

- self-opposition profitability re-check
- solvency invariants
- end-to-end round-finalization tests

## Effort Estimate

### Phase 1 only

- about 1 week

### Full plan

- contract/state machine changes: 1.5-2 weeks
- reward/accounting/invariant updates: 1 week
- Ponder/frontend integration: 0.5-1 week
- docs and adversarial validation: 0.5-1 week

Total:

- about 3-5 weeks

That is still materially cheaper and lower-risk than:

- optimistic reveal + challenge
- keeper-attested reveals
- zk verification
- full classic mandatory self-reveal redesign

## Recommendation

If only one thing ships before mainnet:

- ship the hidden self-reveal fallback

If there is time for the broader hardening:

- ship the full plan in order: fallback first, economics second

This gives Curyo a better reveal story without throwing away the current user-friendly automatic reveal flow.

## Sources

- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/foundry/contracts/RoundRewardDistributor.sol`
- `packages/foundry/contracts/libraries/RewardMath.sol`
- `packages/keeper/src/keeper.ts`
- `packages/nextjs/hooks/useRoundVote.ts`
- `packages/nextjs/hooks/useActiveVotesWithDeadlines.ts`
- `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown.tsx`
- OWASP HTML5 Security Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html>
- ENS commit-reveal reference: <https://docs.ens.domains/registry/eth/>
- Ethereum Research on last-revealer attacks: <https://ethresear.ch/t/limiting-last-revealer-attacks-in-beacon-chain-randomness/3705>
- Sealed-bid rationality / liveness references:
  - <https://eprint.iacr.org/2021/264>
  - <https://eprint.iacr.org/2024/1643>
