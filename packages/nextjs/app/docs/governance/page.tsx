import type { NextPage } from "next";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const GovernanceDocs: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Governance</h1>
      <p className="lead text-base-content/60 text-lg">
        cREP governance controls protocol settings, upgrades, treasury routing, and Voter ID enforcement.
      </p>

      <h2>What Governance Does</h2>
      <p>
        cREP is a reputation token with no token sale and no treasury backing. Governance power comes from earned cREP,
        and proposals execute through the governor and timelock.
      </p>
      <ul>
        <li>Upgrade or configure protocol contracts.</li>
        <li>Set round defaults and creator bounds.</li>
        <li>Route treasury spending.</li>
        <li>Revoke Voter IDs when there is hard evidence of abuse.</li>
      </ul>

      <h2>Proposal Lifecycle</h2>
      <div className="not-prose my-6 overflow-x-auto rounded-lg bg-base-200">
        <table className="table table-zebra [&_th]:bg-base-300 [&_th]:text-base [&_td]:text-base">
          <thead>
            <tr>
              <th>State</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pending</td>
              <td>Created and waiting for the voting delay.</td>
            </tr>
            <tr>
              <td>Active</td>
              <td>Voting is open: For, Against, or Abstain.</td>
            </tr>
            <tr>
              <td>Queued</td>
              <td>Passed and waiting in the timelock.</td>
            </tr>
            <tr>
              <td>Executed</td>
              <td>The change is live.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Core Parameters</h2>
      <div className="not-prose my-6 overflow-x-auto rounded-lg bg-base-200">
        <table className="table table-zebra [&_th]:bg-base-300 [&_th]:text-base [&_td]:text-base">
          <tbody>
            <tr>
              <td className="font-mono">Proposal threshold</td>
              <td>{protocolDocFacts.governanceProposalThresholdLabel}</td>
            </tr>
            <tr>
              <td className="font-mono">Voting delay</td>
              <td>~1 day</td>
            </tr>
            <tr>
              <td className="font-mono">Voting period</td>
              <td>~1 week</td>
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
              <td>7 days after proposing or voting</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="round-settings-bounds">Round Settings Bounds</h2>
      <p>
        Question creators can choose round settings, but only inside governance-approved ranges. That lets urgent asks
        settle faster while broader questions can wait for more voters.
      </p>
      <div className="not-prose my-6 overflow-x-auto rounded-lg bg-base-200">
        <table className="table table-zebra [&_th]:bg-base-300 [&_th]:text-base [&_td]:text-base">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Default</th>
              <th>Creator bounds</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Blind phase</td>
              <td>{protocolDocFacts.blindPhaseDurationLabel}</td>
              <td>
                {protocolDocFacts.minBlindPhaseDurationLabel} to {protocolDocFacts.maxBlindPhaseDurationLabel}
              </td>
            </tr>
            <tr>
              <td>Max duration</td>
              <td>{protocolDocFacts.maxRoundDurationLabel}</td>
              <td>
                {protocolDocFacts.minRoundDurationLabel} to {protocolDocFacts.maxAllowedRoundDurationLabel}
              </td>
            </tr>
            <tr>
              <td>Settlement voters</td>
              <td>{protocolDocFacts.minVotersLabel}</td>
              <td>
                {protocolDocFacts.minSettlementVotersLabel} to {protocolDocFacts.maxSettlementVotersLabel}
              </td>
            </tr>
            <tr>
              <td>Voter cap</td>
              <td>{protocolDocFacts.maxVotersLabel}</td>
              <td>
                {protocolDocFacts.minVoterCapLabel} to {protocolDocFacts.maxVoterCapLabel}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Treasury</h2>
      <p>
        The treasury starts with 20M cREP under governor/timelock control. Ongoing inflows include the treasury share of
        contested losing pools, withdrawal fees, and forfeited unrevealed votes. Spending follows the same proposal and
        timelock path as upgrades.
      </p>

      <h2>Safety Powers</h2>
      <p>
        Governance can use public on-chain evidence to respond to collusion, repeated unrevealed commitments, or other
        behavior that damages the feedback signal. The main enforcement tool is Voter ID revocation through a normal
        proposal.
      </p>
      <p>
        These controls are implementation safeguards. The product goal stays narrower: make it easy for agents and apps
        to buy verified human feedback and read the result.
      </p>
    </article>
  );
};

export default GovernanceDocs;
