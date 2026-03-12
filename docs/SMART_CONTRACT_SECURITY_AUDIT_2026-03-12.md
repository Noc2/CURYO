# Curyo Smart Contract Security Audit

Date: 2026-03-12

Audited repository state: current workspace state in `/Users/davidhawig/source/curyo-release`

## Executive Summary

I re-audited the Solidity contracts in `packages/foundry/contracts` after the recent round-lifecycle, submitter-stake, and ERC-1363 voting changes.

The good news is that the most obvious high-risk regressions are not present:

- the new one-transaction ERC-1363 voting path is guarded against forced `transferFromAndCall` voting,
- commit hashes are now bound to the exact stored ciphertext bytes,
- the old no-op keeper reward drain in unrevealed-vote processing is fixed,
- losing-side participation farming is materially reduced because participation rewards are now winner-only.

I did **not** find a critical direct fund-drain, a trivial authorization bypass, or an obvious reentrancy issue in the current code.

The main remaining risks are economic and lifecycle issues:

1. dormant-eligible content can still reopen voting when an old `Open` round silently rolls into `RevealFailed`,
2. submitter stake can now resolve while unresolved rounds are still open, which weakens the anti-spam bond,
3. submitter participation rewards are still best-effort and can be lost permanently,
4. malformed ciphertext can still grief settlement even though ciphertext substitution is now prevented.

## Scope

Primary review targets:

- [packages/foundry/contracts/RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol)
- [packages/foundry/contracts/RoundRewardDistributor.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundRewardDistributor.sol)
- [packages/foundry/contracts/ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol)
- [packages/foundry/contracts/CuryoReputation.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/CuryoReputation.sol)
- [packages/foundry/contracts/ParticipationPool.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ParticipationPool.sol)
- [packages/foundry/contracts/FrontendRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/FrontendRegistry.sol)
- [packages/foundry/contracts/HumanFaucet.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/HumanFaucet.sol)
- [packages/foundry/contracts/governance/CuryoGovernor.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/governance/CuryoGovernor.sol)
- supporting libraries and the higher-signal security/invariant/integration suites in `packages/foundry/test`

## Methodology

- Manual line-by-line review of the contracts and relevant tests.
- Focused reasoning around access control, accounting invariants, liveness, griefing, and economic manipulation.
- Validation with `forge test --offline`.

Validation result during this refresh:

- `1281` tests passed
- `1` test failed
- failing test: `test/SecurityTests.t.sol::SecurityAccessControlTest::test_ACL_Engine_fundConsensusReserve_Unauthorized`

That failing test currently expects `addToConsensusReserve()` to be ACL-gated, but the live contract intentionally documents it as permissionless in [packages/foundry/contracts/RoundVotingEngine.sol:320](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L320). I treat that as test drift, not a live contract vulnerability.

## Findings

### 1. Medium - Dormancy can still be bypassed when an old `Open` round auto-finalizes to `RevealFailed`

**Where**

- [packages/foundry/contracts/RoundVotingEngine.sol:420](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L420)
- [packages/foundry/contracts/RoundVotingEngine.sol:523](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L523)
- [packages/foundry/contracts/ContentRegistry.sol:545](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol#L545)

**What happens**

`_commitVote()` only checks `registry.isDormancyEligible(contentId)` when there is no current round or the current round is already terminal.

But `_getOrCreateRound()` can take a still-`Open` round, auto-finalize it to `RevealFailed`, and immediately create a fresh round in the same call:

- `_commitVote()` skips dormancy because the old round is still `Open` at that moment,
- `_getOrCreateRound()` then flips that round to `RevealFailed`,
- a new round is created without re-checking dormancy eligibility.

**Impact**

Dormant-eligible content can still receive a fresh round and new votes without going through the intended `markDormant()` / `reviveContent()` path and without paying `REVIVAL_STAKE`.

This weakens the stale-content / anti-spam lifecycle and lets old content remain active past the dormancy window.

**Exploit path**

1. Content ages past the dormancy window.
2. The active round is still `Open`, but already old enough to finalize as `RevealFailed`.
3. A user calls `commitVote()`.
4. The old round is auto-finalized inside `_getOrCreateRound()`.
5. The same transaction opens a new round without ever re-running dormancy validation.

**Suggested fix**

Re-run the dormancy check after auto-finalizing an `Open` round and before creating a new round.

The safest implementation is inside `_getOrCreateRound()` immediately before `nextRoundId++`.

I also recommend adding a regression test for the exact path:

- dormancy eligible,
- previous round auto-finalizes to `RevealFailed`,
- new commit should revert with `DormancyWindowElapsed`.

### 2. Medium - Submitter stake can resolve while unresolved open rounds still exist

**Where**

- [packages/foundry/contracts/libraries/SubmitterStakeLib.sol:28](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/libraries/SubmitterStakeLib.sol#L28)
- [packages/foundry/contracts/ContentRegistry.sol:423](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol#L423)
- [packages/foundry/contracts/ContentRegistry.sol:454](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol#L454)
- [packages/foundry/test/SubmitterStakeResolution.t.sol:122](/Users/davidhawig/source/curyo-release/packages/foundry/test/SubmitterStakeResolution.t.sol#L122)

**What happens**

If `hasSettledRound == false` and the content is older than `DORMANCY_PERIOD`, `SubmitterStakeLib.resolve()` calls `registry.resolvePendingSubmitterStake(contentId)` even if there is still an unresolved `Open` round.

The current tests explicitly assert this behavior.

Because unresolved rounds do not update rating, the content can still be sitting at its neutral or healthy rating when the submitter stake is released.

**Impact**

The submitter bond can be released while the content still has an unresolved negative round hanging over it.

That weakens the anti-spam bond in exactly the cases where reveal withholding or bad ciphertext delayed resolution.

Once the stake is returned, a later unfavorable settlement or reveal-failed cleanup cannot claw it back.

**Exploit path**

1. Content gets an `Open` round but never reaches final settlement.
2. Reveals are withheld, malformed, or simply never completed.
3. The content ages past `DORMANCY_PERIOD`.
4. Anyone calls `resolveSubmitterStake()`.
5. The stake is returned based on current rating, even though unresolved round state still exists.

**Suggested fix**

Do not resolve submitter stake on the no-settled-round path while any round is still `Open`.

Reasonable fixes:

- require the current round to be terminal before calling `resolvePendingSubmitterStake()`, or
- automatically finalize the round to `RevealFailed` first and only then resolve the submitter stake, or
- make dormancy fallback depend on both elapsed time and lack of open rounds.

### 3. Medium - Submitter participation rewards can still be silently lost forever

**Where**

- [packages/foundry/contracts/ContentRegistry.sol:431](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol#L431)
- [packages/foundry/contracts/ParticipationPool.sol:157](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ParticipationPool.sol#L157)

**What happens**

When submitter stake is returned on the healthy path, `ContentRegistry` attempts to pay the submitter’s participation reward immediately through:

- `participationPool.distributeReward(...)`, or
- `participationPool.rewardSubmission(...)`

Those calls are wrapped in `try/catch`, and failure is swallowed.

Unlike voter participation rewards, there is no submitter-side pull accounting, retry path, or debt record.

**Impact**

A submitter can permanently lose earned participation rewards if the pool is depleted, paused by failure, or otherwise reverting at the moment stake resolves.

The stake return succeeds, `submitterStakeReturned` becomes true, and the reward cannot be retried later.

**Suggested fix**

Move submitter participation rewards to the same pull-based pattern already used for voter participation rewards:

- record unpaid submitter reward state, and
- allow a later claim or retry.

At minimum, do not silently drop the reward without persisting an unpaid balance.

### 4. Medium - Ciphertexts are now bound to reveals, but still not proven decryptable on-chain

**Where**

- [packages/foundry/contracts/RoundVotingEngine.sol:389](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L389)
- [packages/foundry/contracts/RoundVotingEngine.sol:531](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L531)
- [packages/foundry/contracts/RoundVotingEngine.sol:584](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L584)
- [packages/foundry/contracts/RoundVotingEngine.sol:982](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L982)

**What happens**

The current commit format is much stronger than before:

- `commitHash = keccak256(isUp, salt, contentId, keccak256(ciphertext))`

That prevents swapping in a different ciphertext/plaintext pair at reveal time.

But `commitVote()` still accepts any non-empty ciphertext under the size limit, and the chain still never proves that the stored bytes are actually decryptable by keepers or anyone else after epoch end.

**Impact**

Malformed ciphertext can still:

- block settlement until reveal grace expires, or
- push a commit-quorum round into `RevealFailed`.

This is no longer a ciphertext-substitution issue, but it remains a real liveness and griefing issue.

**Suggested fix**

If the current tlock UX stays, the realistic strengthening options are:

- keeper-attested revealability,
- verifiable/zk reveal proofs,
- or a classic commit-reveal fallback model.

If the protocol is not changing immediately, the docs should continue to describe this precisely as an operational assumption, not an on-chain guarantee.

### 5. Low - Slashed frontend fee shares can still become permanently stranded

**Where**

- [packages/foundry/contracts/RoundRewardDistributor.sol:343](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundRewardDistributor.sol#L343)
- [packages/foundry/test/RoundIntegration.t.sol:1526](/Users/davidhawig/source/curyo-release/packages/foundry/test/RoundIntegration.t.sol#L1526)

**What happens**

Historical frontend fee claims revert while the snapshotted frontend remains slashed.

That preserves the fee share if governance later unslashes the frontend, but there is still no alternate sink if the slash is intended to be permanent.

**Impact**

Historical frontend fee shares can remain stuck indefinitely.

This is not a theft bug, but it is incomplete economic policy and stranded-value risk.

**Suggested fix**

Define and encode one permanent-slashed outcome:

- redirect to treasury,
- redirect back to voter pool,
- or add an explicit governance sweep / reassignment path.

### 6. Low - Direct token transfers can still strand cREP in internal-accounting contracts

**Where**

- [packages/foundry/contracts/ParticipationPool.sol:39](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ParticipationPool.sol#L39)
- [packages/foundry/contracts/ParticipationPool.sol:98](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ParticipationPool.sol#L98)
- [packages/foundry/test/SecurityTests.t.sol:322](/Users/davidhawig/source/curyo-release/packages/foundry/test/SecurityTests.t.sol#L322)

**What happens**

Several contracts track internal balances separately from raw token balance:

- `ParticipationPool.poolBalance`
- `RoundVotingEngine.consensusReserve`
- `RoundVotingEngine.keeperRewardPool`

But cREP is still a normal ERC20 and can be directly transferred into those contracts without updating the internal accounting.

The test suite now explicitly shows this for `RoundVotingEngine`: a plain transfer increases the engine balance without creating a vote.

**Impact**

Accidental direct transfers can strand funds and make metrics/reserve accounting diverge from actual token balances.

**Suggested fix**

Add governance-controlled rescue logic for **surplus only**, defined as:

- actual token balance minus all accounted liabilities.

Do not add a general-purpose sweep that can touch user-accounted stake or reserves.

## Resolved Or Improved Since The Previous Pass

- The old no-op keeper reward drain in `processUnrevealedVotes()` is fixed. The function now reverts on empty batches and only pays the keeper once, and only when actual forfeitures occur.
- Participation rewards are now winner-only in [packages/foundry/contracts/RoundRewardDistributor.sol:257](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundRewardDistributor.sol#L257), which materially reduces the earlier self-opposition farming issue.
- Commit hashes now bind to `keccak256(ciphertext)` in [packages/foundry/contracts/RoundVotingEngine.sol:349](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L349) and [packages/foundry/contracts/RoundVotingEngine.sol:982](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L982), closing the older ciphertext-substitution hole.
- The reward distributor now has an explicit stranded-cREP recovery path in [packages/foundry/contracts/RoundRewardDistributor.sol:110](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundRewardDistributor.sol#L110).

## Positive Observations

- The new ERC-1363 one-transaction voting path is hardened correctly against forced spender voting:
  - [packages/foundry/contracts/RoundVotingEngine.sol:363](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L363)
  - [packages/foundry/test/SecurityTests.t.sol:292](/Users/davidhawig/source/curyo-release/packages/foundry/test/SecurityTests.t.sol#L292)
- Full-suite invariants around pool solvency, double-claim prevention, token conservation, and keeper accounting currently pass.
- The governance token lock still blocks ordinary transfers while intentionally allowing content-voting transfers:
  - [packages/foundry/contracts/CuryoReputation.sol:166](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/CuryoReputation.sol#L166)

## Recommended Priority Order

1. Fix the dormant-content rollover and unresolved-round submitter-stake resolution issues.
2. Add durable accounting for submitter participation rewards.
3. Decide whether frontend fee shares should remain frozen forever when permanently slashed.
4. Keep the ciphertext trust model documented precisely unless the protocol is upgraded to prove revealability.
