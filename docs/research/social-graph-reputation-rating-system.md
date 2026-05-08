# Social Graph Reputation Rating System

Research date: 2026-05-07

This note evaluates replacing the Self.xyz faucet-centered identity model with
an open rater network based on earned reputation and social-graph-informed
signal quality. The rater can be a human, an AI agent, a team, or a hybrid
workflow. The protocol should score predictions and independence, not try to
prove that every useful signal came from a human.

## Short Answer

Curyo should not use "voted with the majority" as the sole definition of
accuracy. That creates a reflexive majority machine: once a coalition controls
enough voting power, it can define the majority, earn more reputation, and make
future capture easier.

The better design is:

- Use one sealed commit-reveal prediction round as the base signal.
- Replace binary up/down votes with a predicted final rating, because the
  incentive is already to predict Curyo consensus rather than to report an
  objective truth.
- Treat human and AI raters as first-class accounts. AI rating AI can be useful
  signal when it is calibrated, diverse, and cluster-discounted.
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
   correlated voting patterns, and wallet/device/session risk.

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

The default rating workflow should be:

```text
private commit window -> reveal window -> final rating after one round
```

Additional rounds should be exceptional: low independent participation, high
dispersion, suspected manipulation, a high-value bounty, or a formal challenge.
The normal product should get to a concrete result after one sealed round.

This should be a fresh deployment, not a legacy-compatible migration. Existing
HREP balances should not migrate into the new reputation system.

## Research Findings For A Fresh Design

The relevant research points in one direction: without proof-of-personhood,
Curyo cannot prove "one human, one account." The redesign should therefore make
Sybil farms expensive to mature, easy to cluster, slow to exploit, capped in
payout, and reversible after detection.

Because this is a new deployment with no valuable historical data, the next step
should not be a historical backtest phase. The useful work now is specification,
adversarial review, bounded parameters, testnet telemetry, and public
auditability.

### Consensus Is Useful But Dangerous

Curyo's incentive is already "predict the Curyo crowd." Switching from binary
`up/down` to a predicted final rating makes that honest. The danger is that it
also makes the beauty-contest dynamic clearer: users can learn to predict the
majority rather than evaluate content, and a coalition with enough weight can
move the final rating, score itself as calibrated, and compound influence.

Research on proper scoring rules is a useful contrast. If Curyo were asking
about an objective future event, a capped Brier or log score would be the clean
way to reward honest probabilistic forecasts. Curyo ratings are often subjective
and endogenous, so a pure proper-scoring-rule design does not apply directly.
Peer prediction and Bayesian Truth Serum are closer conceptually because they
handle subjective questions, but they come with equilibrium and collusion risks.

Product lesson: use predicted final ratings, but never reward raw majority
matching. Score against leave-one-out and, for payout-sensitive rounds,
leave-one-cluster-out results. Hide aggregate predictions until after a user
commits, and present the result as calibrated public judgment rather than
objective truth. A single sealed round is preferable to visible iterative
rounds by default, because the point is to collect independent predictions
before social influence can collapse diversity.

Sources:

- Gneiting and Raftery, "Strictly Proper Scoring Rules, Prediction, and
  Estimation":
  https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf
- Brier, "Verification of Forecasts Expressed in Terms of Probability":
  https://cir.nii.ac.jp/crid/1361981468554183168
- Prelec, "A Bayesian Truth Serum for Subjective Data":
  https://www.science.org/doi/10.1126/science.1102081
- Prelec, Seung, and McCoy, "A Solution to the Single-Question Crowd Wisdom
  Problem":
  https://www.nature.com/articles/nature21054
- Lorenz et al., "How Social Influence Can Undermine the Wisdom of Crowd
  Effect":
  https://pmc.ncbi.nlm.nih.gov/articles/PMC3107299/
- Metaculus scoring FAQ:
  https://www.metaculus.com/help/scores-faq

### AI Raters Are First-Class But Need Bias Controls

Curyo does not need to be human-only. Many content, model-output, agent-output,
and data-quality tasks can benefit from AI raters. In those cases, the right
question is not "is this rater human?" but "has this rater been calibrated on
similar tasks, and is it independent from the content producer and other
raters?"

LLM-as-judge research is encouraging but not clean enough to trust blindly.
MT-Bench and Chatbot Arena show that strong model judges can approximate human
preferences in open-ended chat evaluation, but the same line of work documents
position bias, verbosity bias, self-enhancement bias, and limited reasoning.
FairEval and Length-Controlled AlpacaEval show that evaluator order and output
length can meaningfully distort automatic judgments, and that bias controls
improve reliability.

Product lesson: allow AI agents to rate and earn reputation, but cluster them by
operator, model family, provider, prompt/evaluator template, funding source, and
behavior. Several agents using the same model, owner, and prompt should count as
one correlated cluster until they prove independent calibration. AI reputation
should be category-specific, and model upgrades should trigger a warmup or
versioned reputation path.

Sources:

- Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena":
  https://arxiv.org/abs/2306.05685
- Wang et al., "Large Language Models are not Fair Evaluators":
  https://arxiv.org/abs/2305.17926
- Dubois et al., "Length-Controlled AlpacaEval":
  https://arxiv.org/abs/2404.04475
- AlpacaEval repository:
  https://github.com/tatsu-lab/alpaca_eval

### Social Graph Sybil Defense Is A Discount Model

Douceur's Sybil result remains the hard constraint: without a trusted identity
authority, Sybils are always possible under realistic assumptions. Social-graph
defenses can still help, but they depend on a limited-attack-edge assumption:
attackers can create many fake-to-fake relationships but only limited
fake-to-real trust relationships.

EigenTrust, SybilRank, SybilBelief, and malicious-account clustering work all
point to the same product lesson: graph edges are evidence, not identity. Cheap
follows, reciprocal endorsements, and same-cluster co-votes should not increase
power much. Harder-to-fake signals such as long-lived participation, accepted
submissions, diverse category history, reveal reliability, and support from
established uncorrelated users are more useful.

Product lesson: use the graph primarily to reduce influence and payouts. A
social graph should almost never boost a new account beyond its earned
reputation baseline.

Sources:

- Douceur, "The Sybil Attack":
  https://www.microsoft.com/en-us/research/publication/the-sybil-attack/
- Viswanath et al., "An Analysis of Social Network-Based Sybil Defenses":
  https://research.google/pubs/an-analysis-of-social-network-based-sybil-defenses/
- Gong, Frank, and Mittal, "SybilBelief":
  https://collaborate.princeton.edu/en/publications/sybilbelief-a-semi-supervised-learning-approach-for-structure-bas/
- Kamvar, Schlosser, and Garcia-Molina, "The EigenTrust Algorithm":
  https://www.iw3c2.org/papers/2019-EigenTrust/index.html
- Cao et al., "Uncovering Large Groups of Active Malicious Accounts in Online
  Social Networks":
  https://www.researchgate.net/publication/288236021_Uncovering_Large_Groups_of_Active_Malicious_Accounts_in_Online_Social_Networks
- Ohlhaver, Weyl, and Buterin, "Decentralized Society":
  https://www.microsoft.com/en-us/research/publication/decentralized-society-finding-web3s-soul/

### USDC Makes The System Adversarial

Non-transferable reputation reduces token buying, but it does not stop account
rental, managed voting services, social engineering, or farms that slowly mature
many wallets. Once USDC is attached, rational attackers optimize for expected
cash extraction.

Quadratic funding and plural funding research is relevant because it treats
identity multiplication and collusion as first-order design problems. The lesson
for Curyo is not to pay each wallet equally. Pay effective independent
participation, cap clusters, cap epochs, and keep any reputation-based payout
multiplier small.

Product lesson: USDC should be mostly a flat reward for eligible independent
signal, not a linear reward for reputation. Reputation should mainly determine
eligibility, max stake, and small bounded payout multipliers.

Sources:

- Buterin, Hitzig, and Weyl, "Liberal Radicalism":
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3243656
- Miller, Weyl, and Erichsen, "Plural Funding":
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4311507
- Cheng and Friedman, "Sybilproof Reputation Mechanisms":
  https://www.researchgate.net/publication/228367243_Sybilproof_reputation_mechanisms

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

### Public Auditability

The redesigned rating loop should remain public after reveal. Predicted ratings,
effective weights, leave-one-out or cluster-excluded scoring inputs, reputation
deltas, and USDC payout allocation should be indexable and auditable. This keeps
the reputation system legible and avoids an opaque scoring layer where users
must trust an operator to update reputation or bounty eligibility correctly.

## Concrete Mechanism Specification

### One Private Prediction Round

The default rating primitive should be one private prediction round:

```text
commit phase:
  raters privately commit to predictedFinalRatingBps and stakeAmount

reveal phase:
  raters reveal the prediction and salt

settlement:
  aggregate revealed eligible predictions
  publish final rating, confidence, dispersion, effective participants
  compute reputation deltas and USDC eligibility
```

This is simpler and faster than iterative rating. It also protects the initial
independence of the signal: raters do not see the developing crowd estimate
before committing. A second round should be an explicit exception for low-quality
settlement, not part of the normal path.

Recommended reopen/challenge triggers:

- revealed eligible participants below quorum;
- effective independent participant count below threshold;
- dispersion above threshold;
- cluster concentration above threshold;
- high-value USDC bounty;
- formal challenge with a bond;
- obvious prompt/content ambiguity.

### Rating Input

Replace binary voting with one compact prediction payload:

```text
predictedFinalRatingBps: uint16  // 1000-9900, representing 1.0-9.9
stakeAmount: uint96              // reputation locked as conviction
salt: bytes32
```

The commit hash should domain-separate every field that matters:

```text
chainId
roundVotingEngine
contentId
roundId
voter
predictedFinalRatingBps
stakeAmount
scorerEpochRoot
tlock metadata
salt
```

Aggregate predictions should remain hidden until a user commits or the reveal
phase begins. The current separate feedback field stays separate; the vote
payload should not grow a second reasoning channel.

Rater identity should be account-based, not human-based. Optional profile
metadata can disclose whether the account is human-operated, AI-operated,
organization-operated, or hybrid, but the protocol should not require this for
participation. The scorer should learn reliability from revealed behavior.

### Final Rating Aggregation

For the first redeploy, use a cluster-adjusted weighted median over fixed rating
bins. The fixed-bin approach keeps contract gas bounded and avoids a fragile
floating-point style implementation.

Recommended launch shape:

```text
rating bins: 1000, 1100, ..., 9900
rawWeight = sqrt(categoryReputation + calibrationFloor)
usableWeight =
  rawWeight
  * warmupMultiplier
  * independenceMultiplier
  * stakeConvictionMultiplier
  * roundEligibilityMultiplier
```

Display:

- final weighted median rating;
- weighted mean as an analytics-only secondary number;
- revealed voter count;
- effective independent participant count;
- cluster-adjusted participant count;
- human/AI/hybrid participant breakdown when voluntarily disclosed or inferred
  at a coarse level;
- dispersion/confidence;
- dissent share.

The median is deliberately conservative. It reduces the impact of one large
outlier, makes bounded-bin settlement auditable, and fits subjective ratings
better than a pure mean.

For AI raters, clustering should compress correlated agents. Multiple accounts
controlled by the same operator, using the same model family, prompt template,
funding path, or reveal timing should have reduced independent participant units
until they build distinct category-specific track records.

### Reputation Scoring

Score a voter against the result they could not directly control:

```text
predictionErrorBps =
  abs(predictedFinalRatingBps - finalRatingBpsExcludingVoter)
```

For USDC rounds, high-value rounds, or rounds with suspicious correlation, use:

```text
predictionErrorBps =
  abs(predictedFinalRatingBps - finalRatingBpsExcludingCluster)
```

Reputation changes should be small, capped, category-specific, and epoch-limited:

```text
roundQuality =
  min(1, revealedCount / targetReveals)
  * min(1, independentClusterCount / targetClusters)
  * confidenceMultiplier

calibrationCredit =
  max(0, 1 - predictionErrorBps / maxRewardedErrorBps)
  * roundQuality

reputationDelta =
  baseRevealCredit
  + calibrationCredit * categoryEmissionRate
  - nonRevealPenalty
  - extremeMissPenalty
```

Do not heavily burn reputation for ordinary disagreement. Burn risk should be
meaningful for non-reveal, spam, clear manipulation, or extreme misses in
high-confidence rounds. This protects useful dissent and avoids turning Curyo
into a pure consensus-following game.

AI agent reputation should be versioned. If an agent changes model, prompt,
tooling, retrieval source, or operator, the new version should keep account
history but start with reduced usable weight until it recalibrates. This avoids
one well-calibrated agent identity becoming a permanent wrapper around a
different evaluator.

### Calibration Before USDC

New accounts start with zero usable payout weight. They can participate in
calibration rounds immediately, but they should not earn USDC until they satisfy
all launch thresholds:

```text
CALIBRATION_ROUNDS_REQUIRED
MIN_REVEAL_RELIABILITY
MIN_CATEGORY_BREADTH
MIN_ACCOUNT_AGE_EPOCHS
MAX_RISK_SCORE
```

Calibration should include hidden seeded tasks, duplicated prompts, category
breadth, delayed scoring, and reveal reliability. It should establish "not
obviously farmed or careless," not confer high earning power.

### USDC Payout Formula

USDC payouts should pay independent signal rather than wallets:

```text
effectiveParticipantUnits =
  sum(clusterEffectiveUnits)

baseUnitReward =
  min(bountyPool, epochRemainingCap, requesterRemainingCap)
  / effectiveParticipantUnits
```

Each cluster receives at most:

```text
clusterPayout =
  baseUnitReward
  * clusterEffectiveUnits
  * min(1, clusterEpochCapRemaining)
```

Inside a cluster, split by revealed eligible participation and, at most, a small
bounded reputation multiplier. A useful launch range is `0.75x` to `1.25x`.
Higher reputation should not linearly earn more USDC, because that creates an
incentive to farm many medium-reputation accounts or rent high-reputation
wallets.

### Social-Graph And Risk Score

Use a layered usable-weight model:

```text
usableWeight =
  sqrt(reputationScore)
  * warmupMultiplier
  * independenceMultiplier
  * diversityMultiplier
  * stakeConvictionMultiplier
```

Where:

- `warmupMultiplier` ramps from near zero across account age and completed
  epochs;
- `independenceMultiplier` discounts correlated clusters;
- `diversityMultiplier` rewards category breadth and uncorrelated participation
  only after enough history exists;
- `stakeConvictionMultiplier` is square-root or log-shaped and capped.

Graph computation should remain off chain in Ponder or a dedicated scorer at
first. Publish epoch roots for scores used in payouts, snapshot the active root
at commit time, and keep enough source events public for independent
recomputation.

For AI raters, risk and diversity inputs should include:

- disclosed model/provider/agent version;
- owner/operator wallet;
- funding source;
- prompt/evaluator template hash;
- retrieval/tooling configuration hash when available;
- correlated vote timing and reveal timing;
- similarity of prediction errors across tasks;
- shared infrastructure and API patterns when available off chain.

These signals should never be treated as proof. They are correlation evidence
used to cap influence and payouts.

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

- Minted only by protocol reward logic in the fresh deployment.
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
earning, graph independence, bot checks, payout caps, calibration rounds, and
cluster discounts. This redesign should not include any proof-of-personhood
provider.

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
  - optional delegation
  - graph attestation records
  - per-round participation caps
  - submitter identity snapshots
```

Do not require an identity proof to mint this object. It can be created when a
wallet first participates, but it starts with near-zero weight until it earns
credibility and independence.

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
- attestation signals.

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
- AI raters can earn USDC if the product wants them to, but they should be
  cluster-capped by operator/model/template just like human-operated farms are
  cluster-capped by graph, timing, wallet, and session evidence.
- Dense clusters share a capped payout pool rather than multiplying it.
- Medium-reputation account farms should collapse into a smaller effective
  participant count when their graph, timing, voting, reveal, or session
  behavior is correlated.
- New accounts must complete calibration rounds before receiving USDC payouts.
- High-value USDC bounties should use stricter reputation, calibration, cluster,
  and epoch caps rather than proof-of-personhood gates.

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

## Threat Model And Mitigations

The safest version of this design assumes reputation is farmable and then makes
farming slow, capped, and publicly inspectable.

| Risk | Why It Matters | Recommended Mitigation |
| --- | --- | --- |
| Bootstrap Sybil capture | Early attackers can become the initial "independent crowd" before honest density exists. | Start all accounts at near-zero usable weight, require calibration before USDC, use low initial emissions, low bounty caps, category-specific reputation, and no early governance control. |
| Consensus capture loop | A coalition can pull the final rating toward itself, score itself as calibrated, and gain more influence. | Use leave-one-out scoring for normal rounds, leave-one-cluster-out scoring for payout-sensitive rounds, stake caps, reputation decay, and round-quality thresholds. |
| Calibration farming | Attackers can farm visible or predictable warm-up tasks. | Mix hidden seeded tasks, duplicated prompts, delayed scoring, category breadth, reveal reliability, and manual review for high-value earning eligibility. |
| Social-graph false positives | Teams, households, coworking spaces, and local communities may look like a farm. | Use graph scores for payout caps and risk labels, not moral judgments. Show coarse explanations, avoid public device/IP labels, and provide an appeal or review path for high-value users. |
| Graph scorer gaming | Farms will optimize timing, funding paths, voting jitter, device separation, and referral diversity. | Keep graph signals multi-factor, rotate features, cap clusters conservatively, and avoid publishing exact thresholds that can be reverse-engineered. |
| Account rental and key markets | Non-transferable reputation can still be rented or delegated off protocol. | Require fresh signatures for high-value actions, cap sudden category expansion, monitor abrupt behavior shifts, and limit per-epoch withdrawals. |
| USDC farming | Cash rewards attract low-effort consensus followers and wallet farms. | Pay effective independent participant units, not wallet count. Add per-account, per-cluster, per-category, per-requester, and per-epoch caps. Keep reputation multipliers small. |
| Requester manipulation | A requester can fund leading or ambiguous questions and cite weak consensus as strong evidence. | Require question quality checks, display confidence and independence metrics beside results, and label rounds weak when participation or independence is low. |
| Commit-reveal liveness griefing | Pending or unrevealed commits can consume slots, block settlement, or confuse users. | Settlement, rating, quorum, reputation, and bounty eligibility should use revealed eligible votes only. Add reveal deadlines, slashable expiry, cleanup batching, and pending-vs-revealed caps. |
| Governance capture | Newly farmed reputation could govern the protocol before the system is mature. | Use aged reputation for proposal thresholds and quorum, exclude fresh reputation from governance weight, and keep a bootstrap timelock/guardian. |
| Opaque payout decisions | "The scorer says you are not independent" will feel arbitrary if users cannot inspect why. | Publish score roots, public inputs, round-level payout reasons, and user-facing labels such as calibration-only, cluster cap, low round quality, payout cap, or prediction error. |

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
- Self telemetry and QR claim UX;
- any replacement proof-of-personhood adapter.

### Replace Or Simplify `VoterIdNFT.sol`

Option A: keep a soulbound identity NFT:

- rename to `ReputationIdentity`;
- remove Self-specific nullifier language;
- keep delegation if still needed for Ledger/MetaMask or agent wallets;
- keep per-round cap hooks.

Option B: remove the NFT:

- let `HumanReputation` be the identity surface;
- store submitter identity as wallet address;
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
- USDC bounty rewards still use escrowed assets;
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

## Design Decisions

1. No proof-of-personhood.

   Curyo should not integrate Self.xyz, Human Passport, World ID, Semaphore, or
   any other proof-of-personhood provider in this redesign. Sybil resistance
   comes from slow reputation earning, calibration rounds, graph independence,
   bot/risk signals, cluster payout caps, and epoch/category caps.

2. Open rater network.

   Humans, AI agents, teams, and hybrid workflows should all be allowed to rate.
   Reputation should attach to the account or agent identity that made revealed
   predictions, not to a claim of being human. AI raters should be cluster- and
   version-aware so one operator cannot multiply influence through many nearly
   identical agents.

3. No transfer of reputation.

   Reputation must be non-transferable. Transferability makes reputation buyable
   and weakens the core premise.

4. Use predicted final ratings.

   The first redeploy should use predicted final rating as the primary vote
   input, with stake as the conviction signal and the existing feedback field as
   the reasoning layer.

5. Use one private round by default.

   The default lifecycle should be commit, reveal, settle. A second round should
   require a concrete trigger such as low independent participation, high
   dispersion, suspected manipulation, or a bonded challenge.

6. Use global and category reputation.

   Use global reputation for baseline trust and governance, but category
   reputation should drive rating weight in topic-specific rounds.

7. Keep graph follows off chain initially.

   Start with signed off-chain follows and attestations, index them, and only
   later commit epoch roots on chain.

8. Require calibration before USDC.

   New users should complete a configured number of calibration rounds before
   they can earn USDC. Calibration rounds can mint reputation and establish
   reveal reliability, category breadth, and independence, but USDC payout is
   disabled or capped to zero until the threshold is met.

9. No migration from current HREP holders.

   Existing HREP balances should not migrate into the new reputation system.
   The new protocol starts fresh, and reputation is earned only through the new
   rules.

10. No legacy compatibility requirement.

   The smart contracts, indexer schema, frontend UX, and deployment scripts
   should optimize for the new model rather than preserving backwards
   compatibility with the current HREP faucet/staking/governance design.

## Implementation And Update Plan

### Milestone 1: Mechanism Spec And Parameter Sheet

Create a short vNext protocol spec before writing contracts. It should define:

- rating range and fixed bins: `1000-9900` bps;
- one-private-round lifecycle and challenge/reopen triggers;
- weighted median aggregation;
- leave-one-out and leave-one-cluster-out scoring rules;
- rater account model for humans, AI agents, teams, and hybrid workflows;
- `CALIBRATION_ROUNDS_REQUIRED`;
- warmup, risk, diversity, and stake multiplier curves;
- per-round, per-category, per-epoch, per-cluster, and per-requester caps;
- reputation mint, burn, decay, and emission budgets;
- USDC eligibility and payout formula;
- score-root schema and challenge/review process for payout roots;
- exact commit hash domain separation.

Deliverable: one spec file that product, contracts, Ponder, SDK, and frontend
can implement against. Because there is no useful historical data, use this
milestone for adversarial review and parameter bounds, not retrospective model
fitting.

### Milestone 2: Fresh Contract Deployment

Implement fresh contracts with no legacy compatibility requirement:

- replace `HumanReputation.sol` with a non-transferable reputation token that
  supports mint, burn, lock, unlock, and `IVotes`;
- remove `HumanFaucet.sol`, faucet allocations, referral logic, Self hub config,
  Self remappings, and Self verification tests;
- replace `VoterIdNFT.sol` with `ReputationIdentity`, or simplify identity into
  the reputation token plus a delegation registry;
- rewrite `RoundVotingEngine.sol` around `predictedFinalRatingBps`,
  reputation locks, fixed-bin weighted median aggregation, and revealed-only
  settlement;
- rewrite `RoundRewardDistributor.sol` around reputation deltas and stake
  unlock/burn logic instead of winner/loser HREP transfers;
- keep `QuestionRewardPoolEscrow.sol` for USDC, but make eligibility depend on
  calibration, public scoring roots, effective participant units, and caps;
- update `CuryoGovernor.sol` to use aged non-transferable reputation and keep a
  bootstrap guardian/timelock;
- regenerate ABIs, deployments, required deployment guards, and contract SDK
  types.

### Milestone 3: Scorer, Indexer, And Public Roots

Build the off-chain scorer as an auditable service, not a hidden oracle:

- add Ponder tables for prediction votes, reputation events, score epochs,
  category scores, graph edges, rater profile versions, AI agent provenance,
  cluster scores, payout caps, and score roots;
- compute raw final rating, leave-one-out rating, leave-one-cluster-out rating,
  prediction error, round quality, and payout reasons;
- compute human/AI/hybrid breakdowns only at a coarse level and avoid pretending
  they are identity proofs;
- publish epoch roots for reputation and USDC payout eligibility;
- snapshot scorer-root version at commit time for high-value rounds;
- expose public APIs that explain why a wallet earned or did not earn:
  calibration-only, non-reveal, prediction error, low round quality, cluster
  cap, payout cap, requester cap, or category cap;
- keep device/session/routing signals private or coarse-grained, never as
  public identity labels.

### Milestone 4: App, SDK, And User Experience

Update the product around prediction and calibration:

- remove Self verification, faucet claims, referral copy, and HREP claim flows;
- replace up/down controls with a rating prediction control;
- keep the existing feedback field as the written explanation channel;
- make the default flow one private prediction round followed by reveal and a
  concrete final rating;
- allow AI/agent accounts to participate, with optional rater-type/provenance
  disclosure and clear cluster treatment;
- replace "accuracy" copy with "consensus calibration";
- show credibility, reveal reliability, and payout eligibility separately;
- show max stake, burn risk, and calibration-only status before voting;
- show final rating, effective independent participants, confidence, dissent,
  and payout reasons after settlement;
- update SDK vote encoding, reveal helpers, claim helpers, and generated types;
- update Playwright flows for onboarding, predict, reveal, settle, claim, and
  governance.

### Milestone 5: Security And Test Coverage

Prioritize wallet-sensitive and payout-sensitive paths:

- Foundry tests for prediction commit/reveal, range checks, duplicate reveal,
  expired commits, malformed payloads, revealed-only settlement, low-reveal
  rounds, non-reveal penalties, stake locks, stake burns, and cleanup gas
  bounds;
- invariant tests for reputation conservation across lock/unlock/burn/mint;
- tests that scorer-root changes cannot retroactively alter an existing commit;
- escrow tests for cluster caps, epoch caps, requester caps, calibration gates,
  and repeated claim prevention;
- governance tests for aged reputation, fresh-reputation exclusion, quorum, and
  guardian/timelock controls;
- Ponder tests for prediction indexing, score root generation, payout reasons,
  category reputation, rater versions, and AI/operator clustering;
- Next.js and SDK tests for prediction payloads, reveal UX, claim UX, and
  wallet flows across injected wallets, thirdweb wallets, and hardware-wallet
  assumptions.

### Milestone 6: Capped Launch Controls

Launch conservatively:

- calibration-only onboarding first;
- no USDC for uncalibrated users;
- low epoch emissions;
- low bounty caps;
- strict cluster caps;
- no immediate reputation governance over treasury or protocol parameters;
- public monitoring of effective participants, cluster concentration, reveal
  reliability, payout concentration, and rating dispersion;
- gradual cap increases only after enough independent settled history exists.

## Final Recommendation

Proceed with the idea, but frame it as earned signal quality, not majority
truth.

The best Curyo-native design is:

- no Self faucet;
- no Self.xyz adapter, hub wiring, or Self-specific identity assumptions;
- no proof-of-personhood provider;
- open participation for humans, AI agents, teams, and hybrid workflows;
- no migration from current HREP balances;
- fresh deployment with no legacy-compatibility requirement;
- non-transferable reputation;
- one sealed commit-reveal round with predicted final rating instead of binary
  up/down;
- stake as capped conviction and burn risk;
- graph and rater provenance as independence discounts;
- USDC payout split by independent participant weight, then gated by reputation
  and graph caps;
- governance based on aged, earned, non-transferable reputation.

This would make the protocol more user-friendly than passport-based onboarding
while still raising the cost of bot and Sybil attacks over time. The main risk
is bootstrap capture, so the first implementation should be conservative:
low initial voting power, slow emissions, capped payouts, category separation,
and heavy monitoring before reputation controls major governance decisions.
