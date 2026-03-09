import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";

const HowItWorks: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>How It Works</h1>
      <p className="lead text-base-content/60 text-lg">
        Per-content round voting with blind voting and phase-weighted rewards.
      </p>

      <h2>Voter ID &amp; Identity Verification</h2>
      <p>
        To prevent manipulation through multiple wallets, Curyo uses <strong>Voter IDs</strong> &mdash; non-transferable
        digital IDs tied to verified human identities via Self.xyz passport verification.
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
        <strong>UP</strong> or <strong>DOWN</strong> and back their prediction with a cREP stake. Vote directions are{" "}
        <strong>encrypted</strong> and hidden until the blind phase ends &mdash; phase-weighted rewards give early
        (blind phase) voters <strong>4x more reward weight</strong> per cREP than later voters who saw prior results.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose UP or DOWN, select stake (1&ndash;100 cREP per Voter ID). Your vote direction is
          encrypted and hidden on-chain. Your stake amount is visible, but no one knows which side you chose.
        </li>
        <li>
          <strong>Accumulate:</strong> Votes accumulate within the round. Directions are hidden during the blind phase
          (~20&nbsp;min). After the blind phase ends, the keeper normally reveals eligible votes automatically in the
          background.
        </li>
        <li>
          <strong>Reveal:</strong> The keeper normally decrypts the tlock ciphertext off-chain after epoch end and
          submits the reveal on-chain. Connected users can also self-reveal from the fallback flow if they know the
          plaintext for their vote.
        </li>
        <li>
          <strong>Resolve:</strong> Once at least 3 votes are revealed and all past-phase votes have been revealed (or
          the 60-minute reveal grace period has expired), the round can be resolved. The majority side wins. The losing
          side&apos;s stakes become the reward pool. Content rating is recalculated from the final revealed stake
          imbalance, with small rounds pulled toward 50 by a fixed smoothing parameter. Winners can then click Claim to
          collect their rewards.
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
                <span className="badge badge-secondary badge-sm">Committed</span>
              </td>
              <td>Vote recorded, direction encrypted and hidden. Blind phase = 100% reward weight, open phase = 25%</td>
              <td className="font-mono">~20 min per phase</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Revealed</span>
              </td>
              <td>Keeper submits reveal after epoch end &mdash; directions now visible</td>
              <td className="font-mono">Automatic</td>
              <td>None</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Resolved</span>
              </td>
              <td>&ldquo;Claim X cREP&rdquo; (winners) or &ldquo;Claim 5% rebate&rdquo; (revealed losers)</td>
              <td className="font-mono">After min 3 revealed</td>
              <td>Revealed voters click Claim</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        After the blind phase ends, the keeper normally reveals votes automatically in the background. If that flow
        looks delayed, connected users can also use the hidden manual reveal fallback. Once at least 3 votes are
        revealed and all past-phase votes have been revealed (or the 60-minute reveal grace period has expired),
        resolution can be triggered. Resolution is fully open &mdash; anyone can trigger it. Winners receive their
        original stake plus a phase-weighted share of the losing stakes, while revealed losers can later claim a fixed
        5% rebate.
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
              <td className="font-mono">Blind phase duration</td>
              <td>20 minutes</td>
              <td>Phase window for reward weighting.</td>
            </tr>
            <tr>
              <td className="font-mono">Minimum voters</td>
              <td>3</td>
              <td>Minimum revealed votes required before resolution is allowed.</td>
            </tr>
            <tr>
              <td className="font-mono">maxDuration</td>
              <td>7 days</td>
              <td>
                Maximum round lifetime. Rounds below commit quorum cancel with refunds; rounds that hit commit quorum
                but miss reveal quorum can finalize as RevealFailed only after voting closes and the final reveal grace
                deadline passes.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Reveal grace period</td>
              <td>60 minutes</td>
              <td>Time after each blind phase during which all votes must be revealed before resolution is allowed.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Reward Distribution</h2>
      <p>The losing stakes are split:</p>
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
              <td>Revealed losing voters (rebate)</td>
              <td className="font-mono">5% of raw losing stake</td>
            </tr>
            <tr>
              <td>Content-specific voter pool</td>
              <td className="font-mono">82% of the remaining 95%</td>
            </tr>
            <tr>
              <td>Consensus subsidy reserve</td>
              <td className="font-mono">5% of the remaining 95%</td>
            </tr>
            <tr>
              <td>Content submitter</td>
              <td className="font-mono">10% of the remaining 95%</td>
            </tr>
            <tr>
              <td>Frontend operators</td>
              <td className="font-mono">1% of the remaining 95%</td>
            </tr>
            <tr>
              <td>Category submitter</td>
              <td className="font-mono">1% of the remaining 95%</td>
            </tr>
            <tr>
              <td>Treasury</td>
              <td className="font-mono">1% of the remaining 95%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        A revealed losing vote can still recover <strong>5%</strong> of its original stake. The remaining losing pool is
        then split so the <strong>82%</strong> voter share goes entirely to a <strong>content-specific pool</strong>{" "}
        distributed proportionally by <strong>phase-weighted effective stake</strong> to winning voters on that content.
        Blind phase voters receive 100% reward weight, while open phase voters receive 25% &mdash; giving early voters a
        4x advantage per cREP staked. An additional <strong>5%</strong> of the remaining pool goes to a consensus
        subsidy reserve. Rewards become claimable immediately after the round is resolved. There is no global pool
        &mdash; each content round is self-contained.
      </p>

      <h2>Content Rating</h2>
      <p>
        Each content item has a rating from 0 to 100 (starting at 50). The rating{" "}
        <strong>only changes when a round is resolved</strong> &mdash; it stays unchanged while voting is ongoing. Once
        resolution is triggered, the contract recalculates rating from the final revealed UP and DOWN stake pools using{" "}
        <code>50 +/- 50 * diff / (sum + 50 cREP)</code>, then clamps the result to 0&ndash;100. This keeps low-stake
        rounds close to neutral while letting larger stake imbalances move rating further.
      </p>
      <p>
        If a round <strong>expires</strong> below commit quorum, it is cancelled and refundable. If it reached commit
        quorum but still misses reveal quorum after <code>maxDuration</code> and the final reveal grace window, it can
        finalize as <strong>RevealFailed</strong>: revealed votes remain refundable, while unrevealed votes are later
        forfeited in cleanup. Tied rounds also leave the rating unchanged, with revealed votes refundable and unrevealed
        votes handled by the same cleanup rules. Only a decisive resolution with a clear majority updates the rating.
      </p>

      <h2>Content Inactivity &amp; Revival</h2>
      <p>
        Content that receives no voting activity for <strong>30 days</strong> can be marked as <strong>inactive</strong>
        . Anyone can trigger this, and the system does so automatically. Inactivity prevents new votes on idle content
        and returns the submitter&apos;s original stake.
      </p>
      <ul>
        <li>
          <strong>Safety check:</strong> Content with an active open round cannot be marked inactive, protecting voters
          from stranded stakes.
        </li>
        <li>
          <strong>Revival:</strong> Inactive content can be revived by staking <strong>5 cREP</strong>. This resets the
          30-day activity timer. Each content item can be revived up to <strong>2 times</strong>.
        </li>
        <li>
          <strong>Permanently inactive:</strong> After 2 revivals, content that goes inactive again cannot be revived.
        </li>
      </ul>
    </article>
  );
};

export default HowItWorks;
