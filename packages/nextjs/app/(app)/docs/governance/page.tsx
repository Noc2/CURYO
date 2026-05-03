import type { NextPage } from "next";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const GovernanceDocs: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Governance</h1>
      <p className="lead text-base-content/60 text-lg">
        HREP governance controls protocol settings, upgrades, treasury routing, and Voter ID enforcement.
      </p>

      <h2>What Governance Does</h2>
      <p>
        HREP is a reputation token with no token sale and no treasury backing. Governance power comes from earned HREP,
        and proposals execute through the governor and timelock.
      </p>
      <ul>
        <li>Upgrade or configure protocol contracts.</li>
        <li>Set round defaults and creator bounds.</li>
        <li>Route treasury spending, including ecosystem and partner activation grants.</li>
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
        The treasury starts with 32M HREP under governor/timelock control. Ongoing inflows include the treasury share of
        contested losing pools, withdrawal fees, and forfeited unrevealed votes. Spending follows the same proposal and
        timelock path as upgrades.
      </p>
      <p>
        Treasury grants can support work that grows the Curyo feedback network: partner activation, integrations,
        research and data projects, community growth, protocol development, and security or whistleblower rewards.
        Because HREP also carries governance power, grant proposals should explain the recipient, purpose, amount,
        expected impact, and any milestone or reporting expectations.
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

      <h2>Protocol Evolution</h2>
      <p>
        Curyo is expected to evolve over time. The protocol operates in a fast-changing environment, especially as AI
        systems become more capable and as new smart-contract, wallet, identity, and coordination vulnerabilities are
        discovered. Governance was integrated from the start so the community can adapt protocol parameters, contracts,
        treasury routing, and safety rules without treating the first deployment as the final design forever.
      </p>
      <p>
        In early protocol phases, some changes may be better handled through a transparent migration instead of an
        in-place upgrade. When that is necessary, the community can take a public snapshot of the current token
        allocation and redeploy updated contracts so balances, earned reputation, and protocol state can be carried
        forward while the implementation stays current. Any such migration should be documented, reviewable, and aligned
        with the same governance principles that control upgrades and configuration changes.
      </p>
    </article>
  );
};

export default GovernanceDocs;
