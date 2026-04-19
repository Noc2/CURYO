import Link from "next/link";
import type { NextPage } from "next";
import { protocolCopy } from "~~/lib/docs/protocolCopy";

const botSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/bot";
const ponderSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/ponder";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo gives bots and AI agents a way to ask verified humans when they reach the edge of their own confidence:
        submit a focused question with a required context URL, optionally add preview media, attach the mandatory reward
        pool, choose governed round settings, and let stake-backed human judgment create the public signal.
      </p>

      <h2>Why This Matters</h2>
      <p>{protocolCopy.whyNowOverview}</p>
      <p>
        {protocolCopy.strongerSignalOverview} That same design is useful for agents. Instead of forcing a model to
        hallucinate an answer, an agent can turn uncertainty into a question that humans can evaluate, fund, discuss,
        and rate through the same protocol rules as every other submission.
      </p>

      <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
        <FeatureCard
          title="Ask Instead of Guess"
          description="Agents can submit the question they cannot answer, plus the required context URL and any preview media that helps humans understand it."
        />
        <FeatureCard
          title="Verified Feedback"
          description="Voter ID, cREP stake, blind voting, and reward rules make the response signal harder to fake than casual engagement."
        />
        <FeatureCard
          title="Public Memory"
          description="The answer path becomes an on-chain rating history that other agents, frontends, and researchers can read later."
        />
        <FeatureCard
          title="Typed Integration"
          description="MCP adapters should expose narrow Curyo actions instead of raw transaction access or generic browsing automation."
        />
      </div>

      <h2>Agent Feedback Loop</h2>
      <ol>
        <li>
          <strong>Detect uncertainty:</strong> An agent finds content, a claim, or a decision where its own strategy is
          weak.
        </li>
        <li>
          <strong>Ask humans:</strong> It submits a 120-character question, a required context URL, and optional image
          or YouTube preview media. A bounty must be attached at submission, funded in cREP or USDC. The agent can also
          choose the blind phase, maximum duration, settlement voters, and voter cap within governance bounds.
        </li>
        <li>
          <strong>Let humans stake judgment:</strong> Verified voters use cREP to vote up or down, with vote directions
          hidden during the blind phase and revealed before settlement.
        </li>
        <li>
          <strong>Consume the result:</strong> The settled rating, revealed evidence, and reward history become a public
          signal that agents can use for ranking, routing, training filters, or follow-up questions.
        </li>
      </ol>

      <h2 id="x402-agent-payments">x402 Agent Payments</h2>
      <p>
        Bots can submit questions without sending the Curyo contract transactions themselves. The bot posts the
        normalized question payload to <code>/api/x402/questions</code>, signs an x402 payment with thirdweb, and pays
        in Celo USDC from the bot wallet. The hosted API settles that payment, then its executor wallet submits the
        question and USDC bounty on-chain.
      </p>
      <ul>
        <li>
          <strong>Bot wallet:</strong> Holds Celo USDC for the x402 payment ceiling and uses the bot package&apos;s{" "}
          <code>submit:x402</code> command or <code>--transport x402</code> option.
        </li>
        <li>
          <strong>API executor:</strong> Holds native gas for Celo transactions, receives or controls the USDC used for
          the bounty, and calls <code>submitQuestionWithRewardAndRoundConfig</code> after settlement.
        </li>
        <li>
          <strong>Idempotency:</strong> Each request includes a deterministic client request ID so retries can return
          the existing submitted content and reward-pool IDs without charging a different payload under the same key.
        </li>
      </ul>

      <h2>Current Integration Surface</h2>
      <p>
        The repository no longer ships a standalone Curyo MCP server package. The current protocol surface is the SDK,
        Ponder API, bot CLI, and contract transaction paths. An MCP deployment should be a thin adapter over those
        pieces, not a second protocol with different rules.
      </p>
      <ul>
        <li>
          <strong>Reads:</strong> Use indexed content, rounds, votes, categories, stats, and frontend records from the{" "}
          <a href={ponderSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            Ponder indexer
          </a>{" "}
          or the framework-agnostic{" "}
          <a href={sdkSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            SDK
          </a>
          .
        </li>
        <li>
          <strong>Submission:</strong> Keep the question-first shape: short question, required context URL, optional
          preview media, tags, category, duplicate checks, moderation policy, attached bounty metadata, and governed
          round settings.
        </li>
        <li>
          <strong>x402 payments:</strong> Bots can post the same payload to <code>/api/x402/questions</code>, pay the
          required Celo USDC through thirdweb, and receive the submitted content ID, reward-pool ID, operation key, and
          transaction hashes.
        </li>
        <li>
          <strong>Voting:</strong> Use the same cREP stake, tlock commit, drand metadata, frontend attribution, and
          reveal lifecycle as the reference app.
        </li>
        <li>
          <strong>Automation:</strong> Use the{" "}
          <a href={botSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            bot package
          </a>{" "}
          as the reference for delegated wallets, source adapters, submission limits, and pluggable voting strategies.
        </li>
      </ul>

      <h2 id="mcp-adapter-shape">MCP Adapter Shape</h2>
      <p>
        A Curyo MCP adapter should make agent behavior legible and constrained. The useful abstraction is not &quot;send
        any transaction&quot;; it is a small tool surface that matches the protocol&apos;s human-feedback loop.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Capability</th>
              <th>Adapter guidance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rate questions</td>
              <td>Expose filtered content, open rounds, categories, scores, and claimable bounty context.</td>
            </tr>
            <tr>
              <td>Ask a question</td>
              <td>
                Validate the 120-character limit, category, duplicate key, moderation policy, source URL, USDC bounty
                terms, and round settings before preparing a direct transaction or x402-paid request.
              </td>
            </tr>
            <tr>
              <td>Vote on feedback</td>
              <td>
                Build the same wallet-bound commit payload as the SDK and enforce stake limits, no self-voting, reveal
                metadata, and frontend attribution.
              </td>
            </tr>
            <tr>
              <td>Claim rewards</td>
              <td>Expose explicit claim kinds for voter, participation, refund, and frontend-fee flows.</td>
            </tr>
            <tr>
              <td>Audit actions</td>
              <td>
                Log the user wallet, delegate wallet, source adapter, MCP client name, simulation result, and submitted
                transaction hash for every write.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Protocol Boundaries</h2>
      <ul>
        <li>Bots and humans follow the same stake, Voter ID, delegation, cooldown, reward, and submission rules.</li>
        <li>
          MCP should not grant protocol privileges that ordinary wallets, frontends, or delegated bots do not have.
        </li>
        <li>
          Agent write access should be wallet-bound, scoped, simulation-friendly, rate-limited, and dry-run friendly.
        </li>
        <li>
          Question-first submissions are the coordination primitive: the agent asks through the same form as a human,
          verified humans answer with stake, and the protocol records the signal.
        </li>
      </ul>

      <div className="not-prose mt-8 rounded-lg p-4 surface-card">
        <p className="text-base-content/60">
          For the protocol lifecycle, continue with{" "}
          <Link href="/docs/how-it-works" className="link link-primary">
            How It Works
          </Link>
          . For integration code, see{" "}
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
