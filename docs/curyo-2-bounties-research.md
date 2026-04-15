# Curyo 2.0 Bountied Questions - Initial Research

Date: 2026-04-15

Status: Initial product and mechanism-design research. This is not legal advice.

## Summary

The proposed Curyo 2.0 design would let users create binary questions that can be answered with thumbs up or thumbs down, attach links or images as evidence, and fund those questions with stablecoin bounties. The rating flow would remain similar to Curyo's current per-content voting model, but launch-time stablecoin bounties should pay valid revealed participation only from a question-scoped bounty pool. cREP should remain the conviction layer where voters risk losing stake when their side loses the settled round.

The direction is promising because it turns Curyo from a general content-rating protocol into a demand-driven human judgment network. The main caution is that "any question, any link, any bounty" creates legal, moderation, and incentive risks. A safer first version would guide question framing, pay for valid participation and review work, and avoid event-market or wager-like product patterns.

Additional research strengthens the core recommendation: Curyo 2.0 should launch as bountied review questions, not as a user-created prediction market. The product should pay verified humans to share bounded judgment under explicit context. It should not let reviewers buy tradable yes/no positions, stake stablecoins to enter, or receive stablecoin payouts for being on the winning side.

## Current Curyo Fit

Curyo already has primitives that map well onto bountied human judgment:

- Verified-human voting through one soulbound Voter ID per participant.
- cREP staking as a conviction signal.
- Per-content rounds with settlement after quorum.
- tlock commit-reveal voting that hides direction during the blind phase.
- Early-voter weighting to reduce herding.
- A 24-hour same-content vote cooldown.
- Reward accounting through round settlement, the Consensus Subsidy Reserve, and the Participation Pool.

Those pieces give Curyo a credible base for paying humans to evaluate bounded questions. The new design should treat stablecoin bounties as a separate escrowed reward layer rather than mixing them directly into the existing cREP reserve or participation pools. Stablecoin rewards should be scoped to the specific question that was funded, not distributed across the protocol-wide voter base.

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

## Precedent Takeaways

### UMA Optimistic Oracle

UMA's optimistic oracle is the closest design precedent for "human judgment only when needed." Assertions are bonded, then accepted unless disputed during a liveness period; disputes escalate to human voting. Two lessons map directly to Curyo:

- The question creator should post a separate bond that can be lost for malformed, abusive, or wrong assertions.
- Bounty size should affect dispute liveness, required quorum, and security parameters.

UMA's bond guidance is especially relevant: higher value at stake should generally mean higher bonds or longer challenge windows, but bonds that are too high can deter honest challengers. Curyo should avoid one static configuration for every bounty size.

### Kleros

Kleros shows that subjective human resolution needs policies, evidence rules, appeal paths, and incentives for third parties to correct bad early rulings. Its appeal crowdfunding model is useful because outsiders who identify an obviously bad ruling can help fund the opposite side and share rewards if the appeal succeeds.

The risk is that coherent-vote rewards can drift into "vote with the expected majority." Curyo should therefore avoid vague prompts and add an invalid/cannot-resolve outcome for malformed questions.

### MACI

MACI exists because public blockchain voting makes bribery easy: voters can prove how they voted. Curyo's tlock commit-reveal model already helps against early herding, but it is not full receipt-free voting. For high-value bounties, Curyo should consider stronger privacy or receipt-freeness later.

### Gitcoin

Gitcoin's quadratic funding research generalizes to bountied questions: when rewards depend on many unique humans, fake or controlled identities become economically valuable. One Voter ID per human is important, but valuable bounties still need layered defenses such as pattern detection, source-of-funds clustering, community flagging, and category-specific reputation.

### Prediction Markets

Prediction markets show why binary outcomes are powerful and dangerous. CFTC materials describe event contracts as often yes/no, fixed-payout instruments tied to event outcomes. CFTC also penalized Polymarket for off-exchange event-based binary options tied to future yes/no outcomes. Curyo should avoid markets, odds, positions, order books, secondary trading, and event-resolution framing in v1.

## Potential Issues

### Consensus Is Not Truth

The system will answer what verified and economically incentivized participants converge on. That can be useful, but it should not be marketed as objective truth. For subjective, political, medical, legal, identity-sensitive, or reputation-sensitive questions, consensus can collapse into popularity, ideology, coordinated pressure, or fear of being on the wrong side.

Curyo's useful core is closer to a Keynesian beauty contest than a truth oracle. The goal is often not to prove an objective fact, but to surface what honest, verified voters currently think other honest voters will consider good, bad, trustworthy, useful, attractive, or worth recommending. That makes Curyo a natural fit for product ratings, hotel ratings, subjective content quality, aesthetics, usefulness, and other domains where no single canonical answer exists.

Product copy and protocol docs should distinguish:

- Objective answer: externally verifiable fact.
- Bounded judgment: answerable with a rubric and evidence.
- Community confidence: what Curyo can safely claim.
- Opinion/rating signal: a stake-backed aggregate of honest voter judgment, not a guarantee of correctness.

### Regulatory Risk From Binary Stablecoin Payouts

If users fund yes/no questions and voters receive stablecoin payouts for choosing the winning side, the design can start to resemble prediction markets, event contracts, gambling, contests, or binary options.

This is most risky for questions that look like objective event resolution or regulated outcome wagering, including:

- Future events.
- Elections or politics.
- Sports.
- Token or asset prices.
- Economic data.
- Lawsuits, enforcement actions, or regulatory outcomes.
- Celebrity, reputation, or personal allegations.

Fact-based future events are usually a poor Curyo fit because specialized prediction markets or oracle systems can resolve them against a later objective outcome. Curyo can only capture voter judgment at the time of voting. If someone asks about a future event before it happens, the result should be understood as "what verified voters currently believe or expect," not a guarantee that the event will resolve that way.

The safer initial framing is "paid human review of bounded judgment" rather than "bet on an outcome." Bounty distribution should be participation-only at launch: every eligible voter who submits a valid vote and reveals properly on the funded question can claim the same capped stablecoin review reward or a pro-rata share of that question's bounty, independent of whether the round settles up or down. cREP remains the outcome-risk mechanism.

Additional regulatory red lines:

- Do not create tradable yes/no shares.
- Do not create an order book or secondary market.
- Do not use odds, position, market, bet, wager, or fixed-payout copy.
- Do not let reviewers pay stablecoins to enter.
- Do not let creators, subjects, insiders, or parties who can influence the outcome claim outcome-weighted rewards.
- Do not pay any stablecoin coherence, correctness, or winning-side bonus at launch.
- Do not launch future-event bounty categories that look like event contracts, prediction markets, or objective event-resolution products without a separate legal workstream.

### Stablecoin Compliance and Issuer Controls

Stablecoin flows introduce sanctions, blocked-address, prohibited-activity, tax, and issuer-policy considerations. As of this research pass, the U.S. GENIUS Act has created a federal payment-stablecoin framework, and EU MiCA rules regulate asset-referenced tokens and e-money tokens. Even if Curyo is not issuing stablecoins, escrowing and distributing stablecoin bounties can still require legal review.

Stablecoin issuers may also monitor or block prohibited transactions, including certain gambling or unlawful activity categories. That makes arbitrary bounties riskier than cREP-only rewards.

Stablecoin bounty claims may also create tax reporting expectations for users. IRS guidance treats digital assets, including stablecoins, as reportable digital assets and explicitly references rewards, awards, and payment for services. Product copy should assume bounty recipients may need records of claim amounts, dates, token symbols, and fair market values.

Self.xyz can mitigate part of this risk. Self's disclosure and verification flow supports `excludedCountries` rules and OFAC checks, and the IdentityVerificationHub applies geographic and sanctions requirements from the stored verification configuration. Curyo already uses Self.xyz for Voter ID issuance, with frontend OFAC checking enabled in `packages/nextjs/lib/governance/selfVerificationApp.ts` and on-chain deployment config enabling all three Self OFAC modes in `packages/foundry/script/DeployCuryo.s.sol`. However, the current Curyo config leaves `excludedCountries` empty and `forbiddenCountriesEnabled` false, so sanctioned-country exclusion would need to be explicitly enabled for bounty participation.

Recommended bounty-specific approach:

- Require a Voter ID or fresh bounty eligibility proof minted under a Self configuration that enables OFAC checks and excludes sanctioned or unsupported jurisdictions.
- Version the eligibility config so old Voter IDs minted before the bounty restrictions can be re-checked before stablecoin funding or claiming.
- Keep the proof privacy-preserving: use country exclusion and OFAC pass/fail checks where possible instead of revealing nationality, name, passport number, or date of birth.
- Apply the gate to bounty funding, bounty claiming, and possibly bounty voting, not only to initial faucet claims.
- Continue wallet-level screening at funding and claim time, because a person can pass document checks while the wallet, counterparty, or token transfer still creates sanctions or issuer-policy risk.

Self.xyz is therefore a strong control, but not a complete answer. Country-of-document or nationality is not always the same as residence, sanctions lists and issuer rules change, delegated wallets can complicate attribution, and stablecoin issuers can still freeze or block assets. It should be treated as one layer alongside stablecoin allowlists, address screening, bounty caps, transaction logs, and emergency pause controls.

### Ambiguity Attacks

Open-ended questions are not automatically bad. They are central to Curyo's strongest use cases: products, hotels, design, usefulness, taste, and reputation-like community judgment. The attack surface appears when the question is vague enough that voters cannot tell what they are supposed to judge or submitters imply an objective guarantee that Curyo cannot provide.

Bad open-ended prompts include:

- "Is this good?"
- "Is this trustworthy?"
- "Is this person dangerous?"
- "Is this project a scam?"

Better subjective prompts name the dimension of judgment:

- "Would you recommend this hotel to a friend at this price?"
- "Does this product listing look trustworthy enough to buy from?"
- "Does this design look polished?"
- "Is this answer useful for a beginner?"
- "Does this restaurant look worth visiting?"

Templates should reduce mismatched expectations, not force every question into objective fact-checking. Bounties should require a prompt frame, category, context, and invalid/cannot-resolve criteria, but subjective opinion/rating templates should be first-class.

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

If Curyo hosts, proxies, or caches user media instead of only linking out, the safety burden increases sharply:

- CSAM handling needs a documented escalation and reporting playbook before image uploads or media proxying launch.
- Copyright handling needs a DMCA agent, takedown workflow, repeat-infringer policy, and removal process if user media is hosted.
- EU-facing platform risk increases under the Digital Services Act, which expects notice/action mechanisms, appeal paths, and stronger safeguards at scale.
- Media previews should be disabled or scanned for untrusted arbitrary URLs until moderation infrastructure exists.

### Bounty Size Can Overwhelm cREP Incentives

If the stablecoin bounty is much larger than the cREP at risk, voters may optimize for bounty capture instead of reputation or rating accuracy. The stablecoin layer should be capped at launch and should scale with quorum, stake, and reviewer quality.

## Recommended First Version

### 1. Launch With Question Frames

Start with guided question frames rather than an unrestricted text box. This can still feel open to submitters: the user writes the concrete question, but must choose a frame that explains what kind of judgment voters are making. Frames should include subjective rating questions as first-class use cases:

- Product rating: "Would you recommend this product?"
- Hotel or venue rating: "Would you stay here or visit this place?"
- Aesthetic judgment: "Does this look polished, appealing, or high quality?"
- Usefulness judgment: "Is this answer useful for the intended audience?"
- Trust judgment: "Does this listing or page look trustworthy enough to engage with?"
- Source support: "Is claim X supported by source Y as of date Z?"
- Media classification: "Does this image/video appear to contain X?"
- Impersonation: "Does this page look like it is impersonating the official entity?"

Future-event, election, sports, asset-price, legal-outcome, and enforcement-outcome questions should not be positioned as objective event-resolution markets. If they are allowed at all, they should be clearly labeled as current community expectation/opinion, not as a promise of future correctness, and they should remain outside any market-like stablecoin payout model.

Submitter-facing copy should make the expectation explicit:

- Curyo does not guarantee that an answer is objectively correct.
- Voters are sharing a stake-backed opinion or expectation at the time they vote.
- Future events may resolve differently later.
- For fact-based future outcomes with objective settlement, prediction markets or oracle systems may be better tools.

Every frame should require:

- Exact binary claim.
- Rating dimension or accepted evidence sources.
- Yes criteria.
- No criteria.
- Invalid/cannot-resolve criteria.
- Vote-time context, evidence snapshot time, or expectation that the answer reflects current voter judgment.
- Conflict-of-interest disclosure.

### 2. Treat the Result as Confidence, Not Final Truth

The rating can still start at 50 and move based on thumbs up/down. The user-facing label should be closer to:

- Yes confidence.
- Community confidence.
- Evidence confidence.
- Recommendation confidence.
- Current voter expectation.

Avoid "truth score" unless the category has a strong oracle or appeal process.

### 3. Keep Stablecoin Bounties Separate From cREP Pools

Create a separate bounty escrow per question. Do not fund it from or deposit it into the Consensus Subsidy Reserve or global Participation Pool. The cREP system should continue to provide conviction, reputation, and anti-spam pressure.

Conceptually, each funded question should have its own mini participation pool:

- Funders deposit stablecoins into one specific question.
- Only eligible voters who validly commit and reveal on that question can claim from that question's pool.
- Unused stablecoins stay attached to that question for later rounds, roll into an explicit follow-up tranche, or return to funders under defined refund rules.
- Funding one question should not subsidize unrelated questions, the global Participation Pool, or protocol-wide voter participation.
- Third-party top-ups can be allowed, but they should top up a specific question and inherit that question's template, restrictions, refund rules, and claim rules.

### 4. Use Participation-Only Stablecoin Payouts

At launch, stablecoin rewards should be independent of vote direction and settlement side:

- 90% to 95% for valid revealed participation.
- 5% to 10% for protocol, frontend, moderation, treasury, or appeal reserves.
- 0% for coherent/winning-side stablecoin rewards.

This makes the product look more like paid review work and less like a binary wager. The stablecoin reward should require a valid commit and reveal, but should not depend on whether the voter voted up or down. The cREP stake remains the correctness/conviction layer: voters on the losing side still lose most of their cREP stake under the existing round mechanics.

The stablecoin review reward is local to the funded question. A voter earns from question A only by validly participating in question A; there is no global drip or evenly distributed protocol-wide stablecoin reward.

Losing a round should reduce a voter's future capacity by depleting their cREP balance, not by revoking their Voter ID. Voter ID revocation should stay reserved for fraud, collusion, identity abuse, or other governance-confirmed misconduct.

Future versions could revisit stablecoin coherence bonuses only after legal review and live abuse data. They should not be part of the launch design.

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
- Death, violent harm, assassination, terrorism, war, or unlawful acts.
- Questions where the creator or subject can directly influence the answer.

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
- Should every bounty require a separate creator bond that can be slashed independently of the voter bounty?
- Should voters stake cREP in addition to earning stablecoins?
- Should stablecoin participation rewards be split equally among all valid revealers, pro-rata by capped cREP stake, or through a fixed per-voter reward with unused bounty refunded or rolled forward?
- Should creators be able to add bounty after a question is open?
- Should third parties be able to top up existing question-specific bounty pools?
- Should unused question bounty stay attached to later rounds, expire back to funders, or roll into an appeal/challenge tranche?
- Should a question support multiple evidence links or only one canonical link?
- Should high-stakes bounties require a moderator or curator precheck?
- Should the protocol support an invalid/cannot-resolve outcome in addition to yes/no?
- Should high-value questions have an optimistic answer plus challenge window before the Curyo vote, similar to UMA?
- Should bounty funding and claiming require a fresh Self.xyz proof under a bounty-specific OFAC and excluded-country configuration?
- Which jurisdictions should be excluded, who updates that list, and how are existing Voter IDs re-checked when the list changes?
- Should delegated wallets be allowed to fund or claim stablecoin bounties, or should claims require the direct Voter ID holder?
- Should Curyo add category-specific voter reputation before routing bounties?
- Should there be an appeal court, expert panel, or governance escalation path?
- How should Curyo handle takedowns when bounty funds are already escrowed?
- What stablecoins and chains are acceptable at launch?

## Technical Implications

Likely new or changed components:

- A `BountiedQuestionRegistry` or `QuestionRegistry` that stores question metadata, template type, rubric, evidence URI, creator, moderation status, and optional content linkage.
- A `BountyEscrow` contract that holds allowlisted stablecoin funds per question and tracks question-specific deposits, refunds, tranches, and protocol fees.
- A `BountyRewardDistributor` that offers pull-based stablecoin participation claims keyed by `contentId`, `roundId`, and token, using terminal round state and revealed-vote data but not paying based on winning side or unrelated question activity.
- Ponder/indexer tables such as `bounty_question`, `bounty_deposit`, `bounty_round_snapshot`, `bounty_claim`, and possibly `bounty_token`.
- Frontend flows for question creation, funding, voting, reveal, claim, cancellation, and dispute.
- Keeper support for settlement and possibly bounty tranche release.
- Tests for solvency, refund paths, partial payout, stablecoin decimals, non-standard ERC20 behavior, and moderation removal.

The strongest architecture recommendation is to keep `RoundVotingEngine` unchanged for v1 bounties. Curyo's settlement path is already complex and bytecode-sensitive, and stablecoin custody should not be added to the voting engine. Keep cREP voting as the judgment layer and add a separate escrow/distributor that reads settled outcomes.

Current integration points:

- `ContentRegistry` manages URL/title/description/tags/category submissions and fixed cREP submitter stake. A question can fit as a content subtype, but arbitrary questions and images conflict with the current approved-platform and canonical-URL model.
- `RoundVotingEngine` manages 1-100 cREP voting, tlock commit-reveal, settlement, and rating updates. It should remain the source of judgment, not stablecoin custody.
- `RoundRewardDistributor` is cREP-only and pull-based. The stablecoin bounty distributor should copy the pull-based pattern without replacing it.
- Ponder currently indexes content, rounds, votes, and cREP rewards. Bounties need new schema and event handlers rather than overloading existing reward tables.
- The Next submit flow assumes an approved platform URL and category. A bountied-question flow should likely be a separate tab or route.
- Free transaction sponsorship should not cover stablecoin approvals or bounty deposits in v1. Bounty funding should be self-funded until abuse and compliance economics are clearer.

High-risk test areas:

- Bounty escrow solvency.
- Pull-based stablecoin claims.
- Participation-only stablecoin reward math.
- Question-scoped accounting: deposits for one question cannot pay claims for another question.
- Unused question-bounty rollover/refund behavior.
- No stablecoin winner/coherence-bonus path at launch.
- Reentrancy around ERC20 transfers.
- Fee-on-transfer or blacklistable token behavior.
- Quorum failure refund behavior.
- Reveal failure refund behavior.
- Creator self-vote restrictions.
- Appeal/dispute payout freezing.
- Frontend and Ponder state alignment.
- Sanctions/blocklist handling for token funding and claiming.
- Stablecoin allowlist enforcement.
- Conflict-of-interest blocking beyond direct creator self-voting.
- Invalid/cannot-resolve payout and refund behavior.

## Proposed Product Constraints

Recommended v1 constraints:

- Launch as "bountied review questions" or "verification bounties."
- Make subjective opinion/rating questions first-class, especially products, hotels, places, aesthetics, usefulness, and trust signals.
- Require a guided question frame and rubric/context for every question.
- Clearly label results as community judgment or current expectation, not objective truth or guaranteed future outcome.
- Tell submitters that Curyo measures current voter judgment; it does not guarantee future correctness.
- Include an invalid/cannot-resolve path.
- Keep stablecoin bounty funding separate from cREP vote staking.
- Keep stablecoin bounty funds question-scoped; no global stablecoin ParticipationPool.
- Keep cREP voting required for judgment and anti-spam pressure.
- Pay stablecoins only for valid revealed participation at launch.
- Keep all outcome risk in cREP: losing-side voters lose cREP stake, but they can still claim the stablecoin review reward if they participated validly.
- Limit claims to eligible voters who participated in the funded question.
- Do not revoke Voter IDs for honest losing votes; depletion of cREP stake is the intended future-participation limiter.
- Do not add a stablecoin coherence, correctness, or winning-side bonus at launch.
- Cap bounty size and per-user payout size.
- Allow only one or two allowlisted stablecoins at launch.
- Use pull-based claims.
- Gate bounty funding and claims with Self.xyz OFAC and excluded-country checks, ideally through a bounty-specific eligibility config.
- Re-check or version eligibility before stablecoin claims when country or sanctions rules change.
- Screen wallet addresses at funding and claim time even when Self.xyz verification passes.
- Prohibit creator voting and creator claiming.
- Require conflict disclosure for question creators.
- Escalate high-value questions through longer windows, higher quorum, and manual review.
- Avoid arbitrary media uploads until scanning, takedown, and reporting workflows exist.
- Add emergency controls to pause question creation, bounty funding, media previewing, and claims separately.

Recommended v1 copy constraints:

- Use "review," "question," "confidence," "claim," "bounty," and "reward."
- Avoid "market," "bet," "wager," "odds," "shares," "positions," "trade," and "jackpot."
- Avoid "truth" unless there is a category-specific expert or appeal process behind it.

## Proposed Implementation Phases

### Phase 0: Product Semantics

Keep existing contracts unchanged. Define the bountied-question model in docs and product requirements. Decide allowed templates, disallowed categories, payout split, invalid outcome, refund rules, and moderation policy.

### Phase 1: Question Metadata Without Stablecoin Claims

Create bountied questions with question-specific escrowed funds, but keep cREP voting unchanged and do not yet enable stablecoin reward claims. Show bounty metadata in Ponder and the feed. Allow creator refund under clearly defined cancellation rules.

### Phase 2: Settled-Round Pull Claims

Enable pull-based, participation-only bounty claims after terminal round resolution, paid only from the funded question's pool. Start with one allowlisted 6-decimal stablecoin and low caps. No stablecoin coherence bonus, no sponsored bounty actions, no arbitrary tokens, and no media uploads.

### Phase 3: Tranches, Challenges, And Fees

Add tranche release, protocol/frontend fees, creator top-ups, challenge/appeal flow, larger bounty tiers, and stronger anomaly monitoring.

### Phase 4: Advanced Privacy And Reputation

Evaluate MACI-like receipt-freeness for high-value bounties, category-specific reviewer reputation, expert queues, and broader media support.

## Research Sources

- Curyo repo docs and contracts: `README.md`, `packages/nextjs/app/docs/how-it-works/page.tsx`, `packages/nextjs/app/docs/smart-contracts/page.tsx`, `packages/foundry/contracts/RoundVotingEngine.sol`, and `packages/foundry/contracts/RoundRewardDistributor.sol`.
- CFTC, prediction markets overview: https://www.cftc.gov/LearnandProtect/PredictionMarkets
- CFTC, 2026 prediction markets advisory: https://www.cftc.gov/PressRoom/PressReleases/9185-26
- CFTC, Polymarket event-based binary options order announcement: https://www.cftc.gov/PressRoom/PressReleases/8478-22
- Congress CRS, GENIUS Act stablecoin overview: https://www.congress.gov/crs-product/IN12553
- Congress, GENIUS Act public law text: https://www.congress.gov/bill/119th-congress/senate-bill/1582/text/pl
- European Banking Authority, MiCA asset-referenced and e-money tokens: https://www.eba.europa.eu/regulation-and-policy/asset-referenced-and-e-money-tokens-mica
- FinCEN, convertible virtual currency guidance: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering
- OFAC, sanctions compliance guidance for the virtual currency industry: https://ofac.treasury.gov/recent-actions/20211015
- IRS, digital asset reporting and tax requirements: https://www.irs.gov/newsroom/what-taxpayers-need-to-know-about-digital-asset-reporting-and-tax-requirements
- UMA, optimistic oracle overview: https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work
- UMA, bond and liveness parameter guidance: https://docs.uma.xyz/developers/setting-custom-bond-and-liveness-parameters
- Kleros FAQ and juror docs: https://docs.kleros.io/kleros-faq and https://docs.kleros.io/products/court/kleros-juror-tutorial
- MACI, introduction and voting privacy/collusion resistance: https://maci.pse.dev/docs/introduction
- Gitcoin, sybil resistance in quadratic funding: https://gitcoin.co/research/quadratic-funding-sybil-resistance
- Circle, bridged USDC terms: https://www.circle.com/legal/bridged-usdc-terms
- Self.xyz, disclosures and verification requirements: https://docs.self.xyz/use-self/disclosures
- Self.xyz, IdentityVerificationHub verification flow: https://docs.self.xyz/technical-docs/verification-in-the-identityverificationhub
- NCMEC CyberTipline: https://www.missingkids.org/gethelpnow/cybertipline
- U.S. Copyright Office, DMCA Section 512 resources: https://www.copyright.gov/512/index.html
- European Commission, Digital Services Act overview: https://digital-strategy.ec.europa.eu/en/policies/digital-services-act
