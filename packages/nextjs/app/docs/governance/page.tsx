import type { NextPage } from "next";

const GovernanceDocs: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Governance</h1>
      <p className="lead text-base-content/60 text-lg">Community governance for shaping the platform&apos;s future.</p>

      <h2>Overview</h2>
      <p>
        Curyo is fully decentralized from day one. There is no team, company, foundation, or central authority making
        decisions &mdash; every aspect of the platform is shaped by its community through community voting. Built on
        OpenZeppelin&apos;s Governor contracts, token holders create proposals, vote, and execute approved changes
        directly through the system. After deployment finalization (role renounce ceremony), no privileged admin keys or
        multisigs remain.
      </p>
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
              <td>Created. Waiting for voting delay (1 day).</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Active</span>
              </td>
              <td>Voting open (1 week). Cast: For, Against, or Abstain.</td>
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
              <td>100 cREP</td>
            </tr>
            <tr>
              <td className="font-mono">Voting delay</td>
              <td>1 day</td>
            </tr>
            <tr>
              <td className="font-mono">Voting period</td>
              <td>1 week</td>
            </tr>
            <tr>
              <td className="font-mono">Quorum</td>
              <td>4% of circulating supply (min 10K cREP)</td>
            </tr>
            <tr>
              <td className="font-mono">Timelock delay</td>
              <td>2 days</td>
            </tr>
            <tr>
              <td className="font-mono">Governance lock</td>
              <td>7 days (voting power locked after voting or proposing)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Round Voting Parameters</h2>
      <p>
        The following parameters control per-content round-based voting. They are adjustable via governance proposals
        through the <code className="bg-base-300 px-1 rounded text-base">setConfig()</code> function on the
        RoundVotingEngine contract.
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
              <td>5</td>
              <td>
                Minimum votes required before a round can resolve. Prevents thin-market exploitation by coordinated
                minorities. Rounds that don&apos;t reach this threshold within the maximum round duration are cancelled
                with full refunds.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Minimum voting window</td>
              <td>~20 min</td>
              <td>Minimum time before a round becomes eligible for resolution. Ensures a meaningful voting window.</td>
            </tr>
            <tr>
              <td className="font-mono">Maximum round length</td>
              <td>~24 hours</td>
              <td>
                Maximum blocks before a round must resolve or expire. All round types follow the same ~24-hour
                lifecycle.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Max round duration</td>
              <td>7 days</td>
              <td>
                Maximum time before a round expires. If the minimum voter threshold is not reached within this period,
                the round is cancelled and all stakes are refunded.
              </td>
            </tr>
            <tr>
              <td className="font-mono">Max voters</td>
              <td>1,000</td>
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
              <td>Time a voter must wait before voting on the same content again after a round is resolved.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The 3-voter minimum is a deliberate balance between manipulation resistance and early-stage practicality. With
        fewer than 3 voters, a single actor could control round outcomes. As the platform grows and rounds naturally
        attract more voters, governance can increase this threshold to further strengthen agreement quality.
      </p>

      <h2>Treasury</h2>
      <p>
        The governance treasury is held by the timelock controller and starts with 10M cREP. It grows over time through
        three token inflow sources:
      </p>
      <ul>
        <li>
          <strong>1% resolution fee</strong> &mdash; 1% of every losing pool is sent to the treasury when rounds are
          resolved.
        </li>
        <li>
          <strong>Forfeited submitter deposits</strong> &mdash; when content is flagged for policy violations or
          receives unfavorable ratings, the submitter&apos;s 10 cREP stake is forfeited to the treasury.
        </li>
        <li>
          <strong>Agreement bonus</strong> &mdash; when one-sided rounds reach the maximum round length, a small
          agreement bonus from the treasury rewards voters who identified uncontroversial content.
        </li>
      </ul>
      <p>
        Treasury tokens can only be distributed through governance proposals. Token holders propose allocations, the
        community votes, and after the timelock delay, the transaction is executed automatically. This ensures
        transparent, community-controlled distribution of community tokens.
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
          <strong>Revoke Voter IDs</strong> &mdash; governance can permanently revoke the Voter ID NFTs of confirmed
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
        <li>Sybil resistance &mdash; 1 person = 1 Voter ID via passport verification (Self.xyz).</li>
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
