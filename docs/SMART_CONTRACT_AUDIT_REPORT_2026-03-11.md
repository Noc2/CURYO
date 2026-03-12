## Curyo Smart Contract Audit Report

Date: March 11, 2026

### Scope

Reviewed contracts under:

- `packages/foundry/contracts/`
- `packages/foundry/contracts/governance/`
- `packages/foundry/contracts/libraries/`

Primary focus:

- `RoundVotingEngine.sol`
- `RoundRewardDistributor.sol`
- `ContentRegistry.sol`
- `FrontendRegistry.sol`
- `HumanFaucet.sol`
- `VoterIdNFT.sol`
- `ParticipationPool.sol`
- `CategoryRegistry.sol`
- `ProfileRegistry.sol`
- `CuryoGovernor.sol`
- `CuryoReputation.sol`

### Methodology

Review methodology was based on:

- Solidity security review guidance from the official Solidity documentation:
  - `checks-effects-interactions`
  - reentrancy and external-call surfaces
  - authorization and upgradeability review
  - gas/liveness and unbounded-loop analysis
- OpenZeppelin upgradeable/UUPS review guidance:
  - initializer safety
  - `_authorizeUpgrade` restrictions
  - storage-layout compatibility
- Economic review of:
  - reward solvency
  - fee routing
  - griefing/delay vectors
  - delegation / identity canonicalization

The review combined:

- manual code inspection
- adversarial reasoning against economically meaningful flows
- full Foundry test execution
- targeted execution of adversarial, invariant, upgrade, settlement-edge, faucet, governance, and formal-verification suites

### Test Execution

Full test result:

- `forge test`
- Result: `1292 passed, 0 failed, 0 skipped`

High-signal suites also re-run independently during review:

- `forge test --match-path test/AdversarialTests.t.sol`
- `forge test --match-contract InvariantSolvency`
- `forge test --match-path test/RoundIntegration.t.sol`
- `forge test --match-path test/UpgradeTest.t.sol`
- `forge test --match-path test/SecurityTests.t.sol`
- `forge test --match-path test/SettlementEdgeCases.t.sol`
- `forge test --match-path test/HumanFaucet.t.sol`
- `forge test --match-path test/HumanFaucetCoverage.t.sol`
- `forge test --match-path test/Governance.t.sol`
- `forge test --match-path test/FormalVerification_Governance.t.sol`
- `forge test --match-path test/FormalVerification_GameTheory.t.sol`
- `forge test --match-path test/FormalVerification_RoundLifecycle.t.sol`

### Executive Summary

No new critical or high-severity drain, mint, authorization-bypass, or upgrade-control issue was identified in the current contract set.

Two medium-severity issues remain:

- submitter stake resolution can be griefed indefinitely with cheap active-round spam
- participation rewards for a settled round can become permanently unclaimable if the settlement-time rate snapshot fails

One low-severity identity-consistency issue remains in auxiliary registries.

### Findings

#### 1. Medium — Submitter stake resolution can be griefed indefinitely by keeping one round open

**Affected files**

- [`packages/foundry/contracts/RoundVotingEngine.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L1158)
- [`packages/foundry/contracts/ContentRegistry.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol#L391)
- [`packages/foundry/contracts/ParticipationPool.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ParticipationPool.sol#L119)
- [`packages/foundry/test/ContentRegistryBranches.t.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/test/ContentRegistryBranches.t.sol#L410)

**Description**

`_checkSubmitterStake()` refuses to resolve submitter stake while any round for that content is still open. Because any user can open a new round with the minimum 1 cREP stake, a third party can keep the content in a permanently “active round exists” state by opening one below-threshold round at a time and later reclaiming it via normal cancellation.

Relevant logic:

- any caller can open/extend a round through `commitVote()` at [`RoundVotingEngine.sol:463`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L463)
- below-threshold rounds can be cancelled and refunded at [`RoundVotingEngine.sol:667`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L667)
- submitter stake resolution hard-reverts while a round is active at [`RoundVotingEngine.sol:1164`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L1164)

This is not only a timing nuisance:

- low-rated content can have slashing delayed
- healthy content can have stake return delayed
- the submission participation reward is paid using the **live** participation-pool rate at return time, not a snapshot, via [`ContentRegistry.sol:400`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol#L400) and [`ParticipationPool.sol:122`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ParticipationPool.sol#L122)

That means a griefer can reduce a healthy submitter’s participation reward by delaying stake resolution until later halving tiers.

**Impact**

- griefing / liveness failure
- low-cost delay of slash enforcement
- low-cost suppression of healthy submitter reward timing and amount

**Recommendation**

Do not gate submitter-stake resolution on “no active round exists.” Instead:

- snapshot the first eligible slash/return decision window separately from future round activity, or
- resolve the submitter stake against the first qualifying settled round and mark it final, regardless of later open rounds

At minimum, participation rewards for submitters should also be snapshotted at the point the healthy-resolution condition becomes true.

#### 2. Medium — Participation reward claims become permanently unclaimable if settlement-time rate snapshot fails

**Affected files**

- [`packages/foundry/contracts/RoundVotingEngine.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L346)
- [`packages/foundry/contracts/RoundVotingEngine.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L860)
- [`packages/foundry/contracts/RoundVotingEngine.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol#L1269)
- [`packages/foundry/test/RoundIntegration.t.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/test/RoundIntegration.t.sol#L1917)

**Description**

During settlement, the engine snapshots `roundParticipationPool` before calling `getCurrentRateBps()`.

If `getCurrentRateBps()` reverts:

- the pool address snapshot is still written
- the rate snapshot remains zero
- later `claimParticipationReward()` reverts with `NoParticipationRate`
- governance cannot repair the round with `backfillParticipationRewardSnapshot()` because that helper requires the pool snapshot to still be empty

The repository already contains an explicit regression test demonstrating the current behavior at [`RoundIntegration.t.sol:1917`](/Users/davidhawig/source/curyo-release/packages/foundry/test/RoundIntegration.t.sol#L1917).

**Impact**

- settled-round participation rewards can be permanently stranded
- recovery currently requires a contract upgrade rather than a governance backfill

**Recommendation**

Make the snapshot atomic from a recovery perspective. One safe pattern:

- only write `roundParticipationPool` after `getCurrentRateBps()` succeeds, or
- allow the governance backfill path to repair rounds where pool is set but rate is still zero

The second option is lower-risk for upgradeable deployments because it preserves current settlement ordering.

#### 3. Low — Auxiliary registries still treat delegates as standalone Voter ID holders

**Affected files**

- [`packages/foundry/contracts/CategoryRegistry.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/CategoryRegistry.sol#L90)
- [`packages/foundry/contracts/ProfileRegistry.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ProfileRegistry.sol#L75)
- [`packages/foundry/contracts/VoterIdNFT.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/VoterIdNFT.sol#L204)
- [`packages/foundry/contracts/VoterIdNFT.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/VoterIdNFT.sol#L332)
- [`packages/foundry/contracts/FrontendRegistry.sol`](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/FrontendRegistry.sol#L168)

**Description**

`VoterIdNFT.hasVoterId()` intentionally returns true for both the holder and an authorized delegate. The voting engine and frontend registration path already normalize identity or explicitly require the holder address. Category and profile registries do not: they only gate on `hasVoterId(msg.sender)`.

That allows one human to operate both:

- the holder address
- the delegate address

as separate on-chain personas in those auxiliary registries.

**Impact**

- weaker “one human, one account surface” assumption outside the voting path
- duplicate profile/category activity for a single underlying identity

**Recommendation**

If the intended policy is one canonical human identity across all registries, normalize callers through `resolveHolder()` before enforcing Voter ID-based uniqueness, or require `resolveHolder(msg.sender) == msg.sender` in those registries the same way `FrontendRegistry` already does.

### Positive Security Observations

- UUPS implementations use disabled constructors and upgrade authorization hooks.
- The current self-vote bypass around delegated submitters appears fixed.
- Frontend slashing no longer directly bypasses historical fee freezing.
- Reward distributor rewiring is one-time locked.
- Ciphertext binding is present in commit/reveal validation.
- The full Solidity suite, including invariants and adversarial tests, currently passes.

### Overall Assessment

The current contract set looks materially stronger than a default pre-mainnet codebase:

- upgrade controls are consistent
- token accounting and reward solvency invariants hold under the current test corpus
- the most obvious double-claim, self-vote, and slashing-bypass issues appear to have been addressed

The remaining issues are mostly economic/liveness problems rather than direct theft vectors. They should still be addressed before treating the system as fully mainnet-ready.
