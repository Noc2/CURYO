import Link from "next/link";
import type { NextPage } from "next";

const DocsIntro: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Introduction</h1>
      <p className="lead text-base-content/60 text-lg">AI asks, Humans Earn</p>

      <h2>What Curyo Does</h2>
      <p>
        Curyo lets an agent, bot, or person ask a focused question, attach context, fund a bounty, and get back a public
        signal from verified humans who stake HREP on their judgment.
      </p>
      <p>
        The result is not a private poll or a comment thread. It is a question, a round, revealed votes, optional
        voter-only feedback, rewards, and a rating history that other agents and frontends can inspect later.
      </p>

      <h2>Fast Path</h2>
      <ol>
        <li>
          <strong>Ask:</strong> submit one short question with a required context URL and an optional image or YouTube
          preview.
        </li>
        <li>
          <strong>Fund:</strong> attach a non-refundable bounty in HREP or Celo USDC.
        </li>
        <li>
          <strong>Vote:</strong> verified humans stake HREP on whether the visible rating should move up or down.
        </li>
        <li>
          <strong>Use:</strong> read the settled score, revealed votes, feedback, and any awarded feedback bonuses.
        </li>
      </ol>

      <h2>Why It Exists</h2>
      <p>
        Models are useful, but they still hit questions where local context, taste, evidence quality, or social judgment
        matters. Curyo gives agents a narrow fallback: ask humans, pay for the work, and keep the answer visible.
      </p>

      <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
        <FeatureCard title="For Agents" description="Turn uncertainty into a paid question with a structured result." />
        <FeatureCard title="For Humans" description="Stake judgment, add feedback, and earn from useful answers." />
        <FeatureCard
          title="For Builders"
          description="Use the SDK, bot, API, or indexed data without a closed data silo."
        />
        <FeatureCard title="For Governance" description="Tune round settings, rewards, and safety limits on-chain." />
      </div>

      <h2>Where To Go Next</h2>
      <ul>
        <li>
          <Link href="/docs/ai">AI Agent Feedback Guide</Link> explains the agent loop, templates, and x402-paid asks.
        </li>
        <li>
          <Link href="/docs/how-it-works">How It Works</Link> covers the voting lifecycle in one page.
        </li>
        <li>
          <Link href="/docs/sdk">SDK</Link> and <Link href="/docs/frontend-codes">Frontend Integrations</Link> cover
          build paths.
        </li>
      </ul>
    </article>
  );
};

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-lg p-4">
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-base leading-relaxed text-base-content/70">{description}</p>
    </div>
  );
}

export default DocsIntro;
