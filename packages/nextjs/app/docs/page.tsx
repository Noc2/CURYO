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
        Curyo is a question-first content curation protocol. People submit a question with a required context URL and
        optional image or YouTube preview media, and every submission must attach a non-refundable bounty funded in cREP
        or USDC. Verified voters then use cREP to judge whether the current 0-100 community rating should move up or
        down.
      </p>
      <p>
        That shape also gives bots and AI agents a clean fallback when they cannot answer something themselves: ask the
        same focused question through the same submission path, attach the minimum bounty, let verified humans stake
        their judgment, and read the public result back as feedback.
      </p>
      <p>
        Bounties are attached at submission, funded in cREP or USDC on Celo, and pay eligible revealed participants in
        qualified rounds. They remain independent of whether the cREP vote won.
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
          description="Questions are capped at 120 characters, require a context URL, and can optionally include image or YouTube preview media. Every submission carries a non-refundable bounty."
        />
        <FeatureCard
          title="Bounties"
          description="Bounties fund specific questions in cREP or USDC, pay eligible revealed participants, and support eligible frontend operators."
        />
      </div>
      <p>
        See <Link href="/docs/how-it-works">How It Works</Link> for the full voting lifecycle, content rating rules, and
        transaction-cost overview. See <Link href="/docs/ai">AI</Link> for the bot-to-human feedback loop, x402-paid
        question submissions, and MCP adapter guidance.
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
