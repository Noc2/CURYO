# Game-Theoretic Analysis of the Curyo Protocol

Analysis date: 2026-03-02

Critical review of the protocol's mechanism design, known attack vectors, economic sustainability, and comparison with academic literature. Based on cross-referencing smart contract code (`RoundVotingEngine.sol`, `RewardMath.sol`, `ContentRegistry.sol`, `ParticipationPool.sol`, `VoterIdNFT.sol`) with the whitepaper (`content.ts`) and relevant prediction market / mechanism design literature.

---

## A. Structural Mechanism Design Weaknesses

### A.1 The BNE Claim Has Fragile Assumptions

The whitepaper claims honest voting is a Bayesian Nash Equilibrium when voter signal accuracy p > 0.5. Three assumptions weaken this:

1. **No ground truth exists.** The whitepaper itself acknowledges content quality is subjective. The "honest equilibrium" reduces to "if you expect to be in the majority, stay in the majority" -- a coordination game with **multiple equilibria**, not a unique BNE.

2. **The payoff model assumes simultaneous voting, but the mechanism is sequential.** The formal payoff `P_i = s_i + (s_i/W) * 0.82L` uses raw stake ratios, but actual shares are allocated sequentially via `RewardMath.sol:34-37`: `shares = stake * b / (sameDirectionStake + b)`. Payoffs are **path-dependent** -- they depend on *when* you vote, not just *what* you vote. The BNE result doesn't straightforwardly carry to the sequential game.

3. **Voter signals are correlated, not independent.** The Condorcet-style reasoning requires independent signals. In practice, content quality signals are highly correlated (a visibly excellent video produces near-identical signals for all viewers).

**When the equilibrium breaks:**

- **Lopsided markets (L/W -> 0):** Per the whitepaper's own break-even table, at L/W=0.25 you need 83% confidence. Honest voting on obviously good content has near-zero expected reward, leading to rational apathy.
- **Thin markets (minVoters=3):** Three-player parimutuel games have dramatically different dynamics than large-N markets. Individual strategic reasoning dominates.

### A.2 Profitable Deviations the Formal Analysis Misses

| Deviation | Description |
|-----------|-------------|
| **Strategic abstention** | The analysis only considers UP vs DOWN, not *whether to vote*. On lopsided content, rational voters abstain -- creating a free-rider problem. |
| **Cross-content portfolio** | An attacker voting across many contents can construct positive-EV portfolios even when individual bets are marginal. |
| **Stake-size signaling** | A 100 cREP stake signals high confidence and may deter contrarian entry; a 1 cREP "probe vote" reveals nothing at minimal cost. |
| **Catalyst stake attack** | Vote DOWN with 1 cREP (sacrifice), then UP with 100 cREP on a separate identity -- creates a losing pool from your own small sacrifice, then captures disproportionate share via first-mover timing. |

### A.3 Bonding Curve Properties

- **Severe early-mover advantage:** With b=1,000 cREP, the 10th voter on a side gets ~52.6 shares per 100 cREP vs ~100 for the first voter. This creates a **race to vote first** -- essentially a MEV opportunity.
- **Governance-tunable b is an attack surface:** Reducing b via governance makes the curve nearly flat (eliminating anti-herding). The equilibrium properties hold only for a specific range of b values not characterized in the whitepaper.
- **No exit mechanism means no self-correction.** In prediction markets with exit, mispriced shares get corrected. Here, a first voter's large mispricing can only be counterbalanced by opposite-direction votes, not same-side corrections.

### A.4 Settlement Randomness

- **~50% of rounds reach deterministic forced settlement** at maxEpochBlocks (~24 hours) due to the flat 0.01% per-block rate. For those rounds, settlement timing is predictable, undermining the "unpredictable settlement" property.
- **L2 sequencer has full control** over `block.prevrandao` (`RoundVotingEngine.sol:657`). The whitepaper dismisses this because "sequencer has no financial incentive" -- a weak argument since sequencers can be bribed or MEV-extracted.

### A.5 The minVoters=3 Threshold

With minVoters=3 (`RoundVotingEngine.sol:242`), the minimum viable contested round is 2-vs-1. This enables controlled seeding: an attacker with 2 identities votes one direction, waits for exactly 1 honest contrarian, and wins 82% of the victim's stake. Cost: 2 identities + 2 stakes (returned on win). Payoff: 0.82 * victim's stake.

---

## B. Known Attack Vectors

### B.1 Controlled 2-vs-1 Seeding

An attacker with 2 identities votes UP on target content, waits for exactly 1 honest contrarian. With 2-of-3 control, they win 82% of the honest voter's stake. The test suite covers 4-colluder vs 1-victim scenarios but not this more realistic 2-vs-1 case.

### B.2 Undetectable 2-Person Collusion

The whitepaper's collusion model relies on on-chain detection signals. But a 2-person coalition using different wallets, different funding sources, different stake amounts, and different timing is **indistinguishable from honest voters**. P(detect | C=2) is effectively 0. Governance enforcement requires ~10 days minimum (detection + proposal + voting period + timelock).

### B.3 MEV / Front-Running

A validator/sequencer who observes a pending `vote()` transaction can front-run it to capture first-mover bonding curve advantage. The AUDIT NOTE at `RoundVotingEngine.sol:372-374` acknowledges this. Mitigations (Voter ID, max stake, cooldown) limit profit per attack but don't eliminate it.

**Settlement front-running:** A validator who computes that a particular block will trigger settlement (they know `block.prevrandao` for their block) can submit a last-second vote in the same block before settlement triggers.

### B.4 Information Cascades Despite Bonding Curve Pricing

The bonding curve increases the *cost* of herding but doesn't eliminate the *informational* incentive. Per Ottaviani & Sorensen (2006): "increasing the quality of some experts can exacerbate herd behavior." A whale's 100 cREP first vote provides a strong public signal that followers may rationally follow despite the higher share cost.

The bonding curve is **not a proper scoring rule** -- it incentivizes *early* voting, not *truthful* voting. A voter who is unsure but arrives early is rewarded more than a voter with a strong signal who arrives late.

### B.5 Cross-Content Correlation Attacks

Each content item has independent rounds, but the same voters participate across contents. An attacker can identify easy-win content, vote early (capturing first-mover advantage), and use profits to subsidize strategic manipulation on contested items. This is portfolio optimization across parimutuel markets -- well-studied in horse racing.

### B.6 Sybil Attacks Within Voter ID Constraints

The per-identity cap is 100 cREP per content per round. The binding constraint is the cost of a fraudulent passport-grade identity. Depending on jurisdiction, fake or stolen passport data ranges from $50-$5000 USD. If cREP develops any market value (even informally), the identity cost may be worth bearing.

The 100 cREP cap is per-round, not cumulative. A single identity can vote on the same content every round (once per 24h cooldown), accumulating disproportionate influence over a content item's long-term rating.

---

## C. Economic Sustainability Concerns

### C.1 Participation Pool Subsidizes Uninformed Voting

At tier 0 (90% rate), a voter who stakes 100 cREP and loses receives 90 cREP participation bonus -- net loss of only 10 cREP. This dramatically lowers the bar for "worthwhile" voting, including uninformed votes. It's effectively a yield-farming dynamic that dilutes signal quality during bootstrap.

Rewards are deferred to settlement (not paid at vote time), which prevents collection from cancelled rounds. But voters still collect from both winning and losing positions, reducing the penalty for incorrect voting.

### C.2 Consensus Subsidy Paradox

If the platform succeeds (high-quality curation), most content is "obviously good" -> one-sided rounds -> subsidy drain. Replenishment comes from contested rounds (5% of losing pool). **Success increases drain while reducing replenishment.** The reserve becomes a bottleneck that limits the activity the protocol is designed to incentivize.

Back-of-envelope: 4M cREP reserve, 100 content items with daily unanimous rounds at 50 cREP average total stake -> drain of ~2,500 cREP/day -> ~1,600 days sustainability. Adequate for bootstrap but structurally declining.

### C.3 Degenerate "Always Vote UP" Equilibrium

In a Keynesian beauty contest with no ground truth, an equilibrium where everyone always votes UP is self-consistent. Submitters benefit, voters win via consensus subsidy, participation pool pays. The only cost is slow subsidy reserve drain. **No mechanism-internal force penalizes this equilibrium** -- it requires external belief that rating quality matters.

### C.4 Slash Threshold Nearly Unreachable

Rating must drop below 10 (`ContentRegistry.sol:45`) to trigger submitter stake slash. With b_r=50 cREP smoothing, reaching rating <10 requires a massive down-stake imbalance that is nearly impossible without coordinated attack. Provides essentially no deterrent for moderate-quality spam.

---

## D. Comparison with Academic Literature

### D.1 Mechanism Design Comparison

| Property | Curyo | VCG Mechanism | Proper Scoring Rules |
|----------|-------|---------------|---------------------|
| Truthful revelation | BNE (beliefs required) | Dominant strategy | Dominant strategy |
| Budget balance | Yes (losers pay winners) | No (needs external subsidy) | No |
| Elicits probabilities | No (binary UP/DOWN) | N/A | Yes |
| Calibration reward | No | N/A | Yes |
| Early-mover bias | Strong | None | None |

The protocol is closest to a **sequential parimutuel market** in the academic taxonomy.

### D.2 Key References

- **Ottaviani & Sorensen (2010), "Noise, Information, and the Favorite-Longshot Bias in Parimutuel Predictions"** -- Parimutuel mechanisms exhibit systematic biases: favorites are underbet and longshots are overbet. In Curyo: obviously good content may be underrated, controversial content overrated.
- **Lambert, Langford & Wortman (2008), "Self-Financed Wagering Mechanisms for Forecasting"** -- Parimutuel mechanisms can be gamed through strategic timing. Curyo's random settlement mitigates but doesn't eliminate this (~50% of rounds reach deterministic end).
- **Chen & Pennock (2007), "A Utility Framework for Bounded-Loss Market Makers"** -- Dynamic parimutuel markets are not incentive-compatible in general.
- **Ottaviani & Sorensen (2006), "The Timing of Bets and the Favorite-Longshot Bias"** -- Sequential parimutuel betting induces strategic delay. Curyo's random settlement directly addresses this finding.

### D.3 What Curyo Sacrifices vs. Gains

**Sacrifices:** Strategy-proofness (VCG provides robustness to arbitrary opponent strategies; BNE requires correct beliefs about the population), probability elicitation (proper scoring rules elicit calibrated beliefs; Curyo elicits binary choices), unique equilibrium selection.

**Gains:** Budget balance (losers pay winners -- no external subsidy needed, unlike VCG), simplicity (single-transaction UX vs. multi-round mechanisms), permissionless operation (no trusted operator needed for payoff calculation).

### D.4 The Schelling Point Selection Problem

The whitepaper invokes Schelling focal point theory to argue honest voting is the natural coordination point. This is plausible but unfalsifiable in the game-theoretic sense. The BNE result is a **necessary condition** for honest curation (the mechanism doesn't penalize honest voting), not a **sufficient condition** (the mechanism doesn't uniquely select honest voting among multiple equilibria). Convergence to the honest equilibrium depends on social norms, UI design, and community expectations -- none of which are mechanism-internal.

Curyo's novel combination of **bonding curve + random settlement + public votes** doesn't map cleanly to existing theory. This is both a strength (novel design point) and weakness (limited formal tools to prove properties).

---

## E. Summary by Severity

| Severity | Issues |
|----------|--------|
| **High** | L2 sequencer control of `block.prevrandao`; sequential-game BNE gap |
| **Medium** | minVoters=3 controlled seeding; 2-person undetectable collusion; first-mover MEV; ~50% deterministic settlement; multiple degenerate equilibria |
| **Low-Med** | Participation pool subsidizing noise; consensus subsidy paradox; unreachable slash threshold |

---

## F. Potential Mitigations (Not Yet Implemented)

These are research directions, not recommendations:

1. **Chainlink VRF** for settlement randomness -- eliminates L2 sequencer manipulation but adds gas cost and external dependency.
2. **Increase minVoters** (e.g. to 5) -- raises the cost of controlled-seeding attacks but reduces settlement rate for low-activity content.
3. **Time-weighted share pricing** -- reduce first-mover advantage by incorporating time-in-market into share allocation. Complicates the bonding curve math.
4. **Adaptive consensus subsidy** -- reduce subsidy rate as the reserve depletes, or cap per-round subsidy payouts.
5. **Lower slash threshold** (e.g. rating < 30 instead of < 10) -- makes the deterrent meaningful for moderate-quality spam.
6. **Sequential BNE analysis** -- formally prove (or disprove) that the honest voting equilibrium holds under the actual sequential bonding curve mechanism, not just the simultaneous simplification.
