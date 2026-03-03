# Time-Weighted Distribution with Live Public Voting

Research date: 2026-03-03

Exploration of an alternative to the commit-reveal spec (`FLAT-SHARES-COMMIT-REVEAL-SPEC.md`) that preserves continuous live rating updates while providing anti-herding properties through time-weighted reward distribution. The key design question: can random settlement plus a time penalty for late voters substitute for vote secrecy?

---

## 1. Executive Summary

The commit-reveal spec solves herding by hiding vote directions. This document explores whether the same goal can be achieved by keeping votes public but making late herding financially unattractive through **time-weighted distribution within the winning pool**.

**Core mechanism:**
- Votes are immediately public; the rating updates live after each vote (as in the current system)
- Win condition remains binary and shared: if UP stake > DOWN stake at settlement, all UP voters win
- The 82% winner pool is distributed proportional to `stake × timeWeight` rather than just `stake`
- `timeWeight_i = (settlementBlock - commitBlock_i) / (settlementBlock - roundStartBlock)`
- A voter who commits when most of the round is still ahead gets near-maximum weight; a voter who piles on in the final blocks gets near-zero weight from the pool (but still gets their stake back if correct)

**What this buys:**
- Live rating throughout the round — no "directions hidden until settlement" UI
- Single-transaction UX — no commit hash, no salt management, no 5-minute reveal window
- No offline risk — you can't lose your stake by failing to reveal
- Natural anti-herding: copying others late is penalized, independent early assessment is rewarded
- Compatible with drand-based settlement (drand commit-reveal already recommended in `SETTLEMENT-RANDOMNESS.md`)

**What this trades away vs. commit-reveal:**
- Herding prevention is probabilistic/economic rather than cryptographic — a late herder can still vote, they just get a smaller cut
- Informed late voters (e.g., someone who discovers plagiarism mid-round) are also penalized by the same mechanism
- The live rating visible to all voters provides a real directional signal that commit-reveal suppresses

**Verdict:** Time-weighted distribution is a strictly simpler mechanism with a weaker but meaningful anti-herding guarantee. It is the better default for Curyo's curation context, where content quality is largely time-invariant and UX simplicity matters. Commit-reveal is the stronger mechanism for adversarial-high-stakes contexts where the cryptographic guarantee of vote secrecy justifies the UX cost.

---

## 2. Motivation

### 2.1 What commit-reveal was solving

The `FLAT-SHARES-COMMIT-REVEAL-SPEC.md` documents the problems that motivated vote secrecy:

1. **Information cascades**: voters see which side is ahead and pile on the majority — a well-studied failure mode in sequential parimutuel markets (Bikhchandani, Hirshleifer & Welch 1992; Ali & Kartik 2006)
2. **First-mover MEV**: validators front-run visible pending votes to copy direction at no extra cost
3. **Stake-size signaling**: a whale's large UP vote is a strong public signal that encourages imitation
4. **BNE proof gap**: the whitepaper's Nash equilibrium proof assumes simultaneous voting; sequential public voting has multiple degenerate equilibria including full herding

### 2.2 Why commit-reveal is costly

The `FLAT-SHARES-COMMIT-REVEAL-SPEC.md` Section 12 and the gas analysis in Section 10 document the costs:

| Cost | Detail |
|------|--------|
| **Two transactions** | Every voter submits a commit tx then a reveal tx — 2× gas, 2× user interactions |
| **Salt management** | Salt loss = stake loss. Even with deterministic salts, requires signing at commit time |
| **Offline risk** | Round enters a 5-minute reveal window; offline voters forfeit their entire stake |
| **No live rating** | Rating is frozen during the commit phase. The content page shows nothing useful during an active round |
| **Keeper complexity** | Keeper must watch for `RevealWindowOpened`, track unrevealed voters, call `finalizeRound()` |
| **Forfeit incentives** | Forfeiting unrevealed stakes to treasury creates adversarial incentive to DDoS the reveal window |

### 2.3 The core question

Can time-weighting + random settlement provide enough anti-herding that we don't need cryptographic vote secrecy? This document argues: **yes, for Curyo's curation context**, with honest analysis of where the guarantee is weaker.

---

## 3. Mechanism Design

### 3.1 What stays the same

Everything in the current system (or flat-shares spec) is preserved:

- Binary UP/DOWN voting with 1-100 cREP stake range
- Flat shares: `shares = stake` (as in the flat-shares spec)
- Group win condition: UP wins if `totalUpStake > totalDownStake` at settlement
- 82%/10%/2%/1%/5% pool split (voters/submitter/platform/treasury/consensus)
- Parimutuel reward pool: losers' 82% distributed to winners
- Participation pool for losers (unchanged)
- Rating updates live after every vote
- Random settlement via `_shouldSettle()` — ideally upgraded to drand per `SETTLEMENT-RANDOMNESS.md`
- VoterID, 24h cooldown, maxVoters cap, MIN/MAX stake bounds

### 3.2 What changes

**One field added to the Vote struct:**

```solidity
struct Vote {
    address voter;
    uint256 stake;
    uint256 shares;       // = stake (flat)
    bool isUp;
    uint64 commitBlock;   // NEW: block.number at vote time
    address frontend;
}
```

**Settlement distribution formula changes.** Currently, each winner's reward is:

```
reward_i = voterPool × (shares_i / totalWinningShares)
```

With time-weighting, it becomes:

```
effectiveStake_i = stake_i × (settlementBlock - commitBlock_i) / (settlementBlock - roundStartBlock)

reward_i = voterPool × (effectiveStake_i / Σ effectiveStake_j for all winners j)
```

The winner still receives their stake back plus their proportional reward. Only the distribution of the reward changes.

### 3.3 Time-weight formula options

**Option A: Linear decay (recommended)**

```
w_i = (settlementBlock - commitBlock_i) / (settlementBlock - roundStartBlock)
```

The voter who commits earliest gets weight ≈ 1. The voter who commits in the same block as settlement gets weight = 0 (wins the correct direction, gets stake back, but receives nothing from the pool). Weight decays linearly with time elapsed.

**Option B: Square root decay (gentler)**

```
w_i = sqrt((settlementBlock - commitBlock_i) / (settlementBlock - roundStartBlock))
```

Midpoint voter gets 71% weight instead of 50%. Final-20%-of-round voter gets 45% instead of 20%. More forgiving for voters with genuine late information.

**Option C: Power decay (steeper)**

```
w_i = ((settlementBlock - commitBlock_i) / (settlementBlock - roundStartBlock))^2
```

First quartile voter gets 56% weight. Midpoint voter gets 25%. Aggressively discourages late voting.

**Recommended calibration:** Start with linear decay (Option A). It's the easiest to reason about: a voter at the midpoint of the round gets half the pool-reward weight of a voter who voted immediately. Adjust based on observed participation patterns.

### 3.4 Settlement block unknown at vote time

The settlement block T is determined by the random settlement mechanism, which fires at a random time after `minEpochBlocks`. Voters don't know T when they vote. However:

**Earlier is always unconditionally better:** For any T > t_i, increasing t_i (voting later) strictly decreases w_i. The incentive to vote early is monotone regardless of when settlement happens. Voters don't need to know T to know that earlier is better.

For sophisticated expected-value calculation, a voter at block t_i can estimate:

```
E[w_i] = E[(T - t_i) / (T - t_start)]
```

using the settlement probability function (0.01% per block after minEpochBlocks). This is well-defined but complex; the simpler heuristic "vote early" achieves near-optimal behavior.

### 3.5 Interaction with consensus (unanimous) rounds

When all voters are on the same side, there is no losing pool. The consensus subsidy applies. Time-weighting still operates: the subsidy is distributed proportionally to `effectiveStake_i` among all voters. Earlier voters get a larger share of the (small) consensus subsidy, which is the correct behavior — they committed earliest to an uncertain assessment.

---

## 4. Numerical Examples

### 4.1 Baseline scenario — no herding

Three voters, content is good, UP wins. Round is 100 blocks, settles at block 100.

| Voter | Direction | Stake | Commit block | Time remaining | Weight | Effective stake |
|-------|-----------|-------|--------------|---------------|--------|-----------------|
| Alice | UP | 100 | 5 | 95 | 0.95 | 95.0 |
| Bob | UP | 100 | 30 | 70 | 0.70 | 70.0 |
| Carol | DOWN | 100 | 50 | 50 | — | (loser) |

Total effective stake among UP winners = 165.0. Voter pool = 0.82 × 100 = 82 cREP.

- Alice reward: (95/165) × 82 = **47.2 cREP** (net +47.2)
- Bob reward: (70/165) × 82 = **34.8 cREP** (net +34.8)
- Carol: loses 100 cREP (participation pool returns up to 90 cREP at tier 0 → net loss: 10 cREP minimum)

With **flat shares (no time-weight):** Alice and Bob split the 82 cREP equally (50/50) → 41 cREP each. Time-weighting shifts 6.2 cREP from Bob to Alice — rewarding earlier commitment.

### 4.2 Late herding scenario

Same content. A herder watches Alice and Bob's UP votes, sees the rating going up, then piles on late.

| Voter | Direction | Stake | Commit block | Weight | Effective stake |
|-------|-----------|-------|--------------|--------|-----------------|
| Alice | UP | 100 | 5 | 0.95 | 95.0 |
| Bob | UP | 100 | 30 | 0.70 | 70.0 |
| Dave (herder) | UP | 100 | 85 | 0.15 | 15.0 |
| Carol | DOWN | 100 | 50 | — | (loser) |

Total effective stake = 180.0. Voter pool = 82 cREP.

- Alice: 95/180 × 82 = **43.3 cREP** (+43.3)
- Bob: 70/180 × 82 = **31.9 cREP** (+31.9)
- Dave (herder): 15/180 × 82 = **6.8 cREP** (+6.8)

Dave staked 100 cREP and got 6.8 cREP reward — a 6.8% return on 100 cREP staked. Without time-weighting, Dave would get 100/300 × 82 = 27.3 cREP (27.3% return). Time-weighting reduces the herder's reward by **75%** relative to an early voter with the same stake.

**Is 6.8% reward enough to deter herding?** Combined with the risk of being wrong (full stake loss) and the risk of missing the round (random settlement), the expected value of pure herding is negative for most parameterizations. Section 5 formalizes this.

### 4.3 Last-block gaming scenario

An attacker observes that the round will settle deterministically at maxEpochBlocks (the 50% of rounds that reach forced settlement). They submit a large final vote in the last block to influence the outcome.

| Voter | Direction | Stake | Commit block | Weight | Effective stake |
|-------|-----------|-------|--------------|--------|-----------------|
| Alice | UP | 100 | 5 | 0.95 | 95.0 |
| Attacker | DOWN | 100 | maxEpochBlocks - 1 | 1/maxEpochBlocks ≈ 0.0001 | 0.01 |

If DOWN had enough stake to win (attacker controls more), they win correctly per the group outcome. The attacker's reward from the pool is near zero — they can only extract value if their vote flips the outcome, not from pool distribution. This is exactly correct: a late strategic vote that flips the outcome is still a problem (addressed by settlement mechanics, see Section 5.4), but it cannot extract *additional* pool value through time-weight gaming.

### 4.4 Comparing distribution formulas under contention

Content at rating 70. Round settles with UP winning by a narrow margin (53% UP stake). 10 voters.

| Timing group | Voters | Stake each | Avg weight (linear) | UP voters in group |
|---|---|---|---|---|
| Early (blocks 1-20) | 4 | 100 | 0.85 | 3 UP, 1 DOWN |
| Mid (blocks 30-60) | 4 | 100 | 0.50 | 2 UP, 2 DOWN |
| Late (blocks 70-90) | 2 | 100 | 0.15 | 1 UP, 1 DOWN |

UP side stake: 600 cREP. DOWN side stake: 400 cREP. UP wins. Loser pool (DOWN): 400. Voter pool = 0.82 × 400 = 328 cREP.

**With flat shares:** Each UP voter (6 total) gets 328/6 = 54.7 cREP regardless of timing.

**With time-weight (linear):**

| Voter | Stake | Weight | Effective stake | Reward |
|-------|-------|--------|-----------------|--------|
| Early UP ×3 | 100 each | 0.85 each | 85 each | 255 effective |
| Mid UP ×2 | 100 each | 0.50 each | 50 each | 100 effective |
| Late UP ×1 | 100 | 0.15 | 15 | 15 effective |

Total effective = 370. Early UP voter reward: 85/370 × 328 = **75.3 cREP** (+75.3). Late UP voter: 15/370 × 328 = **13.3 cREP** (+13.3).

Early voters get **5.7× more** pool reward per cREP than late voters, despite equal stakes. This is a strong early-commitment incentive without the race-to-first dynamics of the bonding curve.

---

## 5. Game-Theoretic Analysis

### 5.1 Expected value of herding vs. independent assessment

A voter arrives at block t and faces a choice: vote immediately (independent assessment, weight w_now) or wait Δ blocks to see more votes (herding, weight w_later = w_now × (1 - Δ/T_remaining)).

**Expected value of immediate vote (independent):**
```
EV_now = p × (w_now / totalWinnerWeight) × voterPool - (1-p) × stake
```

**Expected value of herding after observing Δ blocks:**
```
EV_late = p' × (w_late / totalWinnerWeight') × voterPool - (1-p') × stake
       - P(settle before Δ) × stake   [risk of missing round]
```

where `p'` is the updated accuracy after observing others' votes and `P(settle before Δ)` is the probability random settlement fires during the wait.

For herding to be rational, the accuracy gain `Δp = p' - p` must compensate for:
1. The weight reduction `Δw = w_now - w_late = w_now × Δ/T_remaining`
2. The settlement risk `P(settle) × stake`

In Curyo's curation context, content quality is largely time-invariant. The marginal accuracy gain from watching others' votes is small for a voter with honest private information. For a voter with no private information (pure herder), `p' ≈ p_crowd` — they're just taking the majority's accuracy. The time-weight and settlement risk make this unprofitable for most parameterizations.

### 5.2 Equilibrium characterization

**Honest voter equilibrium:** Vote immediately upon forming an opinion, accepting time-weight w_now at the cost of some accuracy that would come from waiting. This is rational when the time-weight penalty for delay exceeds the accuracy gain — which holds for most content quality judgments that don't require extended deliberation.

**Herder equilibrium:** Wait to observe majority direction, then vote with majority. This requires: (accuracy gain from observation) > (time-weight penalty) + (settlement risk). With linear decay and the current settlement probability, the settlement risk alone (~0.01%/block × stake) quickly dominates any accuracy gain from observation for typical round durations.

**Manipulation equilibrium:** Attacker votes early to establish directional signal, hoping to attract followers. The attacker wants UP voters to herd after seeing their early UP vote. With time-weighting, followers are penalized for following — this reduces the follower's reward and thus reduces the attacker's gain from manufactured momentum. However, the attacker still benefits if their direction is correct (natural informational edge of voting early).

**Net assessment:** Time-weighting does not cryptographically prevent herding (unlike commit-reveal), but it makes herding financially unattractive in expectation. The mechanism is effective against opportunistic copiers; it is less effective against a coordinated off-chain signal cascade where voters agree to vote the same direction before the round.

### 5.3 Comparison with Ottaviani-Sorensen (2006) strategic delay

O&S proved that in sequential parimutuel markets, privately informed small bettors rationally delay to the last moment. The logic: early bettors reveal their signal through the odds movement; late bettors free-ride on this price discovery while protecting their private information.

**Time-weighting directly inverts this incentive.** Delay is now costly: each block of waiting reduces the voter's effective pool share. The O&S equilibrium (strategic delay by informed voters) is no longer optimal. Informed voters are better off voting early and accepting some odds uncertainty in exchange for high time-weight.

**The residual concern:** O&S's other finding — that large bettors with common information bet early — still applies. A whale who votes 100 cREP early creates a strong public signal. Time-weighting rewards this behavior, which could accelerate momentum cascades on obvious content. However, for Curyo specifically:
- All voters are limited to 100 cREP (same max stake for whale and small voter)
- The parimutuel structure dilutes early-mover pool gains when many people follow (more winners = smaller individual share)
- Random settlement means followers can't be sure they'll even get to place their follow vote

### 5.4 Last-block attacks and the deterministic settlement problem

Approximately 50% of rounds reach `maxEpochBlocks` — the forced deterministic settlement ceiling. An attacker can predict this deadline and place a large stake in the final block, potentially flipping the outcome. This is the primary remaining attack vector.

**How time-weighting partially addresses it:** The last-block attacker's time weight = 0 (or near-zero). They can flip the outcome but cannot extract pool value through the time-weight mechanism. Their reward from winning is only their stake returned; they receive none of the winner pool. This makes last-block attacks **self-funding at best but not profitable**.

**Full mitigation — settlement lock period:** Prohibit new votes in the final N blocks before `maxEpochBlocks`. This is a clean solution:

```solidity
function _canVote(uint256 contentId, uint256 roundId, RoundLib.Round storage round, RoundLib.RoundConfig memory cfg) internal view {
    // ...existing checks...

    // NEW: prohibit votes in the final lockBlocks before forced settlement
    uint256 blocksUntilForced = (round.startBlock + cfg.maxEpochBlocks) - block.number;
    require(blocksUntilForced > cfg.settlementLockBlocks, "Round in settlement lock period");
}
```

A `settlementLockBlocks` of 300 (~5 minutes on Celo) is sufficient. Last-block attackers cannot even vote during this window. Combined with time-weighting making last-minute votes unrewarding, this closes the deterministic settlement attack.

**Better mitigation — drand-based settlement:** If the drand settlement approach from `SETTLEMENT-RANDOMNESS.md` is adopted, the forced deterministic ceiling can be removed entirely. Rounds settle only when the drand beacon fires a favorable outcome, which is unpredictable. No last block to attack.

### 5.5 Attack vector summary

| Attack | Time-weight mitigation | Additional mitigation needed |
|--------|----------------------|------------------------------|
| Late herding (copy majority) | High — low pool reward for late votes | None; time-weight sufficient |
| Last-block direction flip | Partial — attacker gets zero pool reward | Settlement lock period OR drand settlement |
| First-mover MEV (front-run visible pending tx) | Low — earlier is better, but direction is visible | Accept OR use drand sealed batches (Section 8.3) |
| Stake-size signaling (whale signals direction) | Partial — followers are penalized, whale is rewarded | None; inherent to public voting |
| Off-chain coordination (Discord, Telegram) | None — mechanism-external | Inherent to all on-chain mechanisms |
| 2-vs-1 controlled seeding | Same as current — group outcome prevents bracket attacks | None |
| Bracket attacks | Prevented by group outcome | N/A (group outcome eliminates this) |

---

## 6. Anti-Herding Properties vs. Commit-Reveal

### 6.1 Mechanism comparison

| Property | Time-weight (this doc) | Commit-reveal (FLAT-SHARES spec) |
|---|---|---|
| **Vote secrecy** | None — all votes immediately public | Cryptographic — direction hidden until reveal |
| **Anti-herding mechanism** | Economic penalty for late votes | Informational: can't see what to copy |
| **Herding guarantee** | Probabilistic — costs money, doesn't prevent | Near-absolute — literally no information to copy |
| **Early-voter incentive** | Time-weight pool share | None (flat shares spec removes this) |
| **Live rating** | Yes — updates after each vote | No — deferred to reveal phase |
| **UX** | 1 transaction | 2 transactions + salt management |
| **Offline risk** | Zero | Lose full stake if offline during 5-min reveal window |
| **Transparency** | High | Low (intentionally opaque) |
| **Keeper complexity** | Minimal change from current | Significant — RevealWindowOpened, finalizeRound, forfeitures |

### 6.2 Herding under different mechanisms

In a round with 10 voters and one "whale" who votes UP first:

**With time-weight:**
- Observers can see the UP vote and might follow
- Late followers get low time-weight — 15% pool share for a 90%-through-round voter vs 50% at midpoint
- The expected return from late copying is low: (accuracy from copying) × (0.15 weight × pool) - (error probability × stake)
- For most parameter settings, herding is negative EV

**With commit-reveal:**
- Observers see the total committed stake but not the direction
- No information to copy — must form independent opinion
- Herding is impossible during the commit phase

The commit-reveal guarantee is strictly stronger. The question is whether the UX cost is worth the extra protection.

### 6.3 For Curyo's specific context

Content quality in Curyo is a judgment about whether a piece of media, text, or link is good. Key properties:

1. **Quality is mostly time-invariant:** A video's quality doesn't change based on how many people voted. The "true rating" is fixed by content quality, not by social proof.
2. **Signals are not strongly correlated:** Different voters may have different tastes. Unlike financial predictions where there IS a ground truth that will eventually resolve, content quality is partly subjective.
3. **Curation, not prediction:** The goal is to surface good content, not to predict a financial outcome. The stakes are lower for any individual round.

Given these properties, the moderate anti-herding guarantee of time-weighting is likely sufficient. The cryptographic guarantee of commit-reveal solves a problem that is present but not the binding constraint for curation quality. The UX simplicity of public sequential voting with time-weighting better serves a consumer application.

---

## 7. The Live Rating Signal

### 7.1 What voters see

With public sequential voting and time-weighting, the live rating is always current:

```
┌─────────────────────────────────────────────────┐
│  "Interstellar Director's Cut — Analysis Video"  │
│  Rating: 78  ↑ from 65 (round start)            │
│                                                  │
│  Round #3 · 8 votes · 520 cREP staked           │
│  UP: 6 votes (380 cREP)  DOWN: 2 votes (140 cREP)│
│                                                  │
│  Early voters earn more pool share               │
│  Round active for 3h 20m                        │
│                                                  │
│  [Vote UP ▲]  [Vote DOWN ▼]                     │
└─────────────────────────────────────────────────┘
```

The directional breakdown (UP/DOWN count and stake) is visible. This transparency is a deliberate design choice — it provides more information to late voters, but time-weighting ensures they pay a cost for using that information.

### 7.2 The information cascade risk

When the rating and directional split are visible, a voter might update purely based on social proof: "8 smart people voted UP, I'll vote UP too." This is an information cascade.

Time-weighting doesn't prevent this reasoning — it penalizes acting on it late. The voter who recognizes they're cascading can still vote; they just earn less from the pool. Whether this economic disincentive is sufficient depends on the ratio of: (perceived gain from being on the winning side at a discounted rate) vs. (risk of being wrong).

For Curyo's 1-100 cREP range, the absolute dollar amounts are small. The time-weight penalty may feel abstract compared to the concrete "I can see 6 people voted UP." This is the honest weakness of the mechanism — commit-reveal would cryptographically eliminate this reasoning.

**Partial mitigation:** Show the UI breakdown only as a bar chart without exact numbers. Reveal exact UP/DOWN stakes only after settlement. This adds a mild information barrier without the UX cost of full commit-reveal.

---

## 8. Synergies and Extensions

### 8.1 Pairing with drand settlement

The `SETTLEMENT-RANDOMNESS.md` recommends drand-based two-phase settlement as the best available option for Celo. Time-weighted distribution pairs naturally:

- **Settlement commit**: anyone calls `settlementCommit(contentId)` — records target drand round
- **Settlement finalize**: after 30s, anyone calls `settlementFinalize(contentId, drandRoundNum, drandSig)` — verifies BLS signature, determines outcome
- **Time weights**: computed at finalize time using `settlementFinalizeBlock` as T

The drand integration eliminates the L2 sequencer's ability to predict settlement timing, removing the strategic last-block attack. With drand, there is no `maxEpochBlocks` deterministic cliff — rounds settle when the beacon fires a favorable outcome. The settlement lock period becomes unnecessary.

### 8.2 Minimum weight floor

To preserve participation from genuinely late-arriving voters (e.g., someone who discovers content 18 hours into a 24-hour round), add a configurable minimum weight:

```solidity
uint256 minWeightBps = 1000; // 10% minimum — governance-tunable

uint256 rawWeight = (uint256(settlementBlock - v.commitBlock) * 1e18) / roundDuration;
uint256 weight = rawWeight < (minWeightBps * 1e18 / 10000)
    ? (minWeightBps * 1e18 / 10000)
    : rawWeight;
```

A 10% floor means the latest possible voter still gets 10% of the pool-share that a same-stake early voter would get. This prevents time-weighting from functionally excluding late participation.

### 8.3 Optional short sealed batches (hybrid approach)

The `SETTLEMENT-RANDOMNESS.md` Section 5 explored "Option 1: Fixed sealed phase at round start" — a 60-second sealed window where the first votes are hidden. This can be combined with time-weighted distribution:

- First 60 seconds of each round: commit-reveal (votes hidden, processed as a simultaneous batch)
- After 60 seconds: votes are immediately public
- Time-weight for all votes: measured from vote time, regardless of commit/reveal phase

This hybrid captures the most vulnerable period (first votes that set the informational anchor) with full secrecy while keeping the rest of the round transparent. It's significantly simpler than full commit-reveal (only the first ~30 blocks are sealed, not the entire round).

### 8.4 Contrarian bonus within the winning side

An extension: within the winning side, weight not just by time but by how contrary the vote was at the time of casting. A voter who voted DOWN when 80% of existing stake was UP was taking a harder bet.

```solidity
// Contrarian weight: inverse of same-direction proportion at vote time
// Stored as: sameSideFractionBps = totalSameSideStake / totalStake at vote time

uint256 contraryWeight = 10000 - v.sameSideFractionBps; // higher = more contrarian
uint256 combined = (uint256(timeWeight) × contraryWeight) / 10000;
```

This rewards BOTH early voting AND contrarian direction simultaneously. It's more complex to compute (requires storing an additional field per vote) but better aligns the reward with genuine informational contribution.

Whether this is worth the added complexity is an open question — the simple time-only weight may be sufficient for Curyo's use case.

---

## 9. Implementation Changes

The implementation delta from the current system (bonding curve, no commit-reveal) is minimal:

### 9.1 Contract changes

**Vote struct** (`RoundLib.sol`): Add `uint64 commitBlock`. Packs into the existing storage slot alongside `bool isUp` and `bool revealed` (which is removed — no reveal phase). Zero storage overhead.

**`_vote()` function** (`RoundVotingEngine.sol`): Record `v.commitBlock = uint64(block.number)` at vote time. No other changes to the vote path.

**`_executeSettlement()`** (`RoundVotingEngine.sol`): Replace share-proportional distribution with time-weight distribution. Add two-pass loop:

```solidity
function _executeSettlement(
    uint256 contentId,
    uint256 roundId,
    RoundLib.Round storage round,
    RoundLib.RoundConfig memory cfg
) internal {
    // ... existing pool calculation (unchanged) ...

    uint64 settlementBlock = uint64(block.number);
    uint64 roundDuration = settlementBlock - round.startBlock;

    // Pass 1: compute total weighted stake among winners
    uint256 totalWeightedStake = 0;
    address[] storage voters = roundVoters[contentId][roundId];
    for (uint256 i = 0; i < voters.length; i++) {
        RoundLib.Vote storage v = votes[contentId][roundId][voters[i]];
        if (v.isUp == round.upWins) {
            uint256 timeRemaining = settlementBlock - v.commitBlock;
            // Scale by 1e6 to preserve precision in integer arithmetic
            uint256 weight = (timeRemaining * 1e6) / roundDuration;
            // Apply minimum weight floor (cfg.minWeightBps / 10000)
            uint256 minWeight = (cfg.minWeightBps * 1e6) / 10000;
            if (weight < minWeight) weight = minWeight;
            totalWeightedStake += (v.stake * weight) / 1e6;
        }
    }

    // Pass 2: distribute rewards
    uint256 voterPool = (losingPool * VOTER_SHARE_BPS) / 10000;
    for (uint256 i = 0; i < voters.length; i++) {
        RoundLib.Vote storage v = votes[contentId][roundId][voters[i]];
        if (v.isUp == round.upWins) {
            uint256 timeRemaining = settlementBlock - v.commitBlock;
            uint256 weight = (timeRemaining * 1e6) / roundDuration;
            uint256 minWeight = (cfg.minWeightBps * 1e6) / 10000;
            if (weight < minWeight) weight = minWeight;
            uint256 effectiveStake = (v.stake * weight) / 1e6;
            uint256 reward = (effectiveStake * voterPool) / totalWeightedStake;
            pendingRewards[voters[i]] += v.stake + reward; // stake returned + reward
        }
    }
}
```

**RoundConfig** (`RoundLib.sol`): Add `uint16 minWeightBps` (minimum time weight in basis points, e.g., 1000 = 10%). Fits into existing config struct.

**`RewardMath.calculateShares()`**: Unchanged — flat shares remain (`shares = stake`). The time weight is applied at settlement, not at vote time.

### 9.2 Gas analysis

The two-pass loop adds O(n) iterations over the voter set — but `_executeSettlement()` already iterates the voter set. Adding a second pass doubles this work.

| Operation | Current | With time-weight |
|---|---|---|
| Settlement iteration cost | O(n) × 5,000 gas | O(2n) × 5,000 gas |
| Extra storage read per voter | 0 | ~2,200 gas (cold SLOAD for `commitBlock`) |
| Integer arithmetic per voter | ~500 gas | ~2,000 gas |
| **Overhead per voter** | 0 | **~6,700 gas** |
| **Overhead at maxVoters=1000** | 0 | **~6.7M gas** |

The overhead is meaningful at scale (1000 voters). Optimization: cache the weight in a local array on the first pass rather than recomputing on the second pass. This removes the extra SLOAD cost and the arithmetic duplication.

Alternatively: store the time-weighted effective stake in the Vote struct when the vote is cast. This requires knowing only `block.number` at vote time and the round start block — no settlement block needed. Wait, no — the settlement block IS needed for the denominator. The weight can only be finalized at settlement.

**Optimization**: Store `commitBlock` as a delta from `roundStartBlock` as `uint16` (max 65535 blocks ≈ 18 hours at 1s blocks). This compresses storage. At settlement, read `roundStartBlock` from Round once (one SLOAD), then use `v.commitBlockDelta` (warm read) for each voter.

### 9.3 Keeper changes

None required. The keeper's current role (`trySettle()` on a loop) is unchanged. If drand settlement is adopted, the keeper updates per `SETTLEMENT-RANDOMNESS.md` already account for this.

### 9.4 Frontend changes

The primary change is **display**: show the time-weight incentive to users. After voting, show:

```
✓ Vote submitted! You voted UP with 50 cREP.
  Current time weight: 94% (voted near round start)
  Estimated pool share: ~XX cREP if UP wins
```

The time weight decreases as the round progresses, which can be shown as a countdown or progress bar:

```
  [████████████████████░░░░] Pool share bonus active (16h remaining)
```

### 9.5 Ponder indexer changes

Add `commitBlock` to the vote event schema. Expose it in the `/votes` API endpoint. Existing indices are unaffected.

---

## 10. What this mechanism does NOT solve

Honest accounting of limitations:

1. **Off-chain coordination**: voters agreeing in Discord to vote the same direction before casting is undetectable and unaffected. Same as all on-chain mechanisms.

2. **Strong information cascades from large early votes**: a 100 cREP UP vote at block 1 is visible and may attract followers. Time-weighting penalizes followers but doesn't suppress the signal. The only solution is commit-reveal or a short sealed initial window (Section 8.3).

3. **L2 sequencer manipulation of settlement**: if using `block.prevrandao`, the sequencer can still predict settlement outcomes. drand settlement (already recommended) is required to fully close this.

4. **~50% deterministic settlement window**: rounds that reach `maxEpochBlocks` have a predictable settlement moment. Settlement lock period (Section 5.4) or drand settlement removes this.

5. **"Always vote UP" degenerate equilibrium**: same as the current system. No mechanism-internal force penalizes this equilibrium. Requires extrinsic belief that curation quality matters.

6. **Slash threshold**: rating must drop below 10 to slash submitter. Unchanged. Still nearly unreachable.

7. **Consensus subsidy drain**: unanimous rounds consume the subsidy. Unchanged mechanics.

---

## 11. Comparison with Existing Designs

| Property | Current (bonding curve) | Commit-reveal (FLAT-SHARES spec) | Time-weight (this doc) |
|---|---|---|---|
| Anti-herding mechanism | Bonding curve price | Vote secrecy | Time penalty |
| Early-voter advantage | Strong mechanical (shares) | None | Moderate economic (weight) |
| First-mover MEV risk | High | Eliminated | Low (no speed race) |
| Information cascades | Partially mitigated | Strongly mitigated | Moderately mitigated |
| Live rating | Yes | No (deferred) | Yes |
| Vote UX | 1 tx | 2 tx + salt mgmt | 1 tx |
| Offline risk | None | Stake loss in reveal window | None |
| Settlement front-running | Medium risk | Greatly reduced | Needs drand for full fix |
| Bracket attacks | Prevented (group outcome) | Prevented | Prevented (group outcome) |
| Keeper complexity | Low | High | Low |
| Implementation delta | Baseline | Large | Small (one extra field) |
| Gas overhead | Baseline | +51,200 gas per voter | +6,700 gas at settlement |
| UX transparency | High | Low | High |

---

## 12. Open Design Questions

1. **Linear vs. square root decay**: linear is simpler but aggressively penalizes midpoint voters. Square root is gentler and may be more appropriate for rounds where genuine late information is common. Which default is better for content curation?

2. **Minimum weight floor**: should late voters have a guaranteed minimum pool share (e.g., 10%)? A floor improves fairness for late-arriving honest voters at the cost of slightly weakening the anti-herding penalty.

3. **Contrarian weighting**: should voters also be weighted by how contrary their direction was at vote time? This aligns reward with informational contribution but adds storage and computation. Worth it?

4. **Settlement lock period**: if not using drand, should the last N blocks before `maxEpochBlocks` prohibit new votes? What value of N is appropriate on 1s Celo blocks?

5. **UI for time weight**: should the time-weight be shown to voters before and after voting? A progress bar showing "pool share bonus: 78% remaining" creates a concrete early-voting incentive but may be confusing.

6. **Interaction with participation pool**: the participation pool returns up to 90% of losing voters' stakes. Should losers' participation rewards also be time-weighted? (Argue: no — the participation pool is a separate mechanism for honest participation, not anti-herding.)

7. **Migration from bonding curve**: the current system has `liquidityParam` in `RoundConfig`. With flat shares, this is deprecated. Replacing it with `minWeightBps` is clean but requires a governance action to add the new config field.

8. **Hybrid with short sealed initial window**: as described in Section 8.3, adding a 60-second sealed phase at the start of each round would capture the most vulnerable cascade period without full commit-reveal. Is this complexity justified?

---

## 13. Recommended Approach

Based on this analysis:

**Primary recommendation:** Adopt time-weighted distribution (this design) instead of full commit-reveal. The implementation cost is small (one field, one formula change), the UX is identical to the current system, and the anti-herding guarantee is meaningful for content curation.

**Secondary recommendation:** Pair with drand settlement (`SETTLEMENT-RANDOMNESS.md` Option A). drand eliminates the last-block attack and deterministic settlement vulnerability, removing the need for a settlement lock period. The two designs are synergistic.

**Optional:** Add a 60-second sealed initial window (Section 8.3) if testing reveals that the first votes drive strong cascade behavior. This is an additive change that doesn't require redesigning the core mechanism.

**Parameters to start with:**
- Decay: linear
- `minWeightBps`: 1000 (10% floor)
- `settlementLockBlocks`: 300 (~5 minutes) if drand not yet implemented

---

## 14. References

**Sequential parimutuel markets:**
- Ottaviani & Sorensen (2006) — "The Timing of Parimutuel Bets" — strategic delay by informed bettors
- Ottaviani & Sorensen (2010) — "Noise, Information, and the Favorite-Longshot Bias" — favorite-longshot bias in sequential parimutuel
- Koessler, Noussair & Ziegelmeyer (2008) — "Parimutuel Betting under Asymmetric Information" — separating equilibrium in simultaneous vs. sequential
- Feeney & King (2001) — "Sequential Parimutuel Games" — timing in sequential parimutuel

**Information cascades:**
- Bikhchandani, Hirshleifer & Welch (1992) — "A Theory of Fads, Fashion, Custom, and Cultural Change as Informational Cascades"
- Ali & Kartik (2006) — "A Theory of Momentum in Sequential Voting" — bandwagon equilibria
- Plott, Wit & Yang (2003) — "Parimutuel Betting Markets as Information Aggregation Devices" — bluffing and strategic delay
- Yang, Li & van Heck (2015) — "Information Transparency in Prediction Markets" — partial transparency outperforms full

**Time-based pricing mechanisms:**
- Paradigm (2022) — "Variable Rate GDAs" — exponential decay pricing
- Polkadot (2021) — "The Case for Candle Auctions" — random close incentivizes early participation
- Budish, Cramton & Shim (2015) — "Frequent Batch Auctions" — discrete batching eliminates speed races

**Internal references:**
- `GAME-THEORY-ANALYSIS.md` — full attack vector analysis and severity ratings
- `FLAT-SHARES-COMMIT-REVEAL-SPEC.md` — the commit-reveal alternative and its UX/gas costs
- `TIME-WEIGHTED-SHARE-PRICING.md` — earlier exploration of time-weighting via bonding curve modification
- `SETTLEMENT-RANDOMNESS.md` — drand integration for unpredictable settlement timing
