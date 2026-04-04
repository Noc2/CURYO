# Rating System Implementation Plan

## Scope

This note turns the redesign in [rating-system-redesign-plan.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-plan.md) into an implementation roadmap for a **fresh redeploy**.

Assumptions locked for this implementation:

- score-relative voting is the intended product semantics
- the current score and rating history stay visible before voting
- governance should be able to tune bounded numeric parameters later
- structural model changes still require a contract upgrade, not just governance

Companion notes:

- high-level product and mechanism rationale: [rating-system-redesign-plan.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-plan.md)
- local simulation pass: [rating-system-redesign-simulations.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-simulations.md)

## Implementation Recommendation

Implement v1 as a **reference-aware logit update with dynamic confidence mass**.

This keeps the on-chain math simple enough to audit while still matching the product meaning of a vote:

```text
"the displayed score for this round is too low"
or
"the displayed score for this round is too high"
```

Recommended v1 settlement update:

```text
anchorLogit_t = logit(roundReferenceRatingBps_t / 10000)
roundEvidence_t = weightedUp_t + weightedDown_t

pObs_t = (weightedUp_t + ratingSmoothingAlpha) /
         (weightedUp_t + weightedDown_t + ratingSmoothingAlpha + ratingSmoothingBeta)

gapObs_t = logit(pObs_t) / ratingObservationBeta
stepRaw_t = roundEvidence_t / (roundEvidence_t + ratingConfidenceMass_t)
deltaLogit_t = clamp(stepRaw_t * gapObs_t, -ratingMaxDeltaLogit, ratingMaxDeltaLogit)

ratingLogit_{t+1} =
  clamp(anchorLogit_t + deltaLogit_t, -ratingMaxAbsLogit, ratingMaxAbsLogit)

ratingBps_{t+1} = floor(10000 * sigmoid(ratingLogit_{t+1}))
```

Dynamic confidence update:

```text
surprise_t = min(1, abs(gapObs_t) / ratingSurpriseReference)

ratingConfidenceMass_{t+1} =
  clamp(
    ratingConfidenceMass_t
    + ratingConfidenceGain * roundEvidence_t
    - ratingConfidenceReopen * surprise_t * roundEvidence_t,
    ratingConfidenceMassMin,
    ratingConfidenceMassMax
  )
```

Why this is the right v1 trade-off:

- it compounds from the displayed round anchor instead of resetting from 50
- it keeps repeated majority-up or majority-down rounds moving the score in the same direction
- it gives established history real inertia
- it still lets contradictory evidence reopen the system instead of freezing forever
- it only requires arithmetic that is realistic to audit and fuzz on-chain

## Initial Parameters

These are **starting values**, not sacred constants. They should be configurable through governance and snapshotted when a round opens.

All evidence values below are in **epoch-weighted cREP**, not raw stake.

| Parameter | Initial value | Suggested governance range | Notes |
| --- | ---: | ---: | --- |
| `ratingSmoothingAlpha` | `10` | `5 - 25` | Up-side smoothing in weighted cREP. |
| `ratingSmoothingBeta` | `10` | `5 - 25` | Down-side smoothing in weighted cREP. |
| `ratingObservationBeta` | `2e18` | `1.5e18 - 3e18` | Converts observed vote-share log-odds into latent rating movement. |
| `ratingConfidenceMassInitial` | `80e18` | `50e18 - 150e18` | Starting damping for new content. |
| `ratingConfidenceMassMin` | `50e18` | `25e18 - 100e18` | Prevents tiny contradictory rounds from making new content wildly unstable. |
| `ratingConfidenceMassMax` | `500e18` | `250e18 - 1000e18` | Prevents old content from becoming impossible to move. |
| `ratingConfidenceGain` | `0.15e18` | `0.05e18 - 0.25e18` | Confidence increase per unit of settled evidence. |
| `ratingConfidenceReopen` | `0.20e18` | `0.10e18 - 0.40e18` | Confidence reopening strength for surprising rounds. |
| `ratingSurpriseReference` | `0.8e18` | `0.5e18 - 1.2e18` | Normalizes how quickly contradiction reopens confidence. |
| `ratingMaxDeltaLogit` | `0.60e18` | `0.40e18 - 1.00e18` | Caps one-round score movement in latent space. |
| `ratingMaxAbsLogit` | `4.595e18` | fixed | Equivalent to clamping displayed scores to `[1, 99]`. |
| `slashThresholdBps` | `2500` | `1500 - 3500` | Legacy threshold kept as a starting point, but applied to a conservative bound. |
| `minSlashEvidence` | `200e18` | `100e18 - 500e18` | Minimum cumulative weighted evidence before slashability can trigger. |
| `minSlashSettledRounds` | `2` | `2 - 5` | Prevents single-round slash events. |
| `minSlashLowDuration` | `7 days` | `3 - 14 days` | Requires sustained low rating before slash execution. |

### Why these defaults

- The smoothing values are intentionally modest because dynamic confidence already supplies a second damping layer.
- The confidence defaults are taken from the simulation family in [rating-system-redesign-simulations.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-simulations.md), where they gave visible multi-round movement without making later correction too hard.
- The slash defaults are conservative because score-relative systems are visibly anchor-sensitive, so economic punishment should require evidence, breadth, and persistence.

## Governance Design

### 1. Split tunable parameters from structural rules

Add two governance-controlled structs in `ProtocolConfig`:

```solidity
struct RatingConfig {
    uint256 ratingSmoothingAlpha;
    uint256 ratingSmoothingBeta;
    uint256 ratingObservationBetaX18;
    uint256 ratingConfidenceMassInitialX18;
    uint256 ratingConfidenceMassMinX18;
    uint256 ratingConfidenceMassMaxX18;
    uint256 ratingConfidenceGainX18;
    uint256 ratingConfidenceReopenX18;
    uint256 ratingSurpriseReferenceX18;
    uint256 ratingMaxDeltaLogitX18;
    uint256 ratingMaxAbsLogitX18;
}

struct SlashConfig {
    uint16 slashThresholdBps;
    uint32 minSlashSettledRounds;
    uint48 minSlashLowDuration;
    uint256 minSlashEvidenceX18;
}
```

Recommended governance rule:

- `RatingConfig` is mutable by governance but **snapshotted per round**
- `SlashConfig` is mutable by governance but **snapshotted per content** when the content is created
- model shape, payload format, and storage layout remain upgrade-controlled

### 2. Snapshot rules

Snapshot the following when a round opens:

- `RoundConfig`
- `revealGracePeriod`
- drand config
- `RatingConfig`
- `roundReferenceRatingBps`

Snapshot the following when content is created:

- `SlashConfig`

This avoids two dangerous behaviors:

- mid-round governance changes silently changing the question voters answered
- later governance changes making previously healthy content suddenly slashable

## Contract Workstream

### 1. `ProtocolConfig`

Files:

- [ProtocolConfig.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ProtocolConfig.sol)

Changes:

- add `RatingConfig` storage, setters, getters, bounds checks, and events
- add `SlashConfig` storage, setters, getters, bounds checks, and events
- add a convenience getter that returns the whole active config bundle for indexers and frontends

Recommended new events:

- `RatingConfigUpdated(...)`
- `SlashConfigUpdated(...)`

### 2. Rating math library

Files:

- add `packages/foundry/contracts/libraries/RatingMath.sol`

Changes:

- move rating update math out of `RewardMath`
- expose pure helpers for:
  - `ratingToLogitX18`
  - `logitToRatingBps`
  - `computeObservedGapX18`
  - `computeRoundDeltaLogitX18`
  - `updateConfidenceMassX18`
  - `computeConservativeRatingBps`

Keep `RewardMath.sol` focused on reward settlement.

### 3. Vote payload and commit binding

Files:

- [TlockVoteLib.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/libraries/TlockVoteLib.sol)
- [RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol)
- [tlock-voting.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/e2e/helpers/tlock-voting.ts)

Changes:

- extend the transfer payload to include `roundReferenceRatingBps`
- extend the commit preimage to include `roundReferenceRatingBps`
- reject commits whose provided reference score does not match the round snapshot

Recommended payload:

```text
(contentId, roundReferenceRatingBps, commitHash, ciphertext, frontend, targetRound, drandChainHash)
```

Recommended commit preimage:

```text
keccak256(
  isUp,
  salt,
  contentId,
  roundReferenceRatingBps,
  targetRound,
  drandChainHash,
  keccak256(ciphertext)
)
```

### 4. `RoundVotingEngine`

Files:

- [RoundVotingEngine.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/RoundVotingEngine.sol)

Changes:

- snapshot `RatingConfig` and `roundReferenceRatingBps` when a new round opens
- add `roundReferenceRatingBpsSnapshot[contentId][roundId]`
- expose getters so frontends can always show the canonical round anchor
- feed epoch-weighted up/down pools into `RatingMath`
- emit richer rating-settlement events

Recommended new events:

- `RoundReferenceSnapshotted(contentId, roundId, roundReferenceRatingBps)`
- `RatingUpdated(contentId, roundId, referenceRatingBps, oldRatingBps, newRatingBps, conservativeRatingBps, effectiveEvidenceX18)`

### 5. `ContentRegistry`

Files:

- [ContentRegistry.sol](/Users/davidhawig/source/curyo-release/packages/foundry/contracts/ContentRegistry.sol)

Changes:

- replace the legacy `uint8 rating` assumption with a richer rating state
- store a per-content slash policy snapshot
- move slash resolution to conservative-bound logic

Recommended rating state for redeploy:

```solidity
struct RatingState {
    uint16 ratingBps;
    uint16 conservativeRatingBps;
    int256 ratingLogitX18;
    uint256 confidenceMassX18;
    uint256 effectiveEvidenceX18;
    uint32 settledRounds;
    uint48 lastUpdatedAt;
}
```

Recommended slash rule:

- content becomes slashable only if:
  - `conservativeRatingBps < slashThresholdBps`
  - `effectiveEvidenceX18 >= minSlashEvidenceX18`
  - `settledRounds >= minSlashSettledRounds`
  - the low-bound condition has persisted for at least `minSlashLowDuration`

This should replace the current point-estimate `rating < 25` logic.

## Indexer and API Workstream

### Ponder schema

Files:

- [ponder.schema.ts](/Users/davidhawig/source/curyo-release/packages/ponder/ponder.schema.ts)

Changes:

- change `content.rating` from a single display score to a richer state:
  - `ratingBps`
  - `conservativeRatingBps`
  - `effectiveEvidence`
  - `settledRounds`
  - `lastRatingUpdatedAt`
- add round-level fields:
  - `referenceRatingBps`
  - `weightedUp`
  - `weightedDown`
  - `ratingDeltaBps`
- extend rating history rows to capture:
  - `referenceRatingBps`
  - `oldRatingBps`
  - `newRatingBps`
  - `conservativeRatingBps`
  - `effectiveEvidence`

### API responses

Files:

- [content-routes.ts](/Users/davidhawig/source/curyo-release/packages/ponder/src/api/routes/content-routes.ts)

Changes:

- return both `ratingBps` and `conservativeRatingBps`
- expose a frontend-ready confidence label or raw confidence inputs
- include `roundReferenceRatingBps` in round detail responses
- preserve historical data needed for the rating chart

Recommended API shape:

- `rating`
- `confidence`
- `conservativeRating`
- `effectiveEvidence`
- `settledRounds`
- `currentRound.referenceRating`

## Frontend Workstream

### Voting surface

Files:

- [CuryoVoteButton.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/shared/CuryoVoteButton.tsx)
- [VotingQuestionCard.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/shared/VotingQuestionCard.tsx)

Changes:

- make the score-relative question explicit
- render the canonical `roundReferenceRatingBps` used for this round
- clarify that votes mean “higher than this score” or “lower than this score”

Suggested copy direction:

- Up: `Too low`
- Down: `Too high`
- Helper text: `Vote relative to the current round score`

### Rating display and history

Files:

- [RatingHistory.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/shared/RatingHistory.tsx)
- [ratingDisplay.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/lib/ui/ratingDisplay.ts)

Changes:

- keep the main score visible
- add a confidence label such as `provisional`, `building confidence`, or `well established`
- chart history from settled round anchors and post-settlement scores
- optionally shade or annotate low-confidence segments

Important product rule:

- history stays visible before voting
- only the round reference score is commit-bound
- history and confidence are informative context, not signed commit inputs

## Docs and Whitepaper Workstream

Files to update:

- [rating-system-redesign-plan.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-plan.md)
- [rating-system-redesign-simulations.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-simulations.md)
- [how-it-works/page.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/app/docs/how-it-works/page.tsx)
- [smart-contracts/page.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/app/docs/smart-contracts/page.tsx)
- [tokenomics/page.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/app/docs/tokenomics/page.tsx)
- [landingFaq.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/lib/docs/landingFaq.ts)
- [summary.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/scripts/whitepaper/summary.ts)
- [sections.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/scripts/whitepaper/sections.ts)

Documentation goals:

- remove the semantic mismatch between UI language and settlement math
- explain that the redesign is score-relative and governance-tunable
- explain that slashability now uses a conservative rating bound plus persistence
- cite the papers that motivated the design

## Test Plan

### Foundry

Add or update:

- `RatingMath.t.sol`
- `RatingMathFuzz.t.sol`
- `RoundVotingEngine` settlement tests for anchor snapshots
- payload/hash tests for `roundReferenceRatingBps`
- slash-path tests with:
  - low score but insufficient evidence
  - low score but insufficient dwell time
  - low score with sufficient evidence and persistence
- invariants for:
  - rating stays in `[1, 99]`
  - reference mismatch always reverts
  - identical round inputs under identical snapshots are deterministic

### Next.js / TypeScript

Add or update:

- payload helper tests in [tlock-voting.ts](/Users/davidhawig/source/curyo-release/packages/nextjs/e2e/helpers/tlock-voting.ts)
- rating display tests
- chart/history tests for new API fields

### Playwright

Add or update:

- vote flow shows canonical round score before commit
- stale or mismatched round anchor is rejected
- stable high-confidence content is only nudged by small later rounds

## Recommended Execution Order

Land the real implementation in this order:

1. `ProtocolConfig` and shared type additions
2. `RatingMath` library and Foundry unit tests
3. `TlockVoteLib` / payload / commit-preimage update
4. `RoundVotingEngine` round snapshot plumbing
5. `ContentRegistry` rating state and slash logic
6. ABI generation and package sync
7. Ponder schema and handlers
8. API and frontend rendering
9. Whitepaper, docs, and FAQ cleanup
10. End-to-end verification on a fresh local deployment

This sequence minimizes churn because each layer consumes the one below it.

## Recommended Commit Slices

To keep the implementation reviewable, split the future code work into narrow commits:

1. `Add governance-controlled rating and slash config`
2. `Add score-relative rating math library and tests`
3. `Bind round reference rating into vote payloads`
4. `Snapshot round anchors and settle score-relative ratings`
5. `Move submitter slashing to conservative rating bounds`
6. `Expose rating confidence and anchor data through Ponder/API`
7. `Update voting UI, charts, and copy for score-relative ratings`
8. `Refresh whitepaper and docs for redeployed rating model`

## Research Basis

The structure of this plan is informed by:

- Amos Tversky and Daniel Kahneman, *Judgment under Uncertainty: Heuristics and Biases* (1974): https://doi.org/10.1126/science.185.4157.1124
- Daniel Kahneman and Amos Tversky, *Prospect Theory: An Analysis of Decision under Risk* (1979): https://www.jstor.org/stable/1914185
- L. L. Thurstone, *A Law of Comparative Judgment* (1927): https://doi.org/10.1037/h0070288
- R. A. Bradley and M. E. Terry, *Rank Analysis of Incomplete Block Designs* (1952): https://doi.org/10.2307/2334029
- Mark E. Glickman, *Parameter Estimation in Large Dynamic Paired Comparison Experiments* (1999): https://www.glicko.net/research/glicko.pdf
- Ralf Herbrich, Tom Minka, and Thore Graepel, *TrueSkill* (2006): https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system-2/
- Lawrence D. Brown, T. Tony Cai, and Anirban DasGupta, *Interval Estimation for a Binomial Proportion* (2001): https://doi.org/10.1214/ss/1009213286
- Alan Agresti and Brent A. Coull, *Approximate Is Better than "Exact" for Interval Estimation of Binomial Proportions* (1998): https://doi.org/10.1080/00031305.1998.10480550
- Audun Jøsang and Roslan Ismail, *The Beta Reputation System* (2002): https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf
- Matthew J. Salganik, Peter Sheridan Dodds, and Duncan J. Watts, *Experimental Study of Inequality and Unpredictability in an Artificial Cultural Market* (2006): https://doi.org/10.1126/science.1121066
- Lev Muchnik, Sinan Aral, and Sean J. Taylor, *Social Influence Bias: A Randomized Experiment* (2013): https://doi.org/10.1126/science.1240466

## Bottom Line

The simplest implementation that still matches the product is:

- snapshot the round reference score
- bind that score into the vote commit
- update ratings from that anchor on a logit scale
- damp movement with dynamic confidence
- make the numeric knobs governance-tunable
- use conservative slash rules with evidence and dwell requirements

That is the version I would build first.
