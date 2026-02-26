"use client";

import { FaucetHalvingChart } from "~~/components/docs/FaucetHalvingChart";
import { FaucetTierChart } from "~~/components/docs/FaucetTierChart";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { TokenAllocationChart } from "~~/components/docs/TokenAllocationChart";

const Tokenomics = () => {
  return (
    <article className="prose max-w-none">
      <h1>Tokenomics</h1>
      <p className="lead text-base-content/60 text-lg">cREP token distribution and point mechanics.</p>

      <h2>Curyo is a reputation token only</h2>
      <p>
        cREP has no monetary value and is not designed as an investment or financial instrument. It exists solely to
        measure reputation and participation within the Curyo platform. It cannot be purchased &mdash; it is only earned
        through verified identity claims and active participation. There is no team, no company, and no central entity
        behind the token. Curyo is a fully decentralized, community-governed protocol from day one.
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
        Fixed supply of <strong>100 million tokens</strong>. Fair launch &mdash; no pre-mine, no VC allocation, no team
        tokens, and no token sale of any kind. All tokens are distributed exclusively through four on-chain pools:
      </p>

      <h3>Design Principles</h3>
      <ul>
        <li>
          <strong>Reputation, not money.</strong> cREP represents your standing in the community. It is staked to curate
          and vote, not traded for profit.
        </li>
        <li>
          <strong>No issuer, no sale.</strong> There is no company, foundation, or team that issues, sells, or controls
          cREP. Distribution is handled entirely by on-chain protocol contracts.
        </li>
        <li>
          <strong>Decentralized from genesis.</strong> All protocol parameters are governed on-chain by token holders.
          After deployment finalization (role renounce ceremony), no privileged admin keys remain.
        </li>
        <li>
          <strong>Sybil-resistant distribution.</strong> Tokens are claimed once per verified human via passport
          verification, preventing concentration and ensuring broad distribution.
        </li>
      </ul>

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
              <td className="font-mono">52,000,000 cREP</td>
              <td>
                One-time claims for verified humans (10,000 to 1 cREP per claim, tiered by adoption, serves up to ~41M
                users)
              </td>
            </tr>
            <tr>
              <td className="font-medium">Participation Pool</td>
              <td className="font-mono">34,000,000 cREP</td>
              <td>
                Bootstraps early adoption &mdash; immediate submitter bonuses + voter rewards claimable after round
                settlement (rate halving schedule)
              </td>
            </tr>
            <tr>
              <td className="font-medium">Consensus Subsidy</td>
              <td className="font-mono">4,000,000 cREP</td>
              <td>Pre-funded reserve for unanimous round rewards, replenished by 5% of each losing pool</td>
            </tr>
            <tr>
              <td className="font-medium">Treasury</td>
              <td className="font-mono">10,000,000 cREP</td>
              <td>Governance-controlled cREP tokens for grants, whistleblower rewards, and protocol development</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>HumanFaucet</h3>
      <p>
        Primary distribution via{" "}
        <a href="https://self.xyz" target="_blank" rel="noopener noreferrer" className="link link-primary">
          Self.xyz
        </a>{" "}
        passport verification with age verification (18+). Each passport can claim once. Claim amounts decrease as more
        users join &mdash; rewarding early adopters who bootstrap the platform with content.
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
      <div className="not-prose my-6">
        <FaucetTierChart />
      </div>
      <p>
        The 52M faucet pool serves <strong>up to ~41 million users</strong> without referrals (~15M with full referral
        usage). Referral bonuses scale proportionally at 50% of the claim amount. The first 10 Genesis claimants receive
        10,000 cREP each to bootstrap the platform from day one. As the platform grows and becomes more populated, later
        claimants need fewer tokens since there is already content to engage with. The decreasing schedule also reduces
        exploitation risk as the platform becomes more visible.
      </p>

      <h3>Participation Pool</h3>
      <p>
        The participation pool solves the <strong>cold start problem</strong>. When the platform is new and vote stakes
        are small, round rewards alone may not be enough to attract voters and submitters. The participation pool pays a{" "}
        <strong>proportional bonus on stake</strong>: submitters are rewarded immediately on submission, while revealed
        voters can claim their participation rewards after round settlement (regardless of vote outcome). The voter
        reward rate is snapshotted at settlement time for fairness. Early participants receive the most thanks to a
        halving schedule: as cumulative rewards grow, the reward rate decreases. This creates a strong incentive to
        participate early and helps bootstrap the network.
      </p>
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
      <p>
        Voter participation rewards are distributed only after a round settles &mdash; deferred from commit time to
        prevent exploitation where attackers could commit votes, collect immediate rewards, and then have rounds cancel
        without risk. Submitter participation rewards are paid at submission time to bootstrap content supply. The pool
        is funded with <strong>34M cREP</strong> and governed by the same timelock as all other protocol contracts.
      </p>
      <div className="not-prose my-6">
        <FaucetHalvingChart />
      </div>

      <h3>Treasury</h3>
      <p>
        The governance treasury starts with <strong>10M cREP</strong> and grows over time through three inflow sources:
        a 1% fee from every round settlement, slashed submitter stakes (when content rating drops below 10%), and
        forfeited unrevealed vote stakes. Treasury tokens are distributed exclusively via governance proposals &mdash;
        for grants, whistleblower rewards, and protocol development.
      </p>

      <hr />

      <h2>Point Distribution</h2>
      <p>
        When a round settles, the losing side&apos;s stakes are distributed. Winners also get their original stake back.
      </p>

      <h3>Pool Split</h3>
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
              <td>Voter pool (content-specific)</td>
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
              <td>Category submitters</td>
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
        The 82% voter share goes to a <strong>content-specific pool</strong>, distributed proportionally by stake to
        winning voters on that content. An additional 5% goes to a consensus subsidy reserve. Because each content item
        has independent rounds that settle on their own timeline, rewards are claimable immediately after settlement.
        The 1% treasury fee goes to the governance timelock.
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
              <td>Returned after grace period if rating stays above 10%</td>
            </tr>
            <tr>
              <td>Register as frontend</td>
              <td className="font-mono">1,000 cREP</td>
              <td>Requires governance approval</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Submitter stakes are slashed (100% to treasury) if content rating drops below 10% after a 24-hour grace period.
        Unrevealed votes forfeit their entire stake to the treasury.
      </p>
    </article>
  );
};

export default Tokenomics;
