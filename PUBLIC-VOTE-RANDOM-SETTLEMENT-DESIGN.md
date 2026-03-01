# Public Vote + Random Settlement — Design Document

## Problem Statement

Curyo's current tlock commit-reveal system ensures vote privacy within epochs, preventing herding and information cascading. However, it introduces significant complexity:

- **tlock encryption** — each vote requires timelock encryption to a future drand round
- **Keeper infrastructure** — a dedicated keeper service must reveal votes via drand beacons
- **drand dependency** — the system relies on an external distributed randomness beacon
- **Two-phase UX** — voters cannot see their vote's impact until the reveal phase

This document explores an alternative: **public voting with immediate rating impact and random settlement timing**, which could achieve similar strategic properties with dramatically simpler architecture.

## Proposed Mechanism

### Core Idea

1. **Votes are public and immediate.** When a voter stakes cREP and votes UP or DOWN, the content's rating moves instantly.
2. **Each vote shifts the rating** along a pricing curve. The more votes already exist in one direction, the more expensive (riskier) it becomes to vote in that same direction.
3. **Settlement happens randomly.** At any point during the epoch, settlement can be triggered. No one knows when. At settlement, voters on the "correct" side are rewarded; the "incorrect" side loses their stakes.
4. **"Correct" is defined by the final rating direction** relative to a reference point (the rating at epoch start).

### Why This Works

The key insight is that **the pricing curve creates its own anti-herding incentive**. In traditional public voting (Reddit, HN), following the crowd is costless. Here, following the crowd is *expensive* because the risk/reward ratio worsens with each additional aligned vote.

**Example flow:**
- Content starts epoch at rating 50 (neutral)
- Voter A stakes 10 cREP and votes UP. Rating moves to 55. Cost was low, potential reward is high.
- Voter B stakes 10 cREP and votes UP. Rating moves to 58. Cost was slightly higher, reward potential slightly lower.
- Voter C stakes 10 cREP and votes UP. Rating moves to 60. More expensive still.
- Now Voter D faces a decision: voting UP is expensive (rating already high, less room to grow). Voting DOWN is cheap and potentially very rewarding if the rating corrects.
- This creates natural **contrarian pressure** that self-corrects toward true quality.

Meanwhile, settlement could trigger at any moment. Voters can't wait and pile on at the last second because there is no known "last second."

## Prior Art and Research

### Curation Markets and Token Curated Registries (TCRs)

Simon de la Rouviere introduced **curation markets** in 2017 — bonding curves where staking tokens on content creates a price signal for quality. Token Curated Registries (TCRs) extended this with challenge/voting mechanisms.

**Known TCR failure modes:**
- **Plutocracy** — large token holders dominate curation decisions
- **Apathy** — most token holders don't bother to participate in challenges
- **Fake curation signals** — staking doesn't necessarily correlate with genuine quality assessment
- **No incentive for accuracy** — TCR voters are rewarded for agreeing with the majority, not for being right

**Lesson for this design:** The pricing curve must make it *expensive* to vote with the majority and *rewarding* to provide new information. Settlement must reference something beyond pure vote tally.

### Logarithmic Market Scoring Rule (LMSR)

Robin Hanson's LMSR is the most theoretically sound mechanism for this design pattern. It was designed specifically for prediction/information markets.

**Cost function (binary outcome — quality vs. not quality):**

```
C(q_up, q_down) = b * ln(exp(q_up / b) + exp(q_down / b))
```

**Price of a "quality" share:**

```
p_up = exp(q_up / b) / (exp(q_up / b) + exp(q_down / b))
```

This is a **softmax function**. The parameter `b` (liquidity) controls sensitivity:
- **Large b** — thick market, prices move slowly, harder to manipulate but less responsive
- **Small b** — thin market, prices move quickly, more responsive but more volatile

**Critical properties:**
- **Bounded market maker loss:** The maximum subsidy required is `b * ln(2)`. This is the protocol's worst-case cost per content item.
- **Quadratic manipulation cost:** Moving the price by `delta` costs approximately `b * delta^2 / 2`. A 2x larger manipulation costs 4x as much.
- **Natural early-mover advantage:** Shares bought when the price is low (early contrarian) cost less and pay out more if correct.

**Example with b = 100:**
| Action | Price Before | Price After | Cost |
|--------|-------------|-------------|------|
| Move rating from 50% to 60% | 0.50 | 0.60 | ~10.1 cREP |
| Move rating from 60% to 70% | 0.60 | 0.70 | ~12.4 cREP |
| Move rating from 70% to 80% | 0.70 | 0.80 | ~16.1 cREP |
| Move rating from 80% to 90% | 0.80 | 0.90 | ~24.8 cREP |
| Move rating from 90% to 95% | 0.90 | 0.95 | ~30.5 cREP |

The cost increases superlinearly as the rating approaches extremes. This is exactly the "risk increases for followers" property we want.

### Parimutuel Markets and Timing Research

Ottaviani & Sorensen (2006) studied "The Timing of Parimutuel Bets" and found that **informed bettors strategically wait until the last moment** in fixed-deadline parimutuel markets. Nearly 40% of the wagering pool arrives in the final minute of horse racing betting windows.

**Key finding:** When settlement time is known, rational actors delay to maximize information advantage. Random settlement breaks this dynamic by making delay costly — each moment you wait, there's a probability `p` that settlement occurs and you miss the epoch entirely.

### Wisdom of Crowds (Surowiecki)

For crowd aggregation to produce accurate results, four conditions must hold:

1. **Diversity of opinion** — participants have heterogeneous information
2. **Independence** — individual judgments aren't influenced by others
3. **Decentralization** — no central authority determines the outcome
4. **Aggregation** — a mechanism exists to combine individual signals

Public voting **violates independence** (voters see each other's votes). However, the LMSR pricing mechanism compensates: even though votes are visible, the cost structure makes herding unprofitable. The mechanism provides **incentive-based independence** rather than information-based independence.

### Ocean Protocol Lessons

Ocean Protocol's curation staking V1-V3 used bonding curves (AMM pools) for data quality curation. They encountered:
- Impermanent loss for curators
- Rug-pull risk from publishers
- Fake curation signals

They eventually migrated to vote-escrow (veOCEAN) model. **Lesson:** Bonding curves alone are insufficient — the settlement/resolution mechanism matters as much as the pricing mechanism.

## Mechanism Design

### Rating Model

Each content item has a **rating** that evolves based on votes:

```
rating(t) = softmax(q_up(t), q_down(t))
          = exp(q_up / b) / (exp(q_up / b) + exp(q_down / b))
```

where `q_up` and `q_down` are the cumulative effective stake on each side, and `b` is the liquidity parameter.

- **Rating = 0.5** means equal conviction on both sides (neutral)
- **Rating > 0.5** means net positive quality signal
- **Rating < 0.5** means net negative quality signal

When a voter stakes `s` cREP and votes UP:

```
q_up_new = q_up + s
cost = C(q_up + s, q_down) - C(q_up, q_down)
     = b * ln(exp((q_up + s)/b) + exp(q_down/b)) - b * ln(exp(q_up/b) + exp(q_down/b))
```

The voter receives "UP shares" proportional to their stake, purchased at the current price.

### Vote Mechanics

**When a voter votes:**
1. Voter stakes `s` cREP (between `MIN_STAKE` and `MAX_STAKE`)
2. Voter chooses direction: UP or DOWN
3. The contract computes the current price `p` for that direction
4. Voter receives `shares = s / p` shares of that direction
5. Rating updates immediately based on new `q_up` or `q_down`

**What the voter receives at settlement:**
- If their direction matches the "correct" outcome: `payout = shares * 1.0` (each share pays 1 unit)
- If their direction is "incorrect": `payout = 0` (shares are worthless)

**Profit = payout - cost.** Since early voters buy shares at lower prices, their profit is higher.

### Epoch Structure

Each content item has an active **epoch** during which votes accumulate.

**Epoch lifecycle:**
```
1. OPEN — First vote on content creates a new epoch
2. ACTIVE — Votes accumulate, rating moves with each vote
3. SETTLEMENT — Random trigger fires, epoch settles
4. NEW EPOCH — A new epoch starts immediately (content retains its rating)
```

### Random Settlement

Settlement is triggered probabilistically. Two approaches:

#### Option A: Per-Block Geometric Distribution (Memoryless)

Each block has independent probability `p` of triggering settlement:

```
Pr(settlement at block k) = p * (1-p)^(k-1)
E[epoch_length] = 1/p blocks
```

**Memoryless property:** `Pr(settle next block | not settled yet) = p` (constant).

This means there is literally no information about when settlement will occur — the next block is always equally likely to be the last.

**Pros:** Perfectly eliminates timing games.
**Cons:** Can produce very short or very long epochs. No guaranteed minimum voting period.

#### Option B: Increasing Hazard Rate (Recommended)

The probability of settlement starts low and increases over time:

```
h(t) = base_rate + growth_rate * max(0, t - min_blocks)
```

**Implementation:**
```solidity
function settlementProbability(uint256 blocksElapsed) public pure returns (uint256) {
    if (blocksElapsed < MIN_EPOCH_BLOCKS) return 0;
    if (blocksElapsed >= MAX_EPOCH_BLOCKS) return 10000; // 100% — forced settlement

    uint256 elapsed = blocksElapsed - MIN_EPOCH_BLOCKS;
    uint256 prob = BASE_RATE_BPS + elapsed * GROWTH_RATE_BPS;
    return prob > 10000 ? 10000 : prob;
}
```

**Example parameters:**
| Parameter | Value | Meaning |
|-----------|-------|---------|
| `MIN_EPOCH_BLOCKS` | 100 | ~20 min on L2, guaranteed minimum voting window |
| `MAX_EPOCH_BLOCKS` | 1500 | ~5 hours, forced settlement |
| `BASE_RATE_BPS` | 50 | 0.5% chance per block after minimum |
| `GROWTH_RATE_BPS` | 5 | +0.05% per block (probability grows linearly) |

**Expected epoch length:** ~250-400 blocks (~50-80 minutes) with this configuration.

**Properties:**
- Nobody can predict settlement timing
- Early in the epoch, settlement is unlikely (gives time for votes to accumulate)
- Late in the epoch, settlement becomes very likely (prevents endless epochs)
- Maximum duration provides a hard cap

#### Settlement Trigger Mechanism

Settlement doesn't happen automatically — it requires a transaction. Anyone can call `trySettle()`:

```solidity
function trySettle(uint256 contentId) external {
    Epoch storage epoch = epochs[contentId];
    require(!epoch.settled, "already settled");

    uint256 elapsed = block.number - epoch.startBlock;
    uint256 prob = settlementProbability(elapsed);

    // Use block randomness to determine settlement
    uint256 rand = uint256(keccak256(abi.encodePacked(block.prevrandao, contentId, epoch.id)));

    if (rand % 10000 < prob) {
        _settle(contentId);
        emit EpochSettled(contentId, epoch.id, block.number);
    }
}
```

**Who calls trySettle?**
- A keeper bot (much simpler than the current keeper — no tlock, no drand, just periodic `trySettle()` calls)
- Any interested user
- Could be called within the `vote()` function itself (each vote checks if settlement should trigger)

**Calling within vote()** is particularly elegant: each vote itself has a chance of triggering settlement. This means:
- No separate keeper is needed for settlement triggering
- The more votes there are, the more settlement checks occur
- There's a natural tension: do you vote and risk triggering settlement, or wait and risk someone else triggering it?

### Settlement Reference: TWAP

To prevent last-second manipulation, settlement uses a **Time-Weighted Average Price (TWAP)** rather than the instantaneous rating:

```
TWAP = sum(rating_i * duration_i) / total_duration
```

**Implementation:**
```solidity
struct TWAPState {
    uint256 cumulativeRating;  // sum of (rating * blocks_at_that_rating)
    uint256 lastUpdateBlock;
    int256 lastRating;         // rating in basis points (5000 = 0.50)
}

function _updateTWAP(uint256 contentId, int256 newRating) internal {
    TWAPState storage state = twap[contentId];
    uint256 elapsed = block.number - state.lastUpdateBlock;
    state.cumulativeRating += uint256(state.lastRating) * elapsed;
    state.lastRating = newRating;
    state.lastUpdateBlock = block.number;
}

function _settlementRating(uint256 contentId) internal view returns (int256) {
    TWAPState storage state = twap[contentId];
    uint256 elapsed = block.number - state.lastUpdateBlock;
    uint256 cumulative = state.cumulativeRating + uint256(state.lastRating) * elapsed;
    uint256 totalBlocks = block.number - epochs[contentId].startBlock;
    return int256(cumulative / totalBlocks);
}
```

**Effect:** A whale who votes large at the last moment barely moves the TWAP. To meaningfully affect the TWAP, they'd need to maintain a manipulated rating for a significant fraction of the epoch.

### What "Correct Direction" Means

At settlement, we need to determine which side wins. Two options:

#### Option 1: Direction Relative to Epoch Start Rating

The "correct" direction is determined by comparing the TWAP at settlement to the rating at epoch start:

```
if TWAP_at_settlement > rating_at_epoch_start:
    UP voters win, DOWN voters lose
else if TWAP_at_settlement < rating_at_epoch_start:
    DOWN voters win, UP voters lose
else:
    Draw — all stakes returned
```

**Pros:** Simple, objective, doesn't depend on external oracle.
**Cons:** This is a Schelling point game — voters are rewarded for predicting what other voters will do, not for assessing content quality.

#### Option 2: Direction Relative to Long-Term Average

Compare the TWAP to a longer-term rolling average across multiple epochs:

```
if TWAP_this_epoch > long_term_average:
    Epoch result = UP
else:
    Epoch result = DOWN
```

**Pros:** Anchors to a more stable reference. Harder to manipulate a long-term average.
**Cons:** Introduces path dependency. Early epochs have no reference.

#### Option 3: Pure Parimutuel (No "Correct" Side)

This is the simplest interpretation that matches the original proposal most closely:

At settlement, the rating's **final position** determines the outcome. Voters who voted in the direction the rating ultimately moved earn rewards from those who voted the opposite direction.

Concretely: if the rating went UP on net during the epoch, UP voters split the DOWN voters' stakes (proportional to their shares). Vice versa if rating went DOWN.

```
net_direction = q_up_final - q_up_initial vs q_down_final - q_down_initial
if net UP votes dominated: UP shares pay out, DOWN shares are worthless
if net DOWN votes dominated: DOWN shares pay out, UP shares are worthless
```

But because shares were purchased at different prices via LMSR, early contrarian voters get more shares per unit staked, earning proportionally more.

**This is the recommended approach.** It's a pure coordination/prediction game, but the LMSR pricing prevents the standard pathologies (herding, whale domination).

### Reward Distribution

Under LMSR, rewards distribute naturally:

1. **Winning side's shares pay out 1 unit each**
2. **Each voter's profit = (shares * 1.0) - cost_of_shares**
3. **Earlier voters on the winning side paid less per share, so they profit more**

**Formal payout:**

For a voter who bought `n` shares of the winning direction at average price `p_avg`:
```
payout = n * 1.0
cost = n * p_avg
profit = n * (1.0 - p_avg)
```

The protocol's subsidy/deficit:
```
protocol_subsidy = total_winning_payout - total_losing_stakes
```

Under LMSR, this is bounded by `b * ln(2)`. The protocol can prefund this from treasury or treat it as a cost of running the curation system.

Alternatively, to make the system zero-sum (no protocol subsidy needed):

**Parimutuel LMSR hybrid:**
```
winning_pool = total_losing_stakes (what the losers put in)
payout_per_share = winning_pool / total_winning_shares
voter_payout = voter_shares * payout_per_share
```

This distributes all losing stakes to winners, proportional to shares. Early contrarian voters still benefit because they acquired more shares per cREP staked.

## Game-Theoretic Analysis

### Nash Equilibrium

**Proposition: Under LMSR pricing with random settlement, truthful voting is a Bayesian Nash Equilibrium.**

**Intuition:** Each vote is effectively a bet. Buying a "quality" share at price `p` has expected profit:

```
E[profit] = Pr(quality) * 1 - p
```

This is positive only if `Pr(quality) > p`. A rational voter buys when their private belief exceeds the market price. This is truthful revelation.

**Critical caveat:** This holds when the settlement outcome is determined by **true quality** (or a sufficiently accurate proxy). In the parimutuel variant (Option 3 above), the outcome is determined by collective action, which introduces coordination game dynamics. However, the LMSR pricing curve still makes it expensive to coordinate on the "wrong" answer, because doing so requires sustained capital at increasing cost.

### Herding Resistance

Traditional wisdom of crowds theory (Surowiecki) requires independence — voters shouldn't see each other's votes. Public voting violates this.

**However, LMSR provides a substitute mechanism:**

| Traditional crowd wisdom | LMSR-based curation |
|--------------------------|---------------------|
| Independence: can't see others' votes | Pricing: expensive to follow the crowd |
| Diversity: heterogeneous information | Contrarian incentive: cheap to disagree |
| Aggregation: mechanism to combine | Market price: continuous aggregation |

The LMSR curve creates **incentive-based independence**: even though you *can* see how others voted, the cost structure makes it *irrational* to blindly follow. Following the crowd means buying expensive shares with low expected returns.

### Whale Manipulation

**Scenario:** A whale with budget `W >> average_stake` votes first to set direction.

**Under LMSR:**
- The whale moves the price from `p_0` to `p_1`, spending approximately `b * (p_1 - p_0)^2 / 2`
- If the whale is wrong, informed voters will move the price back, and the whale's shares become worthless
- If the whale is right, they profit — but this is desirable (they provided genuine information)
- The whale's break-even requires their belief `Pr(quality) > p_1` (the post-purchase price)

**Result:** LMSR naturally punishes uninformed manipulation. A whale pushing the price away from truth loses money proportional to the distance.

**Remaining risk:** If most other voters are unsophisticated and follow the whale (herding), the whale profits. This is mitigated by:
1. The LMSR cost structure (following gets expensive)
2. Sybil-resistant identity (each Voter ID is one human — existing in Curyo)
3. Optional: quadratic staking (effective_stake = sqrt(raw_stake)) to cap whale influence

### Last-Mover Problem

Even with random settlement, late voters have more information. Is this a problem?

**With geometric stopping (probability `p` per block):**

The value of waiting `k` more blocks:
```
E[wait_k] = (1-p)^k * E[profit_with_info | unsettled]
```

Each block of delay discounts the value of new information by factor `(1-p)`. For `p = 0.005` (0.5% per block):
- Wait 10 blocks: value = 95% of full information value
- Wait 50 blocks: value = 78%
- Wait 100 blocks: value = 61%
- Wait 200 blocks: value = 37%

This creates a natural **time value of voting**. Waiting is costly because you might miss the epoch entirely.

**With increasing hazard rate:** The cost of waiting accelerates over time, creating even stronger incentives to vote promptly.

## Comparison with Current System

| Property | Current (tlock commit-reveal) | Proposed (public + random settlement) |
|----------|-------------------------------|---------------------------------------|
| Vote privacy | Full (tlock encrypted) | None (votes are public) |
| Herding prevention | Cryptographic (can't see votes) | Economic (expensive to follow) |
| Infrastructure | tlock + drand + keeper | Simple keeper (or self-settling) |
| Transactions per vote | 1 (commit) + 1 (reveal) | 1 |
| UX complexity | High (encryption, reveal wait) | Low (stake and vote, see impact) |
| Settlement timing | Fixed (epoch end) | Random (unpredictable) |
| Continuous price discovery | No (votes hidden until reveal) | Yes (rating updates live) |
| On-chain randomness need | drand (off-chain) | RANDAO or VRF (simpler) |
| Keeper role | Decrypt + reveal + settle | Trigger settlement check |
| First-mover disadvantage | Addressed by epoch duration | Addressed by pricing curve |
| Game theory foundation | Schelling point + privacy | LMSR + random stopping |
| Protocol subsidy needed | No (pure redistribution) | `b * ln(2)` per content item per epoch, OR zero with parimutuel variant |

## Implementation Considerations

### Randomness Source

**Recommended: `block.prevrandao` (RANDAO)**

- Free (no gas overhead beyond the keccak256 hash)
- Available on all post-merge EVM chains
- 1-bit bias risk is negligible for content rating settlement (unlike high-value DeFi)
- No external dependencies

**Fallback: Chainlink VRF** for chains without reliable RANDAO or if stronger guarantees are needed. Higher cost (~$0.25-$2 per request).

### Liquidity Parameter `b`

The `b` parameter is the most important tuning knob:

| `b` value | Market maker max loss | Cost to move 50%→90% | Character |
|-----------|----------------------|----------------------|-----------|
| 10 | 6.9 cREP | ~16 cREP | Very responsive, volatile |
| 50 | 34.6 cREP | ~80 cREP | Moderate |
| 100 | 69.3 cREP | ~161 cREP | Stable, requires conviction |
| 500 | 346 cREP | ~803 cREP | Very stable, whale-resistant |

`b` could be:
- **Fixed globally** (simplest)
- **Per-content based on history** (more votes → higher b → more stable rating)
- **Governance-controlled** (DAO sets optimal b)

### What Happens to Existing Components

| Component | Current Role | New Role |
|-----------|-------------|----------|
| tlock encryption | Hide vote directions | **Removed** |
| drand integration | Timelock encryption target | **Removed** (unless used for randomness) |
| Keeper service | Decrypt + reveal + settle | **Simplified:** call `trySettle()` periodically |
| `RoundVotingEngine.sol` | Commit-reveal rounds | **Rewritten:** LMSR pricing + random settlement |
| `commitVote()` | Hash commitment | **Replaced** by `vote(contentId, direction, stake)` |
| `revealVote()` | Tlock decryption + verify | **Removed** |
| `settleRound()` | Count reveals, distribute | **Modified:** settle based on TWAP, distribute per shares |
| Frontend vote flow | Encrypt → commit → wait → reveal | **Simplified:** choose direction → stake → see impact |

### Self-Settling Design (No Keeper Needed)

The most elegant implementation embeds settlement checks within the vote function:

```solidity
function vote(uint256 contentId, bool isUp, uint256 stake) external {
    // First, check if the current epoch should settle
    _trySettle(contentId);

    // If epoch just settled, this vote goes into a new epoch
    Epoch storage epoch = _getOrCreateEpoch(contentId);

    // Execute vote via LMSR
    uint256 shares = _executeVote(epoch, isUp, stake);

    // Check again (this vote might trigger settlement!)
    _trySettle(contentId);

    emit Voted(contentId, msg.sender, isUp, stake, shares);
}
```

This means **every vote has a chance of immediately settling the epoch**, including its own. The voter doesn't know if their vote will be the one that triggers settlement. This creates maximum unpredictability.

## Open Questions

### 1. Parimutuel vs. Subsidized LMSR

**Parimutuel (zero-sum):** Losing stakes fund winning payouts. No protocol subsidy needed. But payout depends on how much the other side staked — could be very high or very low.

**Subsidized LMSR:** Protocol guarantees payouts. Bounded loss of `b * ln(2)` per epoch. More predictable for voters but requires treasury funding.

**Hybrid:** Protocol subsidizes a minimum payout rate, losing stakes provide the rest.

### 2. Cross-Epoch Rating Persistence

Does the rating reset to 0.5 each epoch? Or does it carry over?

**Reset each epoch:** Clean slate. Every epoch is independent. Simpler to reason about.

**Carry over:** Rating accumulates over time. Established content has a "reputation" that's hard to move. More like the current system where content builds rating across rounds.

**Recommendation:** Carry the rating over, but reset the LMSR share pools each epoch. The rating is persistent; the betting is per-epoch.

### 3. Minimum Voters Per Epoch

Should epochs require a minimum number of voters to settle? Currently, Curyo requires 3 revealed votes.

**Yes (minimum N):** Prevents settlement with a single vote. More robust consensus signal.
**No (settle anytime):** Simpler. If only one person voted and settlement triggers, they're exposed to maximum risk with no counterparty — they might win everything or lose everything.

**Recommendation:** Require at least 2 voters on opposite sides for settlement. If settlement triggers with insufficient participation, extend the epoch (defer settlement check).

### 4. What Happens to the Rating Display

With the current system, content has a stable rating between rounds. With continuous LMSR, the rating fluctuates in real-time.

**Options:**
- Show the live LMSR price as the rating (most transparent, but volatile)
- Show the TWAP (smoother, less gameable display)
- Show a blended score: 80% long-term average + 20% current epoch LMSR (stable but responsive)

### 5. Interaction with Voter IDs and Sybil Resistance

The current sybil-resistance (one Voter ID per verified human) remains important. With public voting, it also prevents:
- Splitting stakes across identities to game quadratic staking (if implemented)
- Creating wash trades (voting both sides to manipulate TWAP)
- Claiming multiple early-mover positions

### 6. Fixed-Point Math for LMSR On-Chain

LMSR requires `exp()` and `ln()` operations, which aren't native to the EVM. Implementation options:
- **PRBMath or Solady** fixed-point math libraries (exp, ln with 18-decimal precision)
- **Lookup tables** for common ranges (less precise but cheaper gas)
- **Approximations** (Taylor series truncated at sufficient precision)

Gas cost estimate: ~5,000-15,000 gas per vote for LMSR computation, which is acceptable.

## Advantages

| Property | Benefit |
|----------|---------|
| Dramatic simplification | Remove tlock, drand, keeper reveal logic, commit-reveal pattern |
| Single-transaction voting | Better UX, lower gas, no need to return for reveal |
| Continuous price discovery | Users see real-time quality signals |
| Self-settling | No dedicated keeper needed for triggering settlement |
| Natural contrarian incentive | LMSR makes disagreement profitable, agreement expensive |
| Proven game theory | LMSR is the gold standard for information aggregation markets |
| Lower infrastructure cost | No drand dependency, simpler keeper, no encryption |

## Disadvantages and Risks

### 1. Loss of Vote Privacy

The most significant tradeoff. Public votes mean:
- Social pressure can influence voting (fear of being seen voting against popular content)
- Targeted retaliation against contrarian voters (if identities are known)
- Sophisticated actors can model voter behavior from observed patterns

**Mitigation:** The LMSR cost structure makes following the crowd unprofitable, providing *economic* privacy protection even without cryptographic privacy.

### 2. Front-Running (MEV)

On public mempools, MEV searchers could see pending votes and front-run:
- See a large contrarian vote coming
- Place their own contrarian vote first (at a better price)
- The original voter gets a worse price

**Mitigation:**
- L2s with private/sequenced mempools (e.g., Optimism sequencer, Arbitrum)
- Maximum slippage parameter on votes (revert if price moved too much since submission)
- Flashbot-style private submission

### 3. Keynesian Beauty Contest Risk

If settlement is based on collective action rather than ground truth, the game becomes "predict what others will predict" rather than "assess quality." This can lead to:
- Self-fulfilling prophecies (early whale sets direction, everyone follows because "that's what will win")
- Disconnection from actual content quality

**Mitigation:**
- The LMSR cost curve makes herding expensive
- Random settlement prevents coordination on timing
- Cross-epoch rating persistence anchors expectations
- Long term: could introduce external quality oracles as additional settlement inputs

### 4. Protocol Subsidy (LMSR Variant)

Under pure LMSR, the protocol must subsidize up to `b * ln(2)` per content item per epoch. For `b = 100`, that's ~69 cREP per epoch.

**Mitigation:** Use the parimutuel variant (zero-sum redistribution) or hybrid approach where protocol subsidy is minimal.

### 5. Complexity of LMSR Math On-Chain

Fixed-point exponential and logarithm operations add gas cost and audit surface.

**Mitigation:** Well-audited libraries (PRBMath, Solady) handle this. Gas cost is manageable on L2.

## References

- Hanson, R. (2003). ["Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation"](https://mason.gmu.edu/~rhanson/mktscore.pdf). George Mason University.
- Ottaviani, M. & Sorensen, P.N. (2006). ["The Timing of Parimutuel Bets"](https://web.econ.ku.dk/sorensen/papers/TheTimingofParimutuelBets.pdf). University of Copenhagen.
- Surowiecki, J. (2004). *The Wisdom of Crowds*. Doubleday.
- Buterin, V. (2021). ["Moving Beyond Coin Voting Governance"](https://vitalik.eth.limo/general/2021/08/16/voting3.html).
- de la Rouviere, S. (2017). "Curation Markets" — bonding curves for content curation.
- McConaghy, T. (2020). ["On Staking on Data in Ocean Market"](https://blog.oceanprotocol.com/on-staking-on-data-in-ocean-market-3d8e09eb0a13). Ocean Protocol.
- [Cultivate Labs: How LMSR Works](https://www.cultivatelabs.com/crowdsourced-forecasting-guide/how-does-logarithmic-market-scoring-rule-lmsr-work)
- [Zeitgeist: Rikiddo Scoring Rule](https://medium.com/zeitgeistseer/introducing-zeitgeists-rikiddo-scoring-rule-89c8222e31c) — LMSR variant for prediction markets.
