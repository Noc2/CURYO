import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";

const HowItWorks: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>How It Works</h1>
      <p className="lead text-base-content/60 text-lg">
        Per-content round voting with public stakes and random settlement.
      </p>

      <h2>Voter ID &amp; Sybil Resistance</h2>
      <p>
        To prevent manipulation through multiple wallets (sybil attacks), Curyo uses <strong>Voter ID NFTs</strong>{" "}
        &mdash; soulbound tokens tied to verified human identities via Self.xyz passport verification.
      </p>
      <ul>
        <li>
          <strong>One ID per person:</strong> Each passport can only mint one Voter ID NFT, ever.
        </li>
        <li>
          <strong>Non-transferable:</strong> Voter IDs are soulbound &mdash; they cannot be transferred or sold.
        </li>
        <li>
          <strong>Stake limits per ID:</strong> Each Voter ID can stake a maximum of <strong>100 cREP</strong> per
          content per round, regardless of how many wallets they control.
        </li>
        <li>
          <strong>Privacy-preserving:</strong> Self.xyz uses zero-knowledge proofs. Only the passport&apos;s validity is
          verified; no personal data is stored on-chain.
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
        time. A bonding curve determines how many <strong>shares</strong> each voter receives: early voters on a given
        side get more shares per cREP staked than later voters on the same side.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose UP or DOWN, select stake (1&ndash;100 cREP per Voter ID). Your vote is submitted
          on-chain via <code>vote(contentId, isUp, stakeAmount, frontendAddress)</code>. The bonding curve calculates
          your shares: <code>shares = stake &times; b / (sameDirectionStake + b)</code>, where <code>b</code> is the
          liquidity parameter. Early conviction is rewarded with more shares.
        </li>
        <li>
          <strong>Accumulate:</strong> Votes accumulate within the round. The current tallies are publicly visible at
          all times, creating a live prediction market for content quality.
        </li>
        <li>
          <strong>Settlement:</strong> After a ~30&nbsp;minute grace period (150 blocks) and enough votes (minimum 3
          voters), anyone can call <code>trySettle(contentId)</code>. Settlement is <strong>probabilistic</strong>
          &mdash; the probability starts at 0.3% per block and increases each block until the round is forced to settle
          at ~6&nbsp;hours (1,800 blocks). Randomness comes from <code>block.prevrandao</code>. Once settled, the
          majority side wins. The losing side&apos;s stakes become the reward pool. Content rating is updated by
          1&ndash;5 points based on winning stake size. Winners claim rewards, frontends claim fees, and all voters
          claim participation rewards individually (pull-based).
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
              <td>Vote recorded, live tallies visible, settlement window approaching</td>
              <td className="font-mono">~30 min&ndash;6 hrs</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Settlement</span>
              </td>
              <td>Round eligible for probabilistic settlement via trySettle()</td>
              <td className="font-mono">Variable (probability increases per block)</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Settled</span>
              </td>
              <td>&ldquo;Claim X cREP&rdquo; (winners) or &ldquo;Lost X cREP&rdquo; (losers)</td>
              <td>&mdash;</td>
              <td>Winners click Claim</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Once the ~30&nbsp;minute grace period has passed and at least 3 voters have participated, anyone can call{" "}
        <code>trySettle(contentId)</code>. Settlement uses <code>block.prevrandao</code> for randomness &mdash; the
        probability of settlement increases each block (0.3%&nbsp;&rarr;&nbsp;5% cap), and the round is forced to settle
        at ~6&nbsp;hours. A keeper service calls <code>trySettle()</code> automatically. This is fully trustless &mdash;
        the keeper holds no secrets and anyone can run one. Winners receive their original stake plus a
        share-proportional portion of the losing pool.
      </p>

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
              <td>Consensus subsidy reserve</td>
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
        proportionally by <strong>shares</strong> to winning voters on that content. Because shares are determined by a
        bonding curve, early voters on the winning side receive a larger reward per cREP staked than later voters. An
        additional <strong>5%</strong> goes to a consensus subsidy reserve. Rewards become claimable immediately after
        the round settles. There is no global pool &mdash; each content round is self-contained.
      </p>

      <h2>Content Rating</h2>
      <p>
        Each content item has a rating from 0 to 100 (starting at 50). The rating{" "}
        <strong>only changes when a round settles</strong> &mdash; it stays unchanged while voting is ongoing. Once
        settlement is triggered, the rating moves by 1&ndash;5 points toward the winning side based on the total winning
        stake. The delta is also capped by the number of unique winning voters (1 voter = max 1 point, 2 voters = max 2
        points, etc.), preventing a single actor from making large rating swings.
      </p>
      <p>
        If a round <strong>expires</strong> (~6&nbsp;hours pass without reaching the minimum 3 voters) or ends in a{" "}
        <strong>tie</strong>, the rating does not change and all stakes are refunded. Only a decisive settlement with a
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
