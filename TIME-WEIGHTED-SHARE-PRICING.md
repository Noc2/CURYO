# Bounded Decay Time-Weighted Share Pricing: Research & Analysis

Research date: 2026-03-02

Evaluation of a "bounded decay" modification to Curyo's bonding curve share pricing. Cross-references the current implementation (`RewardMath.sol`, `RoundVotingEngine.sol`), the game-theoretic analysis (`GAME-THEORY-ANALYSIS.md`), and academic literature on dynamic parimutuel markets, candle auctions, and time-weighted mechanisms.

---

## 1. Current System Recap

### 1.1 The Bonding Curve (`RewardMath.sol:35-37`)

```
shares = stake * b / (sameDirectionStake + b)
```

With `b = 1000 cREP` (the liquidity parameter), the first voter gets 100% of stake as shares. The 10th voter on the same side gets ~52.6% of stake as shares. Shares are locked in at vote time and never change.

### 1.2 Reward Distribution

At settlement, the losing pool is split: 82% to winning voters, distributed proportional to *shares* (not stakes). This means early voters earn disproportionately more per cREP staked:

| Voter | Stake | Pool Before | Shares | Shares/Stake |
|-------|-------|-------------|--------|--------------|
| 1st   | 50    | 0           | 50.0   | 100%         |
| 2nd   | 50    | 50          | 47.6   | 95.2%        |
| 5th   | 50    | 200         | 41.7   | 83.3%        |
| 10th  | 50    | 450         | 34.5   | 69.0%        |

### 1.3 The Problem

The analysis in `GAME-THEORY-ANALYSIS.md` Section A.3 identifies:

> The bonding curve is **not a proper scoring rule** -- it incentivizes *early* voting, not *truthful* voting. A voter who is unsure but arrives early is rewarded more than a voter with a strong signal who arrives late.

The pure speed advantage creates three exploitation vectors: MEV-style race to vote first, 1 cREP probe votes to capture cheap shares, and catalyst stake attacks.

---

## 2. The Proposed Mechanism: Bounded Decay

### 2.1 Core Idea

Multiply the bonding curve's output by a time-weight that reduces the early-mover premium, while preserving the contrarian incentive (early voters on the *minority* side still benefit from the pool dynamics):

```solidity
function calculateShares(
    uint256 stake,
    uint256 sameDirectionStake,
    uint256 b,
    uint256 blocksElapsed,
    uint64 maxEpochBlocks
) internal pure returns (uint256) {
    if (b == 0) return stake;

    uint256 baseShares = (stake * b) / (sameDirectionStake + b);

    // Floor: shares without any bonding curve premium (heuristic: half of stake)
    uint256 floorShares = stake / 2;
    if (baseShares <= floorShares) return baseShares;

    // The premium is the bonus from arriving before the pool filled up
    uint256 premium = baseShares - floorShares;

    // Time dampening: premium starts at alpha%, reaches 100% at maxEpochBlocks
    // alpha = 6000 (60%) means first voter gets 60% of the premium, growing to 100%
    uint256 alpha = 6000; // minimum premium fraction (BPS)
    uint256 elapsed = blocksElapsed > maxEpochBlocks ? maxEpochBlocks : blocksElapsed;
    uint256 timeWeight = alpha + ((10000 - alpha) * elapsed) / maxEpochBlocks;
    uint256 adjustedPremium = (premium * timeWeight) / 10000;

    return floorShares + adjustedPremium;
}
```

### 2.2 What This Changes Numerically

With `alpha = 6000` (60% floor), `b = 1000 cREP`, `maxEpochBlocks = 7200`:

**First voter (block 0, pool = 0, stake = 50 cREP):**
- `baseShares = 50` (100% of stake)
- `floorShares = 25`
- `premium = 25`
- `timeWeight = 6000` (60%)
- `adjustedPremium = 15`
- **effectiveShares = 40** (was 50, now 80% of original)

**Fifth voter (block 1000, pool = 200, stake = 50 cREP):**
- `baseShares = 41.7`
- `floorShares = 25`
- `premium = 16.7`
- `timeWeight = 6000 + 4000 * 1000/7200 = 6556` (65.6%)
- `adjustedPremium = 10.9`
- **effectiveShares = 35.9** (was 41.7, now 86% of original)

**Tenth voter (block 3600, pool = 450, stake = 50 cREP):**
- `baseShares = 34.5`
- `floorShares = 25`
- `premium = 9.5`
- `timeWeight = 6000 + 4000 * 3600/7200 = 8000` (80%)
- `adjustedPremium = 7.6`
- **effectiveShares = 32.6** (was 34.5, now 94.5% of original)

**Summary: early-voter premium reduction**

| Voter | Block | Current Shares | Bounded Decay Shares | Change |
|-------|-------|----------------|----------------------|--------|
| 1st   | 0     | 50.0           | 40.0                 | -20%   |
| 2nd   | 200   | 47.6           | 39.5                 | -17%   |
| 5th   | 1000  | 41.7           | 35.9                 | -14%   |
| 10th  | 3600  | 34.5           | 32.6                 | -5.5%  |
| Late  | 7000  | 30.0           | 29.8                 | -0.7%  |

The gap between first and tenth voter narrows from 15.5 shares to 7.4 shares -- roughly halved.

---

## 3. Impact on Existing Game Theory Scenarios

### 3.1 Test 6: Early Voter Advantage (`FormalVerification_GameTheory.t.sol:297-340`)

Scenario: 1 whale UP (100 cREP, first) + 4 minnows UP (1 cREP each, later) vs 5 DOWN (10 cREP each).

**Current:** Whale gets ~100 shares (first voter). Minnow 4 gets ~0.909 shares (pool = 103 cREP). Whale ROI% > Minnow ROI%.

**With bounded decay (alpha=0.6):** Whale at block 0 gets `floor(50) + 0.6 * premium(50) = 50 + 30 = 80` shares instead of 100. Minnow 4 at block ~4 gets ~0.9 shares (nearly unchanged -- pool is still small for minnows, and a few blocks elapsed barely changes timeWeight).

**Effect:** Whale's ROI% decreases by ~20%. Minnow's ROI% barely changes. The test assertion (`whaleROI > minnowROI`) still holds, but the gap narrows. The early-voter advantage is *dampened*, not eliminated.

### 3.2 Test 4: Collusion Economics (`FormalVerification_GameTheory.t.sol:226-250`)

Scenario: 4 colluders UP (100 each) + 1 victim DOWN (1 cREP).

**Current:** Colluders get high shares because they vote first on an empty pool. But the losing pool is only 1 cREP, so profit is negligible regardless.

**With bounded decay:** Colluder shares decrease by ~20%, but the profit was already negligible (<0.2 cREP each). **No meaningful change** -- the collusion defense comes from the tiny losing pool, not from share pricing.

### 3.3 Test 9: Manufactured Dissent (`FormalVerification_GameTheory.t.sol:404-439`)

Scenario: Attacker votes UP (100) and DOWN (50) with 2 identities, then 3 honest voters vote UP (50 each).

**Current:** Attacker captures a large share of the 50 cREP losing pool because their UP vote (first) gets maximum shares.

**With bounded decay:** Attacker's first UP vote at block 0 gets ~80% of current shares. Honest voters who arrive later get relatively more. The attacker's share of the voter pool decreases. **Net loss from manufactured dissent increases**, making the attack less attractive. This is a clear improvement.

### 3.4 Catalyst Stake Attack (from `GAME-THEORY-ANALYSIS.md` A.2)

Scenario: Vote DOWN with 1 cREP (sacrifice), then UP with 100 cREP on a second identity to capture first-mover shares.

**Current:** The second-identity UP vote at block 0 gets maximum shares. The attacker sacrifices 1 cREP but captures a disproportionate share of the losing pool.

**With bounded decay:** The UP vote's shares are reduced by ~20% at block 0. But critically, the attack still works because the attacker is still first -- the time decay only reduces the *magnitude* of the advantage, it doesn't eliminate position-based pricing from the bonding curve. **Partially mitigated.**

---

## 4. Academic Context

### 4.1 Dynamic Parimutuel Market Timing (Pennock 2004, Sami & Pennock 2010)

Pennock's DPM was designed to incentivize early information revelation. Sami & Pennock's follow-up "Gaming Dynamic Parimutuel Markets" ([SpringerLink](https://link.springer.com/chapter/10.1007/978-3-642-10841-9_64)) proved that neither DPMs nor Market Scoring Rules are incentive-compatible in general -- non-myopic agents can profit from timing manipulation, information withholding, and bluffing.

**Implication for bounded decay:** Time-weighting doesn't solve the fundamental incentive compatibility problem. It reshapes which timing strategies are profitable, but strategic agents will adapt. The question is whether the new equilibrium is better or worse for signal quality.

### 4.2 Ottaviani-Sorensen Timing Results (2006)

"The Timing of Parimutuel Bets" established that in sequential parimutuel markets, small privately informed bettors rationally delay to the last moment to protect their private information. Large bettors with common information bet early.

**Implication for bounded decay:** Time-weighting *penalizes* the most informed participants (who tend to arrive late) and *rewards* fast but potentially uninformed participants. This is the central tension. Curyo's random settlement partially mitigates this by making "the last moment" unpredictable, but the bounded decay still shifts the equilibrium toward speed over information quality.

### 4.3 Candle Auctions and Random Settlement (Polkadot Research)

Polkadot's [candle auction research](https://polkadot.com/blog/research-update-the-case-for-candle-auctions/) proves that random-close mechanisms incentivize early bidding and approximate second-price auction outcomes under uniform ending time distributions. The mechanism is formally equivalent to Curyo's random settlement window.

**Implication for bounded decay:** Random settlement already provides an incentive for early participation (vote early or risk missing the window). Adding time-weighted shares on top creates a double incentive: voters are penalized for lateness by both (a) risk of missing settlement and (b) reduced shares. The question is whether this over-corrects.

### 4.4 VRGDA Time Decay (Paradigm 2022)

The Variable Rate Gradual Dutch Auction ([Paradigm](https://www.paradigm.xyz/2022/08/vrgda)) provides the most rigorous framework for time-dependent pricing. The exponential decay formula:

```
price(t) = p_0 * (1 - k)^(t - f^-1(n))
```

Where `k` is the decay constant and `f^-1(n)` is the target schedule. For Curyo, the "schedule" is the expected voting rate, and the bonus decays exponentially rather than linearly.

**Implication for bounded decay:** The linear decay in the proposed mechanism (`alpha + (1-alpha) * t/T`) is simpler than VRGDA's exponential decay but less flexible. A linear schedule means the bonus erodes at a constant rate, while exponential front-loads the erosion. For Curyo's use case (round durations of 1-24 hours), the difference is minor.

### 4.5 Conviction Voting (BlockScience / 1Hive)

[Conviction Voting](https://www.mechanism.institute/library/conviction-voting) uses the inverse approach: support *builds up* over time rather than decaying. The formula `y_{t+1} = alpha * y_t + x` creates exponential approach to maximum conviction.

**Implication for bounded decay:** This is the philosophical inverse of Curyo's model. Conviction voting rewards sustained commitment; Curyo rewards early discovery. They could be combined: early votes get a bonding curve premium, AND votes that remain through settlement get a commitment multiplier. However, this adds complexity for unclear benefit -- in Curyo, all votes are already committed through settlement (no exit).

### 4.6 Friend.tech Bot Sniping Precedent

Friend.tech's quadratic bonding curve (`price = supply^2 / 16000`) created a bot sniping problem where automated agents detected new key launches in ~0.01 seconds and captured nearly all the early-mover value.

**Implication for bounded decay:** Any time-based bonus that rewards the absolute earliest participants will be captured by bots, not humans. The `alpha` floor (60%) limits the bot advantage to 40% of the premium, but the question is whether even 40% is worth the complexity. Curyo's Voter ID requirement (one per verified human, 24h cooldown) provides some defense, but bots controlled by a single identity can still vote faster than manual users.

---

## 5. Advantages

### 5.1 Reduces Pure Speed Premium

The first voter's share advantage decreases from 100% to ~80% of stake (with alpha=0.6). This narrows the gap between fast uninformed voters and slower informed voters.

### 5.2 Makes Manufactured Dissent Less Profitable

Attackers who seed rounds with sacrificial opposite-direction stakes capture fewer shares on their "real" vote, because the time penalty applies to their early entry. The honest voters who arrive later get relatively better pricing.

### 5.3 Preserves the Anti-Herding Property

The bonding curve's core function (contrarians get more shares than followers) is untouched. Time-weighting only reduces the *magnitude* of the positional premium, not the *direction*. The first voter on a side still gets more shares than the tenth voter on the same side.

### 5.4 Simple Implementation

The change is a single multiplication and addition in `calculateShares()`. Gas cost increase is negligible (~200 gas for the extra arithmetic). No new storage is needed -- `block.number - round.startBlock` is already computable at vote time.

### 5.5 Composable with Random Settlement

The random settlement window already discourages late sniping. The bounded decay discourages uninformed speed-voting. Together they create a "sweet spot" where the optimal strategy is to vote at a moderate time with a genuine signal -- not too early (time penalty) and not too late (settlement risk).

---

## 6. Disadvantages and Risks

### 6.1 Penalizes Informed Early Voters

The most significant problem. A genuinely informed voter who recognizes high-quality content immediately and votes at block 0 loses ~20% of their share premium compared to the current system. The mechanism cannot distinguish "fast because informed" from "fast because bot."

**Severity: Medium.** The 20% reduction is meaningful but not devastating. The voter still profits from being on the correct side. The penalty is on the *bonus*, not the base return.

### 6.2 Creates a New Strategic Delay Incentive

Voters now have a reason to delay: waiting 1000 blocks improves their time-weight from 60% to 65.6%. This partially counteracts the random settlement incentive (which says "don't wait").

**Severity: Low-Medium.** With alpha=0.6, the delay incentive is weak -- waiting half the epoch (3600 blocks) only improves the weight from 60% to 80%. The settlement risk of waiting (probability of missing the window) likely dominates for reasonable parameters. At `baseRateBps=3` and 3600 blocks elapsed, the cumulative settlement probability is ~10%, meaning a delayed voter has a ~10% chance of missing the round entirely.

### 6.3 `alpha` Becomes a Governance Attack Surface

The `alpha` parameter controls how much of the premium early voters retain. Setting `alpha = 10000` (100%) disables time-weighting. Setting `alpha = 0` makes first-voter shares worth only 50% of current. A governance attacker could manipulate this to benefit specific strategies.

**Severity: Low.** Same concern exists for `b` (liquidity parameter) today. Config is already snapshotted per-round (`RoundVotingEngine.sol:558`), preventing mid-round changes. Governance manipulation requires a multi-day proposal process.

### 6.4 Floor Heuristic (`stake/2`) Is Arbitrary

The "floor shares" of `stake/2` is a heuristic for "what a late voter would get." In practice, the actual late-voter shares depend on the final pool size, which is unknowable at vote time. If the pool stays small (few voters), the floor penalizes early voters unfairly. If the pool grows large, the floor is generous.

**Severity: Medium.** This is the weakest part of the design. Alternative floors:
- **`stake * b / (estimatedFinalPool + b)`** -- requires estimating final pool (unreliable)
- **`stake * b / (2 * b)`** = `stake / 2` -- the current heuristic, assumes pool reaches `b`
- **Zero floor (full premium scaling):** `effectiveShares = baseShares * timeWeight` -- simpler, but penalizes early voters more aggressively

### 6.5 BNE Analysis Becomes More Complex

The whitepaper's Bayesian Nash Equilibrium proof assumes payoffs depend only on vote direction and stake. With time-weighting, payoffs also depend on vote timing, creating a multi-dimensional strategy space. The BNE result needs re-derivation for the sequential game with time-dependent payoffs.

**Severity: Low (practical).** The current BNE proof is already fragile (per `GAME-THEORY-ANALYSIS.md` Section A.1). Adding time-weighting makes the formal analysis harder but doesn't change the practical situation significantly -- the mechanism was already a sequential game with path-dependent payoffs.

### 6.6 Interaction with Consensus (Unanimous) Rounds

In unanimous rounds (all voters on same side), there's no losing pool -- the consensus reserve provides a small subsidy. Time-weighting reduces early voters' shares in these rounds too, but the subsidy is already small (5% of total stake, capped at 50 cREP). The effect on consensus economics is negligible.

**Severity: Negligible.**

---

## 7. Numerical Simulation: Test 6 Scenario

Reproducing the exact scenario from `FormalVerification_GameTheory.t.sol:297-340`:

**Setup:** 1 whale UP (100 cREP, block 0) + 4 minnows UP (1 cREP each, blocks 1-4) vs 5 DOWN (10 cREP each, blocks 5-9).

### Current System

```
UP side:
  Whale:    shares = 100 * 1000 / (0 + 1000)   = 100.0
  Minnow 1: shares = 1 * 1000 / (100 + 1000)   = 0.909
  Minnow 2: shares = 1 * 1000 / (101 + 1000)   = 0.908
  Minnow 3: shares = 1 * 1000 / (102 + 1000)   = 0.907
  Minnow 4: shares = 1 * 1000 / (103 + 1000)   = 0.907
  Total UP shares: 103.63

DOWN side:
  Voter 1: shares = 10 * 1000 / (0 + 1000)     = 10.0
  Voter 2: shares = 10 * 1000 / (10 + 1000)     = 9.90
  Voter 3: shares = 10 * 1000 / (20 + 1000)     = 9.80
  Voter 4: shares = 10 * 1000 / (30 + 1000)     = 9.71
  Voter 5: shares = 10 * 1000 / (40 + 1000)     = 9.62

UP wins (104 > 50). Losing pool = 50. Voter pool = 50 * 0.82 = 41.
Whale reward  = 41 * 100.0 / 103.63 = 39.56 cREP  (ROI: 39.6%)
Minnow4 reward = 41 * 0.907 / 103.63 = 0.359 cREP (ROI: 35.9%)
```

### With Bounded Decay (alpha = 0.6)

```
UP side (assuming ~12s blocks, maxEpochBlocks = 7200):
  Whale (block 0):
    base = 100, floor = 50, premium = 50
    timeWeight = 6000 + 4000 * 0 / 7200 = 6000
    adjusted = 50 * 6000 / 10000 = 30
    shares = 50 + 30 = 80.0

  Minnow 1 (block 1):
    base = 0.909, floor = 0.5, premium = 0.409
    timeWeight = 6000 + 4000 * 1 / 7200 = 6001
    adjusted = 0.409 * 6001 / 10000 = 0.245
    shares = 0.5 + 0.245 = 0.745

  Minnow 4 (block 4):
    base = 0.907, floor = 0.5, premium = 0.407
    timeWeight = 6000 + 4000 * 4 / 7200 = 6002
    adjusted = 0.407 * 6002 / 10000 = 0.244
    shares = 0.5 + 0.244 = 0.744

  Total UP shares: ~82.98

DOWN side (blocks 5-9, similar timeWeight ~6003-6005):
  Similar small reduction, total DOWN shares: ~46.7

Whale reward  = 41 * 80.0 / 82.98 = 39.52 cREP  (ROI: 39.5%)
Minnow4 reward = 41 * 0.744 / 82.98 = 0.367 cREP (ROI: 36.7%)
```

**Observation:** In this test scenario, all votes happen within a few blocks of each other, so the time-weight barely changes (6000 vs 6005). Both sides are penalized nearly equally. The whale's ROI drops from 39.6% to 39.5% -- negligible.

**This reveals a key insight:** The bounded decay only makes a significant difference when votes are spread across a meaningful fraction of the epoch (thousands of blocks apart). For rounds where all votes arrive within minutes of each other, the mechanism has almost no effect. This is actually a desirable property: it only activates when there's a real timing spread.

---

## 8. When Does Bounded Decay Matter Most?

The mechanism has significant impact in these scenarios:

### 8.1 Scouting + Bandwagoning (Hours Apart)

Voter A discovers content early, votes at block 100. Voter B sees the vote count rising 6 hours later (block 1800) and bandwagons.

**Current:** A gets far more shares because sameDirectionStake was 0. B's share penalty comes entirely from the bonding curve (larger pool).

**With bounded decay:** A gets an *additional* 20% penalty for being early (timeWeight = 6000 at block 100). B gets only a ~10% penalty (timeWeight = 7000 at block 1800). The gap between "discoverer" and "follower" narrows.

**Assessment:** This is the scenario where bounded decay is most controversial. It's defensible if you believe followers have better information (they can see A's vote signal + additional evidence). It's harmful if you believe discoverers deserve the full premium for taking risk without social proof.

### 8.2 Cross-Content Sniping (Bot Strategy)

A bot votes immediately (block 0) on every new round to capture maximum shares on all content.

**Current:** Bot gets 100% of stake as shares on every first vote.

**With bounded decay:** Bot gets 80% of stake as shares (40% less premium). Human voters who arrive 30 minutes later (block 150) get 81.2% -- nearly as good as the bot.

**Assessment:** Meaningful improvement. The bot's advantage narrows from "massive" to "marginal." Combined with Voter ID's 24h cooldown, this makes blanket sniping uneconomical.

### 8.3 Manufactured Dissent (Attack Scenario)

Attacker seeds a 1 cREP DOWN vote at block 0, then immediately votes 100 cREP UP on a different identity.

**Current:** The UP vote gets 100 shares (pool was 0 on UP side).

**With bounded decay:** The UP vote gets 80 shares. The losing pool is still 1 cREP, so the absolute profit change is small. But proportionally, the attacker's share of the voter pool drops.

**Assessment:** Marginal improvement. The attack was already low-profit; it's now slightly lower.

---

## 9. Alternative Floor Formulas

The `stake/2` floor is the weakest element. Here are alternatives:

### 9.1 No Floor (Pure Scaling)

```
effectiveShares = baseShares * timeWeight / 10000
```

Simpler. First voter gets 60% of current shares. Late voter gets ~100%. No arbitrary heuristic.

**Problem:** Aggressively penalizes early voters. With alpha=0.6, the first voter loses 40% of shares. Combined with bonding curve decay, the 10th voter at block 5000 could get *more* effective shares per cREP than the 1st voter at block 0 -- completely inverting the early-mover advantage.

### 9.2 Dynamic Floor from Pool State

```
estimatedLateShares = stake * b / (sameDirectionStake + expectedTotalPool + b)
```

Uses the current pool state to estimate what a late voter would receive. More accurate but requires an `expectedTotalPool` assumption.

**Problem:** The expected total pool is unknowable. You could use historical average pool sizes, but this varies wildly across content types.

### 9.3 Configurable Floor Ratio

```
uint256 floorRatio = 5000; // 50% BPS, configurable via governance
uint256 floorShares = (stake * floorRatio) / 10000;
```

Makes the floor a tunable parameter alongside `alpha`. More flexible but adds another governance surface.

**Assessment:** Option 9.1 (no floor, pure scaling) is the simplest and avoids the heuristic entirely. The trade-off is more aggressive early-voter dampening. If `alpha` is set high enough (e.g., 0.8), the pure scaling approach gives first voters 80% of shares -- a 20% reduction that's meaningful but not punitive. This might be the cleanest design.

---

## 10. Recommendation

### Parameter Choices

| Parameter | Recommended | Rationale |
|-----------|-------------|-----------|
| Formula | Pure scaling (no floor) | Avoids arbitrary `stake/2` heuristic |
| `alpha` | 8000 (80%) | Conservative: 20% max penalty for earliest voter |
| Decay shape | Linear | Simpler than exponential, predictable |

### Simplified Formula

```solidity
function calculateShares(
    uint256 stake,
    uint256 sameDirectionStake,
    uint256 b,
    uint256 blocksElapsed,
    uint64 maxEpochBlocks
) internal pure returns (uint256) {
    if (b == 0) return stake;

    uint256 baseShares = (stake * b) / (sameDirectionStake + b);

    // Time dampening: early voters get alpha% of shares, linearly increasing to 100%
    uint256 alpha = 8000; // 80% minimum
    uint256 elapsed = blocksElapsed > maxEpochBlocks ? maxEpochBlocks : blocksElapsed;
    uint256 timeWeight = alpha + ((10000 - alpha) * elapsed) / maxEpochBlocks;

    return (baseShares * timeWeight) / 10000;
}
```

### Impact with `alpha = 8000`

| Voter timing | Share retention | Effective penalty |
|--------------|----------------|-------------------|
| Block 0 (instant) | 80% | -20% |
| Block 900 (~25%) | 85% | -15% |
| Block 3600 (50%) | 90% | -10% |
| Block 5400 (75%) | 95% | -5% |
| Block 7200 (100%) | 100% | 0% |

### What This Doesn't Solve

1. **The BNE gap** (simultaneous theory vs sequential reality). Time-weighting reshapes the game but doesn't close the formal gap.
2. **2-person undetectable collusion.** Timing doesn't help when two colluders coordinate privately.
3. **L2 sequencer manipulation.** Block ordering is still controllable by the sequencer.
4. **The "Always Vote UP" degenerate equilibrium.** Time-weighting doesn't introduce a mechanism-internal force that selects the honest equilibrium.

### Before Implementation

1. **Re-run all 14 game theory tests** with the modified formula to verify no scenario becomes newly exploitable.
2. **Model the delay incentive quantitatively:** compute the expected value of waiting N blocks (better time-weight) vs the probability of missing settlement (random settlement window). If waiting is ever positive-EV at reasonable confidence levels, `alpha` needs to be higher.
3. **Consider making `alpha` part of `RoundConfig`** so it's governance-tunable and per-round snapshotted, consistent with `liquidityParam`.

---

## 11. References

- [Pennock (2004) - A Dynamic Pari-Mutuel Market for Hedging, Wagering, and Information Aggregation](https://dl.acm.org/doi/10.1145/988772.988799)
- [Sami & Pennock (2010) - Gaming Dynamic Parimutuel Markets](https://link.springer.com/chapter/10.1007/978-3-642-10841-9_64)
- [Peters & Ye - Pari-mutuel Markets: Mechanisms and Performance](https://web.stanford.edu/~yyye/scpmfinal.pdf)
- [Ottaviani & Sorensen (2006) - The Timing of Parimutuel Bets](https://web.econ.ku.dk/~sorensen/papers/TheTimingofParimutuelBets.pdf)
- [Polkadot - The Case for Candle Auctions](https://polkadot.com/blog/research-update-the-case-for-candle-auctions/)
- [Paradigm (2022) - Variable Rate GDAs](https://www.paradigm.xyz/2022/08/vrgda)
- [1Hive / BlockScience - Conviction Voting](https://www.mechanism.institute/library/conviction-voting)
- [Manifold Markets - Above the Fold: Market Mechanics](https://news.manifold.markets/p/above-the-fold-market-mechanics)
- [Feeney & King (2001) - Sequential Parimutuel Games](https://www.sciencedirect.com/science/article/abs/pii/S0165176501004165)
- [de la Rouviere - Tokens 2.0: Curved Token Bonding in Curation Markets](https://medium.com/@simondlr/tokens-2-0-curved-token-bonding-in-curation-markets-1764a2e0bee5)
- [Friend.tech Bonding Curve Analysis](https://mirror.xyz/basedtoschi.eth/C-8I58Fh_hU5bVACjpMmXy4O9atUG1PLsEqLHn5sO3w)
