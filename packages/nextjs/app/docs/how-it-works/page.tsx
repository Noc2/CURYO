import Link from "next/link";
import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";
import { getFreeTransactionLimit } from "~~/lib/env/server";

const HowItWorks: NextPage = () => {
  const freeTransactionLimit = getFreeTransactionLimit();

  return (
    <article className="prose max-w-none">
      <h1>How It Works</h1>
      <p className="lead text-base-content/60 text-lg">
        Ask a focused question, fund the round, let verified humans stake judgment, then read the settled signal.
      </p>

      <h2>1. Ask</h2>
      <p>
        Every submission starts with one question, a required context URL, and an optional image or YouTube preview. A
        non-refundable bounty in HREP or Celo USDC is attached at submission. The bounty pays eligible revealed voters
        after qualified rounds.
      </p>
      <p>
        The asker also chooses the round shape inside governance bounds: blind phase, maximum duration, settlement
        voters, and voter cap. Defaults are {protocolDocFacts.blindPhaseDurationLabel},{" "}
        {protocolDocFacts.maxRoundDurationLabel}, {protocolDocFacts.minVotersLabel} settlement voters, and a{" "}
        {protocolDocFacts.maxVotersLabel}-voter cap.
      </p>
      <ul>
        <li>Question submissions are permissionless.</li>
        <li>Voting and some claims require Voter ID.</li>
        <li>Agents and humans use the same submission path.</li>
      </ul>

      <h2 id="commit-reveal-voting">2. Vote</h2>
      <p>
        Voters stake 1&ndash;100 HREP on whether the visible rating should move <strong>up</strong> or{" "}
        <strong>down</strong>. Vote direction is encrypted during the blind phase so early voters cannot simply copy
        visible momentum.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Commit:</strong> choose direction and stake. The app submits an encrypted vote.
        </li>
        <li>
          <strong>Reveal:</strong> after the blind phase, the keeper normally reveals eligible votes. Users can
          self-reveal if needed.
        </li>
        <li>
          <strong>Settle:</strong> once reveal conditions and the selected voter threshold are met, the round resolves.
        </li>
      </ol>

      <h3 id="blind-voting">Blind Voting</h3>
      <p>
        The default blind phase is <strong>{protocolDocFacts.blindPhaseDurationLabel}</strong>. Votes made in the first
        epoch earn full reward weight. Later votes can see revealed information and receive{" "}
        <strong>{protocolDocFacts.openPhaseWeightLabel}</strong> reward weight.
      </p>

      <h3>Voting Rules</h3>
      <ul>
        <li>Content submitters cannot vote on their own submissions.</li>
        <li>After voting on a content item, a voter waits 24 hours before voting on it again.</li>
        <li>Each Voter ID can stake at most 100 HREP per content per round.</li>
      </ul>

      <h2 id="on-chain-settlement">3. Settle Rewards</h2>
      <h3 id="hrep-stake-settlement">HREP stake settlement</h3>
      <p>
        Winners recover their stake and share the HREP voter pool. Revealed losers can reclaim{" "}
        <strong>{protocolDocFacts.revealedLoserRefundPercentLabel}</strong> of raw stake. The remaining losing pool
        splits <strong>{protocolDocFacts.rewardSplitSummaryLabel}</strong>.
      </p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>
      <h3 id="stablecoin-bounties">Stablecoin bounties</h3>
      <p>
        Bounties are separate from HREP stake settlement. They are scoped to the question, paid in the funding asset,
        and can reward eligible revealed voters regardless of whether their HREP vote won.
      </p>
      <h3>Feedback bonuses</h3>
      <p>
        A Feedback Bonus is optional, USDC-only, and focused on making the result more useful to agents. The funder pays
        to create the pool. The awarder pays gas when awarding a feedback hash. Recipients do not need to claim: the
        award transaction transfers USDC directly.
      </p>
      <p>
        Awards can only go to revealed voters who are not the funder or submitter identity. Any unawarded remainder
        after the deadline goes to treasury.
      </p>

      <h2 id="content-rating">4. Read the Result</h2>
      <p>
        Content starts at 50. When a round opens, it snapshots the current score as the reference. Voters decide whether
        that score is too low or too high. Settlement moves the score from the reference using revealed, epoch-weighted
        evidence.
      </p>
      <p>
        Optional feedback stays hidden while the round is active and unlocks after settlement or another terminal round
        state. Only voters can submit it. That gives agents both a score and human notes they can store in their own
        audit trail.
      </p>

      <h2 id="zk-proof-of-human">Voter ID</h2>
      <p>
        Voter ID is a non-transferable identity token minted after Self.xyz verification. The zero-knowledge flow checks
        humanity, age, and sanctions eligibility without publishing personal documents on-chain.
      </p>

      <h2 id="transaction-costs">Transaction Costs</h2>
      <p>
        With Curyo Wallet, ID-verified accounts get <strong>{freeTransactionLimit}</strong> sponsored app transactions.
        Other wallets use normal Celo network fees. HREP is voting stake, not gas.
      </p>

      <p>
        Continue with <Link href="/docs/ai">AI Agent Feedback Guide</Link> for agent use,{" "}
        <Link href="/docs/tokenomics">Tokenomics</Link> for HREP and bounties, or{" "}
        <Link href="/docs/smart-contracts">Smart Contracts</Link> for contract-level detail.
      </p>
    </article>
  );
};

export default HowItWorks;
