import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";

const HowItWorks: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>How It Works</h1>
      <p className="lead text-base-content/60 text-lg">Per-content round voting with tlock-encrypted epochs.</p>

      <h2>Voter ID & Sybil Resistance</h2>
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
        Each content item has independent <strong>rounds</strong>. Within a round, votes accumulate across implicit{" "}
        <strong>15-minute epochs</strong>. Voters predict whether content&apos;s rating will go <strong>UP</strong> or{" "}
        <strong>DOWN</strong> and back their prediction with a cREP stake. Votes are{" "}
        <strong>tlock-encrypted to the epoch&apos;s end time</strong> using drand timelock, so no one can see
        others&apos; votes before the epoch ends.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Commit:</strong> Choose UP or DOWN, select stake (1&ndash;100 cREP per Voter ID). Vote is encrypted to
          the current epoch&apos;s end time and committed on-chain.
        </li>
        <li>
          <strong>Reveal:</strong> After each epoch ends, the drand beacon publishes the decryption key. Anyone can
          decrypt and reveal votes &mdash; no secret data needed. A stateless keeper handles this automatically.
        </li>
        <li>
          <strong>Accumulate:</strong> Revealed votes accumulate across epochs within the round. After each epoch,
          revealed tallies become publicly visible.
        </li>
        <li>
          <strong>Settlement:</strong> Once &ge;3 votes have been revealed across all epochs in the round, the round can
          be settled (O(1) gas cost regardless of voter count). The majority side wins. The losing side&apos;s stakes
          become the reward pool. Content rating is updated by 1&ndash;5 points based on winning stake size. After
          settlement, winners claim rewards, frontends claim fees, and all voters claim participation rewards
          individually (pull-based).
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
        After committing a vote, your stake goes through an automated lifecycle. You can track the status from the
        sidebar wallet section or on the content page.
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
                <span className="badge badge-secondary badge-sm">Committed</span>
              </td>
              <td>Vote encrypted, epoch countdown</td>
              <td className="font-mono">Up to 15 min</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Epoch ended</span>
              </td>
              <td>Votes being decrypted via drand</td>
              <td className="font-mono">&lt; 30 sec</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Accumulating</span>
              </td>
              <td>Waiting for 3+ revealed votes</td>
              <td className="font-mono">Up to 7 days</td>
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
        After each epoch ends, the drand beacon publishes the decryption key for that epoch&apos;s tlock-encrypted
        votes. A stateless keeper reads on-chain ciphertexts, decrypts them via drand, and calls{" "}
        <code>revealVote()</code>. This is fully trustless &mdash; the keeper holds no secrets and anyone can run one.
        Once &ge;3 votes have been revealed across all epochs in the round, anyone can trigger settlement. Winners
        receive their original stake plus a share of the losing pool.
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
        proportionally by stake to winning voters on that content. An additional <strong>5%</strong> goes to a consensus
        subsidy reserve. Rewards become claimable immediately after the round settles. There is no global pool &mdash;
        each content round is self-contained.
      </p>

      <h2>Content Rating</h2>
      <p>
        Each content item has a rating from 0 to 100 (starting at 50). The rating{" "}
        <strong>only changes when a round settles</strong> &mdash; it stays unchanged during voting, epoch transitions,
        and vote reveals. Once settlement is triggered, the rating moves by 1&ndash;5 points toward the winning side
        based on the total winning stake. The delta is also capped by the number of unique winning voters (1 voter = max
        1 point, 2 voters = max 2 points, etc.), preventing a single actor from making large rating swings.
      </p>
      <p>
        If a round <strong>expires</strong> (7 days pass without reaching 3 revealed votes) or ends in a{" "}
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
          <strong>Safety check:</strong> Content with pending unrevealed votes cannot be marked dormant, protecting
          voters from stranded stakes.
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
