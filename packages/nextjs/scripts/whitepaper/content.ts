/**
 * Whitepaper content extracted from the Curyo documentation.
 * Sections: Introduction, How It Works, Public Voting & Price Discovery, Tokenomics, Governance.
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
    text: "Curyo is a decentralized content curation protocol that replaces passive engagement metrics with stake-weighted prediction games. Voters predict whether a content item's rating will go UP or DOWN and back their prediction with cREP token stakes. Each vote is immediately public and moves the content's live rating through a bonding curve, where early and contrarian voters receive more shares per cREP staked. Settlement occurs at a random, unpredictable time, and the majority side wins the losing side's stakes through a parimutuel mechanism.",
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
    text: "Curyo also incorporates AI as a first-class participant through automated voting bots with pluggable rating strategies. Bots call the same vote() function as human voters and are transparent participants in the public voting market. However, the system is designed so that human voters retain decisive influence through higher stake limits. This hybrid model addresses the cold-start problem inherent in new platforms while preserving human authority over quality judgments.",
  },
  {
    type: "paragraph",
    text: "This paper describes the protocol's mechanisms in detail: the public voting and bonding curve share pricing, random settlement mechanics, parimutuel reward distribution, tokenomics, on-chain governance, and the role of AI-assisted curation in building trustworthy quality infrastructure for the age of AI.",
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
              "Per-Content Rounds  -- Each content item has independent voting rounds. Votes are immediately public and move the live rating via a bonding curve. Settlement occurs randomly after a minimum grace period (~1 hour), with a flat 0.01% probability per block up to a hard cap (~24 hours).",
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
            text: "Voters predict whether content's rating will go UP or DOWN and back their prediction with a cREP stake. Votes are immediately public and move the content's live rating. Early and contrarian voters receive more shares per cREP staked, creating economic incentives against herding.",
          },
          {
            type: "ordered",
            items: [
              "Vote: Choose UP or DOWN, select stake (1-100 cREP per Voter ID). Call vote(contentId, isUp, stakeAmount, frontendAddress). The vote is immediately recorded on-chain and the content's live rating updates.",
              "Accumulate: More voters join the round. Each vote purchases shares via the bonding curve -- early and contrarian votes get more shares per cREP. The live rating reflects the current balance of UP and DOWN stakes.",
              "Random Settlement: After a minimum grace period (~1 hour), settlement can trigger probabilistically on any block. Each block has a flat 0.01% probability, with a hard cap at ~24 hours. Anyone can call trySettle(contentId) to check.",
              "Claim: The side with the larger total stake wins. The losing side's stakes become the reward pool, distributed proportionally by shares to winners. One-sided rounds receive a consensus subsidy.",
            ],
          },
          {
            type: "paragraph",
            text: "Winners always get their original stake back plus their share of the pools. Share-proportional distribution means early and contrarian voters earn more per cREP staked. See the How It Works section for full details.",
          },
        ],
      },
      {
        heading: "Content Rating",
        blocks: [
          {
            type: "paragraph",
            text: "Every content item has a rating from 0 to 100, starting at 50. The rating updates live as votes arrive, computed as: rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + b), where b is the liquidity parameter. After settlement, the rating carries over to the next round.",
          },
          {
            type: "paragraph",
            text: 'Each category (platform) has a ranking question set by its creator -- for example, "Is this content good enough to score above 75 out of 100?". When you vote UP or DOWN, you are answering this question for the current content.',
          },
          {
            type: "paragraph",
            text: "Illegal content, content that doesn't load, or content with an incorrect description should always be downvoted, regardless of the ranking question. Content that falls below a rating of 10 after its grace period results in the submitter's stake being slashed.",
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
            text: "Voters predict whether content's rating will go UP or DOWN and back their prediction with a cREP stake. Votes are immediately public and move the content's live rating through a bonding curve. Early and contrarian voters receive more shares per cREP staked, creating economic incentives against herding without requiring hidden votes.",
          },
          {
            type: "ordered",
            items: [
              "Vote: Choose UP or DOWN, select stake (1-100 cREP per Voter ID). Call vote(contentId, isUp, stakeAmount, frontendAddress). The vote is immediately recorded on-chain, shares are allocated via the bonding curve, and the content's live rating updates.",
              "Accumulate: More voters join the round. Each vote purchases shares -- early and contrarian votes get more shares per cREP. The live rating reflects the current balance of UP and DOWN stakes.",
              "Random Settlement: After a minimum grace period (minEpochBlocks, ~1 hour), settlement can trigger probabilistically. Each block has a flat 0.01% probability until a hard cap (maxEpochBlocks, ~24 hours). Settlement is checked on every vote() call and can also be triggered by anyone calling trySettle(contentId).",
              "Claim: The side with the larger total stake wins. The losing side's stakes become the reward pool, distributed proportionally by shares to winners. Content rating carries over to the next round.",
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
                ["Voted", "Vote recorded, shares allocated, rating updated", "Instant", "None  -- stake is locked"],
                [
                  "Accumulating",
                  "Round is open, more voters can join",
                  "~1 to ~24 hours",
                  "None  -- settlement triggers randomly",
                ],
                ["Settled", "Rewards calculated and claimable", " --", "Winners claim rewards"],
                [
                  "Cancelled",
                  "Round expired without sufficient participation  -- all stakes refunded",
                  " --",
                  "Claim refund",
                ],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Settlement is triggered probabilistically. After a minimum grace period (~1 hour), each block has a flat 0.01% probability of triggering settlement, up to a hard cap (~24 hours). Settlement is checked on every vote() call and can also be triggered by anyone calling trySettle(contentId). A lightweight keeper service calls trySettle() for active rounds, but since settlement is permissionless, anyone can trigger it. Winners receive their original stake plus a share-proportional portion of the losing pool. Participation rewards are distributed at settlement time.",
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
            text: "The 82% voter share goes to a content-specific pool, distributed proportionally by shares (not raw stake) to winning voters on that content. Early and contrarian voters hold more shares per cREP staked, so they receive a larger portion of the reward pool. Because each content item has independent rounds, rewards are calculated and claimable immediately after a round settles  -- no waiting for other content. The 5% consensus subsidy share accumulates in a reserve that funds rewards for one-sided rounds (see Consensus Subsidy Pool).",
          },
        ],
      },
      {
        heading: "Formal Incentive Analysis",
        blocks: [
          {
            type: "paragraph",
            text: "Curyo's parimutuel voting mechanism can be modeled as a game. Let N voters each choose a direction d_i in {UP, DOWN} and a stake s_i in [1, 100]. Each vote purchases shares via the bonding curve: shares_i = s_i * b / (sameDirectionStake + b), where sameDirectionStake is the cumulative stake on that side before this vote. Let W denote the total stake on the winning side and L the total stake on the losing side. The voter pool receives 82% of the losing stake, distributed proportionally by shares to the winning side.",
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
            latex: "P_i^{\\mathrm{win}} = s_i + \\frac{s_i}{W} \\times 0.82 \\, L",
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
            text: "The expected payoff simplifies to:",
          },
          {
            type: "formula",
            latex:
              "E[P_i] = s_i \\left[ P(\\mathrm{win}) \\left(1 + \\frac{0.82 \\, L}{W}\\right) - P(\\mathrm{lose}) \\right]",
          },
          {
            type: "sub_heading",
            text: "Proposition (Honest Voting Equilibrium)",
          },
          {
            type: "paragraph",
            text: "If each voter has a private signal with accuracy p > 0.5 about the true majority direction, honest voting (following one's signal) constitutes a Bayesian Nash Equilibrium. Proof sketch: Deviating to the opposite direction moves a voter from the expected-winning pool (where payoff is positive) to the expected-losing pool (where payoff is -s_i). For p > 0.5, the expected gain from remaining in the majority pool exceeds the expected gain from deviating, so no voter has a unilateral incentive to deviate. The bonding curve pricing ensures that herding is economically penalized  -- piling onto the majority side yields diminishing shares per cREP, while contrarian positions offer outsized returns.",
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
            latex: "P(\\mathrm{win}) > \\frac{1}{1 + 0.82 \\cdot L/W}",
          },
          {
            type: "paragraph",
            text: "The following table shows the minimum confidence required to justify participation at various pool ratios:",
          },
          {
            type: "table",
            data: {
              headers: ["L/W Ratio", "Break-even P(win)", "Interpretation"],
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
            text: "The rating is derived from the bonding curve formula: rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + b). The liquidity parameter b ensures that individual votes have diminishing impact as total stake grows. In equilibrium, content ratings converge to the community's aggregate quality assessment as the number of rounds grows.",
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
            text: "Numerical tests confirm honest voting profitability: in a 2-vs-1 split with 50 cREP stakes, each winner receives ~71 cREP (41% ROI) while the loser forfeits their stake. Manufactured dissent  -- deliberately voting against one's signal to create a losing pool  -- is verified unprofitable: an attacker sacrificing 50 cREP to manufacture a losing pool loses over 30 cREP net compared to the unanimous subsidy baseline. The proportional mechanism ensures identical ROI% for all winning voters regardless of stake size, and 2+1 collusion at the 3-voter threshold yields less than 1 cREP total profit across all colluders.",
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
        heading: "Contrarian Incentives & Pool Balancing",
        blocks: [
          {
            type: "paragraph",
            text: "The parimutuel structure creates a built-in self-balancing mechanism through contrarian incentives. As shown in the break-even table above, when the L/W ratio is 2.0, a voter needs only 38% confidence to profitably take the minority position. This means lopsided pools naturally attract informed contrarians  -- the more voters pile onto the obvious majority, the lower L/W drops, and the less profitable that side becomes.",
          },
          {
            type: "paragraph",
            text: "In equilibrium, pool ratios reflect the community's aggregate confidence distribution. If the majority side is truly obvious, the reward for joining it approaches zero (since L/W approaches zero). This discourages uninformed bandwagoning and encourages genuine disagreement on borderline content, exactly where diverse perspectives are most valuable for curation quality.",
          },
          {
            type: "paragraph",
            text: "The bonding curve pricing is essential to this dynamic. Each additional vote in the same direction receives fewer shares per cREP, making that side increasingly expensive. Conversely, the contrarian side becomes cheaper and more attractive. This creates economic independence without requiring hidden votes: even though voters can see the current tally, the pricing structure makes herding self-defeating and contrarian positions self-rewarding.",
          },
        ],
      },
      {
        heading: "Round-Based Voting With Random Settlement",
        blocks: [
          {
            type: "paragraph",
            text: "Each content item has independent voting rounds. A round begins when the first vote is cast. All votes are immediately public and move the content's live rating through the bonding curve. Settlement timing is probabilistic: after a minimum grace period (minEpochBlocks, ~1 hour), each block has a flat 0.01% probability of triggering settlement, up to a hard cap (maxEpochBlocks, ~24 hours).",
          },
          {
            type: "paragraph",
            text: "The random settlement timing eliminates strategic delay. In systems with known deadlines, sophisticated voters wait until the last moment to minimize information disadvantage. With random settlement, waiting is risky  -- the round could settle at any time after the grace period. The flat 0.01% per block probability spreads resolution evenly across the ~1-24 hour range, with roughly half of all rounds reaching the 24-hour forced settlement. This gives content enough time to attract voters while maintaining unpredictability.",
          },
          {
            type: "paragraph",
            text: "The bonding curve pricing replaces cryptographic vote privacy as the anti-herding mechanism. Each additional vote in the same direction receives fewer shares per cREP (shares = stake * b / (sameDirectionStake + b)). This makes herding economically self-defeating: the more voters pile onto one side, the less profitable that side becomes. Contrarian positions are cheap and potentially very rewarding, creating organic mean reversion without hidden votes.",
          },
        ],
      },
      {
        heading: "Content Rating",
        blocks: [
          {
            type: "paragraph",
            text: "Each content item has a rating from 0 to 100 (starting at 50). The rating updates live as votes arrive, computed as: rating = 50 + 50 * (upStake - downStake) / (upStake + downStake + b), where b is a liquidity parameter that controls sensitivity. When a round settles, the final rating carries over to the next round. The rating converges over many rounds to the community's aggregate quality assessment. Winners receive their original stake back plus a share-proportional portion of the losing pool.",
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

  // ── 3. Public Voting & Price Discovery ──
  {
    title: "Public Voting & Price Discovery",
    lead: "How Curyo uses bonding curve share pricing, live rating updates, and random settlement to produce manipulation-resistant quality signals.",
    subsections: [
      {
        heading: "Why Public Voting?",
        blocks: [
          {
            type: "paragraph",
            text: "On a public blockchain, every transaction is visible to everyone. Traditional approaches use commit-reveal schemes to hide votes and prevent herding. Curyo takes a different approach: votes are immediately public, but the bonding curve pricing makes herding economically self-defeating. The more voters pile onto one side, the fewer shares each new voter receives per cREP staked. Contrarian positions are cheap and potentially very rewarding, creating organic mean reversion without requiring hidden votes.",
          },
          {
            type: "paragraph",
            text: "This design produces a single-transaction voting experience with instant feedback. Voters see their impact immediately, do not need to return later, and the system requires no external cryptographic infrastructure. Anti-herding is achieved through economic incentives rather than information hiding.",
          },
        ],
      },
      {
        heading: "Bonding Curve Share Pricing",
        blocks: [
          {
            type: "paragraph",
            text: "Each vote purchases shares at the current market price. The share formula creates diminishing returns for same-direction voting:",
          },
          {
            type: "formula",
            latex: "\\mathrm{shares} = \\frac{\\mathrm{stake} \\times b}{\\mathrm{sameDirectionStake} + b}",
          },
          {
            type: "paragraph",
            text: "where sameDirectionStake is the cumulative stake on that side before this vote, and b is the liquidity parameter that controls sensitivity. Early voters (when sameDirectionStake is low) receive nearly their full stake as shares. Late followers (when sameDirectionStake is high) receive far fewer shares per cREP.",
          },
          {
            type: "paragraph",
            text: "At settlement, winning shares split the losing pool proportionally:",
          },
          {
            type: "formula",
            latex:
              "\\mathrm{voterPayout} = \\frac{\\mathrm{voterShares}}{\\mathrm{totalWinningShares}} \\times 0.82 \\, L + \\mathrm{voterStake}",
          },
          {
            type: "paragraph",
            text: "where L is the total losing-side stake and 0.82 is the voter share of the losing pool. This means early correct voters profit most (they hold more shares per cREP), late followers on the winning side may barely break even, and late followers on the losing side lose their entire stake.",
          },
          {
            type: "table",
            data: {
              headers: ["Voter", "Direction", "Stake", "Same-side stake before", "Shares received", "Potential return"],
              rows: [
                ["Alice (1st)", "UP", "10 cREP", "0", "~10 shares", "~1.8x if UP wins"],
                ["Bob (2nd)", "UP", "10 cREP", "10", "~8.3 shares", "~1.4x if UP wins"],
                ["Carol (3rd)", "UP", "10 cREP", "20", "~7.1 shares", "~1.1x if UP wins"],
                ["Dave (contrarian)", "DOWN", "10 cREP", "0", "~10 shares", "~2.5x if DOWN wins"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Alice took the most risk (voted first, least information) and gets the best return if correct. Carol gets a thin margin because she followed an established trend. Dave, the contrarian, gets the same number of shares as Alice but against a larger opposing pool, yielding a potentially large return.",
          },
        ],
      },
      {
        heading: "Live Rating Model",
        blocks: [
          {
            type: "paragraph",
            text: "Each content item has a rating between 0 and 100 that updates live as votes arrive:",
          },
          {
            type: "formula",
            latex:
              "\\mathrm{rating} = 50 + 50 \\times \\frac{q_{\\mathrm{up}} - q_{\\mathrm{down}}}{q_{\\mathrm{up}} + q_{\\mathrm{down}} + b}",
          },
          {
            type: "paragraph",
            text: "where q_up and q_down are the cumulative stakes on each side and b is the liquidity parameter. When no votes exist (q_up = q_down = 0), the rating stays at its starting value. The rating provides a continuous, real-time quality signal that reflects the community's current assessment.",
          },
          {
            type: "paragraph",
            text: "When a round settles, the final rating carries over to the next round. Content builds a reputation over time through many rounds, with each round acting as an independent betting round on whether the rating should move UP or DOWN from its current position.",
          },
        ],
      },
      {
        heading: "Random Settlement",
        blocks: [
          {
            type: "paragraph",
            text: "Settlement is triggered probabilistically. Each time the contract is called (via a vote or a dedicated trySettle call), it checks whether settlement should occur. The probability follows an increasing hazard rate:",
          },
          {
            type: "bullets",
            items: [
              "Grace period (0 to minEpochBlocks, ~1 hour): No settlement possible. Votes accumulate freely.",
              "Flat probability (minEpochBlocks to maxEpochBlocks): Each block has a flat 0.01% probability of triggering settlement. Resolution is spread evenly across the window.",
              "Forced settlement (maxEpochBlocks, ~24 hours): The round must settle. This prevents indefinite rounds.",
            ],
          },
          {
            type: "paragraph",
            text: "The randomness source is block.prevrandao (RANDAO), combined with the content ID, epoch ID, and block number via keccak256 hashing. This is free (no gas overhead beyond a hash), available on all post-merge EVM chains and L2s, and sufficient for content rating settlement where individual stake amounts are bounded.",
          },
          {
            type: "table",
            data: {
              headers: ["Parameter", "Value", "Effect"],
              rows: [
                ["minEpochBlocks", "~300 blocks (~1 hour)", "Grace period before settlement can trigger"],
                ["maxEpochBlocks", "~7200 blocks (~24 hours)", "Hard cap -- round must settle"],
                ["Base rate", "0.01% per block", "Flat settlement probability after grace period"],
                ["Growth rate", "0 (flat)", "No growth -- constant probability"],
                ["Max probability", "0.1% per block", "Cap (not reached with flat base)"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Settlement is checked on every vote() call (before the vote executes) and can also be triggered by anyone calling trySettle(contentId). This dual approach means rounds self-settle during active voting, while a lightweight keeper handles rounds where voting has stalled.",
          },
        ],
      },
      {
        heading: "One-Sided Rounds & Consensus Subsidy",
        blocks: [
          {
            type: "paragraph",
            text: "When all voters vote in the same direction, there is no losing pool to distribute. Without mitigation, this creates a perverse incentive: no reason to vote on obviously good or bad content. The consensus subsidy solves this.",
          },
          {
            type: "paragraph",
            text: "One-sided rounds (only UP or only DOWN votes) keep extending past the normal settlement window, creating a visible opportunity for contrarian participation. If maxEpochBlocks is reached with only one side voting, the round settles as a unanimous consensus. All stakes are returned, and voters receive a small reward from the consensus subsidy reserve  -- 5% of the total stake, split between voters (~89%) and the content submitter (~11%).",
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
              "Economic anti-herding: The bonding curve pricing makes same-direction piling increasingly expensive. Each additional vote on the majority side yields fewer shares per cREP, naturally discouraging bandwagoning.",
              "Contrarian incentives: The minority side offers cheap shares with high potential returns, attracting informed contrarians and creating organic mean reversion.",
              "Unpredictable settlement: Random settlement timing eliminates strategic delay. Voters cannot time their entry to the last moment because they do not know when the round will settle.",
              "No front-running advantage: While vote directions are visible, the bonding curve pricing means a front-runner who copies an observed vote direction pays a higher price (fewer shares) than the original voter. Front-running is economically penalized by the pricing mechanism.",
              "Locked positions: Voters cannot exit their position before settlement. This prevents pump-and-dump strategies where a voter could move the rating, attract followers, and exit.",
              "Sybil resistance: Voter ID NFTs cap each verified person at 100 cREP per content per round, regardless of how many wallets they control.",
              "Vote cooldown: A 24-hour cooldown between votes on the same content prevents rapid re-voting and farming by coordinated groups.",
              "Permissionless settlement: Anyone can call trySettle(contentId). No special keys, no trusted third parties, no external dependencies.",
            ],
          },
        ],
      },
      {
        heading: "Game-Theoretic Properties",
        blocks: [
          {
            type: "sub_heading",
            text: "Economic Independence vs. Cryptographic Independence",
          },
          {
            type: "paragraph",
            text: "Traditional approaches to preventing herding rely on information hiding: if voters cannot see each other's votes, they must vote independently. Curyo achieves an equivalent outcome through pricing. In traditional public voting (likes, upvotes), agreement is free. In Curyo, agreement is expensive -- each additional same-direction vote yields fewer shares. This creates economic independence: even though voters can see the current tally, the cost structure incentivizes voting based on genuine belief rather than copying the majority.",
          },
          {
            type: "sub_heading",
            text: "Random Stopping and Strategic Delay",
          },
          {
            type: "paragraph",
            text: "In systems with known settlement deadlines, sophisticated voters wait until the last moment to minimize information disadvantage (Ottaviani & Sorensen, 2006). Random settlement eliminates this strategy. The increasing hazard rate creates a discount on information: waiting provides more information but risks missing the round entirely. The optimal strategy is to vote when you have a genuine opinion, not to wait for maximum information.",
          },
          {
            type: "sub_heading",
            text: "Whale Manipulation Resistance",
          },
          {
            type: "paragraph",
            text: "A whale who votes first with a large stake moves the rating sharply, makes that direction expensive for followers, makes the opposite direction cheap for contrarians, and is locked in until random settlement. If the whale is right, they profit deservedly  -- they provided genuine early information. If the whale is wrong, contrarians buy cheap shares and the whale loses their stake. The key defense is that random settlement prevents the whale from timing their exit.",
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
            text: "With only two voters on opposite sides, the round functions as a direct heads-up bet. Both voters get a clear risk/reward picture. Random settlement means neither can time their exit. If only one voter participates and maxEpochBlocks is reached, it settles as a unanimous consensus with a subsidy payout.",
          },
          {
            type: "sub_heading",
            text: "Can Someone See How Votes Are Distributed?",
          },
          {
            type: "paragraph",
            text: "Yes. All votes, directions, stake amounts, and the live rating are fully visible on-chain. This transparency is by design  -- the bonding curve pricing ensures that this visibility does not enable profitable herding. Seeing a lopsided tally makes the majority side less profitable and the minority side more attractive.",
          },
          {
            type: "sub_heading",
            text: "What if Settlement Timing Is Manipulated?",
          },
          {
            type: "paragraph",
            text: "On L2s with a single sequencer, the sequencer could theoretically influence block.prevrandao. However, the sequencer has no financial incentive (they do not hold cREP positions), the round's outcome is determined by accumulated votes over 1-2 hours (a few blocks do not change much), and if this becomes a concern, Chainlink VRF provides stronger guarantees. The bounded stake amounts per voter (max 100 cREP) limit the value of manipulation.",
          },
          {
            type: "sub_heading",
            text: "What if a Round Expires?",
          },
          {
            type: "paragraph",
            text: "If a round reaches maxEpochBlocks with votes on both sides, it settles normally. If it reaches maxEpochBlocks with votes on only one side, it settles as a unanimous consensus with a subsidy payout. If it expires without any votes, no action is needed  -- the content retains its current rating.",
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
            text: "Anyone can run a keeper. Keepers are lightweight services that monitor the blockchain for active rounds and call trySettle(contentId) to trigger probabilistic settlement. Since all voting data is public on-chain and settlement is permissionless, no special keys or external dependencies are needed  -- the system is fully trustless.",
          },
          {
            type: "paragraph",
            text: "Keepers also perform housekeeping: settling rounds that have reached maxEpochBlocks, cancelling expired rounds, and marking dormant content. All of these functions are permissionless  -- any account can call them.",
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
            text: "The 82% voter share goes to a content-specific pool, distributed proportionally by shares to winning voters on that content. Early and contrarian voters hold more shares per cREP staked, so they receive a larger portion of the reward pool. Because each content item has independent rounds that settle on their own timeline, rewards are claimable immediately after settlement  -- no waiting for other content. The 5% consensus subsidy share funds one-sided-round rewards (see Consensus Subsidy Pool). The 1% treasury fee goes to the governance timelock.",
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
            text: "By deferring voter rewards to settlement, the full vote stake stays at risk until the round completes. Combined with the random settlement timing (which prevents strategic timing of exits) and the bonding curve pricing (which penalizes late entrants), the deferred model ensures voter participation rewards flow only to genuine, successful curation activity while submitter bonuses still bootstrap supply at submission time.",
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
                ["Submit content", "10 cREP", "Returned after 4 days if rating stays above 10%"],
                ["Register as frontend", "1,000 cREP", "Requires governance approval"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "Submitter stakes are slashed (100% to treasury) if content rating drops below 10% after a 24-hour grace period. Stakes are automatically returned after 4 days if not slashed.",
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
                ["minEpochBlocks", "~300 blocks (~1 hour)", "Grace period before settlement can trigger"],
                ["maxEpochBlocks", "~7200 blocks (~24 hours)", "Hard cap -- forced settlement"],
                ["Liquidity parameter (b)", "50", "Controls bonding curve sensitivity and share pricing"],
                ["Max voters", "1,000", "Per-round cap (O(1) settlement enables higher limits)"],
                ["Vote stake", "1-100 cREP", "Stake range per vote, capped per Voter ID"],
                ["Vote cooldown", "24 hours", "Wait time before voting on the same content again"],
              ],
            },
          },
          {
            type: "paragraph",
            text: "The random settlement mechanism ensures rounds complete within a bounded timeframe. The minEpochBlocks grace period gives content time to attract voters, while the maxEpochBlocks hard cap prevents indefinite rounds. The liquidity parameter b controls how responsive the rating is to individual votes -- lower values make ratings more sensitive, higher values make them more stable. As the platform grows, governance can adjust these parameters to optimize for the observed voter population.",
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
            text: "The concept of 'staked media' (a16z, Big Ideas 2026, https://a16z.com/newsletter/big-ideas-2026-part-3/#the-rise-of-staked-media) -- where content quality is assessed through economic commitment rather than algorithmic engagement -- provides a manipulation-resistant alternative to traditional curation mechanisms. Curyo implements this approach through its parimutuel voting system: voters stake cREP tokens on their quality predictions, and the bonding curve pricing ensures economic independence by making herding progressively more expensive.",
          },
          {
            type: "paragraph",
            text: "This design produces quality signals with several properties that distinguish them from engagement-based metrics:",
          },
          {
            type: "bullets",
            items: [
              "Economic commitment  -- Each rating is backed by a token stake, making systematic manipulation expensive relative to the signal produced.",
              "Economic independence  -- The bonding curve pricing makes same-direction voting progressively more expensive, incentivizing genuine assessment over herding. Early and contrarian voters are rewarded for providing independent signals.",
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
            text: "Bots call the same vote() function as human voters and are transparent participants in the public voting market. Their votes are immediately visible on-chain like any other voter's. Bots stake the minimum amount of cREP per vote, ensuring their influence remains small relative to human voters who may stake significantly more. The parimutuel mechanism provides natural selection pressure: strategies that produce inaccurate ratings lose their stakes, while accurate strategies accumulate reputation.",
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
        heading: "Settlement Randomness Source",
        blocks: [
          {
            type: "paragraph",
            text: "Settlement timing relies on block.prevrandao (RANDAO) as the randomness source. On post-merge L1 and most L2s, this provides sufficient unpredictability for content rating settlement. However, on L2s with a single sequencer (Optimism, Arbitrum, Base), the sequencer has theoretical influence over block.prevrandao values. The risk is bounded: the sequencer has no direct financial incentive to manipulate content ratings (they do not hold cREP positions), stake amounts per voter are capped at 100 cREP, and the round's outcome is determined by accumulated votes over 1-2 hours rather than a single block. If this becomes a concern in practice, the settlement mechanism can be upgraded to use Chainlink VRF for stronger randomness guarantees.",
          },
        ],
      },
      {
        heading: "Public Voting Trade-offs",
        blocks: [
          {
            type: "paragraph",
            text: "All votes are immediately public, which creates trade-offs compared to cryptographic vote privacy. Social pressure is possible: if voters' identities are publicly linked to their addresses, they might face pressure to vote in certain ways. The bonding curve pricing mitigates this economically (following social pressure is expensive when it means buying expensive shares), but does not eliminate it entirely. For high-stakes or socially sensitive content, the economic anti-herding mechanism is a weaker guarantee than cryptographic privacy. Curyo's Voter IDs are pseudonymous (tied to a passport but not publicly linked to a real identity), which provides a degree of social insulation.",
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
            text: "The consensus subsidy pool solves this. It is pre-funded with 4,000,000 cREP from the treasury allocation and continuously replenished by 5% of every losing pool from two-sided rounds. When a one-sided round reaches maxEpochBlocks, the contract distributes a subsidy from this reserve equal to 5% of the round's total stake, capped by the reserve balance.",
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
            text: "This subsidy is split between voters (~89%) and the content submitter (~11%), using the same 82:10 ratio as normal round rewards, and distributed proportionally by shares within each group. Since all voters are on the winning side, every voter receives a share. The mechanism is self-sustaining: contentious rounds -- where parimutuel rewards function normally -- generate surplus that funds consensus rounds. Every two-sided round with L cREP in its losing pool contributes 0.05L to the reserve, which can fund approximately one one-sided round of equivalent total stake. The 4M initial pre-fund provides runway during early adoption when two-sided rounds may be infrequent.",
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
            text: "Governance can change round parameters (minEpochBlocks, maxEpochBlocks, liquidity parameter b, settlement probability rates) at any time through the standard proposal process. Changes apply to new rounds only: each round snapshots configuration at creation time, so in-progress rounds keep the rules they started with.",
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
