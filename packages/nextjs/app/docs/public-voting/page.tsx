import Link from "next/link";
import type { NextPage } from "next";

const PHASES = [
  {
    label: "Vote",
    duration: "Instant",
    icon: "\u{1F4CA}",
    steps: [
      "Choose UP or DOWN",
      "Select stake amount",
      "Get reward points (early voters get more)",
      "Rating updates live",
    ],
  },
  {
    label: "Resolution",
    duration: "Random",
    icon: "\u{1F3B2}",
    steps: [
      "Chance of resolution increases over time",
      "Round resolved automatically",
      "Majority side wins",
      "Rating finalized",
    ],
  },
  {
    label: "Claim",
    duration: "Anytime",
    icon: "\u{1F3C6}",
    steps: ["Winners claim rewards", "Payout based on reward points", "Submitter fee credited", "New round can begin"],
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
      <h1>Public Voting &amp; Random Resolution</h1>
      <p className="lead text-base-content/60 text-lg">
        How Curyo makes votes immediately visible and price-moving, with resolution triggered randomly to prevent timing
        games.
      </p>

      <h2>Why Public Voting?</h2>
      <p>
        Curyo uses <strong>public voting with early-mover reward pricing</strong>. Every vote is immediately visible
        publicly and instantly updates the content&apos;s rating. Early and contrarian voters get more reward points per
        cREP staked, creating natural incentives for honest independent judgment without needing cryptographic vote
        privacy.
      </p>
      <p>
        Rather than hiding votes to prevent herding, the pricing system makes it{" "}
        <strong>expensive to follow the crowd</strong> and <strong>rewarding to be early or contrarian</strong>. This
        achieves the same anti-manipulation goal with better UX: one-click voting, instant feedback, and no waiting for
        reveals.
      </p>

      <h2>The Voting Flow</h2>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>

      <h2>Reward Points (Early-Mover Pricing)</h2>

      <h3>How Reward Points Work</h3>
      <p>
        When you vote, your cREP stake is converted into <strong>reward points</strong> using a pricing formula. The
        number of reward points you receive depends on how much stake is already on your side:
      </p>
      <div className="not-prose my-4 p-4 rounded-xl bg-base-200 font-mono text-center text-lg">
        reward points = stake &times; b / (sameDirectionStake + b)
      </div>
      <p>
        Here <code>b</code> is the <strong>liquidity parameter</strong> (default: 1,000 cREP). When your side has little
        stake, you get nearly 1 reward point per cREP. As more stake piles on your side, each additional cREP buys fewer
        reward points.
      </p>

      <h3>Why This Matters</h3>
      <ul>
        <li>
          <strong>Early voters</strong> get more reward points per cREP because sameDirectionStake is low when they
          vote.
        </li>
        <li>
          <strong>Contrarian voters</strong> (voting against the majority) also get more reward points since their side
          has less total stake.
        </li>
        <li>
          <strong>Late followers</strong> get fewer reward points per cREP, making bandwagoning unprofitable relative to
          honest early assessment.
        </li>
      </ul>

      <h3>Reward Distribution</h3>
      <p>
        When a round is resolved, rewards are distributed <strong>proportional to reward points</strong>, not stakes. If
        you contributed 10% of the winning side&apos;s reward points, you receive 10% of the voter reward pool. This
        means early voters who took on more uncertainty are rewarded more generously than late voters who had more
        information.
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

      <h2>Random Resolution</h2>

      <h3>How Resolution Works</h3>
      <p>
        Resolution is triggered <strong>randomly with a flat probability per block</strong>, preventing voters from
        timing their entry to avoid risk. Both one-sided and two-sided rounds follow the same ~24-hour lifecycle. The
        resolution check uses on-chain randomness as the source.
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
              <td className="font-mono">Minimum voting window</td>
              <td>~1 hour</td>
              <td>Resolution impossible before this time. Guarantees a minimum voting window.</td>
            </tr>
            <tr>
              <td className="font-mono">Maximum round length</td>
              <td>~24 hours</td>
              <td>
                Resolution guaranteed by this point. Both one-sided and two-sided rounds follow the same lifecycle.
              </td>
            </tr>
            <tr>
              <td className="font-mono">baseRateBps</td>
              <td>3 (0.03%)</td>
              <td>Flat resolution probability per block.</td>
            </tr>
            <tr>
              <td className="font-mono">growthRateBps</td>
              <td>0</td>
              <td>No growth &mdash; constant probability.</td>
            </tr>
            <tr>
              <td className="font-mono">maxProbBps</td>
              <td>10 (0.1%)</td>
              <td>Maximum probability cap (not reached with flat base).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Resolution Probability</h3>
      <p>After the minimum voting window, each block has a flat chance of triggering resolution:</p>
      <div className="not-prose my-4 p-4 rounded-xl bg-base-200 font-mono text-sm">
        <p>probability = 0.03% per block (flat)</p>
      </div>
      <p>
        This flat probability spreads resolution evenly across the ~1&ndash;24&nbsp;hour range. Most rounds resolve
        randomly before the 24-hour cap; the rest resolve randomly throughout the window. Voters cannot reliably time
        their votes to avoid resolution risk.
      </p>

      <h3>Self-Resolving</h3>
      <p>
        The voting function internally checks whether the current round should resolve before processing the new vote.
        This means every vote doubles as a potential resolution trigger. Additionally, an automated service checks
        periodically for active rounds that are ready to resolve.
      </p>

      <h3>One-Sided Rounds (Agreement)</h3>
      <p>
        If all voters agree (only UP or only DOWN votes) and the round reaches the maximum length, an{" "}
        <strong>agreement bonus</strong> triggers. The system pays a small subsidy from the treasury to reward unanimous
        agreement, since there is no losing pool to redistribute. This incentivizes voting on uncontroversial content
        where the &ldquo;correct&rdquo; answer is obvious.
      </p>

      <h2>Security Properties</h2>
      <ul>
        <li>
          <strong>Anti-herding:</strong> The pricing system makes following the crowd expensive. Late voters get fewer
          reward points per cREP, so copying the majority is suboptimal compared to voting early based on genuine
          assessment.
        </li>
        <li>
          <strong>Unpredictable resolution:</strong> Using on-chain randomness with content-specific seeds makes
          resolution timing unpredictable. Validators cannot profitably manipulate resolution for specific content
          without controlling block production.
        </li>
        <li>
          <strong>No timing games:</strong> The flat probability per block ensures that delaying a vote does not reduce
          resolution risk &mdash; the round could resolve at any time after the grace period.
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
          <strong>Permissionless resolution:</strong> The automated service is fully stateless and holds no secrets. If
          the primary service goes down, any participant can trigger resolution.
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
              <td>Early-mover pricing</td>
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
              <td>No (hidden until round end)</td>
            </tr>
            <tr>
              <td>Resolution timing</td>
              <td>Random with increasing probability</td>
              <td>Fixed round boundaries</td>
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
