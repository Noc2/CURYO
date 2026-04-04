# Rating System Redesign Simulations

## Scope

This note records a small local simulation pass for the score-relative redesign proposed in [rating-system-redesign-plan.md](/Users/davidhawig/source/curyo-release/docs/rating-system-redesign-plan.md).

The goal here is not to declare final parameters. It is to pressure-test a candidate v1 family and compare:

- monotone confidence hardening
- contradiction-sensitive confidence reopening

## Candidate Model

The simulations use a simple score-relative latent update:

```text
anchorLogit_t = logit(currentDisplayedRating_t / 100)
roundEvidence_t = weightedUp_t + weightedDown_t

pObs_t = (weightedUp_t + a) / (weightedUp_t + weightedDown_t + a + b)
gapObs_t = logit(pObs_t) / beta

step_t = roundEvidence_t / (roundEvidence_t + confidenceMass_t)
ratingLogit_{t+1} = clamp(anchorLogit_t + step_t * gapObs_t, -L_max, L_max)
rating_{t+1} = 100 * sigmoid(ratingLogit_{t+1})
```

The dynamic-confidence variant then updates confidence as:

```text
surprise_t = min(1, abs(gapObs_t) / gRef)

confidenceMass_{t+1} =
  clamp(
    confidenceMass_t + gain * roundEvidence_t - reopen * roundEvidence_t * surprise_t,
    C_min,
    C_max
  )
```

Interpretation:

- rounds near `50 / 50` add confidence
- strongly one-sided rounds reduce hardening pressure by reopening uncertainty
- a higher `confidenceMass` means smaller future steps

## Candidate Parameters

The runs below use one illustrative parameterization:

```text
a = 10
b = 10
beta = 2
gain = 0.15
reopen = 0.20
gRef = 0.8
C0 = 80
C_min = 50
C_max = 500
L_max = logit(0.99)
```

All up/down numbers below should be read as already epoch-weighted evidence.

## Scenario 1: Repeated Mildly Up-Heavy Rounds

Each round settles at `60 up / 40 down`.

| Round | Rating | Confidence Mass | Observed Gap | Step |
| --- | ---: | ---: | ---: | ---: |
| 1 | 52.33 | 90.8 | 0.168 | 0.556 |
| 2 | 54.53 | 101.6 | 0.168 | 0.524 |
| 3 | 56.59 | 112.4 | 0.168 | 0.496 |
| 4 | 58.52 | 123.2 | 0.168 | 0.471 |
| 5 | 60.34 | 134.0 | 0.168 | 0.448 |

Takeaway:

- the score keeps moving upward when voters repeatedly say the displayed score is too low
- movement slows gradually as confidence mass grows

## Scenario 2: Attack Then Honest Recovery

Round sequence:

- Round 1: `0 up / 100 down`
- Rounds 2-5: `80 up / 20 down`

### Dynamic Confidence

| Round | Rating | Confidence Mass | Observed Gap | Step |
| --- | ---: | ---: | ---: | ---: |
| 1 | 33.94 | 75.0 | -1.199 | 0.556 |
| 2 | 41.29 | 76.3 | 0.549 | 0.571 |
| 3 | 48.99 | 77.5 | 0.549 | 0.567 |
| 4 | 56.68 | 78.8 | 0.549 | 0.563 |
| 5 | 64.02 | 80.1 | 0.549 | 0.559 |

### Monotone Confidence

| Round | Rating | Confidence Mass | Observed Gap | Step |
| --- | ---: | ---: | ---: | ---: |
| 1 | 33.94 | 95.0 | -1.199 | 0.556 |
| 2 | 40.51 | 110.0 | 0.549 | 0.513 |
| 3 | 46.93 | 125.0 | 0.549 | 0.476 |
| 4 | 53.03 | 140.0 | 0.549 | 0.444 |
| 5 | 58.67 | 155.0 | 0.549 | 0.417 |

Takeaway:

- contradiction-sensitive reopening materially improves recovery after a bad early round
- monotone hardening makes the system too sticky after a strong mistake or attack

## Scenario 3: Stable History Resists Small Later Nudges

Assume the content is already at `57.0` with `confidenceMass = 250`.

### One Later `5 up / 0 down` Round

| Rating Before | Rating After | Observed Gap | Step |
| --- | ---: | ---: | ---: |
| 57.00 | 57.10 | 0.203 | 0.020 |

### One Later `10 up / 0 down` Round

| Rating Before | Rating After | Observed Gap | Step |
| --- | ---: | ---: | ---: |
| 57.00 | 57.33 | 0.347 | 0.038 |

Takeaway:

- stable history creates real inertia
- one-sided but low-liquidity rounds still matter
- but they only nudge the score instead of replacing prior history

## Main Lessons

### 1. Dynamic uncertainty should be part of v1

The simulation strongly supports the design move already reflected in the main memo:

- confidence should not only increase
- surprising rounds should reopen uncertainty

Without that, the mechanism becomes too path-dependent.

### 2. Small smoothing constants are easier to work with

Using `a = b = 10` produced more legible score movement than the earlier heavier smoothing choices. This is not final, but it suggests the redesign should not over-smooth the round observation if confidence mass already supplies a second dampening channel.

### 3. History can matter without causing total lock-in

The dynamic-confidence version gives both:

- meaningful inertia for established content
- meaningful recovery after contradictory evidence

That is the behavior the redesign should aim for.

### 4. Low-liquidity movement caps still look prudent

Even with confidence reopening, very low-liquidity content remains easier to move than established content. The main plan's recommendation for:

- minimum effective-participation floors
- conservative ranking
- optional per-round movement caps

still looks justified.

## Recommended Next Simulation Pass

Before contracts are finalized, I would expand this into a proper script or notebook that sweeps:

- `a`, `b`, and `beta`
- confidence gain and reopen rates
- low-liquidity per-round caps
- different anchoring-strength assumptions for voters
- slash-trigger false positives under adversarial round sequences

The target output should be a parameter shortlist rather than a single presumed-correct configuration.
