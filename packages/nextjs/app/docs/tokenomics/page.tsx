"use client";

import { TokenAllocationChart } from "~~/components/docs/TokenAllocationChart";
import { protocolCopy } from "~~/lib/docs/protocolCopy";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const Tokenomics = () => {
  return (
    <article className="prose max-w-none">
      <h1>Tokenomics</h1>
      <p className="lead text-base-content/60 text-lg">cREP token distribution and point mechanics.</p>

      <h2>Overview</h2>
      <p>
        cREP is a reputation token, not money. It cannot be bought, has no token sale, and is distributed through
        protocol-controlled pools to verified humans and active participants.
      </p>

      <h2>Token Overview</h2>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <tbody>
            <tr>
              <td className="font-medium">Name</td>
              <td>cREP</td>
            </tr>
            <tr>
              <td className="font-medium">Max Supply</td>
              <td>100,000,000 cREP</td>
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
        Supply is fixed at <strong>100 million cREP</strong>, with no pre-mine, team allocation, or token sale.
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
            <tr>
              <td className="font-medium">Faucet Pool</td>
              <td className="font-mono">51,899,900 cREP</td>
              <td>
                One-time claims for verified humans (10,000 to 1 cREP per claim, tiered by adoption, serves up to ~41M
                users)
              </td>
            </tr>
            <tr>
              <td className="font-medium">Participation Pool</td>
              <td className="font-mono">34,000,000 cREP</td>
              <td>{protocolCopy.participationPoolPurpose}</td>
            </tr>
            <tr>
              <td className="font-medium">Consensus Subsidy Reserve</td>
              <td className="font-mono">4,000,000 cREP</td>
              <td>
                Pre-funded reserve for unanimous agreement rewards, replenished by 5% of each round&apos;s losing stakes
              </td>
            </tr>
            <tr>
              <td className="font-medium">Treasury</td>
              <td className="font-mono">10,000,000 cREP</td>
              <td>Governance-controlled cREP tokens for grants, whistleblower rewards, and protocol development</td>
            </tr>
            <tr>
              <td className="font-medium">Keeper Reward Pool</td>
              <td className="font-mono">100,000 cREP</td>
              <td>
                Dedicated flat rewards for settlement and unrevealed-vote cleanup so keeper incentives do not drain user
                stakes
              </td>
            </tr>
            <tr>
              <td className="font-medium">Category Registry</td>
              <td className="font-mono">0 cREP</td>
              <td>Pending category stakes are user-funded; approval proposals are now sponsored directly by voters</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Identity Claim</h3>
      <p>
        Verified humans claim once through{" "}
        <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
          Self.xyz
        </a>{" "}
        passport verification. Claim size falls as adoption grows.
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
              <td className="font-mono">10,000 cREP</td>
              <td className="font-mono">15,000 cREP</td>
              <td className="font-mono">5,000 cREP</td>
            </tr>
            <tr>
              <td>1 (Early Adopter)</td>
              <td className="font-mono">10 &ndash; 999</td>
              <td className="font-mono">1,000 cREP</td>
              <td className="font-mono">1,500 cREP</td>
              <td className="font-mono">500 cREP</td>
            </tr>
            <tr>
              <td>2 (Pioneer)</td>
              <td className="font-mono">1,000 &ndash; 9,999</td>
              <td className="font-mono">100 cREP</td>
              <td className="font-mono">150 cREP</td>
              <td className="font-mono">50 cREP</td>
            </tr>
            <tr>
              <td>3 (Explorer)</td>
              <td className="font-mono">10,000 &ndash; 999,999</td>
              <td className="font-mono">10 cREP</td>
              <td className="font-mono">15 cREP</td>
              <td className="font-mono">5 cREP</td>
            </tr>
            <tr>
              <td>4 (Settler)</td>
              <td className="font-mono">1,000,000+</td>
              <td className="font-mono">1 cREP</td>
              <td className="font-mono">1.5 cREP</td>
              <td className="font-mono">0.5 cREP</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Participation Rewards</h3>
      <p>{protocolCopy.participationPoolOverview}</p>
      <p>
        Reward formula: <code>reward = stakeAmount &times; currentRate</code>. The rate starts at <strong>90%</strong>{" "}
        and halves based on cumulative cREP distributed from the pool &mdash; making the pool&apos;s lifetime
        predictable regardless of individual stake sizes. Rewards are always less than the staked amount, ensuring
        participation rewards are a bonus, not a primary incentive.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Tier</th>
              <th>cREP distributed</th>
              <th>Cumulative</th>
              <th>Rate</th>
              <th>Stake 10 cREP</th>
              <th>Stake 100 cREP</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0</td>
              <td className="font-mono">2,000,000</td>
              <td className="font-mono">2,000,000</td>
              <td className="font-mono">90%</td>
              <td className="font-mono">9 cREP</td>
              <td className="font-mono">90 cREP</td>
            </tr>
            <tr>
              <td>1</td>
              <td className="font-mono">4,000,000</td>
              <td className="font-mono">6,000,000</td>
              <td className="font-mono">45%</td>
              <td className="font-mono">4.5 cREP</td>
              <td className="font-mono">45 cREP</td>
            </tr>
            <tr>
              <td>2</td>
              <td className="font-mono">8,000,000</td>
              <td className="font-mono">14,000,000</td>
              <td className="font-mono">22.5%</td>
              <td className="font-mono">2.25 cREP</td>
              <td className="font-mono">22.5 cREP</td>
            </tr>
            <tr>
              <td>3</td>
              <td className="font-mono">16,000,000</td>
              <td className="font-mono">30,000,000</td>
              <td className="font-mono">11.25%</td>
              <td className="font-mono">1.125 cREP</td>
              <td className="font-mono">11.25 cREP</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Participation rewards are paid only after a round or submitter stake resolves successfully.</p>

      <h3>Treasury</h3>
      <p>
        The governance treasury starts with <strong>10M cREP</strong> and grows over time through four main ongoing
        inflow sources: a 1% treasury fee on contested losing pools, cancellation fees from voluntary content
        withdrawals, forfeited submitter deposits (when content rating drops below 25), and forfeited unrevealed
        past-epoch votes swept during settlement cleanup. Treasury tokens are distributed exclusively via governance
        proposals &mdash; for grants, whistleblower rewards, and protocol development.
      </p>

      <hr />

      <h2>Round Payouts</h2>
      <p>
        When a round is resolved, winners recover their original stake and claim from the content-specific voter pool.
        Revealed losers can reclaim <strong>{protocolDocFacts.revealedLoserRefundPercentLabel}</strong> of raw stake,
        and the remaining losing pool is split across voters, submitter, frontend, category submitter, consensus
        reserve, and treasury.
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
              <td className="font-mono">1&ndash;100 cREP</td>
              <td>Per vote, per round</td>
            </tr>
            <tr>
              <td>Submit content</td>
              <td className="font-mono">10 cREP</td>
              <td>
                Returned after a healthy settled round once no later round remains open, or at dormancy if no round ever
                settles
              </td>
            </tr>
            <tr>
              <td>Register as frontend</td>
              <td className="font-mono">1,000 cREP</td>
              <td>Returned on exit unless slashed</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Submitter deposits are forfeited (100% to treasury) if content rating drops below 25 after a 24-hour grace
        period.
      </p>
    </article>
  );
};

export default Tokenomics;
