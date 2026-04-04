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
        Per-content round voting with blind voting and phase-weighted rewards.
      </p>

      <h2>Voting Flow</h2>
      <p>
        Each content item has independent rounds. You vote <strong>up</strong> or <strong>down</strong> with cREP, your
        direction stays hidden during the blind phase, and early voters earn more reward weight than later voters. In
        the redeployed tlock model, commits also bind the target reveal round and drand chain hash, and malformed
        ciphertexts are rejected on-chain.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose up or down and stake 1&ndash;100 cREP. Your direction is hidden.
        </li>
        <li>
          <strong>Reveal:</strong> After the blind phase, the keeper normally reveals eligible votes and users can
          self-reveal if needed. The keeper/runtime stack also performs deeper stanza checks against the stored drand
          metadata before decrypting.
        </li>
        <li>
          <strong>Resolve:</strong> Once at least {protocolDocFacts.minVotersLabel} votes are revealed and reveal
          conditions are met, the round settles, the rating updates, and rewards become claimable.
        </li>
      </ol>

      <h3 id="blind-voting">Blind Voting</h3>
      <p>
        Vote directions are encrypted during the first <strong>{protocolDocFacts.blindPhaseDurationLabel}</strong> to
        prevent herding. After that, later votes may see revealed directions and only receive{" "}
        <strong>{protocolDocFacts.openPhaseWeightLabel}</strong> reward weight instead of full weight.
      </p>
      <p>
        That creates a <strong>{protocolDocFacts.earlyVoterAdvantageLabel} early-voter advantage</strong>. If all
        revealed voters agree, a small consensus subsidy can replace the missing losing pool. If quorum never arrives by{" "}
        <strong>{protocolDocFacts.maxRoundDurationLabel}</strong>, the round cancels and refunds; if reveal quorum still
        never materializes after commit quorum, the round can finalize as reveal-failed.
      </p>

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
        <strong>{protocolDocFacts.revealedLoserRefundPercentLabel}</strong> of raw stake, which gives voters an
        incentive to reveal their votes before settlement. After that, the remaining pool splits{" "}
        <strong>{protocolDocFacts.rewardSplitSummaryLabel}</strong>.
      </p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>

      <h2>Content Rating</h2>
      <p>
        In the redeployed rating model, each content item still starts at <strong>50</strong>, but the protocol no
        longer recomputes a fresh absolute score from a single round. Instead, when a round opens it snapshots a
        canonical <strong>round reference score</strong>, and voters decide whether that displayed score is too low or
        too high.
      </p>
      <p>
        When the round settles, the next score is updated from that round reference using epoch-weighted revealed
        evidence, modest vote-share smoothing, and a dynamic confidence term. Stable history makes established content
        harder to move, while contradictory rounds can reopen confidence instead of locking bad early anchors in place.
        Cancelled, tied, and reveal-failed rounds still leave the score unchanged.
      </p>
      <div className="not-prose my-6 rounded-xl bg-base-200 p-4 text-sm text-base-content/80">
        <p className="font-medium text-base-content">Formula</p>
        <code className="mt-2 block whitespace-pre-wrap font-mono text-xs sm:text-sm">
          pObs = (weightedUp + alpha) / (weightedUp + weightedDown + alpha + beta)
          {"\n"}
          gap = logit(pObs) / observationBeta
          {"\n"}
          nextRating = sigmoid(logit(referenceRating) + boundedStep * gap)
        </code>
        <p className="mt-3">
          Here, <strong>referenceRating</strong> is the canonical score snapshot for the open round, while{" "}
          <strong>weightedUp</strong> and <strong>weightedDown</strong> are the epoch-weighted revealed cREP totals.
          Governance can later fine-tune the smoothing, confidence, and movement-cap parameters, but every round
          snapshots its config when it opens.
        </p>
        <p className="mt-3">
          <strong>Example:</strong> if repeated rounds keep settling at roughly <strong>60 up / 40 down</strong>, the
          score can keep rising from the currently displayed anchor instead of snapping back to the same value each
          time. A representative simulation path is:
        </p>
        <code className="mt-2 block whitespace-pre-wrap font-mono text-xs sm:text-sm">
          50.0 -&gt; 52.3 -&gt; 54.5 -&gt; 56.6
        </code>
      </div>

      <h2 id="transaction-costs">Transaction Costs</h2>
      <p>
        After ID verification, Curyo sponsors your first <strong>{freeTransactionLimit}</strong> app transactions. After
        that, you pay normal Celo network fees from the same wallet you use in Curyo.
      </p>
      <p>
        You only need a small CELO balance for gas on Celo mainnet. cREP is for voting stake, not gas. If you top up
        from an exchange, withdraw <strong>CELO on the Celo network</strong> to your Curyo wallet address.
      </p>

      <p>
        See <Link href="/docs/tokenomics">Tokenomics</Link> for pool-level payout details and{" "}
        <Link href="/docs/smart-contracts">Smart Contracts</Link> for advanced lifecycle rules.
      </p>
    </article>
  );
};

export default HowItWorks;
