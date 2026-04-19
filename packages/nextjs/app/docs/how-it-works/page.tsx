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
        Question-first voting with blind cREP stakes and mandatory non-refundable bounties.
      </p>

      <h2>Asking a Question</h2>
      <p>
        Curyo&apos;s submission flow starts with a question, not a generic post. The question is capped at 120
        characters so it stays readable in discovery, and longer context belongs in the description. Every question
        requires a context URL, with optional image or YouTube preview media when it helps discovery. A bounty must be
        attached at submission, funded in cREP or USDC on Celo, and is non-refundable after submission. The UI displays
        the amount in the funding asset so users can read it at a glance. There is no hard bounty cap; moderation,
        funding, and validation guardrails do the real work instead.
      </p>
      <p>
        The creator also chooses the round settings inside governance bounds: blind phase length, maximum duration,
        settlement voters, and voter cap. The defaults are {protocolDocFacts.blindPhaseDurationLabel},{" "}
        {protocolDocFacts.maxRoundDurationLabel}, {protocolDocFacts.minVotersLabel} settlement voters, and a{" "}
        {protocolDocFacts.maxVotersLabel}-voter cap, but high-urgency bounties can ask for a shorter clock while broader
        questions can require more voters.
      </p>
      <p>
        The same question-first path is what makes the protocol useful to bots and AI agents: when an automated strategy
        is unsure, it can submit the uncertainty through the same human-facing flow as everyone else, for verified
        humans to stake their judgment, while the submission itself remains permissionless.
      </p>
      <ul>
        <li>
          Launch inputs support 120-character questions, a required context URL, and optional image or YouTube preview
          media.
        </li>
        <li>Submitting a question does not require Voter ID; voting and some claims still do.</li>
        <li>Duplicate checks and moderation rules keep the submission surface narrow.</li>
      </ul>

      <h2 id="on-chain-settlement">On-chain Settlement</h2>
      <p>
        Curyo records submissions, voting rounds, reward pools, and settlement outcomes through Celo smart contracts.
        The app and indexer make those records readable, but the core lifecycle still runs through on-chain state:
        content registration, cREP stake commits, reveal checks, rating updates, and claimable rewards.
      </p>
      <p>
        This matters for agent feedback because the returned answer is not only a frontend message. It is an auditable
        rating history with transaction hashes, round IDs, revealed-vote counts, and bounty claims that other frontends,
        bots, or researchers can inspect later.
      </p>

      <h2 id="commit-reveal-voting">Commit-reveal Voting</h2>
      <p>
        Each content item has independent rounds. The selected question settings are snapshotted when a round opens, so
        later governance changes or new defaults cannot move an active round&apos;s clock or settlement threshold. You
        vote <strong>up</strong> or <strong>down</strong> with cREP, your direction stays hidden during the blind phase,
        and early voters earn more reward weight than later voters. In the redeployed tlock model, commits also bind the
        target reveal round and drand chain hash, and malformed ciphertexts are rejected on-chain.
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
          <strong>Resolve:</strong> Once the selected voter threshold is revealed and reveal conditions are met, the
          round settles, the rating updates, and rewards become claimable.
        </li>
      </ol>

      <h3 id="blind-voting">Blind Voting</h3>
      <p>
        Vote directions are encrypted during the selected blind phase. The default is{" "}
        <strong>{protocolDocFacts.blindPhaseDurationLabel}</strong>, and governance bounds currently allow{" "}
        {protocolDocFacts.minBlindPhaseDurationLabel} to {protocolDocFacts.maxBlindPhaseDurationLabel}. After that,
        later votes may see revealed directions and only receive{" "}
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

      <h2 id="zk-proof-of-human">ZK Proof-of-Human</h2>
      <p>
        Voting and some reward paths depend on Voter ID, a non-transferable identity token minted after Self.xyz
        verification. The verification flow uses zero-knowledge proofs to check humanity, age, and sanctions eligibility
        without publishing a passport, biometric document, date of birth, or legal name on-chain.
      </p>
      <p>
        The result is a practical sybil-resistance layer for Curyo: one verified person can hold one Voter ID, while
        their private identity documents stay off the public ledger.
      </p>

      <h2>cREP Stake Settlement</h2>
      <p>
        When a round settles, the cREP system handles stake recovery and cREP payouts. Winners recover their stake and
        share the losing cREP pool. Revealed losers can still reclaim{" "}
        <strong>{protocolDocFacts.revealedLoserRefundPercentLabel}</strong> of raw stake, which gives voters an
        incentive to reveal their votes before settlement. After that, the remaining losing pool splits{" "}
        <strong>{protocolDocFacts.rewardSplitSummaryLabel}</strong>. This split is cREP-only and does not include the
        attached bounty.
      </p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>

      <h2 id="stablecoin-bounties">USDC Bounties</h2>
      <p>
        Bounties are separate from cREP stake settlement. A submitter can attach cREP or USDC to a specific question,
        and the app displays that amount in the funding asset for readability. When a funded round qualifies, eligible
        revealed voters can claim the voter share of the attached bounty regardless of whether their cREP vote won or
        lost. Each new bounty reserves 3% of qualified claim value for the eligible frontend operator attached at vote
        commit time; if no eligible frontend can be paid, that share remains with the voter claim.
      </p>
      <ul>
        <li>Bounties are scoped to one question, not the global cREP participation pools.</li>
        <li>Claims depend on eligibility, reveal participation, and the bounty&apos;s round requirements.</li>
        <li>There is no stablecoin bonus for being on the winning cREP side at launch.</li>
      </ul>

      <h2>Content Rating</h2>
      <p>
        In the redeployed rating model, each content item still starts at <strong>50</strong>, but the protocol no
        longer recomputes a fresh absolute score from a single round. Instead, when a round opens it snapshots a
        canonical <strong>round reference score</strong>, and voters decide whether that displayed score in the single
        0-100 community rating is too low or too high.
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
        With Curyo Wallet, ID-verified accounts get <strong>{freeTransactionLimit}</strong> sponsored app transactions.
        Other wallets use normal Celo network fees.
      </p>
      <p>
        You only need a small CELO balance for gas on Celo mainnet. cREP is for voting stake, not gas. If you top up
        from an exchange, withdraw <strong>CELO on the Celo network</strong> to your Curyo wallet address. Bounties are
        shown in the funding asset, and cREP or USDC can both be used at submission.
      </p>

      <p>
        See <Link href="/docs/tokenomics">Tokenomics</Link> for cREP economics and USDC bounty details, and{" "}
        <Link href="/docs/smart-contracts">Smart Contracts</Link> for advanced lifecycle rules.
      </p>
    </article>
  );
};

export default HowItWorks;
