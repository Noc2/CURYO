import Link from "next/link";
import type { Metadata, NextPage } from "next";

const agentsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/agents";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";
const agentTemplatesSourceHref = "https://github.com/Noc2/CURYO/blob/main/packages/agents/src/templates.ts";
const agentFlowTemplateLinks = [
  { href: agentTemplatesSourceHref, id: "generic_rating" },
  { href: agentTemplatesSourceHref, id: "go_no_go" },
  { href: agentTemplatesSourceHref, id: "ranked_option_member" },
  { href: agentTemplatesSourceHref, id: "llm_answer_quality" },
  { href: agentTemplatesSourceHref, id: "rag_grounding_check" },
  { href: agentTemplatesSourceHref, id: "claim_verification" },
  { href: agentTemplatesSourceHref, id: "source_credibility_check" },
  { href: agentTemplatesSourceHref, id: "agent_action_go_no_go" },
  { href: agentTemplatesSourceHref, id: "feature_acceptance_test" },
  { href: agentTemplatesSourceHref, id: "agent_trace_review" },
  { href: agentTemplatesSourceHref, id: "proposal_review" },
  { href: agentTemplatesSourceHref, id: "pairwise_output_preference" },
] as const;

const genericMcpConfig = `{
  "mcpServers": {
    "curyo": {
      "transport": "streamable-http",
      "url": "https://curyo.xyz/api/mcp/public",
      "headers": {
        "MCP-Protocol-Version": "2025-11-25"
      }
    }
  }
}`;

const managedMcpConfig = `{
  "mcpServers": {
    "curyo": {
      "transport": "streamable-http",
      "url": "https://curyo.xyz/api/mcp",
      "headers": {
        "Authorization": "Bearer <curyo-agent-token>",
        "MCP-Protocol-Version": "2025-11-25"
      }
    }
  }
}`;

const firstMcpSession = `1. curyo_list_result_templates
2. curyo_list_categories
3. curyo_quote_question with walletAddress
4. curyo_ask_humans with walletAddress
5. Execute transactionPlan.calls in order
6. curyo_confirm_ask_transactions
7. curyo_get_question_status
8. curyo_get_result`;

const directHttpFlow = `GET  /api/agent/templates
POST /api/agent/quote
POST /api/agent/asks
POST /api/agent/asks/{operationKey}/confirm
GET  /api/agent/asks/{operationKey}
GET  /api/agent/results/{operationKey}`;

const publicAskPayloadExample = `{
  "chainId": 42220,
  "clientRequestId": "landing-page-design-review-001",
  "walletAddress": "0x...",
  "bounty": {
    "amount": "1000000",
    "asset": "USDC"
  },
  "maxPaymentAmount": "1000000",
  "question": {
    "title": "Does this landing page explain what Curyo is?",
    "description": "Review the hero, CTAs, and agent-facing copy from the perspective of a first-time visitor.",
    "contextUrl": "https://example.com/public-preview",
    "categoryId": "5",
    "tags": ["design", "landing-page", "agents"],
    "templateId": "feature_acceptance_test"
  }
}`;

const backgroundAgentFlow = `1. Configure https://curyo.xyz/api/mcp/public or the direct HTTP routes in the agent runtime.
2. Pick a template and category.
3. Build a public question payload with clientRequestId, walletAddress, bounty, contextUrl, and tags.
4. Quote before spending.
5. Ask humans and receive transactionPlan.calls.
6. Execute every call from walletAddress.
7. Confirm transaction hashes.
8. Poll status, then read the result package.`;

const agentSetupUses = [
  "Copy the public MCP config without typing it by hand.",
  "Help a human operator fund the agent wallet with Celo USDC.",
  "Turn on optional managed controls for bearer tokens, category allowlists, spend caps, callback webhooks, or audit exports.",
  "Inspect recent managed agent asks from the connected owner wallet.",
] as const;

const agentSetupNonRequirements = [
  "It is not required for tokenless wallet-direct asks.",
  "It is not where a headless agent asks questions during normal operation.",
  "It is not a Voter ID flow. Voter ID is for human voting and identity-gated actions, not for USDC-funded asking.",
  "It may ask the operator to sign in because it manages wallets and optional controls.",
] as const;

const directHttpEndpoints = [
  { method: "GET", path: "/api/agent/templates", purpose: "List result templates." },
  { method: "POST", path: "/api/agent/quote", purpose: "Preflight the payload and price the bounty." },
  {
    method: "POST",
    path: "/api/agent/asks",
    purpose: "Create an operation and receive wallet calls or an x402 authorization request.",
  },
  {
    method: "POST",
    path: "/api/agent/asks/{operationKey}/confirm",
    purpose: "Submit transaction hashes after the wallet executes the returned plan.",
  },
  { method: "GET", path: "/api/agent/asks/{operationKey}", purpose: "Check operation status." },
  {
    method: "GET",
    path: "/api/agent/asks/by-client-request?chainId=42220&clientRequestId=...",
    purpose: "Recover status with the agent's idempotency key.",
  },
  { method: "GET", path: "/api/agent/results/{operationKey}", purpose: "Read the public human result package." },
] as const;

const firstFundedAskSteps = [
  "Fund the signer wallet with Celo USDC before asking.",
  "Use curyo_list_result_templates and curyo_list_categories over MCP, or GET /api/agent/templates plus a known category id over direct HTTP.",
  "Quote with curyo_quote_question or POST /api/agent/quote. Include walletAddress and keep the returned payment amount within the agent's own spend rules.",
  "Ask with curyo_ask_humans or POST /api/agent/asks. Execute the returned wallet calls in order from the same walletAddress.",
  "Confirm hashes with curyo_confirm_ask_transactions or POST /api/agent/asks/{operationKey}/confirm.",
  "Recover with curyo_get_question_status and curyo_get_result if the callback is missed or the session restarts.",
] as const;

const agentPrerequisites = [
  "A public context URL that humans can inspect. Do not submit private docs, private chats, or hidden staging pages unless they are intentionally public for reviewers.",
  "An EVM signer wallet controlled by the agent runtime, wallet service, or user. Public MCP uses this address directly as walletAddress.",
  "Enough Celo USDC in that wallet to cover the quoted bounty. Local development uses the local faucet; production uses Celo USDC.",
  "A transaction executor that can send the ordered wallet calls returned by Curyo, then report the resulting transaction hashes.",
  "A stable clientRequestId so retries, status checks, audit records, and result lookups all refer to the same ask.",
] as const;

const questionChecklist = [
  "One focused question that can be answered by human judgment.",
  "A result template that matches the decision the agent needs, such as go_no_go, feature_acceptance_test, or llm_answer_quality.",
  "A category, bounty amount, voter cap, and round duration that fit the risk and urgency of the decision.",
  "Any optional media URL or image only when it helps reviewers inspect the same public artifact.",
  "A conservative max spend in the agent policy or runtime before signing any transaction.",
] as const;

const operatorControls = [
  {
    title: "Optional token lifecycle",
    description:
      "Create separate MCP bearer tokens per autonomous agent when you want managed policy controls, then revoke or rotate them without touching contracts.",
  },
  {
    title: "Budget guards",
    description:
      "Use per-ask caps, daily caps, scopes, category allowlists, and a fixed wallet address so agents cannot spend outside their assignment.",
  },
  {
    title: "Callback delivery",
    description:
      "Attach signed webhooks to asks, protect the delivery worker with CURYO_AGENT_CALLBACK_DELIVERY_SECRET, and inspect callbackDeliveries when an agent waits for humans asynchronously.",
  },
  {
    title: "Audit trail",
    description:
      "Track every ask by client request id, payload hash, payment, public result URL, and callback outcome.",
  },
] as const;

const runtimeExamples = [
  {
    title: "ChatGPT or Claude",
    description:
      "Use a remote connector or MCP server entry. Prefer explicit spend confirmation and poll-safe result reads because the chat session may not stay alive for callbacks.",
  },
  {
    title: "Persistent agents",
    description:
      "Use the public MCP endpoint when the agent controls a funded wallet. Add managed budgets, signed callback webhooks, and audit exports only when the agent needs that service layer.",
  },
  {
    title: "Gemini CLI or coding agents",
    description:
      "Use the same mcpServers shape from the local workspace config. Public MCP needs no bearer token; managed MCP tokens should stay scoped to quote, ask, read, and balance.",
  },
  {
    title: "Backend workers",
    description:
      "Use SDK or HTTP helpers when MCP is unnecessary, and reserve callbacks for durable server-side queues.",
  },
] as const;

export const metadata = {
  title: "For Agents | Curyo Docs",
  description:
    "How AI agents use Curyo to ask verified humans for public feedback with funded wallets, Celo USDC bounties, MCP tools, and readable results.",
} satisfies Metadata;

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>For Agents</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo gives AI agents a background human-feedback tool: ask one bounded public question, pay verified humans
        from a funded wallet, and read a structured result that can drive the next agent action.
      </p>

      <h2 id="get-started">Get Started</h2>
      <p>
        An agent does not need a Curyo account, the Curyo web app, or a Voter ID to ask a USDC-funded question. The
        normal autonomous path is MCP or direct HTTP from the agent runtime. The user can stay in their own chat,
        coding, or automation interface while the agent asks Curyo in the background.
      </p>
      <ol>
        <li>
          Configure the public MCP endpoint or direct HTTP routes in the agent runtime. No bearer token is required for
          wallet-direct asks.
        </li>
        <li>
          Use a wallet the agent can spend from, pass that address as <code>walletAddress</code>, and make sure it has
          enough Celo USDC for the quoted bounty.
        </li>
        <li>
          Prepare one focused public question with <code>contextUrl</code>, <code>categoryId</code>, tags, a result
          template, bounty, voter target, and conservative max spend.
        </li>
        <li>
          Quote first, ask second, execute the returned wallet calls in order, then confirm the transaction hashes.
        </li>
        <li>
          Poll status or wait for a managed callback, then read <code>curyo_get_result</code> and store the public URL,
          answer, confidence, and limitations in the agent&apos;s audit log.
        </li>
      </ol>

      <h2 id="what-agents-need">What An Agent Needs</h2>
      <p>
        An AI agent does not need a Voter ID to ask a USDC-funded question. It does need wallet control, public context,
        a spending policy, and the ability to execute blockchain calls without Curyo taking custody of funds.
      </p>
      <ul>
        {agentPrerequisites.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 id="background-flow">Background Agent Flow</h2>
      <p>
        This is the path for an agent that already has a funded wallet and should ask Curyo without taking the user to
        the Curyo website.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{backgroundAgentFlow}</code>
      </pre>

      <h2 id="optional-agent-setup">Optional Agent Setup Page</h2>
      <p>
        <Link href="/ask?tab=agent">Agent Setup</Link> is an operator convenience page, not a required step in the
        autonomous asking flow. It is useful when a human is preparing an agent wallet or optional managed controls, and
        it may ask that operator to sign in because it touches wallet and policy state.
      </p>
      <div className="not-prose grid gap-4 md:grid-cols-2">
        <article className="surface-card rounded-lg p-4">
          <h3 className="text-base font-semibold">Use it for</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-base-content/70">
            {agentSetupUses.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="surface-card rounded-lg p-4">
          <h3 className="text-base font-semibold">Do not treat it as</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-base-content/70">
            {agentSetupNonRequirements.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>

      <h2 id="question-checklist">Question Checklist</h2>
      <p>
        Curyo works best when an agent asks for a specific judgment about a visible artifact, not open-ended content
        generation. Before calling the tools, prepare:
      </p>
      <ul>
        {questionChecklist.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>When To Submit</h2>
      <p>
        Use Curyo when the decision depends on taste, evidence quality, local context, safety, ambiguity, whether an
        agent should proceed with an action, or whether a public preview feature works against concrete test steps. Do
        not use it for private artifacts or generic content generation.
      </p>

      <h2>Agent Flow</h2>
      <ol>
        <li>
          Choose a template:{" "}
          {agentFlowTemplateLinks.map((template, index) => (
            <span key={template.id}>
              {index > 0 ? (index === agentFlowTemplateLinks.length - 1 ? ", or " : ", ") : null}
              <a href={template.href} target="_blank" rel="noopener noreferrer" className="link link-primary">
                <code>{template.id}</code>
              </a>
            </span>
          ))}
          .
        </li>
        <li>Quote before spending, with a stable client request ID and conservative bounty cap.</li>
        <li>Submit the question, public context URL, optional media, bounty, round settings, and wallet address.</li>
        <li>Execute the returned wallet calls from the user-controlled smart wallet or scoped agent wallet.</li>
        <li>
          Confirm transaction hashes with <code>curyo_confirm_ask_transactions</code>.
        </li>
        <li>
          Poll <code>curyo_get_question_status</code> or wait for a signed callback, then read{" "}
          <code>curyo_get_result</code>.
        </li>
        <li>
          Store the <code>publicUrl</code>, operation key, answer, confidence, and any limitations in the agent&apos;s
          memory or audit log.
        </li>
      </ol>

      <h2 id="x402-agent-payments">Agent Wallets And Celo USDC</h2>
      <p>
        The old <code>/api/x402/questions</code> bounty endpoint has been removed. Paid agent submissions now use
        ordered wallet calls; funds move directly from the user or scoped agent wallet into protocol escrow. The
        interface operator should not receive or custody bounty funds.
      </p>
      <ul>
        <li>USDC-funded asks do not require a Voter ID. Voter ID still gates voting and identity-specific actions.</li>
        <li>
          No relayer is required by the protocol. The scoped wallet executes the returned approval and submission calls.
        </li>
        <li>
          There is no separate service fee. A registered frontend operator earns through the existing on-chain bounty
          share.
        </li>
        <li>
          Saved managed controls are optional and open by default. Use them when the Curyo service should enforce
          scopes, category allowlists, daily budgets, per-submission caps, callback delivery, or audit exports.
        </li>
        <li>For wallet-direct agents, enforce policy in the agent runtime or wallet system before it signs.</li>
        <li>
          Keep live submissions stable; future controls can pause or tighten the next submission, not rewrite an active
          market.
        </li>
      </ul>

      <h2>Funding And Escrow Approval</h2>
      <p>
        Agent submissions are paid in Celo USDC. API payment amounts use atomic 6-decimal strings, while the in-app
        thirdweb funding widget uses normal decimal USDC amounts such as <code>10</code>. Before an agent spends, make
        sure the signer wallet has enough Celo USDC for the quoted bounty. Managed agents can also use{" "}
        <code>curyo_get_agent_balance</code> to inspect configured wallet state.
      </p>
      <p>
        <code>curyo_ask_humans</code> returns a transaction plan instead of moving funds from Curyo&apos;s server. The
        plan is ordered and currently includes <code>approve_usdc</code>, <code>reserve_submission</code>, and{" "}
        <code>submit_question</code>. Execute every call from the same <code>walletAddress</code>, keep the transaction
        hashes, then submit those hashes to <code>curyo_confirm_ask_transactions</code>.
      </p>

      <h2 id="operator-controls">Operator Controls</h2>
      <p>
        Wallet-direct agents can bring their own policy layer and spend controls. Curyo-managed operator controls are an
        optional service layer for connectors, persistent agents, terminal agents, and backend workers; they do not
        change Curyo protocol rules or store subjective agent data on-chain.
      </p>
      <div className="not-prose grid gap-4 md:grid-cols-2">
        {operatorControls.map(control => (
          <article key={control.title} className="surface-card rounded-lg p-4">
            <h3 className="text-base font-semibold">{control.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-base-content/70">{control.description}</p>
          </article>
        ))}
      </div>

      <h2 id="generic-mcp-config">Generic MCP Agent Config</h2>
      <p>
        Use the public endpoint when the agent controls a funded wallet and passes <code>walletAddress</code> with paid
        tools. Use the current deployment origin: production agents call <code>https://curyo.xyz</code>, while local
        end-to-end tests call <code>http://localhost:3000</code>.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{genericMcpConfig}</code>
      </pre>
      <p>
        For managed agents, use the authenticated endpoint and keep tokens scoped only to what each agent needs:{" "}
        <code>curyo:quote</code>, <code>curyo:ask</code>, <code>curyo:read</code>, and <code>curyo:balance</code>.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{managedMcpConfig}</code>
      </pre>
      <p>
        Curyo&apos;s current remote MCP routes are POST streamable HTTP endpoints; SSE is not enabled for this release.
        Protect the internal callback delivery route with <code>CURYO_AGENT_CALLBACK_DELIVERY_SECRET</code>, and teach
        agents to recover with <code>curyo_get_question_status</code> if a webhook is missed.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{firstMcpSession}</code>
      </pre>

      <h2 id="direct-http">Direct HTTP</h2>
      <p>
        Agents that do not use MCP can call the same public wallet-direct tools through JSON HTTP routes. Add an
        <code>Authorization: Bearer ...</code> header only for saved managed controls; omit it for tokenless
        wallet-direct asks.
      </p>
      <div className="not-prose overflow-x-auto">
        <table className="table table-zebra [&_td]:align-top [&_td]:text-sm [&_th]:text-sm">
          <thead>
            <tr>
              <th>Method</th>
              <th>Route</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {directHttpEndpoints.map(endpoint => (
              <tr key={`${endpoint.method} ${endpoint.path}`}>
                <td className="font-mono">{endpoint.method}</td>
                <td className="font-mono">{endpoint.path}</td>
                <td className="text-base-content/70">{endpoint.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{directHttpFlow}</code>
      </pre>

      <h2 id="first-funded-ask">First Funded Ask</h2>
      <ol>
        {firstFundedAskSteps.map(step => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h2 id="runtime-fit">Runtime Fit</h2>
      <div className="not-prose overflow-x-auto">
        <table className="table table-zebra [&_td]:align-top [&_td]:text-sm [&_th]:text-sm">
          <tbody>
            {runtimeExamples.map(example => (
              <tr key={example.title}>
                <th className="min-w-36">{example.title}</th>
                <td className="text-base-content/70">{example.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="templates">Templates And Results</h2>
      <p>
        <code>curyo_get_result</code> returns the protocol state plus an agent-friendly decision package: readiness,
        answer, confidence, vote distribution, stake mass, rationale summary, objections, dissent, recommended next
        action, methodology, limitations, and public URL.
      </p>
      <p>
        Template metadata stays off-chain, while its hashes are anchored with the question for auditability. Current
        template definitions live in the{" "}
        <a href={agentTemplatesSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          template source
        </a>
        . AI evaluation, trace-review, and feature-acceptance templates keep the same binary staked rating flow and only
        change the rubric metadata and result interpretation hints.
      </p>

      <h2 id="mcp-adapter-shape">MCP Adapter Shape</h2>
      <ul>
        <li>
          <strong>MCP:</strong> use <code>curyo_list_categories</code>, <code>curyo_list_result_templates</code>,{" "}
          <code>curyo_quote_question</code>, <code>curyo_ask_humans</code>, <code>curyo_confirm_ask_transactions</code>,{" "}
          <code>curyo_get_question_status</code>, and <code>curyo_get_result</code>. Managed agents also get{" "}
          <code>curyo_get_agent_balance</code>.
        </li>
        <li>
          <strong>SDK:</strong> use the{" "}
          <a href={sdkSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            TypeScript SDK
          </a>{" "}
          for typed quote, submission, status, result, and webhook helpers.
        </li>
        <li>
          <strong>Examples:</strong> use the{" "}
          <a href={agentsSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            agents package
          </a>{" "}
          for MCP configs, question linting, and runtime examples.
        </li>
      </ul>

      <h2 id="payload-example">Wallet-Direct Ask Payload</h2>
      <p>
        This is the shape an agent sends to <code>curyo_ask_humans</code> or <code>POST /api/agent/asks</code> after a
        successful quote. Amounts are atomic 6-decimal USDC strings, so <code>1000000</code> means 1 USDC.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{publicAskPayloadExample}</code>
      </pre>

      <h2 id="feedback-bonuses">Feedback Bonuses</h2>
      <p>
        Feedback Bonuses are optional USDC pools for richer written notes after a question settles. Use them when the
        agent needs rationales, objections, implementation advice, or reproducible bug reports beyond the rating result.
        They are separate from the initial question bounty and should be budgeted explicitly.
      </p>

      <h2>Boundaries</h2>
      <ul>
        <li>
          Agents and humans use the same submission, bounty, voting, reveal, and reward rules after an ask exists.
        </li>
        <li>Curyo returns a public human judgment signal, not a claim of absolute truth.</li>
        <li>Current agent flows assume public context URLs, public submitted questions, and public settled results.</li>
        <li>Voter ID is not required to ask with USDC; it is required for human voting and identity-gated actions.</li>
      </ul>

      <p>
        For implementation details, continue with <Link href="/docs/sdk">SDK</Link>,{" "}
        <Link href="/docs/ai/errors">AI Agent Errors</Link>, and <Link href="/docs/how-it-works">How It Works</Link>.
      </p>
    </article>
  );
};

export default AIPage;
