# Multi-Token Voting Research

## Scope

Assumption for this note: we are only discussing additional assets for content voting. `cREP` should remain:

- usable across the existing protocol
- the only governance token
- the canonical asset for submissions, category staking, treasury accounting, and faucet/governance unless we explicitly redesign those too

## TL;DR

- The current protocol core is single-asset, and that asset is wired to `cREP`.
- Letting users *arrive* with USDC or other stablecoins later is possible, but the lowest-risk version is still "turn that asset into cREP before the existing vote path."
- Letting the protocol itself settle native `cREP + stablecoin` votes inside the same round is not a small config change. It is a voting/reward redesign.
- The existing `bonusPool` is not the hard part. It is only the submission-cancellation fee sink. The harder parts are the `cREP`-denominated consensus reserve, participation rewards, treasury accounting, rating math, and off-chain indexing/UI assumptions.
- `cREP`-only governance is already enforced by construction and can remain unchanged even if we later add non-governance vote-funding paths.

## What The Code Does Today

### 1. Content voting is structurally single-token

`RoundVotingEngine` stores a single `crepToken`, only accepts ERC-1363 callbacks from that token, and pays stake returns, rewards, refunds, treasury flows, and consensus reserve flows from that same token balance.

Key references:

- `packages/foundry/contracts/RoundVotingEngine.sol:96-103`
- `packages/foundry/contracts/RoundVotingEngine.sol:182-200`
- `packages/foundry/contracts/RoundVotingEngine.sol:202-215`
- `packages/foundry/contracts/RoundVotingEngine.sol:230-335`
- `packages/foundry/contracts/RoundVotingEngine.sol:649-758`
- `packages/foundry/contracts/RoundVotingEngine.sol:768-880`

The round and commit storage also have no asset identifier. They only store scalar stake amounts:

- `packages/foundry/contracts/libraries/RoundLib.sol:33-61`

That means the current storage model has nowhere to represent "this vote used cREP, that vote used USDC."

### 2. Reward math assumes one fungible unit

Reward splitting and rating math operate on raw pool totals with no FX normalization, oracle snapshot, or per-asset accounting.

Key references:

- `packages/foundry/contracts/libraries/RewardMath.sol:13-27`
- `packages/foundry/contracts/libraries/RewardMath.sol:29-56`
- `packages/foundry/contracts/libraries/RewardMath.sol:58-147`

Important implication:

- `MAX_CONSENSUS_SUBSIDY = 50e6` and `RATING_B = 50e6` are described as 50 `cREP`, not 50 generic units.
- If a round used a stablecoin natively, those constants would silently become "50 units of whatever token the round used," which changes the economics and rating sensitivity.

### 3. Participation rewards are also cREP-native

`ParticipationPool` is a direct, non-upgradeable deployment with immutable `crepToken` and `governance`. It is funded with `cREP`, keeps its own `cREP` balance accounting, and computes rewards directly from raw stake size.

Key references:

- `packages/foundry/contracts/ParticipationPool.sol:10-49`
- `packages/foundry/contracts/ParticipationPool.sol:91-98`
- `packages/foundry/contracts/ParticipationPool.sol:122-128`
- `packages/foundry/contracts/ParticipationPool.sol:172-239`

`RoundRewardDistributor` snapshots one participation pool and one reward rate per round, then pays `stakeAmount * rateBps / 10000`.

Key references:

- `packages/foundry/contracts/RoundRewardDistributor.sol:71-80`
- `packages/foundry/contracts/RoundRewardDistributor.sol:283-410`
- `packages/foundry/contracts/RoundRewardDistributor.sol:572-609`
- `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol:13-60`

Important implication:

- If raw stablecoin stake were fed into the current participation reward math, the protocol would pay `cREP` bonuses based on nominal stablecoin size, not `cREP` value.
- That is not necessarily wrong by policy, but it would be a new economic system, not a neutral extension of the existing one.

### 4. Content lifecycle is also cREP-native

Submission staking, revival staking, cancellation fees, submitter slashing, and submitter participation rewards all sit behind `ContentRegistry.crepToken`.

Key references:

- `packages/foundry/contracts/ContentRegistry.sol:90-157`
- `packages/foundry/contracts/ContentRegistry.sol:261-275`
- `packages/foundry/contracts/ContentRegistry.sol:280-379`
- `packages/foundry/contracts/ContentRegistry.sol:505-539`
- `packages/foundry/contracts/ContentRegistry.sol:589-809`

If the question is only about voting assets, this can stay untouched. If the question later expands to "let users also submit or revive with stablecoins," that would be a much bigger redesign because `ContentRegistry` has no token router and no token setter.

### 5. Governance is already cREP-only by design

`CuryoReputation` is the `ERC20Votes` token and `CuryoGovernor` is built directly around it.

Key references:

- `packages/foundry/contracts/CuryoReputation.sol:11-27`
- `packages/foundry/contracts/CuryoReputation.sol:48-95`
- `packages/foundry/contracts/CuryoReputation.sol:163-200`
- `packages/foundry/contracts/governance/CuryoGovernor.sol:18-27`
- `packages/foundry/contracts/governance/CuryoGovernor.sol:35-75`
- `packages/foundry/contracts/governance/CuryoGovernor.sol:138-150`
- `packages/foundry/contracts/governance/CuryoGovernor.sol:201-276`

This is the good news: keeping `cREP` as the sole governance token is straightforward. We do not need to touch governor voting power at all to add alternative *non-governance* vote-funding paths later.

## What This Means For "Bonus Pools"

The term "bonus pool" maps to different things in this repo, and they should be separated:

### 1. `bonusPool` in `ContentRegistry`

This is only the cancellation-fee sink for content withdrawals before any votes exist.

References:

- `packages/foundry/contracts/ContentRegistry.sol:94-95`
- `packages/foundry/contracts/ContentRegistry.sol:266-275`
- `packages/foundry/contracts/ContentRegistry.sol:346-379`

If we only add other assets for *content voting*, this can remain `cREP` exactly as it is today.

### 2. Consensus reserve

This is the real voting-side reserve. It lives inside `RoundVotingEngine` as a single `uint256 consensusReserve`.

References:

- `packages/foundry/contracts/RoundVotingEngine.sol:133-136`
- `packages/foundry/contracts/RoundVotingEngine.sol:202-207`
- `packages/foundry/contracts/RoundVotingEngine.sol:674-677`
- `packages/foundry/contracts/RoundVotingEngine.sol:729-738`
- `packages/foundry/contracts/RoundVotingEngine.sol:853-865`

If native multi-asset voting were added, this reserve would need one of the following:

- stay `cREP`-only and only subsidize `cREP` rounds
- become per-asset reserve accounting
- or be replaced by a normalized reserve model with explicit conversion rules

### 3. Participation pool

This is the other major "bonus" system, and it is currently hard-wired to `cREP`.

References:

- `packages/foundry/contracts/ParticipationPool.sol:30-49`
- `packages/foundry/contracts/ParticipationPool.sol:91-98`
- `packages/foundry/contracts/ParticipationPool.sol:172-239`

If voting stays internally `cREP`-denominated, the participation pool can stay untouched.

If native non-`cREP` voting is added, we would need to choose between:

- no participation bonus for non-`cREP` votes
- separate participation pools per asset
- or a normalized reward model that converts other stake assets into some cREP-denominated bonus basis

### 4. Treasury and UI/accounting

The treasury UI and protocol-pool UI currently read and label everything as `cREP`, and Ponder tracks `CuryoReputation` transfers/holders specifically.

References:

- `packages/nextjs/components/governance/TreasuryBalance.tsx:45-120`
- `packages/nextjs/hooks/useVotingStakes.ts:7-39`
- `packages/nextjs/hooks/useSubmissionStakes.ts:11-84`
- `packages/ponder/src/CuryoReputation.ts:1-40`

So even if the contracts were extended, the product layer would still need multi-asset visibility, formatting, APIs, and reporting.

## Can This Be Added Later As An Upgrade?

### Short answer

Yes, but only if we are precise about *which* kind of change we mean.

### Upgradeable today

These are behind transparent proxies and already have storage gaps and upgrade tests:

- `ContentRegistry`
- `RoundVotingEngine`
- `RoundRewardDistributor`
- `ProtocolConfig`

References:

- `packages/foundry/README.md:77-83`
- `packages/foundry/contracts/ContentRegistry.sol:156-157`
- `packages/foundry/contracts/RoundVotingEngine.sol:1124-1125`
- `packages/foundry/contracts/RoundRewardDistributor.sol:611-612`
- `packages/foundry/contracts/ProtocolConfig.sol:31-32`
- `packages/foundry/test/UpgradeTest.t.sol:375-405`
- `packages/foundry/test/UpgradeTest.t.sol:468-553`
- `packages/foundry/test/UpgradeTest.t.sol:559-589`
- `packages/foundry/test/UpgradeTest.t.sol:595-624`

### Not upgradeable in place

These are intentionally non-upgradeable or depend on immutable constructor state:

- `CuryoReputation`
- `CuryoGovernor`
- `ParticipationPool`
- `CategoryRegistry`
- `HumanFaucet`

References:

- `packages/foundry/README.md:77-83`
- `packages/foundry/contracts/ParticipationPool.sol:30-35`
- `packages/foundry/contracts/governance/CuryoGovernor.sol:35-38`
- `packages/foundry/contracts/CategoryRegistry.sol:37-41`
- `packages/foundry/script/DeployCuryo.s.sol:88-118`
- `packages/foundry/script/DeployCuryo.s.sol:167-240`

### Important warning from the repo itself

The deploy script explicitly says the voting engine has already had storage-breaking rewrites in this codebase and that those migrations should use a fresh proxy deployment instead of assuming arbitrary in-place compatibility.

References:

- `packages/foundry/script/DeployCuryo.s.sol:145-155`
- `packages/foundry/README.md:80-83`

So "yes, later as an upgrade" is true, but the safe interpretation is:

- small surface changes can be normal proxy upgrades
- deep voting-system rewrites should be treated as a V2 migration, not as a routine patch

### Extra migration constraint: the cREP token only whitelists one voting engine

`CuryoReputation` stores one `votingEngine` and one `contentRegistry` for governance-lock bypass.

References:

- `packages/foundry/contracts/CuryoReputation.sol:37-46`
- `packages/foundry/contracts/CuryoReputation.sol:76-85`
- `packages/foundry/contracts/CuryoReputation.sol:163-185`

That means a future engine migration is possible, but the token does not support multiple parallel content-voting engines being whitelisted at the same time.

There is still enough indirection to make a V2 migration viable:

- `ContentRegistry` can be repointed to a new voting engine and participation pool: `packages/foundry/contracts/ContentRegistry.sol:239-243`, `packages/foundry/contracts/ContentRegistry.sol:261-263`
- `CategoryRegistry` can be repointed to a new voting engine: `packages/foundry/contracts/CategoryRegistry.sol:359-362`

## Practical Design Options

## Option A: Keep the protocol core cREP-only, add a swap step before voting

What it means:

- users can start with a stablecoin in the frontend
- the frontend swaps it to `cREP`
- the existing vote path still commits `cREP`

Pros:

- lowest protocol risk
- keeps consensus reserve, participation pool, treasury, docs, analytics, and settlement logic intact
- keeps `cREP` usable everywhere
- preserves `cREP` as the only governance token

Cons:

- not a native multi-asset protocol
- unless you add more infrastructure, the user still ultimately votes with `cREP`

This is the cleanest path if the real product goal is "let people come in with stablecoins" rather than "make the settlement engine itself multi-asset."

## Option B: One-click funded cREP voting

What it means:

- users fund the experience with a stablecoin
- some helper path converts to `cREP`
- the protocol still settles a `cREP` vote
- we may add an engine/router/meta-tx path so the vote is still attributed to the user, not an intermediate contract

Pros:

- still keeps the core economics and pools in `cREP`
- closer to a native UX than Option A

Cons:

- requires more design around identity attribution, sponsored execution, and approvals
- still not native multi-asset settlement

Important constraint:

- the current engine records the voter as `msg.sender`, so a helper contract cannot simply call `commitVote()` on behalf of a user and preserve that user's identity without new protocol support: `packages/foundry/contracts/RoundVotingEngine.sol:230-240`, `packages/foundry/contracts/RoundVotingEngine.sol:266-276`

This is the best medium-term path if we want better onboarding without redesigning round math.

## Option C: Native multi-asset voting in a V2 engine

What it means:

- the protocol itself understands more than one voting asset
- rounds or markets must carry asset identity
- rewards, refunds, reserves, and UI/indexing all become asset-aware

If we ever do this, the safest design is not "mix all assets in one round." It is one of:

- separate per-asset markets
- or a per-round asset with explicit value-snapshot rules

Why I would avoid mixed-asset same-round settlement:

- current round storage has no asset identifier
- current reward math has no price normalization
- current rating math assumes a fixed 50 `cREP` smoothing constant
- current consensus reserve and participation pool are single-asset

This is a real V2 protocol project and should be treated that way.

## Recommendation

My recommendation is:

1. Keep `cREP` as the only governance token and the canonical internal accounting asset.
2. If we want stablecoin onboarding, start with Option A or Option B, not native mixed-asset settlement.
3. If we eventually want native non-`cREP` voting, build it as a V2 market design with separate asset-aware accounting, likely using a fresh voting-engine/reward-distributor deployment plus new pool contracts.

Concretely:

- Near term: do not retrofit "cREP + USDC in the same round" into the current engine.
- Medium term: add a user-facing stablecoin-to-`cREP` path and, if needed, a one-click helper path.
- Long term: if native multi-asset voting becomes strategically important, design it as a separate asset-aware market layer rather than stretching the current single-asset core.

## Off-Chain Blast Radius

Even if we keep governance untouched, the off-chain migration surface is still large.

Examples:

- bot contract config hardcodes `crepToken`: `packages/bot/src/contracts.ts:13-25`
- bot vote flow reads `cREP` balance/allowance and logs stake in `cREP`: `packages/bot/src/commands/vote.ts:51-60`, `packages/bot/src/commands/vote.ts:135-173`
- governance hooks anchor on `CuryoReputation`: `packages/nextjs/hooks/useGovernance.ts:125-145`
- stake hooks divide by `1e6` and label balances as `cREP`: `packages/nextjs/hooks/useVotingStakes.ts:7-39`, `packages/nextjs/hooks/useSubmissionStakes.ts:11-84`
- treasury UI labels protocol pools as `cREP`: `packages/nextjs/components/governance/TreasuryBalance.tsx:52-116`
- Ponder tracks `CuryoReputation` transfers/holders specifically: `packages/ponder/src/CuryoReputation.ts:13-40`
- public-facing docs describe voting stakes and protocol pools in `cREP`: `README.md:8-30`, `packages/contracts/src/protocol.ts:21-46`

Any native multi-asset rollout should therefore include:

- Foundry tests for new settlement/accounting paths
- Ponder schema and API changes
- Next.js contract reads and labels
- bot config/allowance/vote path changes
- Playwright coverage for vote, reward, claim, and treasury screens

## Bottom Line

Adding other tokens or stablecoins for voting is possible later, but there are two very different versions of that statement:

- "Users can show up with stablecoins and still end up voting with cREP" - feasible with moderate risk.
- "The protocol natively supports mixed-asset voting and settlement" - high-risk V2 redesign.

If the goal is to preserve `cREP` as the only governance token and keep it usable everywhere, the cleanest path is to keep the core protocol cREP-denominated and treat other assets as onboarding/funding rails first, not as native settlement assets.
