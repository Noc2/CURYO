import Link from "next/link";
import type { NextPage } from "next";

const PHASES = [
  {
    label: "Vote",
    duration: "Instant",
    icon: "\u{1F4CA}",
    steps: ["Choose UP or DOWN", "Select stake amount", "Get shares via bonding curve", "Rating updates live"],
  },
  {
    label: "Settlement",
    duration: "Random",
    icon: "\u{1F3B2}",
    steps: ["Probability increases per block", "Anyone can call trySettle()", "Majority side wins", "Rating finalized"],
  },
  {
    label: "Claim",
    duration: "Anytime",
    icon: "\u{1F3C6}",
    steps: ["Winners claim rewards", "Share-proportional payout", "Submitter fee credited", "New round can begin"],
  },
];

function VotingFlowDiagram() {
  return (
    <div className="my-6 flex flex-col sm:flex-row items-stretch gap-0 text-base">
      {PHASES.map((phase, i) => (
        <div key={phase.label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-3 py-2">
            <span className="badge badge-secondary badge-sm mb-1.5">{phase.label}</span>
            <span className="text-2xl mb-1">{phase.icon}</span>
            <span className="text-sm font-mono text-base-content/40 mb-2">{phase.duration}</span>
            <ul className="text-sm text-base-content/60 leading-relaxed space-y-0.5 text-left list-none p-0 m-0">
              {phase.steps.map(step => (
                <li key={step} className="before:content-['\203A'] before:mr-1.5 before:text-base-content/30">
                  {step}
                </li>
              ))}
            </ul>
          </div>
          {i < PHASES.length - 1 && <div className="text-base-content/30 text-lg shrink-0 hidden sm:block">&rarr;</div>}
          {i < PHASES.length - 1 && (
            <div className="text-base-content/30 text-lg shrink-0 sm:hidden self-center py-1">&darr;</div>
          )}
        </div>
      ))}
    </div>
  );
}

const PublicVoting: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Public Voting &amp; Random Settlement</h1>
      <p className="lead text-base-content/60 text-lg">
        How Curyo makes votes immediately visible and price-moving, with settlement triggered randomly to prevent timing
        games.
      </p>

      <h2>Why Public Voting?</h2>
      <p>
        Curyo uses <strong>public voting with bonding curve share pricing</strong>. Every vote is immediately visible
        on-chain and instantly updates the content&apos;s rating. Early and contrarian voters get more shares per cREP
        staked, creating natural incentives for honest independent judgment without needing cryptographic vote privacy.
      </p>
      <p>
        Rather than hiding votes to prevent herding, the bonding curve makes it{" "}
        <strong>expensive to follow the crowd</strong> and <strong>rewarding to be early or contrarian</strong>. This
        achieves the same anti-manipulation goal with better UX: one-click voting, instant feedback, and no waiting for
        reveals.
      </p>

      <h2>The Voting Flow</h2>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>

      <h2>Share Pricing (Bonding Curve)</h2>

      <h3>How Shares Work</h3>
      <p>
        When you vote, your cREP stake is converted into <strong>shares</strong> using a bonding curve formula. The
        number of shares you receive depends on how much stake is already on your side:
      </p>
      <div className="not-prose my-4 p-4 rounded-xl bg-base-200 font-mono text-center text-lg">
        shares = stake &times; b / (sameDirectionStake + b)
      </div>
      <p>
        Here <code>b</code> is the <strong>liquidity parameter</strong> (default: 1,000 cREP). When your side has little
        stake, you get nearly 1 share per cREP. As more stake piles on your side, each additional cREP buys fewer
        shares.
      </p>

      <h3>Why This Matters</h3>
      <ul>
        <li>
          <strong>Early voters</strong> get more shares per cREP because sameDirectionStake is low when they vote.
        </li>
        <li>
          <strong>Contrarian voters</strong> (voting against the majority) also get more shares since their side has
          less total stake.
        </li>
        <li>
          <strong>Late followers</strong> get fewer shares per cREP, making bandwagoning unprofitable relative to honest
          early assessment.
        </li>
      </ul>

      <h3>Reward Distribution</h3>
      <p>
        When a round settles, rewards are distributed <strong>proportional to shares</strong>, not stakes. If you
        contributed 10% of the winning side&apos;s shares, you receive 10% of the voter reward pool. This means early
        voters who took on more uncertainty are rewarded more generously than late voters who had more information.
      </p>

      <h2>Live Rating Updates</h2>
      <p>Every vote immediately updates the content&apos;s rating using a balanced formula:</p>
      <div className="not-prose my-4 p-4 rounded-xl bg-base-200 font-mono text-center text-lg">
        rating = 50 + 50 &times; (upStake &minus; downStake) / (upStake + downStake + b)
      </div>
      <p>
        The rating starts at 50 (neutral) and moves toward 0 or 100 as votes accumulate. The liquidity parameter{" "}
        <code>b</code> dampens early volatility &mdash; a single large vote cannot swing the rating from 0 to 100. As
        more votes come in, the rating reflects the aggregate weighted sentiment.
      </p>

      <h2>Random Settlement</h2>

      <h3>How Settlement Works</h3>
      <p>
        Settlement is triggered <strong>randomly with increasing probability</strong> per block, preventing voters from
        timing their entry to avoid risk. The settlement check uses <code>block.prevrandao</code> as the randomness
        source.
      </p>

      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">minEpochBlocks</td>
              <td>150 (~30 min)</td>
              <td>Settlement impossible before this many blocks. Guarantees a minimum voting window.</td>
            </tr>
            <tr>
              <td className="font-mono">maxEpochBlocks</td>
              <td>1,800 (~6 hrs)</td>
              <td>Settlement guaranteed by this point. Two-sided rounds settle; one-sided rounds trigger consensus.</td>
            </tr>
            <tr>
              <td className="font-mono">baseRateBps</td>
              <td>30 (0.3%)</td>
              <td>Initial settlement probability per block after minEpochBlocks.</td>
            </tr>
            <tr>
              <td className="font-mono">growthRateBps</td>
              <td>3 (0.03%)</td>
              <td>Additional probability per block beyond minEpochBlocks.</td>
            </tr>
            <tr>
              <td className="font-mono">maxProbBps</td>
              <td>500 (5%)</td>
              <td>Maximum probability per block cap.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Settlement Probability</h3>
      <p>
        After <code>minEpochBlocks</code>, each block has a chance of triggering settlement:
      </p>
      <div className="not-prose my-4 p-4 rounded-xl bg-base-200 font-mono text-sm">
        <p>prob = baseRateBps + (block - startBlock - minEpochBlocks) &times; growthRateBps</p>
        <p>prob = min(prob, maxProbBps)</p>
        <p>settle if: keccak256(prevrandao, contentId, roundId, blockNumber) mod 10000 &lt; prob</p>
      </div>
      <p>
        This creates a <strong>hazard rate</strong> that makes settlement increasingly likely over time but
        unpredictable at any specific block. Voters cannot reliably time their votes to avoid settlement risk.
      </p>

      <h3>Self-Settling</h3>
      <p>
        The <code>vote()</code> function internally checks whether the current round should settle before processing the
        new vote. This means every vote doubles as a potential settlement trigger. Additionally, anyone can call{" "}
        <code>trySettle(contentId)</code> directly &mdash; the keeper service does this periodically for active rounds.
      </p>

      <h3>One-Sided Rounds (Consensus)</h3>
      <p>
        If all voters agree (only UP or only DOWN votes) and the round reaches <code>maxEpochBlocks</code>, a{" "}
        <strong>consensus settlement</strong> triggers. The contract pays a small subsidy from the treasury to reward
        unanimous agreement, since there is no losing pool to redistribute. This incentivizes voting on uncontroversial
        content where the &ldquo;correct&rdquo; answer is obvious.
      </p>

      <h2>Security Properties</h2>
      <ul>
        <li>
          <strong>Anti-herding:</strong> The bonding curve makes following the crowd expensive. Late voters get fewer
          shares per cREP, so copying the majority is suboptimal compared to voting early based on genuine assessment.
        </li>
        <li>
          <strong>Unpredictable settlement:</strong> Using <code>block.prevrandao</code> with content-specific seeds
          makes settlement timing unpredictable. Validators cannot profitably manipulate settlement for specific content
          without controlling block production.
        </li>
        <li>
          <strong>No timing games:</strong> The increasing probability curve ensures that delaying a vote does not
          reduce settlement risk &mdash; if anything, it increases the chance of settling before you can vote.
        </li>
        <li>
          <strong>Sybil resistance:</strong> Voter ID NFTs cap each verified person at 100 cREP per content per round,
          regardless of how many wallets they control.
        </li>
        <li>
          <strong>Vote cooldown:</strong> A 24-hour cooldown between votes on the same content prevents rapid re-voting
          and farming by coordinated groups.
        </li>
        <li>
          <strong>Permissionless settlement:</strong> Anyone can call <code>trySettle()</code>. The keeper is fully
          stateless and holds no secrets. If the primary keeper goes down, any participant can trigger settlement.
        </li>
      </ul>

      <h2>Comparison with Commit-Reveal</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Property</th>
              <th>Public Voting (Curyo)</th>
              <th>Commit-Reveal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vote visibility</td>
              <td>Immediately public</td>
              <td>Hidden until reveal</td>
            </tr>
            <tr>
              <td>Anti-herding mechanism</td>
              <td>Bonding curve pricing</td>
              <td>Cryptographic privacy</td>
            </tr>
            <tr>
              <td>User experience</td>
              <td>Single click</td>
              <td>Two-phase (commit + wait for reveal)</td>
            </tr>
            <tr>
              <td>External dependencies</td>
              <td>None</td>
              <td>drand beacon network</td>
            </tr>
            <tr>
              <td>Real-time feedback</td>
              <td>Yes (live rating updates)</td>
              <td>No (hidden until epoch end)</td>
            </tr>
            <tr>
              <td>Settlement timing</td>
              <td>Random with increasing probability</td>
              <td>Fixed epoch boundaries</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        See <Link href="/docs/how-it-works">How It Works</Link> for the full round lifecycle and{" "}
        <Link href="/docs/tokenomics">Tokenomics</Link> for reward distribution details.
      </p>
    </article>
  );
};

export default PublicVoting;
