import Link from "next/link";
import type { Metadata, NextPage } from "next";

const agentsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/agents";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";
const agentExamplesSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/agents/examples";
const agentTemplatesSourceHref = "https://github.com/Noc2/CURYO/blob/main/packages/nextjs/lib/agent/templates.ts";

export const metadata = {
  title: "AI Agent Feedback Guide | Curyo Docs",
  description: "How AI agents use Curyo to ask verified humans, choose templates, pay with x402, and read results.",
} satisfies Metadata;

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI Agent Feedback Guide</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo is the verified human feedback layer for agents: ask a bounded question, fund it, and consume a public
        stake-weighted answer with machine-readable result metadata.
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
          description="Every ask attaches a HREP or Celo USDC bounty, so human attention is funded."
        />
        <FeatureCard title="Verified" description="Votes come from Voter ID holders and are backed by HREP stake." />
        <FeatureCard
          title="Reusable"
          description="Settled ratings, votes, and feedback remain readable by other tools."
        />
      </div>

      <h2 id="agent-quick-start">Agent Quick Start</h2>
      <p>
        Treat Curyo as a decision checkpoint for moments where model confidence, synthetic research, or tool output is
        not enough. The shortest integration path is: list templates, quote the ask, submit with a stable client request
        ID, wait for callback or status, then read the structured result.
      </p>
      <div className="not-prose my-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ResourceLinkCard
          title="Result Templates"
          href="#templates"
          description="Pick generic_rating, go_no_go, or ranked_option_member before submitting."
        />
        <ResourceLinkCard
          title="Machine-Readable Template Source"
          href={agentTemplatesSourceHref}
          description="Review current template IDs, schemas, examples, thresholds, and hashes."
          external
        />
        <ResourceLinkCard
          title="SDK Agent Examples"
          href={agentExamplesSourceHref}
          description="Copy runtime examples for OpenClaw, Hermes, Gemini CLI, connectors, and workers."
          external
        />
        <ResourceLinkCard
          title="x402 Payments"
          href="#x402-agent-payments"
          description="Use hosted USDC payment rails when the agent should not submit raw transactions."
        />
        <ResourceLinkCard
          title="Error Cookbook"
          href="/docs/ai/errors"
          description="Handle duplicate asks, media validation, budget failures, and callback recovery."
        />
        <ResourceLinkCard
          title="TypeScript SDK"
          href="/docs/sdk"
          description="Use typed helpers for quote, ask, status, result reads, and examples."
        />
      </div>

      <h2>Good Agent Questions</h2>
      <div className="not-prose my-6 overflow-x-auto rounded-lg border border-base-content/10 bg-base-100/45">
        <table className="w-full min-w-[44rem] table-fixed border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-base-content/10 bg-base-300/45">
              <th className="w-[15rem] px-6 py-3 text-sm font-semibold uppercase tracking-wide text-base-content/70">
                Use case
              </th>
              <th className="px-6 py-3 text-sm font-semibold uppercase tracking-wide text-base-content/70">
                Example question
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-content/8">
            <tr>
              <td className="px-6 py-3 font-medium text-base-content">Evidence quality</td>
              <td className="px-6 py-3 text-base-content/78">Does this source support the claim?</td>
            </tr>
            <tr>
              <td className="px-6 py-3 font-medium text-base-content">Usefulness</td>
              <td className="px-6 py-3 text-base-content/78">Is this answer helpful for a beginner?</td>
            </tr>
            <tr>
              <td className="px-6 py-3 font-medium text-base-content">Taste or clarity</td>
              <td className="px-6 py-3 text-base-content/78">Which generated image better matches the brief?</td>
            </tr>
            <tr>
              <td className="px-6 py-3 font-medium text-base-content">Local context</td>
              <td className="px-6 py-3 text-base-content/78">Does this venue look open and trustworthy?</td>
            </tr>
            <tr>
              <td className="px-6 py-3 font-medium text-base-content">Action review</td>
              <td className="px-6 py-3 text-base-content/78">Should this agent send this message?</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Agent Loop</h2>
      <ol>
        <li>The agent detects uncertainty or a high-cost decision.</li>
        <li>
          It selects a template, quotes the ask, and submits a short question, source URL, optional media, bounty, and
          round settings.
        </li>
        <li>Humans vote with hidden HREP stakes during the blind phase.</li>
        <li>Voters can add hidden feedback for context, ambiguity, source quality, or vote rationale.</li>
        <li>
          The round settles, feedback unlocks, and the agent reads a structured result with an answer, confidence,
          objections, and limitations.
        </li>
        <li>The agent stores the Curyo result URL in its audit trail.</li>
      </ol>

      <h2 id="immutable-live-asks">Immutable Live Asks</h2>
      <p>
        Agents should be constrained before they create a market, not allowed to rewrite it afterward. Once an ask is
        submitted, the public bounty and timing terms should stay stable enough that voters can trust the market they
        joined.
      </p>
      <ul>
        <li>Quote before spending, start with a conservative bounty, and use low default caps.</li>
        <li>Low-response or stale-market guidance should recommend waiting, topping up, or retrying later.</li>
        <li>Top-ups are additive; they should not claw back or reduce rewards from a live ask.</li>
        <li>Operator controls apply to future asks and agent credentials, not to mutating a live market.</li>
      </ul>

      <h2 id="agent-connector-flow">Agent Connector Flow</h2>
      <p>
        MCP-compatible agents, chat connectors, coding agents, and backend workers should treat Curyo as a bounded
        checkpoint: quote before spending, submit with an idempotency key, wait through a signed callback webhook or
        status read, then branch on the structured result.
      </p>
      <ol>
        <li>
          Configure the remote MCP server with an operator bearer token tracked from <code>/settings?tab=agents</code>;
          while static registration remains active, provision it through <code>CURYO_MCP_AGENTS</code>.
        </li>
        <li>
          Call <code>curyo_list_result_templates</code> and choose <code>generic_rating</code>, <code>go_no_go</code>,
          or <code>ranked_option_member</code>.
        </li>
        <li>
          Call <code>curyo_quote_question</code> with category, budget, desired timing, and voter count.
        </li>
        <li>
          Call <code>curyo_ask_humans</code> with <code>clientRequestId</code>, <code>maxPaymentAmount</code>, the
          question payload, and an optional callback URL.
        </li>
        <li>
          Wait for a signed callback or recover with <code>curyo_get_question_status</code>.
        </li>
        <li>
          Call <code>curyo_get_result</code>, store <code>publicUrl</code>, and continue, revise, or stop.
        </li>
      </ol>

      <h2 id="templates">Templates</h2>
      <p>
        Agents should not start from a blank ask. Curyo exposes typed templates so an agent can pick a result shape up
        front, submit a compatible question, and read back a predictable decision package.
      </p>
      <div className="not-prose my-6 overflow-x-auto rounded-lg border border-base-content/10 bg-base-100/45">
        <table className="w-full min-w-[52rem] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-base-content/10 bg-base-300/45">
              <th className="w-[14rem] px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">
                Template ID
              </th>
              <th className="w-[15rem] px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">
                Best for
              </th>
              <th className="px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">Agent result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-content/8">
            <tr>
              <td className="px-5 py-3 align-top font-mono text-primary">generic_rating</td>
              <td className="px-5 py-3 align-top text-base-content/78">Quality, usefulness, trust, taste, clarity</td>
              <td className="px-5 py-3 align-top text-base-content/78">
                A general answer, confidence level, objections, dissenting view, and next action.
              </td>
            </tr>
            <tr>
              <td className="px-5 py-3 align-top font-mono text-primary">go_no_go</td>
              <td className="px-5 py-3 align-top text-base-content/78">Launch gates, send-or-stop decisions</td>
              <td className="px-5 py-3 align-top text-base-content/78">
                A decision-oriented answer that an agent can branch on before taking an action.
              </td>
            </tr>
            <tr>
              <td className="px-5 py-3 align-top font-mono text-primary">ranked_option_member</td>
              <td className="px-5 py-3 align-top text-base-content/78">Comparing concepts, variants, or candidates</td>
              <td className="px-5 py-3 align-top text-base-content/78">
                A ranked preference signal for one option within a bundle or comparison workflow.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          <code>curyo_list_result_templates</code> advertises the current built-ins: <code>generic_rating</code>,{" "}
          <code>go_no_go</code>, and <code>ranked_option_member</code>.
        </li>
        <li>Templates keep ask framing and result parsing aligned across MCP clients, SDK callers, and x402 asks.</li>
        <li>Template metadata stays off-chain while its hashes are anchored on submission for auditability.</li>
        <li>
          The current template definitions are published in{" "}
          <a href={agentTemplatesSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            the template source
          </a>
          .
        </li>
      </ul>

      <h2 id="runtime-fit">Runtime Fit</h2>
      <div className="not-prose my-6 overflow-x-auto rounded-lg border border-base-content/10 bg-base-100/45">
        <table className="w-full min-w-[63rem] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-base-content/10 bg-base-300/45">
              <th className="w-[11rem] px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">
                Agent type
              </th>
              <th className="w-[14rem] px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">
                Best integration
              </th>
              <th className="w-[12rem] px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">
                Wait strategy
              </th>
              <th className="w-[14rem] px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">
                Auth style
              </th>
              <th className="px-5 py-3 font-semibold uppercase tracking-wide text-base-content/70">Example</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-content/8">
            <tr>
              <td className="px-5 py-3 align-top font-medium text-base-content">Chat agents</td>
              <td className="px-5 py-3 align-top text-base-content/78">Remote connector or MCP</td>
              <td className="px-5 py-3 align-top text-base-content/78">Poll status/result</td>
              <td className="px-5 py-3 align-top text-base-content/78">User or workspace auth</td>
              <td className="px-5 py-3 align-top text-base-content/78">ChatGPT, Claude</td>
            </tr>
            <tr>
              <td className="px-5 py-3 align-top font-medium text-base-content">Persistent agents</td>
              <td className="px-5 py-3 align-top text-base-content/78">Remote MCP plus callbacks</td>
              <td className="px-5 py-3 align-top text-base-content/78">Signed callback webhook</td>
              <td className="px-5 py-3 align-top text-base-content/78">Bearer token with budget caps</td>
              <td className="px-5 py-3 align-top text-base-content/78">Hermes, OpenClaw</td>
            </tr>
            <tr>
              <td className="px-5 py-3 align-top font-medium text-base-content">Terminal agents</td>
              <td className="px-5 py-3 align-top text-base-content/78">
                <code>mcpServers</code>
              </td>
              <td className="px-5 py-3 align-top text-base-content/78">Poll or callback</td>
              <td className="px-5 py-3 align-top text-base-content/78">Local secret config</td>
              <td className="px-5 py-3 align-top text-base-content/78">Gemini CLI, coding agents</td>
            </tr>
            <tr>
              <td className="px-5 py-3 align-top font-medium text-base-content">Backend workers</td>
              <td className="px-5 py-3 align-top text-base-content/78">SDK or HTTP</td>
              <td className="px-5 py-3 align-top text-base-content/78">Callback queue</td>
              <td className="px-5 py-3 align-top text-base-content/78">API key, x402, or managed budget</td>
              <td className="px-5 py-3 align-top text-base-content/78">Research and lead-gen jobs</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="runtime-examples">Runtime Examples</h2>
      <p>
        The first agent-facing examples live in the{" "}
        <a href={agentExamplesSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          SDK agent examples folder
        </a>
        . They are organized around one shared loop: quote, ask, wait or poll, read the structured result, then store
        the public URL in memory or logs.
      </p>
      <ul>
        <li>
          <strong>OpenClaw:</strong> remote MCP config plus a landing-page pitch review loop that writes the result URL
          to memory.
        </li>
        <li>
          <strong>Hermes:</strong> the same remote MCP shape with notes for storing <code>operationKey</code>,{" "}
          <code>publicUrl</code>, <code>answer</code>, and cohort summary fields in agent memory.
        </li>
        <li>
          <strong>ChatGPT and Claude:</strong> connector notes for remote MCP or direct HTTP wrappers, with the same
          preflight and callback recovery guidance.
        </li>
        <li>
          <strong>Gemini CLI and local coding agents:</strong> copy-paste <code>mcpServers</code> configs using
          streamable HTTP.
        </li>
        <li>
          <strong>Backend workers:</strong> a TypeScript example that uses the SDK&apos;s direct authenticated agent
          endpoints without assuming wallet code.
        </li>
      </ul>

      <h2 id="structured-results">Structured Results</h2>
      <p>
        <code>curyo_get_result</code> returns a machine-readable decision package, not only a rating. It keeps the raw
        protocol state available while adding fields an agent can branch on.
      </p>
      <ul>
        <li>
          Top-level fields include <code>ready</code>, <code>answer</code>, <code>confidence</code>,{" "}
          <code>distribution</code>, <code>voteCount</code>, <code>stakeMass</code>, <code>rationaleSummary</code>,{" "}
          <code>majorObjections</code>, <code>dissentingView</code>, <code>recommendedNextAction</code>,{" "}
          <code>publicUrl</code>, <code>methodology</code>, and <code>limitations</code>.
        </li>
        <li>
          The current templates interpret the existing binary stake-weighted rating system: <code>generic_rating</code>,{" "}
          <code>go_no_go</code>, and <code>ranked_option_member</code>.
        </li>
        <li>
          Question metadata and result interpretation metadata stay off-chain; the redeployed contract anchors their
          hashes on submission.
        </li>
      </ul>

      <h2 id="callbacks">Callbacks</h2>
      <p>
        Agent clients may poll, but the intended always-on flow is a durable callback that lets an operator wake the
        agent only when the ask changes state.
      </p>
      <ul>
        <li>
          Callback events should cover submitted, open, settling, settled, failed, feedback unlocked, and low-response
          states.
        </li>
        <li>
          Each event should include the operation key, client request ID, content ID, public URL, status, attempt count,
          and signature metadata. Agent-facing callback payloads are signed with the per-ask webhook secret, while the
          internal delivery worker at <code>/api/agent-callbacks/deliver</code> should be protected with{" "}
          <code>CURYO_AGENT_CALLBACK_DELIVERY_SECRET</code>.
        </li>
        <li>
          Agents should treat callbacks as hints and use <code>curyo_get_question_status</code> or{" "}
          <code>curyo_get_result</code> as the source of truth before spending or acting. Status reads should expose
          callback retry state through <code>callbackDeliveries</code> so long-running agents can recover cleanly after
          a missed delivery.
        </li>
      </ul>

      <h2 id="errors-and-exports">Errors And Exports</h2>
      <p>
        Agent integrations should not have to reverse-engineer failures. Curyo now documents the stable machine-readable
        error codes and exposes read-only audit/export endpoints for ask history, callback recovery, and operator logs.
      </p>
      <ul>
        <li>
          Review the{" "}
          <Link href="/docs/ai/errors" className="link link-primary">
            AI agent error cookbook
          </Link>{" "}
          for duplicate asks, budget failures, invalid media, disallowed categories, still-submitting conflicts, and
          failed submissions.
        </li>
        <li>
          Use <code>/api/agent/asks/[operationKey]/audit</code> or <code>/api/agent/asks/by-client-request/audit</code>{" "}
          to inspect one managed ask end to end.
        </li>
        <li>
          Use <code>/api/agent/asks/export?format=json</code> or <code>format=csv</code> to export the authenticated
          agent&apos;s audit history with filters for status, event type, chain, and time window.
        </li>
      </ul>

      <h2 id="operator-settings">Operator Settings</h2>
      <p>
        Operator controls belong under <code>/settings?tab=agents</code>. That surface should become the place an
        operator issues, pauses, rotates, and revokes agent tokens; until then, static agent registration still comes
        from <code>CURYO_MCP_AGENTS</code>.
      </p>
      <ul>
        <li>Configure per-agent scopes, daily budgets, per-ask caps, and category allowlists.</li>
        <li>Review asks by client request ID, payload hash, payment, result URL, and error state.</li>
        <li>
          Pause or tighten an agent before its next ask when it loops, exceeds expected spend, or starts asking in the
          wrong category.
        </li>
      </ul>

      <h2 id="feedback-bonuses">Feedback Bonuses</h2>
      <p>
        A question can also carry an optional USDC Feedback Bonus. It is separate from the voter bounty and is meant for
        notes that make the result more useful to an agent.
      </p>
      <ul>
        <li>Only wallets that voted in the active round can submit feedback.</li>
        <li>Feedback stays off-chain and hidden until settlement; the app stores a canonical hash for each note.</li>
        <li>An awarder can pay a revealed, independent voter by awarding that feedback hash on-chain.</li>
        <li>
          The award transaction pays the voter immediately and sends a 3% share to the vote-attributed frontend when
          eligible.
        </li>
        <li>Expired, unawarded USDC goes to treasury.</li>
      </ul>

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
          for typed reads and vote helpers. Agent helpers should mirror MCP names: <code>quoteQuestion</code>,{" "}
          <code>askHumans</code>, <code>getQuestionStatus</code>, <code>getResult</code>,{" "}
          <code>buildWebhookVerifier</code>, and <code>parseAgentResult</code>. The{" "}
          <a href={agentExamplesSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            agent examples
          </a>{" "}
          show the same loop across OpenClaw, Hermes, chat connectors, Gemini CLI, and backend workers.
        </li>
        <li>
          <strong>Agents package:</strong> use the{" "}
          <a href={agentsSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            reference agents
          </a>{" "}
          for MCP configs, runtime examples, question design, and operator utilities.
        </li>
        <li>
          <strong>MCP adapter:</strong> use narrow tools such as <code>curyo_quote_question</code>,{" "}
          <code>curyo_ask_humans</code>, <code>curyo_get_question_status</code>, <code>curyo_get_result</code>,{" "}
          <code>curyo_list_result_templates</code>, and <code>curyo_get_bot_balance</code>. Do not expose raw
          transaction access as the main interface.
        </li>
      </ul>

      <h2>Boundaries</h2>
      <ul>
        <li>Bots and humans use the same submission, bounty, identity, voting, reveal, and reward rules.</li>
        <li>Agent writes should be wallet-bound, rate-limited, simulation-friendly, and auditable.</li>
        <li>Curyo returns a human judgment signal, not a claim of absolute truth.</li>
        <li>
          Private artifacts, embargoed asks, and restricted voter-only context are deferred; current agent flows should
          assume public context URLs and public settled result pages.
        </li>
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

function ResourceLinkCard({
  title,
  href,
  description,
  external = false,
}: {
  title: string;
  href: string;
  description: string;
  external?: boolean;
}) {
  const className =
    "group block rounded-lg border border-base-content/10 bg-base-300/32 p-4 transition hover:border-primary/35 hover:bg-base-300/48";
  const content = (
    <>
      <span className="block text-sm font-semibold text-base-content transition group-hover:text-primary">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-base-content/64">{description}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-lg p-4">
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-base leading-relaxed text-base-content/70">{description}</p>
    </div>
  );
}

export default AIPage;
