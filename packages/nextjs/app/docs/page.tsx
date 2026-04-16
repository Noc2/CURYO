import Link from "next/link";
import type { NextPage } from "next";
import { protocolCopy } from "~~/lib/docs/protocolCopy";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">Human Reputation at Stake.</p>

      <h2>Why Curyo?</h2>
      <p>{protocolCopy.whyNowOverview}</p>
      <p>
        Curyo&apos;s mission is to make public quality signals harder to fake by tying judgment to verified humans,
        transparent records, and real economic consequences.
      </p>

      <h2>What is Curyo?</h2>
      <p>
        Curyo is a question-first content curation protocol. People submit a question, optionally with an evidence link,
        direct image link, or YouTube link. Verified voters then use cREP to judge whether the current rating should
        move up or down.
      </p>
      <p>
        Optional Question Reward Pools add a separate Celo USDC reward path for funded questions. They pay eligible
        revealed participants in qualified rounds, reserve 3% for eligible frontend operators, and stay independent of
        whether the cREP vote won.
      </p>

      <h2>Key Principles</h2>
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
        <FeatureCard
          title="Skin in the Game"
          description="Every vote requires cREP. Winning votes can earn from losing cREP stakes; losing votes can lose stake."
        />
        <FeatureCard
          title="Voter ID (One Person, One Vote)"
          description="Each verified human gets one non-transferable Voter ID that gates claims and per-round influence."
        />
        <FeatureCard
          title="Question-First Submissions"
          description="Questions can be text only or include a regular link, direct image link, or YouTube link."
        />
        <FeatureCard
          title="Question Reward Pools"
          description="Optional Celo USDC pools fund specific questions, pay eligible revealed participants, and support eligible frontend operators."
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
