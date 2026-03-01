# Public Vote + Random Settlement — Design Document

## Problem Statement

Curyo's current tlock commit-reveal system ensures vote privacy within epochs, preventing herding and information cascading. However, it introduces significant complexity:

- **tlock encryption** — each vote requires timelock encryption to a future drand round
- **Keeper infrastructure** — a dedicated keeper service must reveal votes via drand beacons
- **drand dependency** — the system relies on an external distributed randomness beacon
- **Two-phase UX** — voters cannot see their vote's impact until the reveal phase
- **Reveal failures** — voters who don't return to reveal lose their stake (UX friction)

This document explores an alternative: **public voting with immediate rating impact and random settlement timing**.

## Core Idea in Plain Language

1. You see content. You vote UP or DOWN and stake cREP.
2. Your vote **immediately moves the content's rating**. Everyone can see it.
3. But here's the catch: **the more people have already voted the same direction, the less you stand to gain** — and the more you risk. The 4th person voting UP earns far less than the 1st.
4. Nobody knows when the epoch will settle. It could be the next block or two hours from now. At settlement, one side wins and the other loses.
5. **If the rating ended up higher than where it started**, UP voters win. DOWN voters' stakes are redistributed to UP voters — with early and contrarian voters receiving the largest share.

This creates a self-correcting dynamic: following the crowd is expensive and risky, going against it is cheap and potentially very rewarding. You don't need hidden votes to prevent herding — the economics prevent it.

## Voter Experience

### What a Voter Sees

```
┌─────────────────────────────────────────────────────┐
│  "Why Rust's Borrow Checker Is Brilliant"           │
│                                                     │
│  Rating: ████████░░ 73/100  (epoch start: 50)       │
│  Epoch: Active · 47 min elapsed · 8 votes           │
│                                                     │
│  Current positions:                                 │
│    UP:   6 votes · 142 cREP total stake             │
│    DOWN: 2 votes · 38 cREP total stake              │
│                                                     │
│  Your potential reward if you vote now:              │
│    UP:   ~0.3x return (crowded — low reward)        │
│    DOWN: ~2.8x return (contrarian — high reward)    │
│                                                     │
│  ┌──────────┐  ┌───────────┐                        │
│  │  VOTE UP  │  │ VOTE DOWN │   Stake: [10] cREP    │
│  └──────────┘  └───────────┘                        │
└─────────────────────────────────────────────────────┘
```

### What Decisions a Voter Makes

1. **Direction:** UP or DOWN. Based on their assessment of content quality.
2. **Stake amount:** Between `MIN_STAKE` and `MAX_STAKE`. Higher stake = more shares, more risk, more reward.
3. **Timing:** Vote now (secure a position, but with current info) or wait (more info, but risk missing the epoch or getting a worse price).

### What Happens After Voting

- The rating updates instantly — the voter sees their impact.
- Their position is locked until settlement. No cancellation, no changing sides.
- Settlement can happen at any time. When it does, rewards are automatically calculated and distributed. The voter doesn't need to return (unlike the current reveal step).

## Mechanism Design

### Rating Model

Each content item has a rating between 0 and 100, derived from the balance of UP and DOWN stakes in the current epoch:

```
rating = 50 + 50 * (q_up - q_down) / (q_up + q_down + b)
```

where `q_up` and `q_down` are the effective cumulative stakes on each side and `b` is the liquidity parameter that controls sensitivity. When `q_up = q_down = 0` (no votes), the rating stays at its starting value.

**Alternative: LMSR-based rating.** The rating can also be computed via Robin Hanson's Logarithmic Market Scoring Rule, which gives a softmax function:

```
rating_normalized = exp(q_up / b) / (exp(q_up / b) + exp(q_down / b))
```

LMSR has stronger theoretical properties (bounded market maker loss, proper scoring rule, proven truthful equilibrium). The tradeoff is on-chain exp/ln computation via fixed-point math libraries (Solady, PRBMath). Both approaches produce the same qualitative behavior — the choice is an implementation decision.

### How Votes Move the Rating

The key property: **each additional vote in the same direction has diminishing marginal impact on the rating, but increasing marginal cost in terms of risk/reward ratio.**

**Concrete example (b = 100):**

| Voter | Direction | Stake | Rating Before | Rating After | Potential Return |
|-------|-----------|-------|---------------|--------------|------------------|
| Alice | UP | 10 cREP | 50 | 55 | ~1.8x if UP wins |
| Bob | UP | 10 cREP | 55 | 59 | ~1.4x if UP wins |
| Carol | UP | 10 cREP | 59 | 62 | ~1.1x if UP wins |
| Dave | DOWN | 10 cREP | 62 | 58 | ~2.5x if DOWN wins |
| Eve | UP | 10 cREP | 58 | 61 | ~1.2x if UP wins |

Alice took the most risk (voted first, least information) and gets the best return if correct. Carol gets a thin margin because she followed an established trend. Dave, the contrarian, gets a large potential return because he's going against 3 prior UP voters.

This is the core incentive: **the market rewards information, not agreement.**

### Shares and Payouts

Under the hood, each vote purchases "shares" at the current market price:

```
shares_received = stake / current_price_for_direction
```

The current price for a direction is its implied probability:
```
price_UP = q_up / (q_up + q_down + b)   (simplified model)
```

Early voters buy at low prices (many shares per cREP). Late followers buy at high prices (few shares per cREP). At settlement, winning shares split the losing pool proportionally.

**Payout formula (parimutuel — zero-sum):**
```
losing_pool = sum of all losing-side stakes
payout_per_winning_share = losing_pool / total_winning_shares
voter_payout = voter_shares * payout_per_winning_share
voter_profit = voter_payout - voter_original_stake
```

This means:
- **No protocol subsidy needed.** Losers fund winners. The system is fully self-sustaining.
- **Early correct voters profit most.** They hold more shares per unit staked.
- **Late followers on the winning side may barely break even** — they bought expensive shares, and the payout per share may be less than 1.
- **Late followers on the losing side lose their entire stake** — same as the current system.

### What Determines the Winner

At settlement, compare the epoch's final rating to its starting rating:

```
if rating_at_settlement > rating_at_epoch_start:
    UP voters win, DOWN voters lose
else if rating_at_settlement < rating_at_epoch_start:
    DOWN voters win, UP voters lose
else:
    Draw — all stakes returned
```

**Why this is the right choice:**

This is the same fundamental mechanic as the current Curyo system — majority direction wins. The current system counts revealed votes; this system uses the net rating movement. Both are coordination games, not oracle-based truth games.

The common objection is "this is a Keynesian beauty contest — voters predict what others will predict, not actual quality." But this is already true today. Curyo voters are rewarded for being on the majority side, not for agreeing with some external quality oracle. The proposed system doesn't introduce this property — it makes it more transparent and adds a pricing mechanism that penalizes mindless agreement.

**Content quality emerges over time** from the accumulation of many epochs. If a piece of content consistently triggers UP votes across dozens of epochs, its long-term rating reflects genuine collective assessment — the same way a stock price reflects collective valuation despite each trade being a coordination game.

### Edge Cases

**Unanimous votes (all UP, no DOWN):**
There's no losing pool to distribute. Settlement requires at least 1 voter on each side. If the settlement trigger fires but only one side has voters, the epoch extends. This incentivizes contrarian participation — if you see a one-sided epoch, there's an opportunity.

**However:** one-sided epochs can't stay open forever. If `MAX_EPOCH_BLOCKS` is reached with only one side voting, the epoch settles as a **draw** — all stakes returned, no rewards. This prevents indefinite capital lockup. The content retains its current rating and a new epoch begins.

**Single voter:**
Same rule — at least 2 voters with at least 1 on each side. A single voter's epoch stays open until someone takes the other side, or until `MAX_EPOCH_BLOCKS` triggers a draw.

**Very low participation (2 voters, opposite sides):**
This works fine. It's a direct heads-up bet. Both voters get a clear risk/reward picture. The random settlement means neither can time their exit.

**Stale content (no one votes for a long time):**
No epoch is active if no one has voted. The content retains its last settled rating. The existing dormancy marking mechanism (`markDormant`) still applies.

**Rating at exactly 50 at settlement (draw):**
All stakes returned. This should be rare — even a 0.01 difference triggers a winner. For the simplified model, use a small epsilon: `if |rating - epoch_start| < epsilon: draw`.

## Random Settlement

### How It Works

Settlement is triggered probabilistically. Each time the contract is called (via a vote or a dedicated `trySettle` call), it checks whether settlement should occur:

```solidity
function _shouldSettle(uint256 contentId) internal view returns (bool) {
    Epoch storage epoch = epochs[contentId];
    uint256 elapsed = block.number - epoch.startBlock;

    // Phase 1: Grace period — no settlement possible
    if (elapsed < MIN_EPOCH_BLOCKS) return false;

    // Phase 2: Forced settlement — epoch must end
    if (elapsed >= MAX_EPOCH_BLOCKS) return true;

    // Phase 3: Increasing probability
    uint256 window = elapsed - MIN_EPOCH_BLOCKS;
    uint256 prob = BASE_RATE_BPS + window * GROWTH_RATE_BPS;
    if (prob > MAX_PROB_BPS) prob = MAX_PROB_BPS;

    uint256 rand = uint256(keccak256(abi.encodePacked(
        block.prevrandao, contentId, epoch.id, block.number
    )));
    return (rand % 10000) < prob;
}
```

### Parameter Recommendations

| Parameter | Value | Effect |
|-----------|-------|--------|
| `MIN_EPOCH_BLOCKS` | 150 | ~30 min grace period. Votes accumulate before settlement can trigger. |
| `MAX_EPOCH_BLOCKS` | 1800 | ~6 hours hard cap. Prevents indefinite epochs. |
| `BASE_RATE_BPS` | 30 | 0.3% chance per block initially. Low — settlement is unlikely right after grace period. |
| `GROWTH_RATE_BPS` | 3 | +0.03% per block. Probability grows steadily. |
| `MAX_PROB_BPS` | 500 | 5% cap per block. Prevents near-certainty before forced settlement. |

**Expected epoch length with these parameters:** ~300-600 blocks (~1-2 hours), with a guaranteed minimum of 30 minutes and maximum of 6 hours.

**Why increasing hazard rate (not memoryless):**
A pure geometric distribution (constant probability per block) can produce very short epochs (settling at block 151, just after the grace period). The increasing hazard rate means:
- Right after the grace period: settlement is very unlikely (0.3%)
- After 1 hour: probability has climbed to ~1.5% per block
- After 3 hours: ~3% per block, settlement is imminent
- At 6 hours: forced

This gives content enough time to attract voters while maintaining unpredictability.

### Who Triggers Settlement

**Option A: Embedded in vote() (Recommended)**

Each vote checks for settlement before executing:

```solidity
function vote(uint256 contentId, bool isUp, uint256 stake) external {
    // Check if the current epoch should settle
    if (_shouldSettle(contentId) && _hasMinimumParticipation(contentId)) {
        _settle(contentId);
    }

    // Get or create epoch (new epoch if previous just settled)
    Epoch storage epoch = _getOrCreateEpoch(contentId);

    // Execute the vote
    _executeVote(epoch, msg.sender, isUp, stake);
}
```

Note: settlement is checked **before** the vote, not after. This means the voter's own vote does not trigger settlement on itself — it goes into the current (or new) epoch cleanly. Settlement is triggered by the *randomness of the block* the voter happens to transact on.

**Option B: Separate trySettle() for keeper/anyone**

A simpler keeper that just calls `trySettle(contentId)` for all active epochs periodically. This is much simpler than the current keeper — no tlock decryption, no drand monitoring.

**Recommended: Both.** Embed the check in `vote()` for self-settling, AND expose `trySettle()` for a lightweight keeper to catch epochs where voting has stalled but settlement should occur.

### Randomness Source

**Recommended: `block.prevrandao` (RANDAO)**

- Free — no gas overhead beyond a keccak256 hash
- Available on all post-merge EVM chains and L2s
- The 1-bit bias risk (a validator can choose to skip their block) is negligible for content rating settlement. This isn't DeFi liquidation or lottery — the stakes per epoch are bounded.

**When to use Chainlink VRF instead:**
- On chains without reliable RANDAO
- If total epoch stake pools regularly exceed ~1 ETH in value (where validator manipulation becomes rational)

### Can Validators/Sequencers Game Settlement Timing?

On L2s with a single sequencer (Optimism, Arbitrum, Base):
- The sequencer sees pending transactions and knows `block.prevrandao`
- It could theoretically delay or reorder transactions to influence settlement timing

**Why this is acceptable:**
- The sequencer doesn't know individual voters' positions (they'd need to track all historical votes)
- Even if it delays settlement by a few blocks, the epoch's outcome is determined by accumulated votes over 1-2 hours — a few blocks don't change much
- The sequencer has no financial incentive (they don't hold cREP positions)
- If this becomes a concern, Chainlink VRF provides stronger guarantees

## TWAP: Needed or Not?

The original draft proposed Time-Weighted Average Price (TWAP) for settlement. After reflection:

**TWAP is NOT recommended for the initial design.**

**Why not:**
- Random settlement already eliminates the known-deadline problem that TWAP solves. There is no "last second" to manipulate.
- TWAP adds storage and gas costs (cumulative tracking on every vote).
- TWAP makes the mechanism harder for voters to reason about — "where is the TWAP?" is much less intuitive than "where is the rating?"

**When TWAP would matter:**
- If a whale can see that settlement is about to trigger (because they can see `block.prevrandao` for the current block), they could submit a last-second vote to flip the direction. On most L2s, this requires sequencer-level access.
- If this attack vector proves real in practice, TWAP can be added later as a hardening measure.

**Simpler alternative defense:** Use the rating as of `block.number - 1` for settlement (one-block delay). This makes within-block manipulation impossible at near-zero cost.

## Cross-Epoch Rating Persistence

**The rating carries over across epochs. The share pools reset.**

When an epoch settles:
1. Winning/losing sides are determined
2. Stakes are redistributed
3. All share positions are cleared
4. A new epoch begins with:
   - **Starting rating = final rating of the previous epoch**
   - `q_up = 0`, `q_down = 0` (fresh share pools)
   - The displayed rating stays at its current value

This means:
- Content builds a reputation over time through many epochs
- Each epoch is an independent betting round — you're wagering on whether the rating moves UP or DOWN from *here*
- The long-term rating is the accumulated result of many epochs, similar to how a stock price accumulates through many trading sessions

**First epoch for new content:** Rating starts at 50 (neutral). The first epoch determines the initial direction.

## Game-Theoretic Analysis

### Why the Pricing Curve Replaces Vote Privacy

The standard argument against public voting comes from Surowiecki's *Wisdom of Crowds*: independent judgment requires that voters cannot see each other's votes. Public voting creates information cascades and herding.

**LMSR pricing inverts this logic.** In traditional public voting (Reddit, HN), agreement is free. In LMSR, agreement is expensive:

| System | See others' votes? | Cost to agree with majority | Result |
|--------|-------------------|----------------------------|--------|
| Reddit | Yes | Free (click arrow) | Herding, echo chambers |
| Curyo (current) | No (tlock) | Fixed stake | Independent judgment |
| Curyo (proposed) | Yes | **Increasing** (more stake for same shares) | **Economic independence** |

The proposed system doesn't need information hiding because the cost structure provides the same incentive: **vote your genuine belief, not the crowd's belief.** If you disagree with the current direction, it's *cheap and profitable* to say so. If you agree, it's *expensive and low-margin* to pile on.

This is a weaker guarantee than cryptographic privacy — a sophisticated whale could still move the market to create a false signal. But Curyo already has sybil-resistant Voter IDs (one per verified human), which limits this attack surface.

### Nash Equilibrium

**Under the parimutuel model, truthful voting is a Bayesian Nash Equilibrium when:**

1. Each voter has a private signal about content quality
2. The crowd's aggregate signal correlates with "correct" assessment (i.e., if most people independently think content is good, it probably is)
3. The pricing mechanism makes it more profitable to vote your true signal than to herd

**Condition 3 is the critical one.** Under LMSR:

A voter who believes content quality is higher than the current rating (price_UP < voter's belief) profits by buying UP shares:

```
E[profit] = Pr(UP wins) * payout_per_share - price_paid
          = Pr(UP wins) / price_UP - 1  (per share)
```

This is positive when `Pr(UP wins) > price_UP`, which is exactly when the voter's belief exceeds the market's current assessment. Truthful voting is profitable; lying is not.

**Caveat:** This assumes voters are rational and understand the mechanism. In practice, many voters will be casual users who may still follow the crowd. The pricing mechanism limits the damage from herding (it's expensive) but doesn't eliminate it.

### Whale Manipulation Resistance

A whale who votes first with a large stake:

1. Moves the rating sharply in one direction
2. Makes that direction expensive for followers (protecting against herding)
3. Makes the opposite direction cheap for contrarians (inviting correction)
4. Is locked in — can't exit before random settlement

**If the whale is right** (content actually is high quality), they profit deservedly — they provided genuine early information.

**If the whale is wrong**, contrarians buy cheap shares on the other side. The whale's shares lose value as the rating corrects. At settlement, the whale loses their stake.

**The key defense is that random settlement prevents the whale from timing their exit.** In a traditional bonding curve (Ocean Protocol style), a whale can buy to pump the price, attract followers, then sell before the price corrects. Here, there's no "selling" — you're locked in until settlement, which could be any time.

### Last-Mover Discount

Late voters have more information (they can see how others voted) but face increasing risk of missing the epoch. Under increasing hazard rate settlement:

| Wait time after grace period | Probability of missing | Information value | Net expected value |
|-----|------|-----|-----|
| 0 blocks | 0% | Low | Medium |
| 100 blocks | ~5% | Medium | Medium-High |
| 300 blocks | ~20% | High | Medium (discounted) |
| 600 blocks | ~50% | Very High | Low (likely missed) |

The optimal strategy is to vote when you have a genuine opinion, not to wait for maximum information. The random settlement creates a **discount rate on information** that naturally incentivizes prompt voting.

## Comparison with Current System

| Property | Current (tlock commit-reveal) | Proposed (public + random settlement) |
|----------|-------------------------------|---------------------------------------|
| Herding prevention | Cryptographic (can't see votes) | Economic (expensive to follow) |
| Transactions per vote | 1 (commit) + 1 (reveal) | **1 (vote)** |
| Need to return later | Yes (reveal phase) | **No** |
| Infrastructure | tlock + drand + keeper (reveal + settle) | **Lightweight keeper (settle only), or self-settling** |
| External dependencies | drand beacon network | **None (RANDAO is in-protocol)** |
| Continuous price signal | No (hidden until reveal) | **Yes (live rating)** |
| Settlement timing | Fixed (epoch end) | **Random (unpredictable)** |
| First-mover protection | Adaptive epoch duration | **LMSR pricing curve** |
| Game theory basis | Schelling point + privacy | **Market mechanism + random stopping** |
| Protocol subsidy needed | No (pure redistribution) | **No (parimutuel redistribution)** |
| On-chain math | Simple (counts, comparisons) | **Moderate (exp/ln or simpler curve)** |

### When Is Commit-Reveal Actually Better?

Public voting with LMSR pricing is **not** strictly better. There are scenarios where the current system wins:

1. **Social pressure environments.** If voters' identities are publicly linked to their addresses, public voting creates social pressure. A community member might not vote DOWN on a friend's content even if they believe it's low quality. Tlock hides this.

2. **Sophisticated adversaries.** A well-funded adversary can model the LMSR curve and compute optimal manipulation strategies. Cryptographic privacy provides a harder guarantee — you literally cannot see the votes.

3. **Very small communities.** With few voters, the LMSR contrarian incentive may be insufficient. If only 5 people ever vote on a piece of content, the pricing curve is too thin to prevent one whale from dominating. In small communities, privacy-based mechanisms are more robust.

4. **High-stakes content.** If a single content item's epoch has very high total stakes, the incentive to manipulate increases. Cryptographic privacy scales its protection with stakes; economic incentives may not.

**Recommendation:** The proposed mechanism is better for the **common case** (moderate participation, moderate stakes, UX matters). The current mechanism is better for **adversarial scenarios** (high stakes, sophisticated attackers, small voter pools). A future version could offer both modes: public voting by default, with commit-reveal available for content that exceeds a stake threshold.

## Implementation Considerations

### On-Chain Math

Two approaches for the pricing curve:

**Option A: LMSR with exp/ln (Most Theoretically Sound)**
- Uses Solady or PRBMath for fixed-point exp() and ln()
- Gas cost: ~5,000-15,000 gas per vote for curve computation
- Bounded market maker loss: `b * ln(2)` (in the subsidized variant)
- Well-studied game theory properties

**Option B: Simplified Linear-With-Dampening (Easier to Implement)**
```solidity
function ratingImpact(uint256 stake, uint256 sameDirectionStake, uint256 b) pure returns (uint256) {
    // Impact diminishes as more stake accumulates on the same side
    return stake * b / (sameDirectionStake + b);
}
```
- No exp/ln needed — pure integer math
- Gas cost: ~500 gas per vote
- Similar qualitative behavior (diminishing returns for followers)
- Weaker theoretical guarantees

**Recommendation:** Start with Option B for simplicity. Upgrade to LMSR if the system needs stronger manipulation resistance.

### Liquidity Parameter `b`

The `b` parameter controls how sensitive the rating is to individual votes:

| `b` value | Character | 10 cREP vote moves rating by... |
|-----------|-----------|----------------------------------|
| 20 | Very responsive | ~4 points (of 100) |
| 50 | Moderate | ~2 points |
| 100 | Stable | ~1 point |
| 500 | Very stable | ~0.2 points |

**Recommendation:** Start with `b = 50`. This means:
- A 10 cREP vote on fresh content (no prior votes) moves the rating ~2 points
- After 100 cREP of UP votes, a 10 cREP UP vote moves it ~0.7 points
- A 10 cREP DOWN vote against that same 100 cREP wall moves it ~1.5 points (contrarian gets more bang)

`b` should be configurable via governance. It may also be useful to scale `b` per content item based on total lifetime vote activity (similar to the adaptive epoch concept in `ADAPTIVE-EPOCH-DESIGN.md`).

### What Gets Built vs. What Gets Dropped

Since no contracts are deployed on mainnet, this is a clean-slate build. No migration logic needed.

**Dropped entirely:**
- tlock encryption (`utils/tlock.ts`, all encryption logic)
- drand integration (beacon monitoring, round targets)
- `revealVote()` and all reveal state management
- `processUnrevealedVotes()` and forfeiture logic
- Keeper reveal pipeline (drand monitoring, ciphertext decryption)
- Commit hash / ciphertext storage
- Adaptive epoch tiers (`ADAPTIVE-EPOCH-DESIGN.md` — replaced by pricing curve)
- WE-BLS dual keeper design (`WE-BLS-DUAL-KEEPER-DESIGN.md` — not needed)

**Rewritten:**
- `RoundVotingEngine.sol` → new contract with pricing curve + random settlement
- `commitVote()` → `vote(contentId, direction, stake)` (single public transaction)
- `settleRound()` → settlement via `_shouldSettle()` probability check
- `useRoundVote.ts` → direct contract call, no encryption
- `useRoundPhase.ts` → track open/settled (no commit/reveal phases)
- Vote UI → live rating display, potential return calculator

**Kept as-is:**
- `ContentRegistry.sol`, `CategoryRegistry.sol`, `CuryoReputation.sol`
- `VoterRegistry.sol` (sybil-resistant Voter IDs)
- `ParticipationPool.sol` (minor wording change only)
- `RoundRewardDistributor.sol` (formula change: shares instead of stakes)
- `RewardMath.sol` (adjust split percentages, share-based calculation)
- Ponder indexer (reindex new events instead of old ones)
- Frontend content/category components

## Tokenomics Impact

No contracts are deployed on mainnet yet, so this is a clean-slate build — not a migration.

### What Stays the Same

| Component | Allocation | Change? |
|-----------|-----------|---------|
| cREP token (100M max supply) | — | No change |
| Faucet pool | 51,899,900 cREP | No change |
| Participation pool | 34,000,000 cREP | Minor: "revealed voters" → "all voters" |
| Treasury | 10,000,000 cREP | No change |
| Keeper reward pool | 100,000 cREP | Reduced scope (no reveal/processUnrevealed) |
| Category registry | 100 cREP | No change |

### What Changes

**1. Consensus Subsidy (4,000,000 cREP) — removed.**

The consensus subsidy exists for unanimous rounds (losingPool = 0). Under the new design, epochs require voters on both sides to settle. One-sided epochs settle as draws (stakes returned). There's never a case where `losingPool = 0` at a normal settlement.

This 4M cREP can be reallocated to the participation pool (extending bootstrap incentives) or kept as governance reserve.

**2. Losing Pool Split — adjusted.**

| Recipient | Current | Proposed |
|-----------|---------|----------|
| Winning voters | 82% | **87%** |
| Content submitter | 10% | 10% |
| Platform fees (frontend + category) | 2% | 2% |
| Treasury | 1% | 1% |
| Consensus subsidy | 5% | **0% (removed)** |

The 5% that went to consensus subsidy is redistributed to winning voters.

**3. Winning Voter Reward Formula — share-weighted instead of stake-weighted.**

Current: `reward = voterPool * voterStake / totalWinningStake`
Proposed: `reward = voterPool * voterShares / totalWinningShares`

Since early/contrarian voters hold more shares per cREP, they get a bigger cut. **Total amount distributed is the same — only the split among winners changes.**

**4. Unrevealed Vote Processing — eliminated entirely.**

`processUnrevealedVotes()` and all its forfeiture/refund logic disappears. There are no "unrevealed" votes — all votes are public and locked. This means treasury loses the unrevealed-forfeiture income source, but this was always meant to be a small, incidental amount.

**5. Participation Pool — minor adjustment.**

Currently pays "all revealed voters" at settlement. Becomes "all voters" since there's no reveal step. The rate halving tiers, deferred-to-settlement logic, and pull-based claiming all remain identical.

### Net Impact

The token economics are structurally the same. The changes are:
- Share-weighted reward distribution (early voters earn more) instead of stake-weighted (all winners equal)
- 5% from consensus subsidy → winning voters (82% becomes 87%)
- Elimination of unrevealed vote processing (pure simplification)

No new pools, no new emission schedules, no changes to the 100M cap.

## Advantages

1. **Dramatic UX improvement.** One transaction, instant feedback, no need to return for reveal. This alone may significantly increase voter participation.
2. **Infrastructure simplification.** Remove tlock, drand, the entire keeper reveal pipeline. The keeper becomes a trivial settlement trigger (or isn't needed at all with self-settling).
3. **Continuous price discovery.** Users see real-time quality signals. The rating is alive, not frozen between reveal phases.
4. **Self-correcting economics.** The pricing curve naturally attracts contrarian capital when the rating is mispriced, creating organic mean reversion without relying on hidden votes.
5. **Zero protocol subsidy** in the parimutuel variant. Losers fund winners, same as today.
6. **Novel mechanism.** Research found no existing project combining public votes + LMSR pricing + random settlement. This is a genuinely original design.

## Disadvantages and Risks

### 1. Loss of Vote Privacy

The most significant tradeoff. Voters can see how others voted, creating social pressure and enabling targeted behavior (e.g., retaliating against someone who voted DOWN on your content).

**Severity:** Moderate. Curyo uses Voter IDs (pseudonymous), not real identities. Social pressure exists but is limited.

**Mitigation:** The pricing curve makes following social pressure unprofitable. If you vote UP on a friend's content just because it's their content, you're buying expensive shares with low expected return.

### 2. Front-Running (MEV)

MEV searchers could see pending votes in the mempool and front-run them to get better prices.

**Severity:** Low on L2s. Optimism, Arbitrum, and Base use sequencers with ordered mempools. Flashbots-style private submission is also an option.

**Mitigation:** Add a `maxPrice` parameter to `vote()` that reverts if the price has moved past the voter's tolerance.

### 3. Cold Start / Low Participation

With very few voters, the contrarian incentive is weak and a single whale can dominate. This is the same problem the current system faces (hence the 3-vote minimum for settlement).

**Severity:** Moderate for new content.

**Mitigation:** Minimum participation requirements (at least 1 voter on each side). Content-adaptive `b` parameter (lower `b` for new content = more responsive, higher `b` for established content = more stable).

### 4. Keynesian Beauty Contest Dynamics

Voters are predicting what other voters will do, not assessing ground truth.

**Severity:** Low, because **this is already true in the current system.** Majority wins is majority wins, whether votes are hidden or public. The proposed system doesn't introduce this dynamic — it makes it more transparent and adds economic friction against mindless agreement.

### 5. On-Chain Math Complexity

LMSR requires exp/ln operations. Even the simplified model adds more computation than simple vote counting.

**Severity:** Low. Solady and PRBMath are well-audited. Gas cost is manageable on L2 (~5k-15k gas). The simplified linear model avoids this entirely.

## Prior Art

### Directly Relevant

- **Robin Hanson, LMSR (2003)** — The mathematical foundation for pricing curves in information markets. [Paper](https://mason.gmu.edu/~rhanson/mktscore.pdf)
- **Ottaviani & Sorensen, "The Timing of Parimutuel Bets" (2006)** — Proves that known settlement time causes strategic delay; random settlement eliminates it. [Paper](https://web.econ.ku.dk/sorensen/papers/TheTimingofParimutuelBets.pdf)
- **Surowiecki, *The Wisdom of Crowds* (2004)** — The independence condition and when it can be relaxed.

### Lessons Learned from Failures

- **Token Curated Registries** — Failed due to voter apathy, plutocracy, and incentive misalignment. Lesson: voters need direct financial skin in the game (not just governance token value), and settlement must be automatic (not challenge-based).
- **Ocean Protocol curation (V1-V3)** — AMM-based curation produced speculation, not quality signals. Migrated to vote-escrow. Lesson: the exit mechanism matters as much as the entry mechanism. Random settlement with no exit is better than continuous bonding curves with sell-back.
- **Augur** — Overcomplicated dispute resolution (60-day forks!) killed UX. Lesson: settlement must be automatic and fast. Random settlement within hours, not weeks.
- **Kleros** — Schelling point instability when the "honest" answer isn't clearly salient. Lesson: with public votes, the Schelling point can drift. The pricing curve is the defense.

### Related Mechanisms

- **Vitalik Buterin, "Moving Beyond Coin Voting" (2021)** — Argues for proof-of-personhood and quadratic weighting. Curyo's Voter IDs align with this. [Post](https://vitalik.eth.limo/general/2021/08/16/voting3.html)
- **Simon de la Rouviere, "Curation Markets" (2017)** — Bonding curves for content curation. The direct ancestor of this design, but without random settlement.
- **Zeitgeist Rikiddo Scoring Rule** — LMSR variant for prediction markets on Polkadot. Demonstrates LMSR is implementable on-chain. [Article](https://medium.com/zeitgeistseer/introducing-zeitgeists-rikiddo-scoring-rule-89c8222e31c)

## Open Questions

### 1. Can Voters Change Their Position?

**Option A: No (locked until settlement).** Simplest. Forces genuine commitment. No exit = no timing games on the sell side.

**Option B: Yes, but at a cost.** Voters can "sell" their shares back to the pool at the current (worse) price. This adds liquidity but also enables more sophisticated strategies.

**Recommendation:** Start with Option A. Locked positions are simpler, match the current Curyo model, and prevent the bonding curve exit problems that plagued Ocean Protocol.

### 2. Multiple Votes Per Epoch?

Can a voter vote multiple times in the same epoch (adding to their position)?

**Option A: One vote per voter per epoch per content** (current model). Simpler, prevents averaging in.

**Option B: Multiple votes allowed.** A voter can add stake in the same or different direction. More flexible but complex.

**Recommendation:** One vote per voter per epoch. Multiple votes allow sophisticated actors to gradually build positions while observing the market, giving them an advantage over casual users.

### 3. Optimal `b` Scaling

Should `b` be:
- Fixed globally (simplest)
- Adaptive per content (based on lifetime vote count, similar to adaptive epoch tiers)
- Dynamic within an epoch (increase as more votes arrive)

**Recommendation:** Adaptive per content. New content gets low `b` (responsive to early votes), established content gets high `b` (stable, hard to move). This is the same adaptive principle from `ADAPTIVE-EPOCH-DESIGN.md` applied to a different parameter.

### 4. Keeper Incentives

If a keeper calls `trySettle()`, should they receive a reward?

**Current system:** Keeper gets a reward for revealing votes and settling rounds.

**Proposed system:** Settlement is simpler (just a probability check), but someone still needs to trigger it. A small reward (from a fraction of the epoch's stakes) incentivizes keepers to call `trySettle()` promptly.

**If self-settling via vote():** Keepers are only needed for stale epochs where no one is voting. Reward should be proportional to how "overdue" the settlement is.
