# Rating System Redesign Plan

## Scope

Assumption for this note: we are free to **redeploy the relevant protocol contracts, Ponder indexer, and frontend** rather than preserving storage compatibility with the current deployment.

That changes the plan materially:

- we do not need to preserve the current `uint8 rating` storage layout
- we do not need to dual-write legacy and new rating state forever
- we can redesign submitter-slash logic together with rating logic
- we should still preserve the protocol's current anti-herding and adversarial guarantees unless we intentionally replace them

## TL;DR

- The current deployment has a semantic gap: the UI and whitepaper ask users whether the current displayed score should go up or down, but the contract ignores that displayed score and recomputes a fresh absolute score from the current round only.
- Because the product intentionally shows the current score before voting, the new model should treat votes as **score-relative observations**, not as absolute up/down evidence.
- The recommended redesign is a **reference-aware latent rating model**: keep a canonical per-round reference score on-chain, update the current rating from the current displayed level, and damp later movement as evidence accumulates.
- The cleanest deployable approximation is a **logit-space update rule with confidence damping** driven by epoch-weighted round imbalance.
- Confidence still matters separately from score. Feed ranking, safety actions, and slash logic should use minimum evidence thresholds and conservative ranking, not score alone.
- Since the displayed score now becomes part of the mechanism, canonical score display and round-anchor integrity become security-critical product requirements.

## Why The Plan Changed

The previous redesign memo recommended a cumulative Beta-style evidence accumulator. That was a meaningful improvement over the current per-round reset, but it still treated each up or down vote as direct evidence about absolute content quality.

That is not the best fit for Curyo's actual product behavior.

In the current product:

- the rating orb is shown directly above the vote buttons
- the UI tells users to vote up when the content "deserves a better score" and down when it "deserves a worse one"
- the whitepaper copy says voters decide whether the current community rating should move up or down based on the current score shown by the frontend

That means an up vote is best interpreted as:

```text
"the score I see is too low"
```

and a down vote is best interpreted as:

```text
"the score I see is too high"
```

So the score visible to users is not passive context. It is part of the voting mechanism itself.

## Current Semantic Gap

Today the system mixes two different meanings of a vote:

- **product meaning**: "should the displayed score move up or down from here?"
- **contract meaning**: "compute a fresh absolute score from this round's up/down stake only"

Under the deployed formula:

```text
rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + 50)
```

the previous rating is not an input to the next rating update.

So if round 1 settles at `60 up / 40 down`, the rating becomes about `56.7`.
If round 2 again settles at `60 up / 40 down`, the current deployment computes about `56.7` again.

That is mathematically coherent, but it conflicts with the product intuition many users will naturally have:

```text
"if people again say the score should be higher than 56.7, then the next score should rise again"
```

For a redeploy, the plan should resolve that ambiguity instead of documenting around it.

## Research Synthesis

The most relevant literature points to a hybrid view of the problem.

### 1. Visible scores change later judgments

- Tversky and Kahneman's anchoring work shows that displayed reference points shift later judgment.
- Prospect theory and later reference-dependence work show that people evaluate outcomes relative to a reference point, not only in absolute terms.
- Online-rating studies and social-influence experiments show that visible prior ratings and popularity signals affect later ratings and can create path dependence and herding.

Implication for Curyo:

- if the frontend shows a rating before the vote, the vote is partly about that reference point
- a model that ignores the displayed score is mis-specified for the actual product

### 2. Binary choices are naturally modeled as threshold comparisons

- Thurstone and Bradley-Terry style models interpret binary outcomes as noisy comparisons between latent quantities.
- In Curyo, the natural comparison is between latent content quality and the displayed score.

Implication for Curyo:

```text
up   => latent quality is above the displayed score
down => latent quality is below the displayed score
```

### 3. Dynamic ratings should track both mean and uncertainty

- Glickman and TrueSkill show how dynamic systems benefit from separating the current estimate from uncertainty.
- Jøsang's Beta Reputation System remains useful as a baseline for binary evidence aggregation, but it is a better fit when votes are absolute approvals/disapprovals rather than score-relative adjustments.

Implication for Curyo:

- the redesign should track score and confidence separately
- the score should update from the current displayed level
- the confidence should damp movement over time and gate safety actions

### 4. Showing the score creates both value and risk

Visible scores can be useful:

- they give voters a clear question
- they let the system behave like a correction process around a known reference point

Visible scores also create risk:

- anchoring
- social influence
- manipulation via stale or misleading frontend displays
- path dependence from early rounds

Implication for Curyo:

- the displayed score should remain visible if that is the intended product
- but the protocol must treat the displayed reference score as a canonical part of the round, not an incidental UI detail

## Design Goals

- Align product copy, frontend behavior, and contract math around one meaning of a vote.
- Make repeated majority-up or majority-down rounds move the score from the current displayed level.
- Preserve the protocol's anti-herding incentives by using epoch-weighted evidence.
- Keep the on-chain update rule simple enough to audit.
- Separate score from confidence.
- Prevent one low-evidence round from causing harsh economic actions.
- Make the canonical round reference score explicit so that multi-frontend deployments do not ask different questions by accident.

## Non-Goals

- Perfectly infer objective truth from subjective votes.
- Eliminate coalitional influence entirely.
- Replace the current reward system with a full market-maker or peer-prediction protocol.
- Hide the current score before voting. That would be a different product choice, and if Curyo wants that path it should switch back toward a more absolute evidence model.

## Recommended Model

### 1. Treat each round as a question about the displayed score

The right conceptual model is:

```text
P(up | q, s_t) = sigmoid(lambda * (q - s_t))
```

where:

- `q` is latent content quality
- `s_t` is the current displayed score for round `t`
- `lambda` controls how sharply voters react when they think the displayed score is wrong

Interpretation:

- if the displayed score is well calibrated, the round should be close to `50 / 50`
- if the round settles clearly up-heavy, the displayed score was too low
- if the round settles clearly down-heavy, the displayed score was too high

This matches the actual user experience much better than an absolute Beta accumulator.

### 2. Make the round anchor explicit and canonical

Because the displayed score affects votes, the protocol should make the round's reference score explicit.

Recommended rule:

- when a new round opens, snapshot `roundReferenceRatingBps`
- every frontend should read and display that exact value for the round
- commits should include or validate the expected round anchor so stale clients cannot silently vote against a different reference state

Why this matters:

- if two frontends show different scores for the same round, they are effectively asking different questions
- once the score is part of the mechanism, frontend display integrity becomes a security issue, not just a UX issue

### 3. Use a score-relative update rule on-chain

The ideal statistical model is a latent-quality posterior with a score-relative likelihood. That is more complex than we need for v1.

A clean deployable approximation is:

```text
roundEvidence_t = weightedUp_t + weightedDown_t
roundSignal_t = (weightedUp_t - weightedDown_t) / (weightedUp_t + weightedDown_t + B_round)

K_t = K0 / sqrt(1 + cumulativeEffectiveEvidence_t / E_ref)

ratingLogit_{t+1} = clamp(ratingLogit_t + K_t * roundSignal_t, -L_max, L_max)
ratingBps_{t+1} = floor(10000 * sigmoid(ratingLogit_{t+1}))

cumulativeEffectiveEvidence_{t+1} =
  cumulativeEffectiveEvidence_t + roundEvidence_t
```

Recommended starting constants for simulation:

```text
B_round = 50
K0 = 1.5
E_ref = 200
L_max = logit(0.99) ~= 4.595
```

Why this works well:

- it updates from the current displayed score instead of resetting from 50 every round
- repeated up-heavy rounds continue to lift the score
- repeated down-heavy rounds continue to lower the score
- movement naturally slows as cumulative evidence grows
- logit-space updates avoid unrealistic linear behavior near 0 and 100
- the formula stays simple enough to audit

### 4. Use epoch-weighted evidence for rating, not raw stake

The protocol already discounts late visible voting for rewards and winner determination. The new rating system should inherit that logic.

Recommended input:

```text
weightedUp_t = epoch-weighted revealed up stake
weightedDown_t = epoch-weighted revealed down stake
```

Why:

- blind votes are less herding-prone
- visible late votes are more anchor-contaminated
- if the product intentionally shows the score, the rating model should be especially careful not to over-weight late visible bandwagon behavior

### 5. Track confidence separately from score

The displayed score alone is not enough.

Recommended state:

- `ratingBps`
- `ratingLogitX18`
- `ratingEffectiveEvidence`
- `ratingSettledRounds`
- `ratingLastUpdatedAt`

Recommended derived values:

- `ratingConfidenceBps`
- `ratingConservativeBps` or another conservative ranking field

Initial recommendation:

- compute `ratingBps` on-chain
- compute conservative ranking and richer confidence indicators off-chain in Ponder / API
- display confidence in the frontend so users know whether the shown score is provisional or established

One simple starting confidence proxy:

```text
ratingConfidence = 1 - exp(-ratingEffectiveEvidence / E_conf)
```

This is not the only possible choice, but it is easy to reason about and monotonic.

### 6. Redesign slash logic with score-relative ratings in mind

Under a score-relative model, a low rating alone should never be enough to slash a submitter.

Safer rule:

- do not slash from one low-evidence round
- require all of:
  - `ratingBps < 2500`
  - `ratingSettledRounds >= 2`
  - `ratingEffectiveEvidence >= minSlashEvidence`
  - grace period elapsed

Suggested starting point:

```text
minSlashEvidence = 200 weighted cREP-equivalent
```

This preserves the important distinction between:

- "the current displayed score looks low"
- "the system has high enough confidence to impose an economic penalty"

### 7. Why the previous Beta-style plan is no longer the primary recommendation

The cumulative Beta model is still useful as:

- a benchmark in simulation
- a backup design if Curyo later hides the score before voting
- an off-chain comparison model for calibration

But once users see the score and vote relative to it, the Beta model no longer matches the semantics of a vote as closely as a score-relative latent update.

## UI And Product Requirements

If Curyo adopts the score-relative model, the UI should lean into that explicitly.

Recommended frontend behavior:

- keep showing the current score because it is part of the question
- label it clearly as the **current round reference score**
- ask a precise question such as "Should this content be rated higher or lower than 5.7?"
- show confidence or "provisional / established" status next to the score
- show rating history and recent movement so users understand direction and stability

Important product consequence:

- if the score is visible, the UI is no longer neutral presentation
- the UI becomes part of the economic mechanism

That means the round anchor, confidence label, and explanatory copy deserve the same rigor as contract parameters.

## Example Voting Behaviour Over Time

The examples below use the proposed score-relative update rule with:

- `B_round = 50`
- `K0 = 1.5`
- `E_ref = 200`
- all evidence numbers already epoch-weighted

These numbers are illustrative. The simulation phase should tune them before deployment.

### Example 1: Repeated mildly up-heavy rounds

Each round settles at `60 up / 40 down`.

| Round | Current deployed formula | Proposed score-relative model |
| --- | ---: | ---: |
| 1 | 56.7 | 55.0 |
| 2 | 56.7 | 59.0 |
| 3 | 56.7 | 62.4 |
| 4 | 56.7 | 65.3 |
| 5 | 56.7 | 67.9 |

Interpretation:

- the current deployment keeps rediscovering the same absolute score
- the proposed model behaves like users expect from the UI: if voters keep saying "higher than the current score," the score keeps rising
- movement slows over time because confidence increases

### Example 2: Attack first, honest recovery later

Round sequence:

- Round 1: `0 up / 100 down`
- Rounds 2-4: `80 up / 20 down`

| Round | Current deployed formula | Proposed score-relative model |
| --- | ---: | ---: |
| 1 | 16.7 | 26.9 |
| 2 | 70.0 | 37.5 |
| 3 | 70.0 | 47.9 |
| 4 | 70.0 | 57.3 |

Interpretation:

- the current deployment whipsaws from one extreme to another because each round overwrites the previous score
- the proposed model is harder to jerk around with one attack round
- recovery happens across multiple honest rounds instead of instantly

### Example 3: Late-herding pressure

Suppose the first blind round settles at `60 up / 40 down`, and later visible rounds are more lopsided only after voters can see more context and more social information.

If later `80 / 20` rounds count at full weight:

| Step | Unweighted score-relative score |
| --- | ---: |
| After blind round | 55.0 |
| After late round 2 | 66.6 |
| After late round 3 | 75.3 |

If those later rounds count at `25%` effective weight:

| Step | Weighted score-relative score |
| --- | ---: |
| After blind round | 55.0 |
| After late round 2 | 60.9 |
| After late round 3 | 66.4 |

Interpretation:

- score-relative updating does not remove herding risk by itself
- epoch weighting still matters a lot once the displayed score influences later votes
- discounting late visible evidence keeps the mechanism closer to blind information aggregation

## Game-Theoretic Analysis

### What improves

#### Semantic alignment improves strategic clarity

Under the redesign, the protocol finally matches the question users think they are answering:

- up means "the score should be higher than this"
- down means "the score should be lower than this"

That reduces one source of product confusion and makes observed voter behavior easier to interpret.

#### Repeated majority pressure can move the score in the expected direction

This is the main benefit of the redesign.

If a content item is consistently judged as undervalued or overvalued relative to its current displayed score, the score continues to move until the round outcomes become closer to balanced.

That gives the system a plausible notion of convergence:

- calibrated items should settle near rounds that are close to `50 / 50`
- miscalibrated items should keep getting nudged

#### Anti-herding can remain internally consistent

If rating updates also use epoch-weighted evidence:

- blind votes carry more informational weight
- late visible votes can still matter, but less
- the public score no longer gives full influence to the most anchor-contaminated evidence

#### One-round whipsaw becomes less severe

Because the new score updates from the previous score rather than overwriting it, one attack round is less decisive than in the current deployment.

### What does not improve automatically

#### Truth is still not a dominant strategy

This remains a stake-weighted coordination game.

Voters are rewarded for ending up on the winning side, so their incentive is still:

- predict future consensus
- not directly reveal objective truth

The redesign improves the semantics of the score, but it does not magically convert the mechanism into a truth oracle.

#### Visible scores create anchoring and path dependence

If a score is shown before the vote, later votes will be partly shaped by that score.

That means:

- early rounds matter more than they would in a hidden-score system
- mistaken early anchors can influence later judgments
- the process can exhibit momentum, lock-in, or slow correction

This is not necessarily a bug. It is the natural consequence of a score-relative product.

The correct response is to design for it explicitly.

## Security And Adversarial Considerations

### 1. Frontend anchor manipulation becomes a real attack surface

Risk:

- a malicious or stale frontend shows the wrong current score
- users think they are answering one question while the chain settles another

Why this matters more now:

- if the displayed score shapes the vote, misleading display changes user behavior even if the transaction format is otherwise valid

Mitigations:

- snapshot `roundReferenceRatingBps` on-chain
- require frontends to render the round anchor from chain state
- validate the expected anchor during commit
- echo the reference score in wallet confirmation and activity views where feasible

### 2. Ratchet attacks across many rounds

Risk:

- a coalition can push the score in one direction through repeated modestly winning rounds instead of one giant attack

This is more realistic under the new model because repeated `60 / 40` rounds really do keep moving the score.

Mitigations:

- damp update size as evidence accumulates
- keep per-voter caps and Voter ID
- use conservative ranking for low-confidence content
- monitor multi-round directional manipulation in analytics

### 3. Herding and social-influence amplification

Risk:

- visible scores and revealed history can cause later voters to cluster
- the system can become overconfident in a path-dependent consensus

Mitigations:

- retain the blind commit phase
- use epoch-weighted evidence for rating
- show confidence or provisional labels so users understand that low-evidence scores are not settled truths
- consider product experiments around how much historical context to show before a vote

### 4. Path dependence and lock-in

Risk:

- if the score becomes established too quickly, later honest corrections may be too slow

Mitigations:

- tune `K0`, `E_ref`, and `B_round` in simulation
- test contradictory-round recovery explicitly
- if needed, add a later v1.1 mechanism where major contradictory rounds modestly widen uncertainty again instead of only shrinking it forever

### 5. Slash griefing

Risk:

- attackers may accept losses if pushing a target below a slash threshold creates a larger external payoff

Mitigations:

- minimum slash evidence
- minimum settled rounds
- grace periods
- do not trigger slashing from a single low score alone

### 6. Low-confidence sniping

Risk:

- new or low-evidence items move more per round, so attackers focus effort there

Mitigations:

- display low confidence clearly
- rank by conservative score rather than raw score
- require minimum evidence before using rating for high-stakes actions

### 7. Self-opposition and coalition behavior

The repo already has adversarial tests showing self-opposition is directly unprofitable under the current reward split.

The redesign should preserve that by:

- keeping the reward split independent from score delta size
- not paying extra rewards for causing bigger score movement

Important nuance:

- even if self-opposition remains directly unprofitable, score manipulation can still be worthwhile as griefing or as an attack on off-protocol reputation

### 8. Precision and arithmetic risk

A logit-based score model introduces new implementation risk:

- fixed-point sign errors
- overflow or truncation
- incorrect clamp behavior near 0 and 100
- mismatched units between raw stake, weighted stake, and confidence

Mitigations:

- standardize units explicitly
- fuzz the update path
- add invariants:
  - `ratingBps` always in `[0, 10000]`
  - `ratingLogit` always in clamp range
  - stronger round signals move the score more than weaker signals, all else equal
  - zero round signal leaves the score unchanged

## Why I Do Not Recommend Other Models For V1

### Pure cumulative Beta accumulator

Pros:

- simple
- interpretable
- good when votes are absolute evidence

Why not as the primary redesign:

- it does not naturally model the fact that users vote relative to a displayed score
- it still misreads the semantics of the product if the visible score remains part of the voting flow

### LMSR / market-maker redesign

Pros:

- strong information-aggregation theory
- elegant pricing interpretation

Why not now:

- it changes the protocol much more than necessary
- it is not the smallest change that resolves Curyo's semantic mismatch

### Peer prediction / Bayesian Truth Serum

Pros:

- theoretically appealing for subjective information elicitation

Why not now:

- much harder to explain
- much farther from the current user and contract mental model
- does not directly solve the displayed-score reference problem

## Proposed Contract Surface

### Round state

Add an explicit reference score to the round:

- `uint32 roundReferenceRatingBps`

This should be snapshotted when the round opens and treated as the canonical question for that round.

### Content rating state

Recommended fresh-deploy state:

- `int128 ratingLogitX18` or a similar signed fixed-point type
- `uint32 ratingBps`
- `uint128 ratingEffectiveEvidence`
- `uint32 ratingSettledRounds`
- `uint48 ratingLastUpdatedAt`

Optional:

- `uint32 ratingConfidenceBps` if later stored on-chain

### Config state

`ProtocolConfig` should gain a rating config surface such as:

- `ratingRoundBiasB`
- `ratingBaseK`
- `ratingEvidenceRef`
- `minSlashEvidence`
- `minSlashSettledRounds`
- `lateEpochEvidenceWeightBps`

### Events

Prefer an explicit event such as:

- `RatingUpdated(contentId, roundId, referenceRatingBps, oldRatingBps, newRatingBps, roundSignal, cumulativeEvidence)`

This makes it much easier to audit how a round moved the score.

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

- `packages/nextjs/components/shared/VotingQuestionCard.tsx`
- `packages/nextjs/components/shared/CuryoVoteButton.tsx`
- `packages/nextjs/components/shared/RatingOrb.tsx`
- `packages/nextjs/components/shared/RatingHistory.tsx`
- `packages/nextjs/lib/ui/ratingDisplay.ts`
- `packages/nextjs/scripts/whitepaper/sections.ts`
- `packages/nextjs/app/docs/how-it-works/page.tsx`

## Tests To Expand

- `packages/foundry/test/RewardMath.t.sol`
- `packages/foundry/test/RewardMathFuzz.t.sol`
- `packages/foundry/test/InvariantRating.t.sol`
- `packages/foundry/test/RoundIntegration.t.sol`
- `packages/foundry/test/SubmitterStakeResolution.t.sol`
- `packages/foundry/test/SelectiveRevelationTest.t.sol`
- `packages/foundry/test/SelfOppositionProfitability.t.sol`
- `packages/foundry/test/AdversarialTests.t.sol`

New test focus areas:

- round anchor snapshot correctness
- stale-anchor commit rejection
- repeated mild-majority rounds ratcheting in the expected direction
- contradictory-round recovery
- confidence gating for slashability

## Recommended Implementation Plan

### Phase 1: Behavioral and attack simulation

- replay historical round data off-chain
- compare:
  - current deployed formula
  - cumulative Beta accumulator
  - score-relative logit update with different `K0`, `E_ref`, and `B_round`
  - weighted vs unweighted round evidence
- run synthetic agent experiments where voters react to the displayed score with:
  - no anchoring bias
  - mild anchoring bias
  - strong social-influence bias
- measure:
  - score volatility
  - time-to-calibration
  - recovery after attack rounds
  - low-confidence ratchet risk
  - slash false-positive risk

### Phase 2: Contract redesign

- add canonical `roundReferenceRatingBps`
- redesign rating state around score-relative updates
- add rating config to `ProtocolConfig`
- update settlement path to apply the score-relative rule from the current rating
- redesign slash conditions to use evidence floors and minimum rounds
- emit richer rating events

### Phase 3: Indexer and API

- index round anchors, rating state, and effective evidence
- expose both raw score and confidence-aware ranking fields
- keep per-round movement queryable for audits and research

### Phase 4: Product rollout

- show score plus confidence, not score alone
- explain that the visible score is the round's reference point
- show whether the score is provisional or established
- ensure all frontends use the same canonical round anchor

### Phase 5: Adversarial validation

- extend the existing self-opposition and selective-reveal suites
- add stale-frontend and wrong-anchor tests
- add multi-round ratchet simulations
- add invariant tests around monotonicity, bounds, and anchor integrity

## Research References

- Amos Tversky and Daniel Kahneman, *Judgment under Uncertainty: Heuristics and Biases* (1974): https://doi.org/10.1126/science.185.4157.1124
- Daniel Kahneman and Amos Tversky, *Prospect Theory: An Analysis of Decision under Risk* (1979): https://www.jstor.org/stable/1914185
- L. L. Thurstone, *A Law of Comparative Judgment* (1927): https://doi.org/10.1037/h0070288
- R. A. Bradley and M. E. Terry, *Rank Analysis of Incomplete Block Designs* (1952): https://doi.org/10.2307/2334029
- Victor Kontsevich and Christopher W. Tyler, *Bayesian Adaptive Estimation of Psychometric Slope and Threshold* (1999): https://doi.org/10.1016/S0042-6989(98)00285-5
- Miguel A. Garcia-Perez and Rocio Alcala-Quintana, *The Transformed Up-Down Methods for Psychophysics* (2007): https://doi.org/10.1348/000711006X104596
- Mark E. Glickman, *Parameter Estimation in Large Dynamic Paired Comparison Experiments* (1999): https://www.glicko.net/research/glicko.pdf
- Ralf Herbrich, Tom Minka, and Thore Graepel, *TrueSkill* (2006): https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system-2/
- Audun Josang and Roslan Ismail, *The Beta Reputation System* (2002): https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf
- Matthew J. Salganik, Peter Sheridan Dodds, and Duncan J. Watts, *Experimental Study of Inequality and Unpredictability in an Artificial Cultural Market* (2006): https://doi.org/10.1126/science.1121066
- Lev Muchnik, Sinan Aral, and Sean J. Taylor, *Social Influence Bias: A Randomized Experiment* (2013): https://doi.org/10.1126/science.1240466
- Yigit Oezcelik and Michel Tolksdorf, *Non-Numerical and Social Anchoring in Consumer-Generated Ratings* (2023 working paper): https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID4664787_code5750441.pdf?abstractid=4373797&mirid=1

## Recommendation

Under a fresh redeploy, I recommend:

- keep the visible score as part of the product
- formally treat it as the round's canonical reference point
- replace the current per-round overwrite with a score-relative logit update rule
- use epoch-weighted evidence for rating
- expose confidence separately from score
- gate slashability on low score plus minimum evidence and minimum rounds
- treat frontend anchor integrity as part of protocol security

This is the smallest redesign that actually matches how users appear to understand the product today.
