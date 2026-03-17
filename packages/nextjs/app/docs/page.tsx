import Link from "next/link";
import type { NextPage } from "next";
import { RewardSplitChart } from "~~/components/docs/RewardSplitChart";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";
import { protocolCopy } from "~~/lib/docs/protocolCopy";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">A Better Web, Guided by Human Reputation.</p>

      <h2>Mission</h2>
      <p>
        The web is drowning in clickbait and fake engagement. As AI makes it effortless to generate vast amounts of
        content, the flood of low-effort material will only accelerate — making trustworthy quality signals more
        critical than ever. Curyo fights back by tying every vote to a verified reputation. When you stake real tokens
        on your judgment, low-quality content loses and high-quality content rises — no algorithms, no ads, no
        manipulation.
      </p>

      <h2>What is Curyo?</h2>
      <p>{protocolCopy.predictionGamesOverview}</p>

      <h2>Key Principles</h2>
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
        <FeatureCard
          title="Skin in the Game"
          description="Every vote requires a token stake, aligning incentives. Rewards come from settled losing pools and participation incentives, not passive likes."
        />
        <FeatureCard
          title="Voter ID (One Person, One Vote)"
          description="Each verified human gets one non-transferable Voter ID, limiting stake to 100 cREP per content per round."
        />
        <FeatureCard
          title="Per-Content Rounds"
          description={`Each content item has independent rounds with blind voting. Blind phase voters earn ${protocolDocFacts.earlyVoterAdvantageLabel} more reward weight per cREP than open phase voters.`}
        />
        <FeatureCard title="Contributor Rewards" description={protocolCopy.contributorRewardsOverview} />
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
          self-reveal if needed. The majority side wins the content-specific voter pool. Revealed losers can later claim
          a fixed rebate, and the remaining losing pool follows the fixed on-chain split.
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
        Categories no longer define a custom voting question. Instead, every vote asks whether the current community
        rating should move up or down based on the content itself, the surrounding evidence, and the current score.
        Frontends surface the live rating directly and explain the rating process through guidance text instead of a
        category-authored prompt.
      </p>
      <p>
        <strong>When to downvote:</strong> Illegal content, content that doesn&apos;t load, or content with an incorrect
        description should always be downvoted regardless of the current rating. Content that falls below a rating of 25
        after its grace period results in the submitter&apos;s deposit being forfeited.
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
