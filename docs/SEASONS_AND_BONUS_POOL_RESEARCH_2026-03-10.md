# Seasons, Bonus Pools, and Leaderboards

Date: 2026-03-10

## Purpose

This note looks at three linked questions:

1. Should Curyo seasons have a reward or bonus pool at all?
2. If yes, how should governance decide what to spend and where to spend it?
3. How should seasons integrate with the existing leaderboard product surface?

This builds on the earlier engagement note in `docs/curyo-user-engagement-recommendations-2026-03-06.md`, but focuses more narrowly on incentive design, governance budgeting, and leaderboard structure.

## Current Curyo State

### What already exists

- Curyo already has a lightweight weekly season concept in the product.
- `packages/ponder/src/api/index.ts` exposes `/seasons/current`.
- `packages/nextjs/hooks/useCurrentSeasons.ts` reads that endpoint.
- `packages/nextjs/app/radar/page.tsx` renders a weekly global season and one featured category season.

### What that current season system actually is

- It is an indexed, off-chain view over settled weekly results.
- It is not backed by a dedicated on-chain season rewards pool.
- It is not currently integrated into the main governance leaderboard tab.
- It is not currently tied to any treasury or governance spend policy.

### Important naming constraint in the repo

- `ContentRegistry.bonusPool` already has a specific meaning in the current protocol.
- In `packages/foundry/contracts/ContentRegistry.sol`, `bonusPool` receives cancellation fees as an anti-spam sink.
- Deployment currently points that pool at the reward distributor in `packages/foundry/script/DeployCuryo.s.sol`.

Conclusion: if Curyo adds season rewards, it should not overload the existing `bonusPool` concept. It should use a distinct concept such as `SeasonRewardsPool`, `SeasonBudget`, or `SeasonIncentivesReserve`.

## External Research

## 1. Seasonal competition works best when it is bounded and legible

Examples:

- Duolingo runs weekly leagues that reset and promote/demote users across small competitive groups rather than asking everyone to care about one endless global board.
- Chess.com's Titled Tuesday Grand Prix uses time-bounded splits with separate split leaderboards and overall prizes.

Takeaway for Curyo:

- Seasons work because they create urgency and reset windows.
- A seasonal system should feel distinct from an all-time reputation leaderboard.
- Users need to understand what period they are competing in, when it resets, and what counts toward that season.

## 2. Prize pools are strongest when they are pre-budgeted, not hand-distributed every cycle

Examples:

- Gitcoin rounds use a pre-funded matching pool with explicit allocation rules for that round.
- Octant uses epoch-based budget cycles with a defined community fund rather than ad hoc treasury spending every week.

Takeaway for Curyo:

- Governance should decide a season budget envelope before the season starts.
- Governance should not vote wallet-by-wallet on winners after results are known.
- Discretionary post-hoc payout decisions are too politicized, too slow, and too easy to game socially.

## 3. Competitive rewards help, but large direct payouts can distort behavior

The broader gamification and incentive literature is mixed:

- Leaderboards and bounded competition often improve engagement.
- Purely larger monetary rewards do not automatically improve quality.
- Strong tournament incentives can also increase gaming pressure and low-quality optimization.

Takeaway for Curyo:

- A season pool should be small enough that it amplifies prestige and retention, not so large that it becomes the dominant reason to vote.
- If the season pool becomes too large relative to normal voting economics, users will optimize for leaderboard farming rather than honest curation.

## Answers To The Product Questions

## 1. Should seasons have a bonus pool?

My recommendation: yes eventually, but not as the first version and not by reusing the current `bonusPool`.

The strongest rollout path is:

- V1 seasons: leaderboard-only, titles, profile badges, recaps, and maybe featured placement.
- V2 seasons: a small dedicated season rewards pool with fixed distribution rules.

Why not start with a big pool immediately:

- Curyo's current weekly seasons are still just a ranking layer.
- The leaderboard formula is still simple: wins, then win rate, then settled vote count.
- That is fine for visibility, but not strong enough yet for direct treasury payouts.

If Curyo wants a season pool sooner, it should start very small and explicitly be a pilot.

## 2. If there is a season pool, how should governance decide what to spend?

Governance should decide ex ante parameters, not ex post winners.

The right governance role is:

- set the total budget envelope for a season cycle
- choose which season types are active
- choose the payout curve
- set qualification rules
- set activation thresholds
- decide whether unspent budget rolls forward or returns to treasury

The wrong governance role is:

- reviewing season winners one by one
- manually choosing wallets after the leaderboard is already known
- changing payout rules mid-season

### Recommended governance model

Use a two-layer structure:

1. Season budget policy
- Approved quarterly or monthly by governance.
- Example: "Up to 150,000 cREP for the next 12 weekly seasons."

2. Per-season configuration
- Global weekly season
- Featured category season
- Newcomer season with capped stakes
- Optional thematic or campaign seasons

Each season should have:

- a fixed budget
- a fixed eligibility rule
- a fixed scoring rule
- a fixed payout curve
- a fixed start and end timestamp

### Good default spending policy

If Curyo adds a real pool, governance should spend by formula, for example:

- 50% to the global weekly season
- 30% to one or two featured category seasons
- 20% to newcomer or experimental seasons

And inside each season:

- top 3 receive fixed shares
- ranks 4-10 share the remainder
- everyone below the threshold gets recognition only

### Guardrails governance should require

- Minimum participation threshold before a season pays out
- Minimum number of distinct voters
- Minimum number of settled rounds
- One Voter ID per participant
- Minimum revealed settled votes per eligible wallet
- Optional stake cap or capped-score formula for newcomer seasons
- Rollback rule: if thresholds are not met, budget returns to treasury or rolls into the next season

## 3. Should seasons be integrated into the leaderboard?

Yes. Strongly yes.

Today, Curyo's seasonal standings live mainly on Radar, while the governance leaderboard is still all-time cREP plus accuracy surfaces. That split is too weak if seasons are meant to matter.

The right model is:

- Radar shows season teasers and reminders.
- The leaderboard surface becomes the canonical home for seasonal standings.

### Recommended leaderboard structure

Keep both all-time and seasonal views:

- All-time cREP leaderboard
- All-time accuracy leaderboard
- Current global season leaderboard
- Current category season leaderboard
- Season archive

If possible, add tabs or filters such as:

- All time
- This week
- This month
- Global season
- Category season
- Following-only

### Why both are needed

- All-time leaderboards reward long-term status.
- Seasonal leaderboards make competition feel winnable and current.
- Archive pages preserve historical prestige after resets.

If Curyo only keeps all-time boards, new users will feel locked out.
If Curyo only keeps seasonal boards, long-term reputation becomes too disposable.

The product should support both.

## Design Recommendation For Curyo

## Recommended near-term path

1. Keep the current weekly season concept.
2. Move seasons into the main leaderboard IA instead of leaving them mainly in Radar.
3. Add season history and season-specific profile placement.
4. Do not use a real cREP pool yet unless Curyo is ready to harden the scoring and anti-gaming rules.

## Recommended first paid-season version

If Curyo wants monetary season rewards, the best first version is:

- a dedicated `SeasonRewardsPool`
- governance-funded in fixed envelopes
- auto-distributed by deterministic season rules
- small enough to be meaningful but not dominant

Suggested pilot:

- one global weekly season
- one featured category season
- one newcomer season
- very small fixed payout schedule
- explicit review after 4 to 8 weeks

## Suggested scoring direction

The current weekly standings appear to rank by:

- wins
- then win rate
- then settled vote count

That is acceptable for a first public board, but I would not use it for treasury payouts without more guardrails.

For paid seasons, the score should likely include:

- minimum settled vote count
- minimum blind-phase participation
- cap or dampening for very large stake concentration
- maybe separate recognition for accuracy and activity rather than collapsing everything into one number

## Concrete recommendation

If the question is "should Curyo have a season bonus pool?", my answer is:

- yes, but not by default and not immediately
- yes, if it is a dedicated season pool
- yes, only with formulaic payouts and ex ante governance budgets

If the question is "should seasons be integrated into the leaderboard?", my answer is:

- absolutely yes
- seasonal standings should become first-class leaderboard views, not just Radar widgets

## Proposed Product And Governance Blueprint

## V1

- Weekly seasons with no cREP payouts
- Seasonal leaderboard tabs
- Profile season badges
- Radar teasers
- Season archive

## V2

- Dedicated `SeasonRewardsPool`
- Monthly or quarterly governance budget proposal
- Automatic payout curves
- Activation thresholds
- Category and newcomer season variants

## V3

- Dynamic governance budget sizing based on participation metrics
- Team or squad seasons
- Sponsored seasons with separate disclosure and governance rules

## Sources

External:

- Duolingo leagues overview: <https://blog.duolingo.com/leagues-leaderboards/>
- Chess.com Titled Tuesday Grand Prix 2025-2026: <https://www.chess.com/news/view/titled-tuesday-grand-prix-2025-2026>
- Gitcoin matching pool explainer: <https://support.gitcoin.co/gitcoin-knowledge-base/matching-pool-explainer>
- Gitcoin grants rounds explainer: <https://support.gitcoin.co/gitcoin-knowledge-base/gitcoin-grants-rounds>
- Octant rewards and epochs docs: <https://docs.octant.app/> and <https://docs.octant.app/glossary/rewards>
- Gamification review reference surfaced during research: <https://pmc.ncbi.nlm.nih.gov/articles/PMC8916940/>

Internal Curyo references:

- `docs/curyo-user-engagement-recommendations-2026-03-06.md`
- `packages/ponder/src/api/index.ts`
- `packages/nextjs/app/radar/page.tsx`
- `packages/nextjs/components/leaderboard/LeaderboardTable.tsx`
- `packages/foundry/contracts/ContentRegistry.sol`
