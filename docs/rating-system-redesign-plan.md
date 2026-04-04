# Rating System Redesign Plan

## Scope

Assumption for this note: we are free to **redeploy the relevant protocol contracts, Ponder indexer, and frontend** rather than preserving storage compatibility with the current deployment.

That changes the plan materially:

- we do **not** need to preserve the current `uint8 rating` storage layout
- we do **not** need to dual-write legacy and new rating state forever
- we **can** redesign submitter-slash logic together with rating logic
- we should still preserve the protocol's current anti-herding and adversarial guarantees unless we intentionally replace them

## TL;DR

- The current rating formula is a good smoothed **single-round** consensus transform, but it is not a good long-run estimator because it resets each settled round.
- The best redesign for Curyo is a **cumulative Bayesian binary-evidence model**: keep separate `up` and `down` evidence, derive the public score from the posterior mean, and derive a separate confidence / conservative score for ranking and safety checks.
- Under a fresh redeploy, the safest default is to use **epoch-weighted round evidence** for rating, not raw stake, so the rating system inherits the protocol's existing anti-herding logic.
- If submitter slashing remains tied to rating, the new system should **not** slash from a single low-evidence round. It should require a low score **and** minimum evidence / minimum settled rounds.
- The recommended initial design is substantially simpler and safer than moving to a full prediction-market or peer-prediction mechanism.

## What The Current System Gets Right

Today, the rating formula is:

```text
rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + 50)
```

Useful properties:

- bounded in `[0, 100]`
- symmetric around `50`
- easy to explain
- resistant to tiny-sample swings because of the `+50` smoothing term
- directly tied to stake, so higher-conviction rounds move the score more

Important local references:

- `packages/foundry/contracts/libraries/RewardMath.sol`
- `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol`
- `packages/foundry/contracts/ContentRegistry.sol`
- `packages/nextjs/app/docs/how-it-works/page.tsx`

## What The Current System Gets Wrong

The current formula should be thought of as a **per-round posterior**, not a long-run reputation system.

Main limitations:

- It discards most historical evidence each time a new round settles.
- It stores the live rating as an integer `0..100`, which loses precision.
- It uses **raw revealed stake** for rating even though the protocol already uses **epoch-weighted stake** to reduce late-vote herding in rewards and win determination.
- It makes punitive logic sensitive to a single round outcome if slashing remains coupled to a single low rating.
- It does not separate **estimate** from **confidence**.

One useful reinterpretation:

```text
rating / 100 = (upStake + 25) / (upStake + downStake + 50)
```

That means the current system is mathematically equivalent to a **single-round symmetric Beta posterior mean** with prior `alpha0 = 25`, `beta0 = 25`.

That is a solid starting point. The problem is not the Bayesian intuition. The problem is that the protocol currently **resets that posterior every round**.

## Design Goals

- Make ratings become more stable and informative as more evidence accumulates.
- Preserve anti-herding incentives already present in the round design.
- Keep the on-chain rating math simple enough to audit.
- Reduce the ability of one low-evidence round to trigger harsh economic outcomes.
- Expose a separate notion of confidence or conservatism for ranking and risk management.
- Keep the user-facing score intuitive.

## Non-Goals

- Perfectly infer objective truth from subjective votes.
- Replace the current reward system with a full market-maker or peer-prediction mechanism.
- Introduce complex voter-reliability weighting in the first redesign.

## Recommended Model

### 1. Replace per-round overwrite with cumulative evidence

For each content item, store:

- `ratingAlpha`
- `ratingBeta`
- `ratingMeanBps`
- `ratingSettledRounds`
- `ratingLastUpdatedAt`

Recommended initial prior:

```text
alpha0 = 50
beta0 = 50
priorStrength = 100
```

This is stronger than the current implicit prior strength `50`. That is intentional: if rating is tied to slashing or moderation, a fresh deployment should be more conservative than the current system.

### 2. Use epoch-weighted evidence for rating

Instead of rating from raw revealed stake, compute per-round rating evidence from the same anti-herding weight logic already used by the protocol:

```text
roundUpEvidence = weightedUpPool
roundDownEvidence = weightedDownPool
```

Then update:

```text
alpha_next = alpha_prev + roundUpEvidence
beta_next = beta_prev + roundDownEvidence
ratingMean = alpha_next / (alpha_next + beta_next)
ratingMeanBps = floor(10000 * ratingMean)
```

Rationale:

- The protocol already treats epoch-1 votes as more information-rich than late votes.
- Carrying that same weighting into rating avoids letting late visible-bandwagon voting dominate the long-run score.
- This keeps rating and the anti-herding design philosophically aligned.

### 3. Separate score from confidence

The public system should expose at least two values:

- `ratingMeanBps`: the posterior mean, suitable for the main displayed score
- `ratingConservativeBps` or confidence bucket: a more cautious value for ordering and risk controls

Recommended split:

- compute `ratingMeanBps` on-chain
- compute `ratingConservativeBps` off-chain in Ponder / API from the stored `alpha` and `beta`
- use the conservative score for feed sorting, "high-confidence" badges, and operator dashboards

The initial implementation can derive `ratingConservativeBps` from a Wilson-style or Bayesian lower bound off-chain. The protocol does not need expensive on-chain quantile math on day one.

### 4. Redesign slash logic together with rating

Under a fresh redeploy, I would not keep the current "first settled round snapshot" slash logic as-is.

Safer rule:

- do **not** slash based on one low-evidence round
- slash only if all of the following hold:
  - `ratingMeanBps < 2500`
  - `ratingSettledRounds >= 2`
  - `ratingAlpha + ratingBeta - priorStrength >= minSlashEvidence`
  - grace period has elapsed

Suggested default:

```text
minSlashEvidence = 200 cREP-equivalent weighted evidence
```

This means:

- one unanimous `100 cREP` max-stake down round is not enough by itself to trigger slashability
- repeated low ratings still become economically meaningful

### 5. Keep linear stake weighting in the first redeploy

Nonlinear transforms like `sqrt(stake)` or `log(stake)` can reduce whale influence, but they also make the system harder to reason about and harder to audit.

Initial recommendation:

- keep stake evidence **linear**
- keep the existing per-voter stake cap
- preserve Voter ID enforcement
- revisit nonlinear weighting only if concentration analysis later shows a real problem

## Proposed Contract Surface

### Content state

A fresh deployment can redesign the `Content` struct or related storage to hold:

- `uint32 ratingMeanBps`
- `uint128 ratingAlpha`
- `uint128 ratingBeta`
- `uint32 ratingSettledRounds`
- `uint48 ratingLastUpdatedAt`

Optional:

- `uint32 ratingConservativeBps` if we later decide to store it on-chain

### Config state

`ProtocolConfig` should gain a rating config surface such as:

- `ratingPriorAlpha`
- `ratingPriorBeta`
- `lateEpochEvidenceWeightBps`
- `minSlashEvidence`
- `minSlashSettledRounds`

### Events

Prefer an explicit rating event for the new model, for example:

- `RatingUpdated(contentId, oldMeanBps, newMeanBps, alpha, beta, settledRounds)`

This makes Ponder indexing much cleaner than reconstructing confidence from the current integer-only event stream.

## Example Voting Behaviour Over Time

Assumptions in the examples below:

- proposed system uses `alpha0 = 50`, `beta0 = 50`
- proposed system uses cumulative evidence
- numbers are shown as percentages on the `0..100` scale

### Example 1: Consistently mildly positive content

Each round settles at `60 up / 40 down`.

| Round | Current per-round formula | Proposed cumulative model |
| --- | ---: | ---: |
| 1 | 56.7 | 55.0 |
| 2 | 56.7 | 56.7 |
| 3 | 56.7 | 57.5 |
| 4 | 56.7 | 58.0 |
| 5 | 56.7 | 58.3 |

Interpretation:

- the current system keeps rediscovering the same number
- the proposed system gradually becomes more confident that the content is above average

### Example 2: Attack first, honest recovery later

Round sequence:

- Round 1: `0 up / 100 down`
- Rounds 2-4: `80 up / 20 down`

| Round | Current per-round formula | Proposed cumulative model |
| --- | ---: | ---: |
| 1 | 16.7 | 25.0 |
| 2 | 70.0 | 43.3 |
| 3 | 70.0 | 52.5 |
| 4 | 70.0 | 58.0 |

Interpretation:

- the current system whipsaws from "very bad" to "very good" in a single round
- the proposed system is much harder to jerk around with one attack round
- the stronger prior also avoids making one max-size negative round immediately slashable

### Example 3: Late-herding pressure

Suppose:

- Round 1 blind evidence: `60 up / 40 down`
- later rounds are more lopsided but only after visibility improves
- late evidence should count less than blind evidence

If two later `80 / 20` rounds are counted at full weight, the cumulative rating would move:

| Step | Unweighted cumulative score |
| --- | ---: |
| After blind round | 55.0 |
| After late round 2 | 63.3 |
| After late round 3 | 67.5 |

If those late rounds are discounted to `25%` weight, the cumulative rating instead moves:

| Step | Weighted cumulative score |
| --- | ---: |
| After blind round | 55.0 |
| After late round 2 | 57.8 |
| After late round 3 | 60.0 |

Interpretation:

- using weighted evidence for rating prevents late visible voting from overwhelming the score too quickly
- this keeps the score aligned with the protocol's anti-herding philosophy

## Game-Theoretic Analysis

### What improves

#### One-round manipulation becomes less decisive

In a cumulative model, an attacker must often pay for **multiple** successful rounds to move the score materially, rather than just one round.

That is especially important if rating is connected to:

- submitter slashing
- feed ranking
- moderation flags
- off-protocol reputation effects

#### Anti-herding can be made consistent

Today, the protocol uses weighted stake for winning and rewards, but raw stake for rating.

That creates a mismatch:

- late visible votes are discounted economically
- but still count fully toward the published score

Using weighted evidence for rating closes that gap.

#### Confidence-aware ranking discourages low-sample gaming

If feed sorting uses a conservative score or confidence-aware ranking rather than raw mean score, low-liquidity items become much harder to push to the top with tiny coordinated rounds.

### What does not improve automatically

#### Truth is still not a dominant strategy

This redesign improves aggregation and safety, but it does **not** solve the deeper epistemic problem:

- voters are still rewarded for being on the winning side
- that means they are incentivized to predict future consensus
- truthfulness only emerges if honest / well-informed voting remains the best way to predict consensus

So the system remains a **stake-weighted coordination game**, not a proof-of-truth oracle.

#### Coalitions can still buy influence

Even with Voter ID and per-voter stake caps, a sufficiently large coalition can still move ratings over time.

The redesign improves attack cost and persistence properties, but it does not eliminate coalition power.

## Security And Adversarial Considerations

### 1. Slash griefing

Risk:

- attackers may be willing to lose stake if pushing a target below the slash threshold creates a larger external payoff

Mitigations:

- stronger prior
- minimum slash evidence
- minimum settled rounds before slashing
- do not slash from the first low round alone

### 2. Self-opposition and Sybil splitting

The repo already contains explicit tests showing self-opposition is structurally unprofitable under the current reward split:

- `packages/foundry/test/AdversarialTests.t.sol`
- `packages/foundry/test/SelfOppositionProfitability.t.sol`

The new rating model should preserve that property by:

- keeping the same reward split
- not introducing rating-linked bonus paths that let an attacker profit from opposing themselves

Important nuance:

- even if self-opposition remains directly unprofitable, it can still be useful as a **griefing** strategy if rating changes trigger external damage

That is why slash gating matters.

### 3. Selective revelation

The current protocol already contains a targeted defense against selective-reveal settlement attacks:

- `packages/foundry/test/SelectiveRevelationTest.t.sol`

The rating redesign must preserve the same invariant:

- rating updates only from legitimately settled rounds
- unrevealed past-epoch votes must still block premature settlement within the grace window

### 4. Low-liquidity confidence inflation

Risk:

- if confidence depends only on total stake, a small cartel with large stake can manufacture "high confidence"

Mitigations:

- confidence should consider both evidence size and round depth
- slash logic should require multiple settled rounds, not just one high-stake round
- analytics should monitor evidence concentration by Voter ID

### 5. Whale dominance

Risk:

- because evidence is linear in stake, wealthy participants can dominate the score

Why I still recommend linear weighting first:

- the protocol already caps per-voter stake
- the protocol already requires Voter ID
- linear weighting is easier to audit and explain

What to monitor post-launch:

- concentration of effective evidence among top voters
- fraction of content whose score depends on fewer than `N` distinct voters
- correlation between evidence concentration and later score reversals

If those metrics look bad, nonlinear evidence weighting can become a deliberate second-stage upgrade.

### 6. Precision and arithmetic bugs

New state variables like `alpha` and `beta` add surface area for:

- overflow
- truncation
- accidental unit mismatches between raw stake, weighted stake, and basis points

Mitigations:

- standardize all evidence units explicitly
- unit-test every conversion
- fuzz the rating update path
- add invariants like:
  - `ratingMeanBps` always in `[0, 10000]`
  - `alpha` and `beta` are monotonic
  - cumulative evidence increases exactly by the per-round contribution

## Why I Do Not Recommend Other Models For The Fresh Redeploy

### LMSR / market-maker redesign

Pros:

- strong information-aggregation theory
- elegant pricing interpretation

Why not now:

- it is a much larger protocol redesign than a rating redesign
- it changes the economic object entirely, not just the rating update rule

### Peer prediction / Bayesian Truth Serum

Pros:

- theoretically appealing for eliciting truthful subjective information without direct verification

Why not now:

- significantly more complex to explain to users
- difficult to integrate cleanly with the current stake-and-settlement flow
- likely too far from the current mental model for a first production redesign

For Curyo, the best next step is still a better **stake-weighted reputation accumulator**, not a fully different elicitation mechanism.

## Impacted Code Areas

### Contracts

- `packages/foundry/contracts/ContentRegistry.sol`
- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/foundry/contracts/ProtocolConfig.sol`
- `packages/foundry/contracts/libraries/RewardMath.sol`
- `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol`
- `packages/foundry/contracts/libraries/SubmitterStakeLib.sol`

### Ponder

- `packages/ponder/ponder.schema.ts`
- `packages/ponder/src/ContentRegistry.ts`
- `packages/ponder/src/api/routes/content-routes.ts`

### Frontend

- `packages/nextjs/lib/ui/ratingDisplay.ts`
- `packages/nextjs/components/shared/RatingOrb.tsx`
- `packages/nextjs/components/shared/RatingHistory.tsx`
- `packages/nextjs/components/vote/VoteFeedCards.tsx`
- `packages/nextjs/components/shared/VotingQuestionCard.tsx`

### Tests To Expand

- `packages/foundry/test/RewardMath.t.sol`
- `packages/foundry/test/RewardMathFuzz.t.sol`
- `packages/foundry/test/InvariantRating.t.sol`
- `packages/foundry/test/RoundIntegration.t.sol`
- `packages/foundry/test/SubmitterStakeResolution.t.sol`
- `packages/foundry/test/SelectiveRevelationTest.t.sol`
- `packages/foundry/test/SelfOppositionProfitability.t.sol`
- `packages/foundry/test/AdversarialTests.t.sol`

## Recommended Implementation Plan

### Phase 1: Simulation and parameter tuning

- replay historical round data off-chain
- compare:
  - current formula
  - cumulative Beta mean with prior `25/25`
  - cumulative Beta mean with prior `50/50`
  - weighted vs unweighted round evidence
- measure:
  - score volatility
  - time-to-confidence
  - sensitivity to one-off attack rounds
  - slash false-positive risk

### Phase 2: Contract redesign

- redesign `ContentRegistry` rating state for cumulative evidence
- add rating config to `ProtocolConfig`
- update settlement path to accumulate weighted evidence
- redesign slash conditions to use mean + evidence floors
- emit richer rating events

### Phase 3: Indexer and API

- index `alpha`, `beta`, `mean`, and conservative ranking metrics
- expose both the public score and confidence-aware ordering fields
- keep round history queryable for audits and product analytics

### Phase 4: Product rollout

- display score plus confidence, not score alone
- sort by conservative rank where that improves feed quality
- explain in UI that ratings now accumulate evidence across rounds

### Phase 5: Adversarial validation

- extend the existing self-opposition and selective-reveal suites
- add slash-griefing simulations
- add low-liquidity concentration tests
- run invariant tests on evidence monotonicity and rating bounds

## Research References

- Audun Jøsang and Roslan Ismail, *The Beta Reputation System* (2002): https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf
- E. B. Wilson, *Probable Inference, the Law of Succession, and Statistical Inference* (1927): https://www.statisticshowto.com/wp-content/uploads/2022/02/wilson_1927.pdf
- Ralf Herbrich, Tom Minka, Thore Graepel, *TrueSkill Through Time / TrueSkill* foundations: https://papers.nips.cc/paper_files/paper/2006/file/f44ee263952e65b3610b8ba51229d1f9-Paper.pdf
- Robin Hanson, *Market Scoring Rules* (2007): https://mason.gmu.edu/~rhanson/mktscore.pdf
- Nolan Miller, Paul Resnick, Richard Zeckhauser, *Eliciting Informative Feedback: The Peer-Prediction Method* (2005): https://www.presnick.people.si.umich.edu/papers/elicit/FinalPrePub.pdf
- Drazen Prelec, *A Bayesian Truth Serum for Subjective Data* (2004): https://www.science.org/doi/10.1126/science.1102081

## Recommendation

Under a fresh redeploy, I recommend:

- cumulative Bayesian rating
- stronger prior than the current system
- epoch-weighted evidence for rating
- separate score and confidence
- slash gating with evidence floors and minimum settled rounds
- no nonlinear stake transform in version 1

That gets Curyo most of the precision and safety benefits we want without turning the protocol into a fundamentally different market design.
