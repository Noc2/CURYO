import Link from "next/link";
import type { NextPage } from "next";
import { protocolCopy } from "~~/lib/docs/protocolCopy";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">Human Reputation at Stake.</p>

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
      <p>
        See <Link href="/docs/how-it-works">How It Works</Link> for the full voting lifecycle, content rating rules, and
        transaction-cost overview.
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
