# Curyo User Engagement Recommendations

Prepared: 2026-03-06
Updated: 2026-03-06

## Executive summary

Curyo already has strong mechanism design:

- stake-weighted curation
- verified-human identity
- commit-reveal voting
- public, auditable outcomes

What it lacks is stronger consumer product scaffolding around that mechanism.

The research and market scan point to a clear direction:

1. Long-term retention comes more from mastery, progress, and identity than from points alone.
2. Social recognition and lightweight relationship surfaces materially improve continued use.
3. Prediction markets do not need infinite market breadth to be useful; after a modest number of traders, accuracy gains flatten, so attention should be concentrated into fewer, thicker markets.
4. The consumer prediction products that look most lively in 2025-2026 are not just "markets"; they are communities, tournaments, and live events.

My main recommendation is to evolve Curyo from "a place where you vote on content" into "a place where people build a public taste reputation."

## What has changed since the first draft of this memo

Curyo now has more engagement scaffolding than it did when this memo was first written.

Recently implemented:

- explicit watched-content state and watch buttons on discover
- watched scope on the vote/discover page
- in-app settlement notifications
- mobile search entry in the top navbar with a YouTube-style search takeover on small screens
- a categories-first discover layout with lighter filters
- curator follows on content cards
- curator follows on the leaderboard and accuracy leaderboard
- following-only leaderboard filters

Already present before this update:

- streaks
- accuracy stats
- leaderboards
- comments
- referrals

This materially changes the recommendation stack.

The biggest remaining gap is no longer "add follows" or "add watchlists." Those primitives now exist. The biggest remaining gap is giving those primitives somewhere valuable to lead:

- a real following/radar feed
- event-driven reminders and recaps
- concentrated competition through seasons and featured arenas

## What the research says

### 1. Intrinsic motivation matters more than raw rewards

Research on continued use in gamified products found intrinsic motivation was the strongest driver of continued use, with social recognition and financial reward also helping when designed well. The practical implication is that users need to feel:

- "I am getting better at this"
- "people notice when I am good"
- "there is some reward for showing up consistently"

For Curyo, that means the core loop should make users feel smarter, sharper, and more recognized over time, not just richer.

### 2. Leaderboards help, but shallow gamification decays

Systematic review evidence suggests leaderboards can lift engagement, but generic badges and points wear off quickly if there is no deeper sense of progress or meaning. This is especially relevant for Curyo: a leaderboard can help, but only if it reflects real reputation, scoped competition, and visible progress.

### 3. Hybrid incentive systems outperform single-mode incentives

Evidence from behavioral gamification trials suggests the combination of gamification plus financial incentives can outperform either one alone over longer periods. Curyo already has the financial stake layer. The missing layer is better productized gamification: missions, progress framing, and social comparison.

### 4. Market thickness matters more than endless breadth

Prediction market research found that accuracy gains flatten once markets have roughly 10-20 traders. In other words, the answer is not "more thin markets"; it is "enough participation per market." For Curyo, this argues for concentrating users into featured items, themed arenas, and scheduled events instead of spreading them across too many parallel content rounds.

### 5. Competitive structure matters

Prediction market field research found that stronger performance-based payouts did not automatically improve outcomes, while tournament-style competitive environments performed well. This is a useful design clue: Curyo should lean more into seasons, leagues, and category competitions, not just per-vote payouts.

### 6. "Staked media" is becoming a real category

The latest crypto/media thinking is converging on the idea that public commitment and public receipts create trust. That fits Curyo very well. The product should lean into this by making curation legible: not just whether a user voted up or down, but the public track record of their judgment.

### 7. Discovery and lightweight follows are important

Modern creator products increasingly use lightweight follow relationships and recommendation loops to grow the top of funnel before asking for a deeper commitment. Substack is a clean example: following is intentionally lighter than subscribing, and recommendations drive discovery. Curyo should apply the same idea to curators, categories, and creators.

### 8. The market is moving toward social and event-based prediction

Current consumer examples support the same direction:

- Kalshi's growth story is framed around a flywheel of more markets, more traders, and more liquidity.
- RYVAL is positioning prediction as a live, social, leaderboard-driven experience for stream audiences.
- Fanatics Markets is framing prediction as a simple, fan-led layer on top of sports and culture.

The signal is consistent: the winning consumer products are not selling "financial contracts." They are selling participation, identity, and live excitement.

### 9. First social connections can have durable retention effects

Large-scale observational evidence from an activity-tracking app with a built-in social network found that joining the social network increased one-year retention by 17% and increased posting by 30% immediately after the first connection.

For Curyo, this matters a lot. The new follow feature is directionally correct, but its real value will only show up if users quickly get:

- a first meaningful follow
- visible activity from people they follow
- a reason to come back because of those connections

### 10. Notifications work best when they are contextual, not generic

Micro-randomized trials on app notifications show a consistent pattern:

- notifications can materially increase near-term engagement
- fixed daily notifications do not reliably improve long-term retention
- timing, relevance, and user context matter

The practical implication for Curyo is clear. It should not send generic "come back" pings. It should send highly legible, event-driven reminders:

- a watched round is settling soon
- a followed curator made a new call
- a followed curator was proven right
- your season standing changed

### 11. Peer-support and social/community app modes tend to retain better than purely solitary utility

Real-world usage analysis across mental health apps found that peer-support apps had stronger daily open rates and higher 30-day retention than many more solitary app types.

This is relevant because Curyo is currently closer to a solitary utility product than to a social one. The new follow feature helps, but it needs to be followed by:

- a visible activity feed
- lightweight public interaction around calls
- better profile pages that make people worth following

## What this means for Curyo

Right now, Curyo is intellectually interesting. To become more interesting for users, it needs stronger answers to five product questions:

1. Why should I come back tomorrow?
2. What am I getting better at?
3. Who notices if I am good?
4. What are the big moments I should not miss?
5. Who can I follow, rival, or learn from?

## Updated status reading

After the recent frontend work, I would describe Curyo like this:

- the product now has the beginnings of a social graph
- the product now has the beginnings of a watch/reminder loop
- discovery on mobile is materially better than before
- but the social graph is still mostly a storage layer, not yet a feed
- and the watch/reminder loop is still mostly a notification primitive, not yet a habit loop

That means the next highest-impact work is not more isolated controls. It is turning the newly added follows and watches into a true repeat-use system.

## Updated recommendations ranked by likely impact now

### P0: Highest-impact remaining work

### 1. Build a "Following / Radar" home feed

This is now the highest-value next step.

Use the new follow graph and watch state to create a single return surface that answers:

- what is settling soon
- what did people I follow just submit or vote on
- what did I miss since my last visit
- what are the best things to look at right now

Feed modules should include:

- watched rounds settling soon
- recent submissions from followed curators
- recent wins/losses from followed curators
- recommended curators to follow
- featured items needing early signal

Why this moved to #1:

- follows and watchlists now exist
- without a home/radar surface, they are mostly passive state
- with a home/radar surface, they become a habit loop

### 2. Turn notifications into event-driven "return moments"

V1 notifications are already live, but they should become more targeted and more legible.

Highest-value next notification types:

- settling within 1 hour
- settling today
- followed curator submitted something new
- followed curator made a high-conviction call
- weekly digest of watched and followed activity

Important design rule from the research: avoid generic daily prompts. Ship only notifications with obvious user value.

### 3. Launch weekly and category seasons

This is still a top-three bet.

Why it remains high impact:

- it gives users a reason to care now, not eventually
- it makes the existing leaderboard system more winnable
- it combines well with follows, since users can track friends/rivals across a bounded time window

I would start with:

- one global weekly season
- one or two category seasons
- a newcomer season with capped stakes

### 4. Build featured arenas and "Featured Today"

The product still needs more attention concentration.

The right move is not to add more thin surfaces. It is to make a smaller number of rounds feel important.

Good candidates:

- editor-picked featured items
- hotly split items
- items from followed curators
- items in active seasons

### 5. Add short reasoned takes and post-settlement receipts

Now that follows exist, reasons and receipts become more valuable.

Users should be able to see:

- why someone voted up or down
- whether that thesis aged well
- who consistently makes sharp early calls

This is the bridge from "I follow this wallet" to "I trust this person's taste."

### P1: Strong secondary bets

### 6. Add curator portfolio pages and taste graphs

Show:

- strongest categories
- recent form
- blind-phase participation rate
- best calls
- worst misses
- agreement/disagreement with other curators

This should be a public identity layer, not just an account page.

### 7. Add category follows

Curator follows are now live. Category follows are the next logical expansion, but they are slightly lower priority than the feed and season work.

They matter because they improve:

- cold-start discovery
- niche expertise discovery
- alert routing
- category-specific season participation

### 8. Add post-settlement recap cards

These should summarize:

- what settled
- what the crowd predicted
- who called it well
- what changed the rating

This gives Curyo a repeatable "moment of truth" surface that users can open even when they are not voting.

### P2: Bigger ecosystem bets

### 9. Private leagues and community competitions

Still strong, but no longer the immediate next step. They work better after the base feed/follow/radar loop is working.

### 10. Team play and rivalries

Still promising, but I would not do this before seasons plus follows plus recaps are in place.

### 11. Creator/community modes

Still attractive, especially for newsletters, Discords, DAOs, and stream communities, but I would sequence this after the consumer loop is proven.

## Detailed feature backlog

The ranking above is the current priority order. The sections below expand the most important product bets in more concrete design terms.

### P0: Highest-leverage product changes

### 1. Build a "taste progression" system

Add a visible public skill layer for each user:

- overall curation score
- category-specific accuracy scores
- recent form
- streaks
- percentile rank among active curators
- "best calls" and "worst misses"

Why this matters:

- It turns voting into a learnable craft.
- It supports identity and self-improvement.
- It gives social meaning to leaderboards.

Important detail: this should not be just ROI. It should combine accuracy, consistency, category depth, and stake-adjusted conviction, otherwise whales dominate the narrative.

### 2. Replace one giant leaderboard with seasons and leagues

Run weekly and monthly competitions:

- global weekly season
- category seasons (movies, games, music, AI, politics, etc.)
- newcomer leagues
- invite-only private leagues for groups or communities

Why this matters:

- tournament structures create cleaner reasons to return
- scoped leaderboards are less intimidating for new users
- users need "I can win this week" more than "I am #742 all time"

### 3. Concentrate attention into featured arenas

Create a "Featured This Week" or "Arena" surface with a small number of high-signal content items.

Why this matters:

- thicker rounds should improve both excitement and market quality
- users benefit from editorial focus
- settlement moments become more legible

This should be curated by a mix of:

- trending submissions
- controversial items
- category spotlights
- creator challenges
- newly submitted items needing early signal

### 4. Expand settlement into a spectator event

Right now, the mechanism is clever but the emotional product moment is still undersold. Curyo now has watch state and in-app settlement notifications, but the product still needs a stronger moment around reveal and resolution. Add:

- countdowns to reveal/settlement
- "you have skin in 3 rounds settling today"
- settling-soon surfaces
- followed-curator settlement recaps
- push/email/in-app notifications
- post-settlement recap cards showing what happened and who called it correctly

Why this matters:

- anticipation is a retention loop
- prediction products get more interesting when outcomes are felt as moments, not background accounting

### 5. Turn the lightweight follow graph into a living network

Curator follows are now live. The next step is to expand follows where useful and make them matter every time a user returns.

Let users follow:

- curators (already live)
- creators
- categories
- collections

Then build a home feed that shows:

- rounds your followed curators are active in
- creators your network is submitting
- post-settlement recaps from people you follow
- recommended new curators or categories

Why this matters:

- users need low-friction social attachment before strong commitment
- follows create better discovery and stronger reasons to come back
- this turns Curyo into a network, not just a market interface

### P1: Features that make the product feel alive

### 6. Add "reasoned takes" and public receipts

Before or after settlement, let users attach a short explanation:

- "Why I voted up"
- "Why I voted down"
- "What changed my mind"

After settlement, surface which theses aged well.

Why this matters:

- it leans into Curyo's advantage as staked media
- it creates shareable identity, not just silent transactions
- it helps good curators earn followers

Keep it lightweight. This should feel closer to posting a take than writing a review.

### 7. Introduce missions and commitment devices

Add soft commitments such as:

- 3 votes this week
- 1 blind-phase vote in your best category
- settle 5 watched rounds this month
- publish 1 post-settlement explanation

Tie these to modest rewards:

- fee rebates
- boosted profile visibility
- seasonal cosmetics or titles
- small token bonuses from a bounded budget

Why this matters:

- research suggests gamification plus incentives is stronger than either alone
- missions help users build habits without undermining the core stake mechanic

### 8. Build newcomer onboarding around real achievement, not a fake sandbox

I would not make a purely fake play-money mode the main experience. That weakens Curyo's core promise.

Instead:

- sponsor a user's first few small stakes
- create a beginner season with capped stakes
- give users a "first 5 votes" mission path
- explicitly show how blind-phase and open-phase voting differ

Why this matters:

- it lowers fear without diluting skin in the game
- it gives new users a fast path to their first meaningful result

### 9. Make category expertise explicit

Give each user a category reputation profile:

- "strong in games"
- "elite early voter in movies"
- "high-conviction but volatile in politics"

Why this matters:

- users care more about being known for something specific than being generically good
- it supports better following, recommendations, and league design

### P2: Bigger bets that could significantly increase interest

### 10. Creator and community modes

Let creators, DAOs, newsletters, Discords, or streamers run their own Curyo competitions:

- this week's best AI article
- best indie game trailer of the month
- most overrated take in the group chat

Why this matters:

- communities already have attention and taste norms
- Curyo can become the infrastructure for turning those norms into public, staked judgment

This direction is strongly supported by current market examples like RYVAL and Fanatics Markets, which are both packaging prediction as a fan/community experience.

### 11. Team play and rivalries

Consider team-based or club-based competition:

- category guilds
- college/DAO/creator team seasons
- head-to-head curator rivalries

Why this matters:

- team identity is a stronger retention driver than solo score accumulation
- it creates social pressure to return and defend your group

### 12. Curator portfolios and "taste graphs"

Give every user a profile that clearly shows:

- what they tend to back
- how early they are
- where they outperform
- who they agree with or disagree with most

Why this matters:

- users love intelligible public identity
- good profiles turn a market into a social graph

## What to avoid

### 1. Too many simultaneous active rounds

If users have too many choices, markets get thin and nothing feels important.

### 2. Badge spam

Badges without status, context, or utility decay quickly.

### 3. One global all-time leaderboard

This usually helps incumbents and discourages everyone else.

### 4. Hiding the people

If Curyo only shows content and prices, it leaves social energy on the table. People want to follow judgment, not just assets.

### 5. Copying sports betting UX too directly

Curyo's edge is not "bet on anything." Its edge is "build public credibility around taste and judgment." The product should feel more like social curation with stakes than generic gambling.

## Updated roadmap

### Next 30 days

- build a Following / Radar feed
- add settling-soon and followed-curator notifications
- launch a lightweight "Featured Today" surface
- pilot one weekly season and one category season

### Next 60-90 days

- add category follows
- add post-settlement recap cards
- add short "why I voted" takes
- add public curator portfolio pages and taste graphs

### Next 3-6 months

- private leagues and community competitions
- creator challenge format
- team play
- richer curator profiles and taste graphs

## Metrics to track

If you make these changes, I would watch:

- time to first vote
- time to first settled round
- D1, D7, and D30 retention
- votes per active user per week
- percent of users following at least 3 entities
- percent of rounds reaching target trader density
- percent of users returning for settlement notifications
- percent of users who join a season or league
- creator/community-driven submission share

## Updated bottom-line recommendation

If I had to pick only three bets now, given what is already implemented, I would do these first:

1. Following / Radar feed
2. Event-driven settlement and follow notifications
3. Weekly/category seasons

The reason is simple:

- follows and watches now exist, so the next job is to make them useful every day
- seasons create urgency
- notifications turn that urgency into return behavior

In other words, the product has enough primitives now. The next step is to turn them into a real loop.

## Sources

1. Repository context: [README.md](../README.md)
2. Motivation crowding effects on the intention for continued use of gamified fitness apps: a mixed-methods approach (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC10807424/
3. Does gamification increase engagement with online programs? A systematic review (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC5376078/
4. Effect of Gamification, Financial Incentives, or Both to Increase Physical Activity Among Patients at High Risk of Cardiovascular Events: The BE ACTIVE Randomized Controlled Trial (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC11795842/
5. Prediction Market Accuracy: The Impact of Size, Incentives, Context and Interpretation (Journal of Prediction Markets): https://www.ubplj.org/index.php/jpm/article/view/500/0
6. How to Pay Traders in Information Markets: Results from a Field Experiment (Journal of Prediction Markets): https://www.ubplj.org/index.php/jpm/article/view/425
7. Big Ideas 2026: Part 3, including "The rise of staked media" (a16z): https://a16z.com/newsletter/big-ideas-2026-part-3/
8. Investing in Kalshi (a16z): https://a16z.com/announcement/investing-in-kalshi/
9. What is following on Substack? (Substack Help Center): https://support.substack.com/hc/en-us/articles/18163273015700-What-is-following-on-Substack
10. How can I recommend other publications on Substack? (Substack Help Center): https://support.substack.com/hc/en-us/articles/5036794583828-How-can-I-recommend-other-publications-on-Substack
11. Getting started on the Substack app (Substack Help Center): https://support.substack.com/hc/en-us/articles/19291693034004-Getting-started-on-the-Substack-app
12. RYVAL product site: https://www.ryval.com/
13. Fanatics Markets launch announcement: https://crypto.com/en-it/company-news/fanatics-launches-fanatics-markets-the-first-fan-led-prediction-market-at-the-intersection-of-sports-finance-and-culture-through-a-strategic-partnership-with-cryptocom
14. Online Actions with Offline Impact: How Online Social Networks Influence Online and Offline User Behavior (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC5361221/
15. Objective User Engagement With Mental Health Apps: Systematic Search and Panel-Based Usage Analysis (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC6785720/
16. How Notifications Affect Engagement With a Behavior Change App: Results From a Micro-Randomized Trial (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/
17. To Prompt or Not to Prompt? A Microrandomized Trial of Time-Varying Push Notifications to Increase Proximal Engagement With a Mobile Health App (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC6293241/
18. Can Personalization Persuade? Study of Notification Adaptation in Mobile Behavior Change Intervention Application (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC9137841/
