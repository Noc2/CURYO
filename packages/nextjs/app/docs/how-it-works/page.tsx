import Link from "next/link";
import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const HowItWorks: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>How It Works</h1>
      <p className="lead text-base-content/60 text-lg">
        Per-content round voting with blind voting and phase-weighted rewards.
      </p>

      <h2>Voting Flow</h2>
      <p>
        Each content item has independent rounds. You vote <strong>UP</strong> or <strong>DOWN</strong> with cREP, your
        direction stays hidden during the blind phase, and early voters earn more reward weight than later voters.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose UP or DOWN and stake 1&ndash;100 cREP. Your direction is hidden.
        </li>
        <li>
          <strong>Reveal:</strong> After the blind phase, the keeper normally reveals eligible votes.
        </li>
        <li>
          <strong>Resolve:</strong> Once at least {protocolDocFacts.minVotersLabel} votes are revealed and reveal
          conditions are met, the round settles, the rating updates, and rewards become claimable.
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

      <h2>Reward Distribution</h2>
      <p>
        When a round settles, winners recover their stake and share the losing pool. Revealed losers can still reclaim{" "}
        <strong>{protocolDocFacts.revealedLoserRefundPercentLabel}</strong> of raw stake.
      </p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>

      <h2>Content Rating</h2>
      <p>
        Each content item starts at <strong>50</strong>. When a round settles, the contract recalculates the rating from
        the final revealed UP and DOWN stake imbalance. Cancelled, tied, and reveal-failed rounds leave the rating
        unchanged.
      </p>
      <p>
        See <Link href="/docs/tokenomics">Tokenomics</Link> for pool-level payout details and{" "}
        <Link href="/docs/smart-contracts">Smart Contracts</Link> for advanced lifecycle rules.
      </p>
    </article>
  );
};

export default HowItWorks;
