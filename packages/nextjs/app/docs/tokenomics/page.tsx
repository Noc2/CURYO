import { TokenAllocationChart } from "~~/components/docs/TokenAllocationChart";
import { protocolCopy } from "~~/lib/docs/protocolCopy";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";
import { HREP_MAX_SUPPLY_LABEL, tokenDistributionTableRows } from "~~/lib/docs/tokenomics";

const Tokenomics = () => {
  return (
    <article className="prose max-w-none">
      <h1>Tokenomics</h1>
      <p className="lead text-base-content/60 text-lg">
        Human Reputation (HREP) token distribution, question funding, and point mechanics.
      </p>

      <h2>Overview</h2>
      <p>
        Human Reputation (HREP) is a reputation token, not money. It cannot be bought, has no token sale, and is
        distributed through protocol-controlled pools to verified humans and active participants.
      </p>

      <h2>Token Overview</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <tbody>
            <tr>
              <td className="font-medium">Name</td>
              <td>Human Reputation</td>
            </tr>
            <tr>
              <td className="font-medium">Symbol</td>
              <td>HREP</td>
            </tr>
            <tr>
              <td className="font-medium">Max Supply</td>
              <td>{HREP_MAX_SUPPLY_LABEL}</td>
            </tr>
            <tr>
              <td className="font-medium">Decimals</td>
              <td>6</td>
            </tr>
            <tr>
              <td className="font-medium">Type</td>
              <td>Reputation token (non-financial)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Supply is fixed at <strong>100 million HREP</strong>. The full supply is minted at launch into
        protocol-controlled pools, with no team allocation or token sale.
      </p>

      <hr />

      <h2>Token Distribution</h2>
      <div className="not-prose my-6">
        <TokenAllocationChart />
      </div>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Pool</th>
              <th>Allocation</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {tokenDistributionTableRows.map(row => (
              <tr key={row.label}>
                <td className="font-medium">{row.label}</td>
                <td className="font-mono">{row.amountLabel}</td>
                <td>{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Identity Claim</h3>
      <p>
        Verified humans claim once through{" "}
        <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
          Self.xyz
        </a>{" "}
        passport or biometric ID card verification. Claimants must prove they are 18 or older, pass sanctions screening,
        and not be from a configured sanctioned-country jurisdiction such as Cuba, Iran, North Korea, or Syria. Claim
        size falls as adoption grows.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Claimants</th>
              <th>Claim (no referral)</th>
              <th>Claim (with referral)</th>
              <th>Referrer gets</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0 (Genesis)</td>
              <td className="font-mono">0 &ndash; 9</td>
              <td className="font-mono">10,000 HREP</td>
              <td className="font-mono">15,000 HREP</td>
              <td className="font-mono">5,000 HREP</td>
            </tr>
            <tr>
              <td>1 (Early Adopter)</td>
              <td className="font-mono">10 &ndash; 999</td>
              <td className="font-mono">1,000 HREP</td>
              <td className="font-mono">1,500 HREP</td>
              <td className="font-mono">500 HREP</td>
            </tr>
            <tr>
              <td>2 (Pioneer)</td>
              <td className="font-mono">1,000 &ndash; 9,999</td>
              <td className="font-mono">100 HREP</td>
              <td className="font-mono">150 HREP</td>
              <td className="font-mono">50 HREP</td>
            </tr>
            <tr>
              <td>3 (Explorer)</td>
              <td className="font-mono">10,000 &ndash; 999,999</td>
              <td className="font-mono">10 HREP</td>
              <td className="font-mono">15 HREP</td>
              <td className="font-mono">5 HREP</td>
            </tr>
            <tr>
              <td>4 (Settler)</td>
              <td className="font-mono">1,000,000+</td>
              <td className="font-mono">1 HREP</td>
              <td className="font-mono">1.5 HREP</td>
              <td className="font-mono">0.5 HREP</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Bootstrap Rewards</h3>
      <p>{protocolCopy.participationPoolOverview}</p>
      <p>
        Reward formula: <code>reward = stakeAmount &times; currentRate</code>. The rate starts at <strong>90%</strong>{" "}
        and halves based on cumulative HREP distributed from the pool &mdash; making the pool&apos;s lifetime
        predictable regardless of individual stake sizes. Rewards are always less than the staked amount, ensuring
        bootstrap rewards are a bonus, not a primary incentive.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Tier</th>
              <th>HREP distributed</th>
              <th>Cumulative</th>
              <th>Rate</th>
              <th>Stake 10 HREP</th>
              <th>Stake 100 HREP</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0</td>
              <td className="font-mono">1,500,000</td>
              <td className="font-mono">1,500,000</td>
              <td className="font-mono">90%</td>
              <td className="font-mono">9 HREP</td>
              <td className="font-mono">90 HREP</td>
            </tr>
            <tr>
              <td>1</td>
              <td className="font-mono">3,000,000</td>
              <td className="font-mono">4,500,000</td>
              <td className="font-mono">45%</td>
              <td className="font-mono">4.5 HREP</td>
              <td className="font-mono">45 HREP</td>
            </tr>
            <tr>
              <td>2</td>
              <td className="font-mono">6,000,000</td>
              <td className="font-mono">10,500,000</td>
              <td className="font-mono">22.5%</td>
              <td className="font-mono">2.25 HREP</td>
              <td className="font-mono">22.5 HREP</td>
            </tr>
            <tr>
              <td>Tail</td>
              <td className="font-mono">1,500,000</td>
              <td className="font-mono">12,000,000</td>
              <td className="font-mono">11.25%</td>
              <td className="font-mono">1.125 HREP</td>
              <td className="font-mono">11.25 HREP</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Bootstrap rewards are paid only after a round resolves successfully.</p>

      <h3 id="bounties">Bounties</h3>
      <p>
        Bounties are separate from HREP bootstrap rewards. They are attached at submission, funded in HREP or USDC on
        Celo, scoped to one question, and split across eligible revealed voters in each qualified bounty round after a
        3% frontend-operator share. If the commit-attributed frontend is not payable, that share stays with the voter
        claim. Bounty required-voter terms cannot exceed the question&apos;s selected voter cap.
      </p>
      <p>
        Feedback Bonuses are separate, optional USDC pools. They reward revealed voters for useful hidden feedback after
        settlement, pay immediately in the award transaction, reserve the same 3% eligible frontend share, and send
        expired unawarded USDC to treasury.
      </p>

      <h3>Treasury</h3>
      <p>
        The protocol treasury starts with <strong>32M HREP</strong> on the governor/timelock from launch. It grows over
        time through three main ongoing inflow sources: a 1% treasury fee on contested losing pools, cancellation fees
        from voluntary content withdrawals, and forfeited unrevealed past-epoch votes swept during settlement cleanup.
        Treasury spending follows the same governance proposal path as upgrades and other governed config changes.
      </p>
      <p>
        Appropriate treasury uses include ecosystem grants, partner activation, integration support, research and data
        work, protocol development, security responses, and whistleblower rewards. HREP grants are not protocol-backed
        payments; they distribute reputation and voting power, so proposals should state why the recipient should hold
        HREP and what follow-up reporting or milestone evidence voters should expect.
      </p>

      <hr />

      <h2>Round Payouts</h2>
      <p>
        When a round is resolved, winners recover their original stake and claim from the content-specific voter pool.
        Revealed losers can reclaim <strong>{protocolDocFacts.revealedLoserRefundPercentLabel}</strong> of raw stake,
        and the remaining losing pool is split across voters, frontend operators, consensus reserve, and treasury.
      </p>

      <hr />

      <h2>Staking Requirements</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Action</th>
              <th>Stake</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vote on content</td>
              <td className="font-mono">1&ndash;100 HREP</td>
              <td>Per vote, per round</td>
            </tr>
            <tr>
              <td>Ask a question</td>
              <td className="font-mono">1 HREP or 1 USDC minimum</td>
              <td>
                The minimum is non-refundable. It is attached at submission and pays eligible voters if the question
                qualifies. Bounties can use HREP or USDC.
              </td>
            </tr>
            <tr>
              <td>Fund a Feedback Bonus</td>
              <td className="font-mono">USDC only</td>
              <td>Optional; unawarded remainder goes to treasury after the award deadline</td>
            </tr>
            <tr>
              <td>Register as frontend</td>
              <td className="font-mono">1,000 HREP</td>
              <td>Returned on exit unless slashed</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Question creators no longer escrow separate capital beyond the bounty. Submission bounties are non-refundable
        and route to eligible voters and the eligible frontend operator once the question resolves.
      </p>
    </article>
  );
};

export default Tokenomics;
