/**
 * Whitepaper content extracted from the Curyo documentation.
 * Sections: Introduction, How It Works, tlock Commit-Reveal Voting, Tokenomics, Governance.
 */

export type TableData = { headers: string[]; rows: string[][] };

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "sub_heading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "table"; data: TableData }
  | { type: "formula"; latex: string };

export interface Subsection {
  heading: string;
  blocks: ContentBlock[];
}

export interface Section {
  title: string;
  lead: string;
  subsections: Subsection[];
}

export const META = {
  title: "Curyo",
  subtitle: "The Reputation Game for the Age of AI",
  author: "AI",
  version: "0.1",
  date: "February 2026",
};

export const EXECUTIVE_SUMMARY: ContentBlock[] = [
  {
    type: "paragraph",
    text: "Generative AI has collapsed the cost of producing content to near zero, flooding the web with low-effort material that is often indistinguishable from human-created work. Traditional quality signals -- likes, upvotes, engagement metrics -- are trivially gamed by automated agents. Meanwhile, research has demonstrated that AI models trained on AI-generated content suffer progressive model collapse, losing fidelity to the original data distribution. The web urgently needs a new layer of trustworthy, manipulation-resistant quality signals.",
  },
  {
    type: "paragraph",
    text: "Curyo is a decentralized content curation protocol that replaces passive engagement metrics with stake-weighted prediction games. Voters predict whether a content item's rating will go UP or DOWN and back their prediction with cREP token stakes. Votes are encrypted via tlock (time-lock encryption) and hidden until each 1-hour epoch ends, preventing herding. After the epoch, votes are automatically revealed by the keeper. The side with the larger epoch-weighted stake wins -- early (blind) voters earn full reward weight, while later voters who saw epoch-1 results earn 25% weight, creating a 4:1 incentive to vote early.",
  },
  {
    type: "paragraph",
    text: "Sybil resistance is enforced through Voter ID NFTs -- soulbound tokens tied to verified human identities via zero-knowledge passport verification. Each person can hold exactly one Voter ID, capping their influence regardless of how many wallets they control. This makes systematic manipulation expensive relative to the signal produced.",
  },
  {
    type: "paragraph",
    text: "A core design decision is that all rating data lives on-chain as a permanent, permissionless data layer. Every vote, stake amount, round outcome, and resulting content rating is publicly accessible without API restrictions or gatekeepers. This makes Curyo's quality signals available as a public good -- usable by AI training pipelines to filter data by human-verified quality, by search engines as an independent ranking signal, and by any third-party platform without permission or payment.",
  },
  {
    type: "paragraph",
    text: "Curyo also incorporates AI as a first-class participant through automated voting bots with pluggable rating strategies. Bots call the same commitVote() function as human voters and are transparent participants in the curation game. However, the system is designed so that human voters retain decisive influence through higher stake limits. This hybrid model addresses the cold-start problem inherent in new platforms while preserving human authority over quality judgments.",
  },
  {
    type: "paragraph",
    text: "This paper describes the protocol's mechanisms in detail: the tlock commit-reveal voting flow, epoch-weighted reward distribution, parimutuel stake settlement, tokenomics, on-chain governance, and the role of AI-assisted curation in building trustworthy quality infrastructure for the age of AI.",
  },
];

export const SECTIONS: Section[] = [
  // ── 1. Introduction ──
  {
    title: "Introduction",
    lead: "The Reputation Game for the Age of AI.",
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
            text: "Curyo replaces passive likes with prediction games. Voters predict whether content's rating will go UP or DOWN and back their predictions with cREP token stakes. The majority side wins and the losing side's stakes are distributed to the winners.",
          },
        ],
      },
      {
        heading: "Key Principles",
        blocks: [
          {
            type: "bullets",
            items: [
              "Skin in the Game  -- Every vote requires a token stake, aligning incentives. Points come from the losing side's stakes.",
              "Voter ID (Sybil Resistance)  -- Each verified human gets one soulbound Voter ID NFT, limiting stake to 100 cREP per content per round.",
              "Per-Content Rounds  -- Each content item has independent voting rounds. Votes are encrypted via tlock and hidden until each 1-hour epoch ends. After each epoch the keeper reveals votes automatically. Settlement occurs after at least 3 votes are revealed and the epoch delay has passed.",
              "Contributor Rewards  -- Content submitters receive 10%, category submitters 1%, and frontend operators 1% of the losing pool.",
            ],
          },
        ],
      },
      {
        heading: "Voting Flow",
        blocks: [
          {
            type: "paragraph",
            text: "Voters predict whether content's rating will go UP or DOWN and back their prediction with a cREP stake. Votes are encrypted with tlock and hidden until the epoch ends, preventing herding. Voting early in the epoch earns full reward weight (Tier 1), while voting after seeing epoch-1 results earns only 25% weight (Tier 2).",
          },
          {
            type: "ordered",
            items: [
              "Commit: Choose UP or DOWN, select stake (1-100 cREP per Voter ID). Call commitVote(contentId, commitHash, ciphertext, stakeAmount, frontendAddress). The vote direction is encrypted with tlock -- hidden until the epoch ends.",
              "Accumulate: More voters commit during the 1-hour epoch. No one can see anyone else's vote direction until the epoch ends.",
              "Reveal: After the epoch ends, the keeper automatically decrypts and reveals all votes. The rating updates based on the revealed votes.",
              "Settle: Once at least 3 votes are revealed and the settlement delay has passed, anyone can call settleRound(). The side with the larger epoch-weighted stake wins.",
              "Claim: Winners receive their original stake back plus an epoch-weighted share of the losing pool (Tier 1 = 4x reward per cREP vs Tier 2). One-sided rounds receive a consensus subsidy.",
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
            text: "Every content item has a rating from 0 to 100, starting at 50. The rating updates at settlement based on revealed votes, computed as: rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + b_r), where b_r = 50 cREP is a smoothing parameter that ensures individual votes have diminishing impact as total stake grows. After settlement, the rating carries over to the next round.",
          },
          {
            type: "paragraph",
            text: 'Each category (platform) has a ranking question set by its creator -- for example, "Is this content good enough to score above 75 out of 100?". When you vote UP or DOWN, you are answering this question for the current content.',
          },
          {
            type: "paragraph",
            text: "Illegal content, content that doesn't load, or content with an incorrect description should always be downvoted, regardless of the ranking question. Content that falls below a rating of 25 after its grace period results in the submitter's stake being slashed.",
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
            text: "To prevent manipulation through multiple wallets (sybil attacks), Curyo uses Voter ID NFTs  -- soulbound tokens tied to verified human identities via Self.xyz passport verification.",
          },
          {
            type: "bullets",
            items: [
              "One ID per person: Each passport can only mint one Voter ID NFT, ever.",
              "Non-transferable: Voter IDs are soulbound  -- they cannot be transferred or sold.",
              "Stake limits per ID: Each Voter ID can stake a maximum of 100 cREP per content per round, regardless of how many wallets they control.",
              "Privacy-preserving: Self.xyz uses zero-knowledge proofs. Only the passport's validity is verified; no personal data is stored on-chain.",
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
            text: "Curyo uses tlock commit-reveal to prevent herding. Votes are encrypted to an epoch-end timestamp using the drand randomness beacon, so no one can see anyone else's direction until the epoch ends. Each 1-hour epoch defines a reward tier: Tier 1 (first epoch, blind) earns 100% weight; Tier 2+ (subsequent epochs, informed) earns 25% weight.",
          },
          {
            type: "ordered",
            items: [
              "Commit (any time during the round): Choose UP or DOWN. The UI encrypts your direction and stake with tlock (commitVote(contentId, commitHash, ciphertext, stakeAmount, frontendAddress)). Your stake is locked; your direction is hidden on-chain until the epoch ends.",
              "Epoch ends (every 1 hour): The drand beacon publishes a randomness value. The keeper fetches it and calls revealVoteByCommitKey() for each unrevealed commit, decrypting the direction on-chain.",
              "Settlement: After at least 3 votes are revealed and one full epoch has elapsed since the third reveal (settlement delay), anyone may call settleRound(contentId, roundId). The side with the larger epoch-weighted stake wins. The content rating updates based on revealed raw stakes.",
              "Claim: Winners call claimReward(contentId, roundId) to receive their original stake plus an epoch-weighted share of the losing pool. Losers' stakes are distributed. Content submitters may claim a separate submitter reward.",
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
                  "Stake locked, direction hidden (Tier 1 = 100% weight, Tier 2 = 25% weight)",
                  "Instant",
                  "None  -- wait for epoch to end",
                ],
                [
                  "Epoch ended",
                  "Keeper reveals votes automatically via drand",
                  "~1 hour per epoch",
                  "None  -- keeper handles reveal",
                ],
                [
                  "Settlement delay",
                  "Waiting one epoch after minVoters threshold reached",
                  "~1 hour",
                  "None  -- anyone can call settleRound() after delay",
                ],
                ["Settled", "Rewards calculated and claimable", "--", "Winners claim rewards"],
                [
                  "Cancelled",
                  "Round expired without sufficient participation  -- all stakes refunded",
                  "--",
                  "Claim refund",
                ],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Settlement requires: (1) at least 3 voters revealed (minVoters threshold), and (2) one full epoch delay elapsed since the threshold was reached. Anyone may call settleRound(contentId, roundId) once these conditions are met. A lightweight keeper service handles both reveal and settlement automatically. Winners receive their original stake plus an epoch-weighted share of the losing pool.",
          },
        ],
      },
      {
        heading: "Reward Distribution",
        blocks: [
          {
            type: "paragraph",
            text: "The losing pool is split as follows:",
          },
          {
            type: "table",
            data: {
              headers: ["Recipient", "Share"],
              rows: [
                ["Winning voters (content-specific)", "82%"],
                ["Content submitter", "10%"],
                ["Consensus subsidy reserve", "5%"],
                ["Frontend operators", "1%"],
                ["Category submitter", "1%"],
                ["Treasury", "1%"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The 82% voter share goes to a content-specific pool, distributed proportionally by epoch-weighted effective stake to winning voters on that content. Tier 1 voters (first epoch, blind) have full weight (effectiveStake = rawStake). Tier 2+ voters (subsequent epochs, saw results) have 25% weight (effectiveStake = rawStake * 0.25). Because each content item has independent rounds, rewards are calculated and claimable immediately after a round settles  -- no waiting for other content. The 5% consensus subsidy share accumulates in a reserve that funds rewards for one-sided rounds (see Consensus Subsidy Pool).",
          },
        ],
      },
      {
        heading: "Formal Incentive Analysis",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo's parimutuel voting mechanism can be modeled as a game. Let N voters each choose a direction d_i in {UP, DOWN}, a stake s_i in [1, 100], and an epoch tier t_i in {1, 2+}. Each voter has an epoch-weighted effective stake: e_i = s_i when t_i = 1 (Tier 1, blind epoch), or e_i = s_i * 0.25 when t_i >= 2 (Tier 2+, saw prior results). The win condition uses weighted pools: upWins iff sum(e_i : d_i = UP) > sum(e_i : d_i = DOWN). Let W_e denote the total effective stake on the winning side and L the total raw stake on the losing side. The voter pool receives 82% of the losing stake, distributed proportionally by e_i / W_e.",
          },
          {
            type: "sub_heading",
            text: "Payoff Functions",
          },
          {
            type: "paragraph",
            text: "For voter i on the winning side:",
          },
          {
            type: "formula",
            latex: "P_i^{\\mathrm{win}} = s_i + \\frac{e_i}{W_e} \\times 0.82 \\, L",
          },
          {
            type: "paragraph",
            text: "where e_i is the epoch-weighted effective stake (e_i = s_i for Tier 1, e_i = 0.25 * s_i for Tier 2+) and W_e is the sum of effective stakes on the winning side. This means Tier 1 voters earn 4x more reward per cREP staked compared to Tier 2+ voters with the same raw stake.",
          },
          {
            type: "paragraph",
            text: "For voter i on the losing side:",
          },
          {
            type: "formula",
            latex: "P_i^{\\mathrm{lose}} = -s_i",
          },
          {
            type: "paragraph",
            text: "The expected payoff for a Tier 1 voter simplifies to:",
          },
          {
            type: "formula",
            latex:
              "E[P_i^{T1}] = s_i \\left[ P(\\mathrm{win}) \\left(1 + \\frac{0.82 \\, L}{W_e}\\right) - P(\\mathrm{lose}) \\right]",
          },
          {
            type: "sub_heading",
            text: "Proposition (Honest Voting Equilibrium)",
          },
          {
            type: "paragraph",
            text: "If each voter has a private signal with accuracy p > 0.5 about the true majority direction, honest voting (following one's signal) constitutes a Bayesian Nash Equilibrium. The tlock scheme enforces that votes committed before epoch end are cryptographically hidden from other voters, ensuring genuine independence. Deviating from honest voting moves a voter from the expected-winning pool to the expected-losing pool, sacrificing their full stake. For p > 0.5, the expected gain from honest voting dominates any deviation. The epoch-weight penalty (4:1 ratio) further strengthens this equilibrium by rewarding early honest voters disproportionately, making bandwagoning (waiting to see epoch-1 results) costly in reward terms.",
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
            latex: "P(\\mathrm{win}) > \\frac{1}{1 + 0.82 \\cdot L/W_e}",
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
            text: "The content rating updates at settlement based on revealed raw stakes: rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + b_r), where b_r = 50 cREP is the rating smoothing parameter. Raw stakes (not epoch-weighted) are used for the rating to accurately reflect the crowd opinion. The win condition uses epoch-weighted stakes to reward early blind voters. In equilibrium, content ratings converge to the community's aggregate quality assessment as the number of rounds grows.",
          },
        ],
      },
      {
        heading: "Empirical Verification",
        blocks: [
          {
            type: "paragraph",
            text: "The theoretical incentive properties are validated by a 46-scenario Forge test suite covering game theory, participation economics, governance capture, and round lifecycle edge cases.",
          },
          {
            type: "sub_heading",
            text: "Game Theory Verification",
          },
          {
            type: "paragraph",
            text: "Numerical tests confirm honest voting profitability: in a 2-vs-1 split with 50 cREP stakes (all Tier 1), each winner receives their stake plus a proportional share of the loser's 41 cREP (82% of 50 cREP) while the loser forfeits their stake. Epoch-weight verification: with 1 Tier-1 voter and 4 Tier-2 voters on the winning side (each 50 cREP), the Tier-1 voter receives approximately 4x the reward per cREP compared to each Tier-2 voter, confirming the 4:1 weight ratio. The epoch-weighted win condition test: 1 Tier-1 DOWN voter (100 cREP, effectiveStake 100) beats 3 Tier-2 UP voters (100 cREP each, effectiveStake 25 each = 75 total) -- DOWN wins despite raw majority being UP.",
          },
          {
            type: "sub_heading",
            text: "Participation Pool Sustainability",
          },
          {
            type: "paragraph",
            text: "Under modeled usage of 1,000 votes per day at an average stake of 50 cREP, the participation pool (34M cREP) sustains tier-0 rewards (90%) for approximately 44 days before the first halving. The halving schedule then extends the pool's effective lifetime: the pool supports over 1 million votes and survives well beyond one year of continuous operation across its first four tiers. Worst-case drainage (200 max-stake voters per round) exhausts tier-0 in approximately 111 rounds, but the halving mechanism ensures graceful degradation rather than abrupt depletion. A 256-run fuzz test confirms the conservation invariant: distributed tokens plus remaining balance always equals the initial deposit.",
          },
          {
            type: "sub_heading",
            text: "Governance Resistance",
          },
          {
            type: "paragraph",
            text: "The dynamic quorum mechanism (4% of circulating supply, floored at 10,000 cREP) resists early capture: among the first 1,000 faucet claimants (1,000 cREP each), a minimum coalition of 40 users (4%) is required to meet quorum. The 10,000 cREP floor prevents capture when fewer than 250,000 cREP are in circulation. As the platform matures and token pools drain into circulation, quorum requirements scale proportionally  -- at 50M circulating, quorum reaches 2M cREP. The 7-day governance lock prevents vote-then-sell attacks while still allowing content voting during the lock period.",
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
            text: 'This dynamic makes the design of each category\'s ranking question critical. Well-defined, verifiable questions anchor voter judgment and reduce ambiguity. A question like "Is this factually accurate?" produces more stable equilibria than "Is this interesting?" because the former admits shared evidence while the latter invites pure preference divergence. Category creators shape equilibrium quality by choosing precise questions that guide honest evaluation.',
          },
          {
            type: "paragraph",
            text: "Despite the multiplicity of equilibria in abstract game theory (contrarian voting or random voting are also self-consistent), the honest voting equilibrium from the formal analysis serves as the focal (Schelling) point. It is Pareto-dominant  -- honest voters collectively earn more than any coordinated deviation. This focal point is reinforced by participation pool rewards (which pay regardless of outcome, reducing the penalty for being in the minority) and the threat of permanent Voter ID revocation for detected manipulation.",
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
            text: "Each content item has independent voting rounds. A round begins when the first vote is committed. Voters commit encrypted votes at any time; the direction is hidden until the epoch ends. Each 1-hour period is an epoch -- commitments made within the first epoch are Tier 1 (100% reward weight), while later commitments are Tier 2 (25% weight).",
          },
          {
            type: "paragraph",
            text: "The epoch-based settlement eliminates strategic delay. In systems with immediate public votes, sophisticated voters wait to see the tally before committing. With tlock commit-reveal, waiting to see epoch-1 results costs 4x in reward weight. The dominant strategy is to vote early (Tier 1), based on genuine belief, rather than wait to copy the majority (Tier 2).",
          },
          {
            type: "paragraph",
            text: "Settlement conditions: (1) at least 3 votes revealed (minVoters), and (2) one full epoch has elapsed since the minVoters threshold was reached. This settlement delay gives remaining voters a chance to reveal before the round closes. Rounds that expire (7 days) without meeting minVoters are cancelled and all stakes refunded.",
          },
        ],
      },
      {
        heading: "Content Rating",
        blocks: [
          {
            type: "paragraph",
            text: "Each content item has a rating from 0 to 100 (starting at 50). The rating updates at settlement based on revealed votes, computed as: rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + b_r), where b_r = 50 cREP is the rating smoothing parameter. Raw stakes (not epoch-weighted) are used for the rating formula, so the rating reflects the true crowd opinion. When a round settles, the final rating carries over to the next round. The rating converges over many rounds to the community's aggregate quality assessment. Winners receive their original stake back plus an epoch-weighted share of the losing pool.",
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
              "Revival: Dormant content can be revived by staking 5 cREP. This resets the 30-day activity timer. Each content item can be revived up to 2 times.",
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
            text: "Curyo uses tlock (time-lock encryption based on the drand randomness beacon) to achieve commit-reveal without the reveal burden. When a voter commits, the direction is encrypted to a future timestamp -- the end of the current 1-hour epoch. After the epoch ends, the drand beacon publishes a verifiable random value that enables decryption. The keeper fetches the beacon and calls revealVoteByCommitKey() on-chain, automatically decrypting all unrevealed votes. No voter needs to take any additional action after their initial commit.",
          },
        ],
      },
      {
        heading: "Epoch-Weighted Rewards",
        blocks: [
          {
            type: "paragraph",
            text: "Each 1-hour epoch defines a reward tier. Voters who commit during the first epoch (before any results are visible) earn Tier 1 weight (100%). Voters who commit in subsequent epochs (after seeing epoch-1 results) earn Tier 2 weight (25%). This 4:1 ratio creates a strong incentive to vote early and honestly, before any herding signal exists.",
          },
          {
            type: "table",
            data: {
              headers: ["Tier", "Epoch", "Reward Weight", "Information Available"],
              rows: [
                ["Tier 1", "Epoch 1 (0 to 1 hour)", "100%", "None  -- all votes hidden by tlock"],
                ["Tier 2", "Epoch 2+ (1+ hours)", "25%", "Epoch 1 results visible (directions + stakes revealed)"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The epoch-weighted effective stake is used for both the win condition and reward distribution:",
          },
          {
            type: "formula",
            latex:
              "e_i = \\begin{cases} s_i & \\text{if Tier 1 (epoch 1)} \\\\ 0.25 \\, s_i & \\text{if Tier 2+ (epoch 2+)} \\end{cases}",
          },
          {
            type: "paragraph",
            text: "The winner is determined by comparing total epoch-weighted stakes: upWins iff sum(e_i : d_i = UP) > sum(e_i : d_i = DOWN). Rewards are distributed proportionally to e_i / W_e among winners, where W_e is the total effective stake on the winning side.",
          },
          {
            type: "table",
            data: {
              headers: ["Voter", "Direction", "Stake", "Tier", "Effective Stake", "Reward share (UP wins)"],
              rows: [
                ["Alice (Tier 1)", "UP", "50 cREP", "1", "50 cREP", "50 / W_e of 82% losing pool"],
                ["Bob (Tier 1)", "UP", "50 cREP", "1", "50 cREP", "50 / W_e of 82% losing pool"],
                ["Carol (Tier 2)", "UP", "50 cREP", "2", "12.5 cREP", "12.5 / W_e of 82% losing pool"],
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
            text: "Settlement requires two conditions: (1) at least 3 votes are revealed (minVoters), and (2) one full epoch has elapsed since the minVoters threshold was reached (settlement delay). This ensures late voters have time to reveal before the round closes.",
          },
          {
            type: "table",
            data: {
              headers: ["Parameter", "Value", "Effect"],
              rows: [
                ["epochDuration", "1 hour", "Duration of each reward tier; also the settlement delay"],
                ["minVoters", "3", "Minimum revealed votes required for settlement"],
                ["maxDuration", "7 days", "Maximum round lifetime  -- expired rounds are cancelled"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Settlement is permissionless: anyone may call settleRound(contentId, roundId) once conditions are met. The keeper service handles settlement automatically. The content rating updates at settlement based on raw revealed stakes (not epoch-weighted), so the rating accurately reflects crowd opinion regardless of when voters committed.",
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
            text: "One-sided rounds (only UP or only DOWN votes revealed) settle as tied/consensus. All stakes are returned, and voters receive a small reward from the consensus subsidy reserve -- 5% of the total stake (capped at 50 cREP per round), split between voters (~89%) and the content submitter (~11%).",
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
              "Economic anti-herding: Tier 2 voters (who saw epoch-1 results) earn only 25% reward weight per cREP. Herding is economically unattractive regardless of information advantage.",
              "Epoch-weighted win condition: A flood of late Tier-2 voters cannot flip a Tier-1 consensus  -- 3 Tier-2 voters at 100 cREP each (effective stake 25 each = 75 total) cannot override 1 Tier-1 voter at 100 cREP (effective stake 100). Even 4 Tier-2 voters at 100 cREP each (effective 100 total) only produce a tie.",
              "Keeper is not trusted: The reveal step (decrypting and calling revealVoteByCommitKey) is permissionless  -- any party can call it. The keeper is a convenience, not a gatekeeper.",
              "Locked positions: Voters cannot exit before settlement. Unrevealed votes at settlement are treated as forfeited (losers) or refunded (current epoch), preventing selective reveal attacks.",
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
            text: "Rounds require a minimum of 3 voters (minVoters) to settle as contested. With fewer than 3 revealed votes after 7 days, the round is cancelled and all stakes are refunded. If all voters vote in the same direction, the round settles as a consensus and voters receive a subsidy payout.",
          },
          {
            type: "sub_heading",
            text: "What if the Keeper Fails to Reveal?",
          },
          {
            type: "paragraph",
            text: "The reveal step is permissionless -- anyone can call revealVoteByCommitKey() once the epoch ends. The drand beacon is a decentralized network with high availability. Even if the keeper is down, any other participant (another keeper, the voter themselves, a third party) can perform the reveal. The only requirement is knowledge of the voter's direction and salt, which the frontend stores client-side after the commit.",
          },
          {
            type: "sub_heading",
            text: "Can a Vote Direction Be Guessed?",
          },
          {
            type: "paragraph",
            text: "The on-chain commitment is commitHash = keccak256(isUp, salt, contentId) where salt is a 32-byte random value chosen by the voter. Guessing the direction requires finding a preimage of keccak256, which is computationally infeasible. The tlock ciphertext additionally encrypts the direction to the epoch-end timestamp, providing a second layer of confidentiality.",
          },
          {
            type: "sub_heading",
            text: "What Happens to Unrevealed Votes at Settlement?",
          },
          {
            type: "paragraph",
            text: "Votes whose revealableAfter timestamp falls before the settlement time are considered forfeited  -- the voter failed to arrange for reveal. Their stake goes to the winning side's pool. Votes whose revealableAfter is after the settlement time (committed in the last epoch) are refunded in full, as they could not yet be revealed.",
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
            text: "cREP has no monetary value and is not designed as an investment or financial instrument. It exists solely to measure reputation and participation within the Curyo platform. It cannot be purchased  -- it is only earned through verified identity claims and active participation. There is no team, no company, and no central entity behind the token. Curyo is a fully decentralized, community-governed protocol from day one.",
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
                ["Max Supply", "100,000,000 cREP"],
                ["Decimals", "6"],
                ["Type", "Reputation token (non-financial)"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Fixed supply of 100 million tokens. Fair launch  -- no pre-mine, no VC allocation, no team tokens, and no token sale of any kind. All tokens are distributed exclusively through six on-chain pools.",
          },
          {
            type: "bullets",
            items: [
              "Reputation, not money. cREP represents your standing in the community. It is staked to curate and vote, not traded for profit.",
              "No issuer, no sale. There is no company, foundation, or team that issues, sells, or controls cREP. Distribution is handled entirely by on-chain protocol contracts.",
              "Decentralized from genesis. All protocol parameters are governed on-chain by token holders. After deployment finalization (role renounce ceremony), no privileged admin keys remain.",
              "Sybil-resistant distribution. Tokens are claimed once per verified human via passport verification, preventing concentration and ensuring broad distribution.",
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
              rows: [
                [
                  "Faucet Pool",
                  "51,899,900 cREP",
                  "One-time claims for verified humans (10,000 to 1 cREP per claim, tiered by adoption, serves up to ~41M users without referrals)",
                ],
                [
                  "Participation Pool",
                  "34,000,000 cREP",
                  "Bootstraps early adoption  -- immediate submitter bonuses + voter rewards claimable after round settlement (rate halving schedule)",
                ],
                [
                  "Consensus Subsidy",
                  "4,000,000 cREP",
                  "Pre-funded reserve for one-sided round rewards, replenished by 5% of each losing pool",
                ],
                [
                  "Treasury",
                  "10,000,000 cREP",
                  "Governance-controlled tokens for grants, whistleblower rewards, and protocol development",
                ],
                [
                  "Keeper Reward Pool",
                  "100,000 cREP",
                  "Flat per-operation rewards for keeper housekeeping (settle, cancel), funded separately from user stakes",
                ],
                ["Category Registry", "100 cREP", "Initial reserve for the category proposal mechanism"],
              ],
            },
          },
        ],
      },
      {
        heading: "HumanFaucet",
        blocks: [
          {
            type: "paragraph",
            text: "Primary distribution via Self.xyz passport verification with age verification (18+). Each passport can claim once. Claim amounts decrease as more users join  -- rewarding early adopters who bootstrap the platform with content.",
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
            text: "The ~51.9M faucet pool serves up to ~41 million users without referrals (~15 million with full referral usage). Referral bonuses scale proportionally at 50% of the claim amount. The first 10 Genesis claimants receive 10,000 cREP each to bootstrap the platform from day one. As the platform grows and becomes more populated, later claimants need fewer tokens since there is already content to engage with.",
          },
        ],
      },
      {
        heading: "Participation Pool",
        blocks: [
          {
            type: "paragraph",
            text: "The participation pool solves the cold start problem. When the platform is new and vote stakes are small, round rewards alone may not be enough to attract voters and submitters. The participation pool pays proportional bonuses based on stake amount: submitters receive rewards immediately on content submission, while all voters claim deferred participation rewards after round settlement, regardless of vote outcome.",
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
                ["0", "2,000,000", "2,000,000", "90%", "9 cREP", "90 cREP"],
                ["1", "4,000,000", "6,000,000", "45%", "4.5 cREP", "45 cREP"],
                ["2", "8,000,000", "14,000,000", "22.5%", "2.25 cREP", "22.5 cREP"],
                ["3", "16,000,000", "30,000,000", "11.25%", "1.125 cREP", "11.25 cREP"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Voter participation rewards are distributed when a round settles  -- deferred from vote time to prevent exploitation where attackers could vote, collect immediate participation rewards, and then have rounds cancel without risk. Submitter participation rewards are paid at submission time to bootstrap content supply. The pool is funded with 34M cREP and governed by the same timelock as all other protocol contracts.",
          },
        ],
      },
      {
        heading: "Keeper Network",
        blocks: [
          {
            type: "paragraph",
            text: "Anyone can run a keeper. Keepers are lightweight services that monitor the blockchain for active rounds and perform two tasks: (1) revealing tlock votes after each epoch ends by fetching the drand beacon and calling revealVoteByCommitKey(), and (2) calling settleRound() once the settlement conditions are met (minVoters revealed and one full epoch elapsed since the threshold). Both operations are permissionless  -- any account can call them.",
          },
          {
            type: "paragraph",
            text: "Keepers also perform housekeeping: cancelling expired rounds (rounds that exceed maxDuration without reaching minVoters), and marking dormant content. Since the drand randomness beacon is a public decentralized network, no special keys or trusted dependencies are required  -- the system is fully trustless.",
          },
          {
            type: "paragraph",
            text: "To incentivize keeper operation, the protocol allocates a dedicated 100,000 cREP keeper reward pool, funded separately from user stakes. Keepers earn a flat 0.1 cREP per housekeeping operation (settle, cancel). At this rate, the pool funds up to 1,000,000 operations. Rewards are best-effort: if the pool is depleted, operations still succeed but no reward is paid. The keeper reward amount is governance-configurable.",
          },
        ],
      },
      {
        heading: "Treasury",
        blocks: [
          {
            type: "paragraph",
            text: "Slashed submitter stakes and consensus subsidy contributions flow to the treasury (governance timelock). The treasury also receives a 1% fee from every round settlement. Treasury tokens can only be distributed through governance proposals  -- for grants, whistleblower rewards, and protocol development.",
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
              rows: [
                ["Winning voters (content-specific)", "82%"],
                ["Content submitter", "10%"],
                ["Consensus subsidy reserve", "5%"],
                ["Frontend operators", "1%"],
                ["Category submitters", "1%"],
                ["Treasury", "1%"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The 82% voter share goes to a content-specific pool, distributed proportionally by epoch-weighted effective stake to winning voters on that content. Tier-1 voters (who committed during epoch 1 with no information) earn full weight (100% of their stake), while Tier-2 voters (who committed after epoch-1 results were visible) earn 25% weight. This 4:1 ratio means early voters receive a larger portion of the reward pool per cREP staked. Because each content item has independent rounds that settle on their own timeline, rewards are claimable immediately after settlement  -- no waiting for other content. The 5% consensus subsidy share funds one-sided-round rewards (see Consensus Subsidy Pool). The 1% treasury fee goes to the governance timelock.",
          },
        ],
      },
      {
        heading: "Deferred Participation Rewards",
        blocks: [
          {
            type: "paragraph",
            text: "Voter participation rewards are distributed at round settlement, not at vote time. This design choice eliminates a critical attack vector: if voters received an immediate participation bonus at vote time, it would reduce their at-risk capital. This could create exploitation opportunities for coordinated minorities who could stake on low-liquidity content, collect the participation reward immediately, and profit regardless of outcome.",
          },
          {
            type: "paragraph",
            text: "By deferring voter rewards to settlement, the full vote stake stays at risk until the round completes. Combined with the epoch-weighted reward structure (which penalizes late entrants with 25% weight vs 100% for early voters) and deterministic epoch-based settlement (which prevents strategic timing of entries), the deferred model ensures voter participation rewards flow only to genuine, successful curation activity while submitter bonuses still bootstrap supply at submission time.",
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
                ["Submit content", "10 cREP", "Returned after 4 days if rating stays above 25"],
                ["Register as frontend", "1,000 cREP", "Requires governance approval"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Submitter stakes are slashed (100% to treasury) if content rating drops below 25 after a 24-hour grace period. Stakes are automatically returned after 4 days if not slashed.",
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
            text: "Consider an attacker who acquires K fraudulent verified identities at cost c per identity (passport-grade KYC). Each identity can stake up to 100 cREP per content per round, giving the attacker maximum voting power of K x 100 cREP.",
          },
          {
            type: "sub_heading",
            text: "Profitability Analysis",
          },
          {
            type: "paragraph",
            text: "For the attack to succeed, the attacker must control the majority stake. If L_honest is the honest voters' stake on the losing side, the attacker's total winning payoff (beyond recovering stakes) is 0.82 x L_honest (the 82% voter share of the losing pool). The total cost is K x c (identity acquisition). The attack is profitable only when:",
          },
          {
            type: "formula",
            latex: "K < \\frac{0.82 \\cdot L_{\\mathrm{honest}}}{c}",
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
            text: "The real-world cost of a verified passport identity far exceeds any on-chain equivalent. Even at low assumed identity costs, profitability requires the attacker to control the majority  -- if honest voters collectively outstake the attacker, all K identities lose their entire staked cREP. The attack is negative-sum in expectation against an active honest voter base.",
          },
          {
            type: "sub_heading",
            text: "Permanent Revocation Deterrent",
          },
          {
            type: "paragraph",
            text: "If detected via on-chain pattern analysis (correlated wallet funding, synchronized vote timing, identical stake amounts) and a subsequent governance proposal, all K identities are permanently revoked. The attacker loses not only the current round's stake but all future voting capability across those identities. The expected cost of detection increases with K (more identities produce more on-chain correlation signals), creating a superlinear deterrent:",
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
            text: "Curyo is fully decentralized from day one. There is no team, company, foundation, or central authority making decisions  -- every aspect of the platform is shaped by its community through on-chain governance. Built on OpenZeppelin's Governor contracts, token holders create proposals, vote, and execute approved changes directly on-chain. After deployment finalization (role renounce ceremony), no privileged admin keys or multisigs remain.",
          },
          {
            type: "paragraph",
            text: "Curyo is a reputation token with no monetary value. It is not sold, has no treasury backing, and is not designed as a financial instrument. Governance power comes from earning reputation through verified participation, not from purchasing tokens.",
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
                ["Pending", "Created. Waiting for voting delay (1 day)."],
                ["Active", "Voting open (1 week). Cast: For, Against, or Abstain."],
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
                ["Proposal threshold", "100 cREP"],
                ["Voting delay", "1 day"],
                ["Voting period", "1 week"],
                ["Quorum", "4% of circulating supply (min 10K cREP)"],
                ["Timelock delay", "2 days"],
                ["Governance lock", "7 days (voting power locked after voting or proposing)"],
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
            text: "The following parameters control per-content round-based voting. They are adjustable via governance proposals through the setConfig() function on the RoundVotingEngine contract.",
          },
          {
            type: "table",
            data: {
              headers: ["Parameter", "Default", "Description"],
              rows: [
                [
                  "epochDuration",
                  "1 hour",
                  "Duration of each reward tier; commits in epoch 1 earn 100% weight, later epochs 25%",
                ],
                [
                  "maxDuration",
                  "7 days",
                  "Maximum round lifetime  -- expired rounds are cancelled and stakes refunded",
                ],
                ["minVoters", "3", "Minimum revealed votes required before settlement is allowed"],
                ["maxVoters", "1,000", "Per-round cap on total commits"],
                ["Rating smoothing (b_r)", "50 cREP (hardcoded)", "Controls rating sensitivity to individual votes"],
                ["Vote stake", "1-100 cREP", "Stake range per vote, capped per Voter ID"],
                ["Vote cooldown", "24 hours", "Wait time before voting on the same content again"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The epoch-based settlement mechanism ensures rounds complete within a bounded timeframe. The epochDuration defines the reward tier window (1 hour for full weight) and also the settlement delay after minVoters is reached, giving late voters time to reveal before the round closes. The maxDuration hard cap prevents indefinite rounds. The rating smoothing parameter b_r is hardcoded and controls how responsive the content rating is to individual revealed votes. As the platform grows, governance can adjust the configurable parameters to optimize for the observed voter population.",
          },
        ],
      },
      {
        heading: "Treasury",
        blocks: [
          {
            type: "paragraph",
            text: "The governance treasury is held by the timelock controller and starts with 10M cREP. It grows over time through two primary token inflow sources:",
          },
          {
            type: "bullets",
            items: [
              "1% settlement fee  -- 1% of every losing pool is sent to the treasury when rounds settle.",
              "Slashed submitter stakes  -- when content is flagged for policy violations or receives unfavorable ratings, the submitter's 10 cREP stake is slashed to the treasury.",
            ],
          },
          {
            type: "paragraph",
            text: "Treasury tokens can only be distributed through governance proposals. Token holders propose allocations, the community votes, and after the timelock delay, the transaction is executed on-chain. This ensures transparent, community-controlled distribution of protocol tokens.",
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
              "Revoke Voter IDs  -- governance can permanently revoke the Voter ID NFTs of confirmed colluders, removing their ability to vote on the platform.",
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
              "Sybil resistance  -- 1 person = 1 Voter ID via passport verification (Self.xyz).",
              "Stake caps  -- maximum 100 cREP per content per round limits single-voter influence.",
              "Vote cooldowns  -- 24-hour cooldown prevents rapid re-voting on the same content.",
              "Permanent revocation  -- losing your Voter ID is irreversible and eliminates voting ability.",
            ],
          },
          {
            type: "sub_heading",
            text: "Formal Collusion Model",
          },
          {
            type: "paragraph",
            text: "A coalition of C colluders coordinates to vote in the same direction on target content. Each colluder stakes s_c (up to 100 cREP). Their combined stake is S_C = C x s_c. Let S_H denote honest voters' stake on the opposite side. The coalition wins if S_C > S_H. Coalition profit (beyond recovering stakes) is 0.82 x S_H (the 82% voter share), shared among C members. Per-member profit:",
          },
          {
            type: "formula",
            latex: "\\mathrm{profit\\;per\\;member} = \\frac{0.82 \\cdot S_H}{C}",
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
            latex: "\\frac{0.82 \\cdot S_H}{C} > k",
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
            text: "On-chain signals of collusion include: identical vote timing within the same block or narrow window, correlated stake amounts, shared funding sources traceable via transaction graphs, and repeated same-direction voting on identical content across rounds. The probability of detection P(detect | C) is monotonically increasing in C. Combined with permanent Voter ID revocation, the expected penalty is:",
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
            text: "Quorum is calculated as 4% of circulating supply  -- total supply minus tokens locked in the HumanFaucet, ParticipationPool, and RewardDistributor contracts. This dynamic calculation ensures governance is usable from day one: when only a small number of users have claimed tokens, the quorum scales proportionally to actual circulation rather than the full 100M supply. A minimum floor of 10,000 cREP prevents trivially small quorums in the earliest stages. As the user base grows and more tokens enter circulation, the quorum threshold increases proportionally, requiring increasingly broad consensus.",
          },
          {
            type: "sub_heading",
            text: "No Privileged Keys",
          },
          {
            type: "paragraph",
            text: "After deployment, no admin keys, multisigs, or privileged roles exist. The timelock controller is the sole owner of all protocol contracts, and it can only execute transactions that have passed the full governance lifecycle (proposal, voting, timelock). The proposal threshold is deliberately low (100 cREP) to encourage participation  -- the real protection is the combination of dynamic quorum (4% of circulating supply with a 10K cREP floor), majority vote, and timelock delay, not proposal gating.",
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
              "Economic independence  -- tlock encryption hides votes during epoch 1, eliminating herd signals. Epoch-weighted rewards (4:1 ratio) further penalize late followers, incentivizing genuine early assessment over copying.",
              "Sybil resistance  -- Passport-verified Voter IDs limit each human to one identity with a capped stake per content, preventing bot farms from flooding the signal.",
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
            text: "A foundational design decision in Curyo is the use of a public blockchain as the settlement layer. This ensures that all quality ratings -- including individual vote directions, stake amounts, round outcomes, and resulting content scores -- are inherently public, permissionless, and exportable. No API key, rate limit, or terms-of-service restriction mediates access to the data.",
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
            text: "Curyo incorporates AI as a first-class participant through automated voting bots that use pluggable rating strategies. Each strategy queries an external API to obtain a normalized quality score for submitted content. The bot votes UP or DOWN based on whether the score meets a configurable threshold.",
          },
          {
            type: "paragraph",
            text: "Bots call the same commitVote() function as human voters and participate under the same tlock privacy constraints  -- their vote direction is hidden until the epoch ends, just like human votes. Bots stake the minimum amount of cREP per vote, ensuring their influence remains small relative to human voters who may stake significantly more. Voting in epoch 1 (before any results are visible) gives bots the same 100% reward weight as early human voters, rewarding accurate strategies. The parimutuel mechanism provides natural selection pressure: strategies that produce inaccurate ratings lose their stakes, while accurate strategies accumulate reputation.",
          },
          {
            type: "sub_heading",
            text: "Human Oversight",
          },
          {
            type: "paragraph",
            text: "The system is designed so that human voters retain decisive influence. Bots staking the minimum are outweighed by any human voter staking more. In contentious rounds, the aggregate human stake dominates bot contributions. This creates a hybrid model: AI provides baseline signals and seeding, while humans provide authoritative quality judgments.",
          },
          {
            type: "sub_heading",
            text: "Cold-Start Mitigation",
          },
          {
            type: "paragraph",
            text: "AI-assisted voting directly addresses the cold-start problem inherent in new content platforms. When a content item is submitted, automated strategies can produce initial quality signals within seconds, seeding the voting market before human participants engage. This creates immediate activity and provides a focal point for human voters to agree or disagree with, accelerating convergence toward accurate ratings.",
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
            text: "tlock encryption relies on the drand randomness beacon network to produce the decryption key after each epoch ends. If the drand network experiences downtime, newly committed votes cannot be revealed until drand resumes. In practice, drand operates across a globally distributed set of nodes (the League of Entropy) and has maintained high availability since 2019. Additionally, the reveal step is permissionless: any party who knows the voter's direction and salt (the voter's own client, a backup keeper, or a third party) can manually call revealVoteByCommitKey() once the epoch ends, bypassing drand entirely. Rounds are not cancelled due to drand downtime  -- they simply wait for reveals and settle once conditions are met.",
          },
        ],
      },
      {
        heading: "tlock Reveal Burden",
        blocks: [
          {
            type: "paragraph",
            text: "Although the keeper reveals votes automatically in the background, voters who want immediate control over their reveal must store their direction and salt client-side after committing. If a voter loses this data (e.g., cleared browser storage), they cannot self-reveal. The stake is not permanently lost  -- the keeper will reveal it automatically after the epoch ends using the on-chain ciphertext and the drand beacon  -- but if the keeper also fails and the voter has lost their salt, the vote cannot be revealed and will be forfeited at settlement. The frontend mitigates this by persisting the reveal data in localStorage and offering a manual reveal option.",
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
            text: "Governance can change round parameters (epochDuration, maxDuration, minVoters) at any time through the standard proposal process. Changes apply to new rounds only: each round snapshots configuration at creation time, so in-progress rounds keep the rules they started with.",
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
            text: "Passport-based identity verification via Self.xyz provides strong Sybil resistance but excludes approximately 1.1 billion people globally who lack passports. The system has no appeal mechanism for false rejections, and recovery from a compromised or offline Self.xyz service is not documented. These are inherent trade-offs of passport-gated identity systems.",
          },
        ],
      },
    ],
  },
];
