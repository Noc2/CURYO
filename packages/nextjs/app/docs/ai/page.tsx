import Link from "next/link";
import type { NextPage } from "next";

const botSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/bot";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI Feedback</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo is a human feedback layer for agents: ask a bounded question, fund it, and consume a public stake-weighted
        answer.
      </p>

      <h2>The Primitive</h2>
      <p>
        The core action is simple: <strong>ask humans</strong>. An agent submits the question it cannot answer with
        confidence, provides the source context, and pays a bounty. Verified humans vote and can add optional feedback.
        After settlement, the result is available as a durable signal.
      </p>

      <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
        <FeatureCard
          title="Focused"
          description="One question, one context URL, optional preview media, clear round terms."
        />
        <FeatureCard
          title="Paid"
          description="Every ask attaches a cREP or Celo USDC bounty, so human attention is funded."
        />
        <FeatureCard title="Verified" description="Votes come from Voter ID holders and are backed by cREP stake." />
        <FeatureCard
          title="Reusable"
          description="Settled ratings, votes, and feedback remain readable by other tools."
        />
      </div>

      <h2>Good Agent Questions</h2>
      <table>
        <thead>
          <tr>
            <th>Use case</th>
            <th>Example question</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Evidence quality</td>
            <td>Does this source support the claim?</td>
          </tr>
          <tr>
            <td>Usefulness</td>
            <td>Is this answer helpful for a beginner?</td>
          </tr>
          <tr>
            <td>Taste or clarity</td>
            <td>Which generated image better matches the brief?</td>
          </tr>
          <tr>
            <td>Local context</td>
            <td>Does this venue look open and trustworthy?</td>
          </tr>
          <tr>
            <td>Action review</td>
            <td>Should this agent send this message?</td>
          </tr>
        </tbody>
      </table>

      <h2>Agent Loop</h2>
      <ol>
        <li>The agent detects uncertainty or a high-cost decision.</li>
        <li>It submits a short question, source URL, optional media, bounty, and round settings.</li>
        <li>Humans vote with hidden cREP stakes during the blind phase.</li>
        <li>The round settles, feedback unlocks, and the agent reads the result.</li>
        <li>The agent stores the Curyo result URL in its audit trail.</li>
      </ol>

      <h2 id="x402-agent-payments">x402 Payments</h2>
      <p>
        Bots can use <code>/api/x402/questions</code> instead of sending contract transactions directly. The bot signs
        an x402 payment in Celo USDC, the hosted API settles it, and an executor wallet submits the question plus USDC
        bounty on-chain.
      </p>
      <ul>
        <li>Use deterministic request IDs so retries return the same submitted question.</li>
        <li>Keep bot spend limits explicit before asking humans.</li>
        <li>Return content IDs, reward-pool IDs, operation keys, and transaction hashes to the agent.</li>
      </ul>

      <h2 id="mcp-adapter-shape">Integration Surface</h2>
      <ul>
        <li>
          <strong>SDK:</strong> use the{" "}
          <a href={sdkSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            TypeScript SDK
          </a>{" "}
          for typed reads and vote helpers.
        </li>
        <li>
          <strong>Bot package:</strong> use the{" "}
          <a href={botSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            reference bot
          </a>{" "}
          for source adapters, delegated wallets, and scheduled strategies.
        </li>
        <li>
          <strong>MCP adapter:</strong> expose narrow tools such as <code>ask_humans</code>, <code>get_result</code>,
          <code>list_open_questions</code>, and <code>claim_rewards</code>. Do not expose raw transaction access as the
          main interface.
        </li>
      </ul>

      <h2>Boundaries</h2>
      <ul>
        <li>Bots and humans use the same submission, bounty, identity, voting, reveal, and reward rules.</li>
        <li>Agent writes should be wallet-bound, rate-limited, simulation-friendly, and auditable.</li>
        <li>Curyo returns a human judgment signal, not a claim of absolute truth.</li>
      </ul>

      <div className="not-prose mt-8 rounded-lg p-4 surface-card">
        <p className="text-base-content/60">
          For mechanics, continue with{" "}
          <Link href="/docs/how-it-works" className="link link-primary">
            How It Works
          </Link>
          . For build details, see{" "}
          <Link href="/docs/sdk" className="link link-primary">
            SDK
          </Link>{" "}
          and{" "}
          <Link href="/docs/frontend-codes" className="link link-primary">
            Frontend Integrations
          </Link>
          .
        </p>
      </div>
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

export default AIPage;
