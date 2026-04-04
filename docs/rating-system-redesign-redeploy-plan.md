# Rating System Redesign Plan (Fresh Redeploy)

## Scope

This note assumes a **fresh redeploy** of the rating-related protocol surface.

That changes the design space materially:

- we do **not** need to preserve the legacy `uint8 rating` storage layout
- we do **not** need to keep the current `calculateRating()` semantics for backward compatibility
- we **can** redesign `ContentRegistry`, `RoundVotingEngine`, `ProtocolConfig`, Ponder, and frontend surfaces in lockstep
- we should still preserve the current economic goals unless there is a strong reason to change them

This note focuses on the **content rating system**, not a full redesign of reward distribution, governance, or identity.

## TL;DR

- The current formula is a good **single-round smoothed consensus transform**, but not a strong long-run estimator.
- Under a fresh redeploy, the best practical upgrade is a **cumulative Bayesian rating** with **bounded memory** and **explicit confidence**.
- Each settled round should contribute **epoch-weighted evidence** to persistent `alpha` / `beta` state.
- The public score should be the **posterior mean**.
- Confidence should be shown separately and should influence ranking and slashability.
- Submitter slashing should **not** trigger from a low mean alone. It should require a low mean **and** enough evidence.
- Reward distribution should stay largely independent from the new rating model in v1. Changing both at once adds unnecessary risk.
- The main new risks are sticky early manipulation, burn-to-grief attacks, late-herding contamination if raw stake is used, and increased value of selective revelation. The design below addresses each of them.

## What The Code Does Today

### Rating model

Today the protocol computes rating from the final revealed raw stake imbalance:

```text
rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + 50)
```

Key references:

- `packages/foundry/contracts/libraries/RewardMath.sol`
- `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol`
- `packages/nextjs/app/docs/how-it-works/page.tsx`

Important properties of the current system:

- each content item starts at `50`
- each settled round recalculates rating from that round's revealed pools
- the content rating is overwritten on settlement
- the stored on-chain score is an integer `0..100`
- epoch weighting affects rewards and win condition, but not the rating itself

The current implementation also couples rating to economics:

- submitter slashing is keyed off `SLASH_RATING_THRESHOLD = 25`
- milestone-zero logic snapshots the first settled-round rating
- Ponder and frontend surfaces assume a single integer rating field

Key references:

- `packages/foundry/contracts/ContentRegistry.sol`
- `packages/ponder/ponder.schema.ts`
- `packages/ponder/src/ContentRegistry.ts`
- `packages/ponder/src/api/routes/content-routes.ts`
- `packages/nextjs/lib/ui/ratingDisplay.ts`

## Fresh Redeploy: What Changes In The Plan

Fresh redeploy removes the hardest in-place migration constraint: we no longer have to preserve packed legacy fields like `Content.rating` or `milestoneZeroSubmitterRating`.

That means the redesign should be cleaner than the upgrade-safe plan:

- use a higher-precision score representation from day one
- store persistent evidence state directly
- expose confidence as a first-class signal
- redesign slashability around evidence, not just a point estimate
- update Ponder and frontend schemas together instead of carrying a legacy compatibility layer

What fresh redeploy does **not** remove:

- economic coupling between rating and submitter slashing
- existing game-theoretic threats such as herding, self-opposition, and selective revelation
- the need to explain score semantics clearly in the product
- the need to test the new model against realistic round behavior

## Research Takeaways

### 1. The current formula already has a Bayesian interpretation

Rewriting the current formula gives:

```text
rating / 100 = (upStake + 25) / (upStake + downStake + 50)
```

That is equivalent to the posterior mean of a symmetric Beta prior with strength `25/25` if `upStake` and `downStake` are treated as positive and negative evidence. In other words: the current model is already a **single-round Beta posterior mean**.

Implication:

- the problem is not that the current formula has no statistical interpretation
- the problem is that the protocol **resets the posterior every round**

Primary reference:

- Audun Josang and Roslan Ismail, *The Beta Reputation System*:
  https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf

### 2. Confidence matters as much as the score

Wilson's 1927 interval result remains relevant here: ranking or acting on a point estimate without accounting for confidence produces poor behavior in low-evidence regimes.

Implication:

- score and confidence should be separate outputs
- ranking should not use posterior mean alone
- slashing should not use posterior mean alone

Primary reference:

- E. B. Wilson, *Probable Inference, the Law of Succession, and Statistical Inference*:
  https://www.statisticshowto.com/wp-content/uploads/2022/02/wilson_1927.pdf

### 3. Proper scoring rules are useful, but only when incentives line up

Strictly proper scoring rules reward truthful probability reports when the forecaster cannot profit by affecting the outcome itself. That assumption is fragile in a stake-weighted on-chain voting system where users may hold positions, coordinate, or try to move the public score.

Implication:

- a scoring-rule-style redesign should not be the first move
- Curyo should prefer robust aggregation of costly votes over an elegant but gameable reporting mechanism

Primary reference:

- Tilmann Gneiting and Adrian Raftery, *Strictly Proper Scoring Rules, Prediction, and Estimation*:
  https://stat.uw.edu/research/tech-reports/strictly-proper-scoring-rules-prediction-and-estimation-revised

### 4. Full market-scoring-rule designs are probably too large a jump

LMSR and related market scoring rules are powerful information aggregators, but they imply a more market-native architecture than Curyo's current parimutuel rounds.

Implication:

- fresh redeploy makes LMSR possible in theory
- it is still a v2 market design, not the right next step for this repo

Primary reference:

- Robin Hanson, *Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation*:
  https://mason.gmu.edu/~rhanson/mktscore.pdf

### 5. Reputation systems invite strategic adaptation

Real reputation systems are manipulated when low-quality participants can cheaply reshape the public signal. That does not go away just because votes are staked.

Implication:

- the new rating model should explicitly analyze manipulation incentives
- low-evidence slash rules are especially dangerous

Useful references:

- Friedman, Resnick, and Sami, *Manipulation-Resistant Reputation Systems*:
  https://presnick.people.si.umich.edu/papers/agt/
- Ye, Gao, and Viswanathan, *Strategic Behavior in Online Reputation Systems: Evidence from Revoking on eBay*:
  https://books.google.com/books/about/Strategic_Behavior_in_Online_Reputation.html?id=c1vazwEACAAJ

## Recommended Model

### Name

**Bounded-Memory Bayesian Content Rating**

### State

For each content item, store:

- `ratingAlpha`
- `ratingBeta`
- `ratingMeanBps`
- `ratingEvidence`
- `ratingUpdatedAt`

Optional:

- `ratingRoundCount`
- `ratingVersion`

Suggested units:

- keep `alpha` / `beta` in fixed-point or integer "effective cREP evidence"
- keep `ratingMeanBps` in basis points on `0..10000`

### Round evidence

For each settled round, derive:

- `eUp`
- `eDown`

Recommended v1 choice:

- use **epoch-weighted** stake, not raw stake
- derive `eUp` from the winning/losing side's **weighted** pool contribution, not the raw pool

Reason:

- the current protocol already recognizes that epoch-2+ voters are less informative for incentives
- using raw stake for the new long-run score would preserve the current herding weakness

### Update rule

Base update:

```text
alpha' = alpha + eUp
beta'  = beta + eDown
ratingMean = 10000 * alpha' / (alpha' + beta')
```

Initial prior:

```text
alpha0 = 25
beta0  = 25
```

That preserves the intuition of the current smoothing constant while allowing evidence to accumulate over time.

### Bounded memory

Pure accumulation makes early manipulation too sticky. The score needs memory, but not infinite memory.

Recommended mechanism:

- after each update, if `alpha + beta > E_TOTAL_CAP`, scale both down proportionally
- preserve the current mean while limiting total historical inertia

Example:

```text
if alpha + beta > E_TOTAL_CAP:
  scale = E_TOTAL_CAP / (alpha + beta)
  alpha = alpha * scale
  beta  = beta * scale
```

Why this is preferable to immediate time decay in v1:

- simpler on-chain implementation
- no exponential math
- prevents permanent poisoning from old rounds
- still allows content to recover from early manipulation

### Confidence

The protocol should expose confidence, but v1 should avoid expensive on-chain credible interval math.

Recommended split:

- on-chain: store `alpha`, `beta`, `ratingMeanBps`, `ratingEvidence`
- off-chain / UI / Ponder: derive confidence band or conservative lower bound from `alpha` and `beta`

This keeps the contract simple while still letting the product distinguish:

- "score is 62 with weak evidence"
- "score is 62 with deep evidence"

### Submitter slashing

The current slash rule is too blunt for a cumulative model if it remains "mean below 25".

Recommended v1 slash rule:

- slash only if `ratingMeanBps < 2500`
- and `ratingEvidence >= SLASH_EVIDENCE_MIN`
- and the existing time-based grace condition is met

Do **not** use low mean alone.

Reason:

- early brigading against fresh content becomes much more dangerous when score persists across rounds
- evidence gating is the cheapest way to reduce false slashing without requiring Beta quantile math on-chain

## Example Voting Behavior Over Time

Assumptions for the examples below:

- prior `alpha0 = 25`, `beta0 = 25`
- effective evidence uses the round's up/down numbers directly for readability
- no time decay in the examples
- "proposed" means cumulative posterior mean
- the "current" column shows the current per-round formula

The production recommendation is still to use **epoch-weighted** evidence rather than raw stake for the live protocol.

### Example A: consistent positive evidence

| Round | Up | Down | Current round score | Proposed cumulative score |
| --- | ---: | ---: | ---: | ---: |
| 1 | 150 | 50 | 70.0 | 70.0 |
| 2 | 120 | 40 | 69.0 | 72.0 |
| 3 | 80 | 20 | 70.0 | 73.5 |

Interpretation:

- current system keeps re-evaluating each round in isolation
- proposed system slowly becomes more confident that the content is genuinely above average

### Example B: mixed evidence and reversal

| Round | Up | Down | Current round score | Proposed cumulative score |
| --- | ---: | ---: | ---: | ---: |
| 1 | 150 | 50 | 70.0 | 70.0 |
| 2 | 40 | 120 | 31.0 | 52.4 |
| 3 | 120 | 60 | 63.0 | 56.8 |

Interpretation:

- current system swings hard with each round
- proposed system reacts, but not as violently
- this is desirable when rounds contain noise or strategic participation

### Example C: early attack, later correction

This example uses the same posterior model with an evidence cap to avoid infinite memory.

Assumptions:

- prior `25/25`
- total evidence cap `E_TOTAL_CAP = 400`

| Round | Up | Down | Current round score | Proposed cumulative score with cap |
| --- | ---: | ---: | ---: | ---: |
| 1 | 200 | 20 | 83.3 | 83.3 |
| 2 | 20 | 120 | 23.7 | 59.8 |
| 3 | 40 | 140 | 28.3 | 48.1 |
| 4 | 100 | 40 | 65.8 | 54.2 |
| 5 | 120 | 20 | 78.9 | 62.3 |

Interpretation:

- without bounded memory, an early manipulation attempt can remain too sticky
- with bounded memory, the score can recover while still remembering history
- this is a better fit for mutable or evolving content than infinite accumulation

## Game-Theoretic Analysis

### Design goals

The redesign should reward or preserve the following:

- early honest voting should matter more than late herd-following
- users should not be able to cheaply jam a score and leave a permanent scar
- minority disagreement should reduce certainty without making recovery impossible
- the public score should be harder to manipulate than the reward split

### Main strategic threats

#### 1. Early anchoring attack

Attack:

- attackers coordinate a strong early vote against new or low-liquidity content
- a cumulative model makes that early move last longer than it does today

Why the redesign increases the risk:

- evidence persists across rounds

Mitigations:

- symmetric prior with non-trivial strength
- evidence-gated slash logic
- bounded memory cap
- optional minimum distinct-voter threshold for slashability

#### 2. Burn-to-grief sabotage

Attack:

- an attacker knowingly votes on the losing side to reduce rating quality or confidence
- they lose stake, but may still achieve strategic sabotage

Why the redesign changes the tradeoff:

- even losing-side evidence can permanently shape the long-run posterior

Mitigations:

- maintain strict per-voter stake cap
- use epoch-weighted evidence
- consider clipping evidence growth if griefing becomes economically viable
- do not make ranking depend on posterior mean alone

#### 3. Late herding

Attack:

- voters observe revealed information from earlier epochs, then pile onto the likely side

Current code already recognizes this as a risk:

- see `packages/foundry/test/GameTheoryImprovements.t.sol`
- see `packages/foundry/contracts/RoundVotingEngine.sol`

Mitigation:

- use weighted, not raw, evidence for the long-run score

#### 4. Self-opposition / hedged influence

Attack:

- attacker splits positions across multiple wallets or sides, hoping to influence score while reducing net economic exposure

Relevant local tests:

- `packages/foundry/test/SelfOppositionProfitability.t.sol`

Mitigations:

- keep current reward-side protections
- ensure the new score does not create a separate profitable hedge path
- keep Voter ID, self-vote prohibition, and per-content stake limits

#### 5. Selective revelation

Attack:

- attackers reveal only favorable votes so the final rating evidence becomes biased

This becomes **more valuable** under a cumulative score because biased evidence lasts longer.

Relevant local tests:

- `packages/foundry/test/SelectiveRevelationTest.t.sol`

Mitigations:

- preserve the current reveal-grace and selective-revelation protections
- do not weaken commit-reveal or keeper assumptions as part of the redesign

#### 6. Sybil / identity rental

Attack:

- attackers borrow, rent, or collude across identities to exceed intended influence limits

Mitigations:

- preserve Voter ID gating
- keep per-content stake caps
- consider tracking distinct voter count alongside evidence for confidence decisions

#### 7. Stale-content inertia

Attack or failure mode:

- the content genuinely changes, but old evidence keeps score too sticky

Mitigations:

- bounded-memory evidence cap
- optional later move to time decay
- avoid tying every economic action to the lifetime posterior alone

## Security Considerations

### Contract-level risks

- more rating state means more invariants to maintain
- scaling and rescaling logic adds rounding edge cases
- if confidence is computed on-chain with approximated Beta quantiles, complexity and bug surface grow materially

Recommended stance:

- keep posterior interval math off-chain in v1
- keep on-chain rating math linear, bounded, and easy to fuzz

### Economic risks

- false slashing from low-evidence negative rounds
- sticky manipulation from early brigading
- griefing through persistent minority sabotage
- ranking distortion if frontend sorts by mean without confidence

### Product risks

- users may misread a high-confidence `6.1` and a low-confidence `6.1` as the same thing
- raw up/down stake details may diverge from displayed score trajectory if score uses weighted cumulative evidence

Mitigation:

- show score and confidence separately
- explain that round details show round evidence, while the public score is the long-run posterior

## Impact Map

### Contracts

Must change:

- `packages/foundry/contracts/ContentRegistry.sol`
- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol`

Likely should change:

- `packages/foundry/contracts/ProtocolConfig.sol`

Likely should **not** change in v1:

- `packages/foundry/contracts/RoundRewardDistributor.sol`
- `packages/foundry/contracts/libraries/RewardMath.sol` reward-split paths

### Ponder

Must change:

- `packages/ponder/ponder.schema.ts`
- `packages/ponder/src/ContentRegistry.ts`
- `packages/ponder/src/api/routes/content-routes.ts`

Likely additional surfaces:

- content list sorting by rating
- rating history serialization
- API response typing for content and rating changes

### Frontend

Must change:

- `packages/nextjs/lib/ui/ratingDisplay.ts`
- `packages/nextjs/components/shared/RatingOrb.tsx`
- `packages/nextjs/components/shared/RatingHistory.tsx`
- `packages/nextjs/components/shared/VotingQuestionCard.tsx`
- `packages/nextjs/components/vote/VoteFeedCards.tsx`
- `packages/nextjs/components/profile/PublicProfileView.tsx`
- `packages/nextjs/services/ponder/client.ts`

Likely should change:

- surfaces that sort by highest/lowest rated
- tooltips and copy that explain how rating works

### Docs

Must change:

- `packages/nextjs/app/docs/how-it-works/page.tsx`
- `packages/nextjs/app/docs/smart-contracts/page.tsx`
- `packages/nextjs/app/docs/tokenomics/page.tsx`
- `packages/nextjs/app/docs/governance/page.tsx`
- `README.md`

### Tests

Core contract tests to update or replace:

- `packages/foundry/test/RewardMath.t.sol`
- `packages/foundry/test/RewardMathFuzz.t.sol`
- `packages/foundry/test/InvariantRating.t.sol`
- `packages/foundry/test/SubmitterStakeResolution.t.sol`
- `packages/foundry/test/RoundIntegration.t.sol`
- `packages/foundry/test/RoundVotingEngineBranches.t.sol`

Adversarial/game-theory tests that remain essential:

- `packages/foundry/test/GameTheoryImprovements.t.sol`
- `packages/foundry/test/SelfOppositionProfitability.t.sol`
- `packages/foundry/test/SelectiveRevelationTest.t.sol`
- `packages/foundry/test/AdversarialTests.t.sol`

Ponder/frontend/E2E surfaces:

- `packages/nextjs/e2e/tests/settlement-lifecycle.spec.ts`
- `packages/nextjs/e2e/tests/reward-claim.spec.ts`
- `packages/nextjs/e2e/tests/zz-multi-round.spec.ts`
- `packages/nextjs/e2e/tests/tied-round.spec.ts`
- `packages/nextjs/lib/ui/ratingDisplay.test.ts`

## Suggested Fresh-Redeploy Rollout

1. Implement a shadow model off-chain first.
Replay historical rounds with the proposed posterior model and compare volatility, recovery behavior, and slashability against the current formula.

2. Finalize parameters only after replay.
Do not lock values like `E_TOTAL_CAP` or `SLASH_EVIDENCE_MIN` before replaying realistic content histories.

3. Build the new contracts and schema as a coherent versioned surface.
Do not mix a new contract model with legacy indexer/frontend assumptions.

4. Preserve the current reward model in v1.
Changing rating and reward logic simultaneously makes failures harder to diagnose.

5. Test adversarially before testnet.
The redesign should add new invariants and extend the current game-theory suite rather than replacing it.

6. Deploy a fresh stack and point a fresh Ponder indexer at it.
Do not try to reuse old rating history tables as if they represented the new model.

7. Make confidence visible in the product at launch.
If the UI still shows only one number, much of the redesign benefit is lost.

## Recommended Final Answer

Under a fresh redeploy assumption, the best next-step design is:

- cumulative Bayesian rating
- weighted round evidence
- bounded memory
- explicit confidence
- evidence-gated slashing
- no reward-model rewrite in v1

That is a materially better plan than either:

- keeping the current per-round overwrite model
- or jumping straight to a full market-scoring-rule redesign

## References

- Josang and Ismail, *The Beta Reputation System*:
  https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf
- Wilson, *Probable Inference, the Law of Succession, and Statistical Inference*:
  https://www.statisticshowto.com/wp-content/uploads/2022/02/wilson_1927.pdf
- Gneiting and Raftery, *Strictly Proper Scoring Rules, Prediction, and Estimation*:
  https://stat.uw.edu/research/tech-reports/strictly-proper-scoring-rules-prediction-and-estimation-revised
- Herbrich, Minka, and Graepel, *TrueSkill*:
  https://papers.nips.cc/paper_files/paper/2006/file/f44ee263952e65b3610b8ba51229d1f9-Paper.pdf
- Dangauthier, Herbrich, Minka, and Graepel, *TrueSkill Through Time*:
  https://nips.cc/virtual/2007/spotlight/677
- Hanson, *Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation*:
  https://mason.gmu.edu/~rhanson/mktscore.pdf
- Friedman, Resnick, and Sami, *Manipulation-Resistant Reputation Systems*:
  https://presnick.people.si.umich.edu/papers/agt/
- Ye, Gao, and Viswanathan, *Strategic Behavior in Online Reputation Systems: Evidence from Revoking on eBay*:
  https://books.google.com/books/about/Strategic_Behavior_in_Online_Reputation.html?id=c1vazwEACAAJ
