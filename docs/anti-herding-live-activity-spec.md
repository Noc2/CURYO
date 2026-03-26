# Anti-Herding-Safe Live Activity UI Spec

## Goal

Make the vote feed feel live and socially active in a Polymarket-like way without revealing directional information during the blind phase.

This spec intentionally does **not** recommend autoplaying submitted media by default in vote mode. The live feeling should come from round activity, not from pushing attention away from the rating task.

## Product Principles

- Preserve blind voting. Do not reveal up/down momentum, directional sentiment, implied consensus, or comments that bias the current round before reveal.
- Keep the rating task primary. The community rating, round state, and voting controls stay visually dominant.
- Show participation, not opinion. Animate hidden commits, stake flow, and countdown pressure without exposing which side benefits.
- Use calm motion. The UI should feel active, not casino-like.
- Respect reduced-motion preferences and low-attention contexts.

## Non-Goals

- No TikTok-style autoplay feed.
- No live directional ticker during blind phase.
- No comments feed during blind phase.
- No exact wallet-by-wallet public commit stream before reveal.

## Where This Lives

This concept is for the vote experience centered on:

- `/vote`
- [VoteFeedStage.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/vote/VoteFeedStage.tsx)
- [VoteFeedCards.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/vote/VoteFeedCards.tsx)
- [VotingQuestionCard.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/shared/VotingQuestionCard.tsx)

## Core UI Concept

Add a small live-activity module directly inside the voting card, between the rating orb and the round stats/progress area.

Working name:

- `Live Round Activity`

Primary purpose:

- make the round feel active
- encourage timely participation
- reinforce that verified humans are present
- avoid signaling which direction is winning

## Placement

Inside [VotingQuestionCard.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/shared/VotingQuestionCard.tsx):

1. Keep `Community rating` and the rating orb at the top.
2. Keep vote buttons and current status directly below the orb.
3. Insert `Live Round Activity` below the vote buttons/status and above `RoundRevealedBreakdown`, `RoundStats`, and `RoundProgress`.

This preserves the current information hierarchy:

1. rating
2. act
3. live round context
4. deeper stats

## Component Breakdown

### 1. Live Round Activity Strip

Format:

- compact horizontal strip on desktop
- stacked compact card on mobile

Contents:

- status dot with gentle pulse
- label: `Live round activity`
- one rotating neutral message
- optional small timestamp label: `updated 12s ago`

Example messages during blind phase:

- `3 hidden votes committed recently`
- `18 cREP entered this round`
- `2 verified humans joined in the last minute`
- `Blind phase ends in 11:42`
- `1 more revealed vote needed after reveal to settle`

Rules:

- never include `up`, `down`, `bullish`, `bearish`, `majority`, or equivalent directional hints
- avoid exact user identities in blind phase
- avoid exact per-commit times if they imply a copy-trading rhythm

### 2. Ambient Round Pulse

When new hidden activity is detected:

- briefly pulse the live dot
- softly brighten the round progress rail
- optionally emit a very subtle ripple behind the orb container

Motion constraints:

- one short response per batch update
- no continuous flashing
- no motion tied to vote direction

### 3. Post-Reveal Activity Mode

After reveal begins or a round settles, the activity module can become more informative.

Example messages:

- `2 votes revealed in the last minute`
- `Round reached the 3-vote settlement threshold`
- `Round settled. Rating moved from 54 to 61`
- `Winning voters are now claiming rewards`

Even here, keep comments secondary and below the core vote UI.

## Phase-Specific Rules

### Blind Phase

Allowed:

- total committed votes
- total cREP committed
- number of participants
- time remaining
- neutral activity pulses

Not allowed:

- directional totals
- directional percentages
- directional comments
- directional price-like movement
- named trader-style feed

### Reveal Phase

Allowed:

- revealed vote count
- settlement threshold progress
- countdown to expected settlement
- neutral reveal activity

Still avoid:

- overemphasizing revealed direction until round conditions actually allow the user to infer outcome from the protocol anyway

### Settled Phase

Allowed:

- outcome summary
- rating delta
- reward activity
- linked comments/discussion
- more detailed recent event log

## Data Model

The live activity module should consume only neutral round-level aggregates during blind phase.

Recommended blind-safe fields:

- `committedVoteCount`
- `revealedVoteCount`
- `pendingRevealCount`
- `totalCommittedStake`
- `uniqueParticipantCount`
- `blindPhaseEndsAt`
- `updatedAt`

Recommended derived fields:

- `recentCommitCount1m`
- `recentStakeAdded1m`
- `recentParticipantCount1m`
- `timeRemainingLabel`

If one-minute windows are hard to compute initially, batch over coarse windows:

- last 30 seconds
- last 60 seconds
- last 5 minutes

## Message Rotation Logic

Show one message at a time and rotate every 4 to 6 seconds.

Priority order:

1. time-sensitive messages
2. threshold-related messages
3. recent activity messages
4. evergreen state messages

Examples:

- If less than 3 minutes remain, prioritize countdown.
- If reveal threshold is close, prioritize settlement-readiness messaging.
- If there was recent activity, surface that next.

## Visual Design

### Desktop

- slim module with rounded-xl surface
- subtle border in `primary/15`
- background slightly brighter than the card body
- left-aligned live dot and label
- message text in medium contrast
- timestamp in low contrast mono or utility style

### Mobile

- same content, stacked
- no marquee
- no sideways ticker motion

### Tone

Use calm exchange-style language, not hype language.

Preferred:

- `Live round activity`
- `Hidden votes committed`
- `Stake entered this round`

Avoid:

- `Hot market`
- `Pumping`
- `Momentum`
- `Action exploding`

## Motion Spec

Default:

- fade or slide between messages, 160ms to 220ms
- pulse live dot every 2.5s at low amplitude

On new activity batch:

- live dot pulse once
- optional orb halo brighten for 300ms

Reduced motion:

- disable transitions
- replace pulse with static live dot
- no halo ripple

Reference:

- respect `prefers-reduced-motion`

## Safe "Autoplay" Interpretation

If the team wants autoplay-like liveliness, implement it as automatic message rotation plus ambient round motion.

Do not autoplay the submitted content by default in vote mode.

Reason:

- it shifts attention from evaluation to consumption
- it risks worsening herding and passive behavior
- it weakens the visibility of the rating task

If media preview is ever tested later, it should be:

- YouTube-only at first
- muted
- desktop-first
- opt-in or dwell-triggered
- disabled in the primary voting state by default

## Comments Strategy

Do not show live comments during blind phase.

Recommended alternative:

- after settlement, unlock `Discussion` below the card
- comments are attached to settled rounds or settled content state, not active blind rounds

This preserves the anti-herding property while still giving the product a social layer.

## Initial MVP

Ship a narrow first version:

1. Add `Live Round Activity` module to [VotingQuestionCard.tsx](/Users/davidhawig/source/curyo-release/packages/nextjs/components/shared/VotingQuestionCard.tsx).
2. Show only three blind-safe message types:
   - `X hidden votes committed`
   - `Y cREP committed this round`
   - `Blind phase ends in MM:SS`
3. Update values on a coarse polling interval, for example every 15 to 30 seconds.
4. Add one subtle pulse on new activity.
5. Respect reduced motion.

## V2

- add recent-activity windows
- add verified-human participation counts
- add reveal-phase copy variations
- add settled-round event summaries
- add lightweight activity history drawer

## V3

- personalized but blind-safe signals, such as:
  - `people you follow joined this round`
  - `new verified voters joined this category`

Never expose their direction before reveal.

## Success Metrics

Primary:

- higher vote conversion rate
- more first-time votes completed
- faster time-to-first-vote

Secondary:

- increased session depth
- more rounds with sufficient participation
- no increase in suspicious vote clustering near visible activity updates

Guardrails:

- no drop in rating diversity
- no increase in copycat timing patterns
- no increase in users skipping the rating controls while lingering on content

## Open Questions

- Can recent neutral activity be derived cheaply from current indexed events, or do we need a dedicated aggregate endpoint?
- Should `totalCommittedStake` be exact or bucketed during blind phase?
- Should follow-graph based social cues be delayed until after settlement?
- Do we want the module only on the primary card or also as a tiny badge on queue cards?

## Recommended Next Step

Prototype the MVP inside the current vote card without changing feed navigation or media behavior.

If the MVP performs well, expand the activity system before revisiting media autoplay.
