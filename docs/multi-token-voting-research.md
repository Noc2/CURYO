# Multi-Token / Stablecoin Voting Research

Date: 2026-04-03
Repo snapshot: `/Users/davidhawig/source/curyo-release`

## Executive Summary

- The current protocol is not token-agnostic. Content voting, vote settlement, submitter stakes, frontend fees, category rewards, treasury inflows, consensus reserve, participation rewards, faucet distribution, docs, bots, and indexers are all wired around cREP.
- cREP is already the sole governance token by construction. `CuryoGovernor` reads voting power from a single `IVotes` token set in its constructor, and the deploy script passes `CuryoReputation`.
- Adding native multi-token or stablecoin voting later is possible, but it is a V2 protocol change, not a config change. The safest approach is to leave `CuryoReputation` and `CuryoGovernor` unchanged for governance and build a new content-voting stack.
- If the real product goal is "let users come in with USDC/USDT and still vote," the lowest-risk path is not native multi-asset voting. It is an access-layer conversion into cREP before the existing vote flow. That preserves the current economics almost completely.

## Short Answers

### 1. Is cREP already the sole governance token by construction?

Yes.

- `CuryoReputation` is the only token in the repo that implements `ERC20Votes`, and it self-delegates on receipt so balances immediately become governance voting power. See `packages/foundry/contracts/CuryoReputation.sol:15-18` and `packages/foundry/contracts/CuryoReputation.sol:167-193`.
- `CuryoGovernor` is constructed with a single `IVotes` token and stores that cREP token as `immutable`. See `packages/foundry/contracts/governance/CuryoGovernor.sol:35-38` and `packages/foundry/contracts/governance/CuryoGovernor.sol:59-75`.
- The production deploy script explicitly wires `CuryoGovernor(IVotes(address(crepToken)), ...)` and sets that governor on `CuryoReputation`. See `packages/foundry/script/DeployCuryo.s.sol:88-110`.

### 2. Can other tokens or stablecoins be integrated for voting?

Yes, but not inside the current design without substantial contract and product changes.

- The current voting engine stores a single `crepToken`, pulls only that token on commit, and pays only that token on reward/refund paths. See `packages/foundry/contracts/RoundVotingEngine.sol:102-105`, `packages/foundry/contracts/RoundVotingEngine.sol:182-200`, `packages/foundry/contracts/RoundVotingEngine.sol:202-216`, `packages/foundry/contracts/RoundVotingEngine.sol:230-250`, and `packages/foundry/contracts/RoundVotingEngine.sol:334`.
- The deploy script states the intended model directly: "All protocol operations use cREP token only (no stablecoins)." See `packages/foundry/script/DeployCuryo.s.sol:27-30`.

### 3. Can this be added later as an upgrade while cREP remains usable everywhere and remains the only governance token?

Yes, but "upgrade" here should mean "new V2 voting architecture governed by the same cREP-based governance," not "small patch to the current contracts."

- The proxy-backed contracts can be upgraded under the timelock. See `packages/foundry/script/DeployCuryo.s.sol:120-165` and `packages/foundry/test/UpgradeTest.t.sol:274-620`.
- Several supporting contracts are not upgradeable, or they pin critical references immutably. Those contracts sharply limit how far an in-place retrofit can go. See the "Upgrade Constraints" section below.

## What The Current System Assumes

### Governance is cREP-only

- `CuryoReputation` is the governance asset and exposes the historical voting checkpoints used by `GovernorVotes`. `packages/foundry/contracts/CuryoReputation.sol:15-18`
- The governor locks cREP after proposal creation and vote casting by calling back into `CuryoReputation.lockForGovernance`. `packages/foundry/contracts/governance/CuryoGovernor.sol:199-230`
- Governance thresholds and quorum are all expressed in cREP units: `10_000e6` proposal threshold, `500e6` category threshold, `100_000e6` minimum quorum. `packages/foundry/contracts/governance/CuryoGovernor.sol:44-51`

### Content voting is also cREP-only today

- `RoundVotingEngine` takes stake in `crepToken` and uses that same token for refunds and payouts. `packages/foundry/contracts/RoundVotingEngine.sol:102-105`, `packages/foundry/contracts/RoundVotingEngine.sol:202-216`, `packages/foundry/contracts/RoundVotingEngine.sol:334`, `packages/foundry/contracts/RoundVotingEngine.sol:790`, `packages/foundry/contracts/RoundVotingEngine.sol:844-856`
- The app's one-transaction vote path is specifically `CuryoReputation.transferAndCall(votingEngine, amount, payload)`. `packages/nextjs/app/docs/smart-contracts/page.tsx:170-188`
- The thirdweb sponsored-call allowlist is also hard-coded around `CuryoReputation.approve(...)` and `CuryoReputation.transferAndCall(...)`. `packages/nextjs/lib/thirdweb/freeTransactions.ts:530-627`

### Submitter, category, and frontend staking are all cREP-only

- Content submission reserves `10 cREP` and charges cancellation fees in cREP. `packages/foundry/contracts/ContentRegistry.sol:91-95`, `packages/foundry/contracts/ContentRegistry.sol:292-303`, `packages/foundry/contracts/ContentRegistry.sol:346-379`
- Category proposals require `500 cREP` stake. `packages/foundry/contracts/CategoryRegistry.sol:19-21`, `packages/foundry/contracts/CategoryRegistry.sol:29`, `packages/foundry/contracts/CategoryRegistry.sol:154-156`
- Frontends post a fixed `1,000 cREP` bond and accumulate `crepFees`. `packages/foundry/contracts/FrontendRegistry.sol:14-15`, `packages/foundry/contracts/FrontendRegistry.sol:24-29`, `packages/foundry/contracts/FrontendRegistry.sol:34-44`, `packages/foundry/contracts/FrontendRegistry.sol:148-173`, `packages/foundry/contracts/FrontendRegistry.sol:208-220`, `packages/foundry/contracts/FrontendRegistry.sol:232-239`

### Reward pools and fee splits are cREP-denominated

- The losing pool is split into cREP buckets: 80% voter pool, 10% submitter, 4% platform, 1% treasury, 5% consensus reserve. `packages/foundry/contracts/libraries/RewardMath.sol:13-20`, `packages/foundry/contracts/libraries/RewardMath.sol:79-127`
- Settlement sends frontend, category, treasury, and consensus allocations through cREP paths. `packages/foundry/contracts/RoundVotingEngine.sol:660-725`
- `ParticipationPool` is a cREP-only emissions pool funded with `34M cREP`, and rewards are proportional to stake amount. `packages/foundry/contracts/ParticipationPool.sol:10-14`, `packages/foundry/contracts/ParticipationPool.sol:19-31`, `packages/foundry/contracts/ParticipationPool.sol:189-217`
- The `bonusPool` in `ContentRegistry` is not a general reward pool. It is the cREP cancellation-fee sink. `packages/foundry/contracts/ContentRegistry.sol:94`, `packages/foundry/contracts/ContentRegistry.sol:266-270`, `packages/foundry/contracts/ContentRegistry.sol:365-375`

### Identity controls are also cREP-shaped today

- The vote cap per verified identity is `100e6`, meaning "100 cREP per content per round." `packages/foundry/contracts/VoterIdNFT.sol:16-18`
- `VoterIdNFT` stores raw staked amounts and remaining capacity in those same cREP units. `packages/foundry/contracts/VoterIdNFT.sol:269-310`

## What Must Stay Unchanged If cREP Remains Usable Everywhere And The Only Governance Token

If cREP should remain the governance token and still work everywhere it works now, the following pieces should stay conceptually intact:

- `CuryoReputation` remains the only `ERC20Votes` token used by governance. `packages/foundry/contracts/CuryoReputation.sol:15-18`
- `CuryoGovernor` remains pointed at cREP for proposal thresholds, quorum, vote counting, and governance locks. `packages/foundry/contracts/governance/CuryoGovernor.sol:35-38`, `packages/foundry/contracts/governance/CuryoGovernor.sol:59-75`, `packages/foundry/contracts/governance/CuryoGovernor.sol:138-151`, `packages/foundry/contracts/governance/CuryoGovernor.sol:201-230`
- cREP stays on the content-voting whitelist even if other assets are added later, otherwise it would no longer be "usable for everything."
- Category staking, frontend staking, faucet distribution, and treasury accounting should remain cREP unless there is a deliberate decision to redesign those economics too. Those surfaces are heavily cREP-specific today. `packages/foundry/contracts/CategoryRegistry.sol:19-21`, `packages/foundry/contracts/FrontendRegistry.sol:14-15`, `packages/foundry/contracts/HumanFaucet.sol:13-17`

## What Native Multi-Token Voting Would Mean In Practice

### 1. Mixed-asset rounds need a common unit

The current engine simply sums raw stake amounts into `upPool` and `downPool`.

- That is defensible only when every stake is the same asset. `packages/foundry/contracts/RoundVotingEngine.sol:101-105`, `packages/foundry/contracts/RoundVotingEngine.sol:491-502`, `packages/foundry/contracts/RoundVotingEngine.sol:1018-1046`
- If the protocol accepted both cREP and a stablecoin in the same round, it would need either:
  - oracle-based normalization into an internal unit,
  - governance-set conversion ratios,
  - or separate pools / separate rounds per asset.

Without one of those, "100 cREP" and "100 USDC" are just incomparable raw numbers.

### 2. Participation rewards stop making sense automatically

The current participation bonus is "stake amount times cREP reward rate."

- `ParticipationPool` computes rewards directly from `stakeAmount`. `packages/foundry/contracts/ParticipationPool.sol:189-217`
- `RoundSettlementSideEffectsLib` snapshots the participation rate from the cREP participation pool into content settlement side effects. `packages/foundry/contracts/libraries/RoundSettlementSideEffectsLib.sol:25-58`
- `RoundRewardDistributor` stores `rewardPool` and `rewardRateBps` snapshots that assume a cREP participation pool. `packages/foundry/contracts/RoundRewardDistributor.sol:71-80`, `packages/foundry/contracts/RoundRewardDistributor.sol:96-117`

If a user stakes USDC or another token, the protocol would need to choose one of these:

- treat external-token stake as cREP-equivalent using an oracle,
- create separate per-asset participation pools,
- or disable participation rewards for non-cREP voting.

The safest initial rule would be: cREP votes keep existing participation rewards; non-cREP votes do not earn cREP participation emissions until a separate reward policy exists.

### 3. Frontend, category, treasury, and consensus flows would all need policy changes

Today those flows inherit value from the losing cREP pool.

- Frontend fees are credited as `crepFees` in `FrontendRegistry`. `packages/foundry/contracts/FrontendRegistry.sol:34-44`, `packages/foundry/contracts/FrontendRegistry.sol:232-239`
- Category submitter rewards are paid through `CategoryFeeLib` with `crepToken`. `packages/foundry/contracts/RoundVotingEngine.sol:696-710`
- Treasury fees are transferred as cREP. `packages/foundry/contracts/RoundVotingEngine.sol:715-725`
- Consensus reserve is a cREP reserve. `packages/foundry/contracts/RoundVotingEngine.sol:134-136`, `packages/foundry/contracts/RoundVotingEngine.sol:202-207`, `packages/foundry/contracts/RoundVotingEngine.sol:674-678`

If stablecoin stakes are introduced, the protocol must explicitly decide whether those derived fees:

- remain in the stake asset,
- get converted to cREP,
- or are disabled for non-cREP rounds.

There is no safe "just reuse the current fee logic" path.

### 4. The Voter ID stake cap would need redesign

The current cap is hard-coded as "100 cREP" worth of raw units.

- `VoterIdNFT.MAX_STAKE_PER_VOTER = 100e6`. `packages/foundry/contracts/VoterIdNFT.sol:16-18`
- Stake recording and capacity checks simply add raw amounts. `packages/foundry/contracts/VoterIdNFT.sol:274-310`

This works for cREP and only accidentally works for assets that share the same decimals and a policy of `1 token unit = 1 cREP unit`. It does not work for arbitrary ERC-20 assets.

### 5. Off-chain blast radius is large

The cREP assumption is not isolated to Solidity.

- `rg` finds cREP or `CuryoReputation` references in 117 files across `packages/nextjs`, `packages/bot`, `packages/keeper`, and `packages/ponder`.
- The bot checks cREP balances and allowances before both voting and submission. `packages/bot/src/commands/vote.ts:51-60`, `packages/bot/src/commands/vote.ts:135-166`, `packages/bot/src/commands/submit.ts:13`, `packages/bot/src/commands/submit.ts:126-145`, `packages/bot/src/commands/submit.ts:203-258`
- The UI reads `CuryoReputation` directly for stake selection, submission approvals, category submission, delegation, faucet, frontend registration, docs, charts, and claim messaging. Representative examples:
  - `packages/nextjs/components/swipe/StakeSelector.tsx:66-101`
  - `packages/nextjs/components/submit/ContentSubmissionSection.tsx:335-345`
  - `packages/nextjs/components/submit/ContentSubmissionSection.tsx:470-645`
  - `packages/nextjs/components/governance/CategorySubmissionForm.tsx:32-40`
  - `packages/nextjs/components/governance/CategorySubmissionForm.tsx:74-123`
- Ponder indexes reward amounts under cREP-shaped field names like `crepReward` and `crepAmount`. `packages/ponder/ponder.schema.ts:140-170`, `packages/ponder/ponder.schema.ts:290-317`, `packages/ponder/src/RoundRewardDistributor.ts:18-30`, `packages/ponder/src/RoundRewardDistributor.ts:64-77`

## Bonus Pools, Participation Pool, Treasury, And Faucet Impact

### `bonusPool`

The `bonusPool` name is slightly misleading in this repo. It is the content-cancellation fee sink.

- It receives the `1 cREP` cancellation fee when a submitter voluntarily cancels before any votes. `packages/foundry/contracts/ContentRegistry.sol:266-270`, `packages/foundry/contracts/ContentRegistry.sol:346-379`
- If only vote stakes become multi-asset and submission remains cREP, `bonusPool` can stay unchanged.
- If submission stakes ever become multi-asset too, `bonusPool` would need a new asset policy as well.

### Participation pool

- This is the actual cREP "bonus pool" in practice: a `34M cREP` emissions pool for participation bonuses. `packages/foundry/script/DeployCuryo.s.sol:228-240`, `packages/foundry/contracts/ParticipationPool.sol:10-14`
- It is tightly tied to cREP-denominated stake sizes. If non-cREP voting is introduced, this pool either needs a normalization layer or should remain cREP-only.

### Treasury

- The treasury starts with `10M cREP` and receives cREP inflows from round settlement, cancellation fees, forfeitures, and stranded cleanup. `packages/foundry/script/DeployCuryo.s.sol:224-226`, `packages/nextjs/app/docs/tokenomics/page.tsx:189-206`
- Native external-asset voting means treasury policy must answer whether the treasury accumulates those external assets too, or whether all such value is converted.

### Faucet

- The faucet holds the remaining `52M cREP` launch allocation and distributes cREP to verified humans. `packages/foundry/script/DeployCuryo.s.sol:242-289`, `packages/foundry/contracts/HumanFaucet.sol:13-17`, `packages/foundry/contracts/HumanFaucet.sol:46-59`
- This faucet does not need to change for a multi-asset voting V2 if cREP remains the governance and onboarding token.

## Governance And Quorum Side Effects

### Governance quorum itself can stay cREP-only

That part is straightforward and desirable.

- `CuryoGovernor.quorum()` uses historical cREP voting power, excluding a fixed list of protocol-controlled cREP holders. `packages/foundry/contracts/governance/CuryoGovernor.sol:138-151`
- Governance docs already describe the intended philosophy: governance power comes from cREP reputation, not buying power. `packages/nextjs/app/docs/governance/page.tsx:12-21`

### But the excluded-holder set is fixed after initialization

This matters if a future multi-token design introduces new protocol-controlled cREP holders.

- `initializePools()` can only be called once. `packages/foundry/contracts/governance/CuryoGovernor.sol:77-97`
- The excluded-holder set is intentionally fixed after that. `packages/foundry/contracts/governance/CuryoGovernor.sol:77-83`
- Tests explicitly assert that excluded holders remain fixed. `packages/foundry/test/Governance.t.sol:457-508`

Because `CuryoReputation` auto-self-delegates on first receipt, any new contract address that holds cREP will also hold cREP voting power by default. `packages/foundry/contracts/CuryoReputation.sol:190-193`

That means:

- if a future adapter or reserve contract holds cREP,
- and it is not in the governor's excluded-holder set,
- its cREP can unexpectedly count toward circulating supply and quorum math.

Under the current design, avoiding that either requires:

- reusing already-excluded cREP holder addresses,
- or deploying a new governor and reinitializing the excluded-holder set.

## Upgrade Constraints

### Contracts that are upgradeable behind proxies

These can evolve under the timelock if storage changes stay compatible:

- `ContentRegistry` `packages/foundry/contracts/ContentRegistry.sol:191-237`
- `RoundVotingEngine` `packages/foundry/contracts/RoundVotingEngine.sol:177-200`, `packages/foundry/contracts/RoundVotingEngine.sol:1124-1125`
- `RoundRewardDistributor` `packages/foundry/contracts/RoundRewardDistributor.sol:120-141`
- `ProtocolConfig` `packages/foundry/contracts/ProtocolConfig.sol:8-32`, `packages/foundry/contracts/ProtocolConfig.sol:44-85`
- `FrontendRegistry` `packages/foundry/contracts/FrontendRegistry.sol:52-70`
- `ProfileRegistry` (not central to this question, but also proxied)

The proxy admin owner is the governance timelock. `packages/foundry/script/DeployCuryo.s.sol:120-165`, `packages/foundry/script/DeployCuryo.s.sol:536-615`

### Contracts that are not upgradeable, or pin key references immutably

- `CuryoReputation` is non-upgradeable and is the governance token. `packages/foundry/script/DeployCuryo.s.sol:88-90`
- `CuryoGovernor` is non-upgradeable and stores `crepToken` and `poolsInitializer` as `immutable`. `packages/foundry/contracts/governance/CuryoGovernor.sol:35-38`
- `CategoryRegistry` is non-upgradeable and stores its `token` as `immutable`. `packages/foundry/contracts/CategoryRegistry.sol:38`, `packages/foundry/script/DeployCuryo.s.sol:167-177`
- `ParticipationPool` is non-upgradeable and stores both `crepToken` and `governance` as `immutable`. `packages/foundry/contracts/ParticipationPool.sol:30-35`
- `HumanFaucet` is non-upgradeable and stores both `crepToken` and `governance` as `immutable`. `packages/foundry/contracts/HumanFaucet.sol:46-47`, `packages/foundry/contracts/HumanFaucet.sol:135-149`
- `VoterIdNFT` is non-upgradeable. `packages/foundry/contracts/VoterIdNFT.sol:11`, `packages/foundry/contracts/VoterIdNFT.sol:97-102`

### Governance migration is uneven

- `CategoryRegistry` supports `updateGovernance(governor, timelock)`. `packages/foundry/contracts/CategoryRegistry.sol:92-112`
- `VoterIdNFT` supports `setGovernance(...)`, so ownership can be repointed before transfer. `packages/foundry/contracts/VoterIdNFT.sol:127-133`
- `ParticipationPool` and `HumanFaucet` do not support repointing governance. Ownership transfer is restricted to the original immutable governance address only. `packages/foundry/contracts/ParticipationPool.sol:33-35`, `packages/foundry/contracts/ParticipationPool.sol:100-108`, `packages/foundry/contracts/HumanFaucet.sol:135-159`

That means:

- deploying a new governor with the same timelock is comparatively feasible,
- but migrating to a brand-new timelock is much harder because some owned contracts cannot hand off to a new governance address.

### The repo itself warns against assuming an in-place voting-engine upgrade is always safe

- The deploy script says `RoundVotingEngine` has had storage-breaking voting-system rewrites before, and advises fresh proxy deployment rather than in-place upgrade for those versions. `packages/foundry/script/DeployCuryo.s.sol:145-147`

For a change as large as native multi-asset voting, that warning matters.

## Recommended Paths

### Path A: Access-layer stablecoin support, core protocol still cREP

Best if the real goal is usability.

- Users arrive with USDC/USDT.
- A frontend service, helper contract, or external venue converts that value into cREP before `reserveSubmission()` or `commitVote()`.
- The existing protocol still sees only cREP.

Why this is attractive:

- cREP remains usable everywhere.
- cREP remains the only governance token.
- `bonusPool`, `ParticipationPool`, frontend fees, category rewards, treasury flows, faucet, and quorum logic all stay intact.
- This can be added later with much less protocol risk than native multi-asset voting.

Main tradeoffs:

- it is not true on-protocol multi-asset voting,
- it needs a trusted or market-based conversion path,
- and it may be philosophically sensitive if the project wants to avoid making cREP feel purchasable.

### Path B: Native multi-asset voting V2

Best only if the protocol truly wants content-voting stake itself to be multi-asset.

Recommended shape:

- Keep `CuryoReputation` and `CuryoGovernor` unchanged for governance.
- Keep cREP as one allowed content-voting asset.
- Deploy a new voting engine and reward distributor rather than retrofitting the current ones.
- Add explicit asset policy in config:
  - allowed assets,
  - decimals handling,
  - normalization rules,
  - and whether each asset earns participation rewards.
- Avoid holding cREP in new protocol contracts unless quorum-exclusion consequences are handled.

My recommendation inside this path:

- Do not mix raw cREP and raw stablecoin stakes in the same accounting pools without explicit normalization.
- Start with cREP plus a very small set of approved stablecoins only.
- Initially disable cREP participation emissions for non-cREP stake assets.
- Leave category stake, frontend stake, faucet, and governance cREP-only.

### Path I would avoid

- A "small adapter" that makes the current engine look multi-asset while silently introducing new cREP-holding vaults, price assumptions, or fee conversions behind the scenes.

That approach collides with:

- fixed excluded-holder quorum logic,
- cREP-denominated participation rewards,
- cREP-denominated frontend and category fees,
- and the raw-unit Voter ID cap.

## Bottom Line

If the question is "can we let people use stablecoins later," the answer is yes.

- If you only need stablecoins as an access path, add them outside the core protocol and keep the onchain stake asset as cREP. That is the least risky path by far.
- If you want true native multi-token content voting, treat it as a new protocol version. Keep cREP as the only governance token, keep cREP usable as a vote asset, and expect a new voting/reward design rather than a simple upgrade flag.
