# Social Graph Reputation Rating System

Research date: 2026-05-07

This note evaluates replacing the Self.xyz faucet-centered identity model with
earned, non-transferable reputation and a social-graph-informed rating system.
It also maps the change onto the current Curyo contracts, indexer, app, and
governance surfaces.

## Short Answer

Curyo should not use "voted with the majority" as the sole definition of
accuracy. That creates a reflexive majority machine: once a coalition controls
enough voting power, it can define the majority, earn more reputation, and make
future capture easier.

The better design is:

- Use commit-reveal voting as the base signal.
- Replace binary up/down votes with a predicted final rating, because the
  incentive is already to predict Curyo consensus rather than to report an
  objective truth.
- Make reputation non-transferable and earned from revealed, settled
  participation.
- Score users with a conservative signal-quality model, not raw majority
  agreement.
- Let a social graph estimate independence and Sybil risk, mostly to cap
  influence and payouts.
- Replace transferable HREP staking with reputation locks and bounded burn risk.
- Use reputation for governance, but with slower thresholds, caps, decay, and
  emergency controls.
- Remove Self.xyz completely in a redeploy: no faucet, no Self hub wiring, no
  Self UI, no Self adapter, and no Self-specific nullifier assumptions.

The main recommendation is a two-score model:

1. `credibility`: earned from useful voting history, reveal reliability,
   category-specific performance, and feedback quality.
2. `independence`: derived from social graph structure, attestation quality,
   correlated voting patterns, wallet/device/session risk, and optional external
   proof signals.

Voting weight and USDC payout eligibility should use both:

```text
effectiveVotingPower =
  sqrt(credibility) * independenceMultiplier * stakeConvictionMultiplier
```

Where all three terms have caps, and where the graph term can reduce power but
should rarely increase it beyond the earned reputation baseline.

USDC bounty payout should be based on effective independent participants, not
wallet count. If one operator farms many medium-reputation accounts that vote
and reveal together, those accounts should share a cluster-capped allocation
rather than each receiving a full independent payout.

The primary vote payload should be simple:

```text
predictedFinalRatingBps: 1000-9900
stakeAmount: capped reputation at risk
```

Do not add a new reasoning field to the vote. Curyo already has separate
feedback fields for written explanation, and those should remain separate from
the compact prediction payload.

## Research Notes

### Reputation And Trust Algorithms

EigenTrust is the closest conceptual ancestor. It computes a global trust score
from local trust values, weighted by the trust of the raters. The important
lesson is not "copy EigenTrust on chain"; it is that local observations become
safer when normalized, seeded, and recursively weighted. It also shows why raw
peer endorsements are dangerous if malicious users can assign arbitrary trust to
each other.

Source: EigenTrust paper, "The EigenTrust Algorithm for Reputation Management in
P2P Networks" by Kamvar, Schlosser, and Garcia-Molina:
https://www.iw3c2.org/papers/2019-EigenTrust/index.html

Social-network Sybil defenses such as SybilGuard, SybilLimit, SybilRank, and
later surveys generally rely on a social graph having a well-connected honest
region and relatively few attack edges into Sybil regions. The research is
useful, but the assumptions are brittle. Real attackers can farm edges, exploit
temporal graph dynamics, or create dense communities that look legitimate.

Sources:

- "SoK: The Evolution of Sybil Defense via Social Networks":
  https://research.google/pubs/sok-the-evolution-of-sybil-defense-via-social-networks/
- "Exploiting Temporal Dynamics in Sybil Defenses":
  https://collaborate.princeton.edu/en/publications/exploiting-temporal-dynamics-in-sybil-defenses

Product lesson: the graph should be a risk model and independence discount, not
the sole source of voting power.

### Majority-Coherence Incentives

Kleros and Augur show that coherence with a final outcome can be a workable
economic incentive when combined with stake, escalation, appeals, and high costs
for persistent manipulation.

Kleros uses PNK staking for juror selection and Sybil resistance. Jurors who vote
incoherently with the majority risk losing tokens, and coherent jurors earn.
Kleros explicitly frames the token as both an incentive and a Sybil defense.

Sources:

- Kleros introduction:
  https://docs.kleros.io/
- Kleros PNK token docs:
  https://docs.kleros.io/pnk-token
- Kleros FAQ:
  https://docs.kleros.io/kleros-faq

Augur uses reputation stake, escalating dispute bonds, and forks as last-resort
social resolution. The useful lesson for Curyo is that "stake on the truth" can
work only when the cost of manipulating truth is high and the system has a path
for disputes. Curyo content ratings are usually lower-stakes and more
subjective, so copying Augur-style hard finality would be too heavy.

Sources:

- Augur market resolution:
  https://augur.gitbook.io/help-center/disputing-explained
- Augur fork explanation:
  https://augur.gitbook.io/help-center/forking-explained

Product lesson: reward coherence, but avoid treating coherence as objective
truth. Add caps, category separation, decay, and challenge paths.

### Peer Prediction And Rating Forecasts

Bayesian Truth Serum and peer prediction are relevant because Curyo often
evaluates subjective questions where there may be no external ground truth. BTS
rewards "surprisingly common" answers, not merely majority answers, and asks
respondents to predict how others will answer. This is a strong warning against
simple majority agreement, but it also clarifies what Curyo's incentive already
is: participants are rewarded for anticipating where the independent Curyo crowd
will converge.

Sources:

- Prelec, "A Bayesian Truth Serum for Subjective Data":
  https://www.science.org/doi/10.1126/science.1102081
- Weaver and Prelec, "Creating Truth-Telling Incentives with the Bayesian Truth
  Serum":
  https://journals.sagepub.com/doi/10.1509/jmr.09.0039
- Witkowski and Parkes, "A Robust Bayesian Truth Serum for Small Populations":
  https://dash.harvard.edu/handle/1/11882034

Product lesson: make the implicit Schelling game explicit. Instead of asking for
`up/down`, ask voters to predict the final rating directly:

```text
predictedFinalRating: 1.0-9.9
```

Stake becomes the conviction/confidence signal, so a separate confidence field
is not required for the first redeploy. Existing feedback fields remain the
place for written reasoning. This makes reputation easier to define:

```text
calibrationError =
  abs(predictedFinalRating - finalRatingExcludingVoterOrCluster)
```

The important guardrail is leave-one-out scoring. A voter should be scored
against the final rating computed without that voter. For USDC bounties and
cluster-risky rounds, score each account against the final rating excluding its
correlated cluster. That prevents a coordinated group from making itself look
accurate simply by pulling the final rating toward its own prediction.

### Privacy And Anti-Collusion

MACI is relevant because it focuses on private on-chain voting with reduced
bribery and collusion risk through encryption and zero-knowledge tally proofs.
Curyo's current tlock commit-reveal already hides votes during the blind phase,
but after reveal each vote is public. That is appropriate for public ratings,
but bribery and vote-copy markets remain possible once votes are revealed.

Source: MACI docs:
https://maci.pse.dev/

Semaphore is relevant if Curyo wants optional anonymous one-person-one-vote
proofs, group membership proofs, or nullifier-based duplicate prevention without
revealing identity.

Source: Semaphore docs:
https://docs.semaphore.pse.dev/

Product lesson: keep public commit-reveal for normal content ratings. Consider
MACI only for high-stakes governance/funding events where vote privacy and
receipt-freeness matter more than Curyo's public audit trail.

### Token Standards

Current `HumanReputation` is an ERC20Votes token with transfer restrictions only
around governance locks. A non-transferable reputation token can still implement
votes/checkpoints, but staking cannot rely on `transferFrom` into
`RoundVotingEngine`.

Relevant standards and libraries:

- OpenZeppelin ERC20Votes:
  https://docs.openzeppelin.com/contracts/5.x/api/token/ERC20
- ERC-5192 minimal soulbound NFTs:
  https://eip.info/eip/5192

Product lesson: keep ERC20Votes-style checkpoints if Curyo wants on-chain
governance, but replace economic staking transfers with protocol-native locks
and burns. Use a separate ERC-5192-style identity/profile badge only if wallet
composability matters.

## Current Curyo Baseline

The existing protocol already contains many of the pieces needed for the new
design:

- `packages/foundry/contracts/HumanReputation.sol`
  - ERC20Votes HREP with 6 decimals, max supply, minting roles, self-delegation,
    and governance locks.
- `packages/foundry/contracts/HumanFaucet.sol`
  - Self.xyz verification, age/sanctions policy, faucet tiers, referrals, and
    Voter ID minting.
- `packages/foundry/contracts/VoterIdNFT.sol`
  - Soulbound voter identity, nullifier uniqueness, delegation, per-content
    stake caps, and stake recorder hooks.
- `packages/foundry/contracts/RoundVotingEngine.sol`
  - tlock commit-reveal, HREP staking, voter ID gating, cooldowns, epoch
    weighting, binary settlement, and reward accounting.
- `packages/foundry/contracts/RoundRewardDistributor.sol`
  - Winner reward claims, loser rebates, participation reward claims, frontend
    fees, and SBT-holder reward routing.
- `packages/foundry/contracts/ParticipationPool.sol`
  - HREP bootstrap participation rewards with halving tiers.
- `packages/foundry/contracts/governance/CuryoGovernor.sol`
  - HREP-based OpenZeppelin Governor, dynamic quorum, self-delegation, and
    governance locks.
- `packages/ponder/src/RoundVotingEngine.ts`
  - vote/round indexing and current majority-agreement accuracy stats.
- `packages/ponder/ponder.schema.ts`
  - `voter_stats`, `voter_category_stats`, `profile`, `voter_id`,
    `human_faucet_claim`, and token transfer history.
- `packages/nextjs/components/governance/SelfVerifyButton.tsx`
  - current Self QR/auth UX.
- `packages/nextjs/lib/follows/profileFollow.ts`
  - off-chain wallet-to-wallet follows, currently useful for discovery and
    notifications but not protocol trust.

The current launch allocation in `packages/foundry/script/DeployCuryo.s.sol` is:

- 4M HREP consensus reserve.
- 32M HREP treasury.
- 12M HREP participation pool.
- 52M HREP Self.xyz faucet.

The redeploy can remove the faucet allocation and reshape the token economy
around earned reputation rather than early identity claims.

## Recommended Protocol Model

### 1. Replace Transferable HREP With Earned Non-Transferable Reputation

Rename or redefine `HumanReputation` as non-transferable reputation:

- Minted only by protocol reward logic and governance-approved migrations.
- Burned/slashed only by protocol rules or governance sanctions.
- Not transferable between users.
- Still checkpointed for governance with ERC20Votes-style history.
- Still self-delegated by default, unless Curyo later wants explicit delegation.

This removes the biggest market attack against a reputation-governed rating
protocol: buying reputation.

Implementation direction:

- Keep `ERC20Votes` and `ERC20Permit` only if useful.
- Override `_update` to allow mint, burn, and protocol escrow/lock accounting,
  but reject user-to-user transfers.
- Remove `ERC1363` vote transfer flow, because voting should no longer move
  tokens into the engine.
- Replace `balanceOf` as "raw reputation" with explicit views:
  - `availableReputation(account)`
  - `lockedReputation(account)`
  - `atRiskReputation(account)`
  - `governanceVotes(account)`

### 2. Remove Self.xyz Completely

Remove or retire:

- `HumanFaucet.sol`
- Self remappings and Self hub config in deployment scripts.
- `SelfVerifyButton` and faucet claim UI.
- `human_faucet_claim` and referral-specific indexer surfaces for the new
  deployment.
- Self-specific nullifier assumptions in comments, events, schemas, docs,
  generated ABIs, test names, deployment verification, and frontend copy.

Important caveat: removing Self means Curyo no longer has a hard uniqueness
proof at onboarding. Sybil resistance must then come from slow reputation
earning, graph independence, bot checks, payout caps, and optional
non-Self high-assurance proofs for high-value voting.

If optional proofs are desired later, add a generic provider-neutral registry
that explicitly excludes Self.xyz from the redeploy scope:

```text
ProofSignalRegistry
  recordProof(account, provider, nullifierHash, score, expiresAt)
  revokeProof(account, provider)
```

Provider-specific verification should live in separate adapters, but Self.xyz
should not be one of those adapters in this redesign.

### 3. Replace Voter ID With Reputation Identity

The current `VoterIdNFT` does several useful jobs:

- one effective voter per nullifier;
- delegation;
- per-content/round stake caps;
- reward routing to current identity holder;
- self-vote prevention through submitter nullifier checks.

In the new model, replace it with `ReputationIdentity` or simplify it into the
reputation token itself.

Recommended redeploy contract:

```text
ReputationIdentity
  - soulbound account/profile identity
  - optional external proof nullifiers
  - optional delegation
  - graph attestation records
  - per-round participation caps
  - submitter identity snapshots
```

Do not require an identity proof to mint this object. Instead, it can be created
when a wallet first participates, but it starts with near-zero weight until it
earns credibility and independence.

### 4. Move Staking From Token Transfer To Reputation Locking

Current voting stakes transfer HREP into `RoundVotingEngine`. That cannot work
cleanly with non-transferable reputation. Use lock-and-burn accounting instead:

```text
commitVote(contentId, ..., stakeAmount)
  require availableReputation(voter) >= stakeAmount
  lock reputation until round terminal
  snapshot base reputation and graph score

settleRound(...)
  winners unlock stake and may earn reputation
  losers unlock most stake, burn a bounded penalty
  non-revealers burn a larger bounded penalty
```

This preserves "skin in the game" without creating a transferable market.

### 5. Keep Staking, But Do Not Let Users Stake All Reputation Freely

Users should be able to express conviction with staked reputation, but allowing
"stake all reputation on a question" is too dangerous.

Recommended rule:

- Let users stake a chosen amount.
- Cap stake per content/round at a fraction of available reputation.
- Cap stake per category per epoch.
- Apply diminishing returns to stake.
- Burn only a bounded fraction for ordinary prediction error.
- Burn more for non-reveal than for ordinary prediction error.

Example:

```text
maxStakeForRound =
  min(
    absoluteRoundCap,
    availableReputation * 10%,
    categoryBudgetRemaining
  )

stakeConvictionMultiplier =
  1 + min(0.5, sqrt(stakeAmount / maxStakeForRound) * 0.5)
```

This makes staking meaningful without letting one emotional or malicious vote
destroy a user or dominate a small round.

### 6. Score Accuracy Conservatively

The current indexer already computes `voter_stats` and `voter_category_stats`
from revealed votes matching `round.upWins`. Keep that as a visible metric, but
do not directly mint voting power from it.

Recommended reputation scoring inputs:

- reveal reliability;
- settled participation count;
- category-specific track record;
- rating prediction error against leave-one-out consensus;
- rating prediction error against cluster-excluded consensus for payout-sensitive
  rounds;
- proximity to high-independence consensus;
- feedback quality and bounty completion;
- penalty for non-reveals;
- penalty for dense correlated clusters;
- decay for stale reputation.

Formula sketch:

```text
roundQuality =
  min(1, revealedCount / targetVoters)
  * min(1, independentClusterCount / targetClusters)
  * highConfidenceRoundMultiplier

calibrationCredit =
  max(0, 1 - predictionErrorBps / maxRewardedErrorBps) * roundQuality

reputationDelta =
  baseParticipationMint
  + calibrationCredit * categoryLearningRate
  - nonRevealPenalty
```

Outlier predictions should not be punished heavily by default. On subjective or
low-confidence content, a minority forecast can be useful. Prediction-error burn
should be small unless the miss is extreme, the round has high independent
participation, or the system has strong external evidence or dispute resolution.

### 7. Add Graph Independence, Not Friend-Based Power

The social graph should not be "my friends make me powerful." That invites
reciprocal endorsement rings.

Recommended graph signals:

- follows and endorsements from established users;
- successful co-voting diversity across categories;
- graph distance from trusted seeds;
- ratio of inbound to reciprocal edges;
- account age and activity history;
- cluster density;
- repeated same-side voting within the same cluster;
- shared wallet/session/device/routing risk where available off-chain;
- optional non-Self proof-of-personhood or attestation signals.

Use the graph primarily to discount:

```text
independenceMultiplier:
  1.00 = well-established independent signal
  0.75 = moderately correlated
  0.40 = dense cluster or new ring
  0.10 = likely Sybil farm
```

Do not put graph computation directly in Solidity. Compute it in the indexer or
a dedicated off-chain scorer, publish epoch roots, and let contracts snapshot
the root or score at commit time only when high-value payout enforcement needs
on-chain availability.

### 8. Split Reputation From USDC Payouts

USDC changes incentives sharply. A reputation-only game is mostly governance and
status. A USDC game becomes farming.

Recommended USDC payout model:

- USDC bounties pay only revealed voters who pass minimum credibility and
  independence thresholds.
- Payouts are split by effective independent participants, not raw wallet count.
- Payouts are capped per identity, per cluster, per epoch, and per category.
- Reputation is primarily an eligibility gate, not a direct claim on USDC.
- Higher reputation may create a small bounded multiplier, but never a linear
  payout curve.
- Dense clusters share a capped payout pool rather than multiplying it.
- Medium-reputation account farms should collapse into a smaller effective
  participant count when their graph, timing, voting, reveal, or session
  behavior is correlated.
- New accounts can earn reputation in calibration rounds before receiving large
  USDC.
- High-value USDC bounties can require optional non-Self external proof or
  curator approval during early launch.

Concrete split example:

```text
raw eligible wallets = 20
cluster-adjusted effective participants = 12
usdcPerEffectiveParticipant = bountyPool / 12

cluster A has 8 correlated wallets and counts as 2 effective participants.
cluster A receives 2 * usdcPerEffectiveParticipant, split internally across
its 8 wallets by revealed participation and any bounded reputation multiplier.
```

This closes the obvious "farm many medium-reputation wallets" loop. The protocol
can still show all revealed votes, but payout allocation should reward
independent signal, not account multiplication.

### 9. Use Reputation For Governance, But Slow It Down

Replacing current governance HREP with non-transferable reputation is coherent,
but it raises bootstrapping risk.

Recommended governance rules:

- Governance voting uses `reputationVotes`, not transferable balances.
- Proposal threshold uses reputation plus minimum account age/settled rounds.
- Quorum is based on active reputation, not total minted reputation.
- Treasury and protocol pools are excluded from quorum.
- Reputation earned in the last N days has reduced governance weight.
- Emergency guardian or timelock remains during bootstrap.
- No user-to-user delegation at first. Current self-delegation-only behavior is a
  reasonable default.

This avoids a same-week farming campaign turning into immediate protocol
control.

## Contract Integration Plan

### Replace `HumanReputation.sol`

New responsibilities:

- non-transferable reputation balances;
- voting/checkpoints for governance;
- protocol roles for mint, burn, lock, unlock;
- category or epoch budget views, if kept on chain;
- governance lock support.

Remove or change:

- user transfers;
- ERC1363 transfer-and-call vote staking;
- launch max supply assumptions tied to faucet allocation.

### Remove `HumanFaucet.sol`

Redeploy without:

- Self hub address resolution;
- config ID setup;
- migration bootstrap claims;
- tier/referral faucet allocation;
- Self telemetry and QR claim UX.

If optional proofs are desired later, add a smaller provider-neutral signal
registry that explicitly excludes Self.xyz:

```text
ProofSignalRegistry
  recordProof(account, provider, nullifierHash, score, expiresAt)
  revokeProof(account, provider)
```

Provider-specific proof verification can live in separate adapters, but Self.xyz
should not be one of those adapters in this redesign.

### Replace Or Simplify `VoterIdNFT.sol`

Option A: keep a soulbound identity NFT:

- rename to `ReputationIdentity`;
- remove Self-specific nullifier language;
- support optional proof nullifiers;
- keep delegation if still needed for Ledger/MetaMask or agent wallets;
- keep per-round cap hooks.

Option B: remove the NFT:

- let `HumanReputation` be the identity surface;
- store submitter identity as wallet address plus optional proof nullifier;
- implement delegation in a separate `DelegationRegistry`.

Option A is less invasive because current contracts already expect a voter
identity interface.

### Rewrite `RoundVotingEngine.sol` Stake Accounting

Current:

- requires Voter ID if configured;
- accepts 1 to 100 HREP stake;
- transfers HREP to engine;
- weighted pools decide the binary side;
- losing HREP funds rewards, consensus reserve, treasury, and frontend fees.

Recommended:

- replace `isUp` with `predictedFinalRatingBps` in the committed payload and
  reveal hash;
- snapshot `baseReputation`, `availableReputation`, `graphScore`, and
  `categoryWeight` at commit;
- lock chosen stake in the reputation token;
- compute `effectiveWeight`, not raw HREP transfer stake;
- use `effectiveWeight` for rating aggregation and calibration scoring;
- use `stakeAmount` only as conviction/risk;
- burn/penalize through reputation token on terminal outcomes;
- score reputation against leave-one-out or cluster-excluded final ratings;
- route USDC bounty rewards through `QuestionRewardPoolEscrow`, not from losing
  reputation.

This is a storage-breaking rewrite. The current `RoundLib.Commit` should be
versioned or the engine should be redeployed behind a fresh proxy, matching the
existing deploy-script warning.

### Rewrite `RoundRewardDistributor.sol`

Current HREP winner-pool accounting depends on losing stake being held by the
voting engine. In the new model:

- reputation rewards are minted/burned by prediction-calibration rules;
- stake refunds are unlocks, not ERC20 transfers;
- USDC/HREP bounty rewards still use escrowed assets;
- "loser rebate" becomes "prediction-error burn rate" or "stake unlock rate";
- non-reveal penalties can burn more and/or apply cooldown.

### Rework `ParticipationPool.sol`

The current 12M HREP bootstrap pool should become one of:

1. Removed entirely, with reputation minted directly by `RoundRewardDistributor`.
2. Repurposed as a bounded `ReputationEmissionController`.
3. Kept only for display/accounting, not as a token-holding pool.

The strongest option is `ReputationEmissionController`:

```text
epochEmissionBudget
categoryEmissionBudget
newUserCalibrationBudget
maxMintPerIdentityPerEpoch
```

### Update `CuryoGovernor.sol`

The current Governor can stay structurally similar if the new reputation token
implements `IVotes`.

Changes needed:

- quorum based on active earned reputation;
- proposal threshold based on aged reputation;
- no excluded faucet pool;
- optional bootstrap guardian until enough independent reputation exists;
- reputation lock remains useful.

### Update Ponder

Add tables:

- `reputation_balance`
- `reputation_event`
- `reputation_lock`
- `reputation_epoch_score`
- `reputation_category_score`
- `social_attestation`
- `social_graph_epoch`
- `cluster_score`
- `identity_proof_signal`
- `usdc_payout_cap`
- `rating_prediction`
- `prediction_score`

Update existing stats:

- keep `voter_stats` but rename display from "accuracy" to "consensus
  calibration";
- add "reveal reliability";
- add "independence score";
- add "category credibility";
- add "prediction error";
- add "payout eligibility".

### Update Next.js

Remove:

- Self verification modal/button;
- faucet pages and referral UX;
- faucet invalidation logic.

Add:

- onboarding through "vote in calibration rounds";
- reputation profile;
- category-specific credibility;
- graph/independence explanation;
- bot/graph risk labels for ratings;
- staking slider with clear max and burn risk;
- predicted-rating vote control replacing binary up/down for the redesigned
  protocol;
- payout eligibility panel;
- follow/attestation UI if the graph becomes explicit.

## Should Users Still Stake Reputation?

Yes, but staking should change meaning.

Do not keep the current "stake transferable HREP and redistribute losers to
winners" model. For non-transferable reputation, staking should be:

- a lock during the round;
- a conviction signal;
- a bounded amount at risk;
- a defense against low-effort random voting;
- not the primary source of voting power.

Recommended settings for a first implementation:

- `minStake`: 1 reputation unit once the user has enough available reputation.
- `maxStake`: min(100 units, 10% of available reputation, category budget).
- `predictionErrorBurn`: 0% to 5% for ordinary misses, higher only for extreme
  misses in high-confidence rounds.
- `nonRevealBurn`: 25% to 100% of stake.
- `outlierNoBurn`: true for low-confidence or tightly clustered rounds.
- `stakeWeightCurve`: square root or log, never linear.

This keeps voting thoughtful without punishing useful dissent.

## Open Questions

1. Do we want any hard proof-of-personhood at launch?

   Recommendation: no hard proof for normal ratings, optional non-Self proof for
   high USDC payouts or governance bootstrap.

2. Should reputation be transferable at all?

   Recommendation: no. Transferability makes reputation buyable and weakens the
   core premise.

3. Should reputation be one global score or per-category?

   Recommendation: both. Use global reputation for baseline trust and governance,
   but category reputation should drive rating weight in topic-specific rounds.

4. Should graph follows be on chain?

   Recommendation: not initially. Start with signed off-chain follows and
   attestations, index them, and only later commit epoch roots on chain.

5. Should Curyo switch from binary votes to predicted final ratings?

   Recommendation: yes. This makes the existing "predict the crowd" incentive
   explicit. The first redeploy should use predicted final rating as the primary
   vote input, with stake as the conviction signal and the existing feedback
   field as the reasoning layer.

6. How does a new user get reputation without a faucet?

   Recommendation: calibration rounds with tiny weight, no or capped USDC payout,
   and higher emission for reliable reveal behavior across diverse categories.

7. What happens to current HREP holders?

   Recommendation: if redeploying from the existing deployment, migrate only
   earned/vested reputation-like balances, not liquid faucet balances blindly.
   Use a governance-approved migration snapshot with caps and vesting.

## Suggested Build Phases

### Phase 1: Design And Simulation

- Build an off-chain simulator from historical Ponder data.
- Compare binary majority agreement with continuous predicted-rating settlement,
  leave-one-out scoring, cluster-excluded scoring, graph discounts, and decay.
- Model Sybil farms with dense reciprocal edges and coordinated voting.
- Pick conservative caps before writing contracts.

### Phase 2: Redeploy Contracts

- New non-transferable reputation token.
- New or revised identity contract.
- Fresh `RoundVotingEngine` proxy with predicted-rating commits and lock/burn
  stake semantics.
- Revised reward distributor.
- No `HumanFaucet`.
- No Self.xyz adapter or Self-specific deployment wiring.
- Optional non-Self proof signal registry left unconfigured at launch.

### Phase 3: Indexer And App

- Add reputation and graph tables.
- Rename public "accuracy" to "consensus calibration".
- Add profile-level reputation breakdown.
- Add staking slider with burn-risk display.
- Add predicted-rating controls and prediction-error displays.
- Add payout eligibility, effective participant counts, and cluster caps.

### Phase 4: Governance Migration

- Move governance to the non-transferable reputation token.
- Use active/aged reputation quorum.
- Keep bootstrap timelock/guardian until the graph has enough independent
  participation.

## Final Recommendation

Proceed with the idea, but frame it as earned signal quality, not majority
truth.

The best Curyo-native design is:

- no Self faucet by default;
- no Self.xyz adapter, hub wiring, or Self-specific identity assumptions;
- non-transferable reputation;
- optional non-Self proof signals for high-risk cases;
- commit-reveal preserved with predicted final rating instead of binary up/down;
- stake as capped conviction and burn risk;
- graph as independence discount;
- USDC payout split by independent participant weight, then gated by reputation
  and graph caps;
- governance based on aged, earned, non-transferable reputation.

This would make the protocol more user-friendly than passport-based onboarding
while still raising the cost of bot and Sybil attacks over time. The main risk
is bootstrap capture, so the first implementation should be conservative:
low initial voting power, slow emissions, capped payouts, category separation,
and heavy monitoring before reputation controls major governance decisions.
