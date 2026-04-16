import { protocolCopy } from "../../lib/docs/protocolCopy";
import {
  protocolDocFacts,
  whitepaperRewardSplitRows,
  whitepaperSettlementConfigRows,
} from "../../lib/docs/protocolFacts";
import {
  CREP_MAX_SUPPLY_LABEL,
  FAUCET_POOL_AMOUNT_COMPACT_LABEL,
  tokenDistributionWhitepaperRows,
} from "../../lib/docs/tokenomics";
import type { Section } from "./types";

export const SECTIONS: Section[] = [
  // ── 1. Introduction ──
  {
    title: "Introduction",
    lead: "Get Verified, Ask Questions, and Rate with Stake",
    subsections: [
      {
        heading: "Mission",
        blocks: [
          {
            type: "paragraph",
            text: "The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of content, the flood of low-effort material will only accelerate -- making trustworthy quality signals more critical than ever. Curyo fights back by tying every vote to a verified reputation. When you stake real tokens on your judgment, low-quality content loses and high-quality content rises  -- no algorithms, no ads, no manipulation.",
          },
        ],
      },
      {
        heading: "What is Curyo?",
        blocks: [
          {
            type: "paragraph",
            text: protocolCopy.predictionGamesOverview,
          },
        ],
      },
      {
        heading: "Key Principles",
        blocks: [
          {
            type: "bullets",
            items: [
              "Skin in the Game  -- Every vote requires a token stake, aligning incentives. Rewards come from settled losing pools and participation incentives, not passive likes.",
              "Voter ID (Sybil Resistance)  -- Each verified human gets one soulbound Voter ID NFT, limiting stake to 100 cREP per content per round.",
              `Per-Content Rounds  -- Each content item has independent voting rounds. Votes are encrypted via tlock and hidden until each ${protocolDocFacts.blindPhaseDurationLabel} epoch ends. Commits bind the drand reveal target and chain hash, and the keeper/runtime layer checks the stored stanza metadata before reveal. After each epoch the keeper normally reveals eligible votes in the background, and connected users can self-reveal if needed. Settlement occurs after at least ${protocolDocFacts.minVotersLabel} votes are revealed and the reveal conditions are satisfied.`,
              `Contributor Rewards  -- ${protocolCopy.contributorRewardsOverview}`,
            ],
          },
        ],
      },
      {
        heading: "Voting Flow",
        blocks: [
          {
            type: "paragraph",
            text: `Voters predict whether content's rating will go up or down and back their prediction with a cREP stake. Votes are encrypted with tlock and hidden until the epoch ends, preventing herding. Commits bind the drand metadata used for reveal, and malformed or non-armored ciphertexts are rejected on-chain. Voting early in the epoch earns full reward weight (Tier 1), while voting after seeing epoch-1 results earns only ${protocolDocFacts.openPhaseWeightLabel} weight (Tier 2).`,
          },
          {
            type: "ordered",
            items: [
              "Commit: Choose up or down, select stake (1-100 cREP per Voter ID). The UI encrypts the vote, encodes (contentId, roundReferenceRatingBps, commitHash, ciphertext, frontend, targetRound, drandChainHash), and submits it through CuryoReputation.transferAndCall(votingEngine, stakeAmount, payload). The vote direction stays hidden until the epoch ends.",
              `Accumulate: More voters commit during the ${protocolDocFacts.blindPhaseDurationLabel} epoch. No one can see anyone else's vote direction until the epoch ends.`,
              "Reveal: After the epoch ends, the keeper normally decrypts eligible ciphertexts off-chain, checks the stored drand stanza metadata, and submits reveals on-chain. Connected users can also self-reveal if they know their vote plaintext. The rating does not change yet -- it updates only when the round later settles.",
              `Settle: Once at least ${protocolDocFacts.minVotersLabel} votes are revealed and all past-epoch votes are revealed (or the ${protocolDocFacts.revealGracePeriodLabel} reveal grace period expires), anyone can call settleRound(). The side with the larger epoch-weighted stake wins.`,
              `Claim: Winners receive their original stake back plus an epoch-weighted share of the content-specific voter pool (Tier 1 = ${protocolDocFacts.earlyVoterAdvantageLabel.replace(":1", "x")} reward per cREP vs Tier 2). One-sided rounds receive a consensus subsidy.`,
            ],
          },
          {
            type: "paragraph",
            text: "Winners always get their original stake back plus their reward share. Epoch-weight distribution means Tier 1 (blind) voters earn 4x more per cREP than Tier 2 (informed) voters. See the How It Works section for full details.",
          },
        ],
      },
      {
        heading: "Content Rating",
        blocks: [
          {
            type: "paragraph",
            text: "Every content item has a rating from 0 to 100, starting at 50. In the redeployed design, each round snapshots a canonical reference score on-chain (`roundReferenceRatingBps`). Frontends display that exact score for the round, and voters judge whether it is too low or too high rather than casting an absolute quality vote in a vacuum.",
          },
          {
            type: "paragraph",
            text: "Settlement updates the next score from that round reference on a logit scale using epoch-weighted revealed evidence, modest vote-share smoothing, and a dynamic confidence term. Repeated up-heavy rounds continue lifting the score from the current anchor, repeated down-heavy rounds continue lowering it, and contradictory rounds can reopen uncertainty instead of freezing the score permanently.",
          },
          {
            type: "paragraph",
            text: "Illegal content, content that doesn't load, or content with an incorrect description should always be downvoted regardless of the current rating. Submitter stakes are no longer meant to slash from the point estimate alone: after redeploy, slashability should require a conservative low-rating bound plus minimum evidence, minimum settled rounds, and dwell time below threshold.",
          },
        ],
      },
    ],
  },

  // ── 2. How It Works ──
  {
    title: "How It Works",
    lead: "Per-content round-based voting mechanics for content curation.",
    subsections: [
      {
        heading: "Voter ID & Sybil Resistance",
        blocks: [
          {
            type: "paragraph",
            text: "To prevent manipulation through multiple wallets (sybil attacks), Curyo uses Voter ID NFTs  -- soulbound tokens tied to verified human identities via Self.xyz passport or biometric ID card verification.",
          },
          {
            type: "bullets",
            items: [
              "One verified claim path per wallet/document: each supported document can only mint once, and each wallet can only claim once.",
              "Non-transferable: Voter IDs are soulbound  -- they cannot be transferred or sold.",
              "Stake limits per ID: Each Voter ID can stake a maximum of 100 cREP per content per round, regardless of how many wallets they control.",
              "Privacy-preserving: Self.xyz uses zero-knowledge proofs. Only the supported document proof is verified; no personal data is stored on-chain.",
            ],
          },
          {
            type: "paragraph",
            text: "Voter ID is required to vote, submit content, create a profile, or register as a frontend operator. This ensures every vote represents a real human with a fair stake limit.",
          },
        ],
      },
      {
        heading: "Voting Flow",
        blocks: [
          {
            type: "paragraph",
            text: "Submitting a question starts with the question itself: the entry can be text-only or include a regular evidence link, direct image link, or YouTube link. An optional Question Reward Pool attached to that question is paid in USDC on Celo and displayed as USD. The question submission key must be unique, and title plus description are emitted in the on-chain ContentSubmitted event so any frontend or indexer can reconstruct the same canonical metadata; the title is the primary label shown above the content, while the description gives longer context below it. There is no hard reward pool cap -- moderation, funding, and validation guardrails do the real work instead.",
          },
          {
            type: "paragraph",
            text: `Curyo uses tlock commit-reveal to prevent herding. Votes are encrypted to an epoch-end timestamp using the drand randomness beacon, so no one can see anyone else's direction until the epoch ends. Each ${protocolDocFacts.blindPhaseDurationLabel} epoch defines a reward tier: Tier 1 (first epoch, blind) earns ${protocolDocFacts.blindPhaseWeightLabel} weight; Tier 2+ (subsequent epochs, informed) earns ${protocolDocFacts.openPhaseWeightLabel} weight. The redeployed contracts keep the keeper-assisted/self-reveal model, but now bind drand metadata on-chain and reject malformed ciphertexts up front.`,
          },
          {
            type: "ordered",
            items: [
              "Commit (any time during the round): Choose up or down. The UI encrypts your direction and submits a single transferAndCall transaction carrying (contentId, roundReferenceRatingBps, commitHash, ciphertext, frontend, targetRound, drandChainHash). Your stake is locked; your direction is hidden on-chain until the epoch ends.",
              `Epoch ends (every ${protocolDocFacts.blindPhaseDurationLabel}): The drand beacon publishes a randomness value. The keeper fetches it, validates the stored AGE/tlock stanza against the commit metadata, decrypts eligible ciphertexts off-chain, and calls revealVoteByCommitKey() for unrevealed commits.`,
              `Settlement: After at least ${protocolDocFacts.minVotersLabel} votes are revealed and all past-epoch votes are revealed (or the ${protocolDocFacts.revealGracePeriodLabel} reveal grace period expires), anyone may call settleRound(contentId, roundId). The side with the larger epoch-weighted stake wins. The content rating updates from the round reference score using epoch-weighted revealed stake evidence.`,
              `Claim: Winners call claimReward(contentId, roundId) to receive their original stake plus an epoch-weighted share of the remaining losing pool. Revealed losers may also call claimReward(contentId, roundId) to recover a fixed ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate. If the question has a qualifying Question Reward Pool, eligible revealed Voter ID holders can also claim an equal question reward independent of cREP outcome. Content submitters may claim a separate submitter reward.`,
            ],
          },
        ],
      },
      {
        heading: "Voting Rules",
        blocks: [
          {
            type: "bullets",
            items: [
              "No self-voting: Content submitters cannot vote on their own submissions. This prevents rating manipulation during the grace period.",
              "Vote cooldown: After voting on a content item, you must wait 24 hours before voting on the same content again. This prevents repeated farming of the same content by coordinated groups.",
            ],
          },
        ],
      },
      {
        heading: "What Happens After You Vote",
        blocks: [
          {
            type: "paragraph",
            text: "After casting a vote, your stake goes through an automated lifecycle.",
          },
          {
            type: "table",
            data: {
              headers: ["Phase", "Status", "Duration", "Action Needed"],
              rows: [
                [
                  "Committed",
                  `Stake locked, direction hidden (Tier 1 = ${protocolDocFacts.blindPhaseWeightLabel} weight, Tier 2 = ${protocolDocFacts.openPhaseWeightLabel} weight)`,
                  "Instant",
                  "None  -- wait for epoch to end",
                ],
                [
                  "Epoch ended",
                  "Keeper normally validates the stored tlock stanza and reveals votes via drand; users can self-reveal if needed",
                  `${protocolDocFacts.blindPhaseDurationLabel} per epoch`,
                  "Usually none  -- fallback reveal exists",
                ],
                ["Settled", "Rewards calculated and claimable", "--", "Revealed voters claim rewards or rebates"],
                ["Cancelled", "Round expired below commit quorum  -- refundable to participants", "--", "Claim refund"],
                [
                  "RevealFailed",
                  "Commit quorum reached, but reveal quorum never did by the final grace deadline",
                  "--",
                  "Revealed votes claim refunds; unrevealed stakes are forfeited in cleanup",
                ],
              ],
            },
          },
          {
            type: "paragraph",
            text: `Settlement requires at least ${protocolDocFacts.minVotersLabel} voters revealed (minVoters threshold). It is only allowed once all past-epoch votes are revealed or their ${protocolDocFacts.revealGracePeriodLabel} reveal grace period has expired. A lightweight keeper service normally handles reveal, settlement, reveal-failed finalization, and cleanup automatically, but connected users also have a small manual fallback page if keeper reveal appears delayed. Winners receive their original stake plus an epoch-weighted share of the losing pool, and revealed losers can later reclaim a fixed ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate.`,
          },
        ],
      },
      {
        heading: "cREP Stake Settlement",
        blocks: [
          {
            type: "paragraph",
            text: "The losing cREP pool is split as follows:",
          },
          {
            type: "table",
            data: {
              headers: ["Recipient", "Share"],
              rows: whitepaperRewardSplitRows.map(([recipient, share]) => [
                recipient === "Content-specific voter pool" ? "Winning voters (content-specific)" : recipient,
                share,
              ]),
            },
          },
          {
            type: "paragraph",
            text: `A revealed losing vote can reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of its original stake. The remaining losing cREP pool then feeds the content-specific reward split: the ${protocolDocFacts.voterPoolNetSharePercentLabel} voter share goes to winning voters on that content, distributed proportionally by epoch-weighted effective stake. Tier 1 voters (first epoch, blind) have full weight (effectiveStake = rawStake). Tier 2+ voters (subsequent epochs, saw results) have ${protocolDocFacts.openPhaseWeightLabel} weight (effectiveStake = rawStake * 0.25). Because each content item has independent rounds, cREP rewards are calculated and claimable immediately after a round settles  -- no waiting for other content. The ${protocolDocFacts.consensusNetSharePercentLabel} consensus subsidy share accumulates in a reserve that funds rewards for one-sided rounds (see Consensus Subsidy Pool). USDC Question Reward Pools are funded separately and do not change this cREP stake settlement split.`,
          },
        ],
      },
      {
        heading: "Formal Incentive Analysis",
        blocks: [
          {
            type: "paragraph",
            text: `Curyo's parimutuel voting mechanism can be modeled as a game. Let N voters each choose a direction d_i in {up, down}, a stake s_i in [1, 100], and an epoch tier t_i in {1, 2+}. Each voter has an epoch-weighted effective stake: e_i = s_i when t_i = 1 (Tier 1, blind epoch), or e_i = s_i * 0.25 when t_i >= 2 (Tier 2+, saw prior results). The win condition uses weighted pools: upWins iff sum(e_i : d_i = up) > sum(e_i : d_i = down). Let W_e denote the total effective stake on the winning side and L the total raw stake on the losing side. Revealed losers reclaim ${protocolDocFacts.revealedLoserRefundPercentLabel} of L, and the voter pool receives ${protocolDocFacts.voterPoolShareLabel} of L, distributed proportionally by e_i / W_e.`,
          },
          {
            type: "sub_heading",
            text: "Payoff Functions",
          },
          {
            type: "paragraph",
            text: "For voter i on the winning side, net payoff beyond recovering the original stake is:",
          },
          {
            type: "formula",
            latex: `P_i^{\\mathrm{win}} = \\frac{e_i}{W_e} \\times ${protocolDocFacts.voterPoolEffectiveRawFactorLabel} \\, L`,
          },
          {
            type: "paragraph",
            text: "where e_i is the epoch-weighted effective stake (e_i = s_i for Tier 1, e_i = 0.25 * s_i for Tier 2+) and W_e is the sum of effective stakes on the winning side. Winners also recover their original stake. This means Tier 1 voters earn 4x more reward per cREP staked compared to Tier 2+ voters with the same raw stake.",
          },
          {
            type: "paragraph",
            text: `For voter i on the losing side, the revealed-loser rebate reduces the net loss to ${protocolDocFacts.revealedLoserRefundPercentLabel} less than the original stake:`,
          },
          {
            type: "formula",
            latex: "P_i^{\\mathrm{lose}} = -0.95\\,s_i",
          },
          {
            type: "paragraph",
            text: "The expected payoff for a Tier 1 voter simplifies to:",
          },
          {
            type: "formula",
            latex: `E[P_i^{T1}] = s_i \\left[ P(\\mathrm{win}) \\frac{${protocolDocFacts.voterPoolEffectiveRawFactorLabel} \\, L}{W_e} - P(\\mathrm{lose}) \\cdot 0.95 \\right]`,
          },
          {
            type: "sub_heading",
            text: "Proposition (Honest Voting Equilibrium)",
          },
          {
            type: "paragraph",
            text: `If each voter has a private signal with accuracy p > 0.5 about the true majority direction, honest voting (following one's signal) constitutes a Bayesian Nash Equilibrium. The tlock scheme enforces that votes committed before epoch end are cryptographically hidden from other voters, ensuring genuine independence. Deviating from honest voting moves a voter from the expected-winning pool to the expected-losing pool, sacrificing most of their stake after the fixed revealed-loser rebate. For p > 0.5, the expected gain from honest voting dominates any deviation. The epoch-weight penalty (${protocolDocFacts.earlyVoterAdvantageLabel} ratio) further strengthens this equilibrium by rewarding early honest voters disproportionately, making bandwagoning (waiting to see epoch-1 results) costly in reward terms.`,
          },
          {
            type: "sub_heading",
            text: "Stake Size Rationality",
          },
          {
            type: "paragraph",
            text: "Since E[P_i] is linear in s_i, a risk-neutral voter stakes the maximum 100 cREP when the following condition holds, and zero otherwise:",
          },
          {
            type: "formula",
            latex: `P(\\mathrm{win}) > \\frac{0.95}{0.95 + ${protocolDocFacts.voterPoolEffectiveRawFactorLabel} \\cdot L/W_e}`,
          },
          {
            type: "paragraph",
            text: "The following table shows the minimum confidence required to justify Tier 1 participation at various pool ratios (Tier 2+ voters face a worse break-even since their e_i is only 25% of stake):",
          },
          {
            type: "table",
            data: {
              headers: ["L/W_e Ratio", "Break-even P(win) for Tier 1", "Interpretation"],
              rows: [
                ["0.25", "83%", "Heavily lopsided  -- need high confidence"],
                ["0.5", "71%", "Moderate imbalance"],
                ["1.0", "55%", "Balanced pools  -- slight edge suffices"],
                ["2.0", "38%", "Minority side offers high reward"],
              ],
            },
          },
          {
            type: "sub_heading",
            text: "Rating Stability",
          },
          {
            type: "paragraph",
            text: "In the redeployed model, ratings update from the current round reference score rather than recomputing from 50 or from the current round alone. The protocol converts the epoch-weighted revealed vote share into a score-gap signal on a latent logit scale, dampens that signal with a confidence term learned from prior settled rounds, and applies a bounded movement step. The result is a system where history creates real inertia, but surprising contradictory rounds can still move the score and reopen confidence instead of leaving bad early anchors permanently locked in.",
          },
          {
            type: "paragraph",
            text: "Governance can later tune smoothing, confidence, and movement-cap parameters, but each round snapshots its rating configuration when it opens. That means in-progress rounds always settle under the exact rating rules and reference score that voters saw when they committed.",
          },
        ],
      },
      {
        heading: "Empirical Verification",
        blocks: [
          {
            type: "paragraph",
            text: "The theoretical incentive properties are validated by a 49-scenario Forge test suite covering game theory, participation economics, governance capture, and round lifecycle edge cases.",
          },
          {
            type: "sub_heading",
            text: "Game Theory Verification",
          },
          {
            type: "paragraph",
            text: `Numerical tests confirm honest voting profitability: in a 2-vs-1 split with 50 cREP stakes (all Tier 1), each winner receives their stake plus a proportional share of the loser's remaining 38 cREP reward pool (${protocolDocFacts.voterPoolNetSharePercentLabel} of the post-rebate 47.5 cREP) while the revealed loser only recovers the fixed 2.5 cREP rebate. Epoch-weight verification: with 1 Tier-1 voter and 4 Tier-2 voters on the winning side (each 50 cREP), the Tier-1 voter receives approximately ${protocolDocFacts.earlyVoterAdvantageLabel.replace(":1", "x")} the reward per cREP compared to each Tier-2 voter, confirming the ${protocolDocFacts.earlyVoterAdvantageLabel} weight ratio. The epoch-weighted win condition test: 1 Tier-1 down voter (100 cREP, effectiveStake 100) beats 3 Tier-2 up voters (100 cREP each, effectiveStake 25 each = 75 total) -- down wins despite raw majority being up.`,
          },
          {
            type: "sub_heading",
            text: "Bootstrap Pool Sustainability",
          },
          {
            type: "paragraph",
            text: "Under modeled usage of 1,000 votes per day at an average stake of 50 cREP, the Bootstrap Pool (24M cREP) sustains tier-0 rewards (90%) for approximately 33 days before the first halving. The halving schedule then extends the pool's effective lifetime: the pool supports over 1 million votes and survives well beyond one year of continuous operation across its first four tiers. Worst-case drainage (200 max-stake voters per round) exhausts tier-0 in approximately 83 rounds, but the halving mechanism ensures graceful degradation rather than abrupt depletion. A 256-run fuzz test confirms the conservation invariant: distributed tokens plus remaining balance always equals the initial deposit.",
          },
          {
            type: "sub_heading",
            text: "Governance Resistance",
          },
          {
            type: "paragraph",
            text: "The dynamic quorum mechanism now uses the larger of 4% of circulating supply or a 100,000 cREP bootstrap floor, paired with a 10,000 cREP proposal threshold. At launch, circulating supply starts at 0 because the pre-minted protocol pools are excluded from quorum, so the 100,000 cREP floor binds until enough faucet claims move tokens into user hands. As the platform matures and token pools drain into circulation, quorum requirements continue to scale proportionally  -- at 50M circulating, quorum reaches 2M cREP. The 7-day governance lock is a transfer restriction that mitigates vote-then-sell attacks while still allowing content voting during the lock period; it is not a per-proposal bond.",
          },
        ],
      },
      {
        heading: "Subjective Curation & Question Design",
        blocks: [
          {
            type: "paragraph",
            text: "Content quality is inherently subjective  -- there is no objective ground truth that determines whether a piece of content deserves a higher or lower rating. In the absence of ground truth, the system incentivizes predicting the majority view: voters are rewarded for aligning with the winning side, not for being objectively correct. This resembles a Keynesian beauty contest (Keynes 1936), where rational actors choose what they believe others will choose. Unlike in financial markets  -- where beauty contest dynamics cause bubbles by disconnecting prices from fundamentals  -- content curation has no fundamentals separate from community opinion. The community consensus is the rating. When voters ask 'what will others vote?' they are effectively asking 'what does the community consider quality?', which is exactly what the system is designed to measure. The beauty contest dynamic is therefore the mechanism working as intended, not a failure mode.",
          },
          {
            type: "paragraph",
            text: "This dynamic makes clear rating guidance critical. Stable equilibria emerge when voters can lean on shared evidence instead of vague taste or novelty. Frontends should therefore emphasize the live rating, the visible market signal, and concise guidance about what to consider when moving a score up or down.",
          },
          {
            type: "paragraph",
            text: "Despite the multiplicity of equilibria in abstract game theory (contrarian voting or random voting are also self-consistent), the honest voting equilibrium from the formal analysis serves as the focal (Schelling) point. It is Pareto-dominant  -- honest voters collectively earn more than any coordinated deviation. This focal point is reinforced by winner bootstrap rewards, revealed-loser rebates that reduce but do not remove downside risk, and the threat of governance Voter ID revocation for detected manipulation.",
          },
        ],
      },
      {
        heading: "Anti-Herding via Epoch Weighting",
        blocks: [
          {
            type: "paragraph",
            text: "The parimutuel structure creates a built-in self-balancing mechanism. As shown in the break-even table above, when the L/W_e ratio is 2.0, a Tier 1 voter needs only 38% confidence to profitably take the minority position. The tlock scheme makes this work correctly: since votes are hidden during epoch 1, voters cannot see the tally and are forced to vote based on genuine belief rather than copying others.",
          },
          {
            type: "paragraph",
            text: "Epoch weighting adds a second layer of anti-herding. Even after epoch 1 results become visible, voters who pile onto the winning side in epoch 2+ earn only 25% reward weight per cREP. This means late bandwagoners get a much smaller share of the prize pool, making herding economically unattractive.",
          },
          {
            type: "paragraph",
            text: "In equilibrium: Tier 1 voters vote honestly (hidden, full weight). If Tier 2 voters see a clear imbalance after epoch 1, the minority side is attractive (high L/W_e), but the majority side is cheap to join (lower L/W_e) but penalized 4x in reward. The combination of cryptographic privacy in epoch 1 and economic penalty in epoch 2+ makes herding simultaneously impossible and unprofitable.",
          },
        ],
      },
      {
        heading: "Round-Based Voting With Epoch Settlement",
        blocks: [
          {
            type: "paragraph",
            text: `Each content item has independent voting rounds. A round begins when the first vote is committed. Voters commit encrypted votes at any time; the direction is hidden until the epoch ends. Each ${protocolDocFacts.blindPhaseDurationLabel} period is an epoch -- commitments made within the first epoch are Tier 1 (${protocolDocFacts.blindPhaseWeightLabel} reward weight), while later commitments are Tier 2 (${protocolDocFacts.openPhaseWeightLabel} weight).`,
          },
          {
            type: "paragraph",
            text: "The epoch-based settlement eliminates strategic delay. In systems with immediate public votes, sophisticated voters wait to see the tally before committing. With tlock commit-reveal, waiting to see epoch-1 results costs 4x in reward weight. The dominant strategy is to vote early (Tier 1), based on genuine belief, rather than wait to copy the majority (Tier 2).",
          },
          {
            type: "paragraph",
            text: `Settlement conditions: at least ${protocolDocFacts.minVotersLabel} votes must be revealed (minVoters), and all past-epoch votes must be revealed unless their ${protocolDocFacts.revealGracePeriodLabel} reveal grace period has expired. Rounds that expire (${protocolDocFacts.maxRoundDurationLabel}) below commit quorum are cancelled and refundable, while rounds that hit commit quorum but still miss reveal quorum can finalize as RevealFailed after the final reveal grace deadline.`,
          },
        ],
      },
      {
        heading: "Content Rating",
        blocks: [
          {
            type: "paragraph",
            text: "Each content item has a rating from 0 to 100 (starting at 50). In the redeployed design, when a round opens the protocol snapshots `roundReferenceRatingBps`, and every frontend should display that same reference score while the round is open. The rating update then starts from that reference score, interprets up votes as evidence the displayed score is too low and down votes as evidence it is too high, and settles the next score from epoch-weighted revealed evidence on a bounded latent scale. Winners still receive their original stake back plus an epoch-weighted share of the losing pool, but the score itself now compounds from the current displayed anchor instead of being recomputed from the round in isolation.",
          },
        ],
      },
      {
        heading: "Content Dormancy & Revival",
        blocks: [
          {
            type: "paragraph",
            text: "Content that receives no voting activity for 30 days can be marked as dormant. This is a permissionless action  -- anyone can trigger it, and the Keeper service does so automatically. Dormancy prevents new votes on inactive content and returns the submitter's original stake.",
          },
          {
            type: "bullets",
            items: [
              "Safety check: Content with an active unsettled round cannot be marked dormant, protecting voters from stranded stakes.",
              "Revival: Dormant content can be revived by a Voter ID holder who proves the original submitter identity and stakes 5 cREP to the treasury. This resets the 30-day activity timer. Each content item can be revived up to 2 times.",
              "Exclusive window: The original submitter has a 1-day exclusive revival window before the dormant submission key can be released.",
              "Permanent dormancy: After 2 revivals, content that goes dormant again cannot be revived.",
            ],
          },
        ],
      },
    ],
  },

  // ── 3. tlock Commit-Reveal Voting ──
  {
    title: "tlock Commit-Reveal Voting",
    lead: "How Curyo uses time-lock encryption and epoch-weighted rewards to produce manipulation-resistant quality signals.",
    subsections: [
      {
        heading: "Why tlock?",
        blocks: [
          {
            type: "paragraph",
            text: "On a public blockchain, every transaction is visible to everyone. If voters can see each other's directions before committing, they face a herding incentive: copy the apparent majority to reduce risk. Traditional commit-reveal schemes require a separate reveal transaction after the voting period ends, which is burdensome and can be manipulated by voters who never reveal (selectively withholding unfavorable votes).",
          },
          {
            type: "paragraph",
            text: `Curyo uses tlock (time-lock encryption based on the drand randomness beacon) to reduce the reveal burden. When a voter commits, the direction is encrypted to a future timestamp -- the end of the current ${protocolDocFacts.blindPhaseDurationLabel} epoch. After the epoch ends, the drand beacon publishes a verifiable random value that enables off-chain decryption. The keeper normally fetches that beacon data and calls revealVoteByCommitKey() on-chain for unrevealed votes it can decrypt. In normal use, most voters do not need to take any additional action after their initial commit, although the app also exposes a small manual fallback if an auto-reveal appears delayed.`,
          },
        ],
      },
      {
        heading: "Epoch-Weighted Rewards",
        blocks: [
          {
            type: "paragraph",
            text: `Each ${protocolDocFacts.blindPhaseDurationLabel} epoch defines a reward tier. Voters who commit during the first epoch (before any results are visible) earn Tier 1 weight (${protocolDocFacts.blindPhaseWeightLabel}). Voters who commit in subsequent epochs (after seeing epoch-1 results) earn Tier 2 weight (${protocolDocFacts.openPhaseWeightLabel}). This ${protocolDocFacts.earlyVoterAdvantageLabel} ratio creates a strong incentive to vote early and honestly, before any herding signal exists.`,
          },
          {
            type: "table",
            data: {
              headers: ["Tier", "Epoch", "Reward Weight", "Information Available"],
              rows: [
                [
                  "Tier 1",
                  `Epoch 1 (0 to ${protocolDocFacts.blindPhaseDurationLabel})`,
                  protocolDocFacts.blindPhaseWeightLabel,
                  "None  -- all votes hidden by tlock",
                ],
                [
                  "Tier 2",
                  `Epoch 2+ (after ${protocolDocFacts.blindPhaseDurationLabel})`,
                  protocolDocFacts.openPhaseWeightLabel,
                  "Epoch 1 results visible (directions + stakes revealed)",
                ],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The epoch-weighted effective stake is used for both the win condition and cREP payout weights:",
          },
          {
            type: "formula",
            latex:
              "e_i = \\begin{cases} s_i & \\text{if Tier 1 (epoch 1)} \\\\ 0.25 \\, s_i & \\text{if Tier 2+ (epoch 2+)} \\end{cases}",
          },
          {
            type: "paragraph",
            text: "The winner is determined by comparing total epoch-weighted stakes: upWins iff sum(e_i : d_i = up) > sum(e_i : d_i = down). cREP rewards are distributed proportionally to e_i / W_e among winners, where W_e is the total effective stake on the winning side.",
          },
          {
            type: "table",
            data: {
              headers: ["Voter", "Direction", "Stake", "Tier", "Effective Stake", "Reward share (up wins)"],
              rows: [
                [
                  "Alice (Tier 1)",
                  "up",
                  "50 cREP",
                  "1",
                  "50 cREP",
                  `50 / W_e of ${protocolDocFacts.voterPoolNetSharePercentLabel} of the post-rebate pool`,
                ],
                [
                  "Bob (Tier 1)",
                  "up",
                  "50 cREP",
                  "1",
                  "50 cREP",
                  `50 / W_e of ${protocolDocFacts.voterPoolNetSharePercentLabel} of the post-rebate pool`,
                ],
                [
                  "Carol (Tier 2)",
                  "up",
                  "50 cREP",
                  "2",
                  "12.5 cREP",
                  `12.5 / W_e of ${protocolDocFacts.voterPoolNetSharePercentLabel} of the post-rebate pool`,
                ],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Alice and Bob each earn 4x Carol's reward per cREP staked, despite all three staking 50 cREP. Their original 50 cREP stake is always returned regardless of tier.",
          },
        ],
      },
      {
        heading: "Settlement Mechanics",
        blocks: [
          {
            type: "paragraph",
            text: `Settlement requires at least ${protocolDocFacts.minVotersLabel} votes to be revealed (minVoters). Additionally, all votes from past epochs must be revealed before settlement is allowed during the reveal grace period (default: ${protocolDocFacts.revealGracePeriodLabel} after each epoch ends). This prevents selective revelation attacks where an attacker reveals only favorable votes. After the grace period, any remaining unrevealed votes no longer block settlement and are forfeited post-settlement.`,
          },
          {
            type: "table",
            data: {
              headers: ["Parameter", "Value", "Effect"],
              rows: whitepaperSettlementConfigRows,
            },
          },
          {
            type: "paragraph",
            text: "Settlement is permissionless: anyone may call settleRound(contentId, roundId) once conditions are met. The contract enforces that all past-epoch votes have been revealed (or their reveal grace period has expired) before allowing settlement, preventing selective revelation attacks. The keeper service handles both reveal and settlement automatically. In the redeployed rating model, settlement also consumes the round's canonical reference score and epoch-weighted revealed evidence, so the same anti-herding weights that shape rewards also shape how much late visible votes can move the score.",
          },
        ],
      },
      {
        heading: "One-Sided Rounds & Consensus Subsidy",
        blocks: [
          {
            type: "paragraph",
            text: "When all voters commit in the same direction, there is no losing pool to distribute. Without mitigation, this creates a perverse incentive: no reason to vote on obviously good or bad content. The consensus subsidy solves this.",
          },
          {
            type: "paragraph",
            text: "One-sided rounds (only up or only down votes revealed) settle normally with the revealed side as the winner and a zero losing pool. All stakes are returned, and voters receive a small reward from the consensus subsidy reserve -- 5% of the total stake (capped at 50 cREP per round), split between voters (~89%) and the content submitter (~11%). These rounds are consensus-subsidized settlements, not tied-round settlements.",
          },
          {
            type: "paragraph",
            text: "The consensus subsidy reserve is pre-funded with 4,000,000 cREP and continuously replenished by 5% of every two-sided settlement's losing pool. This makes the mechanism self-sustaining: contentious rounds generate surplus that funds consensus rounds.",
          },
        ],
      },
      {
        heading: "Security Properties",
        blocks: [
          {
            type: "bullets",
            items: [
              "Cryptographic anti-herding: tlock ensures votes are provably hidden until the epoch ends, enforced by the drand randomness beacon. No voter can see others' directions during epoch 1.",
              `Economic anti-herding: Tier 2 voters (who saw epoch-1 results) earn only ${protocolDocFacts.openPhaseWeightLabel} reward weight per cREP. Herding is economically unattractive regardless of information advantage.`,
              "Epoch-weighted win condition: A flood of late Tier-2 voters cannot flip a Tier-1 consensus  -- 3 Tier-2 voters at 100 cREP each (effective stake 25 each = 75 total) cannot override 1 Tier-1 voter at 100 cREP (effective stake 100). Even 4 Tier-2 voters at 100 cREP each (effective 100 total) only produce a tie.",
              "Keeper is not trusted: The reveal transaction is open to any caller who knows the plaintext `(isUp, salt)`. In practice the keeper derives that plaintext off-chain after epoch end. The keeper is a convenience, not a gatekeeper.",
              `Anti-selective-revelation: The contract tracks unrevealed vote counts per epoch. Settlement is blocked during the reveal grace period (${protocolDocFacts.revealGracePeriodLabel}) if any past-epoch votes remain unrevealed, forcing the keeper to reveal all votes before anyone can settle. After the grace period, any unrevealed votes are forfeited (past epoch) or refunded (current epoch) post-settlement.`,
              "Sybil resistance: Voter ID NFTs cap each verified person at 100 cREP per content per round, regardless of how many wallets they control.",
              "Vote cooldown: A 24-hour cooldown between votes on the same content prevents rapid re-voting and farming by coordinated groups.",
            ],
          },
        ],
      },
      {
        heading: "Edge Cases",
        blocks: [
          {
            type: "sub_heading",
            text: "What Happens With Very Low Participation?",
          },
          {
            type: "paragraph",
            text: `Rounds require a minimum of ${protocolDocFacts.minVotersLabel} revealed votes (minVoters) to settle as contested. If ${protocolDocFacts.maxRoundDurationLabel} pass below commit quorum, the round is cancelled and refundable. If commit quorum was reached but reveal quorum still never materializes by the final reveal grace deadline, the round can finalize as RevealFailed: revealed votes remain refundable, while unrevealed stakes are forfeited in cleanup. If all voters reveal in the same direction, the round settles with that side as the winner and receives a consensus subsidy payout.`,
          },
          {
            type: "sub_heading",
            text: "What if the Keeper Fails to Reveal?",
          },
          {
            type: "paragraph",
            text: `The reveal transaction is open to any caller who knows the plaintext \`(isUp, salt)\` for a commit. In normal operation the keeper derives that plaintext off-chain from the tlock ciphertext after epoch end. Connected users can also self-reveal from the fallback flow. If the keeper is offline, settlement is delayed until an honest party reveals the needed votes or the reveal grace period expires. Below commit quorum the round can still cancel; after commit quorum, missing reveal quorum can end in RevealFailed and unrevealed stakes are forfeited during cleanup. The chain binds each reveal to the exact submitted ciphertext and now rejects malformed/non-armored ciphertexts on-chain, but it still does not prove on-chain that the ciphertext was honestly decryptable; a future hardening path here would be zk-based reveal proofs.`,
          },
          {
            type: "sub_heading",
            text: "Can a Vote Direction Be Guessed?",
          },
          {
            type: "paragraph",
            text: "The on-chain commitment is commitHash = keccak256(isUp, salt, contentId, roundReferenceRatingBps, targetRound, drandChainHash, keccak256(ciphertext)) where salt is a 32-byte random value chosen by the voter and ciphertext is the exact timelock payload submitted on-chain. Binding the round reference score, target drand round, chain hash, and ciphertext digest prevents a valid reveal from being replayed against a different score anchor or drand target. Guessing the direction requires finding a preimage of keccak256, which is computationally infeasible. The tlock ciphertext additionally encrypts the direction to the epoch-end timestamp, providing a second layer of confidentiality.",
          },
          {
            type: "sub_heading",
            text: "What Happens to Unrevealed Votes at Settlement?",
          },
          {
            type: "paragraph",
            text: `During the reveal grace period (${protocolDocFacts.revealGracePeriodLabel} after each epoch ends), settlement is blocked if any past-epoch votes remain unrevealed. This prevents selective revelation attacks. Once all past-epoch votes are revealed (or the grace period expires), settlement proceeds. Post-settlement, votes whose revealableAfter timestamp falls before the settlement time are considered forfeited  -- their stake goes to treasury. Votes whose revealableAfter is after the settlement time (committed in the current epoch) are refunded in full, as they could not yet be revealed.`,
          },
          {
            type: "sub_heading",
            text: "Can Votes Be Selectively Revealed?",
          },
          {
            type: "paragraph",
            text: "Not in the normal settlement flow. The contract tracks unrevealed vote counts per epoch, and settlement is blocked during the reveal grace period if any past-epoch votes remain unrevealed. That prevents a caller from revealing only a favorable subset and settling immediately. In practice the keeper reveals all eligible votes within minutes of each epoch ending after checking the stored tlock stanza metadata, and connected users can self-reveal if the keeper appears delayed.",
          },
        ],
      },
    ],
  },

  // ── 4. Tokenomics ──
  {
    title: "Tokenomics",
    lead: "cREP token distribution and point mechanics.",
    subsections: [
      {
        heading: "cREP Is a Reputation Token Only",
        blocks: [
          {
            type: "paragraph",
            text: "cREP has no monetary value and is not designed as an investment or financial instrument. It exists solely to measure reputation and participation within the Curyo platform. The protocol does not sell cREP: distribution is intended to flow through verified identity claims and active participation, while unlocked balances remain standard transferable token balances. There is no team, no company, and no central entity behind the token. Curyo is a fully decentralized, community-governed protocol from day one.",
          },
        ],
      },
      {
        heading: "Token Overview",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Property", "Value"],
              rows: [
                ["Name", "cREP"],
                ["Max Supply", CREP_MAX_SUPPLY_LABEL],
                ["Decimals", "6"],
                ["Type", "Reputation token (non-financial)"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Fixed supply of 100 million tokens. Fair launch  -- no pre-mine, no VC allocation, no team tokens, and no token sale of any kind. The full supply is minted at launch into protocol-controlled pools.",
          },
          {
            type: "bullets",
            items: [
              "Reputation, not money. cREP represents your standing in the community. It is staked to curate and vote, not traded for profit.",
              "No issuer, no sale. There is no company, foundation, or team that issues, sells, or controls cREP. Distribution is handled entirely by on-chain protocol contracts.",
              `Governance-finalized deployments. ${protocolCopy.governanceDesignPrinciple}`,
              "Sybil-resistant distribution. Tokens are claimed through Self.xyz passport or biometric ID card verification, reducing concentration and broadening distribution.",
            ],
          },
        ],
      },
      {
        heading: "Token Distribution",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Pool", "Allocation", "Purpose"],
              rows: tokenDistributionWhitepaperRows,
            },
          },
        ],
      },
      {
        heading: "HumanFaucet",
        blocks: [
          {
            type: "paragraph",
            text: "Primary distribution via Self.xyz passport or biometric ID card verification. Each supported document can claim once, and each wallet can only claim once. Claim amounts decrease as more users join  -- rewarding early adopters who bootstrap the platform with content.",
          },
          {
            type: "table",
            data: {
              headers: ["Tier", "Claimants", "Claim (no referral)", "Claim (with referral)", "Referrer gets"],
              rows: [
                ["0 (Genesis)", "0 - 9", "10,000 cREP", "15,000 cREP", "5,000 cREP"],
                ["1 (Early Adopter)", "10 - 999", "1,000 cREP", "1,500 cREP", "500 cREP"],
                ["2 (Pioneer)", "1,000 - 9,999", "100 cREP", "150 cREP", "50 cREP"],
                ["3 (Explorer)", "10,000 - 999,999", "10 cREP", "15 cREP", "5 cREP"],
                ["4 (Settler)", "1,000,000+", "1 cREP", "1.5 cREP", "0.5 cREP"],
              ],
            },
          },
          {
            type: "paragraph",
            text: `The ${FAUCET_POOL_AMOUNT_COMPACT_LABEL} faucet pool serves up to ~41 million users without referrals (~15 million with full referral usage). Referral bonuses scale proportionally at 50% of the claim amount. The first 10 Genesis claimants receive 10,000 cREP each to bootstrap the platform from day one. As the platform grows and becomes more populated, later claimants need fewer tokens since there is already content to engage with.`,
          },
        ],
      },
      {
        heading: "Bootstrap Pool",
        blocks: [
          {
            type: "paragraph",
            text: protocolCopy.participationPoolOverview,
          },
          {
            type: "paragraph",
            text: "The reward formula is:",
          },
          {
            type: "formula",
            latex: "\\mathrm{reward} = \\mathrm{stakeAmount} \\times \\mathrm{currentRate}",
          },
          {
            type: "paragraph",
            text: "The rate starts at 90% and halves based on cumulative cREP distributed from the pool -- making the pool's lifetime predictable regardless of individual stake sizes.",
          },
          {
            type: "table",
            data: {
              headers: ["Tier", "cREP Distributed", "Cumulative", "Rate", "Stake 10", "Stake 100"],
              rows: [
                ["0", "1,500,000", "1,500,000", "90%", "9 cREP", "90 cREP"],
                ["1", "3,000,000", "4,500,000", "45%", "4.5 cREP", "45 cREP"],
                ["2", "6,000,000", "10,500,000", "22.5%", "2.25 cREP", "22.5 cREP"],
                ["3", "12,000,000", "22,500,000", "11.25%", "1.125 cREP", "11.25 cREP"],
                ["Tail", "1,500,000", "24,000,000", "5.62%", "0.562 cREP", "5.62 cREP"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Voter bootstrap rewards are distributed when a round settles  -- deferred from vote time to prevent exploitation where attackers could vote, collect immediate bootstrap rewards, and then have rounds cancel without risk. Submitter bootstrap rewards are paid only when the submitter stake resolves on the healthy path after a settled round. The pool is funded with 24M cREP and governed by the same timelock as all other protocol contracts.",
          },
        ],
      },
      {
        heading: "Keeper Network",
        blocks: [
          {
            type: "paragraph",
            text: `Anyone can run a keeper. Keepers are lightweight services that monitor the blockchain for active rounds and perform reveal, settlement, reveal-failed finalization, and post-settlement cleanup work. The contract enforces a reveal grace period (${protocolDocFacts.revealGracePeriodLabel}) during which all past-epoch votes must be revealed before settlement is allowed, preventing selective revelation attacks. Round finalization and cleanup remain permissionless  -- any account can call the relevant functions.`,
          },
          {
            type: "paragraph",
            text: "Keepers also perform housekeeping: cancelling expired rounds (rounds that exceed maxDuration without reaching minVoters) and marking dormant content. The drand randomness beacon is public, so anyone can run the off-chain decryption flow, but the current protocol verifies commit consistency and on-chain tlock metadata hygiene rather than proving on-chain that the stored ciphertext was honestly decryptable. In practice the reveal path is a keeper/drand-assisted off-chain flow with a user fallback, not a fully trustless ciphertext proof system. If Curyo later wants to close that trust gap entirely, zk proofs of correct decryption are the most natural upgrade path.",
          },
        ],
      },
      {
        heading: "Treasury",
        blocks: [
          {
            type: "paragraph",
            text: "Slashed submitter stakes, the 1% treasury fee on contested settlements, cancellation fees, and forfeited past-epoch unrevealed stakes all flow to the governance-controlled treasury. The consensus subsidy reserve is separate: it is pre-funded at launch and replenished by 5% of losing pools from two-sided rounds. Treasury spending follows the same governor proposal and timelock execution flow as upgrades and config changes.",
          },
        ],
      },
      {
        heading: "Point Distribution",
        blocks: [
          {
            type: "paragraph",
            text: "When a round settles, the losing side's stakes are distributed. Winners also get their original stake back.",
          },
          {
            type: "table",
            data: {
              headers: ["Recipient", "Share"],
              rows: whitepaperRewardSplitRows.map(([recipient, share]) => [
                recipient === "Revealed losing voters"
                  ? "Revealed losing voters (rebate)"
                  : recipient === "Content-specific voter pool"
                    ? "Winning voters (content-specific)"
                    : recipient,
                share,
              ]),
            },
          },
          {
            type: "paragraph",
            text: `A revealed losing vote first recovers a fixed ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate. The ${protocolDocFacts.voterPoolNetSharePercentLabel} voter share then goes to a content-specific pool, distributed proportionally by epoch-weighted effective stake to winning voters on that content. Tier-1 voters (who committed during epoch 1 with no information) earn full weight (${protocolDocFacts.blindPhaseWeightLabel} of their stake), while Tier-2 voters (who committed after epoch-1 results were visible) earn ${protocolDocFacts.openPhaseWeightLabel} weight. This ${protocolDocFacts.earlyVoterAdvantageLabel} ratio means early voters receive a larger portion of the reward pool per cREP staked. Because each content item has independent rounds that settle on their own timeline, rewards are claimable immediately after settlement  -- no waiting for other content. The ${protocolDocFacts.consensusNetSharePercentLabel} consensus subsidy share funds one-sided-round rewards (see Consensus Subsidy Pool). The ${protocolDocFacts.treasuryNetSharePercentLabel} treasury fee is routed to the governance timelock.`,
          },
        ],
      },
      {
        heading: "Deferred Bootstrap Rewards",
        blocks: [
          {
            type: "paragraph",
            text: "Voter bootstrap rewards are distributed at round settlement, not at vote time. This design choice eliminates a critical attack vector: if voters received an immediate bootstrap bonus at vote time, it would reduce their at-risk capital. This could create exploitation opportunities for coordinated minorities who could stake on low-liquidity content, collect the bootstrap reward immediately, and profit regardless of outcome.",
          },
          {
            type: "paragraph",
            text: `By deferring voter rewards to settlement, the full vote stake stays at risk until the round completes. Combined with the epoch-weighted reward structure (which penalizes late entrants with ${protocolDocFacts.openPhaseWeightLabel} weight vs ${protocolDocFacts.blindPhaseWeightLabel} for early voters) and deterministic epoch-based settlement (which prevents strategic timing of entries), the deferred model ensures voter bootstrap rewards flow only to genuine, successful curation activity while submitter bonuses unlock only after healthy settled validation.`,
          },
        ],
      },
      {
        heading: "Staking Requirements",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Action", "Stake", "Notes"],
              rows: [
                ["Vote on content", "1-100 cREP", "Per vote, per round"],
                [
                  "Submit content",
                  "10 cREP",
                  "Returned after a healthy settled round once no later round remains open, or at dormancy if no round ever settles; optional Question Reward Pools are funded separately",
                ],
                ["Register as frontend", "1,000 cREP", "Returned on exit unless slashed"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Submitter stakes are slashed (100% to treasury) only when the content's conservative rating bound stays below the slash threshold after the 24-hour grace period and enough evidence has accumulated to make that signal credible. The redeployed design therefore gates slashability on a conservative low-score bound plus minimum evidence, minimum settled rounds, and a dwell period below threshold. Stakes are returned after roughly 4 days once a settled round confirms a healthy conservative rating and no later round remains open. If no round ever settles, the stake instead resolves when the content reaches dormancy. Healthy submitter bootstrap rewards are snapshotted at that return point and claimed later; whatever the pool can already fund is reserved immediately so later claims do not depend entirely on future authorization state.",
          },
        ],
      },
      {
        heading: "Sybil Attack Economics",
        blocks: [
          {
            type: "sub_heading",
            text: "Attack Model",
          },
          {
            type: "paragraph",
            text: "Consider an attacker who acquires K fraudulent verified identities at cost c per identity (document-grade identity verification). Each identity can stake up to 100 cREP per content per round, giving the attacker maximum voting power of K x 100 cREP.",
          },
          {
            type: "sub_heading",
            text: "Profitability Analysis",
          },
          {
            type: "paragraph",
            text: `For the attack to succeed, the attacker must control the majority stake. If L_honest is the honest voters' stake on the losing side, the attacker's total winning payoff (beyond recovering stakes) is ${protocolDocFacts.voterPoolEffectiveRawFactorLabel} x L_honest (${protocolDocFacts.voterPoolNetSharePercentLabel} of the post-rebate losing pool). The total cost is K x c (identity acquisition). The attack is profitable only when:`,
          },
          {
            type: "formula",
            latex: `K < \\frac{${protocolDocFacts.voterPoolEffectiveRawFactorLabel} \\cdot L_{\\mathrm{honest}}}{c}`,
          },
          {
            type: "table",
            data: {
              headers: ["Identity cost (c)", "Honest losing stake (L)", "Max profitable identities (K)"],
              rows: [
                ["10 cREP equiv.", "100 cREP", "8"],
                ["50 cREP equiv.", "100 cREP", "1"],
                ["10 cREP equiv.", "1,000 cREP", "82"],
                ["50 cREP equiv.", "1,000 cREP", "16"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The real-world cost of a verified supported identity document far exceeds any on-chain equivalent. Even at low assumed identity costs, profitability requires the attacker to control the majority  -- if honest voters collectively outstake the attacker, all K identities lose their entire staked cREP. The attack is negative-sum in expectation against an active honest voter base.",
          },
          {
            type: "sub_heading",
            text: "Permanent Revocation Deterrent",
          },
          {
            type: "paragraph",
            text: "If detected via on-chain pattern analysis (correlated wallet funding, synchronized vote timing, identical stake amounts) and a subsequent governance proposal, all K identities can be revoked. The attacker loses not only the current round's stake but future voting capability across those identities unless governance later restores a valid claim path. The expected cost of detection increases with K (more identities produce more on-chain correlation signals), creating a superlinear deterrent:",
          },
          {
            type: "formula",
            latex: "E[\\mathrm{penalty}] = P(\\mathrm{detect} \\mid K) \\cdot K \\cdot V_{\\mathrm{future}}",
          },
          {
            type: "paragraph",
            text: "where V_future is the discounted future value of each identity's voting participation.",
          },
        ],
      },
    ],
  },

  // ── 5. Governance ──
  {
    title: "Governance",
    lead: "On-chain governance for shaping the platform's future.",
    subsections: [
      {
        heading: "Overview",
        blocks: [
          {
            type: "paragraph",
            text: protocolCopy.governanceOverview,
          },
          {
            type: "paragraph",
            text: "Curyo is a reputation token with no monetary value. It is not sold by the protocol, has no treasury backing, and is not designed as a financial instrument. Governance power is intended to come from reputation earned through verified participation, not from a token sale.",
          },
        ],
      },
      {
        heading: "Voting Power",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo includes built-in governance capabilities with snapshot-based voting. Your voting power equals your cREP balance and is activated automatically  -- no delegation step required.",
          },
        ],
      },
      {
        heading: "Proposal Lifecycle",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["State", "Description"],
              rows: [
                ["Pending", "Created. Waiting for voting delay (~1 day / 7,200 blocks)."],
                ["Active", "Voting open (~1 week / 50,400 blocks). Cast: For, Against, or Abstain."],
                ["Queued", "Passed. In timelock queue (2 days)."],
                ["Executed", "Changes are live."],
              ],
            },
          },
        ],
      },
      {
        heading: "Parameters",
        blocks: [
          {
            type: "table",
            data: {
              headers: ["Parameter", "Value"],
              rows: [
                ["Proposal threshold", protocolDocFacts.governanceProposalThresholdLabel],
                ["Voting delay", "~1 day (7,200 blocks)"],
                ["Voting period", "~1 week (50,400 blocks)"],
                ["Quorum", protocolDocFacts.governanceQuorumLabel],
                ["Timelock delay", "2 days"],
                ["Governance lock", "7 days transfer-locked (after voting or proposing)"],
              ],
            },
          },
        ],
      },
      {
        heading: "Round Voting Parameters",
        blocks: [
          {
            type: "paragraph",
            text: "The following parameters control per-content round-based voting. Core round settings are adjustable via governance proposals through setConfig(), while reveal timing, drand metadata, rating behavior, and submitter slash guardrails are configured through separate ProtocolConfig functions. New rounds snapshot the round, drand, and rating configuration they start with.",
          },
          {
            type: "table",
            data: {
              headers: ["Parameter", "Default", "Description"],
              rows: [
                [
                  "epochDuration",
                  protocolDocFacts.blindPhaseDurationLabel,
                  `Duration of each reward tier; commits in epoch 1 earn ${protocolDocFacts.blindPhaseWeightLabel} weight, later epochs ${protocolDocFacts.openPhaseWeightLabel}`,
                ],
                [
                  "maxDuration",
                  protocolDocFacts.maxRoundDurationLabel,
                  "Maximum round lifetime  -- below commit quorum rounds cancel; commit-quorum rounds can end as RevealFailed",
                ],
                [
                  "minVoters",
                  protocolDocFacts.minVotersLabel,
                  "Minimum revealed votes required before settlement is allowed",
                ],
                ["maxVoters", protocolDocFacts.maxVotersLabel, "Per-round cap on total commits"],
                ["Rating smoothing", "alpha=10 cREP / beta=10 cREP", "Dampens small or lopsided vote-share samples"],
                ["Observation beta", "2.0", "Scales the score-gap signal before logit movement"],
                [
                  "Confidence mass",
                  "80 cREP initial, bounded 50-500 cREP",
                  "Controls rating inertia as evidence accumulates",
                ],
                [
                  "Movement caps",
                  "0.6 logit per round, +/-4.595 total",
                  "Limits single-round and absolute score movement",
                ],
                [
                  "Conservative slashing",
                  "15% max / 2.5% min penalty",
                  "Derives the low-confidence rating bound used for submitter slashing",
                ],
                [
                  "Slash guardrails",
                  "25 score, 2 settled rounds, 7 days low, 200 cREP evidence",
                  "Gates submitter slashability",
                ],
                ["Vote stake", "1-100 cREP", "Stake range per vote, capped per Voter ID"],
                ["Vote cooldown", "24 hours", "Wait time before voting on the same content again"],
              ],
            },
          },
          {
            type: "paragraph",
            text: `The epoch-based mechanism ensures rounds complete within a bounded timeframe. The epochDuration defines the reward tier window (${protocolDocFacts.blindPhaseDurationLabel} for full weight). Settlement becomes available once minVoters is reached and past-epoch reveal constraints are satisfied. The maxDuration hard cap prevents indefinite rounds. RatingConfig replaces the old single hardcoded smoothing constant with governance-controlled smoothing, confidence, movement-cap, and conservative-bound parameters. As the platform grows, governance can adjust the configurable parameters to optimize for the observed voter population while in-progress rounds keep their snapshotted rules.`,
          },
        ],
      },
      {
        heading: "Treasury",
        blocks: [
          {
            type: "paragraph",
            text: "The treasury starts with 20M cREP routed directly to the governance timelock. It grows over time through four primary ongoing inflow sources:",
          },
          {
            type: "bullets",
            items: [
              "1% settlement fee  -- 1% of contested losing pools is sent to the treasury when rounds settle.",
              "Cancellation fees  -- voluntary content withdrawals pay a fixed 1 cREP fee into the treasury.",
              "Slashed submitter stakes  -- when content is flagged for policy violations or receives unfavorable ratings, the submitter's 10 cREP stake is slashed to the treasury.",
              "Forfeited unrevealed votes  -- past-epoch unrevealed stakes are swept to treasury during post-settlement cleanup.",
            ],
          },
          {
            type: "paragraph",
            text: "Treasury spending follows the same governor proposal and timelock execution flow as upgrades and config changes. That keeps the system decentralized from launch, but it also means governance capture affects both code changes and treasury movements.",
          },
        ],
      },
      {
        heading: "Collusion Prevention",
        blocks: [
          {
            type: "paragraph",
            text: "The integrity of cREP's content curation depends on honest, independent voting. Groups that coordinate to artificially upvote or downvote content undermine the parimutuel system and harm fair curation.",
          },
          {
            type: "sub_heading",
            text: "Detection",
          },
          {
            type: "paragraph",
            text: "Community members can monitor voting patterns on-chain. Suspicious activity  -- such as coordinated voting from related wallets, vote timing patterns, or unusual stake distributions  -- can be flagged and analyzed using on-chain data.",
          },
          {
            type: "sub_heading",
            text: "Enforcement via Governance Proposals",
          },
          {
            type: "paragraph",
            text: "When hard evidence of collusion is found, the community can take action through governance:",
          },
          {
            type: "bullets",
            items: [
              "Revoke Voter IDs  -- governance can revoke the Voter ID NFTs of confirmed colluders, removing their ability to vote on the platform unless governance later restores a valid claim path.",
              "Reward whistleblowers  -- governance is encouraged to allocate cREP from the treasury to reward community members who provide evidence of collusion.",
            ],
          },
          {
            type: "sub_heading",
            text: "Deterrence",
          },
          {
            type: "paragraph",
            text: "Several protocol features make collusion costly and difficult:",
          },
          {
            type: "bullets",
            items: [
              "Sybil resistance  -- 1 person = 1 Voter ID via Self.xyz passport or biometric ID card verification.",
              "Stake caps  -- maximum 100 cREP per content per round limits single-voter influence.",
              "Vote cooldowns  -- a 24-hour cooldown on the same content prevents rapid re-voting and is enforced per effective Voter ID.",
              "Governance revocation  -- losing your Voter ID removes voting ability and makes recovery depend on a later governance action.",
            ],
          },
          {
            type: "sub_heading",
            text: "Formal Collusion Model",
          },
          {
            type: "paragraph",
            text: `A coalition of C colluders coordinates to vote in the same direction on target content. Each colluder stakes s_c (up to 100 cREP). Their combined stake is S_C = C x s_c. Let S_H denote honest voters' stake on the opposite side. The coalition wins if S_C > S_H. Coalition profit (beyond recovering stakes) is ${protocolDocFacts.voterPoolEffectiveRawFactorLabel} x S_H (${protocolDocFacts.voterPoolNetSharePercentLabel} of the post-rebate losing pool), shared among C members. Per-member profit:`,
          },
          {
            type: "formula",
            latex: `\\mathrm{profit\\;per\\;member} = \\frac{${protocolDocFacts.voterPoolEffectiveRawFactorLabel} \\cdot S_H}{C}`,
          },
          {
            type: "sub_heading",
            text: "Diminishing Returns",
          },
          {
            type: "paragraph",
            text: "For collusion to exceed the per-member coordination cost k (communication, trust establishment, detection risk):",
          },
          {
            type: "formula",
            latex: `\\frac{${protocolDocFacts.voterPoolEffectiveRawFactorLabel} \\cdot S_H}{C} > k`,
          },
          {
            type: "paragraph",
            text: "As coalition size C grows, per-member profit shrinks linearly while coordination cost and detection risk increase. This creates a natural ceiling on profitable coalition size. Furthermore, if honest voters respond to suspected collusion by increasing their counter-stakes, S_H grows and the required coalition size increases further.",
          },
          {
            type: "sub_heading",
            text: "Detection Probability and Expected Penalty",
          },
          {
            type: "paragraph",
            text: "On-chain signals of collusion include: identical vote timing within the same block or narrow window, correlated stake amounts, shared funding sources traceable via transaction graphs, and repeated same-direction voting on identical content across rounds. The probability of detection P(detect | C) is monotonically increasing in C. Combined with governance Voter ID revocation, the expected penalty is:",
          },
          {
            type: "formula",
            latex: "E[\\mathrm{penalty}] = P(\\mathrm{detect} \\mid C) \\cdot C \\cdot V_{\\mathrm{future}}",
          },
          {
            type: "paragraph",
            text: "where V_future represents the net present value of each identity's future voting rewards. For sufficiently high detection probability or future voting value, the expected penalty exceeds the one-time collusion profit, making collusion a negative expected-value strategy.",
          },
          {
            type: "paragraph",
            text: "The process follows cREP's standard governance flow: evidence is submitted, a governance proposal is created, the community votes, and after the timelock delay, the action is executed.",
          },
        ],
      },
      {
        heading: "Spam Prevention",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo already rejects malformed or non-armored vote ciphertexts on-chain. However, the current reveal model does not yet use zero-knowledge proofs that every accepted ciphertext was honestly decryptable. That means a malicious voter could still submit a syntactically valid commit that later cannot be revealed by independent resolution services.",
          },
          {
            type: "paragraph",
            text: "This is primarily a liveness and operations risk, not a way to smuggle counted votes into the result. A vote only affects settlement once it is successfully revealed. But unrevealable spam commits can waste keeper effort, delay round resolution, and if repeated broadly enough, contribute to reveal-failed rounds that require manual cleanup.",
          },
          {
            type: "sub_heading",
            text: "Detection",
          },
          {
            type: "paragraph",
            text: "Community members and independent resolution services can watch for repeated unrevealable commits, failed reveal attempts, or patterns where the same Voter ID repeatedly creates commits that pass the basic on-chain checks but never reveal successfully.",
          },
          {
            type: "sub_heading",
            text: "Enforcement via Governance Proposals",
          },
          {
            type: "paragraph",
            text: "When there is credible evidence of repeated spam behavior, governance is encouraged to act:",
          },
          {
            type: "bullets",
            items: [
              "Revoke Voter IDs  -- governance can revoke the Voter IDs of accounts that repeatedly submit spam or unrevealable vote commits, removing their ability to keep disrupting rounds unless governance later restores a valid claim path.",
              "Reward investigators  -- governance is encouraged to use treasury funds to reward operators or community members who document repeated abuse with reproducible evidence from on-chain data and resolution-service observations.",
            ],
          },
          {
            type: "sub_heading",
            text: "Deterrence",
          },
          {
            type: "paragraph",
            text: "Several protocol features already make vote spam costly:",
          },
          {
            type: "bullets",
            items: [
              "Stake at risk  -- unrevealed past-epoch votes can be forfeited to treasury during cleanup, and unrevealed commits in reveal-failed rounds are forfeited rather than refunded.",
              "Sybil resistance  -- 1 person = 1 Voter ID via Self.xyz passport or biometric ID card verification.",
              "Stake caps  -- maximum 100 cREP per content per round limits damage from any one Voter ID.",
              "Governance revocation  -- losing your Voter ID eliminates future voting ability unless governance later restores a valid claim path.",
            ],
          },
          {
            type: "sub_heading",
            text: "Future Hardening",
          },
          {
            type: "paragraph",
            text: "A stronger long-term hardening path would be zk-based reveal proofs or comparable cryptographic checks that accepted commits are honestly decryptable. Until then, governance oversight and Voter ID revocation remain the main backstop against repeated vote spam.",
          },
        ],
      },
      {
        heading: "Governance Security",
        blocks: [
          {
            type: "paragraph",
            text: "On-chain governance carries its own attack surface. A malicious actor who accumulates sufficient voting power could propose changes that benefit themselves at the expense of the community  -- for example, altering reward splits, revoking honest Voter IDs, or draining the treasury. Curyo's governance design includes several layers of defense against such attacks.",
          },
          {
            type: "sub_heading",
            text: "Snapshot-Based Voting",
          },
          {
            type: "paragraph",
            text: "Governance voting power is snapshot-based: it is locked at the block when a proposal is created. This prevents flash-loan attacks (borrowing tokens to vote, then returning them) and just-in-time token acquisition. An attacker must hold cREP before the proposal exists, making surprise governance attacks impractical.",
          },
          {
            type: "sub_heading",
            text: "Timelock Delay",
          },
          {
            type: "paragraph",
            text: "All approved proposals enter a 2-day timelock queue before execution. This gives the community a window to detect malicious proposals and organize a response  -- including submitting counter-proposals or alerting the broader community. The delay acts as a circuit breaker against governance capture.",
          },
          {
            type: "sub_heading",
            text: "Early-Stage Concentration Risk",
          },
          {
            type: "paragraph",
            text: "Quorum is calculated as 4% of circulating supply  -- total supply minus balances held by protocol-controlled holders excluded by the governor. In the deployment model this includes custody contracts such as HumanFaucet, ParticipationPool, RewardDistributor, RoundVotingEngine reserves, the timelock-held treasury balance, and registry-held stakes. This dynamic calculation still scales with real circulation, but the bootstrap floor keeps early governance from becoming too cheap: quorum never drops below 100,000 cREP in the earliest stages. As the user base grows and more tokens enter circulation, the quorum threshold increases proportionally, requiring increasingly broad consensus.",
          },
          {
            type: "sub_heading",
            text: "Governance-Native Deployment",
          },
          {
            type: "paragraph",
            text: "Launch deployment keeps proxy upgrades, config roles, and treasury routing on the same timelock-controlled governance path. That preserves decentralization from day one: there is no separate treasury operator key once the deployer renounces setup roles. The bootstrap proposal threshold is 10,000 cREP and quorum never drops below 100,000 cREP; the real protection remains the combination of that bootstrap, dynamic circulating-supply quorum, majority vote, and timelock delay. Proposal eligibility is snapshot-based, so the same voting power can back multiple concurrent proposals, and the 7-day governance lock does not add marginal collateral per live proposal.",
          },
        ],
      },
    ],
  },

  // ── 6. Curyo & AI ──
  {
    title: "Curyo & AI",
    lead: "How stake-weighted curation addresses the AI content crisis and produces public quality infrastructure.",
    subsections: [
      {
        heading: "The Model Collapse Problem",
        blocks: [
          {
            type: "paragraph",
            text: "Research by Shumailov et al. (Nature, 2024) demonstrates that AI models trained recursively on AI-generated content undergo 'model collapse' -- a progressive loss of distributional fidelity where each successive generation of models loses the tails of the original data distribution. As AI-generated content proliferates across the web, the training data available to future models becomes increasingly contaminated with synthetic output, accelerating this degradation cycle.",
          },
          {
            type: "paragraph",
            text: "The implication is that verified human quality signals become critical infrastructure for maintaining the fidelity of AI systems. Without reliable mechanisms to distinguish high-quality content from low-quality or AI-generated filler, training pipelines face an increasingly noisy signal-to-noise ratio. Curyo addresses this by producing stake-weighted, Sybil-resistant quality ratings anchored to economic commitment from verified human identities.",
          },
        ],
      },
      {
        heading: "Stake-Weighted Curation",
        blocks: [
          {
            type: "paragraph",
            text: "The concept of 'staked media' (a16z, Big Ideas 2026, https://a16z.com/newsletter/big-ideas-2026-part-3/#the-rise-of-staked-media) -- where content quality is assessed through economic commitment rather than algorithmic engagement -- provides a manipulation-resistant alternative to traditional curation mechanisms. Curyo implements this approach through its parimutuel voting system: voters stake cREP tokens on their quality predictions, and the tlock commit-reveal scheme combined with epoch-weighted rewards ensures economic independence by hiding votes during epoch 1 and penalizing late herders with 25% reward weight.",
          },
          {
            type: "paragraph",
            text: "This design produces quality signals with several properties that distinguish them from engagement-based metrics:",
          },
          {
            type: "bullets",
            items: [
              "Economic commitment  -- Each rating is backed by a token stake, making systematic manipulation expensive relative to the signal produced.",
              `Economic independence  -- tlock encryption hides votes during epoch 1, eliminating herd signals. Epoch-weighted rewards (${protocolDocFacts.earlyVoterAdvantageLabel} ratio) further penalize late followers, incentivizing genuine early assessment over copying.`,
              "Sybil resistance  -- Self.xyz passport or biometric ID-card verification limits each verified identity's stake per content, preventing bot farms from flooding the signal.",
              "Verifiability  -- All votes, stakes, and outcomes are recorded on-chain with cryptographic integrity, enabling third-party audit and reproducibility.",
            ],
          },
        ],
      },
      {
        heading: "On-Chain Ratings as Public Infrastructure",
        blocks: [
          {
            type: "paragraph",
            text: "A foundational design decision in Curyo is the use of a public blockchain as the settlement layer. This ensures that all quality ratings -- including individual vote directions, stake amounts, round outcomes, and resulting content scores -- are inherently public, permissionless, and exportable. No proprietary API key or platform terms-of-service restriction mediates access to the underlying chain data. Hosted indexers and reference frontends may still apply service-level rate limits and policy-driven moderation filters to their displayed or indexed reads, but those filters do not alter the canonical on-chain record.",
          },
          {
            type: "paragraph",
            text: "This positions Curyo's output as public goods infrastructure rather than a proprietary dataset:",
          },
          {
            type: "bullets",
            items: [
              "AI training pipelines can incorporate on-chain quality scores to filter or weight training corpora, mitigating model collapse by prioritizing human-verified content.",
              "Search engines and recommendation systems can consume on-chain ratings as an independent quality signal, reducing dependence on engagement-based proxies.",
              "Researchers retain full transparency into voting dynamics, curation patterns, and content quality trends without data access barriers.",
              "Third-party platforms can build on the quality layer without permission, payment, or partnership agreements.",
            ],
          },
          {
            type: "paragraph",
            text: "Unlike centralized rating platforms where data is siloed behind proprietary APIs, blockchain-native ratings function as a commons. This aligns with the thesis that the AI-dominated web requires open, verifiable quality infrastructure rather than additional walled gardens.",
          },
        ],
      },
      {
        heading: "AI-Assisted Voting",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo incorporates AI as a first-class participant through reference bot tooling that uses pluggable rating strategies. Each strategy can query an external API to obtain a normalized quality score for supported content. The bot votes up or down based on whether the score meets a configurable threshold, but it is a manual or schedulable CLI rather than an always-on protocol daemon.",
          },
          {
            type: "paragraph",
            text: "Submission bots can also publish richer metadata than a single free-form caption. They submit a question-first entry with either text only, a regular evidence link, a direct image link, or a YouTube link, plus a short title, longer description, and category tags alongside the canonical URL. That keeps downstream discovery interfaces easier to scan while preserving the same shared on-chain event history for every frontend. Coverage is intentionally adapter-based: supported sources can submit or vote today, while other platform categories remain read-only or pending until an adapter exists.",
          },
          {
            type: "paragraph",
            text: "Bots participate under the same tlock privacy constraints as human voters  -- their vote direction is hidden until the epoch ends, just like human votes. The current reference bot uses a direct approve + commitVote flow and stakes the minimum amount of cREP per vote by default, while frontends often use the single-transaction transferAndCall path. Voting in epoch 1 (before any results are visible) gives bots the same 100% reward weight as early human voters, rewarding accurate strategies. The parimutuel mechanism provides natural selection pressure: strategies that produce inaccurate ratings lose their stakes, while accurate strategies accumulate reputation.",
          },
          {
            type: "sub_heading",
            text: "Human Oversight",
          },
          {
            type: "paragraph",
            text: "Bots and humans share the same protocol-level stake limits and reward rules, so influence ultimately depends on stake and accuracy rather than participant type. In practice, the reference bot stakes conservatively to seed rounds, while human voters can agree or disagree with whatever stake they choose. This creates a hybrid model: AI provides baseline signals and seeding, while humans provide additional oversight and judgment.",
          },
          {
            type: "sub_heading",
            text: "Cold-Start Mitigation",
          },
          {
            type: "paragraph",
            text: "AI-assisted voting addresses the cold-start problem inherent in new content platforms. When a bot run or external scheduler picks up newly submitted content, automated strategies can seed an initial quality signal before many human participants engage. This creates early activity and provides a focal point for human voters to agree or disagree with, accelerating convergence toward accurate ratings without giving bots protocol-level privileges.",
          },
        ],
      },
      {
        heading: "SDK, MCP & Reference Stack",
        blocks: [
          {
            type: "paragraph",
            text: "The current reference implementation includes integration surfaces around the core contracts. These services are not consensus-critical, but they make the public protocol easier to read, operate, and automate.",
          },
          {
            type: "bullets",
            items: [
              "SDK: @curyo/sdk provides hosted read helpers, vote transaction payload builders, and frontend attribution helpers while staying wallet-agnostic.",
              "MCP: the hosted MCP service exposes Ponder-backed structured reads plus a narrow authenticated write surface for common actions such as vote, submit, claim reward, and claim frontend fee. Write-capable sessions are scoped and wallet-bound rather than generic contract passthroughs.",
              "Operator stack: the monorepo includes the Next.js app, Ponder/Postgres API, keeper service, bot CLI, SDK, MCP server, shared contract metadata, and Solidity contracts. Operators can self-host these pieces or use the hosted endpoints where available.",
            ],
          },
        ],
      },
      {
        heading: "Future Directions",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo's architecture enables several extensions at the intersection of AI and decentralized curation:",
          },
          {
            type: "bullets",
            items: [
              "Cross-platform quality oracle  -- On-chain content ratings can serve as an oracle for other protocols and platforms, creating a shared quality layer across the decentralized web.",
              "Expertise-weighted reputation  -- Domain-specific reputation multipliers could allow voters with demonstrated accuracy in specific categories to earn additional influence, improving signal quality in specialized domains.",
              "Content provenance integration  -- Combining Curyo ratings with content provenance standards (C2PA) would create a two-layered trust system: provenance verifies origin, stake-weighted curation verifies quality.",
              "Advanced AI strategies  -- The pluggable strategy interface supports increasingly sophisticated approaches, from API-based lookups to LLM-driven content analysis. The parimutuel mechanism ensures that only strategies producing accurate ratings survive long-term.",
            ],
          },
        ],
      },
    ],
  },

  // ── 7. Known Limitations ──
  {
    title: "Known Limitations",
    lead: "Transparency about design trade-offs, residual risks, and areas for improvement.",
    subsections: [
      {
        heading: "drand Network Dependency",
        blocks: [
          {
            type: "paragraph",
            text: "tlock encryption relies on the drand randomness beacon network to produce the decryption key after each epoch ends. If the drand network experiences downtime, newly committed votes cannot be revealed until drand resumes. In practice, drand operates across a globally distributed set of nodes (the League of Entropy) and has maintained high availability since 2019. Additionally, any party who already knows the plaintext `(isUp, salt)` for a commit can manually call revealVoteByCommitKey() once the epoch ends; connected users can do this from the fallback UI. Rounds are not cancelled due to drand downtime  -- they simply wait for reveals and settle once conditions are met.",
          },
        ],
      },
      {
        heading: "tlock Reveal Burden",
        blocks: [
          {
            type: "paragraph",
            text: "Although the keeper reveals votes automatically in the background, the protocol-level reveal function can also be called directly by a voter who knows the plaintext `(isUp, salt)` for their commit. The current default UX remains keeper-driven automatic reveal, but the production UI now exposes a small fallback page for connected users. That page decrypts the on-chain ciphertext locally after epoch end rather than persisting reveal secrets in browser storage by default, because long-lived localStorage copies would increase the blast radius of any frontend XSS bug. The keeper-assisted/self-reveal model still relies on off-chain drand decryption and stanza checks; zk proofs would be the future path if Curyo wants to eliminate that residual trust gap.",
          },
        ],
      },
      {
        heading: "Consensus Subsidy Pool",
        blocks: [
          {
            type: "paragraph",
            text: "The parimutuel reward structure distributes the losing pool to winners. When all voters vote in the same direction (one-sided round), the losing pool is zero and no standard parimutuel rewards are distributed. Without mitigation, this creates a perverse incentive: no reason to vote on obviously good or bad content, and coordinated groups could benefit from manufacturing dissent by having one member vote against the majority to create a losing pool.",
          },
          {
            type: "paragraph",
            text: "The consensus subsidy pool solves this. It is pre-funded with 4,000,000 cREP from the treasury allocation and continuously replenished by 5% of every losing pool from two-sided rounds. When a one-sided round settles (all votes in the same direction), the contract distributes a subsidy from this reserve equal to 5% of the round's total stake, capped at 50 cREP per round and by the reserve balance.",
          },
          {
            type: "paragraph",
            text: "The subsidy formula is:",
          },
          {
            type: "formula",
            latex:
              "\\mathrm{subsidy} = \\min\\left(\\mathrm{reserveBalance},\\; \\mathrm{totalStake} \\times 0.05\\right)",
          },
          {
            type: "paragraph",
            text: "This subsidy is split between voters (~89%) and the content submitter (~11%), using the same 82:10 ratio as normal round rewards, and distributed proportionally by epoch-weighted effective stake within each group. Since all voters are on the winning side, every voter receives a share. The mechanism is self-sustaining: contentious rounds -- where parimutuel rewards function normally -- generate surplus that funds consensus rounds. Every two-sided round with L cREP in its losing pool contributes 0.05L to the reserve, which can fund approximately one one-sided round of equivalent total stake. The 4M initial pre-fund provides runway during early adoption when two-sided rounds may be infrequent.",
          },
          {
            type: "paragraph",
            text: "Consensus subsidy rewards are intentionally lower than contentious-round rewards (approximately 10:1 ratio), preserving the incentive to vote on genuinely contentious content while making consensus curation non-zero.",
          },
        ],
      },
      {
        heading: "Configuration Change Timing",
        blocks: [
          {
            type: "paragraph",
            text: "Governance can change round parameters, reveal grace, drand metadata, rating configuration, and submitter slash configuration through the standard proposal process. Round, drand, and rating changes apply to new rounds only: each round snapshots configuration at creation time, so in-progress rounds keep the rules they started with. Submitter slash settings are snapshotted per content submission.",
          },
        ],
      },
      {
        heading: "Settlement External Dependencies",
        blocks: [
          {
            type: "paragraph",
            text: "Round settlement interacts with external contracts (ParticipationPool, FrontendRegistry, CategoryRegistry) using fail-soft wrappers for non-critical side effects. If one of these external calls reverts, settlement can continue while skipping that side effect, preventing total settlement blockage at the cost of temporarily deferred accounting or payouts for that component.",
          },
        ],
      },
      {
        heading: "Identity Verification Scope",
        blocks: [
          {
            type: "paragraph",
            text: "Document-based identity verification via Self.xyz provides strong Sybil resistance, but it still excludes people who lack supported documents or cannot complete the verification flow. The system has no documented appeal mechanism for false rejections, and recovery from a compromised or offline Self.xyz service is not described here. These are inherent trade-offs of document-gated identity systems.",
          },
        ],
      },
    ],
  },

  // ── 8. Rating Research Basis ──
  {
    title: "Rating Research Basis",
    lead: "Research that shaped the redesigned score-relative rating model.",
    subsections: [
      {
        heading: "Why This Rating Design",
        blocks: [
          {
            type: "paragraph",
            text: "The redesigned rating system is grounded in a few complementary research threads. Anchoring and reference-dependence research shows that visible scores influence later judgments, which is why the protocol now treats the displayed round score as a canonical reference point rather than as passive UI context. Comparative-judgment models such as Thurstone and Bradley-Terry motivate interpreting each vote as a noisy comparison between latent content quality and that displayed score. Dynamic-rating work such as Glicko and TrueSkill motivates tracking confidence separately from the point estimate so stable histories become harder to move while contradictory evidence can still reopen uncertainty. Reputation-system and social-influence research further motivate conservative slashing, minimum-evidence thresholds, and keeping visible-score manipulation in scope as a security concern.",
          },
          {
            type: "bullets",
            items: [
              "Amos Tversky and Daniel Kahneman, Judgment under Uncertainty: Heuristics and Biases (1974) -- https://doi.org/10.1126/science.185.4157.1124",
              "Daniel Kahneman and Amos Tversky, Prospect Theory: An Analysis of Decision under Risk (1979) -- https://www.jstor.org/stable/1914185",
              "L. L. Thurstone, A Law of Comparative Judgment (1927) -- https://doi.org/10.1037/h0070288",
              "R. A. Bradley and M. E. Terry, Rank Analysis of Incomplete Block Designs (1952) -- https://doi.org/10.2307/2334029",
              "Mark E. Glickman, Parameter Estimation in Large Dynamic Paired Comparison Experiments (1999) -- https://www.glicko.net/research/glicko.pdf",
              "Ralf Herbrich, Tom Minka, and Thore Graepel, TrueSkill (2006) -- https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system-2/",
              "Audun Jøsang and Roslan Ismail, The Beta Reputation System (2002) -- https://sites.cc.gatech.edu/fac/Charles.Isbell/classes/reading/papers/josang/JI2002-Bled.pdf",
              "Matthew J. Salganik, Peter Sheridan Dodds, and Duncan J. Watts, Experimental Study of Inequality and Unpredictability in an Artificial Cultural Market (2006) -- https://doi.org/10.1126/science.1121066",
              "Lev Muchnik, Sinan Aral, and Sean J. Taylor, Social Influence Bias: A Randomized Experiment (2013) -- https://doi.org/10.1126/science.1240466",
              "Lawrence D. Brown, T. Tony Cai, and Anirban DasGupta, Interval Estimation for a Binomial Proportion (2001) -- https://doi.org/10.1214/ss/1009213286",
              "Alan Agresti and Brent A. Coull, Approximate Is Better than Exact for Interval Estimation of Binomial Proportions (1998) -- https://doi.org/10.1080/00031305.1998.10480550",
            ],
          },
        ],
      },
    ],
  },
];
