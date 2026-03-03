# tlock Commit-Reveal with Epoch-Weighted Rewards

Research date: 2026-03-03

Recovery and extension of the original tlock+drand voting design (last seen at git commit `331844e~1`), combined with epoch-level reward weighting to address the niche content problem and create a strong incentive for first-epoch participation.

---

## 1. The Original Design (recovered from git history)

The contract at `331844e~1` implemented a tlock commit-reveal system. The core comment in `RoundVotingEngine.sol`:

```
/// @dev Flow: commitVote (tlock-encrypted to epoch end)
///          → epoch ends
///          → revealVote (anyone decrypts via drand, permissionless)
///          → settleRound (≥3 votes revealed + 1 epoch delay).
///      Rounds accumulate votes across 15-minute epochs. The keeper
///      needs NO secret data — it reads on-chain ciphertexts and public drand beacons.
```

### 1.1 Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| `epochDuration` | 15 minutes | Each voting window |
| `maxDuration` | 7 days | Round expiry without enough votes |
| `minVoters` | 3 | Minimum revealed votes to trigger settlement |
| `maxVoters` | 1000 | Gas safety cap |

### 1.2 Round lifecycle

```
Epoch 1 (0–15 min):   Voters commit tlock-encrypted votes
Epoch 1 ends:         drand beacon produced, ciphertexts become decryptable
                      Keeper (or anyone) calls revealVote() for each commit
                      Revealed votes are now public
Epoch 2 (15–30 min):  New voters can commit — they can see epoch 1 results
...
Once revealedCount ≥ 3 AND block.timestamp ≥ thresholdReachedAt + epochDuration:
                      Anyone calls settleRound()
                      Round settles, rewards distributed
```

The one-epoch settlement delay (`thresholdReachedAt + epochDuration`) ensures all votes from the epoch in which the threshold was crossed have time to be revealed before settlement locks in the result.

### 1.3 Key properties

**Vote secrecy within each epoch.** tlock encrypts the vote direction to the epoch end timestamp. The keeper cannot see which way a voter voted until after the 15-minute window closes and the drand beacon produces the decryption key. This makes all votes within an epoch effectively simultaneous.

**Permissionless reveals.** The drand beacon is a public value — anyone can decrypt ciphertexts and call `revealVote()`. The keeper has no privileged information; it only needs the on-chain ciphertext and the public drand output. This eliminates the "miss your reveal window" risk of the `FLAT-SHARES-COMMIT-REVEAL-SPEC.md` design — even if the voter goes offline, the keeper or any other party can reveal on their behalf.

**Multi-epoch accumulation.** A round stays open until `minVoters` votes are revealed. If epoch 1 doesn't produce 3 votes, epoch 2 begins immediately — new voters can commit, and epoch 1's revealed results are already visible to them.

**ciphertext stored on-chain.** The `bytes ciphertext` field (up to 10 KB) is stored in the `Commit` struct. The drand decryption key is applied off-chain to recover `(isUp, salt)`, which is then submitted to `revealVoteByCommitKey()`.

---

## 2. The Niche Content Problem

### 2.1 Why minVoters=3 was chosen

The 3-voter minimum was a defense against the **controlled seeding attack** documented in `GAME-THEORY-ANALYSIS.md` Section B.1:

> An attacker with 2 identities votes one direction, waits for exactly 1 honest contrarian. With 2-of-3 control, they win 82% of the honest voter's stake.

With `minVoters=3`, an attacker controlling 2 identities cannot settle the round alone — they need at least 1 honest voter. The honest voter's vote is simultaneously hidden (tlock), so the attacker commits both votes in epoch 1 without knowing which direction to weight more. This is an important property: the epoch structure removes the attacker's ability to see honest votes before committing.

### 2.2 The friction for niche content

Despite the security rationale, `minVoters=3` creates a real problem for content with small audiences:

- A niche documentary or technical tutorial might realistically attract only 1–2 voters
- With `minVoters=3`, the round **never settles** — it accumulates votes for up to 7 days, then cancels with full refunds
- The content's rating never moves, making it invisible in the platform's quality signal
- The 7-day wait followed by a refund discourages voters from participating on niche content at all

The result: the 3-voter threshold unintentionally creates a **platform-wide curation dead zone** for niche and long-tail content.

### 2.3 What changes if minVoters is reduced

| minVoters | New vulnerability | Existing protection |
|-----------|---|---|
| **3 (current)** | None above current baseline | Requires honest minority even against 2-identity attacker |
| **2** | 2-identity attacker can force tie in epoch 1 (refund, no profit) | VoterID per person; tie = no gain for attacker |
| **1** | 1-identity attacker settles unanimous round, drains consensus subsidy | VoterID + 24h cooldown limits to 1 drain per person per content per day; subsidy cap limits damage |

The critical observation for `minVoters=2`: a 2-identity attacker voting opposite directions in epoch 1 produces `upPool == downPool` — a tie — which triggers full refunds. They cannot extract value. The only risk with `minVoters=2` is an attacker controlling 2 same-direction identities to manufacture a unanimous round and drain consensus subsidy — identical to the `minVoters=1` risk but requiring 2 identities instead of 1.

---

## 3. Epoch-Weighted Reward Distribution

### 3.1 The core idea

After the first epoch ends, revealed votes are fully public. A voter who commits in epoch 2 can see exactly how many UP and DOWN votes were cast in epoch 1, the current pool sizes, and the emerging directional signal. They are copying, not curating.

Epoch-weighting makes this economically unattractive: **each successive epoch reduces the voter's share of the reward pool by a fixed factor**. Voters who commit in epoch 1 (pure blind assessment) receive full weight. Voters who commit in epoch 2 (partial information, could be herding) receive half the weight. Voters in epoch 3 receive a quarter. And so on.

### 3.2 How this interacts with the tlock structure

Within each epoch, all votes are still effectively simultaneous — tlock hides every direction until the epoch ends. The epoch-weighting only penalizes the *inter-epoch* information asymmetry: the fact that epoch 2 voters can see epoch 1 results before committing.

This creates a clean two-tier system:

```
Epoch 1: Pure curation — votes are fully blind, no information from others.
          Reward weight: 100%

Epoch 2+: Informed following — voter can see epoch 1 results.
           Reward weight: halved per epoch.
           Still protected from within-epoch gaming by tlock.
```

Epoch 1 is the ideal voting window. Epoch 2+ voting is supported but financially penalized. The platform's displayed UI should communicate this clearly.

### 3.3 Weight formula

**Discrete geometric decay (recommended):**

```
epochWeight(n) = { 100%   n = 0 (epoch 1)
                 {  50%   n = 1 (epoch 2)
                 {  25%   n = 2 (epoch 3)
                 {  10%   n ≥ 3 (epoch 4+, minimum floor)
```

The floor at 10% (rather than continuing to halve) ensures that even very late voters have some incentive to participate rather than abstaining. It also prevents a degenerate case where epoch 5+ votes have near-zero weight and are functionally useless.

**In basis points (Solidity-friendly):**

```solidity
function epochWeightBps(uint32 epochIndex) internal pure returns (uint256) {
    if (epochIndex == 0) return 10000; // 100%
    if (epochIndex == 1) return  5000; // 50%
    if (epochIndex == 2) return  2500; // 25%
    return                        1000; // 10% floor for epoch 3+
}
```

**Why 50% per epoch rather than other decay rates:**

- **50%** is cognitively clean: "each epoch you wait, your pool share halves." Easy to explain in the UI.
- A milder decay (e.g., 80% per epoch) still incentivizes epoch 1 participation but less forcefully; epoch 4 voters would still get 51% of epoch 1 weight.
- A steeper decay (e.g., 25% per epoch) makes epoch 2+ participation feel pointless, potentially discouraging legitimate late voters with genuine information.
- The 10% floor is the key moderating element — it ensures some reward is always available for late discovery, preventing complete participation collapse on slow-moving content.

### 3.4 Reward distribution mechanics

At settlement, the voter pool is distributed proportional to `stake × epochWeight`:

```solidity
// Pass 1: sum weighted stakes for winners
uint256 totalWeightedStake = 0;
for each winner (commit.isUp == round.upWins):
    uint256 w = epochWeightBps(commit.epochIndex);
    totalWeightedStake += (commit.stakeAmount * w) / 10000;

// Pass 2: allocate rewards
for each winner:
    uint256 w = epochWeightBps(commit.epochIndex);
    uint256 effectiveStake = (commit.stakeAmount * w) / 10000;
    uint256 reward = (effectiveStake * roundVoterPool) / totalWeightedStake;
    pendingRewards[commit.voter] += commit.stakeAmount + reward; // stake returned + reward
```

Everything else — pool split percentages, submitter reward, treasury fee, consensus reserve contribution, participation pool — is unchanged.

---

## 4. Numerical Examples

### 4.1 Epoch 1 settles (ideal case)

Content with 3 voters, all epoch 1. Settlement in epoch 2 (after 1-epoch delay).

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Bob | UP | 50 | 0 | 100% | 50 |
| Carol | DOWN | 80 | 0 | 100% | 80 |

UP wins (150 > 80). Loser pool = 80. Voter pool = 0.82 × 80 = 65.6 cREP.

- Alice: (100/150) × 65.6 = **43.7 cREP** reward (+43.7)
- Bob: (50/150) × 65.6 = **21.9 cREP** reward (+21.9)
- Carol: loses 80 cREP stake (participation pool applies separately)

Identical to flat-shares parimutuel — epoch-weighting has no effect when everyone votes in the same epoch.

### 4.2 Multi-epoch round, honest epoch-1 voter vs epoch-2 herder

Niche content attracts 2 votes. Epoch 1: Alice votes UP (hidden). Epoch 1 ends — Alice's UP vote is revealed. Bob sees this and votes UP in epoch 2. Round now has 2 voters.

With `minVoters=2` (proposed), settlement is now eligible after the epoch-2 delay.

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Bob (herder) | UP | 100 | 1 | 50% | 50 |

No DOWN votes — unanimous UP, consensus subsidy applies.

Voter subsidy = e.g. 40 cREP (consensus pool).

- Alice: (100/150) × 40 = **26.7 cREP** (67% of subsidy)
- Bob: (50/150) × 40 = **13.3 cREP** (33% of subsidy)

Bob sees Alice's vote and copies it. He wins, but Alice earns 2× more per cREP than Bob despite equal stakes — a meaningful reward differential that reflects Alice's genuine curation effort.

### 4.3 Multi-epoch contested round

Epoch 1: Alice UP (100 cREP), Dave DOWN (80 cREP). Both hidden. Epoch 1 ends — results revealed: 100 vs 80, UP leading. Epoch 2: Bob sees the results and votes UP (100 cREP), Carol votes DOWN (60 cREP, genuine contrarian).

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Bob (herder) | UP | 100 | 1 | 50% | 50 |
| Dave | DOWN | 80 | 0 | 100% | 80 |
| Carol | DOWN | 60 | 1 | 50% | 30 |

UP side: 200 stake, 150 effective. DOWN side: 140 stake, 110 effective. UP wins.

Loser pool = 140. Voter pool = 0.82 × 140 = 114.8 cREP.

Winners (UP side):
- Alice: (100/150) × 114.8 = **76.5 cREP** reward (+76.5)
- Bob: (50/150) × 114.8 = **38.3 cREP** reward (+38.3)

Alice earns 2× Bob's reward despite equal stakes. Bob copied Alice's public vote and is proportionally penalized. Alice's epoch-1 curation is rewarded at twice the rate.

### 4.4 Attack: 2-identity attacker waiting for epoch-2 information

An attacker with 2 Voter IDs watches epoch 1 results. Epoch 1: Alice UP (100 cREP) — only 1 vote, not enough to settle. Epoch 1 reveals: UP is ahead with 100 cREP. Epoch 2: Attacker votes A=UP (100) and B=DOWN (100).

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Attacker A | UP | 100 | 1 | 50% | 50 |
| Attacker B | DOWN | 100 | 1 | 50% | 50 |

UP wins (200 > 100). Loser pool = 100. Voter pool = 82 cREP.

- Alice: (100/150) × 82 = **54.7 cREP** (+54.7)
- Attacker A: (50/150) × 82 = **27.3 cREP** (+27.3)
- Attacker B: loses 100 cREP. Gets participation pool back (up to 90 cREP at tier 0, so net loss ≈ 10 cREP).

Attacker net: +27.3 - 10 = **+17.3 cREP** from Alice's honest curation.

**Is this attack profitable?** Marginally, at the cost of:
1. Two separate Voter IDs (non-trivial identity requirement)
2. The epoch-weight penalty cuts the attacker's take to 50% of what a full-weight epoch-1 position would have earned
3. The direction of epoch-1 votes was public before the attacker committed, so this is the best-case scenario for the attacker (they know to put more weight on UP)

Compare to an honest epoch-2 voter:
- Same position, same reward (+27.3 cREP), but they genuinely believed the content was good

The attacker is essentially an opportunistic epoch-2 voter with a DOWN hedge. The hedge costs them ~10 cREP and reduces Alice's reward from ~82 to ~54.7 — a harm, but bounded and not catastrophically profitable. With `minVoters=1` (allowing Alice to settle alone), this attack doesn't work at all — Alice's epoch-1 vote settles the round unanimously before the attacker can participate.

---

## 5. Game-Theoretic Analysis

### 5.1 Epoch 1 incentive structure

A rational voter forms their best assessment of content quality, then faces the question: vote now (epoch 1, full weight) or wait (epoch 2+, discounted weight)?

**Value of waiting:**
- See epoch 1 results → better estimate of which direction is winning
- Effectively reduces the uncertainty of losing

**Cost of waiting:**
- Epoch-weight penalty: earn 50% of epoch-1 weight
- Risk of missing the round: if `minVoters` is reached in epoch 1 and settlement fires in epoch 2, late voters may commit but their votes may not be revealed before settlement

Wait — with the original settlement delay (`thresholdReachedAt + epochDuration`), a round cannot settle until at least one full epoch passes after the threshold. So if `minVoters=3` are revealed in epoch 1, settlement can fire earliest at the start of epoch 3. Epoch 2 votes ARE included. But with `minVoters=2`, settlement can fire at the start of epoch 2, potentially before epoch 2 commits are revealed. This is a design tension explored in Section 6.

**The equilibrium:** For most content, the accuracy gain from watching epoch 1 results is marginal — you already had a view on content quality before the round started. The 50% weight penalty is concrete and certain. For a voter with genuine private information about content quality, the dominant strategy is to commit in epoch 1 at full weight. The mechanism correctly rewards this behavior.

### 5.2 Information cascade dynamics within the tlock structure

Epoch-weighting interacts with tlock's within-epoch simultaneity to create a two-layer cascade prevention:

**Layer 1 (tlock): within-epoch prevention.** All votes within epoch 1 are committed before any direction is known. This is cryptographically strong — no information cascade is possible within epoch 1 regardless of voter count or stake size. The academic result from Bikhchandani, Hirshleifer & Welch (1992) — that cascades require sequential observability — is met within each epoch.

**Layer 2 (epoch-weight): inter-epoch prevention.** Epoch 2 voters can see epoch 1 results. Epoch-weighting makes copying this information financially unattractive. This is an economic disincentive, not a cryptographic barrier — it damps but doesn't eliminate inter-epoch herding.

The combination is stronger than either alone:
- tlock alone (without epoch-weight): epoch 2 herding is free
- Epoch-weight alone (without tlock): within-epoch herding is still possible (no commit-reveal for the current epoch)
- Together: within-epoch protection is cryptographic; inter-epoch protection is economic

### 5.3 The quality of the rating signal

With epoch-weighting, the rating update at settlement reflects a quality-weighted vote: epoch-1 voters (blind, genuine assessment) have higher effective weight than epoch-2+ voters (potentially herding). This means the content rating is more influenced by independent assessment than by cascade amplification.

This is a genuine improvement in curation quality over flat-stake distribution.

### 5.4 Comparison with settlement randomness approach

The current system (post-`331844e`) uses random settlement to prevent last-block gaming. The tlock epoch structure achieves a similar goal differently: there is no "last block to attack" because the settlement window is a discrete 15-minute slot with tlock hiding all votes until the slot ends. An attacker cannot snipe the closing moment because:
1. All votes within an epoch are simultaneously revealed (no sequential advantage)
2. The drand beacon determines the reveal, not the attacker

Tlock epochs are structurally superior to random settlement for preventing gaming within a window. Random settlement is simpler to implement but relies on unpredictability; tlock epochs rely on cryptographic hiding.

---

## 6. The minVoters Question

### 6.1 minVoters=3 with epoch-weighting

Epoch-weighting does **not** directly solve the niche content problem if `minVoters=3` is retained. A round still needs 3 revealed votes to settle. If only 2 voters exist for a piece of niche content, the round accumulates across epochs until expiry (7 days), then cancels with refunds.

**What epoch-weighting adds in this scenario:** The 2 genuine voters (epoch 1) know they're in the "full weight" bracket. They vote knowing that if the round eventually accumulates a 3rd voter in a later epoch, that voter gets discounted weight. This is a minor improvement in expected return for early genuine voters, but doesn't change the fundamental "round never settles" problem.

### 6.2 minVoters=2 with epoch-weighting (recommended)

Reducing `minVoters` to 2 allows niche content to settle after 2 voters commit in epoch 1 (with results visible at the start of epoch 2, and settlement available in epoch 2). The 2-identity attack risk becomes:

- **2-identity same-direction:** Unanimous round → consensus subsidy. Limited by VoterID and subsidy cap.
- **2-identity opposite-direction:** Tie → refunds. Attacker gains nothing.
- **1 honest + 1 attacker:** Attacker either matches direction (profits modestly from consensus or pool, epoch-weight-discounted if epoch 2) or opposes direction (loses).

The critical protection: within epoch 1, the attacker doesn't know the honest voter's direction (tlock). They can't hedge adaptively. If they commit both sides in epoch 1, it's a tie and they get refunds. If they commit one side, they're gambling blind — not meaningfully different from honest participation.

**Epoch 1 is a genuinely safe window even with `minVoters=2`.**

### 6.3 Settlement timing with minVoters=2

With `minVoters=2`, the earliest settlement scenario:

```
T=0:          Epoch 1 opens. Alice commits (UP, hidden). Bob commits (UP, hidden).
T=15min:      Epoch 1 ends. drand beacon produced.
              Keeper decrypts both ciphertexts, calls revealVote(Alice), revealVote(Bob).
              revealedCount = 2 ≥ minVoters=2. thresholdReachedAt = T+15min.
T=30min:      Earliest settlement: thresholdReachedAt + epochDuration = T+30min.
              Any new epoch-2 commits from T+15min to T+30min are now revealed.
              settleRound() becomes callable. Keeper calls it.
```

Total time from first commit to settlement: **30 minutes** (best case, assuming both votes in epoch 1).

For comparison, the current system's median settlement time is several hours (random settlement probability 0.01% per block).

### 6.4 What if epoch 1 has only 1 voter?

With `minVoters=2`:

```
T=0:          Epoch 1. Alice commits (UP).
T=15min:      Epoch 1 ends. Alice's vote revealed: UP public. revealedCount=1 < 2.
T=15–30min:   Epoch 2. Bob sees Alice's UP vote. Bob commits (UP or DOWN).
T=30min:      Epoch 2 ends. Bob's vote revealed. revealedCount=2.
              Settlement eligible at T=45min (thresholdReachedAt + epochDuration).
T=45min:      settleRound() called. Settlement includes epoch-weighted distribution.
```

Bob gets 50% weight (epoch 2). This is the correct outcome: Bob saw Alice's public vote before committing — his curation contribution is informationally dependent on Alice's, so he earns less from the pool.

---

## 7. Addressing the Original Design's Practical Issues

### 7.1 Ciphertext storage cost

The original design stored `bytes ciphertext` (up to 10 KB) on-chain per vote. This is expensive:
- 32 bytes of calldata = 16 gas (cold) on Celo L2
- A 1 KB ciphertext ≈ 512 32-byte words ≈ 8,192 gas just for calldata
- On-chain SSTORE for 1 KB: 32 SSTORE operations × 22,100 gas = ~707,200 gas

The tlock ciphertext size depends on the payload. For a binary `(isUp bool, salt bytes32)` payload, the encrypted size is roughly 160–200 bytes (typical for identity-based encryption on BN254). This is more manageable: ~160 bytes ≈ 100,000 gas per vote commitment — approximately double the cost of a plain vote.

The `MAX_CIPHERTEXT_SIZE = 10_240` in the original code was a safety cap; real tlock ciphertexts are much smaller.

### 7.2 drand dependency

The original design used tlock encryption where the decryption key is derived from the drand beacon at the epoch end timestamp. The keeper watches for new drand rounds and calls `revealVote()` with the decrypted plaintext.

Per `SETTLEMENT-RANDOMNESS.md`, drand via the evmnet BN254 chain is available on Celo today with ~160K gas per BLS signature verification. The tlock approach doesn't require on-chain verification of drand signatures (the keeper decrypts off-chain and submits plaintext), so the gas cost is lower than the full drand settlement approach.

**Two architectural options for reveal:**

**Option A (original): Off-chain decryption, on-chain hash verification.**
- Keeper decrypts `(isUp, salt)` off-chain using drand beacon
- Submits `revealVote(commitKey, isUp, salt)` to contract
- Contract verifies `keccak256(isUp, salt) == commitHash` (≈2,000 gas)
- No BLS verification on-chain; much cheaper
- Trust model: anyone with the drand beacon can decrypt and submit — fully permissionless

**Option B: On-chain tlock decryption.**
- Keeper submits ciphertext + drand signature on-chain
- Contract verifies BLS signature (~160K gas) and decrypts in-contract
- More self-contained but expensive and complex

Option A was the original design and remains the better choice: permissionless off-chain decryption with on-chain hash verification is cheap and fully trustless.

### 7.3 The keeper's role

The keeper in the original design was already minimal:
1. Monitor drand beacons for epoch end timestamps
2. For each expired epoch, read on-chain ciphertexts, decrypt using the drand output, call `revealVote()`
3. After `minVoters` revealed + epoch delay, call `settleRound()`

With epoch-weighting, the keeper role is identical — no changes needed to the keeper.

### 7.4 Participation rewards for unrevealed votes

In the original design, the `processUnrevealedVotes()` function handled votes that were never revealed:
- Votes from past epochs (revealable but not yet revealed): forfeited after settlement
- Votes from the current epoch at settlement time: refunded (they had no chance to be revealed)

With the keeper decrypting and revealing all votes automatically, this edge case mainly applies to ciphertexts that can't be decrypted (e.g., if the drand round was somehow skipped). In practice this should not occur.

---

## 8. Implementation Changes from the Original

Restoring the original design requires reverting `331844e` — the large migration commit. The only new addition is epoch-weighting.

### 8.1 Commit struct change (RoundLib.sol)

```solidity
struct Commit {
    address voter;
    uint256 stakeAmount;
    bytes ciphertext;
    address frontend;
    uint256 revealableAfter;
    bool revealed;
    bool isUp;
    uint32 epochIndex; // NEW: 0 = epoch 1, 1 = epoch 2, 2 = epoch 3+
}
```

`uint32 epochIndex` fits within existing struct padding.

### 8.2 Record epochIndex at commit time (RoundVotingEngine.sol)

```solidity
// In _commitVote(), after roundCfg is loaded:
uint256 elapsed = block.timestamp - round.startTime;
uint32 epochIndex = uint32(elapsed / roundCfg.epochDuration);
// Cap at 3 for storage/computation purposes (all epochs ≥ 3 get floor weight)
if (epochIndex > 3) epochIndex = 3;

commits[contentId][roundId][commitKey] = RoundLib.Commit({
    voter: msg.sender,
    stakeAmount: stakeAmount,
    ciphertext: ciphertext,
    frontend: frontend,
    revealableAfter: epochEnd,
    revealed: false,
    isUp: false,
    epochIndex: epochIndex  // NEW
});
```

### 8.3 Epoch-weight distribution in settleRound() (RoundVotingEngine.sol)

Replace the existing stake-proportional distribution loop with a weighted version:

```solidity
// Helper (can be a library function in RewardMath.sol)
function epochWeightBps(uint32 epochIndex) internal pure returns (uint256) {
    if (epochIndex == 0) return 10000;
    if (epochIndex == 1) return  5000;
    if (epochIndex == 2) return  2500;
    return                        1000; // floor for epoch 3+
}

// In settleRound(), replace the reward loop:
uint256 totalWeightedStake = 0;
bytes32[] storage commitKeys = roundCommitHashes[contentId][roundId];
for (uint256 i = 0; i < commitKeys.length; i++) {
    RoundLib.Commit storage c = commits[contentId][roundId][commitKeys[i]];
    if (!c.revealed || c.isUp != round.upWins) continue;
    uint256 w = epochWeightBps(c.epochIndex);
    totalWeightedStake += (c.stakeAmount * w) / 10000;
}

// Store totalWeightedStake for pull-based reward claiming
roundWinningWeightedStake[contentId][roundId] = totalWeightedStake;
```

The `claimReward()` in `RoundRewardDistributor.sol` similarly uses `effectiveStake = stakeAmount × epochWeight / 10000` for computing each winner's share.

### 8.4 Config change (RoundLib.sol)

Change `minVoters` default from 3 to 2:

```solidity
config = RoundLib.RoundConfig({
    epochDuration: 15 minutes,
    maxDuration: 7 days,
    minVoters: 2,   // Changed from 3
    maxVoters: 1000
});
```

The governance minimum for `minVoters` in `setConfig()` can remain at 2.

### 8.5 Storage layout for UUPS

The `epochIndex` field is added to the `Commit` struct inside a mapping (not a state variable directly). Mapping values are stored at independently computed slots, so appending a field to the struct is safe for new commits. Existing committed votes from before the upgrade would have `epochIndex = 0` by default (zero-initialized), which would give them full epoch-1 weight — correct behavior for pre-upgrade votes.

---

## 9. Summary of Design Properties

| Property | Original tlock (pre-migration) | tlock + epoch-weight (proposed) |
|---|---|---|
| **Vote secrecy** | Cryptographic within each epoch | Same |
| **Inter-epoch herding** | Not penalized | Economic penalty (50% weight per epoch) |
| **MinVoters** | 3 | **2** |
| **Niche content settlement** | Requires 3 voters (may never settle) | Requires 2 voters (settles in 30 min) |
| **Settlement time (best case)** | 30 min (epoch 1 + delay) | Same |
| **Permissionless reveals** | Yes — anyone with drand beacon | Same |
| **Keeper complexity** | Low | Same (no changes) |
| **Bracket attacks** | Prevented (group outcome) | Same |
| **ciphertext on-chain cost** | ~100K gas per vote | Same |
| **2-identity controlled seeding** | Difficult (hidden votes in epoch 1) | Same (within epoch); penalized cross-epoch |
| **Rating signal quality** | Based on raw stake | **Based on epoch-weighted effective stake** |

---

## 10. Open Design Questions

1. **Decay rate calibration.** Should the decay be steeper (25% per epoch instead of 50%) to more aggressively discourage epoch 2+ herding? Or gentler (70%) to be more lenient for voters with genuine late-arriving information? The 50% choice is somewhat arbitrary — numerical simulation against realistic participation patterns would improve confidence.

2. **minVoters=1 vs minVoters=2.** Setting `minVoters=1` would allow genuinely solitary content (only one person cares) to accumulate a rating via repeated unanimous rounds. The consensus subsidy drain risk is the main concern, but the 24h cooldown and VoterID requirement already limit this. Is the additional protection from `minVoters=2` worth the added friction for single-viewer niche content?

3. **Epoch-weighting for the participation pool.** Currently, the participation pool pays all losers back up to 90% of their stake based on participation rate. Should this also be epoch-weighted — penalizing epoch-2+ losers who were herding in the wrong direction? This would be a stronger signal that late herding is discouraged, but adds complexity and may feel punitive.

4. **Epoch index cap.** The implementation caps `epochIndex` at 3 (10% floor). At 15-minute epochs, epoch 3 starts at 30 minutes into the round. A 7-day round has 672 epochs. Should the floor be even lower for very late votes (e.g., epoch 48 = 12 hours in), or is 10% sufficient?

5. **UI for epoch weight.** How should the UI communicate to voters that voting now gives full weight versus later epochs give half? A countdown to epoch 1's end ("Commit in the next 8 minutes for full reward weight") is natural but could create a rush effect in the final minutes of epoch 1.

6. **What happens to epoch-2+ votes if settlement fires before they're revealed?** With `minVoters=2` and 2 epoch-1 votes, settlement fires at the start of epoch 3 (`thresholdReachedAt + epochDuration`). Epoch-2 commits are committed before T+30min but revealed at T+30min when their epoch ends. The settlement delay of `thresholdReachedAt + epochDuration` (T+15min + 15min = T+30min) should exactly cover epoch-2 reveals. However, edge cases exist if `settleRound()` is called in the same block as `revealVote()` for the last epoch-2 voter. The settlement delay already handles this correctly for the common case; a strict `>` check on the timestamp ensures epoch-2 commits have their full epoch to be revealed.

---

## 11. References

**tlock / drand:**
- [drand Documentation](https://docs.drand.love/about/) — distributed randomness beacon
- [Timelock Encryption (tlock paper)](https://eprint.iacr.org/2023/189.pdf) — Thyagarajan et al. 2023
- [League of Entropy](https://www.drand.love/loe) — 24+ independent operators of drand network
- [drand evmnet](https://docs.drand.love/blog/2025/08/26/verifying-bls12-on-ethereum/) — BN254 chain for EVM verification

**Sequential parimutuel with discrete batching:**
- Budish, Cramton & Shim (2015) — "Frequent Batch Auctions" — discrete batching eliminates speed advantages
- Koessler, Noussair & Ziegelmeyer (2008) — "Parimutuel Betting under Asymmetric Information" — simultaneous games preserve separating equilibria
- Bikhchandani, Hirshleifer & Welch (1992) — "A Theory of Fads, Fashion, Custom, and Cultural Change as Informational Cascades"

**Internal references:**
- `GAME-THEORY-ANALYSIS.md` Section B.1 — controlled seeding attack, minVoters rationale
- `SETTLEMENT-RANDOMNESS.md` Section 3 — drand integration for Celo
- `FLAT-SHARES-COMMIT-REVEAL-SPEC.md` — alternative commit-reveal design (full-round secrecy, no epoch structure)
- `TIME-WEIGHT-PUBLIC-VOTING-RESEARCH.md` — time-weighting without commit-reveal (for comparison)
