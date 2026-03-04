# tlock Commit-Reveal with Epoch-Weighted Rewards

Research date: 2026-03-03 (updated 2026-03-03)

Recovery and extension of the original tlock+drand voting design (last seen at git commit `331844e~1`), combined with epoch-level reward weighting to address the niche content problem and create a strong incentive for first-epoch participation.

**Recommended parameters (updated after analysis):**
- `minVoters = 5` (matches live contract; see Section 2.4 for why this is viable with two-tier weighting)
- Epoch-1 weight: **100%**, all subsequent epochs: **25%** flat (binary two-tier; see Section 3.2 for why gradual decay is inferior)

---

## 1. The Original Design (recovered from git history)

The contract at `331844e~1` implemented a tlock commit-reveal system. The core comment in `RoundVotingEngine.sol`:

```
/// @dev Flow: commitVote (tlock-encrypted to epoch end)
///          → epoch ends
///          → revealVote (anyone decrypts via drand, permissionless)
///          → settleRound (≥3 votes revealed, immediate settlement).
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
Once revealedCount ≥ 3:
                      Anyone calls settleRound() immediately
                      Round settles, rewards distributed
```

Settlement happens immediately once the minVoters threshold is reached — there is no additional delay. The `thresholdReachedAt` timestamp is still recorded on-chain for analytics and historical tracking.

### 1.3 Key properties

**Vote secrecy within each epoch.** tlock encrypts the vote direction to the epoch end timestamp. The keeper cannot see which way a voter voted until after the 15-minute window closes and the drand beacon produces the decryption key. This makes all votes within an epoch effectively simultaneous.

**Permissionless reveals.** The drand beacon is a public value — anyone can decrypt ciphertexts and call `revealVote()`. The keeper has no privileged information; it only needs the on-chain ciphertext and the public drand output. This eliminates the "miss your reveal window" risk of the earlier flat-shares commit-reveal design — even if the voter goes offline, the keeper or any other party can reveal on their behalf.

**Multi-epoch accumulation.** A round stays open until `minVoters` votes are revealed. If epoch 1 doesn't produce 3 votes, epoch 2 begins immediately — new voters can commit, and epoch 1's revealed results are already visible to them.

**ciphertext stored on-chain.** The `bytes ciphertext` field (up to 10 KB) is stored in the `Commit` struct. The drand decryption key is applied off-chain to recover `(isUp, salt)`, which is then submitted to `revealVoteByCommitKey()`.

---

## 2. The Niche Content Problem

### 2.1 Why minVoters=3 was chosen

The 3-voter minimum was a defense against the **controlled seeding attack** from the game theory analysis:

> An attacker with 2 identities votes one direction, waits for exactly 1 honest contrarian. With 2-of-3 control, they win 82% of the honest voter's stake.

With `minVoters=3`, an attacker controlling 2 identities cannot settle the round alone — they need at least 1 honest voter. The honest voter's vote is simultaneously hidden (tlock), so the attacker commits both votes in epoch 1 without knowing which direction to weight more. This is an important property: the epoch structure removes the attacker's ability to see honest votes before committing.

### 2.2 The friction for niche content

Despite the security rationale, `minVoters=3` creates a real problem for content with small audiences:

- A niche documentary or technical tutorial might realistically attract only 1–2 voters
- With `minVoters=3`, the round **never settles** — it accumulates votes for up to 7 days, then cancels with full refunds
- The content's rating never moves, making it invisible in the platform's quality signal
- The 7-day wait followed by a refund discourages voters from participating on niche content at all

The result: the 3-voter threshold unintentionally creates a **platform-wide curation dead zone** for niche and long-tail content.

### 2.3 What changes if minVoters is adjusted

| minVoters | Security properties | Niche content impact |
|-----------|---|---|
| **2** | 2-identity same-direction attacker can drain consensus subsidy alone | Any 2-voter content settles; very accessible |
| **3 (original code)** | 2 controlled identities + 1 honest voter needed | Needs 3 voters; moderate dead zone |
| **5 (live contract)** | 4 identities needed to dominate; 2-identity epoch-1 attack bounded by subsidy cap | Needs 5 participants; significant dead zone without two-tier weighting |
| **7+** | Extreme attack resistance | Large dead zone; discourages niche curation |

The critical observation for same-direction epoch-1 attacks at any `minVoters` level: the maximum consensus subsidy drain from a 2-identity attack is `min(totalStake × 5%, 50 cREP)`. With MAX_STAKE=100 cREP per identity, 2 identities stake 200 cREP max, yielding at most 10 cREP subsidy. At the cost of 2 verified Voter IDs plus 200 cREP capital lock-up per content per day, this is not a credible sustained attack at current economics.

**The binding protection is VoterID cost and subsidy cap, not minVoters.**

### 2.4 Why minVoters=5 becomes viable with two-tier weighting

The classic concern with high `minVoters`: niche content with only 2-3 genuine viewers never settles. This concern is substantially mitigated by the **two-tier epoch weight** (epoch 1 = 100%, epoch 2+ = 25%).

Here is why: epoch-2+ voters who fill the quorum gap between "genuine epoch-1 assessors" and "the threshold" receive only 25% reward weight. Their stakes still count fully for the win condition (which side wins), but their share of the winner pool is one-quarter of an equal-stake epoch-1 voter.

This creates a **soft quorum property**: niche content with 2 genuine epoch-1 curators can reach `minVoters=5` via 3 epoch-2 followers, while the reward pool remains 72.7% controlled by the 2 blind epoch-1 assessors:

```
2 epoch-1 voters (100 cREP each):  effective stake = 200
3 epoch-2 voters (100 cREP each):  effective stake = 75
Epoch-1 share of pool: 200/275 = 72.7%
```

The content gets a quorum of 5 social-proof participants, but the curation signal in the reward distribution is dominated by those who voted blind. Higher minVoters simultaneously improves attack resistance AND, combined with 25% flat epoch-2+ weight, keeps niche content viable by keeping late-filler participation economically rational.

---

## 3. Epoch-Weighted Reward Distribution

### 3.1 The core idea

After the first epoch ends, revealed votes are fully public. A voter who commits in epoch 2 can see exactly how many UP and DOWN votes were cast in epoch 1, the current pool sizes, and the emerging directional signal. They are copying, not curating.

Epoch-weighting makes this economically unattractive: **each successive epoch reduces the voter's share of the reward pool by a fixed factor**. Voters who commit in epoch 1 (pure blind assessment) receive full weight. Voters who commit in epoch 2 (partial information, could be herding) receive half the weight. Voters in epoch 3 receive a quarter. And so on.

### 3.2 How this interacts with the tlock structure

Within each epoch, all votes are still effectively simultaneous — tlock hides every direction until the epoch ends. The epoch-weighting only penalizes the *inter-epoch* information asymmetry: the fact that epoch-2+ voters can see epoch-1 results before committing.

There is **one major information event** in this mechanism: epoch-1 reveals. After that event, all subsequent epochs are in the same "informed" category — whether you vote in epoch 2 or epoch 10, you have seen epoch-1 results. The additional information from epochs 2–9 that an epoch-10 voter has is marginal.

This yields a natural **binary two-tier** design rather than a gradual decay:

```
Epoch 1: Pure curation — votes are fully blind, no information from others.
          Reward weight: 100%

Epoch 2+: Informed following — voter can see epoch-1 results.
           Reward weight: 25% (flat for all subsequent epochs)
           Still protected from within-epoch gaming by tlock.
```

**Why flat 25% rather than gradual decay (100%/50%/25%/10%):**

The gradual decay design has a conceptual problem: it treats the information gap between epoch 2 and epoch 3 as equivalent to the gap between epoch 1 and epoch 2. But these gaps are completely different in magnitude. Epoch 1 → epoch 2 is the difference between knowing nothing about others' votes vs seeing the full epoch-1 result. Epoch 2 → epoch 3 is marginal — you already know epoch-1 results; seeing epoch-2 results adds little.

Flat 25% captures the only asymmetry that matters: "did you vote blind or not?"

Additional benefits of flat over gradual:
- **No rush at epoch boundaries**: with gradual decay, a voter at the end of epoch 2 (50%) has incentive to delay past the boundary to see if they can vote in epoch 2 vs epoch 3. With flat 25%, there is no incentive to time the boundary — every epoch beyond epoch 1 has the same weight.
- **Simpler on-chain logic**: just check `epochIndex == 0`. No table lookup.
- **Stronger deterrent**: epoch-2 herders face a 75% penalty instead of 50%.

### 3.3 Weight formula

**Binary two-tier (recommended):**

```
epochWeight(n) = { 100%   n = 0  (epoch 1: fully blind)
                 {  25%   n ≥ 1  (epoch 2+: saw epoch-1 results)
```

**In basis points (Solidity-friendly):**

```solidity
function epochWeightBps(uint32 epochIndex) internal pure returns (uint256) {
    return epochIndex == 0 ? 10000 : 2500;
}
```

**Why 25% specifically:**

The 25% value establishes a 4:1 reward ratio between epoch-1 and epoch-2+ voters. Given MAX_STAKE = 100 cREP per voter, an epoch-2+ voter staking their maximum has exactly one-quarter the reward influence of an epoch-1 voter staking their maximum. No epoch-2+ voter can ever outweigh an equal-stake epoch-1 voter through position alone.

This calibration is appropriate because:
- **Too low (e.g. 10%)**: epoch-2+ participation becomes economically irrational for many voters, making quorum harder to reach for content with few epoch-1 voters
- **Too high (e.g. 50%)**: deterrent is weak; a herder in epoch 2 captures half an epoch-1 voter's reward — barely discouraging
- **25%**: the filler voter has positive EV (worthwhile to participate), but the signal quality of the round is still dominated 4:1 by epoch-1 voters in the reward pool

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

Content with 3 voters, all epoch 1. Settlement occurs immediately after epoch 1 reveals.

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

### 4.2 Multi-epoch round, honest epoch-1 voters vs epoch-2 filler (minVoters=5)

Niche content. Epoch 1: Alice, Bob, Carol all vote UP (hidden). Epoch 1 ends — all three UP votes revealed. 3 of 5 needed. Dave and Eve see the results and vote UP in epoch 2 to fill quorum.

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Bob | UP | 100 | 0 | 100% | 100 |
| Carol | UP | 100 | 0 | 100% | 100 |
| Dave (filler) | UP | 100 | 1 | 25% | 25 |
| Eve (filler) | UP | 100 | 1 | 25% | 25 |

Unanimous UP — consensus subsidy applies. Voter subsidy = e.g. 50 cREP (max cap).

Total effective stake: 300 + 50 = 350.

- Alice, Bob, Carol: (100/350) × 50 = **14.3 cREP each** (combined: 85.7% of subsidy)
- Dave, Eve: (25/350) × 50 = **3.6 cREP each** (combined: 14.3% of subsidy)

The 3 epoch-1 curators receive **72.7% of the reward** despite being only 3 of 5 voters. The 2 epoch-2 filler voters receive **27.3%** despite equal stakes. The signal quality of the round is dominated by blind assessment — which is exactly the desired outcome for niche content that filled quorum via late participants.

### 4.3 Multi-epoch contested round with two-tier weighting

Epoch 1: Alice UP (100 cREP), Dave DOWN (80 cREP). Both hidden. Epoch 1 ends — results revealed: 100 vs 80, UP leading. Epoch 2: Bob sees the results and votes UP (100 cREP, herder), Carol votes DOWN (60 cREP, genuine contrarian).

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Bob (herder) | UP | 100 | 1 | **25%** | **25** |
| Dave | DOWN | 80 | 0 | 100% | 80 |
| Carol | DOWN | 60 | 1 | **25%** | **15** |

UP side: 200 raw stake, **125 effective**. DOWN side: 140 raw stake, **95 effective**. UP wins (raw stake: 200 > 140).

Loser pool = 140. Voter pool = 0.82 × 140 = 114.8 cREP.

Winners (UP side):
- Alice: (100/125) × 114.8 = **91.8 cREP** reward (+91.8)
- Bob: (25/125) × 114.8 = **23.0 cREP** reward (+23.0)

Alice earns **4× Bob's reward** despite equal stakes. With the old 50% gradual decay Alice would earn 2×; with the flat 25% she earns 4×. The stronger penalty makes copying Alice's public epoch-1 vote much less financially attractive.

**Why the stronger ratio matters:** Bob stakes 100 cREP and earns 23 cREP — a 23% return on capital at risk. Alice stakes 100 cREP and earns 91.8 cREP — a 91.8% return. The mechanism correctly creates a large differential between blind curation and informed following.

### 4.4 Attack: 2-identity attacker with epoch-2 hedge (minVoters=5, two-tier)

A more realistic attack scenario with `minVoters=5`. Epoch 1: Alice UP (100), Bob UP (100), Carol UP (100), Dave DOWN (100) — 4 epoch-1 voters, 1 short of quorum. Epoch 1 reveals: UP leads 300 vs 100. Epoch 2: Attacker sees UP is clearly winning and hedges: Attacker_A=UP (100), Attacker_B=DOWN (100).

| Voter | Side | Stake | Epoch | Weight | Effective stake |
|-------|------|-------|-------|--------|-----------------|
| Alice | UP | 100 | 0 | 100% | 100 |
| Bob | UP | 100 | 0 | 100% | 100 |
| Carol | UP | 100 | 0 | 100% | 100 |
| Dave | DOWN | 100 | 0 | 100% | 100 |
| Attacker A | UP | 100 | 1 | 25% | 25 |
| Attacker B | DOWN | 100 | 1 | 25% | 25 |

UP wins (raw: 400 > 200). Loser pool = 200. Voter pool = 0.82 × 200 = 164 cREP.

UP effective total: 100+100+100+25 = 325.
- Alice, Bob, Carol: (100/325) × 164 = **50.5 cREP each** (+50.5)
- Attacker A: (25/325) × 164 = **12.6 cREP** (+12.6)
- Dave: loses 100 cREP (participation pool: net loss ≈ 10 cREP)
- Attacker B: loses 100 cREP (participation pool: net loss ≈ 10 cREP)

Attacker net: +12.6 - 10 = **+2.6 cREP**

This is barely above break-even. The combination of `minVoters=5` (forcing the attacker to use an epoch-2 position instead of epoch-1) and the 25% weight (cutting their reward to one-quarter) reduces the attack from **+17.3 cREP** (under the old minVoters=2 + 50% weighting) to **+2.6 cREP** — a 85% reduction in attack profitability. At this level, transaction gas costs and identity overhead likely make the attack net-negative.

---

## 5. Game-Theoretic Analysis

### 5.1 Epoch 1 incentive structure

A rational voter forms their best assessment of content quality, then faces the question: vote now (epoch 1, full weight) or wait (epoch 2+, discounted weight)?

**Value of waiting:**
- See epoch 1 results → better estimate of which direction is winning
- Effectively reduces the uncertainty of losing

**Cost of waiting:**
- Epoch-weight penalty: earn 50% of epoch-1 weight
- Risk of missing the round: if `minVoters` is reached in epoch 1, settlement can fire immediately after reveals — epoch 2 voters may not have a chance to participate

Settlement happens immediately once the minVoters threshold is met (no additional delay). If `minVoters=3` are revealed in epoch 1, settlement can fire as soon as reveals complete. Epoch 2 votes are only included if they are revealed before the keeper calls `settleRound()`. This favors fast settlement over maximum participation.

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

### 6.1 minVoters=5 with two-tier weighting (recommended)

The live contract already has `minVoters=5`. With the two-tier epoch weight, this becomes not just viable but the recommended setting. The key mechanism is the **soft quorum property**:

- Epoch-1 voters provide the genuine curation signal (100% weight)
- Epoch-2+ voters fill any gap between epoch-1 participation and the 5-voter threshold (25% weight)
- The reward pool remains dominated by epoch-1 assessors regardless of how many epoch-2 fillers appear

As demonstrated in Section 4.2, even with only 3 epoch-1 voters and 2 epoch-2 fillers, epoch-1 voters control 72.7% of the reward pool. The quorum requirement creates a "5 people cared about this content" social proof bar without requiring all 5 to have voted blind.

**Security benefit of minVoters=5:** The hedge attack profitability (Section 4.4) drops from +17.3 cREP to +2.6 cREP — near break-even after gas and identity costs. Epoch-2 flooder attacks require substantially more Voter IDs to flip outcomes.

### 6.2 Settlement timing with minVoters=5

**Best case (5+ epoch-1 voters):**
```
T=0:       Epoch 1 opens. 5 voters commit (hidden).
T=20min:   Epoch 1 ends. All 5 revealed. revealedCount=5 ≥ 5. thresholdReachedAt = T+20min.
           settleRound() callable immediately. Keeper calls it.
```
Total: **~20 minutes** from first commit to settled rating.

**Typical niche case (3 epoch-1 voters, 2 epoch-2 fillers):**
```
T=0:       Epoch 1. 3 voters commit (hidden).
T=20min:   Epoch 1 ends. 3 votes revealed (UP, UP, DOWN or similar). revealedCount=3 < 5.
T=20–40m:  Epoch 2. 2 more voters see epoch-1 results and commit.
T=40min:   Epoch 2 ends. 2 more votes revealed. revealedCount=5 ≥ 5.
           thresholdReachedAt = T+40min.
           settleRound() callable immediately.
```
Total: **~40 minutes**. Epoch-2 fillers get 25% weight; epoch-1 assessors dominate the reward pool.

### 6.3 What if epoch 1 has very few voters?

With `minVoters=5` and only 1 epoch-1 voter:
- 4 epoch-2+ fillers needed to reach quorum
- Round settles at T+40min (immediately after epoch 2 reveals) with the 1 epoch-1 voter holding 100/(100 + 4×25) = 100/200 = **50% of reward pool** despite being 1 of 5 voters
- The lone epoch-1 curator earns the same from rewards as all 4 fillers combined

This is the correct incentive: the first person to independently assess a piece of niche content earns the majority of the reward pool, while those who followed earn a smaller but still positive return for filling quorum.

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

Per the settlement randomness analysis, drand via the evmnet BN254 chain is available on Celo today with ~160K gas per BLS signature verification. The tlock approach doesn't require on-chain verification of drand signatures (the keeper decrypts off-chain and submits plaintext), so the gas cost is lower than the full drand settlement approach.

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
3. After `minVoters` revealed, call `settleRound()` immediately

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
// Binary two-tier: epoch 1 is fully blind (100%), all later epochs saw epoch-1 results (25%).
function epochWeightBps(uint32 epochIndex) internal pure returns (uint256) {
    return epochIndex == 0 ? 10000 : 2500;
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

### 8.4 Config (RoundLib.sol)

Keep `minVoters = 5` (matches live contract). The governance minimum in `setConfig()` can remain at 2 for emergency use.

```solidity
config = RoundLib.RoundConfig({
    epochDuration: 15 minutes,
    maxDuration: 7 days,
    minVoters: 5,   // Social proof threshold; soft quorum via epoch-2 fillers
    maxVoters: 1000
});
```

### 8.5 Storage layout for UUPS

The `epochIndex` field is added to the `Commit` struct inside a mapping (not a state variable directly). Mapping values are stored at independently computed slots, so appending a field to the struct is safe for new commits. Existing committed votes from before the upgrade would have `epochIndex = 0` by default (zero-initialized), which would give them full epoch-1 weight — correct behavior for pre-upgrade votes.

---

## 9. Summary of Design Properties

| Property | Original tlock (pre-migration) | tlock + two-tier epoch-weight |
|---|---|---|
| **Vote secrecy** | Cryptographic within each epoch | Same |
| **Inter-epoch herding** | Not penalized | 75% penalty (epoch 2+ gets 25% weight) |
| **MinVoters** | 3 | **5** (matches live contract) |
| **Niche content settlement** | Requires 3 voters (may never settle) | Requires 5 participants; epoch-2 fillers count at 25% weight |
| **Settlement time (best case)** | ~20 min (epoch 1 + immediate settle) | ~20 min (5 epoch-1 voters) / ~40 min (3+2 split) |
| **Epoch-2 hedge attack profit** | Not modeled (no weighting) | **+2.6 cREP** (near break-even, was +17.3 cREP before) |
| **Permissionless reveals** | Yes — anyone with drand beacon | Same |
| **Keeper complexity** | Low | Same (no changes) |
| **Bracket attacks** | Prevented (group outcome) | Same |
| **ciphertext on-chain cost** | ~100K gas per vote | Same |
| **Epoch-1 pool dominance** | N/A | 3 ep1 voters + 2 ep2 fillers → ep1 holds **72.7%** of pool |
| **Rating signal quality** | Based on raw stake | **Epoch-1 voters have 4× pool influence per cREP** |

---

## 10. Comprehensive Design Evaluation

### 10.1 Does the design make sense overall?

Yes — the tlock + binary two-tier epoch-weight mechanism is one of the most principled anti-herding designs available to a decentralized curation protocol. The core insight is that it applies two orthogonal cascade-prevention layers targeting different threat models:

**Layer 1 (tlock — cryptographic, within-epoch):** Within any epoch, all vote directions are invisible until the epoch ends. The Bikhchandani-Hirshleifer-Welch (1992) result on information cascades requires sequential observability — an observer must see others' choices before committing their own. tlock makes this cryptographically impossible within each epoch. No economic deterrent can match this guarantee.

**Layer 2 (epoch-weighting — economic, inter-epoch):** Between epochs, voters can see epoch-1 results. The 75% weight penalty taxes the value of that public information. This damps but does not eliminate herding — which is the correct target. Economic deterrence is appropriate for economic behavior.

The combination is stronger than either alone. tlock without weighting leaves inter-epoch herding free. Weighting without tlock allows within-epoch front-running (the last voter to submit could observe others' stakes in a transparent mempool).

**Connection to voting theory (swing voter's curse):** Feddersen and Pesendorfer (1996) showed that uninformed voters rationally abstain in standard voting mechanisms, because their vote may swing the outcome in the wrong direction. In the Curyo mechanism, epoch-weighting converts rational abstention into productive behavior: weakly-informed voters can participate as epoch-2 fillers at 25% weight, closing the quorum gap without distorting the epoch-1 curation signal. This is a genuine design advantage over mechanisms where uninformed voters either abstain entirely (quorum hard to reach) or participate at full weight (signal diluted).

### 10.2 Epoch duration analysis

The original 15-minute epoch appears to have been chosen for rapid development iteration, not based on content consumption dynamics. The optimal epoch duration is determined by one question: **how long does a genuine assessor need to consume the content and form an independent opinion?**

Content consumption time by type:

| Content type | Consumption time | Recommended epoch-1 window |
|---|---|---|
| Memes, tweets, short clips (<2 min) | 1–3 min | 5–15 min |
| Articles, YouTube videos (5–20 min) | 10–25 min | 30 min |
| Long articles, talks (30–60 min) | 35–70 min | 1 hour |
| Podcasts, films (2+ hours) | 2–4+ hours | 2–4 hours |

A 15-minute epoch only captures genuine assessors for short-form content. For most curated content — articles, videos — 15 minutes is insufficient for independent evaluation before the epoch-1 window closes.

**Comparison with financial batch auctions:** Dark pool batch auctions (Turquoise, Posit Match) run at 10–45 second intervals to eliminate HFT latency arbitrage. This analogy is inapt — the binding constraint there is trading speed (microseconds), not information processing time. Content curation requires the equivalent of a sealed-bid procurement auction, where bidders need time to evaluate the opportunity before submitting.

**Recommendation — configurable per content category:**

The cleanest solution is to store `epochDuration` in `CategoryRegistry` alongside other per-category parameters. A tweet category uses 10 minutes; a film review category uses 2 hours. This allows the mechanism to serve the full content spectrum without compromising epoch-1 capture rates.

If a single platform-wide duration is required: **30 minutes** is a better default than 15. It captures most medium-form content in epoch 1, and settlement timing remains acceptable (settlement is immediate once minVoters is reached):
- Popular content (5+ epoch-1 voters): ~30 min total
- Niche content (3+2 split): ~60 min total

### 10.3 minVoters analysis

**minVoters=5 is the right balance.** The full cost-benefit analysis:

Increasing to 7 gains:
- Marginally stronger hedge-attack deterrence
- Higher social-proof threshold

Increasing to 7 costs:
- Niche content needs 3 epoch-2 fillers (vs 2) to close the quorum gap
- Coordinated filler participation becomes harder to achieve — rational uninformed voters abstain (swing voter's curse), and the quorum gap is now 3 positions rather than 2
- Risk of threshold deadlock: epoch-1 yields 4 genuine votes; epoch-2 yields 1-2 fillers; round drifts across multiple epochs before settling
- Epoch-1 pool share with 4 ep1 curators + 3 ep2 fillers: 400/475 = 84.2% — still dominant, but the bar is genuinely higher for niche content

The soft quorum property works best when the gap between epoch-1 natural participation and minVoters is 1–2 voters. minVoters=5 with a typical epoch-1 natural participation of 3–4 is the sweet spot.

**For high-security content categories** (governance proposals, parameter changes), a per-category `minVoters` override via `CategoryRegistry` would allow 7–10 where warranted.

### 10.4 Game-theoretic equilibrium

**Epoch-1 dominance condition:**

Let p = voter's private probability that UP is correct. Let E = voter pool per unit of effective stake.

- Epoch-1 EV: `(2p - 1) × stake × E`
- Epoch-2 EV (after observing epoch-1 results, posterior p'): `(2p' - 1) × 0.25 × stake × E`

Epoch 1 dominates when: `(2p - 1) > 0.25 × (2p' - 1)`

Since p' ≥ p (Bayesian update), epoch 1 is dominant for any voter whose original private signal is strong enough that the information gain from watching epoch-1 results isn't worth 4× the weight cost. For a voter with genuine content expertise (p ≈ 0.65–0.80), the marginal update from epoch-1 results (p' ≈ 0.70–0.85) doesn't come close to compensating for the 75% weight penalty. **The dominant strategy for informed voters is to commit in epoch 1.**

**The separating equilibrium:**

The mechanism creates a natural separating equilibrium:
- High-confidence voters (p > ~0.6) → epoch 1, full weight — highest risk, highest reward
- Low-confidence voters (p ≈ 0.5) who gain information from epoch 1 → epoch 2+, 25% weight — positive EV, appropriate discount
- Pure herders (no independent view) → epoch 2+, 25% weight — correctly discounted

This is the desired information aggregation property. Epoch-1 curators dominate the reward pool; uncertain and herding voters earn positive but reduced returns.

**The win condition vulnerability:**

The most significant remaining game-theoretic concern: the **win condition uses raw stake** while **reward distribution uses effective stake**. A coordinated epoch-2 flood can flip which side wins, even if epoch-1 clearly favored the other direction.

Example: epoch 1 yields 300 UP vs 200 DOWN. Attacker floods 600 DOWN in epoch 2. Raw stake: DOWN wins (800 vs 300). The attackers receive only 25% reward weight (150 effective stake), but they determine the outcome. The honest epoch-1 UP voters lose their stake.

This attack requires 3+ additional Voter IDs, 600+ cREP capital, and coordination. At current economics it is not freely profitable. But it is a genuine attack surface.

**Possible fix:** Apply epoch-weighting to the win condition as well (i.e., UP wins if `weighted_up_stake > weighted_down_stake`). This makes the epoch-1 signal nearly decisive and makes late-flooding expensive. The cost: the win condition is harder for users to reason about (they see raw stakes in the UI but outcomes are determined by weighted stakes). Whether to apply epoch-weighting to the win condition is an explicit design choice that should be made consciously.

### 10.5 Summary: recommended parameter set

| Parameter | Value | Rationale |
|---|---|---|
| `epochDuration` | 30 min (configurable per category) | Captures medium-form content in epoch 1 |
| `minVoters` | 5 | Sweet spot for soft quorum; matches live contract |
| Epoch-1 weight | 100% (10000 bps) | Full weight for blind assessment |
| Epoch-2+ weight | 25% (2500 bps) | 4:1 deterrent; productive filler EV |
| `maxDuration` | 7 days | Round expiry without quorum |
| Win condition | Raw stake (current) | Simpler; consider weighted win as upgrade path |

## 11. Open Design Questions

1. **minVoters=5 in the bootstrap phase.** During early platform growth with few active voters per content, minVoters=5 may cause many rounds to expire without settling (7 days, full refunds). Options: start with minVoters=3 during bootstrap and raise to 5 via governance once average round participation exceeds 5, or accept the higher bar from launch as it creates a quality filter. The soft-quorum mechanism (epoch-2 fillers) makes 5 more achievable than raw numbers suggest.

2. **The 25% exact value.** The 4:1 ratio is not derived from a formal information-theoretic model. A 20% (5:1) or 33% (3:1) rate would also be defensible. The practical question is whether 25% creates enough incentive for epoch-2 filler participation (positive EV for the filler) while sufficiently penalizing herding. Empirical observation of epoch-1 vs epoch-2 participation rates would inform a governance adjustment.

3. **Epoch-weighting for the participation pool.** Currently, losing voters receive up to 90% of their stake back from the participation pool regardless of epoch. Should epoch-2+ losers get a reduced participation rate (e.g., 70% instead of 90%)? This would more strongly discourage wrong-direction herding, but adds complexity and may feel punitive to voters who had genuine late information.

4. **UI for the epoch deadline.** The first epoch is the highest-reward window. A clear countdown ("Full reward weight available for 8 more minutes") creates urgency that matches the mechanism's intent. However, displaying this as a countdown could create a last-minute rush at the end of epoch 1 as voters scramble to commit before the weight drops. An alternative: show it as a reward tier label ("Committing now: Tier 1 reward (full weight) · After 8 min: Tier 2 reward (25%)").

5. **The win condition vs reward distribution split.** The current design uses raw stake for the win condition (which side wins) but epoch-weighted effective stake for reward distribution (how much each winner gets). This means a large epoch-2+ wave can flip the outcome even if epoch-1 clearly favored the other direction (see Section 10.4). Applying epoch-weighting to the win condition would make the epoch-1 signal nearly decisive but complicates the UI.

6. **Settlement timing edge case.** With the removal of the one-epoch settlement delay, settlement can now fire immediately once minVoters is reached. This means that if 5 epoch-1 voters are all revealed, settlement can happen before any epoch-2 commits are even revealed. The trade-off is faster settlement at the cost of potentially excluding late voters. In practice, the keeper processes reveals and settlement in sequence, so any reveals completed before the settlement call will be included.

7. **Per-category epoch configuration.** Storing `epochDuration` in `CategoryRegistry` would allow 10-minute epochs for meme/tweet categories and 2-hour epochs for film/podcast categories. This is the cleanest long-term solution but requires a CategoryRegistry schema change and governance process for setting per-category parameters.

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

**Internal references (removed — these design documents were deleted after the tlock system was implemented):**
- `GAME-THEORY-ANALYSIS.md` — controlled seeding attack analysis, minVoters rationale
- `SETTLEMENT-RANDOMNESS.md` — drand integration for Celo
- `FLAT-SHARES-COMMIT-REVEAL-SPEC.md` — alternative commit-reveal design (full-round secrecy, no epoch structure)
- `TIME-WEIGHT-PUBLIC-VOTING-RESEARCH.md` — time-weighting without commit-reveal (for comparison)
