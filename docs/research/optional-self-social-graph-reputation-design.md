# Optional Self Social Graph Reputation Design

Research date: 2026-05-07

This note describes an alternative to the no-proof reputation design: keep
Self.xyz as an optional identity credential while still allowing users to
participate without proving their identity. The goal is to preserve low-friction
participation, make verified humanity useful, and avoid turning identity into a
hard gate or a source of unlimited voting power.

## Short Answer

The best hybrid design is:

- Keep Self.xyz, but remove the faucet-centered economy.
- Let everyone participate without Self verification.
- Use Self verification as a uniqueness and risk-reduction signal, not as the
  only path into voting.
- Give Self-verified users higher caps, faster calibration, and a modest
  bounded weight multiplier.
- Let Self-verified and high-reputation users make bounded trust attestations to
  other accounts, but do not let those attestations directly transfer unlimited
  voting power.
- Keep reputation non-transferable for protocol scoring, USDC eligibility, and
  governance.
- Allow controlled reputation recovery or wallet rebinding, especially for
  Self-verified users, but do not create a liquid on-chain market for
  reputation.

The key product framing:

```text
Anyone can predict.
Reputation determines credibility.
Self verification reduces Sybil risk.
Trust attestations help new accounts bootstrap, but only within caps.
```

Self should answer "is this likely one real person for this scope?" It should
not answer "is this prediction good?" or "should this account control protocol
governance?"

## Why Keep Self As Optional

Self is useful because it creates a stronger uniqueness signal than a pure
social graph. Its docs describe a privacy-preserving identity protocol using
zero-knowledge proofs over passports, national IDs, Aadhaar, and KYC
attestations. The protocol uses application-specific scopes and nullifiers to
reduce proof replay and let applications verify configured requirements.

Sources:

- Self overview:
  https://docs.self.xyz/technical-docs/overview
- Self architecture and nullifiers:
  https://docs.self.xyz/technical-docs/architecture
- Self contract integration:
  https://docs.self.xyz/contract-integration/basic-integration
- Self backend integration:
  https://docs.self.xyz/backend-integration/basic-integration

The main benefit for Curyo is not that Self makes Sybils impossible. It does
not. A verified account can still be rented, sold, delegated, compromised, or
operated by a voting service. The benefit is that one attacker cannot cheaply
mint unlimited Self-verified identities under the same verification scope.

That makes Self useful for:

- increasing confidence in effective participant counts;
- raising USDC payout caps for verified users;
- raising governance caps slowly after enough aged reputation exists;
- reducing calibration time for verified users;
- creating higher-quality trust anchors for graph attestations;
- detecting "many wallets, one person" patterns when they reuse the same Self
  nullifier scope.

The main reason not to require Self is product accessibility. Some users will
not have supported documents, will not want to use a government document, will
be in unsupported jurisdictions, or will be uncomfortable with identity flows
even if the proof is privacy-preserving. A rating system benefits from allowing
those users to contribute, as long as their influence and payouts ramp more
slowly.

## Participation Tiers

The protocol should separate participation from influence.

### Tier 0: Open Account

An unverified wallet can:

- create a profile;
- predict final ratings;
- reveal votes;
- write feedback through the existing feedback field;
- earn calibration reputation slowly;
- appear in public vote history.

Initial limits:

- near-zero initial voting weight;
- no USDC until calibration thresholds are met;
- low per-round and per-epoch stake caps;
- no governance voting at launch;
- aggregate predictions hidden until after commit.

### Tier 1: Calibrated Open Account

An unverified account that has completed calibration can:

- receive normal reputation deltas;
- earn USDC under lower caps;
- influence ratings through earned reputation;
- receive and issue low-strength trust attestations.

Limits:

- lower USDC caps than verified users;
- stronger cluster discounts;
- longer warmup before governance;
- lower maximum outgoing trust budget.

### Tier 2: Self-Verified Account

A Self-verified account can:

- complete calibration faster;
- receive a modest identity multiplier;
- receive higher per-epoch and per-category caps;
- earn USDC with less conservative cluster discounting;
- issue higher-strength trust attestations;
- rebind reputation to a new wallet through a controlled recovery process.

Recommended launch multipliers:

```text
identityMultiplier:
  unverified open account:        1.00x after calibration
  Self-verified account:          1.25x to 1.50x
  aged Self-verified account:     up to 2.00x cap after enough history
```

Do not make Self verification a 10x power boost. Large boosts create identity
rental markets and exclude legitimate unverified contributors.

### Tier 3: Trusted Attestor

A trusted attestor is an account with aged reputation, strong reveal
reliability, category-specific credibility, and either Self verification or a
long independent history.

Trusted attestors can allocate a bounded trust budget to other accounts. This
should help honest newcomers start participating without forcing everyone
through Self, but it should never bypass calibration or payout caps entirely.

## Effective Voting Power

Use a layered formula:

```text
effectiveVotingPower =
  sqrt(categoryReputation)
  * warmupMultiplier
  * identityMultiplier
  * independenceMultiplier
  * trustAttestationMultiplier
  * stakeConvictionMultiplier
```

Each term must be capped.

Recommended interpretation:

- `categoryReputation`: earned signal quality in the relevant category.
- `warmupMultiplier`: ramps with account age, settled rounds, and reveal
  reliability.
- `identityMultiplier`: modest uplift from Self verification.
- `independenceMultiplier`: graph and cluster discount.
- `trustAttestationMultiplier`: bounded boost from trusted accounts.
- `stakeConvictionMultiplier`: capped square-root or log-shaped stake signal.

The identity and trust terms should mostly increase caps and warmup speed. They
should not let a new account dominate rating settlement before it has its own
history.

## Trust Attestations

Trust should be represented as bounded, revocable, category-aware attestations.
They can be off-chain signed messages indexed by Ponder at first, with optional
on-chain roots later.

Example attestation shape:

```text
TrustAttestation
  issuer
  subject
  categoryId
  trustBudget
  maxBoostBps
  expiresAt
  stakeAtRisk
  reasonCode
  metadataHash
  signature
```

Rules:

- Every issuer has a limited outgoing trust budget.
- Trust budget scales sublinearly with the issuer's aged reputation.
- Self-verified issuers can have a higher trust budget, but still capped.
- Trust expires and must be refreshed.
- Trust is category-specific by default.
- Reciprocal trust loops are discounted.
- Dense clusters share caps.
- Trust from accounts that later behave badly loses weight.
- High-value trust attestations can put issuer reputation at risk.

The attestation should not say "use my votes." It should say "I am willing to
spend part of my trust budget to reduce this account's warmup and cluster-risk
discount."

This distinction matters. Delegating raw voting power creates a liquid influence
market. Bounded trust budgets create accountable sponsorship.

## Transferability Of Reputation

The concern is valid: even if reputation is non-transferable on chain, a wallet
or account can be sold off chain. A high-reputation account can be rented,
delegated, compromised, or operated by someone else.

That does not mean reputation should be transferable. It means
non-transferability is only one layer of defense.

### Why Non-Transferability Still Helps

Non-transferability removes the easiest and most liquid attack path:

```text
buy reputation -> vote with reputation -> earn USDC/governance power
```

Off-chain account sales are possible, but they are slower, less liquid, riskier,
harder to standardize, and easier to disrupt with behavioral checks. On-chain
transferability would make reputation instantly market-priced and composable
with lending, leverage, bribery, and governance capture.

For Curyo, reputation is supposed to mean earned calibration and signal quality.
If it can be freely transferred, it stops meaning that. It becomes a financial
asset.

### Recommended Policy

Use three separate concepts:

1. `protocolReputation`
   - Non-transferable.
   - Used for rating weight, USDC eligibility, stake caps, and governance.

2. `walletBinding`
   - Changeable only through controlled recovery or rebinding.
   - Self-verified users can rebind after proving the same Self scope/nullifier
     and waiting through a cooldown.

3. `transferableToken`
   - Optional separate economic token, if Curyo wants one later.
   - Not used as the core signal-quality score.

Recommended recovery/rebind rules:

- allow one active wallet per reputation identity;
- require cooldown before a new wallet receives full weight;
- freeze high-value claims during rebind;
- carry over reputation but reset or reduce short-term warmup multipliers;
- publish a public rebind event without exposing private Self data;
- make suspicious frequent rebinds reduce risk score;
- allow governance or support review for compromised-account cases.

This accepts the reality of account transfer while avoiding a first-class
market for reputation.

## USDC Payouts

USDC should remain tied to effective independent participation, not raw
reputation and not raw wallet count.

Recommended payout model:

- Unverified accounts can earn USDC after calibration, but with lower caps.
- Self-verified accounts can have higher caps and faster eligibility.
- Trust-attested accounts can receive a partial cap boost, but only after they
  reveal reliably and pass calibration.
- Payouts are split by cluster-adjusted effective participant units.
- Reputation multiplier should be small and bounded, for example `0.75x` to
  `1.25x`.
- Self multiplier should mostly affect caps, not base payout per correct
  prediction.

Example:

```text
baseUnitReward = bountyPool / effectiveParticipantUnits

accountPayout =
  baseUnitReward
  * boundedReputationMultiplier
  * min(accountCap, clusterCapRemaining, epochCapRemaining)
```

If one Self-verified user sponsors ten wallets, those wallets should not create
ten independent payout units. The cluster and sponsor graph should compress
them into fewer effective units unless they develop independent history.

## Governance

Self verification can help governance, but it should not become governance by
passport.

Recommended governance model:

- voting power comes from aged non-transferable reputation;
- Self verification can raise governance caps slowly;
- unverified users can gain governance power after long, independent,
  calibrated participation;
- trust attestations do not directly delegate governance voting power;
- newly earned reputation has reduced governance weight;
- newly verified accounts do not get immediate high governance weight;
- bootstrap guardian/timelock remains until the system has enough independent
  history.

This keeps governance open while reducing same-week Sybil capture.

## Current Protocol Integration

This alternative keeps the Self-related integration surface, but changes its
meaning.

### Replace `HumanFaucet.sol` With `HumanVerifier.sol`

Remove:

- HREP faucet claims;
- tiered identity airdrops;
- referral rewards;
- Self as a requirement for all voting.

Keep or rework:

- Self hub verification;
- application scope/config;
- nullifier uniqueness for the optional verified credential;
- minimum age or sanctions rules only if product/legal policy requires them.

The output should be an optional verified-human credential, not a token faucet.

### Rework `VoterIdNFT.sol`

The current voter ID can become `ReputationIdentity`:

- minted on first participation for any wallet;
- can attach a Self-verified credential if the user verifies;
- can attach trust attestations;
- tracks delegation/rebinding rules;
- stores per-round and per-category cap hooks.

Self nullifiers should apply only to verified credentials. Unverified accounts
can still have identities, but their uniqueness is graph/risk-based rather than
proof-based.

### Rewrite `RoundVotingEngine.sol`

Voting should not require Self verification.

Recommended changes:

- replace `isUp` with `predictedFinalRatingBps`;
- snapshot reputation, identity tier, trust score, graph score, and scorer-root
  version at commit time;
- lock reputation stake instead of transferring HREP;
- compute revealed-only fixed-bin weighted median;
- apply identity and trust multipliers through capped `effectiveWeight`;
- score against leave-one-out or leave-one-cluster-out results;
- keep settlement public and auditable after reveal.

### Update Ponder And Scorer

Add or update tables:

- `identity_credential`
- `self_verification`
- `trust_attestation`
- `trust_budget`
- `identity_rebind`
- `reputation_score`
- `category_reputation_score`
- `cluster_score`
- `prediction_score`
- `payout_reason`

The scorer should explain:

- whether the user is unverified, verified, or trusted;
- how much weight came from earned reputation;
- how much came from Self verification;
- how much came from trust attestations;
- what caps applied;
- why USDC was earned or not earned.

### Update Next.js

Self should be presented as optional:

- "Verify to increase trust and raise caps," not "verify to participate."
- Unverified users should see a clear path through calibration.
- Verified users should see their cap and warmup benefits.
- Trust attestors should see remaining trust budget, active attestations,
  expiry, and reputation at risk.
- Payout explanations should separate prediction error, calibration status,
  identity status, cluster cap, trust cap, and epoch cap.

Avoid implying that verified users are morally better or always more accurate.
The label should be closer to "verified uniqueness signal" than "trusted human."

## Risks And Mitigations

| Risk | Problem | Mitigation |
| --- | --- | --- |
| Identity exclusion | Self may exclude users without supported documents or users unwilling to verify. | Keep unverified participation open; use Self for caps and warmup, not access. |
| Verified account rental | A verified wallet can be rented or operated by a third party. | Keep Self multipliers modest; monitor behavior drift; require fresh signatures for high-value actions; delay large payouts. |
| Sponsor markets | Trusted users may sell attestations. | Limit outgoing trust budgets, require expiry, discount reciprocal loops, put issuer reputation at risk for high-strength attestations. |
| Trust-ring capture | A group can mutually attest and amplify itself. | Apply graph clustering, leave-one-cluster-out scoring, reciprocal-edge discounts, and cluster payout caps. |
| Passport-weighted governance | Verified users could dominate unverified but valuable contributors. | Use aged earned reputation as the base; Self only raises caps slowly. |
| Reputation sale via account sale | Non-transferable reputation can still move through wallet sale. | Keep reputation non-transferable, add rebind cooldowns, behavior drift detection, high-value claim delays, and decay. |
| Opaque scoring | Users may not understand why identity or trust affected payout. | Publish scoring inputs, score roots, and human-readable payout reasons. |
| Privacy concerns | Users may fear identity data exposure or public labeling. | Minimize requested disclosures, keep Self optional, avoid public private-data labels, and show only coarse credential state. |

## Recommendation

This hybrid is a strong alternative if Curyo wants the usability of open
participation and the extra Sybil resistance of optional proof-of-humanity.

Recommended design:

- Keep Self.xyz as an optional verified credential.
- Remove the Self faucet and any identity airdrop.
- Let unverified users participate and earn reputation through calibration.
- Give Self-verified users modest weight/cap benefits, not unlimited power.
- Let trusted accounts sponsor other accounts through bounded, expiring,
  category-specific attestations.
- Keep reputation non-transferable for voting, payout, and governance.
- Add controlled wallet rebinding instead of free reputation transfer.
- Keep USDC payouts cluster-adjusted and cap-based.

The most important distinction is that identity and trust should reduce risk,
not replace earned signal quality. A Self-verified new account should be safer
than an unverified new account, but it should still have to become calibrated
before it earns significant USDC or governance power.
