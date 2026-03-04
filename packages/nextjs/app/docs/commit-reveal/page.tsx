import Link from "next/link";
import type { NextPage } from "next";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";

const CommitRevealVoting: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Commit-Reveal Voting</h1>
      <p className="lead text-base-content/60 text-lg">
        How tlock encryption hides vote directions to prevent herding, with epoch-weighted rewards that give early
        voters a 4x advantage.
      </p>

      <h2>Why Commit-Reveal?</h2>
      <p>
        Curyo uses <strong>tlock commit-reveal voting</strong> to prevent herding &mdash; the tendency for later voters
        to copy the majority rather than assess quality independently. When you commit a vote, your stake amount is
        visible on-chain, but your <strong>vote direction (UP or DOWN) is encrypted</strong> using timelock encryption
        tied to a future drand beacon round. No one &mdash; not even the keeper &mdash; can decrypt your vote direction
        until the epoch ends.
      </p>
      <p>
        This ensures that during the first epoch (Tier 1), all voters are making blind predictions based on their own
        assessment of content quality. Combined with epoch-weighted rewards, this creates a strong incentive structure
        that rewards independent judgment over bandwagoning.
      </p>

      <h2>The Voting Flow</h2>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>

      <h2>Epoch-Weighted Rewards</h2>
      <p>
        Rewards are distributed based on <strong>epoch-weighted effective stake</strong>, not raw stake amounts. The
        epoch in which you commit your vote determines your reward weight:
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Tier</th>
              <th>When</th>
              <th>Reward Weight</th>
              <th>Effective Stake</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">Tier 1 (Blind)</td>
              <td>First epoch (~20 min)</td>
              <td className="font-mono">100% (10,000 BPS)</td>
              <td>Full stake counts toward rewards</td>
            </tr>
            <tr>
              <td className="font-mono">Tier 2+ (Informed)</td>
              <td>After first epoch</td>
              <td className="font-mono">25% (2,500 BPS)</td>
              <td>Only 25% of stake counts toward rewards</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        This creates a <strong>4:1 early-voter advantage</strong>. A Tier 1 voter staking 10 cREP has the same effective
        stake as a Tier 2 voter staking 40 cREP. The system rewards conviction under uncertainty &mdash; voters who
        commit while directions are hidden take on more risk and are compensated accordingly.
      </p>

      <h2>How Epochs Work</h2>
      <p>
        Each epoch lasts <strong>20 minutes</strong> (configurable by governance). When the first vote on a content item
        is committed, the round begins and the epoch clock starts. During the first epoch, all vote directions are
        encrypted &mdash; no one can see which way anyone voted.
      </p>
      <p>
        After the epoch ends, the <strong>drand beacon</strong> publishes the decryption key for that time period. The
        keeper service uses this key to reveal all committed votes by calling <code>revealVoteByCommitKey()</code>.
        Revealing is also permissionless &mdash; anyone with the drand beacon output can reveal any vote after its epoch
        ends.
      </p>
      <p>
        Votes committed after the first epoch (Tier 2+) can see previously revealed directions, which is why they
        receive a lower reward weight. They have more information and take on less uncertainty.
      </p>

      <h2>Settlement</h2>
      <p>
        Settlement requires at least <strong>3 votes</strong> to be revealed (the <code>minVoters</code> threshold).
        Once the threshold is reached, anyone can call <code>settleRound()</code> to finalize the round. The keeper
        service does this automatically. Settlement determines the majority side, splits the reward pools, and updates
        the content rating.
      </p>
      <p>
        Rounds that exceed the <strong>maximum duration</strong> (7 days) without meeting the minimum voter threshold
        are cancelled. All stakes are fully refunded to participants.
      </p>

      <h2>One-Sided Rounds (Agreement)</h2>
      <p>
        If all revealed voters agree (only UP or only DOWN votes) and the round settles, an{" "}
        <strong>agreement bonus</strong> triggers. The system pays a small subsidy from the agreement bonus reserve to
        reward unanimous agreement, since there is no losing pool to redistribute. This incentivizes voting on
        uncontroversial content where the &ldquo;correct&rdquo; answer is obvious.
      </p>

      <h2>Security Properties</h2>
      <ul>
        <li>
          <strong>Anti-herding (tlock encryption):</strong> Vote directions are encrypted using timelock encryption tied
          to a future drand round. During the first epoch, no one can determine which way anyone voted, preventing
          bandwagon effects.
        </li>
        <li>
          <strong>Unpredictable reveal (drand):</strong> The drand beacon is a decentralized randomness network. The
          decryption key for each epoch is unpredictable until the beacon publishes it, ensuring no one can decrypt
          votes early.
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
          <strong>Permissionless settlement:</strong> The keeper service is fully stateless and holds no secrets. If the
          primary service goes down, anyone can reveal votes and trigger settlement using the public drand beacon
          output.
        </li>
      </ul>

      <p>
        See <Link href="/docs/how-it-works">How It Works</Link> for the full round lifecycle and{" "}
        <Link href="/docs/tokenomics">Tokenomics</Link> for reward distribution details.
      </p>
    </article>
  );
};

export default CommitRevealVoting;
