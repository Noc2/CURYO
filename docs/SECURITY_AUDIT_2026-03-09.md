# Curyo Protocol — Security Audit Report

**Date:** 2026-03-09
**Auditor:** Claude Code (automated, AI-assisted)
**Scope:** Full protocol — smart contracts, off-chain services, test coverage
**Methodology:** 7-phase audit (static analysis → access control review → manual code review → threat modeling → off-chain boundary review → test gap analysis → report)
**Test Suite Post-Audit:** 1193 tests passing (1177 original + 16 new)

This report is a point-in-time audit snapshot for the code reviewed on 2026-03-09. Later repository changes may add
features or alter off-chain responsibilities, so operational docs and current contract sources should be treated as the
live reference.

---

## Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 2 | Fixed |
| Informational | 8 | Documented |

---

## Low Severity — Fixed

### L-1: Missing event emission in `ParticipationPool.withdrawRemaining()`

- **File:** `contracts/ParticipationPool.sol`
- **Issue:** `poolBalance` state change had no corresponding event, making off-chain tracking of governance withdrawals incomplete.
- **Fix:** Added `PoolWithdrawal(address indexed to, uint256 amount)` event declaration and emission after the `safeTransfer`.
- **Commit:** `61b6e7e`

### L-2: Mutable storage variables that should be immutable in `CategoryRegistry`

- **File:** `contracts/CategoryRegistry.sol`
- **Issue:** `token`, `governor`, and `timelock` were set only in the constructor but stored as regular storage slots, wasting ~2100 gas per SLOAD on every read.
- **Fix:** Changed all three to `immutable`.
- **Commit:** `6296fec`

---

## Informational Findings — Accepted Risks

### I-1: Bot salt derivation uses `Date.now()`

- **File:** `packages/bot/src/commands/vote.ts`
- **Detail:** Salt = `keccak256(address, contentId, Date.now())` — theoretically predictable by an observer who knows the voter address and content.
- **Risk:** Negligible. The contract enforces one-vote-per-round per voter, and the tlock commit-reveal scheme prevents front-running regardless of salt predictability. The salt's purpose is uniqueness, not secrecy.

### I-2: Self-referral possible in HumanFaucet with two passports

- **File:** `contracts/HumanFaucet.sol`
- **Detail:** A user with two Proof of Humanity passports could refer themselves.
- **Risk:** Protocol-level limitation. Referral bonus is 10% of claim amount. No code-level fix is possible without an external identity oracle beyond what Proof of Humanity provides.

### I-3: VoterIdNFT nullifier not cleared on revocation

- **File:** `contracts/VoterIdNFT.sol`
- **Detail:** When a VoterID is revoked, the passport nullifier remains consumed, making revocation permanent (the same passport cannot re-mint).
- **Risk:** Intentional design — prevents re-minting after revocation. Could benefit from explicit documentation.

### I-4: Governance-locked tokens usable for content voting

- **File:** `contracts/CuryoReputation.sol`
- **Detail:** Tokens locked for governance proposals can still be staked in content voting rounds.
- **Risk:** Intentional design. Governance uses snapshot-based voting power captured at proposal creation time. Subsequent content voting transfers do not affect the snapshot. Users can participate in both systems simultaneously.

### I-5: Slither false positives on reentrancy (36 findings)

- **Files:** `RoundVotingEngine.sol`, `RoundRewardDistributor.sol`, `ParticipationPool.sol`
- **Detail:** All flagged functions are protected by `ReentrancyGuardTransient` (`nonReentrant` modifier). cREP is a standard ERC20 without transfer hooks (no ERC777/ERC1363 callbacks).
- **Risk:** None. All 36 findings are confirmed false positives.

### I-6: ContentRegistry `returnStake` / `slashStake` share a boolean flag

- **File:** `contracts/ContentRegistry.sol`
- **Detail:** A single boolean parameter distinguishes return vs slash behavior. An enum would be more self-documenting.
- **Risk:** Cosmetic. The logic is correct and the boolean is only used internally.

### I-7: Consensus subsidy reserve finite capacity

- **File:** `contracts/RoundVotingEngine.sol`
- **Detail:** Unanimous rounds draw from a finite consensus reserve (capped at 50 cREP per round). Once depleted, unanimous rounds pay no consensus bonus.
- **Risk:** By design. The reserve is replenished from the 5% consensus split of each settled round's pool. Depletion reflects a natural equilibrium where unanimous agreement is too frequent to subsidize.

### I-8: `processUnrevealedVotes` loop bounded by epoch count

- **File:** `contracts/RoundVotingEngine.sol`
- **Detail:** The selective revelation prevention loop iterates over epochs. Maximum iterations = `maxDuration / epochDuration` = 504 (7 days / 20 min).
- **Risk:** Acceptable gas cost. The keeper calls this function off-chain with gas estimation and can batch process using the `count` parameter.

---

## Security Properties Verified

| Property | Status | Verification Method |
|----------|--------|-------------------|
| Reentrancy protection | **Secure** | All external-calling functions use `nonReentrant`; cREP has no transfer callbacks |
| UUPS upgrade safety | **Secure** | `_disableInitializers()` in all implementation constructors; storage layout preserved |
| Access control | **Secure** | Role-based (`onlyOwner`, `onlyAuthorized`, `onlyRole`); no `tx.origin` usage anywhere |
| Soulbound NFT enforcement | **Secure** | All transfer paths blocked in `_update` override; `approve`/`setApprovalForAll` revert |
| Flash loan resistance | **Secure** | Governor uses `getVotes(account, clock()-1)` snapshot; content voting requires prior VoterID |
| tlock commit-reveal integrity | **Secure** | commitHash binds ciphertext; selective revelation prevented by `epochUnrevealedCount` + `revealGracePeriod` |
| Self-opposition prevention | **Secure** | `VoterIdNFT.resolveHolder()` maps delegated votes back to the NFT holder |
| Reward math conservation | **Secure** | `voterShare` computed as remainder; pool splits sum to input exactly (no dust leak) |
| Paused state enforcement | **Secure** | All state-changing operations blocked; refund claims still work when paused (tested) |
| Cooldown enforcement | **Secure** | 24h per-content per-voter; exact boundary tested at 24h-1s (reverts) and 24h (succeeds) |
| Dev faucet isolation | **Secure** | Requires `DEV_FAUCET_ENABLED=true` AND `NODE_ENV=development`; RPC hardcoded to `127.0.0.1:8545` |
| API input validation | **Secure** | Comment body 500 char limit; signature verification on all write operations |
| Governance lock bypass | **Secure** | `CuryoReputation._update` override covers all transfer paths including `transferFrom` |
| Delegation chaining | **Secure** | VoterIdNFT prevents A→B→C delegation chains |
| MAX_SUPPLY enforcement | **Secure** | Both CuryoReputation and VoterIdNFT check before minting |

---

## Contracts Reviewed

| Contract | Lines | Findings |
|----------|-------|----------|
| `RoundVotingEngine.sol` | 1296 | I-5, I-8 |
| `RoundRewardDistributor.sol` | 284 | I-5 |
| `ParticipationPool.sol` | 173 | L-1 (fixed) |
| `CategoryRegistry.sol` | ~200 | L-2 (fixed) |
| `CuryoReputation.sol` | ~300 | I-4 |
| `VoterIdNFT.sol` | ~250 | I-3 |
| `HumanFaucet.sol` | ~200 | I-2 |
| `ContentRegistry.sol` | ~300 | I-6 |
| `CuryoGovernor.sol` | ~200 | Clean |
| `FrontendRegistry.sol` | ~300 | Clean |
| `RewardMath.sol` (library) | 147 | Clean |
| `RoundLib.sol` (library) | 121 | Clean |

---

## Off-Chain Components Reviewed

| Component | Findings |
|-----------|----------|
| `packages/nextjs/app/api/comments/route.ts` | Clean — 500 char limit, signature verification |
| `packages/nextjs/app/api/dev-faucet/route.ts` | Clean — dual-gated (env flag + NODE_ENV), localhost-only RPC |
| `packages/nextjs/app/api/image-proxy/route.ts` | Clean — domain whitelist enforced |
| `packages/bot/src/commands/vote.ts` | I-1 (negligible — salt predictability) |
| `packages/keeper/src/keeper.ts` | Clean — try-catch settlement, proper error handling |
| `packages/contracts/src/voting.ts` | Clean — shared tlock utilities, commitHash includes ciphertext binding |

---

## Tests Added

**Commit:** `3ca2244`
**File:** `packages/foundry/test/AuditGapTests.t.sol` (619 lines, 16 tests)

| Category | Tests | Coverage |
|----------|-------|---------|
| Paused state enforcement | 4 | commitVote, settleRound, cancelExpired, processUnrevealed blocked; refund works when paused; resume after unpause |
| All 6 claim paths | 2 | Voter reward, submitter reward, loser rebate, participation reward, frontend fee (via FrontendRegistry), double-claim prevention |
| processUnrevealedVotes boundaries | 4 | count=0 → all, count>length → clamp, startIndex==length → revert, two-batch processing |
| Cooldown boundary | 2 | 24h-1s reverts, exactly 24h succeeds |
| Consensus subsidy | 2 | Reserve decreases correctly on unanimous round |
| Engine solvency | 2 | After all claims, remaining = consensus reserve + keeper pool + dust |

---

## Recommended Future Tests (Priority 2-3)

These lower-risk scenarios are not yet covered by automated tests:

1. **Participation pool tier boundaries** — Verify halving rate change at exactly 2M cREP distributed
2. **Frontend fee dust at rounding boundaries** — Tiny stakes producing sub-1-token fees
3. **Consensus reserve exhaustion** — Behavior when reserve hits zero during a unanimous round
4. **Epoch boundary race** — Vote committed at `timestamp == revealableAfter`
5. **VoterIdNFT revocation mid-round** — Voter loses eligibility between commit and reveal
6. **Category registry + bonus pool integration** — End-to-end category bonus distribution
7. **Cross-chain permit replay** — Fork safety for EIP-2612 permits (domain separator includes chainId)

---

## Conclusion

The Curyo protocol implementation is **well-secured** for mainnet deployment. No critical, high, or medium severity issues were found. The two low-severity findings have been fixed. The codebase demonstrates strong security practices:

- Consistent `ReentrancyGuardTransient` usage on all external-calling functions
- `SafeERC20` for all token transfers
- Role-based access control with no `tx.origin` usage
- UUPS upgrade safety with `_disableInitializers()` in all implementation constructors
- Comprehensive input validation at system boundaries
- Correct tlock commit-reveal implementation with protections against selective revelation, self-opposition, and flash loan attacks
- Pull-based reward claiming to prevent settlement-blocking failures
- Conservative epoch-weighted parimutuel reward math with no dust leakage

The 7 protocol-specific threat vectors (tlock trust, selective revelation, self-opposition, flash loans, epoch gaming, consensus reserve drain, keeper griefing) are all properly mitigated.
