# Curyo 2.0 Bountied Questions - Initial Research

Date: 2026-04-15

Status: Initial product and mechanism-design research. This is not legal advice.

## Summary

The proposed Curyo 2.0 design would let users create binary questions that can be answered with thumbs up or thumbs down, attach links or images as evidence, and fund those questions with stablecoin bounties. The rating flow would remain similar to Curyo's current per-content voting model, while bounty distribution would borrow ideas from the Consensus Subsidy Reserve and Participation Pool.

The direction is promising because it turns Curyo from a general content-rating protocol into a demand-driven human judgment network. The main caution is that "any question, any link, any bounty" creates legal, moderation, and incentive risks. A safer first version would constrain the question types, pay mostly for valid participation and review work, and avoid future-event or wager-like markets.

## Current Curyo Fit

Curyo already has primitives that map well onto bountied human judgment:

- Verified-human voting through one soulbound Voter ID per participant.
- cREP staking as a conviction signal.
- Per-content rounds with settlement after quorum.
- tlock commit-reveal voting that hides direction during the blind phase.
- Early-voter weighting to reduce herding.
- A 24-hour same-content vote cooldown.
- Reward accounting through round settlement, the Consensus Subsidy Reserve, and the Participation Pool.

Those pieces give Curyo a credible base for paying humans to evaluate bounded questions. The new design should treat stablecoin bounties as a separate escrowed reward layer rather than mixing them directly into the existing cREP reserve or participation pools.

## Potential Advantages

### Clearer Demand

Question bounties let users ask for a specific judgment instead of hoping a general rating feed produces the signal they need. Examples:

- Is the linked claim supported by the cited source?
- Is this listing impersonating the official project?
- Does this image contain the stated object or manipulation?
- Is this AI-generated answer materially correct according to the linked documentation?
- Is this product page likely misleading?

This could make Curyo useful to DAOs, marketplaces, researchers, AI agents, content platforms, and communities that need lightweight human review.

### Better Attention Allocation

A bounty is a direct signal that someone values an answer. That gives the protocol a natural way to rank review queues, notify qualified voters, and prioritize scarce human attention.

### Stablecoin Rewards Are Easy to Understand

cREP is useful for internal reputation and staking, but stablecoin bounties are easier for reviewers to price. "Earn USDC for reviewing this question" is a clearer labor-market proposition than "earn protocol reputation emissions."

### Reusable Human Consensus Oracle

This design moves Curyo toward a general-purpose human consensus oracle for bounded yes/no judgments. UMA's optimistic oracle and Kleros-style juror systems show that crypto-native systems can pay humans to resolve real-world or subjective questions, but they also show that careful bonds, evidence, disputes, and policies matter.

### More Natural Protocol Revenue

Protocol and frontend fees can be taken from bounty flow as payment for routing, moderation, settlement, indexing, and reputation infrastructure. That may be easier to justify than extracting value from ordinary rating activity.

## Potential Issues

### Consensus Is Not Truth

The system will answer what verified and economically incentivized participants converge on. That can be useful, but it should not be marketed as objective truth. For subjective, political, medical, legal, identity-sensitive, or reputation-sensitive questions, consensus can collapse into popularity, ideology, coordinated pressure, or fear of being on the wrong side.

Product copy and protocol docs should distinguish:

- Objective answer: externally verifiable fact.
- Bounded judgment: answerable with a rubric and evidence.
- Community confidence: what Curyo can safely claim.

### Regulatory Risk From Binary Stablecoin Payouts

If users fund yes/no questions and voters receive stablecoin payouts for choosing the winning side, the design can start to resemble prediction markets, event contracts, gambling, contests, or binary options.

This is most risky for questions about:

- Future events.
- Elections or politics.
- Sports.
- Token or asset prices.
- Economic data.
- Lawsuits, enforcement actions, or regulatory outcomes.
- Celebrity, reputation, or personal allegations.

The safer initial framing is "paid human review of bounded evidence" rather than "bet on an outcome." Bounty distribution should include a meaningful participation/review component and should avoid winner-takes-all stablecoin mechanics.

### Stablecoin Compliance and Issuer Controls

Stablecoin flows introduce sanctions, blocked-address, prohibited-activity, tax, and issuer-policy considerations. As of this research pass, the U.S. GENIUS Act has created a federal payment-stablecoin framework, and EU MiCA rules regulate asset-referenced tokens and e-money tokens. Even if Curyo is not issuing stablecoins, escrowing and distributing stablecoin bounties can still require legal review.

Stablecoin issuers may also monitor or block prohibited transactions, including certain gambling or unlawful activity categories. That makes arbitrary bounties riskier than cREP-only rewards.

### Ambiguity Attacks

Open-ended questions create attack surfaces:

- "Is this good?"
- "Is this trustworthy?"
- "Is this person dangerous?"
- "Is this project a scam?"

Ambiguous prompts let voters coordinate around vibe, tribal identity, or expected majority behavior. Bounties should require question templates, evidence fields, and acceptance criteria.

### Collusion and Bribery

Money increases the payoff from coordination. Curyo's Voter ID system reduces classic sybil attacks, but bounties can still incentivize:

- Identity rental.
- Off-platform bribery.
- Coordinated voting rings.
- Creator-funded brigading.
- Strategic non-reveal behavior.
- Low-effort majority-following.

Larger bounties should require higher quorum, longer windows, more diverse voter participation, and stronger anomaly monitoring.

### Creator Conflicts

The question creator may have a direct interest in the answer. At minimum:

- The creator should not vote on their own bounty.
- Creator-associated wallets should be excluded where detectable.
- Question metadata should disclose the creator and bounty source.
- High-value bounties should have appeal or challenge paths.

### Moderation and Safety

"Any content or image" expands the moderation burden. The system needs protection against:

- CSAM and illegal content.
- Doxxing and private information.
- Harassment and targeted reputation attacks.
- Copyright-infringing media.
- Malware and phishing links.
- Medical, financial, and legal advice misuse.
- Deepfake or impersonation abuse.

Curyo already has URL-safety code for SSRF-style risk. Bountied questions would need product-level content policy, reporting, takedowns, and evidence retention rules.

### Bounty Size Can Overwhelm cREP Incentives

If the stablecoin bounty is much larger than the cREP at risk, voters may optimize for bounty capture instead of reputation or rating accuracy. The stablecoin layer should be capped at launch and should scale with quorum, stake, and reviewer quality.

## Recommended First Version

### 1. Launch With Question Templates

Start with constrained question types that are evidence-bound:

- Source support: "Is claim X supported by source Y as of date Z?"
- Media classification: "Does this image/video contain X?"
- Impersonation: "Is this page likely impersonating the official entity?"
- Documentation correctness: "Is this answer materially correct according to linked docs?"
- Listing accuracy: "Does this listing materially match the linked official record?"

Avoid general-purpose political, medical, legal, and personal reputation questions in the first version.

### 2. Treat the Result as Confidence, Not Final Truth

The rating can still start at 50 and move based on thumbs up/down. The user-facing label should be closer to:

- Yes confidence.
- Community confidence.
- Evidence confidence.

Avoid "truth score" unless the category has a strong oracle or appeal process.

### 3. Keep Stablecoin Bounties Separate From cREP Pools

Create a separate bounty escrow per question. Do not fund it from or deposit it into the Consensus Subsidy Reserve or Participation Pool. The cREP system should continue to provide conviction, reputation, and anti-spam pressure.

### 4. Use Participation-Weighted Payouts

A first split could be:

- 50% to 70% for valid revealed participation.
- 20% to 40% for coherent/winning-side reward.
- 5% to 10% for protocol, frontend, moderation, or treasury.

This makes the product look more like paid review work and less like a binary wager.

### 5. Tranche Large Bounties

Large bounties should be released across multiple rounds or confidence milestones. This reduces the incentive to capture a thin first round with a small coordinated group.

### 6. Scale Safety With Bounty Size

Higher-value bounties should automatically require:

- More voters.
- Longer commit/reveal windows.
- More evidence specificity.
- Stricter creator conflict checks.
- Stronger moderation precheck.
- Appeal or dispute options.

### 7. Block High-Risk Categories Initially

Initial blocked categories should include:

- Future event markets.
- Elections and political outcomes.
- Sports outcomes.
- Asset prices.
- Medical diagnosis or treatment advice.
- Legal guilt or liability.
- Personal allegations.
- Explicit gambling or lottery mechanics.

### 8. Add Question Lifecycle States

A bountied question likely needs states beyond current content voting:

- Draft.
- Funded.
- Open for commit.
- Reveal.
- Settled.
- Appealed or disputed.
- Cancelled.
- Refunded.
- Removed.

Refund rules should be explicit for moderation removal, quorum failure, reveal failure, and unresolved disputes.

## Open Design Questions

- Should every bounty require a cREP stake from the question creator?
- Should voters stake cREP in addition to earning stablecoins?
- Should stablecoin rewards go only to winning voters, all valid revealers, or a hybrid?
- Should creators be able to add bounty after a question is open?
- Should third parties be able to add bounty to existing questions?
- Should a question support multiple evidence links or only one canonical link?
- Should high-stakes bounties require a moderator or curator precheck?
- Should Curyo add category-specific voter reputation before routing bounties?
- Should there be an appeal court, expert panel, or governance escalation path?
- How should Curyo handle takedowns when bounty funds are already escrowed?
- What stablecoins and chains are acceptable at launch?

## Technical Implications

Likely new or changed components:

- A `BountyEscrow` contract or module that holds stablecoin funds per question.
- A question schema that captures prompt, template type, linked evidence, media metadata, category, creator, bounty token, and bounty amount.
- Ponder/indexer tables for bounty state, payout state, source evidence, and moderation status.
- Frontend flows for question creation, funding, voting, reveal, claim, cancellation, and dispute.
- Keeper support for settlement and possibly bounty tranche release.
- Tests for solvency, refund paths, partial payout, stablecoin decimals, non-standard ERC20 behavior, and moderation removal.

High-risk test areas:

- Bounty escrow solvency.
- Pull-based stablecoin claims.
- Reentrancy around ERC20 transfers.
- Fee-on-transfer or blacklistable token behavior.
- Quorum failure refund behavior.
- Reveal failure refund behavior.
- Creator self-vote restrictions.
- Appeal/dispute payout freezing.
- Frontend and Ponder state alignment.

## Research Sources

- Curyo repo docs and contracts: `README.md`, `packages/nextjs/app/docs/how-it-works/page.tsx`, `packages/nextjs/app/docs/smart-contracts/page.tsx`, `packages/foundry/contracts/RoundVotingEngine.sol`, and `packages/foundry/contracts/RoundRewardDistributor.sol`.
- CFTC, prediction markets overview: https://www.cftc.gov/LearnandProtect/PredictionMarkets
- CFTC, 2026 prediction markets advisory: https://www.cftc.gov/PressRoom/PressReleases/9185-26
- Congress CRS, GENIUS Act stablecoin overview: https://www.congress.gov/crs-product/IN12553
- European Banking Authority, MiCA asset-referenced and e-money tokens: https://www.eba.europa.eu/regulation-and-policy/asset-referenced-and-e-money-tokens-mica
- FinCEN, convertible virtual currency guidance: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering
- UMA, optimistic oracle overview: https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work
- Kleros FAQ and juror docs: https://docs.kleros.io/kleros-faq and https://docs.kleros.io/products/court/kleros-juror-tutorial
- Gitcoin, sybil resistance in quadratic funding: https://gitcoin.co/research/quadratic-funding-sybil-resistance
- Circle, bridged USDC terms: https://www.circle.com/legal/bridged-usdc-terms
