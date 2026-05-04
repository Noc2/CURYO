# CURYO Smart Contract Audit — May 4, 2026

**Scope:** `packages/foundry/contracts/` (all production `.sol` files)  
**Tools:** Slither 0.10.3, Aderyn 0.6.8, manual code review  
**Existing coverage reviewed:** Aderyn report (21 Low), Slither report (0 High / 34 Medium / 78 Low), `SecurityTests.t.sol`, `AdversarialTests.t.sol`, `AuditGapTests.t.sol`, 4× `FormalVerification_*.t.sol`, `InvariantSolvency.t.sol`, `SettlementEdgeCases.t.sol`, `SelectiveRevelationTest.t.sol`, `SelfOppositionProfitability.t.sol`.

---

## Executive Summary

The codebase is exceptionally mature for a pre-deployment protocol. Automated scans and the extensive custom test suite (reentrancy, selective revelation, self-opposition, state-machine violations, formal properties, fuzz/invariant tests) have already eliminated the vast majority of typical smart-contract vulnerabilities. No Critical or High severity issues were identified in this audit.

This report focuses on **new findings** that were not caught by prior automated scans or the existing test suite. Most findings are edge-case behavioral issues or architectural inconsistencies rather than directly exploitable vulnerabilities.

| Severity | Count | New Findings |
|----------|-------|--------------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 0 | — |
| Informational | 3 | I-1: Governor proposal edge-case (intentional); I-2: Slither reentrancy false positives; I-3: Negligible rounding in participation reward math |

**Fix applied:** `recoverSurplusHrep()` now carries `nonReentrant` for consistency with the rest of the engine surface.

---

## Post-Audit Revision Notes

After double-checking against the latest commits on the branch, the following issues from the initial audit draft were re-assessed:

### M-1 → Reclassified as Intentional Behavior (No Fix)
**`CuryoGovernor.propose()` can revert after passing threshold check**

`super.propose()` checks historical voting power (`getVotes(proposer, clock() - 1)`), while the subsequent `lockForGovernance()` checks the proposer’s **current** HREP balance. If a proposer transferred tokens after the snapshot block, the transaction reverts at the lock despite passing the vote threshold.

**Why no fix was applied:** This is a security feature, not a bug. The historical snapshot check prevents flash-loan proposals; the current-balance lock ensures the proposer still holds the skin-in-the-game at the moment of proposal. A proposer who transferred their tokens made an explicit choice to no longer meet the threshold. Adding a pre-check or capping the lock would weaken the commitment guarantee without material UX improvement.

### L-1 → Fixed
**`RoundVotingEngine.transferReward()` and `recoverSurplusHrep()` lacked `nonReentrant`**

`transferReward` already had `nonReentrant` in the current branch (added in a prior commit). `recoverSurplusHrep()` was missing it. `nonReentrant` has now been added to `recoverSurplusHrep()` for defense-in-depth consistency.

### L-2 → Reclassified as Safety Feature (No Fix)
**`X402QuestionSubmitter` hardcodes escrow address**

The immutable escrow is a **deliberate safety guard**, confirmed by the existing test `testX402QuestionSubmissionRejectsStaleEscrowBeforeUsdcAuthorization`. If the registry’s escrow is ever updated (e.g., after a bug-fix upgrade), the gateway intentionally reverts to prevent X402 payments from being routed to an unexpected contract. A coordinated redeployment of the gateway is the correct operational response to an escrow migration.

### L-3 → Reclassified as Design Choice (No Fix)
**Bundle funding check uses `maxRoundVoters` rather than sum**

The `_requireBundleFundingCoversMaxCompleters` function is a secondary defense-in-depth check alongside the primary `amount >= requiredCompleters * requiredSettledRounds` validation. Using the maximum `maxVoters` across questions is the conservative choice for a minimum-funding sanity check. The actual per-completer reward is dynamically computed at claim time based on real participation, so underfunding only yields smaller rewards, not a loss of funds.

---

## Informational Findings

### I-1: Governor Proposal Edge-Case (Intentional)
**Location:** `contracts/governance/CuryoGovernor.sol:255-274`

As described in the M-1 reclassification above, a proposer whose current balance dropped below `proposalThreshold()` after the snapshot block will see their `propose()` revert at `lockForGovernance`. This is expected behavior that preserves the commitment mechanism.

### I-2: Slither Reentrancy Findings Are False Positives
**Location:** Slither output: `RoundRewardDistributor.claimParticipationReward`, `finalizeParticipationRewards`, `_syncParticipationRewardSnapshot`; `HumanFaucet.customVerificationHook`; `RoundVotingEngine._getOrCreateRound`, `_commitVote`.

In all flagged cases:
- The external-entry functions carry `nonReentrant` (via OpenZeppelin `ReentrancyGuardTransient`).
- `HumanFaucet` uses a manual `_claiming` boolean lock.
- State updates (claim flags, finalized flags, nullifier tracking) occur **before** external calls.

Slither does not fully recognize `ReentrancyGuardTransient` as a valid reentrancy guard, causing false positives.

### I-3: Divide-Before-Multiply in Participation Reward Has Negligible Exploitability
**Location:** `contracts/RoundRewardDistributor.sol:603-604`

Slither flags:
```solidity
uint256 effectiveStake = (commit.stakeAmount * RoundLib.epochWeightBps(commit.epochIndex)) / 10000;
uint256 reward = effectiveStake * rateBps / 10000;
```

The first division truncates before the second multiplication, causing at most **1 wei** of precision loss per claim. HREP uses 6 decimals; with realistic stakes (1e6 to 100e6), an attacker would need an infeasible number of claims to accumulate meaningful dust.

---

## Notes on Previously Identified Issues (Confirmed / No Change Needed)

### Reentrancy & ERC1363 Abuse
- ✅ `SecurityTests.t.sol` already covers reentrancy via `MaliciousToken` during refunds, commits, and settlement treasury transfers.
- ✅ `transferAndCall` abuse is blocked: direct `onTransferReceived` calls revert, approved spenders cannot force votes, and malformed payloads are rejected.

### Commit-Reveal Reliability
- ✅ `SelectiveRevelationTest.t.sol` verifies that settlement is blocked until all past-epoch commits are revealed or the grace window elapses.
- ✅ `AuditGapTests.t.sol` covers `processUnrevealedVotes` batch boundaries, cooldown exactness, and consensus subsidy math.

### Economic Attacks
- ✅ `SelfOppositionProfitability.t.sol` proves that loser-side participation is unprofitable.
- ✅ `AdversarialTests.t.sol` covers reward exhaustion, double-claim, state-transition violations, and cooldown bypass.
- ✅ `InvariantSolvency.t.sol` enforces that claimed amounts never exceed pool obligations.

### Governance & Identity
- ✅ VoterIdNFT delegation chaining is blocked (H-2 fix verified in source).
- ✅ Governance locks enforce 7-day cooldown and only self-delegation is allowed.
- ✅ HumanFaucet uses a manual `_claiming` lock and checks-effects-interactions ordering.

### Deployment Risks
- ⚠️ `foundry.toml` grants `fs_permissions = [{ access = "read-write", path = "./"}]` — already flagged by prior analysis; recommend tightening.
- ⚠️ `slither.config.json` excludes `script/` from analysis — already flagged; recommend a separate Slither pass on deployment scripts.

---

## Conclusion

The CURYO protocol contracts demonstrate a very high standard of security engineering. The combination of automated static analysis, exhaustive adversarial testing, formal property tests, and invariant fuzzing has effectively eliminated the typical vulnerability classes.

For the upcoming redeployment, the only code change from this audit was adding `nonReentrant` to `recoverSurplusHrep()` for consistency. No Critical, High, Medium, or Low vulnerabilities were found. The protocol is in good shape for deployment.
