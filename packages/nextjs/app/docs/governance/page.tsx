import type { NextPage } from "next";
import { protocolCopy } from "~~/lib/docs/protocolCopy";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const GovernanceDocs: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Governance</h1>
      <p className="lead text-base-content/60 text-lg">Community governance for shaping the platform&apos;s future.</p>

      <h2>Overview</h2>
      <p>{protocolCopy.governanceOverview}</p>
      <p>
        Curyo is a <strong>reputation token with no monetary value</strong>. It is not sold, has no treasury backing,
        and is not designed as a financial instrument. Governance power comes from earning reputation through verified
        participation, not from purchasing tokens. This ensures that governance reflects genuine community contribution
        rather than financial resources.
      </p>

      <h2>Voting Power</h2>
      <p>
        Curyo includes built-in governance capabilities with snapshot-based voting. Your voting power equals your cREP
        balance and is activated automatically &mdash; no delegation step required.
      </p>

      <h2>Leaderboards</h2>
      <p>
        The governance page now opens on your <strong>Profile</strong> by default. The <strong>Leaderboard</strong> tab
        focuses on voting-performance rankings across all time, rolling windows, and the current season.
      </p>
      <p>
        Your own <strong>Profile</strong> tab now lives on the governance page, so you can edit the same public profile
        other curators see and track your balance history plus active stake.{" "}
        <code className="bg-base-300 px-1 rounded text-base">/settings</code> now focuses on delegation and
        notifications.
      </p>

      <h2>Proposal Lifecycle</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>State</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Pending</span>
              </td>
              <td>Created. Waiting for voting delay (~1 day / 7,200 blocks).</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Active</span>
              </td>
              <td>Voting open (~1 week / 50,400 blocks). Cast: For, Against, or Abstain.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Queued</span>
              </td>
              <td>Passed. In timelock queue (2 days).</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Executed</span>
              </td>
              <td>Changes are live.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Parameters</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">Proposal threshold</td>
              <td>{protocolDocFacts.governanceProposalThresholdLabel}</td>
            </tr>
            <tr>
              <td className="font-mono">Voting delay</td>
              <td>~1 day (7,200 blocks)</td>
            </tr>
            <tr>
              <td className="font-mono">Voting period</td>
              <td>~1 week (50,400 blocks)</td>
            </tr>
            <tr>
              <td className="font-mono">Quorum</td>
              <td>{protocolDocFacts.governanceQuorumLabel}</td>
            </tr>
            <tr>
              <td className="font-mono">Timelock delay</td>
              <td>2 days</td>
            </tr>
            <tr>
              <td className="font-mono">Governance lock</td>
              <td>7 days (transfer lock after voting or proposing)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The bootstrap governor is intentionally conservative while circulating supply is thin: a proposal needs{" "}
        <strong>{protocolDocFacts.governanceProposalThresholdLabel}</strong>, and quorum never drops below{" "}
        <strong>{protocolDocFacts.governanceMinimumQuorumLabel}</strong> even when 4% of circulating supply would be
        smaller. The proposal threshold is a snapshot eligibility check, not a bonded deposit. The same voting power can
        back multiple live proposals as long as it satisfied the threshold at proposal creation time. The 7-day
        governance lock is a flat transfer restriction that begins when an account proposes or votes; because proposal
        timing is block-based, that lock can expire before the full voting delay plus voting period ends.
      </p>
      <p>
        Upgrades, config changes, and treasury routing all sit behind the same governor/timelock from launch. That keeps
        treasury control on the same on-chain governance path as the rest of the protocol instead of relying on a
        separate operator key.
      </p>

      <h2>Round Voting Parameters</h2>
      <p>
        The following parameters control per-content round-based voting. Core round settings are adjustable via
        governance proposals through the <code className="bg-base-300 px-1 rounded text-base">setConfig()</code>{" "}
        function on the RoundVotingEngine contract. The reveal grace period is updated separately through{" "}
        <code className="bg-base-300 px-1 rounded text-base">setRevealGracePeriod()</code>.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Default</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">Minimum voters</td>
              <td>{protocolDocFacts.minVotersLabel}</td>
              <td>
                Minimum revealed votes required before a round becomes eligible to settle. Past-epoch reveal checks may
                still delay settlement. Rounds that stay below commit quorum within the maximum round duration are
                cancelled with refunds; rounds that hit commit quorum but miss reveal quorum can finalize as
                RevealFailed after grace.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Epoch duration</td>
              <td>{protocolDocFacts.blindPhaseDurationLabel}</td>
              <td>Length of each blind-voting epoch before votes from that epoch can be revealed.</td>
            </tr>
            <tr>
              <td className="font-mono">Reveal grace period</td>
              <td>{protocolDocFacts.revealGracePeriodLabel}</td>
              <td>
                After each epoch ends, past-epoch votes must be revealed before settlement, unless this grace period has
                expired. This parameter is configured separately from <code>setConfig()</code>.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Max round duration</td>
              <td>{protocolDocFacts.maxRoundDurationLabel}</td>
              <td>
                Maximum time before a round expires. Below commit quorum the round is cancelled and refundable. At or
                above commit quorum, missing reveal quorum after the last reveal grace window can finalize as
                RevealFailed instead.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Max voters</td>
              <td>{protocolDocFacts.maxVotersLabel}</td>
              <td>Per-round cap. O(1) resolution enables higher limits without cost concerns.</td>
            </tr>
            <tr>
              <td className="font-mono">Vote stake</td>
              <td>1&ndash;100 cREP</td>
              <td>Stake range per vote per round. Capped per Voter ID to limit single-voter influence.</td>
            </tr>
            <tr>
              <td className="font-mono">Vote cooldown</td>
              <td>24 hours</td>
              <td>Time a voter must wait before voting on the same content again after their last vote.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The {protocolDocFacts.minVotersLabel}-voter minimum is a deliberate balance between manipulation resistance and
        early-stage practicality. With fewer than {protocolDocFacts.minVotersLabel} voters, a single actor could control
        round outcomes. As the platform grows and rounds naturally attract more voters, governance can increase this
        threshold to further strengthen agreement quality.
      </p>

      <h2>Treasury</h2>
      <p>
        The protocol treasury starts with <strong>10M cREP</strong> routed to the governor/timelock itself. It grows
        over time through four main ongoing inflow sources:
      </p>
      <ul>
        <li>
          <strong>1% treasury fee</strong> &mdash; 1% of contested losing pools is sent to the treasury when rounds
          settle.
        </li>
        <li>
          <strong>Cancellation fees</strong> &mdash; voluntary content withdrawals pay a fixed 1 cREP anti-spam fee into
          the treasury.
        </li>
        <li>
          <strong>Forfeited submitter deposits</strong> &mdash; when content is flagged for policy violations or
          receives unfavorable ratings, the submitter&apos;s 10 cREP stake is forfeited to the treasury.
        </li>
        <li>
          <strong>Forfeited unrevealed votes</strong> &mdash; unrevealed past-epoch stakes that miss the reveal window
          are swept to treasury during post-settlement cleanup.
        </li>
      </ul>
      <p>
        Treasury spending follows the same governor proposal and timelock execution flow as upgrades and config changes.
        That keeps the protocol decentralized from launch, but it also means treasury actions inherit the same
        governance thresholds and delay.
      </p>
      <p>
        The consensus subsidy reserve is separate from the treasury. It is seeded with 4M cREP at deployment and
        replenished by 5% of losing pools from two-sided rounds, then used to subsidize one-sided round payouts.
      </p>

      <h2>Collusion Prevention</h2>
      <p>
        The integrity of Curyo&apos;s content curation depends on honest, independent voting. Groups that coordinate to
        artificially upvote or downvote content undermine the prediction pool system and harm fair curation.
      </p>
      <p>
        <strong>Detection:</strong> Community members can monitor voting patterns publicly visible. Suspicious activity
        &mdash; such as coordinated voting from related wallets, vote timing patterns, or unusual stake distributions
        &mdash; can be flagged and analyzed using public data.
      </p>
      <p>
        <strong>Enforcement via governance proposals:</strong> When hard evidence of collusion is found, the community
        can take action through governance:
      </p>
      <ul>
        <li>
          <strong>Revoke Voter IDs</strong> &mdash; governance can permanently revoke the Voter IDs of confirmed
          colluders, removing their ability to vote on the platform.
        </li>
        <li>
          <strong>Reward whistleblowers</strong> &mdash; governance is encouraged to allocate cREP from the treasury to
          reward community members who provide evidence of collusion.
        </li>
      </ul>
      <p>
        <strong>Deterrence:</strong> Several protocol features make collusion costly and difficult:
      </p>
      <ul>
        <li>Identity verification &mdash; 1 person = 1 Voter ID via passport verification (Self.xyz).</li>
        <li>Stake caps &mdash; maximum 100 cREP per content per round limits single-voter influence.</li>
        <li>Vote cooldowns &mdash; 24-hour cooldown prevents rapid re-voting on the same content.</li>
        <li>Permanent revocation &mdash; losing your Voter ID is irreversible and eliminates voting ability.</li>
      </ul>
      <p>
        The process follows Curyo&apos;s standard governance flow: evidence is submitted, a governance proposal is
        created, the community votes, and after the timelock delay, the action is executed.
      </p>
    </article>
  );
};

export default GovernanceDocs;
