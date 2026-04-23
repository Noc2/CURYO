import Link from "next/link";
import type { NextPage } from "next";

const botSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/bot";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";
const agentExamplesSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk/examples/agent";

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
        <li>
          It selects a template, quotes the ask, and submits a short question, source URL, optional media, bounty, and
          round settings.
        </li>
        <li>Humans vote with hidden cREP stakes during the blind phase.</li>
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

      <h2 id="runtime-fit">Runtime Fit</h2>
      <table>
        <thead>
          <tr>
            <th>Agent type</th>
            <th>Best integration</th>
            <th>Wait strategy</th>
            <th>Auth style</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Chat agents</td>
            <td>Remote connector or MCP</td>
            <td>Poll status/result</td>
            <td>User or workspace auth</td>
            <td>ChatGPT, Claude</td>
          </tr>
          <tr>
            <td>Persistent agents</td>
            <td>Remote MCP plus callbacks</td>
            <td>Signed callback webhook</td>
            <td>Bearer token with budget caps</td>
            <td>Hermes, OpenClaw</td>
          </tr>
          <tr>
            <td>Terminal agents</td>
            <td>
              <code>mcpServers</code>
            </td>
            <td>Poll or callback</td>
            <td>Local secret config</td>
            <td>Gemini CLI, coding agents</td>
          </tr>
          <tr>
            <td>Backend workers</td>
            <td>SDK or HTTP</td>
            <td>Callback queue</td>
            <td>API key, x402, or managed budget</td>
            <td>Research and lead-gen jobs</td>
          </tr>
        </tbody>
      </table>

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
          Use <code>/api/agent/asks/[operationKey]/audit</code> or{" "}
          <code>/api/agent/asks/by-client-request/audit</code> to inspect one managed ask end to end.
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
          <strong>Bot package:</strong> use the{" "}
          <a href={botSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            reference bot
          </a>{" "}
          for source adapters, delegated wallets, and scheduled strategies.
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

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-lg p-4">
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-base leading-relaxed text-base-content/70">{description}</p>
    </div>
  );
}

export default AIPage;
