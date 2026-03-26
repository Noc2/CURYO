import Link from "next/link";
import type { NextPage } from "next";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";
import { protocolCopy } from "~~/lib/docs/protocolCopy";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">A Better Web, Guided by Human Reputation.</p>

      <h2>What is Curyo?</h2>
      <p>{protocolCopy.predictionGamesOverview}</p>

      <h2>Key Principles</h2>
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
        <FeatureCard
          title="Skin in the Game"
          description="Every vote requires cREP. Good judgment earns rewards; bad judgment loses stake."
        />
        <FeatureCard
          title="Voter ID (One Person, One Vote)"
          description="Each verified human gets one non-transferable Voter ID with a per-round stake cap."
        />
        <FeatureCard
          title="Per-Content Rounds"
          description={`Each content item has its own blind-voting rounds, and early voters earn ${protocolDocFacts.earlyVoterAdvantageLabel} more reward weight.`}
        />
        <FeatureCard
          title="Contributor Rewards"
          description="Submitters and accurate voters earn when rounds settle."
        />
      </div>

      <h2>Voting Flow</h2>
      <p>
        Each content item has its own round. You vote <strong>up</strong> or <strong>down</strong> with cREP, your
        direction stays hidden during the blind phase, and early voters earn more reward weight.
      </p>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>
      <ol>
        <li>
          <strong>Vote:</strong> Choose up or down and stake 1&ndash;100 cREP. Your direction stays hidden.
        </li>
        <li>
          <strong>Reveal:</strong> After the blind phase ends, eligible votes are revealed.
        </li>
        <li>
          <strong>Resolve:</strong> Once reveal conditions are met, the round settles and rewards become claimable.
        </li>
      </ol>

      <h2>Content Rating</h2>
      <p>
        Every content item starts at <strong>50</strong>. When a round settles, the rating moves up or down from the
        final revealed up and down stake imbalance.
      </p>
      <p>
        Illegal content, broken content, and incorrect descriptions should always be downvoted regardless of the current
        rating. See <Link href="/docs/how-it-works">How It Works</Link> for the full flow.
      </p>
    </article>
  );
};

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-base leading-relaxed text-base-content/75">{description}</p>
    </div>
  );
}

export default DocsIntro;
