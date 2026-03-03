import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";

const HowItWorks: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>How It Works</h1>
      <p className="lead text-base-content/60 text-lg">
        Per-content round voting with public stakes and random resolution.
      </p>

      <h2>Voter ID &amp; Sybil Resistance</h2>
      <p>
        To prevent manipulation through multiple wallets (sybil attacks), Curyo uses <strong>Voter ID NFTs</strong>{" "}
        &mdash; non-transferable digital IDs tied to verified human identities via Self.xyz passport verification.
      </p>
      <ul>
        <li>
          <strong>One ID per person:</strong> Each passport can only create one Voter ID, ever.
        </li>
        <li>
          <strong>Non-transferable:</strong> Voter IDs are non-transferable &mdash; they cannot be transferred or sold.
        </li>
        <li>
          <strong>Stake limits per ID:</strong> Each Voter ID can stake a maximum of <strong>100 cREP</strong> per
          content per round, regardless of how many wallets they control.
        </li>
        <li>
          <strong>Privacy-preserving:</strong> Self.xyz uses zero-knowledge proofs. Only the passport&apos;s validity is
          verified; no personal data is stored publicly on the blockchain.
        </li>
      </ul>
      <p>
        Voter ID is required to vote, submit content, create a profile, or register as a frontend operator. This ensures
        every vote represents a real human with a fair stake limit.
      </p>

      <h2>Voting Flow</h2>
      <p>
        Each content item has independent <strong>rounds</strong>. Voters predict whether content&apos;s rating will go{" "}
        <strong>UP</strong> or <strong>DOWN</strong> and back their prediction with a cREP stake. Votes are{" "}
        <strong>immediately public and price-moving</strong> &mdash; each vote shifts the round&apos;s tally in real
        time. Early-mover pricing determines how many <strong>reward points</strong> each voter receives: early voters
        on a given side get more reward points per cREP staked than later voters on the same side.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose UP or DOWN, select stake (1&ndash;100 cREP per Voter ID). Your vote is recorded
          publicly. The system calculates your reward points &mdash; early voters get more points per cREP.
        </li>
        <li>
          <strong>Accumulate:</strong> Votes accumulate within the round. The current tallies are publicly visible at
          all times, creating a live prediction market for content quality.
        </li>
        <li>
          <strong>Resolution:</strong> After a ~1&nbsp;hour grace period and enough votes (minimum 5 voters), the round
          becomes eligible for resolution. Resolution is <strong>probabilistic</strong>
          &mdash; each block has a flat 0.03% chance of triggering settlement, spreading resolution evenly across the
          ~1&ndash;24&nbsp;hour range. The round is forced to resolve at ~24&nbsp;hours. Once resolved, the majority
          side wins. The losing side&apos;s stakes become the reward pool. Content rating is updated by 1&ndash;5 points
          based on winning stake size. Winners can then click Claim to collect their rewards.
        </li>
      </ol>

      <h3>Voting Rules</h3>
      <ul>
        <li>
          <strong>No self-voting:</strong> Content submitters cannot vote on their own submissions. This prevents rating
          manipulation.
        </li>
        <li>
          <strong>Vote cooldown:</strong> After voting on a content item, you must wait <strong>24 hours</strong> before
          voting on the same content again. This prevents repeated farming of the same content by coordinated groups.
        </li>
      </ul>

      <h3>What Happens After You Vote</h3>
      <p>
        After casting a vote, your stake goes through an automated lifecycle. You can track the status from the sidebar
        wallet section or on the content page.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Phase</th>
              <th>What You See</th>
              <th>Duration</th>
              <th>Action Needed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Open</span>
              </td>
              <td>Vote recorded, live tallies visible, resolution window approaching</td>
              <td className="font-mono">~1&ndash;24 hrs</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Resolution</span>
              </td>
              <td>Round eligible for random resolution &mdash; flat 0.03% probability per block</td>
              <td className="font-mono">Variable (flat probability per block)</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Resolved</span>
              </td>
              <td>&ldquo;Claim X cREP&rdquo; (winners) or &ldquo;Lost X cREP&rdquo; (losers)</td>
              <td>&mdash;</td>
              <td>Winners click Claim</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Once the ~1&nbsp;hour grace period has passed and at least 5 voters have participated, the round becomes
        eligible for resolution. Resolution uses randomness &mdash; each block has a flat 0.03% probability of
        triggering settlement, spreading resolution evenly across the ~1&ndash;24&nbsp;hour range. The round is forced
        to resolve at ~24&nbsp;hours. An automated service checks rounds periodically. This is fully trustless &mdash;
        anyone can trigger resolution. Winners receive their original stake plus a reward-point-proportional portion of
        the losing pool.
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
              <td>Resolution guaranteed by this point.</td>
            </tr>
            <tr>
              <td className="font-mono">epochDuration</td>
              <td>1 hour</td>
              <td>Tier window for reward weighting; also the settlement delay after minVoters revealed.</td>
            </tr>
            <tr>
              <td className="font-mono">minVoters</td>
              <td>3</td>
              <td>Minimum revealed votes required before settlement is allowed.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Reward Distribution</h2>
      <p>The losing pool is split:</p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Content-specific voter pool</td>
              <td className="font-mono">82%</td>
            </tr>
            <tr>
              <td>Agreement bonus reserve</td>
              <td className="font-mono">5%</td>
            </tr>
            <tr>
              <td>Content submitter</td>
              <td className="font-mono">10%</td>
            </tr>
            <tr>
              <td>Frontend operators</td>
              <td className="font-mono">1%</td>
            </tr>
            <tr>
              <td>Category submitter</td>
              <td className="font-mono">1%</td>
            </tr>
            <tr>
              <td>Treasury</td>
              <td className="font-mono">1%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The <strong>82%</strong> voter share goes entirely to a <strong>content-specific pool</strong> distributed
        proportionally by <strong>reward points</strong> to winning voters on that content. Because reward points are
        determined by early-mover pricing, early voters on the winning side receive a larger reward per cREP staked than
        later voters. An additional <strong>5%</strong> goes to an agreement bonus reserve. Rewards become claimable
        immediately after the round is resolved. There is no global pool &mdash; each content round is self-contained.
      </p>

      <h2>Content Rating</h2>
      <p>
        Each content item has a rating from 0 to 100 (starting at 50). The rating{" "}
        <strong>only changes when a round is resolved</strong> &mdash; it stays unchanged while voting is ongoing. Once
        resolution is triggered, the rating moves by 1&ndash;5 points toward the winning side based on the total winning
        stake. The delta is also capped by the number of unique winning voters (1 voter = max 1 point, 2 voters = max 2
        points, etc.), preventing a single actor from making large rating swings.
      </p>
      <p>
        If a round <strong>expires</strong> (~24&nbsp;hours pass without reaching the minimum 5 voters) or ends in a{" "}
        <strong>tie</strong>, the rating does not change and all stakes are refunded. Only a decisive resolution with a
        clear majority updates the rating.
      </p>

      <h2>Content Dormancy &amp; Revival</h2>
      <p>
        Content that receives no voting activity for <strong>30 days</strong> can be marked as <strong>dormant</strong>.
        This is a permissionless action &mdash; anyone can trigger it, and the Keeper service does so automatically.
        Dormancy prevents new votes on inactive content and returns the submitter&apos;s original stake.
      </p>
      <ul>
        <li>
          <strong>Safety check:</strong> Content with an active open round cannot be marked dormant, protecting voters
          from stranded stakes.
        </li>
        <li>
          <strong>Revival:</strong> Dormant content can be revived by staking <strong>5 cREP</strong>. This resets the
          30-day activity timer. Each content item can be revived up to <strong>2 times</strong>.
        </li>
        <li>
          <strong>Permanent dormancy:</strong> After 2 revivals, content that goes dormant again cannot be revived.
        </li>
      </ul>
    </article>
  );
};

export default HowItWorks;
