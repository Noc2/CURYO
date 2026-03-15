import Link from "next/link";
import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">Quality Signals Backed by Human Reputation.</p>

      <h2>Mission</h2>
      <p>
        The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of
        content, the flood of low-effort material will only accelerate — making trustworthy quality signals more
        critical than ever. Curyo fights back by tying every vote to a verified reputation. When you stake real tokens
        on your judgment, low-quality content loses and high-quality content rises — no algorithms, no ads, no
        manipulation.
      </p>

      <h2>What is Curyo?</h2>
      <p>
        Curyo replaces passive likes with <strong>prediction games</strong>. Voters predict whether content&apos;s
        rating will go UP or DOWN and back their predictions with cREP token stakes. The majority side wins and the
        losing side&apos;s stakes are distributed to the winners.
      </p>

      <h2>Key Principles</h2>
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
        <FeatureCard
          title="Skin in the Game"
          description="Every vote requires a token stake, aligning incentives. Points come from the losing side's stakes."
        />
        <FeatureCard
          title="Voter ID (One Person, One Vote)"
          description="Each verified human gets one non-transferable Voter ID, limiting stake to 100 cREP per content per round."
        />
        <FeatureCard
          title="Per-Content Rounds"
          description={`Each content item has independent rounds with blind voting. Blind phase voters earn ${protocolDocFacts.earlyVoterAdvantageLabel} more reward weight per cREP than open phase voters.`}
        />
        <FeatureCard
          title="Contributor Rewards"
          description={`After a ${protocolDocFacts.revealedLoserRefundPercentLabel} rebate for revealed losers, the remaining losing stake funds submitter, category, frontend, and winner rewards.`}
        />
      </div>

      <h2>Voting Flow</h2>
      <p>
        Voters predict whether content&apos;s rating will go <strong>UP</strong> or <strong>DOWN</strong> and back their
        prediction with a cREP stake. Vote directions are encrypted and hidden until the blind phase ends &mdash;
        phase-weighted rewards give early (blind) voters {protocolDocFacts.earlyVoterAdvantageLabel.replace(":1", "x")}{" "}
        more reward per cREP than later voters.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose UP or DOWN, select stake (1&ndash;100 cREP per Voter ID). Your vote direction is
          encrypted and hidden on-chain.
        </li>
        <li>
          <strong>Accumulate:</strong> Votes accumulate during the blind phase. Directions are hidden until the system
          reveals them after the blind phase ends.
        </li>
        <li>
          <strong>Resolve:</strong> After the blind phase ends, the keeper normally reveals eligible votes. Once at
          least {protocolDocFacts.minVotersLabel} votes are revealed, the round resolves. Connected users can also
          self-reveal if needed. The majority side wins and the losing side&apos;s stakes become the reward pool.
        </li>
      </ol>
      <p>The losing stakes are split:</p>
      <div className="not-prose my-6">
        <RewardSplitChart />
      </div>
      <p>
        Winners always get their original stake back plus their share of the pools. See{" "}
        <Link href="/docs/how-it-works">How It Works</Link> for full details.
      </p>

      <h2>Content Rating</h2>
      <p>
        Every content item has a <strong>rating from 0 to 100</strong>, starting at 50. After each round is resolved,
        the contract recalculates rating from the final revealed UP and DOWN stake pools using a smoothed
        stake-imbalance formula, keeping small rounds close to neutral and letting larger imbalances move rating
        further.
      </p>
      <p>
        Each category (platform) has a <strong>ranking question</strong> set by its creator &mdash; for example,
        &ldquo;Are the fundamentals of Bitcoin strong enough to score above 50 out of 100?&rdquo;. Categories define
        this as a template with <code>{"{title}"}</code> and <code>{"{rating}"}</code> placeholders, so every frontend
        can render the same content-specific prompt. When you vote UP or DOWN, you are answering this question for the
        current content. The question is displayed on the voting card.
      </p>
      <p>
        <strong>When to downvote:</strong> Illegal content, content that doesn&apos;t load, or content with an incorrect
        description should always be downvoted, regardless of the ranking question. Content that falls below a rating of
        25 after its grace period results in the submitter&apos;s deposit being forfeited.
      </p>
    </article>
  );
};

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-base text-base-content/50 leading-relaxed">{description}</p>
    </div>
  );
}

export default DocsIntro;
