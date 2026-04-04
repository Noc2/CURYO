# Rating System Redesign Plan (Fresh Redeploy)

## Scope

This note assumes we are willing to redeploy the rating-relevant protocol surface instead of preserving storage
compatibility with the current deployment.

That changes the design space in an important way:

- we do not need to preserve the current packed `uint8 rating` storage layout
- we can redesign `ContentRegistry`, `RoundVotingEngine`, `ProtocolConfig`, Ponder schema, and the frontend together
- we can change slash semantics, rating precision, and API sorting in one coordinated release
- we can make a higher-precision score such as `ratingBps` canonical and derive display-friendly values from it

This note is not a migration guide for an in-place upgrade. It is a redesign note for a clean redeploy.

## TL;DR

- The current formula is better understood as a smoothed single-round consensus transform than as a rating that gets
  materially more precise over time.
- Algebraically, the current formula is equivalent to a single-round Beta-posterior mean with a symmetric `25/25`
  prior. That is a strong starting point, not a dead end.
- For a fresh redeploy, the best next step is a cumulative Bayesian rating over settled rounds:
  - store cumulative `upEvidence` and `downEvidence`
  - compute the canonical on-chain score as a posterior mean
  - expose confidence separately in the API/UI
  - use epoch-weighted evidence for rating so late herding has less impact
- Keep evidence weighting linear in capped stake. Do not use concave stake transforms like `sqrt(stake)` in the core
  score because they create stake-splitting incentives across identities.
- Do not require on-chain inverse-beta or Wilson interval math for slash logic. Keep on-chain policy simple:
  mean score plus a minimum evidence threshold.

## What The Code Does Today

### Current score

The current rating formula is hard-coded in `RewardMath.calculateRating()`:

```text
rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + 50)
```

References:

- `packages/foundry/contracts/libraries/RewardMath.sol`
- `packages/nextjs/app/docs/how-it-works/page.tsx`

The docs explicitly say rating uses revealed raw stake while epoch weighting affects rewards, not the score.

### When rating updates

At settlement, `RoundSettlementSideEffectsLib` computes the new rating and writes it into `ContentRegistry`.

References:

- `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol`
- `packages/foundry/contracts/ContentRegistry.sol`

### Where rating matters today

The rating is not just presentation:

- `ContentRegistry` stores the live rating on content
- `milestoneZeroSubmitterRating` freezes the first-settled-round rating for submitter slash logic
- submitter slash resolution checks whether rating fell below the slash threshold
- Ponder stores rating as an integer field and stores rating-change history
- the public content API sorts by rating
- the frontend "For You" ranker mixes rating into its quality score
- docs and UI components assume a `0..100` integer mapped to `/10`

Key references:

- `packages/foundry/contracts/ContentRegistry.sol`
- `packages/foundry/contracts/libraries/SubmitterStakeLib.sol`
- `packages/ponder/ponder.schema.ts`
- `packages/ponder/src/ContentRegistry.ts`
- `packages/ponder/src/api/routes/content-routes.ts`
- `packages/nextjs/lib/vote/forYouRanker.ts`
- `packages/nextjs/lib/ui/ratingDisplay.ts`

## Why The Current Formula Does Not Get Very Precise Over Time

### 1. It resets each round

The current design overwrites the content rating from the latest settled round instead of accumulating evidence across
settled rounds.

That means repeated similar rounds do not tighten the estimate in the way a posterior model would.

### 2. It stores only a point estimate

The system stores a single integer score and does not store uncertainty, posterior mass, or confidence.

So a content item with one small settled round and another item with ten deep settled rounds can look similar even
though the second estimate is much better supported.

### 3. It uses raw revealed stake

The current rating uses raw revealed stake, even though the protocol already discounts late informed votes in reward
weighting and win determination. That leaves the score more exposed to herding than the rest of the economic design.

### 4. It is coarse

The current rating is stored as `0..100`, which is fine for UX display but limiting if we want a richer canonical score.

## Key Insight: The Current Formula Is Already A Single-Round Beta Mean

Rewriting the formula:

```text
rating = 50 + 50 * (up - down) / (up + down + 50)
rating / 100 = (up + 25) / (up + down + 50)
```

That is exactly the posterior mean of a binary Beta model with prior `alpha0 = 25`, `beta0 = 25`, if `up` and `down`
are treated as positive and negative evidence.

That matters because it gives a clean redesign path:

- keep the same prior intuition
- stop resetting the posterior every round
- keep confidence separate from mean

This is much cleaner than inventing a brand-new score from scratch.

## Recommended Redesign

### Canonical on-chain model

Store cumulative evidence per content:

- `upEvidence`
- `downEvidence`
- `ratingBps`
- `lastSettledAt`

Proposed score:

```text
alpha = alpha0 + upEvidence
beta  = beta0  + downEvidence
ratingBps = floor(10000 * alpha / (alpha + beta))
```

Recommended starting prior:

- `alpha0 = 25`
- `beta0 = 25`

This preserves continuity with the intuition of the current formula while letting evidence accumulate.

### Evidence definition

For the rating model, use epoch-weighted evidence rather than raw revealed stake:

```text
roundUpEvidence   = weightedUpPool / 1e6
roundDownEvidence = weightedDownPool / 1e6
```

Why weighted instead of raw:

- it aligns the score with the protocol's anti-herding stance
- it discounts late informed votes that are less informationally valuable
- it makes it harder to push the score by piling onto visible consensus late in the round

Why linear stake instead of `sqrt(stake)` or similar:

- linear stake preserves additivity
- concave stake transforms reward stake splitting across identities
- with a Voter ID system and a per-voter cap, linear stake is the least gameable base rule

### Confidence model

Do not try to compute exact credible intervals on-chain.

Instead:

- store `upEvidence` and `downEvidence` on-chain
- compute posterior intervals, uncertainty bands, and lower bounds off-chain in Ponder / API / frontend

For the UI and APIs, expose:

- posterior mean
- total evidence
- lower confidence bound
- upper confidence bound

### Economic policy

For slashability, avoid expensive on-chain interval math.

Recommended on-chain condition:

```text
slashable if
  ratingBps < 2500
  and (upEvidence + downEvidence) >= MIN_SLASH_EVIDENCE
```

This is simpler and safer than depending on an on-chain Wilson or Beta interval approximation.

### Optional decay

Fresh redeploy lets us include decay if we want it, but it should be treated as a policy choice, not an automatic win.

Arguments for decay:

- content quality can change over time
- links break, media becomes stale, context shifts
- without decay, old evidence can dominate for too long

Arguments against decay:

- decay can make long-lived content easier to manipulate later
- it weakens the "earned history" of well-vetted content
- it adds another governance-tunable parameter with abuse risk

Recommendation:

- include decay support in the design
- launch with `carryBps = 10000` or a very conservative value
- replay historical data before enabling meaningful decay

## Example Voting Behaviour Over Time

Assumptions for examples:

- `alpha0 = beta0 = 25`
- evidence units are cREP-equivalent weighted stake
- no decay unless explicitly noted

### Example A: steady moderate support

Each settled round contributes `60 up / 40 down`.

| Round | Cumulative up | Cumulative down | Proposed score |
| --- | ---: | ---: | ---: |
| 1 | 60 | 40 | 56.7 |
| 2 | 120 | 80 | 58.0 |
| 3 | 180 | 120 | 58.6 |
| 4 | 240 | 160 | 58.9 |
| 5 | 300 | 200 | 59.1 |

Interpretation:

- the score moves gradually toward the long-run signal
- the estimate becomes more trustworthy even when the mean changes only slightly
- this is the core behavior the current system lacks

### Example B: early support, later reversal

Rounds 1-3 contribute `80 up / 20 down`.
Rounds 4-6 contribute `20 up / 80 down`.

| Round | Round evidence | Proposed score |
| --- | --- | ---: |
| 1 | 80 / 20 | 70.0 |
| 2 | 80 / 20 | 74.0 |
| 3 | 80 / 20 | 75.7 |
| 4 | 20 / 80 | 63.3 |
| 5 | 20 / 80 | 55.5 |
| 6 | 20 / 80 | 50.0 |

Interpretation:

- the score does not swing wildly from one round
- repeated contradictory evidence can still pull it back
- if we need faster adaptation, decay is the next lever

For comparison, with a conservative round-carry of `0.85`, the same sequence would adapt faster and reach roughly
`43.6` by round 6 instead of `50.0`.

### Example C: late herding

Blind phase contributes `20 up / 10 down`.
Late informed voters add another `40 up`, but those late votes count at `25%` evidence weight.

| Model | Inputs used | Score |
| --- | --- | ---: |
| Current raw-stake formula | `60 up / 10 down` | 70.8 |
| Proposed weighted-evidence model | `30 up / 10 down` | 61.1 |

Interpretation:

- the current score can be pushed strongly by visible late consensus
- the proposed model still responds, but much less aggressively

## Game-Theoretic Analysis

### 1. Truthful participation incentives

The protocol is not a ground-truth oracle. It is a stake-weighted information aggregation game.

Truthful or careful voting is incentivized by:

- stake loss on the losing side
- higher reward weight for blind early participation
- sybil resistance through Voter ID
- a per-voter max stake cap

The redesigned rating system should reinforce those incentives, not dilute them.

### 2. Herding and informational cascades

This is the most important game-theoretic issue in the current score.

If late informed votes count fully in the rating, then:

- voters can pile onto emerging consensus
- later rounds can look more precise than they really are
- the score can become a lagging reflection of visible crowd behavior rather than independent judgment

Using epoch-weighted evidence in the rating directly addresses this.

### 3. Stake splitting and collusion

Concave evidence transforms such as `sqrt(stake)` reduce whale power, but they also create a new exploit:

- splitting a fixed budget across identities produces more aggregate evidence than keeping it in one wallet

That is a poor trade in a human-identity system.

Recommendation:

- keep evidence linear in capped stake
- rely on Voter ID, per-voter caps, and early-vote weighting instead of nonlinear transforms

### 4. Reflexive ranking effects

Because rating affects discovery and sorting, score design changes user incentives.

Today:

- API endpoints can sort directly by rating
- the "For You" ranker blends rating into its quality score

If the new score is used without confidence-awareness, low-evidence content can get over-promoted.

Recommendation:

- use posterior mean for display
- use a confidence-aware lower bound or evidence-aware blend for ranking

### 5. Slash-boundary gaming

Any rating tied to a slash threshold can be gamed around that boundary.

Attack shape:

- coordinated voters try to push content just above or just below the slash cutoff at the relevant checkpoint

Mitigations:

- require minimum evidence before slash is possible
- use milestone-zero snapshots deliberately
- consider multiple-round or grace-based confirmation if data shows boundary gaming

## Security / Adversarial Considerations

### Strategic manipulation

The literature on online reputation systems shows that strategic manipulation is not hypothetical. If an actor can
profit from influencing the public signal, they will try.

Relevant references:

- Chrysanthos Dellarocas, "Strategic Manipulation of Internet Opinion Forums"
- Radu Jurca and Boi Faltings, work on incentive-compatible reputation mechanisms

Implication for Curyo:

- stake makes manipulation costly
- but it does not make manipulation impossible
- the rating system should assume coordinated strategic voting exists

### Budget aggregation and cartel behavior

Prediction-market research shows that crowds of like-minded, budget-constrained traders can collectively move a market
similarly to one larger trader. That matters here because many coordinated moderate voters can still dominate if their
beliefs align.

Relevant reference:

- Dudik, Devanur, Huang, Pennock, "Budget Constraints in Prediction Markets"

Implication for Curyo:

- Voter ID removes some sybil vectors
- it does not remove cartel risk
- evidence and slash policy should assume coalition behavior is possible

### DoS / arithmetic risks

Avoid designs that require heavy on-chain probability inversion or expensive interval math.

Safer pattern:

- store additive evidence on-chain
- compute rich confidence analytics off-chain
- keep on-chain economic checks simple and monotonic

### Governance abuse risk

If the redesigned system introduces tunable parameters such as:

- prior strength
- late-vote evidence weight
- carry / decay
- slash evidence minimum

then governance can materially change rating behavior. That is powerful and dangerous.

Recommendation:

- keep the parameter surface small
- document each parameter's intended range
- snapshot rating-model parameters per round if governance changes are allowed post-launch

## Redeploy-Specific Plan

### Phase 1: empirical replay

- replay historical rounds through candidate models off-chain
- compare:
  - current formula
  - cumulative Beta posterior using raw stake
  - cumulative Beta posterior using weighted stake
  - confidence-aware ranking lower bounds
- measure:
  - volatility
  - recovery from bad rounds
  - sensitivity to late herding
  - slash-boundary behavior

### Phase 2: protocol design

- redeploy `ContentRegistry` with new evidence fields
- redeploy `RoundVotingEngine` settlement flow to record weighted rating evidence
- redeploy `ProtocolConfig` only if rating parameters are governance-configurable
- make `ratingBps` the canonical stored score and derive legacy-style display values at the API/UI boundary
- define exact slash policy for launch

### Phase 3: indexer and product

- redesign Ponder schema around:
  - canonical rating mean
  - evidence totals
  - confidence fields
  - rating history derived from posterior mean changes
- change API sorting so "highest rated" is confidence-aware
- update the frontend to show:
  - score
  - confidence
  - evidence depth
  - rating history based on the new model

### Phase 4: launch hardening

- add game-theory-focused tests:
  - late herding
  - slash-boundary manipulation
  - repeated alternating rounds
  - coordinated small-voter cartels at the max stake cap
- add invariant tests for:
  - score monotonicity
  - boundedness
  - slashability only above evidence minimum
  - no arithmetic overflow under realistic upper bounds

## Final Recommendation

Under a fresh redeploy, the best design is:

1. cumulative Beta-style posterior mean
2. epoch-weighted linear evidence
3. separate confidence in API/UI
4. simple on-chain slash rule with a minimum evidence threshold
5. confidence-aware sorting and ranking

I do not recommend:

- keeping the current per-round reset behavior
- using raw stake for the canonical long-run rating
- using concave stake transforms in the core score
- putting exact interval math on-chain

## Research References

- Jøsang and Ismail, "The Beta Reputation System"  
  https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf
- Jøsang, Ismail, Boyd, "A Survey of Trust and Reputation Systems for Online Service Provision"  
  https://www.sciencedirect.com/science/article/abs/pii/S0167923605000849
- Edwin B. Wilson, "Probable Inference, the Law of Succession, and Statistical Inference"  
  https://www.statisticshowto.com/wp-content/uploads/2022/02/wilson_1927.pdf
- Herbrich, Minka, Graepel, "TrueSkill: A Bayesian Skill Rating System"  
  https://papers.nips.cc/paper_files/paper/2006/file/f44ee263952e65b3610b8ba51229d1f9-Paper.pdf
- Dudik, Devanur, Huang, Pennock, "Budget Constraints in Prediction Markets"  
  https://www.microsoft.com/en-us/research/publication/budget-constraints-prediction-markets/
- Robin Hanson, "Market Scoring Rules"  
  https://mason.gmu.edu/~rhanson/mktscore.pdf
- Dellarocas, "Strategic Manipulation of Internet Opinion Forums"  
  https://ideas.repec.org/a/inm/ormnsc/v52y2006i10p1577-1593.html
- Jurca and Faltings, "Enforcing Truthful Strategies in Incentive Compatible Reputation Mechanisms"  
  https://infoscience.epfl.ch/record/98292/
