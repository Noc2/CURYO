# Reputation Constellation Avatar v1

## Goal

Create a deterministic, text-free, chain-derived avatar for Curio identities.

Anyone should be able to compute the same avatar from the same public chain data.

## Principles

- The avatar uses only chain-derived signals.
- The graph is always a single connected component.
- The center triad appears only after the address has claimed a Voter ID.
- Addresses without a claimed Voter ID render with no center triad.
- Category stars are capped, decay over time, and eventually disappear.
- No followers, watchlists, or other app-local social data are used.
- Sparse wallets still get deterministic address-derived variation in the background gradient and ambient star field.

## Inputs

These values are considered valid inputs for v1:

- Current `cREP` balance for the address.
- Total settled voting stats:
  - `totalSettledVotes`
  - `totalWins`
  - `totalLosses`
- Rolling 90-day category stats:
  - `settledVotes90d`
  - `wins90d`
  - `losses90d`
  - `stakeWon90d`
  - `stakeLost90d`
  - `lastSettledAt`
- Voter ID existence and mint state.

## Core Triad

The center triad is visible only when the address has a claimed Voter ID. When it is shown, it is always connected as a
triangle.

- Left star: `cREP controlled`
- Right star: `accuracy`
- Bottom star: `participation`

Core scores:

```ts
balanceScore = clamp(log10(balanceCrep + 1) / log10(100000 + 1), 0, 1)

accuracyConfidence = clamp(totalSettledVotes / 25, 0, 1)
accuracyWinRate = totalSettledVotes > 0 ? totalWins / totalSettledVotes : 0
accuracyScore = clamp((accuracyWinRate - 0.45) / 0.30, 0, 1) * accuracyConfidence

participationScore = clamp(log10(totalSettledVotes + 1) / log10(200 + 1), 0, 1)
```

Core radius:

```ts
coreRadius = 10 + 8 * score
```

## Category Stars

Only the top 5 active categories are shown.

Eligibility:

- `settledVotes90d >= 3`
- sort by `categoryScore desc`
- tie-break by `settledVotes90d desc`, then `categoryId asc`

Category score:

```ts
activityScore = clamp(settledVotes90d / 12, 0, 1)

categoryAccuracyConfidence = clamp(settledVotes90d / 8, 0, 1)
categoryWinRate90d = settledVotes90d > 0 ? wins90d / settledVotes90d : 0
categoryAccuracyScore = clamp((categoryWinRate90d - 0.45) / 0.30, 0, 1) * categoryAccuracyConfidence

convictionScore = clamp(log10(stake90dCrep + 1) / log10(3000 + 1), 0, 1)

categoryScore = 0.50 * activityScore + 0.35 * categoryAccuracyScore + 0.15 * convictionScore
```

Star radius:

```ts
starRadius = 6 + 10 * categoryScore
```

## Connectivity

The full constellation must always be connected.

Rules:

- The 3 core stars are always connected to each other.
- Every category star must connect to one core star.
- The anchor core star is deterministic:

```ts
anchorIndex = categoryId % 3
```

This ensures the triad is part of the same graph instead of appearing as a separate ornament.

## Refinement

Better long-term performance should tighten the structure.

```ts
refinement = clamp((accuracyWinRate - 0.50) / 0.25, 0, 1) * clamp(totalSettledVotes / 40, 0, 1)
```

Use `refinement` to interpolate stars from looser to cleaner positions.

## Decay

Category stars should disappear when they become stale.

- `0-14 days since last settled vote`: fully visible
- `15-45 days`: dim
- `46-90 days`: ghost state
- `> 90 days`: remove star unless it becomes active again

Decay affects:

- node opacity
- glow opacity
- line opacity
- minor size shrink

## Colors

- The core triad uses fixed brand colors.
- Category color is derived deterministically from `categoryId`.
- The same category always resolves to the same hue.

## Address-Derived Variation

To avoid low-history wallets collapsing into identical-looking avatars, the renderer also uses the address as a
deterministic input for:

- minor triad angle/orbit variation
- background gradient angle and palette
- nebula placement and intensity
- ambient star positions

These address-seeded variations do not change the underlying reputation mapping; they only prevent sparse wallets from
looking cloned.

## Versioning

This document defines `Reputation Constellation Avatar v1`.

If the formulas or signal choices change, the spec version must also change.
